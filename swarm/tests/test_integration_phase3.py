"""Integration test — Phase 3: Orchestrator Daemon.

Simulates the complete Phase 3 lifecycle WITHOUT needing an LLM:
  1. Beth receives a feature request
  2. Decomposes it into 3 subtasks with dependencies (pre-defined, no LLM)
  3. Dispatches unblocked tasks to workers (simulated via worktree commits)
  4. Workers complete and post to the board
  5. Beth merges work in dependency order
  6. All changes end up on the target branch with tests passing
  7. Epic closes and backlog is updated

This validates all 8 acceptance criteria from BETH-10.4.
"""

from __future__ import annotations

import subprocess
import time
from pathlib import Path
from unittest.mock import patch

import pytest

from swarm.board import MessageBoard
from swarm.claims import ClaimsRegistry
from swarm.config import SwarmConfig
from swarm.git import (
    BRANCH_PREFIX,
    create_worktree,
    list_worktrees,
    merge_worker,
    remove_worktree,
)
from swarm.orchestrator import (
    EpicState,
    Orchestrator,
    TaskNode,
    TaskStatus,
    check_heartbeats,
    dispatch_task,
    get_mergeable_tasks,
    get_ready_tasks,
    handle_completions,
    merge_completed_tasks,
    topological_order,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def git_repo(tmp_path: Path) -> Path:
    """Create a git repo with an initial commit and a test script."""
    repo = tmp_path / "repo"
    repo.mkdir()

    subprocess.run(
        ["git", "init", "-b", "main"], cwd=str(repo),
        check=True, capture_output=True,
    )
    subprocess.run(
        ["git", "config", "user.email", "test@test.com"],
        cwd=str(repo), check=True, capture_output=True,
    )
    subprocess.run(
        ["git", "config", "user.name", "Test"],
        cwd=str(repo), check=True, capture_output=True,
    )

    # Initial files
    (repo / "README.md").write_text("# Phase 3 Integration Test\n")
    (repo / ".gitignore").write_text(".worktrees/\n")

    # A simple test script: check all .py files have valid syntax
    (repo / "run_tests.sh").write_text(
        "#!/bin/bash\n"
        "# Test: verify all .py files have valid syntax\n"
        "find . -name '*.py' -not -path './.worktrees/*' | while read f; do\n"
        "  python3 -c \"compile(open('$f').read(), '$f', 'exec')\" 2>/dev/null || exit 1\n"
        "done\n"
    )
    (repo / "run_tests.sh").chmod(0o755)

    # Create src directory for worker modifications
    (repo / "src").mkdir()
    (repo / "src" / "__init__.py").write_text("# src package\n")

    subprocess.run(
        ["git", "add", "."], cwd=str(repo), check=True, capture_output=True,
    )
    subprocess.run(
        ["git", "commit", "-m", "initial commit"],
        cwd=str(repo), check=True, capture_output=True,
    )

    return repo


@pytest.fixture
def board() -> MessageBoard:
    return MessageBoard(":memory:")


@pytest.fixture
def config() -> SwarmConfig:
    return SwarmConfig(
        poll_interval_seconds=0.01,
        heartbeat_interval_seconds=1.0,
        heartbeat_timeout_multiplier=2.0,
        test_command="bash run_tests.sh",
    )


# ---------------------------------------------------------------------------
# Helper: simulate a worker completing work in a worktree
# ---------------------------------------------------------------------------


def simulate_worker(
    repo_root: Path,
    worker_id: str,
    file_path: str,
    file_content: str,
    board: MessageBoard,
    task_id: str,
    agent_role: str = "developer",
) -> None:
    """Simulate a worker: create worktree, write file, commit, post completion."""
    # Create worktree
    wt = create_worktree(repo_root, worker_id, base_ref="main")

    # Write the file
    target = wt.path / file_path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(file_content)

    # Stage and commit
    subprocess.run(
        ["git", "add", "-A"], cwd=str(wt.path),
        check=True, capture_output=True,
    )
    subprocess.run(
        ["git", "commit", "-m", f"{worker_id}: {task_id}"],
        cwd=str(wt.path), check=True, capture_output=True,
    )

    # Post completion to the board
    board.post(
        channel="completions",
        agent_id=agent_role,
        body=f"Completed {task_id}",
        title=f"{task_id} — complete",
        metadata={
            "task_id": task_id,
            "files_changed": [file_path],
            "worker_id": worker_id,
        },
    )


# ---------------------------------------------------------------------------
# AC #1: Beth correctly decomposes a feature request into subtasks
# ---------------------------------------------------------------------------


class TestAC1_Decomposition:
    """Verify that epic decomposition produces logical subtasks with dependencies."""

    def test_predefined_decomposition_has_correct_structure(self):
        """Using pre-defined tasks (no LLM), verify the structure is correct."""
        tasks = [
            TaskNode(
                id="impl-auth",
                title="Implement JWT auth endpoints",
                body="Create login/logout endpoints with JWT tokens",
                agent_role="developer",
                dependencies=[],
                skills=[".github/skills/vercel-react-best-practices/SKILL.md"],
                acceptance_criteria="Login/logout endpoints work with JWT",
                claimed_paths=["src/auth/"],
            ),
            TaskNode(
                id="test-auth",
                title="Write tests for JWT auth",
                body="Unit and integration tests for auth endpoints",
                agent_role="tester",
                dependencies=["impl-auth"],
                acceptance_criteria="All auth tests pass",
                claimed_paths=["tests/auth/"],
            ),
            TaskNode(
                id="review-auth",
                title="Security review of auth implementation",
                body="Review for OWASP Top 10 vulnerabilities",
                agent_role="security-reviewer",
                dependencies=["impl-auth"],
                acceptance_criteria="No critical vulnerabilities",
                claimed_paths=[],
            ),
        ]

        epic = EpicState(
            epic_id="e1",
            title="JWT Auth System",
            original_request="Build a JWT auth system",
            tasks={t.id: t for t in tasks},
        )

        # Verify structure
        assert len(epic.tasks) == 3
        assert epic.tasks["impl-auth"].dependencies == []
        assert epic.tasks["test-auth"].dependencies == ["impl-auth"]
        assert epic.tasks["review-auth"].dependencies == ["impl-auth"]

        # Verify topological order
        order = topological_order(epic)
        assert order.index("impl-auth") < order.index("test-auth")
        assert order.index("impl-auth") < order.index("review-auth")


# ---------------------------------------------------------------------------
# AC #2: Subtasks dispatched only when dependencies are satisfied
# ---------------------------------------------------------------------------


class TestAC2_DependencyDispatch:
    """Verify that tasks are only dispatched when deps are met."""

    def test_only_unblocked_tasks_dispatched(self, board: MessageBoard, config: SwarmConfig, git_repo: Path):
        orch = Orchestrator(config, board, git_repo)
        tasks = [
            TaskNode(id="t1", title="Impl", body="Build it",
                     agent_role="developer", dependencies=[]),
            TaskNode(id="t2", title="Test", body="Test it",
                     agent_role="tester", dependencies=["t1"]),
            TaskNode(id="t3", title="Review", body="Review it",
                     agent_role="security-reviewer", dependencies=["t1"]),
        ]
        orch.submit_epic("e1", "Feature", "Build it", tasks=tasks, epic_branch="main")

        # First tick: only t1 should be dispatched
        summary = orch.tick()
        assert len(summary["dispatched"]) == 1
        assert summary["dispatched"][0]["task"] == "t1"

        # t2 and t3 should still be pending
        assert orch.epics["e1"].tasks["t2"].status == TaskStatus.PENDING
        assert orch.epics["e1"].tasks["t3"].status == TaskStatus.PENDING

    def test_dependent_tasks_unblock_after_merge(self, board: MessageBoard, config: SwarmConfig, git_repo: Path):
        orch = Orchestrator(config, board, git_repo)
        tasks = [
            TaskNode(id="t1", title="Impl", body="Build it",
                     agent_role="developer", dependencies=[]),
            TaskNode(id="t2", title="Test", body="Test it",
                     agent_role="tester", dependencies=["t1"]),
        ]
        orch.submit_epic("e1", "Feature", "Build it", tasks=tasks, epic_branch="main")

        # Dispatch t1
        orch.tick()

        # Simulate t1 worker completing
        simulate_worker(
            git_repo, "developer-t1", "src/auth.py",
            "# Auth implementation\ndef login(): pass\n",
            board, "t1",
        )
        orch.epics["e1"].tasks["t1"].worker_id = "developer-t1"

        # Next tick: handle completion, merge, dispatch t2
        summary = orch.tick()

        assert orch.epics["e1"].tasks["t1"].status == TaskStatus.MERGED
        assert any(d["task"] == "t2" for d in summary["dispatched"])


# ---------------------------------------------------------------------------
# AC #3: Workers receive tasks, execute, and report completion
# ---------------------------------------------------------------------------


class TestAC3_WorkerCompletion:
    """Verify workers post completion to the board and orchestrator picks it up."""

    def test_worker_completion_detected(self, board: MessageBoard, config: SwarmConfig, git_repo: Path):
        orch = Orchestrator(config, board, git_repo)
        task = TaskNode(id="t1", title="Build", body="Build it", agent_role="developer")
        orch.submit_epic("e1", "Feature", "Build", tasks=[task], epic_branch="main")

        # Dispatch
        orch.tick()

        # Simulate worker completing
        board.post(
            channel="completions",
            agent_id="developer",
            body="Done building",
            metadata={"task_id": "t1"},
        )

        # Orchestrator reads it
        completed = handle_completions(orch.epics["e1"], board, "orchestrator")
        assert len(completed) == 1
        assert completed[0].id == "t1"
        assert orch.epics["e1"].tasks["t1"].status == TaskStatus.COMPLETED


# ---------------------------------------------------------------------------
# AC #4: Beth merges all worker branches in dependency order
# ---------------------------------------------------------------------------


class TestAC4_MergeDependencyOrder:
    """Verify merges happen in topological (dependency) order."""

    def test_three_tasks_merge_in_order(self, board: MessageBoard, config: SwarmConfig, git_repo: Path):
        """Three tasks: impl → test (depends on impl), review (depends on impl).
        impl merges first, then test and review are mergeable."""

        # Set up 3 workers with worktrees, each with distinct changes
        simulate_worker(
            git_repo, "dev-impl", "src/feature.py",
            "# Feature implementation\ndef feature(): return 42\n",
            board, "impl", "developer",
        )
        simulate_worker(
            git_repo, "tester-test", "tests/test_feature.py",
            "# Test\ndef test_it(): assert True\n",
            board, "test", "tester",
        )
        simulate_worker(
            git_repo, "sec-review", "docs/security.md",
            "# Security Review\nNo issues found.\n",
            board, "review", "security-reviewer",
        )

        tasks = [
            TaskNode(id="impl", title="Impl", body="Build",
                     agent_role="developer", dependencies=[],
                     status=TaskStatus.COMPLETED, worker_id="dev-impl"),
            TaskNode(id="test", title="Test", body="Test",
                     agent_role="tester", dependencies=["impl"],
                     status=TaskStatus.COMPLETED, worker_id="tester-test"),
            TaskNode(id="review", title="Review", body="Review",
                     agent_role="security-reviewer", dependencies=["impl"],
                     status=TaskStatus.COMPLETED, worker_id="sec-review"),
        ]
        epic = EpicState(
            epic_id="e1", title="Feature", original_request="Build it",
            tasks={t.id: t for t in tasks}, epic_branch="main",
        )

        # First round: only impl is mergeable (no unmerged deps)
        mergeable = get_mergeable_tasks(epic)
        assert {t.id for t in mergeable} == {"impl"}

        # Merge impl
        results = merge_completed_tasks(epic, board, git_repo, config)
        assert len(results) == 1
        assert results[0].success
        assert epic.tasks["impl"].status == TaskStatus.MERGED

        # Second round: test and review are now mergeable
        mergeable = get_mergeable_tasks(epic)
        assert {t.id for t in mergeable} == {"test", "review"}

        results = merge_completed_tasks(epic, board, git_repo, config)
        assert len(results) == 2
        assert all(r.success for r in results)
        assert epic.tasks["test"].status == TaskStatus.MERGED
        assert epic.tasks["review"].status == TaskStatus.MERGED


# ---------------------------------------------------------------------------
# AC #5: Final test suite passes on the merged epic branch
# ---------------------------------------------------------------------------


class TestAC5_TestSuitePassesAfterMerge:
    """Verify the test gate runs after each merge and all pass."""

    def test_merged_code_passes_tests(self, board: MessageBoard, git_repo: Path):
        config = SwarmConfig(test_command="bash run_tests.sh")

        # Create a worker with valid Python
        simulate_worker(
            git_repo, "dev-t1", "src/hello.py",
            "# Hello\ndef greet(name: str) -> str:\n    return f'Hello {name}'\n",
            board, "t1",
        )

        result = merge_worker(git_repo, "dev-t1", target_branch="main",
                              test_command="bash run_tests.sh")
        assert result.success is True

        # Verify the file exists on main
        assert (git_repo / "src" / "hello.py").exists()

    def test_invalid_python_fails_test_gate(self, board: MessageBoard, git_repo: Path):
        """Worker produces invalid Python — merge test gate should catch it."""
        # Create a worker with INVALID Python
        simulate_worker(
            git_repo, "dev-bad", "src/broken.py",
            "def oops(\n    # This is syntactically invalid\n",
            board, "bad",
        )

        result = merge_worker(git_repo, "dev-bad", target_branch="main",
                              test_command="bash run_tests.sh")
        assert result.success is False
        assert result.test_failed is True

        # Verify the broken file is NOT on main (merge was reverted)
        assert not (git_repo / "src" / "broken.py").exists()


# ---------------------------------------------------------------------------
# AC #6: Stuck worker detected within 2× heartbeat interval
# ---------------------------------------------------------------------------


class TestAC6_StuckWorkerDetection:
    """Verify stuck workers are detected based on heartbeat timeout."""

    def test_stuck_detection_within_timeout(self, board: MessageBoard, config: SwarmConfig):
        # config: interval=1.0, multiplier=2.0 → timeout=2.0s
        task = TaskNode(id="t1", title="Work", body="Do it",
                        agent_role="developer", status=TaskStatus.RUNNING,
                        worker_id="dev-t1")
        task.dispatch_time = time.time() - 5  # Dispatched 5s ago
        task.last_heartbeat = time.time() - 5  # Last heartbeat 5s ago

        epic = EpicState(
            epic_id="e1", title="Test", original_request="test",
            tasks={"t1": task},
        )

        stuck = check_heartbeats(epic, board, config, "test-reader")
        assert len(stuck) == 1
        assert stuck[0].id == "t1"

    def test_healthy_worker_not_detected(self, board: MessageBoard, config: SwarmConfig):
        task = TaskNode(id="t1", title="Work", body="Do it",
                        agent_role="developer", status=TaskStatus.RUNNING,
                        worker_id="dev-t1")
        task.dispatch_time = time.time()
        task.last_heartbeat = time.time()

        epic = EpicState(
            epic_id="e1", title="Test", original_request="test",
            tasks={"t1": task},
        )

        stuck = check_heartbeats(epic, board, config, "test-reader")
        assert len(stuck) == 0


# ---------------------------------------------------------------------------
# AC #7: tmux session management (tested via mocks in unit tests)
# This is tested in test_orchestrator.py::TestTmuxManagement
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# AC #8: Backlog.md auto-update when epic closes
# ---------------------------------------------------------------------------


class TestAC8_BacklogAutoUpdate:
    """Verify backlog is updated when all tasks in an epic are merged."""

    @patch("swarm.orchestrator.update_backlog")
    def test_epic_close_triggers_backlog_update(
        self, mock_backlog, board: MessageBoard, config: SwarmConfig, git_repo: Path,
    ):
        mock_backlog.return_value = True

        orch = Orchestrator(config, board, git_repo)
        # Submit already-merged task
        task = TaskNode(id="t1", title="Done", body="Already done",
                        agent_role="developer", status=TaskStatus.MERGED)
        orch.submit_epic("e1", "Test", "test", tasks=[task], epic_branch="main")

        summary = orch.tick()
        assert "e1" in summary["epics_closed"]
        mock_backlog.assert_called_once()


# ---------------------------------------------------------------------------
# Full end-to-end scenario
# ---------------------------------------------------------------------------


class TestFullScenario:
    """Complete Phase 3 milestone: submit feature → decompose → dispatch →
    workers complete → merge → epic closes."""

    def test_full_lifecycle(self, board: MessageBoard, config: SwarmConfig, git_repo: Path):
        """Simulate: 'Build JWT auth' → 3 subtasks → dispatch → merge → done."""
        orch = Orchestrator(config, board, git_repo)

        # 1. Submit epic with pre-defined tasks (no LLM)
        tasks = [
            TaskNode(
                id="impl-auth",
                title="Implement JWT auth",
                body="Create auth endpoints",
                agent_role="developer",
                dependencies=[],
                claimed_paths=["src/auth.py"],
            ),
            TaskNode(
                id="test-auth",
                title="Test JWT auth",
                body="Write auth tests",
                agent_role="tester",
                dependencies=["impl-auth"],
                claimed_paths=["tests/test_auth.py"],
            ),
            TaskNode(
                id="review-auth",
                title="Security review",
                body="Check for vulnerabilities",
                agent_role="security-reviewer",
                dependencies=["impl-auth"],
                claimed_paths=["docs/security_review.md"],
            ),
        ]

        with patch("swarm.orchestrator.update_backlog") as mock_backlog:
            mock_backlog.return_value = True

            epic = orch.submit_epic(
                "BETH-99", "JWT Auth System",
                "Build a JWT auth system with login and logout",
                tasks=tasks, epic_branch="main",
            )

            # 2. First tick: dispatch impl-auth (no deps)
            summary = orch.tick()
            assert len(summary["dispatched"]) == 1
            assert summary["dispatched"][0]["task"] == "impl-auth"
            assert orch.epics["BETH-99"].tasks["test-auth"].status == TaskStatus.PENDING
            assert orch.epics["BETH-99"].tasks["review-auth"].status == TaskStatus.PENDING

            # 3. Simulate impl-auth worker
            simulate_worker(
                git_repo, "developer-impl-auth", "src/auth.py",
                '"""JWT Auth"""\n\ndef login(user: str, password: str) -> str:\n'
                '    return "token-123"\n\n'
                'def logout(token: str) -> bool:\n'
                '    return True\n',
                board, "impl-auth",
            )
            orch.epics["BETH-99"].tasks["impl-auth"].worker_id = "developer-impl-auth"

            # 4. Second tick: completion → merge → dispatch test + review
            summary = orch.tick()
            assert orch.epics["BETH-99"].tasks["impl-auth"].status == TaskStatus.MERGED
            dispatched_ids = {d["task"] for d in summary["dispatched"]}
            assert "test-auth" in dispatched_ids
            assert "review-auth" in dispatched_ids

            # 5. Simulate test-auth and review-auth workers
            simulate_worker(
                git_repo, "tester-test-auth", "tests/test_auth.py",
                '"""Auth tests"""\n\ndef test_login():\n    assert True\n\n'
                'def test_logout():\n    assert True\n',
                board, "test-auth", "tester",
            )
            simulate_worker(
                git_repo, "security-reviewer-review-auth", "docs/security_review.md",
                "# Security Review\n\nNo critical vulnerabilities found.\n"
                "- JWT tokens properly signed\n- Tokens expire correctly\n",
                board, "review-auth", "security-reviewer",
            )
            orch.epics["BETH-99"].tasks["test-auth"].worker_id = "tester-test-auth"
            orch.epics["BETH-99"].tasks["review-auth"].worker_id = "security-reviewer-review-auth"

            # 6. Third tick: complete → merge test + review → epic closes
            summary = orch.tick()
            assert orch.epics["BETH-99"].tasks["test-auth"].status == TaskStatus.MERGED
            assert orch.epics["BETH-99"].tasks["review-auth"].status == TaskStatus.MERGED
            assert "BETH-99" in summary["epics_closed"]

            # 7. Verify backlog was updated
            mock_backlog.assert_called_once()

        # 8. Verify all files are on main
        assert (git_repo / "src" / "auth.py").exists()
        assert (git_repo / "tests" / "test_auth.py").exists()
        assert (git_repo / "docs" / "security_review.md").exists()

        # 9. Verify file contents
        auth_content = (git_repo / "src" / "auth.py").read_text()
        assert "login" in auth_content
        assert "logout" in auth_content

        # 10. Verify clean state (no leftover worktrees)
        remaining = list_worktrees(git_repo)
        assert len(remaining) == 0

    def test_parallel_dispatch_non_dependent_tasks(
        self, board: MessageBoard, config: SwarmConfig, git_repo: Path,
    ):
        """Two tasks with no dependencies should dispatch simultaneously."""
        orch = Orchestrator(config, board, git_repo)
        tasks = [
            TaskNode(id="t1", title="Feature A", body="Build A",
                     agent_role="developer"),
            TaskNode(id="t2", title="Feature B", body="Build B",
                     agent_role="developer"),
        ]

        with patch("swarm.orchestrator.update_backlog"):
            orch.submit_epic("e1", "Parallel", "Build two features",
                             tasks=tasks, epic_branch="main")

            summary = orch.tick()
            assert len(summary["dispatched"]) == 2
            dispatched_ids = {d["task"] for d in summary["dispatched"]}
            assert dispatched_ids == {"t1", "t2"}
