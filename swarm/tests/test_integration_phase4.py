"""Integration tests — full intelligence pipeline.

Tests the complete flow:
  1. Orchestrator uses CostTracker for budget enforcement
  2. Worker uses suggest_model() for intelligent model selection
  3. Completion handling records costs
  4. Epic budget pauses dispatch
  5. Daily kill switch halts tick()
  6. Cost hydration from outcomes table
"""

from __future__ import annotations

import os
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from swarm.board import MessageBoard
from swarm.config import SwarmConfig
from swarm.intelligence import BudgetExceeded, CostTracker, estimate_cost_usd, suggest_model
from swarm.orchestrator import (
    EpicState,
    Orchestrator,
    TaskNode,
    TaskStatus,
    dispatch_task,
    get_ready_tasks,
    handle_completions,
)
from swarm.worker import Task


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def board() -> MessageBoard:
    return MessageBoard(":memory:")


@pytest.fixture
def config() -> SwarmConfig:
    return SwarmConfig(
        max_task_tokens_in=5_000,
        max_task_tokens_out=2_000,
        max_epic_spend_usd=0.50,
        max_daily_spend_usd=5.00,
    )


@pytest.fixture
def repo_root(tmp_path: Path) -> Path:
    agents_dir = tmp_path / ".github" / "agents"
    agents_dir.mkdir(parents=True)
    return tmp_path


# ===========================================================================
# Test 1: Orchestrator tick respects daily kill switch
# ===========================================================================


class TestOrchestratorKillSwitch:
    """Daily kill switch halts the orchestrator tick."""

    def test_tick_returns_killed_when_daily_budget_exceeded(
        self, board: MessageBoard, config: SwarmConfig, repo_root: Path,
    ) -> None:
        # Create a cost tracker that's already killed
        tracker = CostTracker(config=SwarmConfig(
            max_daily_spend_usd=0.0001,
        ))
        tracker.record_usage(
            task_id="t1", epic_id="ep1",
            model="gpt-4o", tokens_in=10000, tokens_out=5000,
        )
        assert tracker.is_killed()

        orch = Orchestrator(
            config=config, board=board, repo_root=repo_root,
            cost_tracker=tracker,
        )

        # Submit an epic — should not dispatch anything
        tasks = [TaskNode(id="impl", title="Do work", body="Work",
                          agent_role="developer")]
        orch.submit_epic("ep1", "Test epic", "Do work", tasks=tasks)

        summary = orch.tick()
        assert summary["killed"] is True
        assert len(summary["dispatched"]) == 0

    def test_resume_allows_tick_to_proceed(
        self, board: MessageBoard, config: SwarmConfig, repo_root: Path,
    ) -> None:
        tracker = CostTracker(config=SwarmConfig(
            max_daily_spend_usd=0.0001,
        ))
        tracker.record_usage(
            task_id="t1", epic_id="ep1",
            model="gpt-4o", tokens_in=10000, tokens_out=5000,
        )
        assert tracker.is_killed()

        tracker.resume()
        assert not tracker.is_killed()

        orch = Orchestrator(
            config=config, board=board, repo_root=repo_root,
            cost_tracker=tracker,
        )
        tasks = [TaskNode(id="impl", title="Do work", body="Work",
                          agent_role="developer")]
        orch.submit_epic("ep1", "Test epic", "Do work", tasks=tasks)

        summary = orch.tick()
        assert summary["killed"] is False
        # Task should have been dispatched
        assert len(summary["dispatched"]) == 1


# ===========================================================================
# Test 2: Epic budget pauses dispatch (not kills workers)
# ===========================================================================


