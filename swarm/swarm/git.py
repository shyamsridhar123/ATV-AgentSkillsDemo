"""Git worktree lifecycle — create, list, merge, cleanup.

Provides isolated sandboxes for parallel agent workers via git worktrees.
Each worker gets its own worktree branched from a base (default: origin/main).

Worktree directory layout:
    <repo_root>/.worktrees/<worker_id>/

Key operations:
    create_worktree  — Create a new worktree + ephemeral branch for a worker
    remove_worktree  — Clean up a worktree and its ephemeral branch
    list_worktrees   — List all active swarm worktrees
    merge_worker     — Merge a worker's branch into the base, run tests, revert on failure
"""

from __future__ import annotations

import logging
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

logger = logging.getLogger(__name__)

# Default directory under repo root for all worktrees
WORKTREES_DIR = ".worktrees"

# Ephemeral branch prefix — makes cleanup easy
BRANCH_PREFIX = "swarm/worker/"


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass
class WorktreeInfo:
    """Metadata about an active worktree."""

    worker_id: str
    path: Path
    branch: str
    base_ref: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _run_git(
    args: list[str],
    cwd: Path,
    *,
    check: bool = True,
    timeout: int = 60,
) -> subprocess.CompletedProcess[str]:
    """Run a git command and return the result.

    Raises ``subprocess.CalledProcessError`` on failure when ``check=True``.
    """
    cmd = ["git"] + args
    logger.debug("git %s (cwd=%s)", " ".join(args), cwd)
    return subprocess.run(
        cmd,
        cwd=str(cwd),
        capture_output=True,
        text=True,
        check=check,
        timeout=timeout,
    )


def _fetch_ref(repo_root: Path, ref: str) -> None:
    """Fetch a remote ref so it's up to date. Silently ignores failures."""
    if "/" in ref and not ref.startswith("refs/"):
        # Looks like "origin/main" — fetch from that remote
        remote, _, branch = ref.partition("/")
        _run_git(["fetch", remote, branch], cwd=repo_root, check=False, timeout=30)


# ---------------------------------------------------------------------------
# Worktree lifecycle
# ---------------------------------------------------------------------------


def create_worktree(
    repo_root: Path,
    worker_id: str,
    *,
    base_ref: str = "origin/main",
) -> WorktreeInfo:
    """Create a git worktree for a worker.

    Creates:
      - An ephemeral branch ``swarm/worker/<worker_id>`` from ``base_ref``
      - A worktree at ``<repo_root>/.worktrees/<worker_id>/``

    Parameters
    ----------
    repo_root : Path
        The main repository root.
    worker_id : str
        Unique identifier for this worker (used in branch and directory names).
    base_ref : str
        The git ref to branch from (default: ``origin/main``).

    Returns
    -------
    WorktreeInfo
        Metadata about the created worktree.

    Raises
    ------
    subprocess.CalledProcessError
        If git operations fail.
    """
    worktree_dir = repo_root / WORKTREES_DIR / worker_id
    branch_name = f"{BRANCH_PREFIX}{worker_id}"

    # Ensure base ref is fresh
    _fetch_ref(repo_root, base_ref)

    # Create the worktree with a new branch
    # git worktree add -b <branch> <path> <base_ref>
    _run_git(
        ["worktree", "add", "-b", branch_name, str(worktree_dir), base_ref],
        cwd=repo_root,
    )

    logger.info(
        "Created worktree: worker=%s, branch=%s, path=%s",
        worker_id, branch_name, worktree_dir,
    )

    return WorktreeInfo(
        worker_id=worker_id,
        path=worktree_dir,
        branch=branch_name,
        base_ref=base_ref,
    )


def remove_worktree(repo_root: Path, worker_id: str) -> None:
    """Remove a worker's worktree and delete its ephemeral branch.

    Safe to call even if the worktree doesn't exist.
    """
    worktree_dir = repo_root / WORKTREES_DIR / worker_id
    branch_name = f"{BRANCH_PREFIX}{worker_id}"

    # Remove the worktree (--force handles uncommitted changes)
    if worktree_dir.exists():
        _run_git(
            ["worktree", "remove", str(worktree_dir), "--force"],
            cwd=repo_root,
            check=False,
        )
        # Belt and suspenders — if git worktree remove failed, nuke directory
        if worktree_dir.exists():
            shutil.rmtree(worktree_dir, ignore_errors=True)

    # Prune stale worktree metadata
    _run_git(["worktree", "prune"], cwd=repo_root, check=False)

    # Delete the ephemeral branch
    _run_git(
        ["branch", "-D", branch_name],
        cwd=repo_root,
        check=False,  # Branch may already be gone
    )

    logger.info("Removed worktree: worker=%s", worker_id)


