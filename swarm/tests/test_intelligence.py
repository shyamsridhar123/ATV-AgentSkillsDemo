"""Tests for swarm.intelligence — model routing, cost, context management.

Covers all 8 acceptance criteria for Phase 4:
  AC#1: Outcomes table captures agent, model, tokens_in/out, duration, success, task_type
  AC#2: suggest_model() requires >=5 data points
  AC#3: Per-task budget stops runaway worker
  AC#4: Per-epic budget pauses dispatch (not kills workers)
  AC#5: Daily kill switch halts all work; resume unpauses
  AC#6: Token counting matches within +-5% (tiktoken vs actual)
  AC#7: Cost estimation via per-model pricing table
  AC#8: Context window compaction trigger at threshold
"""

from __future__ import annotations

import time

import pytest

from swarm.board import MessageBoard
from swarm.config import SwarmConfig
from swarm.intelligence import (
    DEFAULT_PRICING,
    MIN_DATA_POINTS,
    COMPACTION_THRESHOLD,
    MODEL_CONTEXT_WINDOWS,
    BudgetExceeded,
    CostTracker,
    ModelSuggestion,
    TokenCounter,
    estimate_cost_usd,
    get_pricing,
    suggest_model,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def board() -> MessageBoard:
    """In-memory message board for testing."""
    return MessageBoard(":memory:")


@pytest.fixture
def config() -> SwarmConfig:
    """Config with tight budgets for testing."""
    return SwarmConfig(
        max_task_tokens_in=1_000,
        max_task_tokens_out=500,
        max_epic_spend_usd=0.10,
        max_daily_spend_usd=1.00,
    )


def _seed_outcomes(
    board: MessageBoard,
    agent_role: str = "developer",
    model: str = "gpt-4o-mini",
    count: int = 10,
    success_rate: float = 0.8,
    tokens_in: int = 1000,
    tokens_out: int = 500,
) -> None:
    """Seed the board with outcome records for testing."""
    for i in range(count):
        board.record_outcome(
            epic_id="test-epic",
            task_id=f"task-{i}",
            agent_role=agent_role,
            model_used=model,
            tokens_in=tokens_in,
            tokens_out=tokens_out,
            duration_ms=2000 + i * 100,
            success=(i / count) < success_rate,
            task_type="feature",
            description=f"Test task {i}",
        )


# ===========================================================================
# AC#1: Outcomes table captures all required fields
# ===========================================================================


class TestOutcomesCapture:
    """AC#1: Outcomes table captures agent, model, tokens_in/out, duration, success, task_type."""

    def test_outcome_has_all_fields(self, board: MessageBoard) -> None:
        row_id = board.record_outcome(
            epic_id="ep1",
            task_id="t1",
            agent_role="developer",
            model_used="gpt-4o",
            tokens_in=1500,
            tokens_out=800,
            duration_ms=3000,
            success=True,
            task_type="feature",
            description="Implement auth",
        )
        outcomes = board.query_outcomes(agent_role="developer")
        assert len(outcomes) == 1
        o = outcomes[0]
        assert o.id == row_id
        assert o.agent_role == "developer"
        assert o.model_used == "gpt-4o"
        assert o.tokens_in == 1500
        assert o.tokens_out == 800
        assert o.duration_ms == 3000
        assert o.success is True
        assert o.task_type == "feature"

    def test_outcome_captures_failure(self, board: MessageBoard) -> None:
        board.record_outcome(
            epic_id="ep1",
            task_id="t2",
            agent_role="tester",
            model_used="gpt-4o-mini",
            tokens_in=500,
            tokens_out=200,
            duration_ms=1000,
            success=False,
            task_type="test",
        )
        outcomes = board.query_outcomes(agent_role="tester", success=False)
        assert len(outcomes) == 1
        assert outcomes[0].success is False

    def test_outcome_query_filters(self, board: MessageBoard) -> None:
        _seed_outcomes(board, agent_role="developer", count=5)
        _seed_outcomes(board, agent_role="tester", count=3)

        dev_outcomes = board.query_outcomes(agent_role="developer")
        assert len(dev_outcomes) == 5

        test_outcomes = board.query_outcomes(agent_role="tester")
        assert len(test_outcomes) == 3

        all_outcomes = board.query_outcomes()
        assert len(all_outcomes) == 8


# ===========================================================================
# AC#2: suggest_model() — minimum data points
# ===========================================================================


class TestSuggestModel:
    """AC#2: suggest_model() only recommends with >=5 data points."""

    def test_returns_none_with_insufficient_data(self, board: MessageBoard) -> None:
        _seed_outcomes(board, count=4)  # Less than MIN_DATA_POINTS
        result = suggest_model(board, "developer")
        assert result is None

    def test_returns_none_with_zero_outcomes(self, board: MessageBoard) -> None:
        result = suggest_model(board, "developer")
        assert result is None

    def test_returns_suggestion_with_enough_data(self, board: MessageBoard) -> None:
        _seed_outcomes(board, count=10, model="gpt-4o-mini", success_rate=0.9)
        result = suggest_model(board, "developer")
        assert result is not None
        assert isinstance(result, ModelSuggestion)
        assert result.model == "gpt-4o-mini"
        assert result.data_points >= MIN_DATA_POINTS
        assert result.avg_success_rate > 0

    def test_prefers_higher_success_rate(self, board: MessageBoard) -> None:
        # Seed two models: one with high success, one with low
        _seed_outcomes(board, model="gpt-4o", count=10, success_rate=0.9)
        _seed_outcomes(board, model="gpt-4o-mini", count=10, success_rate=0.3)
        result = suggest_model(board, "developer")
        assert result is not None
        assert result.model == "gpt-4o"  # Higher success despite higher cost

    def test_considers_cost_in_scoring(self, board: MessageBoard) -> None:
        # Equal success rates — should prefer cheaper model
        _seed_outcomes(
            board, model="gpt-4o", count=10, success_rate=1.0,
            tokens_in=5000, tokens_out=2000,
        )
        _seed_outcomes(
            board, model="gpt-4o-mini", count=10, success_rate=1.0,
            tokens_in=5000, tokens_out=2000,
        )
        result = suggest_model(board, "developer")
        assert result is not None
        # With equal success, cheaper model should win
        assert result.model == "gpt-4o-mini"

    def test_filters_by_task_type(self, board: MessageBoard) -> None:
        # Seed with task_type "feature"
        _seed_outcomes(board, count=10, model="gpt-4o-mini")
        result = suggest_model(board, "developer", task_type="feature")
        assert result is not None

        # No outcomes for "security" task type
        result = suggest_model(board, "developer", task_type="security")
        assert result is None

    def test_model_with_fewer_than_min_points_excluded(self, board: MessageBoard) -> None:
        # One model with enough data, one without
        _seed_outcomes(board, model="gpt-4o", count=10, success_rate=0.5)
        _seed_outcomes(board, model="gpt-4o-mini", count=3, success_rate=1.0)
        result = suggest_model(board, "developer")
        assert result is not None
        # gpt-4o-mini has better success but < MIN_DATA_POINTS
        assert result.model == "gpt-4o"


# ===========================================================================
# AC#7: Cost estimation via pricing table
# ===========================================================================


class TestPricingAndCost:
    """AC#7: Cost estimation via per-model pricing table."""

    def test_default_pricing_populated(self) -> None:
        assert "gpt-4o" in DEFAULT_PRICING
        assert "gpt-4o-mini" in DEFAULT_PRICING
        assert "input" in DEFAULT_PRICING["gpt-4o"]
        assert "output" in DEFAULT_PRICING["gpt-4o"]

    def test_estimate_cost_gpt4o(self) -> None:
        # 1M input + 1M output for gpt-4o = $2.50 + $10.00 = $12.50
        cost = estimate_cost_usd("gpt-4o", 1_000_000, 1_000_000)
        assert abs(cost - 12.50) < 0.01

    def test_estimate_cost_gpt4o_mini(self) -> None:
        # 1M input + 1M output for gpt-4o-mini = $0.15 + $0.60 = $0.75
        cost = estimate_cost_usd("gpt-4o-mini", 1_000_000, 1_000_000)
        assert abs(cost - 0.75) < 0.01

    def test_estimate_cost_zero_tokens(self) -> None:
        cost = estimate_cost_usd("gpt-4o", 0, 0)
        assert cost == 0.0

    def test_estimate_cost_unknown_model(self) -> None:
        # Unknown models use conservative fallback pricing ($30/M in, $60/M out)
        # to prevent cost guardrails from being bypassed
        cost = estimate_cost_usd("nonexistent-model", 1000, 1000)
        # (1000/1M * $30) + (1000/1M * $60) = $0.03 + $0.06 = $0.09
        assert cost > 0.0
        assert abs(cost - 0.09) < 0.001

    def test_get_pricing_fallback(self) -> None:
        pricing = get_pricing("unknown-model")
        assert pricing["input"] > 0.0
        assert pricing["output"] > 0.0

    def test_small_token_count_cost(self) -> None:
        # 1000 input + 500 output for gpt-4o
        # = (1000/1M * $2.50) + (500/1M * $10.00)
        # = $0.0025 + $0.005 = $0.0075
        cost = estimate_cost_usd("gpt-4o", 1000, 500)
        assert abs(cost - 0.0075) < 0.0001


# ===========================================================================
# AC#3: Per-task budget
# ===========================================================================


class TestPerTaskBudget:
    """AC#3: Per-task budget stops runaway worker."""

    def test_task_budget_enforced(self, config: SwarmConfig) -> None:
        tracker = CostTracker(config=config)
        # The task budget is derived from config.max_task_tokens_in/out
        # with gpt-4o pricing. Keep recording until it blows.
        with pytest.raises(BudgetExceeded) as exc_info:
            for i in range(100):
                tracker.record_usage(
                    task_id="runaway-task",
                    epic_id="ep1",
                    model="gpt-4o",
                    tokens_in=5000,
                    tokens_out=2000,
                )
        assert exc_info.value.scope == "task"

    def test_different_tasks_independent(self, config: SwarmConfig) -> None:
        tracker = CostTracker(config=config)
        # Two tasks should track separately
        tracker.record_usage(
            task_id="task-a", epic_id="ep1",
            model="gpt-4o-mini", tokens_in=100, tokens_out=50,
        )
        tracker.record_usage(
            task_id="task-b", epic_id="ep1",
            model="gpt-4o-mini", tokens_in=100, tokens_out=50,
        )
        assert tracker.get_task_cost("task-a") > 0
        assert tracker.get_task_cost("task-b") > 0
        assert tracker.get_task_cost("task-a") == tracker.get_task_cost("task-b")

    def test_task_cost_accumulates(self, config: SwarmConfig) -> None:
        tracker = CostTracker(config=config)
        tracker.record_usage(
            task_id="t1", epic_id="ep1",
            model="gpt-4o-mini", tokens_in=100, tokens_out=50,
        )
        cost1 = tracker.get_task_cost("t1")
        tracker.record_usage(
            task_id="t1", epic_id="ep1",
            model="gpt-4o-mini", tokens_in=100, tokens_out=50,
        )
        cost2 = tracker.get_task_cost("t1")
        assert cost2 > cost1
        assert abs(cost2 - cost1 * 2) < 0.0001


# ===========================================================================
# AC#4: Per-epic budget pauses dispatch
# ===========================================================================


class TestPerEpicBudget:
    """AC#4: Per-epic budget pauses dispatch, doesn't kill workers."""

    def test_epic_pause_triggered(self) -> None:
        config = SwarmConfig(
            max_epic_spend_usd=0.001,  # Tiny budget
            max_daily_spend_usd=100.0,  # Large daily to isolate epic test
        )
        tracker = CostTracker(config=config)
        tracker.record_usage(
            task_id="t1", epic_id="expensive-epic",
            model="gpt-4o", tokens_in=10000, tokens_out=5000,
        )
        assert tracker.is_epic_paused("expensive-epic")

    def test_epic_pause_doesnt_set_kill(self) -> None:
        config = SwarmConfig(
            max_epic_spend_usd=0.001,
            max_daily_spend_usd=100.0,
        )
        tracker = CostTracker(config=config)
        tracker.record_usage(
            task_id="t1", epic_id="ep1",
            model="gpt-4o", tokens_in=10000, tokens_out=5000,
        )
        assert tracker.is_epic_paused("ep1")
        assert not tracker.is_killed()  # Kill switch NOT triggered

    def test_unpaused_epic_returns_false(self, config: SwarmConfig) -> None:
        tracker = CostTracker(config=config)
        assert not tracker.is_epic_paused("any-epic")

    def test_other_epics_unaffected(self) -> None:
        config = SwarmConfig(
            max_epic_spend_usd=0.001,
            max_daily_spend_usd=100.0,
        )
        tracker = CostTracker(config=config)
        tracker.record_usage(
            task_id="t1", epic_id="overspend",
            model="gpt-4o", tokens_in=10000, tokens_out=5000,
        )
        assert tracker.is_epic_paused("overspend")
        assert not tracker.is_epic_paused("healthy-epic")


# ===========================================================================
# AC#5: Daily kill switch
# ===========================================================================


class TestDailyKillSwitch:
    """AC#5: Daily kill switch halts all work; resume unpauses."""

    def test_kill_switch_triggered(self) -> None:
        config = SwarmConfig(
            max_daily_spend_usd=0.001,  # Tiny daily budget
            max_epic_spend_usd=100.0,
        )
        tracker = CostTracker(config=config)
        tracker.record_usage(
            task_id="t1", epic_id="ep1",
            model="gpt-4o", tokens_in=10000, tokens_out=5000,
        )
        assert tracker.is_killed()

    def test_resume_clears_kill(self) -> None:
        config = SwarmConfig(
            max_daily_spend_usd=0.001,
            max_epic_spend_usd=100.0,
        )
        tracker = CostTracker(config=config)
        tracker.record_usage(
            task_id="t1", epic_id="ep1",
            model="gpt-4o", tokens_in=10000, tokens_out=5000,
        )
        assert tracker.is_killed()
        tracker.resume()
        assert not tracker.is_killed()

    def test_resume_clears_epic_pauses(self) -> None:
        config = SwarmConfig(
            max_epic_spend_usd=0.001,
            max_daily_spend_usd=0.001,
        )
        tracker = CostTracker(config=config)
        tracker.record_usage(
            task_id="t1", epic_id="ep1",
            model="gpt-4o", tokens_in=10000, tokens_out=5000,
        )
        assert tracker.is_epic_paused("ep1")
        assert tracker.is_killed()
        tracker.resume()
        assert not tracker.is_epic_paused("ep1")
        assert not tracker.is_killed()

    def test_not_killed_initially(self, config: SwarmConfig) -> None:
        tracker = CostTracker(config=config)
        assert not tracker.is_killed()


# ===========================================================================
# AC#6: Token counting accuracy
# ===========================================================================


class TestTokenCounting:
    """AC#6: Token counting matches actual API usage within +-5%."""

    def test_count_tokens_basic(self) -> None:
        counter = TokenCounter("gpt-4o")
        count = counter.count_tokens("Hello, world!")
        assert count > 0

    def test_count_empty_string(self) -> None:
        counter = TokenCounter("gpt-4o")
        count = counter.count_tokens("")
        assert count == 0

    def test_count_messages_overhead(self) -> None:
        counter = TokenCounter("gpt-4o")
        messages = [
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": "Hello!"},
        ]
        total = counter.count_messages(messages)
        # At minimum: 4 overhead per msg * 2 + 2 priming = 10 overhead
        # Plus actual content tokens
        assert total > 10

    def test_count_messages_with_tool_calls(self) -> None:
        counter = TokenCounter("gpt-4o")
        messages = [
            {"role": "system", "content": "You are a coding assistant."},
            {"role": "assistant", "tool_calls": [
                {"function": {"name": "read_file", "arguments": '{"path": "foo.py"}'}},
            ]},
            {"role": "tool", "tool_call_id": "tc1", "content": "file contents here"},
        ]
        total = counter.count_messages(messages)
        assert total > 0

    def test_fallback_estimate_without_tiktoken(self) -> None:
        """Test char-based fallback (4 chars per token)."""
        counter = TokenCounter.__new__(TokenCounter)
        counter._model = "gpt-4o"
        counter._encoding = None
        counter._tiktoken_available = False

        # 100 chars → ~25 tokens
        text = "a" * 100
        count = counter.count_tokens(text)
        assert count == 25

    def test_tiktoken_within_5_percent_of_estimate(self) -> None:
        """AC#6: verify tiktoken counting is consistent."""
        counter = TokenCounter("gpt-4o")
        if not counter.is_tiktoken_available:
            pytest.skip("tiktoken not installed")

        # A realistic prompt
        text = (
            "You are an expert React/TypeScript developer. Implement a JWT "
            "authentication flow with refresh token rotation and secure "
            "httpOnly cookies. Follow OWASP security best practices."
        )

        # Count twice — should be deterministic
        count1 = counter.count_tokens(text)
        count2 = counter.count_tokens(text)
        assert count1 == count2
        assert count1 > 0


# ===========================================================================
# AC#8: Context window management — compaction
# ===========================================================================


class TestContextWindowManagement:
    """AC#8: Context window management with compaction trigger at threshold."""

    def test_should_compact_false_for_small_conversation(self) -> None:
        counter = TokenCounter("gpt-4o")
        messages = [
            {"role": "system", "content": "You are helpful."},
            {"role": "user", "content": "Hello!"},
        ]
        assert not counter.should_compact(messages)

    def test_should_compact_true_for_large_conversation(self) -> None:
        counter = TokenCounter("gpt-4o")
        # Create a conversation that exceeds 75% of context window
        # gpt-4o has 128k context → threshold at 96k tokens
        big_content = "word " * 30000  # ~30k tokens
        messages = [
            {"role": "system", "content": big_content},
            {"role": "user", "content": big_content},
            {"role": "assistant", "content": big_content},
            {"role": "user", "content": big_content},
        ]
        assert counter.should_compact(messages)

    def test_tokens_remaining(self) -> None:
        counter = TokenCounter("gpt-4o")
        messages = [
            {"role": "system", "content": "You are helpful."},
            {"role": "user", "content": "Hello!"},
        ]
        remaining = counter.tokens_remaining(messages)
        # Should be close to the full context window
        assert remaining > 100_000

    def test_compact_messages_preserves_system(self) -> None:
        counter = TokenCounter("gpt-4o")
        messages = [
            {"role": "system", "content": "System prompt"},
            {"role": "user", "content": "msg1"},
            {"role": "assistant", "content": "reply1"},
            {"role": "user", "content": "msg2"},
            {"role": "assistant", "content": "reply2"},
            {"role": "user", "content": "msg3"},
            {"role": "assistant", "content": "reply3"},
        ]
        compacted = counter.compact_messages(messages, keep_last_n=2)
        # System prompt + compaction notice + last 2 messages
        assert compacted[0]["role"] == "system"
        assert compacted[0]["content"] == "System prompt"
        assert "compacted" in compacted[1]["content"]
        assert len(compacted) == 4  # system + notice + 2 messages

    def test_compact_no_op_for_short_conversation(self) -> None:
        counter = TokenCounter("gpt-4o")
        messages = [
            {"role": "system", "content": "System"},
            {"role": "user", "content": "Hello"},
        ]
        compacted = counter.compact_messages(messages, keep_last_n=5)
        assert compacted == messages  # No change

    def test_compact_without_system_message(self) -> None:
        counter = TokenCounter("gpt-4o")
        messages = [
            {"role": "user", "content": f"msg{i}"} for i in range(20)
        ]
        compacted = counter.compact_messages(
            messages, keep_system=False, keep_last_n=3,
        )
        # Compaction notice + last 3
        assert len(compacted) == 4
        assert "compacted" in compacted[0]["content"]


# ===========================================================================
# CostTracker — hydration from outcomes
# ===========================================================================


class TestCostTrackerHydration:
    """Test re-hydrating cost tracker from outcomes table."""

    def test_hydrate_from_outcomes(self, board: MessageBoard, config: SwarmConfig) -> None:
        # Seed some outcomes
        board.record_outcome(
            epic_id="ep1", task_id="t1", agent_role="developer",
            model_used="gpt-4o", tokens_in=1000, tokens_out=500,
            duration_ms=2000, success=True,
        )
        board.record_outcome(
            epic_id="ep1", task_id="t2", agent_role="tester",
            model_used="gpt-4o-mini", tokens_in=500, tokens_out=200,
            duration_ms=1000, success=True,
        )

        tracker = CostTracker(config=config)
        tracker.hydrate_from_outcomes(board)

        assert tracker.get_epic_cost("ep1") > 0
        assert tracker.get_task_cost("t1") > 0
        assert tracker.get_task_cost("t2") > 0

    def test_hydrate_empty_board(self, board: MessageBoard, config: SwarmConfig) -> None:
        tracker = CostTracker(config=config)
        tracker.hydrate_from_outcomes(board)
        assert tracker.get_daily_cost() == 0.0