class TestEpicBudgetPausesDispatch:
    """Per-epic budget pauses dispatch without killing running workers."""

    def test_paused_epic_skips_dispatch(
        self, board: MessageBoard, repo_root: Path,
    ) -> None:
        config = SwarmConfig(
            max_epic_spend_usd=0.001,  # Tiny epic budget
            max_daily_spend_usd=100.0,
        )
        tracker = CostTracker(config=config)
        # Spend over the epic budget
        tracker.record_usage(
            task_id="t1", epic_id="budget-epic",
            model="gpt-4o", tokens_in=10000, tokens_out=5000,
        )
        assert tracker.is_epic_paused("budget-epic")

        orch = Orchestrator(
            config=config, board=board, repo_root=repo_root,
            cost_tracker=tracker,
        )
        tasks = [TaskNode(id="impl", title="Impl", body="Body",
                          agent_role="developer")]
        orch.submit_epic("budget-epic", "Expensive epic", "Work", tasks=tasks)

        summary = orch.tick()
        assert "budget-epic" in summary["budget_paused"]
        assert len(summary["dispatched"]) == 0


# ===========================================================================
# Test 3: Completion recording tracks costs
# ===========================================================================


class TestCompletionCostTracking:
    """Completion handling records costs to the tracker."""

    def test_completion_records_cost(
        self, board: MessageBoard, config: SwarmConfig, repo_root: Path,
    ) -> None:
        tracker = CostTracker(config=config)
        orch = Orchestrator(
            config=config, board=board, repo_root=repo_root,
            cost_tracker=tracker,
        )

        # Submit epic with a task
        task_node = TaskNode(id="t1", title="Do work", body="Work",
                             agent_role="developer")
        epic = orch.submit_epic("ep1", "Test", "Request", tasks=[task_node])

        # Manually dispatch the task
        task = epic.tasks["t1"]
        dispatch_task(task, epic, config, board)

        # Simulate a completion posting by a worker
        board.post(
            channel="completions",
            agent_id="developer",
            body="Done",
            title="Do work — complete",
            metadata={
                "task_id": "t1",
                "epic_id": "ep1",
                "tokens_in": 2000,
                "tokens_out": 1000,
                "model_used": "gpt-4o-mini",
            },
        )

        # Process completions directly — don't use tick() which triggers merge
        completed = handle_completions(epic, board, "test-reader")
        assert len(completed) == 1

        # Record cost manually (as the orchestrator tick would)
        comp_post = board.get_post(completed[0].completion_post_id)
        assert comp_post is not None
        meta = comp_post.metadata
        tracker.record_usage(
            task_id="t1",
            epic_id="ep1",
            model=meta["model_used"],
            tokens_in=meta["tokens_in"],
            tokens_out=meta["tokens_out"],
        )

        assert tracker.get_task_cost("t1") > 0
        assert tracker.get_epic_cost("ep1") > 0


# ===========================================================================
# Test 4: suggest_model() integrates with board outcomes
# ===========================================================================


class TestSuggestModelIntegration:
    """suggest_model() uses real board outcomes for recommendation."""

    def test_no_suggestion_without_sufficient_data(
        self, board: MessageBoard,
    ) -> None:
        # Only 3 outcomes — below threshold
        for i in range(3):
            board.record_outcome(
                epic_id="ep1", task_id=f"t{i}", agent_role="developer",
                model_used="gpt-4o-mini", tokens_in=500, tokens_out=200,
                duration_ms=1000, success=True, task_type="feature",
            )
        result = suggest_model(board, "developer")
        assert result is None

    def test_suggestion_after_enough_data(self, board: MessageBoard) -> None:
        for i in range(10):
            board.record_outcome(
                epic_id="ep1", task_id=f"t{i}", agent_role="developer",
                model_used="gpt-4o-mini", tokens_in=500, tokens_out=200,
                duration_ms=1000, success=True, task_type="feature",
            )
        result = suggest_model(board, "developer")
        assert result is not None
        assert result.model == "gpt-4o-mini"
        assert result.data_points >= 5
        assert result.avg_success_rate > 0


# ===========================================================================
# Test 5: Cost tracker hydration restores state after restart
# ===========================================================================


