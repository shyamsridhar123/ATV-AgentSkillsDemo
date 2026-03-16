"""Tests for swarm.git — worktree lifecycle, merge gate, cleanup.

These tests create real git repos in tmp directories to exercise
the actual git worktree, merge, and branch operations.
"""

from __future__ import annotations

import os
import subprocess
from pathlib import Path

import pytest

from swarm.git import (
    BRANCH_PREFIX,
    WORKTREES_DIR,
    MergeResult,
    WorktreeInfo,
    cleanup_all_worktrees,
    create_worktree,
    list_worktrees,
    merge_worker,
    remove_worktree,
)


# ---------------------------------------------------------------------------
# Fixtures — create a temporary git repo with an initial commit
# ---------------------------------------------------------------------------


@pytest.fixture
def git_repo(tmp_path: Path) -> Path:
    """Create a bare-minimum git repo with one commit on main."""
    repo = tmp_path / "repo"
    repo.mkdir()

    subprocess.run(["git", "init", "-b", "main"], cwd=str(repo), check=True, capture_output=True)
    subprocess.run(
        ["git", "config", "user.email", "test@test.com"],
        cwd=str(repo), check=True, capture_output=True,
    )
    subprocess.run(
        ["git", "config", "user.name", "Test"],
        cwd=str(repo), check=True, capture_output=True,
    )

    # Initial commit
    (repo / "README.md").write_text("# Test Repo\n")
    subprocess.run(["git", "add", "."], cwd=str(repo), check=True, capture_output=True)
    subprocess.run(
        ["git", "commit", "-m", "initial commit"],
        cwd=str(repo), check=True, capture_output=True,
    )

    return repo


# ---------------------------------------------------------------------------
# AC #1: Worktrees created from origin/main (or specified base branch)
# ---------------------------------------------------------------------------


class TestCreateWorktree:
    """Verify worktree creation from a base ref."""

    def test_creates_worktree_from_main(self, git_repo: Path) -> None:
        """AC #1: Worktree created from main (local, since no remote)."""
        info = create_worktree(git_repo, "worker-1", base_ref="main")

        assert info.worker_id == "worker-1"
        assert info.path.exists()
        assert info.branch == f"{BRANCH_PREFIX}worker-1"
        assert info.base_ref == "main"

        # Verify it's actually a git worktree
        result = subprocess.run(
            ["git", "rev-parse", "--git-dir"],
            cwd=str(info.path),
            capture_output=True, text=True,
        )
        assert result.returncode == 0

    def test_worktree_directory_structure(self, git_repo: Path) -> None:
        """Worktree lives under .worktrees/<worker_id>/."""
        info = create_worktree(git_repo, "dev-agent", base_ref="main")
        expected_dir = git_repo / WORKTREES_DIR / "dev-agent"
        assert info.path == expected_dir
        assert expected_dir.is_dir()

    def test_worktree_has_repo_contents(self, git_repo: Path) -> None:
        """Worktree contains files from the base branch."""
        info = create_worktree(git_repo, "reader", base_ref="main")
        assert (info.path / "README.md").exists()
        content = (info.path / "README.md").read_text()
        assert "Test Repo" in content

    def test_ephemeral_branch_created(self, git_repo: Path) -> None:
        """A swarm/worker/<id> branch is created."""
        create_worktree(git_repo, "branchy", base_ref="main")

        result = subprocess.run(
            ["git", "branch", "--list", f"{BRANCH_PREFIX}branchy"],
            cwd=str(git_repo), capture_output=True, text=True,
        )
        assert "swarm/worker/branchy" in result.stdout

    def test_create_multiple_worktrees(self, git_repo: Path) -> None:
        """Multiple worktrees can coexist."""
        w1 = create_worktree(git_repo, "worker-a", base_ref="main")
        w2 = create_worktree(git_repo, "worker-b", base_ref="main")

        assert w1.path != w2.path
        assert w1.path.exists()
        assert w2.path.exists()


