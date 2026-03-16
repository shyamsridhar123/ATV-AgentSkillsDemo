"""Integration test — Phase 2: parallel workers in git worktrees.

Simulates the complete Phase 2 flow WITHOUT needing an LLM:
  1. Two workers get worktrees from the same base branch
  2. Each claims non-overlapping file paths
  3. Each makes changes in their isolated worktree
  4. Beth merges worker A (tests pass), then worker B (tests pass)
  5. Both changes end up on the target branch
  6. Worktrees and branches are cleaned up

This covers all 8 acceptance criteria in a single end-to-end scenario.
"""

from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from swarm.board import MessageBoard
from swarm.claims import ClaimsRegistry
from swarm.git import (
    BRANCH_PREFIX,
    cleanup_all_worktrees,
    create_worktree,
    list_worktrees,
    merge_worker,
    remove_worktree,
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
    (repo / "README.md").write_text("# Integration Test Repo\n")
    (repo / ".gitignore").write_text(".worktrees/\n")

    # A simple test script that checks syntax of Python files
    (repo / "run_tests.sh").write_text(
        "#!/bin/bash\n"
        "# Simple test: verify all .py files have valid syntax\n"
        "find . -name '*.py' -not -path './.worktrees/*' | while read f; do\n"
        "  python3 -c \"compile(open('$f').read(), '$f', 'exec')\" 2>/dev/null || exit 1\n"
        "done\n"
    )
    (repo / "run_tests.sh").chmod(0o755)

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


# ---------------------------------------------------------------------------
# Full parallel workflow integration test
# ---------------------------------------------------------------------------


class TestPhase2ParallelWorkflow:
    """End-to-end test: two workers, worktrees, claims, sequential merge."""

    def test_full_parallel_flow(self, git_repo: Path, board: MessageBoard) -> None:
        """
        AC #1: Worktrees from base branch
        AC #2: Isolated git operations
        AC #3: Sequential merge with tests
        AC #5: Cleanup after merge
        AC #6: Claims prevent overlapping paths
        AC #7: Test validation gate
        AC #8: .worktrees/ ignored
        """
        claims = ClaimsRegistry(board)

        # --- Step 1: Both workers claim non-overlapping paths ---
        claim_a = claims.claim("developer", ["src/feature_a.py"])
        claim_b = claims.claim("tester", ["tests/test_feature.py"])
        assert claim_a.granted is True
        assert claim_b.granted is True

        # --- Step 2: Create worktrees (AC #1) ---
        wt_a = create_worktree(git_repo, "developer", base_ref="main")
        wt_b = create_worktree(git_repo, "tester", base_ref="main")

        assert wt_a.path.exists()
        assert wt_b.path.exists()
        assert wt_a.path != wt_b.path

        # --- Step 3: Workers make changes in isolation (AC #2) ---
        # Developer: creates a Python module
        (wt_a.path / "src").mkdir(exist_ok=True)
        (wt_a.path / "src" / "feature_a.py").write_text(
            "def greet(name: str) -> str:\n"
            '    return f"Hello, {name}!"\n'
        )
        subprocess.run(
            ["git", "add", "."], cwd=str(wt_a.path),
            check=True, capture_output=True,
        )
        subprocess.run(
            ["git", "commit", "-m", "developer: add feature_a"],
            cwd=str(wt_a.path), check=True, capture_output=True,
        )

        # Tester: creates a test file
        (wt_b.path / "tests").mkdir(exist_ok=True)
        (wt_b.path / "tests" / "test_feature.py").write_text(
            "def test_placeholder():\n"
            "    assert True\n"
        )
        subprocess.run(
            ["git", "add", "."], cwd=str(wt_b.path),
            check=True, capture_output=True,
        )
        subprocess.run(
            ["git", "commit", "-m", "tester: add test"],
            cwd=str(wt_b.path), check=True, capture_output=True,
        )

        # Verify isolation: developer's file not in tester's worktree
        assert not (wt_b.path / "src" / "feature_a.py").exists()
        assert not (wt_a.path / "tests" / "test_feature.py").exists()

        # --- Step 4: Sequential merge with test gate (AC #3, #7) ---
        # Merge developer first
        result_a = merge_worker(
            git_repo, "developer",
            target_branch="main",
            test_command="true",  # Simple pass
        )
        assert result_a.success is True
        assert result_a.conflict is False
        assert result_a.test_failed is False

        # Release developer's claim
        claims.release("developer")

        # Merge tester second
        result_b = merge_worker(
            git_repo, "tester",
            target_branch="main",
            test_command="true",
        )
        assert result_b.success is True
        assert result_b.conflict is False
        assert result_b.test_failed is False

        # Release tester's claim
        claims.release("tester")

        # --- Step 5: Both changes on main (AC #3) ---
        assert (git_repo / "src" / "feature_a.py").exists()
        assert (git_repo / "tests" / "test_feature.py").exists()

        # --- Step 6: Worktrees and branches cleaned up (AC #5) ---
        assert not wt_a.path.exists()
        assert not wt_b.path.exists()
        assert list_worktrees(git_repo) == []

        # Branches also gone
        result = subprocess.run(
            ["git", "branch"], cwd=str(git_repo),
            capture_output=True, text=True,
        )
        assert "swarm/worker" not in result.stdout

    def test_overlapping_claims_rejected(self, git_repo: Path, board: MessageBoard) -> None:
        """AC #6: Claims prevent two workers from touching the same paths."""
        claims = ClaimsRegistry(board)

        claim_a = claims.claim("developer", ["src/shared.py"])
        assert claim_a.granted is True

        # Tester tries to claim the same file
        claim_b = claims.claim("tester", ["src/shared.py"])
        assert claim_b.granted is False
        assert len(claim_b.conflicts) == 1
        assert claim_b.conflicts[0]["conflicting_worker"] == "developer"

    def test_merge_conflict_no_partial_state(self, git_repo: Path) -> None:
        """AC #4: Merge conflict aborts cleanly with no partial state."""
        wt_a = create_worktree(git_repo, "conflict-a", base_ref="main")
        wt_b = create_worktree(git_repo, "conflict-b", base_ref="main")

        # Both modify README.md (intentional conflict)
        (wt_a.path / "README.md").write_text("# Worker A version\n")
        subprocess.run(
            ["git", "add", "."], cwd=str(wt_a.path),
            check=True, capture_output=True,
        )
        subprocess.run(
            ["git", "commit", "-m", "a: modify readme"],
            cwd=str(wt_a.path), check=True, capture_output=True,
        )

        (wt_b.path / "README.md").write_text("# Worker B version\n")
        subprocess.run(
            ["git", "add", "."], cwd=str(wt_b.path),
            check=True, capture_output=True,
        )
        subprocess.run(
            ["git", "commit", "-m", "b: modify readme"],
            cwd=str(wt_b.path), check=True, capture_output=True,
        )

        # Merge A succeeds
        result_a = merge_worker(git_repo, "conflict-a", target_branch="main")
        assert result_a.success is True

        # Merge B conflicts
        result_b = merge_worker(git_repo, "conflict-b", target_branch="main")
        assert result_b.success is False
        assert result_b.conflict is True

        # Main has A's version, no partial merge state
        readme = (git_repo / "README.md").read_text()
        assert "Worker A" in readme
        assert "<<<" not in readme  # No conflict markers

    def test_test_failure_reverts_merge(self, git_repo: Path) -> None:
        """AC #7: Failed tests after merge → revert to previous state."""
        # Record main's HEAD before any merges
        head_before = subprocess.run(
            ["git", "rev-parse", "HEAD"], cwd=str(git_repo),
            capture_output=True, text=True,
        ).stdout.strip()

        wt = create_worktree(git_repo, "test-fail", base_ref="main")
        (wt.path / "broken.py").write_text("# this file causes test failure\n")
        subprocess.run(
            ["git", "add", "."], cwd=str(wt.path),
            check=True, capture_output=True,
        )
        subprocess.run(
            ["git", "commit", "-m", "add broken file"],
            cwd=str(wt.path), check=True, capture_output=True,
        )

        result = merge_worker(
            git_repo, "test-fail",
            target_branch="main",
            test_command="false",  # Always fails
        )

        assert result.success is False
        assert result.test_failed is True

        # Main should be back to where it was
        head_after = subprocess.run(
            ["git", "rev-parse", "HEAD"], cwd=str(git_repo),
            capture_output=True, text=True,
        ).stdout.strip()
        assert head_after == head_before
        assert not (git_repo / "broken.py").exists()

    def test_gitignore_covers_worktrees(self, git_repo: Path) -> None:
        """AC #8: .worktrees/ directory is git-ignored."""
        create_worktree(git_repo, "ignored-check", base_ref="main")

        result = subprocess.run(
            ["git", "status", "--porcelain"],
            cwd=str(git_repo), capture_output=True, text=True,
        )
        assert ".worktrees" not in result.stdout

        # Cleanup
        cleanup_all_worktrees(git_repo)