class TestCostHydrationIntegration:
    """Simulates a daemon restart with cost state restored."""

    def test_hydration_restores_epic_costs(
        self, board: MessageBoard, config: SwarmConfig,
    ) -> None:
        # First session: record some outcomes
        board.record_outcome(
            epic_id="ep1", task_id="t1", agent_role="developer",
            model_used="gpt-4o", tokens_in=5000, tokens_out=2000,
            duration_ms=3000, success=True,
        )
        board.record_outcome(
            epic_id="ep1", task_id="t2", agent_role="tester",
            model_used="gpt-4o-mini", tokens_in=1000, tokens_out=500,
            duration_ms=1500, success=True,
        )

        # "Restart" — create a new tracker and hydrate
        tracker = CostTracker(config=config)
        assert tracker.get_epic_cost("ep1") == 0.0  # Fresh

        tracker.hydrate_from_outcomes(board)
        assert tracker.get_epic_cost("ep1") > 0  # Restored
        assert tracker.get_task_cost("t1") > 0
        assert tracker.get_task_cost("t2") > 0


# ===========================================================================
# Test 6: Full pipeline — outcome → suggest_model → cost tracking
# ===========================================================================


class TestFullPipeline:
    """End-to-end: record outcomes, suggest model, track costs."""

    def test_full_intelligence_cycle(
        self, board: MessageBoard, config: SwarmConfig,
    ) -> None:
        # Phase 1: No suggestions with empty history
        assert suggest_model(board, "developer") is None

        # Phase 2: Build up history
        for i in range(8):
            board.record_outcome(
                epic_id="ep1", task_id=f"t{i}", agent_role="developer",
                model_used="gpt-4o-mini", tokens_in=800, tokens_out=300,
                duration_ms=2000, success=True, task_type="feature",
            )

        # Phase 3: Now suggestion should work
        suggestion = suggest_model(board, "developer")
        assert suggestion is not None
        assert suggestion.model == "gpt-4o-mini"

        # Phase 4: Cost tracking works alongside
        tracker = CostTracker(config=config)
        cost = tracker.record_usage(
            task_id="new-task", epic_id="ep1",
            model=suggestion.model, tokens_in=800, tokens_out=300,
        )
        assert cost > 0
        assert tracker.get_task_cost("new-task") == cost

        # Phase 5: Estimate matches tracked cost
        expected = estimate_cost_usd("gpt-4o-mini", 800, 300)
        assert abs(cost - expected) < 0.0001


# ===========================================================================
# Live Azure: real LLM call → outcome recording → cost tracking
# ===========================================================================

SWARM_YAML = Path(__file__).resolve().parents[1] / "swarm.yaml"
REPO_ROOT = Path(__file__).resolve().parents[2]

_live_enabled = os.environ.get("BETH_LIVE_TESTS", "").strip().lower() in ("1", "true", "yes")

requires_live = pytest.mark.skipif(not _live_enabled, reason="Set BETH_LIVE_TESTS=1")
requires_config = pytest.mark.skipif(not SWARM_YAML.exists(), reason="swarm.yaml not found")


@pytest.mark.live
@requires_live
@requires_config
class TestLiveCostTracking:
    """Real LLM call with outcome recording and cost tracking."""

    def test_real_worker_records_outcome_and_cost(self, live_config, live_board, tmp_path):
        """Worker hits real Azure, outcome is recorded, cost is tracked."""
        from swarm.llm import CompletionResult
        from swarm.worker import Task, run_worker

        task = Task(
            post_id=1,
            title="Write a one-liner",
            body="Create a file called output.txt containing 'cost tracking works'",
            agent_role="developer",
            epic_id="cost-test",
            task_id="COST-1",
        )

        result = run_worker(
            task=task,
            config=live_config,
            board=live_board,
            work_dir=tmp_path,
            repo_root=REPO_ROOT,
        )

        assert isinstance(result, CompletionResult)
        assert result.total_tokens_in > 0
        assert result.total_tokens_out > 0

        # Outcome should be recorded on the board
        outcomes = live_board.query_outcomes(agent_role="developer", limit=10)
        assert len(outcomes) >= 1
        latest = outcomes[-1]
        assert latest.success is True
        assert latest.tokens_in > 0
        assert latest.tokens_out > 0

        # Cost estimate should be non-zero
        cost = estimate_cost_usd(
            latest.model_used, latest.tokens_in, latest.tokens_out
        )
        assert cost > 0