# ---------------------------------------------------------------------------
# AC #2: Each worker git operations isolated to its worktree
# ---------------------------------------------------------------------------


class TestWorktreeIsolation:
    """Verify changes in one worktree don't affect another."""

    def test_changes_isolated(self, git_repo: Path) -> None:
        """AC #2: File created in worker-a doesn't appear in worker-b."""
        w1 = create_worktree(git_repo, "isolated-a", base_ref="main")
        w2 = create_worktree(git_repo, "isolated-b", base_ref="main")

        # Write a file in worker-a
        (w1.path / "feature_a.py").write_text("# Feature A\n")

        # It should NOT exist in worker-b
        assert not (w2.path / "feature_a.py").exists()

    def test_commits_isolated(self, git_repo: Path) -> None:
        """AC #2: Commits in one worktree don't appear in another."""
        w1 = create_worktree(git_repo, "commit-a", base_ref="main")
        w2 = create_worktree(git_repo, "commit-b", base_ref="main")

        # Commit in worker-a
        (w1.path / "new_file.txt").write_text("hello\n")
        subprocess.run(["git", "add", "."], cwd=str(w1.path), check=True, capture_output=True)
        subprocess.run(
            ["git", "commit", "-m", "worker-a change"],
            cwd=str(w1.path), check=True, capture_output=True,
        )

        # Worker-b should still be at the original commit count
        result_a = subprocess.run(
            ["git", "rev-list", "--count", "HEAD"],
            cwd=str(w1.path), capture_output=True, text=True,
        )
        result_b = subprocess.run(
            ["git", "rev-list", "--count", "HEAD"],
            cwd=str(w2.path), capture_output=True, text=True,
        )
        assert int(result_a.stdout.strip()) == 2  # initial + worker-a's
        assert int(result_b.stdout.strip()) == 1  # initial only


# ---------------------------------------------------------------------------
# AC #5: Worktrees and ephemeral branches cleaned up after merge
# ---------------------------------------------------------------------------


class TestRemoveWorktree:
    """Verify cleanup removes worktree directory and branch."""

    def test_remove_cleans_directory(self, git_repo: Path) -> None:
        """AC #5: Worktree directory removed."""
        info = create_worktree(git_repo, "cleanup-dir", base_ref="main")
        assert info.path.exists()

        remove_worktree(git_repo, "cleanup-dir")
        assert not info.path.exists()

    def test_remove_deletes_branch(self, git_repo: Path) -> None:
        """AC #5: Ephemeral branch deleted."""
        create_worktree(git_repo, "cleanup-branch", base_ref="main")

        remove_worktree(git_repo, "cleanup-branch")

        result = subprocess.run(
            ["git", "branch", "--list", f"{BRANCH_PREFIX}cleanup-branch"],
            cwd=str(git_repo), capture_output=True, text=True,
        )
        assert "cleanup-branch" not in result.stdout

    def test_remove_nonexistent_is_safe(self, git_repo: Path) -> None:
        """Removing a worktree that doesn't exist should not raise."""
        remove_worktree(git_repo, "ghost-worker")  # Should not raise

    def test_cleanup_all(self, git_repo: Path) -> None:
        """cleanup_all_worktrees removes everything."""
        create_worktree(git_repo, "bulk-a", base_ref="main")
        create_worktree(git_repo, "bulk-b", base_ref="main")
        create_worktree(git_repo, "bulk-c", base_ref="main")

        count = cleanup_all_worktrees(git_repo)
        assert count == 3
        assert list_worktrees(git_repo) == []


# ---------------------------------------------------------------------------
# List worktrees
# ---------------------------------------------------------------------------


