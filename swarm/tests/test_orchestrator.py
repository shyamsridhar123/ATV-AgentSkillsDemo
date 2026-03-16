"""Unit tests for orchestrator.py — Phase 3 core logic.

Tests cover:
  - TaskNode / EpicState data structures
  - Dependency graph helpers (get_ready_tasks, topological_order, etc.)
  - Epic decomposition JSON parsing (no LLM required)
  - Heartbeat monitoring / stuck detection
  - Dispatch and completion handling
  - Merge sequencing in dependency order
  - Backlog.md auto-update (mocked subprocess)
  - Orchestrator.tick() integration
"""

from __future__ import annotations

import json
import time
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from swarm.board import MessageBoard
from swarm.config import SwarmConfig
from swarm.git import MergeResult
from swarm.orchestrator import (
    EpicState,
    Orchestrator,
    TaskNode,
    TaskStatus,
    check_heartbeats,
    decompose_epic,
    dispatch_task,
    get_completed_tasks,
    get_mergeable_tasks,
    get_ready_tasks,
    handle_blockers,
    handle_completions,
    merge_completed_tasks,
    parse_decomposition,
    topological_order,
    update_backlog,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def board() -> MessageBoard:
    """Fresh in-memory message board."""
    return MessageBoard(":memory:")


@pytest.fixture
def config() -> SwarmConfig:
    """Minimal config for testing."""
    return SwarmConfig(
        poll_interval_seconds=0.01,
        heartbeat_interval_seconds=1.0,
        heartbeat_timeout_multiplier=2.0,
        test_command="true",  # Always succeeds
    )


def _make_task(
    id: str,
    agent_role: str = "developer",
    deps: list[str] | None = None,
    status: TaskStatus = TaskStatus.PENDING,
) -> TaskNode:
    """Helper to create a TaskNode for tests."""
    return TaskNode(
        id=id,
        title=f"Task {id}",
        body=f"Body for {id}",
        agent_role=agent_role,
        dependencies=deps or [],
        status=status,
    )


def _make_epic(
    tasks: list[TaskNode],
    epic_id: str = "test-epic",
) -> EpicState:
    """Helper to create an EpicState from a list of tasks."""
    return EpicState(
        epic_id=epic_id,
        title="Test Epic",
        original_request="Test request",
        tasks={t.id: t for t in tasks},
        epic_branch="main",
    )


# ---------------------------------------------------------------------------
# TaskNode / EpicState basics
# ---------------------------------------------------------------------------


class TestTaskNode:
    def test_default_status_is_pending(self):
        task = _make_task("t1")
        assert task.status == TaskStatus.PENDING

    def test_fields_populated(self):
        task = TaskNode(
            id="auth-impl",
            title="Implement auth",
            body="Build JWT flow",
            agent_role="developer",
            dependencies=["auth-design"],
            skills=[".github/skills/vercel-react-best-practices/SKILL.md"],
            acceptance_criteria="Tests pass",
            claimed_paths=["src/auth/"],
        )
        assert task.id == "auth-impl"
        assert task.dependencies == ["auth-design"]
        assert task.skills[0].endswith("SKILL.md")


class TestEpicState:
    def test_all_merged_true_when_all_tasks_merged(self):
        tasks = [
            _make_task("t1", status=TaskStatus.MERGED),
            _make_task("t2", status=TaskStatus.MERGED),
        ]
        epic = _make_epic(tasks)
        assert epic.all_merged is True

    def test_all_merged_false_when_pending(self):
        tasks = [
            _make_task("t1", status=TaskStatus.MERGED),
            _make_task("t2", status=TaskStatus.PENDING),
        ]
        epic = _make_epic(tasks)
        assert epic.all_merged is False

    def test_has_failures(self):
        tasks = [
            _make_task("t1", status=TaskStatus.MERGED),
            _make_task("t2", status=TaskStatus.FAILED),
        ]
        epic = _make_epic(tasks)
        assert epic.has_failures is True

    def test_active_count(self):
        tasks = [
            _make_task("t1", status=TaskStatus.RUNNING),
            _make_task("t2", status=TaskStatus.RUNNING),
            _make_task("t3", status=TaskStatus.PENDING),
        ]
        epic = _make_epic(tasks)
        assert epic.active_count == 2


# ---------------------------------------------------------------------------
# Dependency graph helpers
# ---------------------------------------------------------------------------


class TestGetReadyTasks:
    def test_no_deps_is_immediately_ready(self):
        tasks = [_make_task("t1"), _make_task("t2")]
        epic = _make_epic(tasks)
        ready = get_ready_tasks(epic)
        assert len(ready) == 2

    def test_unmet_deps_block_task(self):
        tasks = [
            _make_task("t1"),
            _make_task("t2", deps=["t1"]),
        ]
        epic = _make_epic(tasks)
        ready = get_ready_tasks(epic)
        assert len(ready) == 1
        assert ready[0].id == "t1"

    def test_met_deps_unblock_task(self):
        tasks = [
            _make_task("t1", status=TaskStatus.MERGED),
            _make_task("t2", deps=["t1"]),
        ]
        epic = _make_epic(tasks)
        ready = get_ready_tasks(epic)
        assert len(ready) == 1
        assert ready[0].id == "t2"

    def test_running_task_not_ready(self):
        tasks = [
            _make_task("t1", status=TaskStatus.RUNNING),
        ]
        epic = _make_epic(tasks)
        ready = get_ready_tasks(epic)
        assert len(ready) == 0

    def test_diamond_dependency(self):
        """Diamond: t3 depends on both t1 and t2."""
        tasks = [
            _make_task("t1", status=TaskStatus.MERGED),
            _make_task("t2", status=TaskStatus.MERGED),
            _make_task("t3", deps=["t1", "t2"]),
        ]
        epic = _make_epic(tasks)
        ready = get_ready_tasks(epic)
        assert len(ready) == 1
        assert ready[0].id == "t3"

    def test_diamond_partial_dep(self):
        """Diamond: t3 depends on t1 (merged) and t2 (pending) — not ready."""
        tasks = [
            _make_task("t1", status=TaskStatus.MERGED),
            _make_task("t2"),
            _make_task("t3", deps=["t1", "t2"]),
        ]
        epic = _make_epic(tasks)
        ready = get_ready_tasks(epic)
        # t2 is ready (no deps), t3 is NOT (t2 not merged)
        assert {t.id for t in ready} == {"t2"}


class TestGetCompletedTasks:
    def test_returns_only_completed(self):
        tasks = [
            _make_task("t1", status=TaskStatus.COMPLETED),
            _make_task("t2", status=TaskStatus.RUNNING),
            _make_task("t3", status=TaskStatus.COMPLETED),
        ]
        epic = _make_epic(tasks)
        completed = get_completed_tasks(epic)
        assert {t.id for t in completed} == {"t1", "t3"}


class TestGetMergeableTasks:
    def test_completed_with_merged_deps_is_mergeable(self):
        tasks = [
            _make_task("t1", status=TaskStatus.MERGED),
            _make_task("t2", deps=["t1"], status=TaskStatus.COMPLETED),
        ]
        epic = _make_epic(tasks)
        mergeable = get_mergeable_tasks(epic)
        assert len(mergeable) == 1
        assert mergeable[0].id == "t2"

    def test_completed_with_unmerged_deps_not_mergeable(self):
        tasks = [
            _make_task("t1", status=TaskStatus.COMPLETED),
            _make_task("t2", deps=["t1"], status=TaskStatus.COMPLETED),
        ]
        epic = _make_epic(tasks)
        mergeable = get_mergeable_tasks(epic)
        # Only t1 is mergeable (no deps), t2 waits for t1
        assert len(mergeable) == 1
        assert mergeable[0].id == "t1"

    def test_no_deps_completed_is_mergeable(self):
        tasks = [
            _make_task("t1", status=TaskStatus.COMPLETED),
        ]
        epic = _make_epic(tasks)
        assert len(get_mergeable_tasks(epic)) == 1


class TestTopologicalOrder:
    def test_linear_chain(self):
        tasks = [
            _make_task("t1"),
            _make_task("t2", deps=["t1"]),
            _make_task("t3", deps=["t2"]),
        ]
        epic = _make_epic(tasks)
        order = topological_order(epic)
        assert order == ["t1", "t2", "t3"]

    def test_parallel_tasks(self):
        tasks = [
            _make_task("t1"),
            _make_task("t2"),
            _make_task("t3"),
        ]
        epic = _make_epic(tasks)
        order = topological_order(epic)
        assert set(order) == {"t1", "t2", "t3"}
        assert len(order) == 3

    def test_diamond(self):
        tasks = [
            _make_task("t1"),
            _make_task("t2"),
            _make_task("t3", deps=["t1", "t2"]),
        ]
        epic = _make_epic(tasks)
        order = topological_order(epic)
        assert order.index("t1") < order.index("t3")
        assert order.index("t2") < order.index("t3")

    def test_cycle_raises(self):
        tasks = [
            _make_task("t1", deps=["t2"]),
            _make_task("t2", deps=["t1"]),
        ]
        epic = _make_epic(tasks)
        with pytest.raises(ValueError, match="cycle"):
            topological_order(epic)


# ---------------------------------------------------------------------------
# Parse decomposition
# ---------------------------------------------------------------------------


class TestParseDecomposition:
    def test_valid_json_array(self):
        raw = json.dumps([
            {
                "id": "impl",
                "title": "Implement feature",
                "body": "Build it",
                "agent_role": "developer",
                "dependencies": [],
            },
            {
                "id": "test",
                "title": "Test feature",
                "body": "Test it",
                "agent_role": "tester",
                "dependencies": ["impl"],
            },
        ])
        tasks = parse_decomposition(raw)
        assert len(tasks) == 2
        assert tasks[0].id == "impl"
        assert tasks[1].dependencies == ["impl"]

    def test_markdown_wrapped_json(self):
        raw = """```json
[{"id": "t1", "title": "Task 1", "body": "Do thing", "agent_role": "developer"}]
```"""
        tasks = parse_decomposition(raw)
        assert len(tasks) == 1
        assert tasks[0].id == "t1"

    def test_optional_fields(self):
        raw = json.dumps([{
            "id": "t1",
            "title": "Task",
            "agent_role": "developer",
        }])
        tasks = parse_decomposition(raw)
        assert tasks[0].body == ""
        assert tasks[0].dependencies == []
        assert tasks[0].skills == []

    def test_invalid_json_raises(self):
        with pytest.raises(json.JSONDecodeError):
            parse_decomposition("not json at all")

    def test_non_array_raises(self):
        with pytest.raises(ValueError, match="JSON array"):
            parse_decomposition('{"id": "t1"}')


# ---------------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------------


class TestDispatchTask:
    def test_dispatch_posts_to_board(self, board: MessageBoard, config: SwarmConfig):
        task = _make_task("t1")
        epic = _make_epic([task])

        post_id = dispatch_task(task, epic, config, board)

        assert post_id > 0
        assert task.status == TaskStatus.RUNNING
        assert task.post_id == post_id
        assert task.dispatch_time > 0

        # Verify message on board
        posts = board.read_all("tasks")
        assert any(p.id == post_id for p in posts)

    def test_dispatch_metadata_correct(self, board: MessageBoard, config: SwarmConfig):
        task = TaskNode(
            id="auth-impl",
            title="Implement auth",
            body="Build JWT",
            agent_role="developer",
            dependencies=["auth-design"],
            skills=["skill1"],
            claimed_paths=["src/auth/"],
        )
        epic = _make_epic([task], epic_id="epic-1")

        post_id = dispatch_task(task, epic, config, board)
        post = board.get_post(post_id)
        assert post is not None
        meta = post.metadata
        assert meta["epic_id"] == "epic-1"
        assert meta["task_id"] == "auth-impl"
        assert meta["agent_role"] == "developer"
        assert meta["dependencies"] == ["auth-design"]


# ---------------------------------------------------------------------------
# Completion handling
# ---------------------------------------------------------------------------


class TestHandleCompletions:
    def test_completion_updates_task_status(self, board: MessageBoard):
        task = _make_task("t1", status=TaskStatus.RUNNING)
        task.worker_id = "dev-t1"
        epic = _make_epic([task])

        # Simulate worker posting completion
        board.post(
            channel="completions",
            agent_id="developer",
            body="Done",
            title="Task t1 complete",
            metadata={"task_id": "t1"},
        )

        completed = handle_completions(epic, board, "test-reader")
        assert len(completed) == 1
        assert completed[0].id == "t1"
        assert task.status == TaskStatus.COMPLETED

    def test_ignores_unknown_task_ids(self, board: MessageBoard):
        task = _make_task("t1", status=TaskStatus.RUNNING)
        epic = _make_epic([task])

        board.post(
            channel="completions",
            agent_id="developer",
            body="Done",
            metadata={"task_id": "nonexistent"},
        )

        completed = handle_completions(epic, board, "test-reader")
        assert len(completed) == 0

    def test_ignores_already_completed(self, board: MessageBoard):
        task = _make_task("t1", status=TaskStatus.COMPLETED)
        epic = _make_epic([task])

        board.post(
            channel="completions",
            agent_id="developer",
            body="Done again",
            metadata={"task_id": "t1"},
        )

        completed = handle_completions(epic, board, "test-reader")
        assert len(completed) == 0


# ---------------------------------------------------------------------------
# Blocker handling
# ---------------------------------------------------------------------------


class TestHandleBlockers:
    def test_blocker_marks_task(self, board: MessageBoard):
        task = _make_task("t1", status=TaskStatus.RUNNING)
        epic = _make_epic([task])

        board.post(
            channel="blockers",
            agent_id="developer",
            body="Can't access API",
            metadata={"task_id": "t1"},
        )

        blocked = handle_blockers(epic, board, "test-reader")
        assert len(blocked) == 1
        assert task.status == TaskStatus.BLOCKED


# ---------------------------------------------------------------------------
# Heartbeat monitoring
# ---------------------------------------------------------------------------


class TestHeartbeatMonitoring:
    def test_healthy_worker_not_stuck(self, board: MessageBoard, config: SwarmConfig):
        task = _make_task("t1", status=TaskStatus.RUNNING)
        task.dispatch_time = time.time()
        task.last_heartbeat = time.time()
        task.worker_id = "dev-t1"
        epic = _make_epic([task])

        stuck = check_heartbeats(epic, board, config, "test-reader")
        assert len(stuck) == 0

    def test_stale_worker_detected(self, board: MessageBoard, config: SwarmConfig):
        # Config: heartbeat_interval=1.0, multiplier=2.0 → timeout=2.0s
        task = _make_task("t1", status=TaskStatus.RUNNING)
        task.dispatch_time = time.time() - 10  # Dispatched 10s ago
        task.last_heartbeat = time.time() - 10  # Last heartbeat 10s ago
        task.worker_id = "dev-t1"
        epic = _make_epic([task])

        stuck = check_heartbeats(epic, board, config, "test-reader")
        assert len(stuck) == 1
        assert stuck[0].id == "t1"

    def test_heartbeat_post_refreshes_timestamp(self, board: MessageBoard, config: SwarmConfig):
        task = _make_task("t1", status=TaskStatus.RUNNING)
        task.dispatch_time = time.time() - 10
        task.last_heartbeat = time.time() - 10
        task.worker_id = "dev-t1"
        epic = _make_epic([task])

        # Worker posts a heartbeat
        board.post(
            channel="heartbeats",
            agent_id="developer",
            body="alive",
            metadata={"worker_id": "dev-t1"},
        )

        stuck = check_heartbeats(epic, board, config, "test-reader")
        # Heartbeat was just posted, so last_heartbeat is now ~now
        assert len(stuck) == 0
        assert task.last_heartbeat > time.time() - 1

    def test_pending_tasks_ignored(self, board: MessageBoard, config: SwarmConfig):
        task = _make_task("t1", status=TaskStatus.PENDING)
        task.dispatch_time = time.time() - 100
        epic = _make_epic([task])

        stuck = check_heartbeats(epic, board, config, "test-reader")
        assert len(stuck) == 0


# ---------------------------------------------------------------------------
# Backlog.md auto-update
# ---------------------------------------------------------------------------


class TestUpdateBacklog:
    @patch("swarm.orchestrator.subprocess.run")
    def test_success(self, mock_run: MagicMock, tmp_path: Path):
        mock_run.return_value = MagicMock(returncode=0)
        epic = EpicState(
            epic_id="BETH-99",
            title="Test",
            original_request="test",
        )

        result = update_backlog(epic, tmp_path)
        assert result is True
        mock_run.assert_called_once()
        args = mock_run.call_args
        assert "BETH-99" in args[0][0]
        assert "Done" in args[0][0]

    @patch("swarm.orchestrator.subprocess.run")
    def test_failure(self, mock_run: MagicMock, tmp_path: Path):
        mock_run.return_value = MagicMock(returncode=1, stderr="error")
        epic = EpicState(
            epic_id="BETH-99",
            title="Test",
            original_request="test",
        )

        result = update_backlog(epic, tmp_path)
        assert result is False


# ---------------------------------------------------------------------------
# Orchestrator.tick() — full loop integration
# ---------------------------------------------------------------------------


class TestOrchestratorTick:
    def test_tick_dispatches_ready_tasks(self, board: MessageBoard, config: SwarmConfig, tmp_path: Path):
        orch = Orchestrator(config, board, tmp_path)
        tasks = [
            _make_task("t1"),
            _make_task("t2", deps=["t1"]),
        ]
        orch.submit_epic("e1", "Test Epic", "Build something", tasks=tasks, epic_branch="main")

        summary = orch.tick()

        # t1 should be dispatched (no deps), t2 should not
        assert len(summary["dispatched"]) == 1
        assert summary["dispatched"][0]["task"] == "t1"
        assert orch.epics["e1"].tasks["t1"].status == TaskStatus.RUNNING
        assert orch.epics["e1"].tasks["t2"].status == TaskStatus.PENDING

    def test_tick_handles_completion_then_dispatches_dependent(
        self, board: MessageBoard, config: SwarmConfig, tmp_path: Path
    ):
        orch = Orchestrator(config, board, tmp_path)
        tasks = [
            _make_task("t1"),
            _make_task("t2", deps=["t1"]),
        ]
        orch.submit_epic("e1", "Test Epic", "Build something", tasks=tasks, epic_branch="main")

        # First tick: dispatch t1
        orch.tick()
        assert orch.epics["e1"].tasks["t1"].status == TaskStatus.RUNNING

        # Simulate t1 completing — worker posts completion
        board.post(
            channel="completions",
            agent_id="developer",
            body="Done",
            metadata={"task_id": "t1"},
        )

        # Manually mark t1 as MERGED to simulate successful merge
        # (In real flow, merge_completed_tasks handles this via git)
        # For this test, we mock merge so it "passes"
        orch.epics["e1"].tasks["t1"].status = TaskStatus.COMPLETED

        # Simulate reading the completion and then merging
        # We need to handle the completion first, then merge
        # Let the tick handle it — but merge requires git, so we mock it
        with patch("swarm.orchestrator.merge_worker") as mock_merge, \
             patch("swarm.orchestrator.remove_worktree"):
            mock_merge.return_value = MergeResult(
                success=True, worker_id="developer-t1", branch="swarm/worker/developer-t1"
            )

            # Reset t1 to RUNNING so handle_completions picks it up
            orch.epics["e1"].tasks["t1"].status = TaskStatus.RUNNING

            summary = orch.tick()

            # t1 was completed, merged, then t2 should be dispatched
            assert orch.epics["e1"].tasks["t1"].status == TaskStatus.MERGED
            assert any(d["task"] == "t2" for d in summary["dispatched"])

    def test_submit_epic_with_predefined_tasks(self, board: MessageBoard, config: SwarmConfig, tmp_path: Path):
        orch = Orchestrator(config, board, tmp_path)
        tasks = [
            _make_task("impl", agent_role="developer"),
            _make_task("test", agent_role="tester", deps=["impl"]),
        ]

        epic = orch.submit_epic("e1", "Test", "Build a thing", tasks=tasks)
        assert len(epic.tasks) == 2
        assert "impl" in epic.tasks
        assert "test" in epic.tasks

    def test_tick_detects_stuck_workers(
        self, board: MessageBoard, config: SwarmConfig, tmp_path: Path
    ):
        orch = Orchestrator(config, board, tmp_path)
        task = _make_task("t1")
        orch.submit_epic("e1", "Test", "Build", tasks=[task], epic_branch="main")

        # Dispatch t1
        orch.tick()
        assert orch.epics["e1"].tasks["t1"].status == TaskStatus.RUNNING

        # Simulate time passing beyond heartbeat timeout
        orch.epics["e1"].tasks["t1"].dispatch_time = time.time() - 100
        orch.epics["e1"].tasks["t1"].last_heartbeat = time.time() - 100

        summary = orch.tick()
        assert len(summary["stuck"]) == 1
        assert orch.epics["e1"].tasks["t1"].status == TaskStatus.FAILED

    @patch("swarm.orchestrator.update_backlog")
    def test_epic_closes_when_all_merged(
        self, mock_backlog: MagicMock,
        board: MessageBoard, config: SwarmConfig, tmp_path: Path,
    ):
        mock_backlog.return_value = True
        orch = Orchestrator(config, board, tmp_path)

        task = _make_task("t1", status=TaskStatus.MERGED)
        orch.submit_epic("e1", "Test", "Build", tasks=[task], epic_branch="main")

        summary = orch.tick()
        assert "e1" in summary["epics_closed"]
        mock_backlog.assert_called_once()

    def test_empty_tick_no_crash(self, board: MessageBoard, config: SwarmConfig, tmp_path: Path):
        orch = Orchestrator(config, board, tmp_path)
        summary = orch.tick()
        # No epics, no crash
        assert summary["dispatched"] == []


# ---------------------------------------------------------------------------
# Orchestrator.run() — async loop
# ---------------------------------------------------------------------------


class TestOrchestratorRun:
    @pytest.mark.asyncio
    async def test_run_with_max_ticks(self, board: MessageBoard, config: SwarmConfig, tmp_path: Path):
        config.poll_interval_seconds = 0.001
        orch = Orchestrator(config, board, tmp_path)

        # Should complete after 3 ticks without hanging
        await orch.run(max_ticks=3)

    @pytest.mark.asyncio
    async def test_stop_halts_loop(self, board: MessageBoard, config: SwarmConfig, tmp_path: Path):
        config.poll_interval_seconds = 0.001
        orch = Orchestrator(config, board, tmp_path)

        async def stop_after_delay():
            await asyncio.sleep(0.01)
            orch.stop()

        import asyncio
        await asyncio.gather(
            orch.run(),
            stop_after_delay(),
        )
        # If we get here, stop worked


# ---------------------------------------------------------------------------
# tmux session management (mocked)
# ---------------------------------------------------------------------------


class TestTmuxManagement:
    @patch("swarm.orchestrator.subprocess.run")
    def test_start_daemon_success(self, mock_run: MagicMock, tmp_path: Path):
        from swarm.orchestrator import start_daemon

        # tmux -V succeeds, has-session fails (no existing), new-session succeeds
        mock_run.side_effect = [
            MagicMock(returncode=0),  # tmux -V
            MagicMock(returncode=1),  # has-session (not running)
            MagicMock(returncode=0, stderr=""),  # new-session
        ]

        result = start_daemon("config.yaml", tmp_path)
        assert result is True

    @patch("swarm.orchestrator.subprocess.run")
    def test_start_daemon_already_running(self, mock_run: MagicMock, tmp_path: Path):
        from swarm.orchestrator import start_daemon

        mock_run.side_effect = [
            MagicMock(returncode=0),  # tmux -V
            MagicMock(returncode=0),  # has-session (already running)
        ]

        result = start_daemon("config.yaml", tmp_path)
        assert result is False

    @patch("swarm.orchestrator.subprocess.run")
    def test_stop_daemon_success(self, mock_run: MagicMock):
        from swarm.orchestrator import stop_daemon

        mock_run.return_value = MagicMock(returncode=0)

        result = stop_daemon()
        assert result is True

    @patch("swarm.orchestrator.subprocess.run")
    def test_attach_daemon_exists(self, mock_run: MagicMock):
        from swarm.orchestrator import attach_daemon

        mock_run.return_value = MagicMock(returncode=0)
        assert attach_daemon() is True

    @patch("swarm.orchestrator.subprocess.run")
    def test_attach_daemon_not_exists(self, mock_run: MagicMock):
        from swarm.orchestrator import attach_daemon

        mock_run.return_value = MagicMock(returncode=1)
        assert attach_daemon() is False

    @patch("swarm.orchestrator.subprocess.run")
    def test_daemon_status_running(self, mock_run: MagicMock):
        from swarm.orchestrator import daemon_status

        mock_run.side_effect = [
            MagicMock(returncode=0),  # has-session
            MagicMock(returncode=0, stdout="123 1 0"),  # display-message
        ]

        status = daemon_status()
        assert status["running"] is True

    @patch("swarm.orchestrator.subprocess.run")
    def test_daemon_status_not_running(self, mock_run: MagicMock):
        from swarm.orchestrator import daemon_status

        mock_run.return_value = MagicMock(returncode=1)
        status = daemon_status()
        assert status["running"] is False
