"""Intelligence layer — model routing, cost guardrails, context management.

Phase 4: The system gets smarter and cheaper over time.

Components:
  - suggest_model(): outcome-based model recommendation (>=5 data points min)
  - CostTracker: per-task, per-epic, and daily budget enforcement
  - TokenCounter: tiktoken-based token counting + compaction triggers
  - PRICING: per-model USD cost table from config
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import Any

from .board import MessageBoard, Outcome
from .config import SwarmConfig

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Per-model pricing (USD per 1M tokens) — defaults, overridable in config
# ---------------------------------------------------------------------------

DEFAULT_PRICING: dict[str, dict[str, float]] = {
    "gpt-4o": {"input": 2.50, "output": 10.00},
    "gpt-4o-mini": {"input": 0.15, "output": 0.60},
    "gpt-4-turbo": {"input": 10.00, "output": 30.00},
    "gpt-4": {"input": 30.00, "output": 60.00},
    "gpt-3.5-turbo": {"input": 0.50, "output": 1.50},
    "o1": {"input": 15.00, "output": 60.00},
    "o1-mini": {"input": 3.00, "output": 12.00},
    "o3-mini": {"input": 1.10, "output": 4.40},
}

# Minimum context window sizes per model (tokens)
MODEL_CONTEXT_WINDOWS: dict[str, int] = {
    "gpt-4o": 128_000,
    "gpt-4o-mini": 128_000,
    "gpt-4-turbo": 128_000,
    "gpt-4": 8_192,
    "gpt-3.5-turbo": 16_385,
    "o1": 200_000,
    "o1-mini": 128_000,
    "o3-mini": 200_000,
}

# Minimum historical data points before suggest_model() will recommend
MIN_DATA_POINTS = 5

# Context window compaction trigger: compact when usage exceeds this fraction
COMPACTION_THRESHOLD = 0.75


# ---------------------------------------------------------------------------
# Pricing helpers
# ---------------------------------------------------------------------------


# Conservative fallback pricing for unknown models (fail closed — never $0)
_UNKNOWN_MODEL_PRICING: dict[str, float] = {"input": 30.0, "output": 60.0}


def get_pricing(model: str, config: SwarmConfig | None = None) -> dict[str, float]:
    """Get pricing for a model.

    Falls back to conservative (expensive) pricing for unknown models so
    that cost guardrails can never be bypassed by an unmapped model name.
    """
    pricing = DEFAULT_PRICING.get(model)
    if pricing is None:
        logger.warning(
            "Unknown model %r — using conservative fallback pricing ($%.2f/M in, $%.2f/M out)",
            model, _UNKNOWN_MODEL_PRICING["input"], _UNKNOWN_MODEL_PRICING["output"],
        )
        return _UNKNOWN_MODEL_PRICING
    return pricing


def estimate_cost_usd(
    model: str,
    tokens_in: int,
    tokens_out: int,
    config: SwarmConfig | None = None,
) -> float:
    """Estimate the USD cost for a given token usage.

    Pricing is per 1M tokens.
    """
    pricing = get_pricing(model, config)
    cost_in = (tokens_in / 1_000_000) * pricing["input"]
    cost_out = (tokens_out / 1_000_000) * pricing["output"]
    return cost_in + cost_out


# ---------------------------------------------------------------------------
# Model suggestion — outcome-based routing
# ---------------------------------------------------------------------------


@dataclass
class ModelSuggestion:
    """Result from suggest_model()."""

    model: str
    reason: str
    confidence: float  # 0.0–1.0
    data_points: int
    avg_success_rate: float
    avg_cost_usd: float


def suggest_model(
    board: MessageBoard,
    agent_role: str,
    task_type: str | None = None,
    config: SwarmConfig | None = None,
) -> ModelSuggestion | None:
    """Suggest the best model based on historical outcomes.

    Only returns a recommendation when there are >= MIN_DATA_POINTS
    data points for the agent/task_type combination. Returns None if
    there's insufficient data (no premature optimization).

    The algorithm:
      1. Query outcomes for the given agent_role (and task_type if provided)
      2. Group by model_used
      3. For each model with >= MIN_DATA_POINTS: compute success_rate, avg_cost
      4. Score = success_rate * 0.7 + cost_efficiency * 0.3
      5. Return the highest-scoring model

    Parameters
    ----------
    board : MessageBoard
        Message board with outcomes data.
    agent_role : str
        The agent role to find the best model for.
    task_type : str | None
        Optional task type filter.
    config : SwarmConfig | None
        Optional config for pricing overrides.
    """
    outcomes = board.query_outcomes(
        agent_role=agent_role,
        task_type=task_type,
        limit=500,
    )

    if len(outcomes) < MIN_DATA_POINTS:
        return None

    # Group by model
    by_model: dict[str, list[Outcome]] = {}
    for o in outcomes:
        by_model.setdefault(o.model_used, []).append(o)

    # Score each model
    candidates: list[ModelSuggestion] = []
    for model, model_outcomes in by_model.items():
        if len(model_outcomes) < MIN_DATA_POINTS:
            continue

        successes = sum(1 for o in model_outcomes if o.success)
        success_rate = successes / len(model_outcomes)

        # Compute average cost
        total_cost = sum(
            estimate_cost_usd(o.model_used, o.tokens_in, o.tokens_out, config)
            for o in model_outcomes
        )
        avg_cost = total_cost / len(model_outcomes)

        candidates.append(ModelSuggestion(
            model=model,
            reason="",
            confidence=0.0,
            data_points=len(model_outcomes),
            avg_success_rate=success_rate,
            avg_cost_usd=avg_cost,
        ))

    if not candidates:
        return None

    # Normalize cost for scoring (lower cost = higher score)
    max_cost = max(c.avg_cost_usd for c in candidates) or 1.0
    for c in candidates:
        cost_efficiency = 1.0 - (c.avg_cost_usd / max_cost) if max_cost > 0 else 0.5
        score = c.avg_success_rate * 0.7 + cost_efficiency * 0.3
        c.confidence = round(score, 3)

    # Sort by score descending
    candidates.sort(key=lambda c: c.confidence, reverse=True)
    best = candidates[0]

    # Build reason
    best.reason = (
        f"Based on {best.data_points} outcomes: "
        f"{best.avg_success_rate:.0%} success rate, "
        f"${best.avg_cost_usd:.4f} avg cost"
    )

    return best


# ---------------------------------------------------------------------------
# Cost tracker — per-task, per-epic, daily budgets
# ---------------------------------------------------------------------------


class BudgetExceeded(Exception):
    """Raised when a budget limit is hit."""

    def __init__(self, scope: str, spent: float, limit: float) -> None:
        self.scope = scope
        self.spent = spent
        self.limit = limit
        super().__init__(
            f"Budget exceeded ({scope}): ${spent:.4f} spent, ${limit:.4f} limit"
        )


@dataclass
class CostTracker:
    """Tracks token costs at task, epic, and daily granularity.

    - Per-task budget: raises BudgetExceeded if a single task burns too much
    - Per-epic budget: pauses dispatch (does NOT kill running workers)
    - Daily kill switch: halts ALL work when daily limit crossed

    The tracker is in-memory and resets on restart. For durability,
    the orchestrator can re-hydrate from the outcomes table.
    """

    config: SwarmConfig

    # Internal tracking
    _task_costs: dict[str, float] = field(default_factory=dict)  # task_id → USD
    _epic_costs: dict[str, float] = field(default_factory=dict)  # epic_id → USD
    _daily_cost: float = 0.0
    _daily_reset_date: str = ""
    _paused_epics: set[str] = field(default_factory=set)
    _killed: bool = False

    def record_usage(
        self,
        *,
        task_id: str,
        epic_id: str,
        model: str,
        tokens_in: int,
        tokens_out: int,
    ) -> float:
        """Record token usage and check budgets.

        Returns the cost in USD.
        Raises BudgetExceeded for per-task violations.
        Sets _killed=True for daily violations.
        Adds epic to _paused_epics for epic violations.
        """
        cost = estimate_cost_usd(model, tokens_in, tokens_out, self.config)

        # Reset daily if date changed
        today = time.strftime("%Y-%m-%d")
        if self._daily_reset_date != today:
            self._daily_cost = 0.0
            self._killed = False
            self._paused_epics.clear()
            self._daily_reset_date = today
            logger.info("Daily cost reset — kill switch and epic pauses cleared")

        # Update accumulators
        self._task_costs[task_id] = self._task_costs.get(task_id, 0.0) + cost
        self._epic_costs[epic_id] = self._epic_costs.get(epic_id, 0.0) + cost
        self._daily_cost += cost

        # Check per-task budget
        task_limit = self._task_budget_usd()
        if self._task_costs[task_id] > task_limit:
            raise BudgetExceeded("task", self._task_costs[task_id], task_limit)

        # Check per-epic budget (pause, don't kill)
        epic_limit = self.config.max_epic_spend_usd
        if self._epic_costs[epic_id] > epic_limit:
            self._paused_epics.add(epic_id)
            logger.warning(
                "Epic %s paused: $%.4f spent > $%.4f limit",
                epic_id, self._epic_costs[epic_id], epic_limit,
            )

        # Check daily budget (kill switch)
        daily_limit = self.config.max_daily_spend_usd
        if self._daily_cost > daily_limit:
            self._killed = True
            logger.critical(
                "DAILY KILL SWITCH: $%.4f spent > $%.4f limit — all work halted",
                self._daily_cost, daily_limit,
            )

        return cost

    def is_epic_paused(self, epic_id: str) -> bool:
        """Check if an epic's budget is exceeded (dispatch should pause)."""
        return epic_id in self._paused_epics

    def is_killed(self) -> bool:
        """Check if the daily kill switch has been triggered."""
        return self._killed

    def resume(self) -> None:
        """Resume after kill switch / epic pause (manual override).

        Clears the kill switch and all epic pauses. Does NOT reset counters —
        if the spend is still over budget, the next record_usage() will
        re-trigger.
        """
        self._killed = False
        self._paused_epics.clear()
        logger.info("Cost tracker resumed — kill switch and epic pauses cleared")

    def get_task_cost(self, task_id: str) -> float:
        """Get the total cost tracked for a task."""
        return self._task_costs.get(task_id, 0.0)

    def get_epic_cost(self, epic_id: str) -> float:
        """Get the total cost tracked for an epic."""
        return self._epic_costs.get(epic_id, 0.0)

    def get_daily_cost(self) -> float:
        """Get total spend for today."""
        return self._daily_cost

    def _task_budget_usd(self) -> float:
        """Compute per-task budget in USD from token limits in config."""
        # Use the most expensive model tier for a conservative estimate
        return estimate_cost_usd(
            "gpt-4o",
            self.config.max_task_tokens_in,
            self.config.max_task_tokens_out,
        )

    def hydrate_from_outcomes(self, board: MessageBoard) -> None:
        """Re-hydrate cost tracking from the outcomes table.

        Useful after a restart to restore per-epic and daily counters.
        """
        today = time.strftime("%Y-%m-%d")
        self._daily_reset_date = today

        outcomes = board.query_outcomes(limit=10000)
        for o in outcomes:
            cost = estimate_cost_usd(o.model_used, o.tokens_in, o.tokens_out, self.config)
            self._epic_costs[o.epic_id] = self._epic_costs.get(o.epic_id, 0.0) + cost
            self._task_costs[o.task_id] = self._task_costs.get(o.task_id, 0.0) + cost

            # Only count today's spend for daily budget
            if o.created_at and o.created_at.startswith(today):
                self._daily_cost += cost