def list_worktrees(repo_root: Path) -> list[WorktreeInfo]:
    """List all active swarm worktrees.

    Only returns worktrees in the ``.worktrees/`` directory with branches
    matching the ``swarm/worker/`` prefix.
    """
    result = _run_git(
        ["worktree", "list", "--porcelain"],
        cwd=repo_root,
        check=False,
    )
    if result.returncode != 0:
        return []

    worktrees: list[WorktreeInfo] = []
    worktrees_prefix = str((repo_root / WORKTREES_DIR).resolve())

    current_path: str | None = None
    current_branch: str | None = None

    for line in result.stdout.splitlines():
        if line.startswith("worktree "):
            current_path = line[len("worktree "):]
            current_branch = None
        elif line.startswith("branch "):
            current_branch = line[len("branch refs/heads/"):]
        elif line == "":
            # End of block — emit if it's one of ours
            if (
                current_path
                and current_branch
                and current_branch.startswith(BRANCH_PREFIX)
                and current_path.startswith(worktrees_prefix)
            ):
                wid = current_branch[len(BRANCH_PREFIX):]
                worktrees.append(
                    WorktreeInfo(
                        worker_id=wid,
                        path=Path(current_path),
                        branch=current_branch,
                        base_ref="",  # Not tracked by git worktree list
                    )
                )
            current_path = None
            current_branch = None

    return worktrees


def cleanup_all_worktrees(repo_root: Path) -> int:
    """Remove ALL swarm worktrees. Returns count of removed worktrees."""
    active = list_worktrees(repo_root)
    for wt in active:
        remove_worktree(repo_root, wt.worker_id)
    return len(active)


# ---------------------------------------------------------------------------
# Merge gate — sequential merge with test validation
# ---------------------------------------------------------------------------


@dataclass
class MergeResult:
    """Outcome of a merge attempt."""

    success: bool
    worker_id: str
    branch: str
    conflict: bool = False
    test_failed: bool = False
    error: str = ""


def merge_worker(
    repo_root: Path,
    worker_id: str,
    *,
    target_branch: str = "main",
    test_command: str | None = None,
) -> MergeResult:
    """Merge a worker's branch into the target branch with optional test validation.

    Workflow:
      1. Checkout target branch
      2. Merge worker branch (--no-ff for auditability)
      3. If merge conflicts → abort, return failure
      4. If test_command → run tests → if fail, revert merge
      5. Clean up worker worktree + ephemeral branch

    Parameters
    ----------
    repo_root : Path
        Repository root (main worktree).
    worker_id : str
        Worker whose branch to merge.
    target_branch : str
        Branch to merge into (default: ``main``).
    test_command : str | None
        Shell command to run after merge. Merge is reverted if it exits non-zero.

    Returns
    -------
    MergeResult
        Outcome of the merge operation.
    """
    branch_name = f"{BRANCH_PREFIX}{worker_id}"

    # Record current HEAD so we can revert
    head_before = _run_git(
        ["rev-parse", "HEAD"], cwd=repo_root
    ).stdout.strip()

    # 1. Checkout target branch
    try:
        _run_git(["checkout", target_branch], cwd=repo_root)
    except subprocess.CalledProcessError as exc:
        return MergeResult(
            success=False,
            worker_id=worker_id,
            branch=branch_name,
            error=f"Failed to checkout {target_branch}: {exc.stderr}",
        )

    # 2. Attempt merge
    merge_result = _run_git(
        ["merge", "--no-ff", branch_name, "-m", f"Merge {worker_id} into {target_branch}"],
        cwd=repo_root,
        check=False,
    )

    if merge_result.returncode != 0:
        # Merge conflict — abort cleanly
        _run_git(["merge", "--abort"], cwd=repo_root, check=False)
        return MergeResult(
            success=False,
            worker_id=worker_id,
            branch=branch_name,
            conflict=True,
            error=merge_result.stderr or merge_result.stdout,
        )

    # 3. Run test validation gate if configured
    if test_command:
        logger.info("Running test gate: %s", test_command)
        try:
            test_result = subprocess.run(
                test_command,
                shell=True,
                cwd=str(repo_root),
                capture_output=True,
                text=True,
                timeout=300,
            )
        except subprocess.TimeoutExpired:
            # Tests timed out — revert
            _run_git(["reset", "--hard", head_before], cwd=repo_root)
            return MergeResult(
                success=False,
                worker_id=worker_id,
                branch=branch_name,
                test_failed=True,
                error="Test command timed out (300s)",
            )

        if test_result.returncode != 0:
            # Tests failed — revert the merge
            logger.warning(
                "Test gate failed for worker %s, reverting merge", worker_id
            )
            _run_git(["reset", "--hard", head_before], cwd=repo_root)
            return MergeResult(
                success=False,
                worker_id=worker_id,
                branch=branch_name,
                test_failed=True,
                error=f"Tests failed (exit {test_result.returncode}): "
                + (test_result.stderr or test_result.stdout)[:500],
            )

    # 4. Clean up worktree and branch
    remove_worktree(repo_root, worker_id)

    logger.info("Successfully merged worker %s into %s", worker_id, target_branch)

    return MergeResult(
        success=True,
        worker_id=worker_id,
        branch=branch_name,
    )