class TestListWorktrees:
    """Verify worktree listing."""

    def test_list_returns_active_worktrees(self, git_repo: Path) -> None:
        create_worktree(git_repo, "list-a", base_ref="main")
        create_worktree(git_repo, "list-b", base_ref="main")

        active = list_worktrees(git_repo)
        worker_ids = {w.worker_id for w in active}
        assert "list-a" in worker_ids
        assert "list-b" in worker_ids

    def test_list_empty_when_none(self, git_repo: Path) -> None:
        assert list_worktrees(git_repo) == []

    def test_list_excludes_removed(self, git_repo: Path) -> None:
        create_worktree(git_repo, "still-here", base_ref="main")
        create_worktree(git_repo, "going-away", base_ref="main")

        remove_worktree(git_repo, "going-away")

        active = list_worktrees(git_repo)
        worker_ids = {w.worker_id for w in active}
        assert "still-here" in worker_ids
        assert "going-away" not in worker_ids


# ---------------------------------------------------------------------------
# AC #3: Sequential merge (Beth merges A, tests, then B, tests)
# AC #4: Merge conflicts abort cleanly
# AC #7: Test validation gate
# ---------------------------------------------------------------------------


class TestMergeWorker:
    """Verify the merge gate with test validation."""

    def test_successful_merge(self, git_repo: Path) -> None:
        """AC #3: Worker branch merges cleanly into target."""
        w = create_worktree(git_repo, "merge-ok", base_ref="main")

        # Make a change in the worker
        (w.path / "feature.py").write_text("# New feature\n")
        subprocess.run(["git", "add", "."], cwd=str(w.path), check=True, capture_output=True)
        subprocess.run(
            ["git", "commit", "-m", "add feature"],
            cwd=str(w.path), check=True, capture_output=True,
        )

        result = merge_worker(git_repo, "merge-ok", target_branch="main")

        assert result.success is True
        assert result.conflict is False
        assert result.test_failed is False
        assert result.worker_id == "merge-ok"

        # Feature should be on main now
        assert (git_repo / "feature.py").exists()

    def test_merge_conflict_aborts_cleanly(self, git_repo: Path) -> None:
        """AC #4: Merge conflict → abort, no partial state."""
        w = create_worktree(git_repo, "conflict-worker", base_ref="main")

        # Change README on main (creating a conflict)
        (git_repo / "README.md").write_text("# Modified by main\n")
        subprocess.run(["git", "add", "."], cwd=str(git_repo), check=True, capture_output=True)
        subprocess.run(
            ["git", "commit", "-m", "main changes README"],
            cwd=str(git_repo), check=True, capture_output=True,
        )

        # Change same file in worker
        (w.path / "README.md").write_text("# Modified by worker\n")
        subprocess.run(["git", "add", "."], cwd=str(w.path), check=True, capture_output=True)
        subprocess.run(
            ["git", "commit", "-m", "worker changes README"],
            cwd=str(w.path), check=True, capture_output=True,
        )

        result = merge_worker(git_repo, "conflict-worker", target_branch="main")

        assert result.success is False
        assert result.conflict is True

        # Main should still have its version (no partial state)
        content = (git_repo / "README.md").read_text()
        assert "Modified by main" in content

    def test_test_gate_passes(self, git_repo: Path) -> None:
        """AC #7: Test command runs after merge; passes → merge stays."""
        w = create_worktree(git_repo, "tested-ok", base_ref="main")

        (w.path / "tested.py").write_text("# tested\n")
        subprocess.run(["git", "add", "."], cwd=str(w.path), check=True, capture_output=True)
        subprocess.run(
            ["git", "commit", "-m", "add tested"],
            cwd=str(w.path), check=True, capture_output=True,
        )

        result = merge_worker(
            git_repo, "tested-ok",
            target_branch="main",
            test_command="true",  # Always passes
        )

        assert result.success is True
        assert result.test_failed is False
        assert (git_repo / "tested.py").exists()

    def test_test_gate_fails_reverts(self, git_repo: Path) -> None:
        """AC #7: Test command fails → merge is reverted."""
        w = create_worktree(git_repo, "tested-fail", base_ref="main")

        (w.path / "bad_feature.py").write_text("# broken\n")
        subprocess.run(["git", "add", "."], cwd=str(w.path), check=True, capture_output=True)
        subprocess.run(
            ["git", "commit", "-m", "add bad feature"],
            cwd=str(w.path), check=True, capture_output=True,
        )

        result = merge_worker(
            git_repo, "tested-fail",
            target_branch="main",
            test_command="false",  # Always fails
        )

        assert result.success is False
        assert result.test_failed is True

        # The bad feature should NOT be on main
        assert not (git_repo / "bad_feature.py").exists()

    def test_sequential_merge_two_workers(self, git_repo: Path) -> None:
        """AC #3: Beth merges worker A → tests → merges worker B → tests."""
        wa = create_worktree(git_repo, "seq-a", base_ref="main")
        wb = create_worktree(git_repo, "seq-b", base_ref="main")

        # Worker A: add file A
        (wa.path / "a.py").write_text("# A\n")
        subprocess.run(["git", "add", "."], cwd=str(wa.path), check=True, capture_output=True)
        subprocess.run(
            ["git", "commit", "-m", "worker a"],
            cwd=str(wa.path), check=True, capture_output=True,
        )

        # Worker B: add file B
        (wb.path / "b.py").write_text("# B\n")
        subprocess.run(["git", "add", "."], cwd=str(wb.path), check=True, capture_output=True)
        subprocess.run(
            ["git", "commit", "-m", "worker b"],
            cwd=str(wb.path), check=True, capture_output=True,
        )

        # Sequential merge: A first, then B
        result_a = merge_worker(
            git_repo, "seq-a", target_branch="main", test_command="true"
        )
        assert result_a.success is True

        result_b = merge_worker(
            git_repo, "seq-b", target_branch="main", test_command="true"
        )
        assert result_b.success is True

        # Both features on main
        assert (git_repo / "a.py").exists()
        assert (git_repo / "b.py").exists()

    def test_merge_cleans_up_worktree(self, git_repo: Path) -> None:
        """AC #5: Successful merge removes worktree and branch."""
        w = create_worktree(git_repo, "cleanup-merge", base_ref="main")
        worktree_path = w.path

        (w.path / "cleanup.py").write_text("# cleanup\n")
        subprocess.run(["git", "add", "."], cwd=str(w.path), check=True, capture_output=True)
        subprocess.run(
            ["git", "commit", "-m", "cleanup feature"],
            cwd=str(w.path), check=True, capture_output=True,
        )

        merge_worker(git_repo, "cleanup-merge", target_branch="main")

        # Worktree dir gone
        assert not worktree_path.exists()

        # Branch gone
        result = subprocess.run(
            ["git", "branch", "--list", f"{BRANCH_PREFIX}cleanup-merge"],
            cwd=str(git_repo), capture_output=True, text=True,
        )
        assert "cleanup-merge" not in result.stdout


# ---------------------------------------------------------------------------
# AC #8: .worktrees/ in .gitignore (verified via filesystem, not git)
# ---------------------------------------------------------------------------


class TestGitignore:
    """Verify gitignore configuration."""

    def test_worktrees_not_tracked(self, git_repo: Path) -> None:
        """AC #8: Files in .worktrees/ should be ignored by git."""
        # Add a .gitignore with the worktrees entry
        (git_repo / ".gitignore").write_text(".worktrees/\n")
        subprocess.run(["git", "add", ".gitignore"], cwd=str(git_repo), check=True, capture_output=True)
        subprocess.run(
            ["git", "commit", "-m", "add gitignore"],
            cwd=str(git_repo), check=True, capture_output=True,
        )

        # Create a worktree
        create_worktree(git_repo, "ignored", base_ref="main")

        # git status should not show the worktree directory
        result = subprocess.run(
            ["git", "status", "--porcelain"],
            cwd=str(git_repo), capture_output=True, text=True,
        )
        assert ".worktrees" not in result.stdout