# ---------------------------------------------------------------------------
# Token counter — tiktoken-based with compaction trigger
# ---------------------------------------------------------------------------


class TokenCounter:
    """Token counting and context window management.

    Uses tiktoken for accurate token counting. Falls back to a
    character-based estimate (chars / 4) if tiktoken is unavailable.
    """

    def __init__(self, model: str = "gpt-4o") -> None:
        self._model = model
        self._encoding = None
        self._tiktoken_available = False
        self._load_encoding(model)

    def _load_encoding(self, model: str) -> None:
        """Try to load tiktoken encoding for the model."""
        try:
            import tiktoken
            self._encoding = tiktoken.encoding_for_model(model)
            self._tiktoken_available = True
        except (ImportError, KeyError):
            logger.warning(
                "tiktoken not available for %s — using char estimate", model
            )
            self._tiktoken_available = False

    def count_tokens(self, text: str) -> int:
        """Count the number of tokens in text.

        Uses tiktoken if available, otherwise falls back to len(text) / 4.
        """
        if self._tiktoken_available and self._encoding:
            return len(self._encoding.encode(text))
        # Rough estimate: ~4 chars per token for English text
        if not text:
            return 0
        return max(1, len(text) // 4)

    def count_messages(self, messages: list[dict[str, Any]]) -> int:
        """Count total tokens across a list of chat messages.

        Follows OpenAI's token counting rules:
          - Each message has ~4 tokens of overhead
          - role/content are counted as tokens
        """
        total = 0
        for msg in messages:
            total += 4  # message overhead
            content = msg.get("content", "")
            if isinstance(content, str):
                total += self.count_tokens(content)
            role = msg.get("role", "")
            total += self.count_tokens(role)
            # Tool calls add tokens too
            if "tool_calls" in msg:
                for tc in msg["tool_calls"]:
                    func = tc.get("function", {})
                    total += self.count_tokens(func.get("name", ""))
                    total += self.count_tokens(func.get("arguments", ""))
        total += 2  # reply priming
        return total

    def should_compact(self, messages: list[dict[str, Any]], model: str | None = None) -> bool:
        """Check if the conversation should be compacted.

        Returns True when token count exceeds COMPACTION_THRESHOLD of the
        model's context window.
        """
        model = model or self._model
        window = MODEL_CONTEXT_WINDOWS.get(model, 128_000)
        current = self.count_messages(messages)
        return current > (window * COMPACTION_THRESHOLD)

    def tokens_remaining(self, messages: list[dict[str, Any]], model: str | None = None) -> int:
        """Calculate remaining tokens in the context window."""
        model = model or self._model
        window = MODEL_CONTEXT_WINDOWS.get(model, 128_000)
        current = self.count_messages(messages)
        return max(0, window - current)

    @property
    def is_tiktoken_available(self) -> bool:
        """Whether tiktoken is loaded (vs fallback estimate)."""
        return self._tiktoken_available

    def compact_messages(
        self,
        messages: list[dict[str, Any]],
        *,
        keep_system: bool = True,
        keep_last_n: int = 10,
    ) -> list[dict[str, Any]]:
        """Compact messages by keeping system prompt + last N messages.

        This is a simple truncation strategy. More sophisticated compaction
        (e.g., summarization) can be added later.

        Parameters
        ----------
        messages : list[dict]
            Full message history.
        keep_system : bool
            Always keep the system message (index 0).
        keep_last_n : int
            Number of recent messages to preserve.
        """
        if len(messages) <= keep_last_n + 1:
            return messages  # Nothing to compact

        result: list[dict[str, Any]] = []
        if keep_system and messages and messages[0].get("role") == "system":
            result.append(messages[0])
            remaining = messages[1:]
        else:
            remaining = messages

        # Keep the last N messages
        if len(remaining) > keep_last_n:
            dropped = len(remaining) - keep_last_n
            summary = {
                "role": "system",
                "content": f"[{dropped} earlier messages compacted to save context window]",
            }
            result.append(summary)
            result.extend(remaining[-keep_last_n:])
        else:
            result.extend(remaining)

        return result
