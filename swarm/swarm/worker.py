"""Worker agent loop — single autonomous worker.

Implements the full cycle:
  1. Load agent personality from .agent.md
  2. Load auto-injected skills per enforcement map
  3. Build system prompt + task prompt
  4. Run the LLM tool-use loop
  5. Post structured completion to the board with files_changed metadata

Phase 2 additions:
  - run_worker_in_worktree: wraps run_worker with git worktree lifecycle
  - Claims integration: acquire file-path claims before starting
  - Auto-commit: commit changes in the worktree after completion
"""

from __future__ import annotations

import json
import logging
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .agents import build_system_prompt, load_agent
from .board import MessageBoard
from .claims import ClaimsRegistry
from .config import SwarmConfig
from .git import WorktreeInfo, create_worktree, remove_worktree
from .intelligence import suggest_model
from .llm import CompletionResult, agent_loop, create_client
from .skills import load_injected_skills

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Task representation
# ---------------------------------------------------------------------------


@dataclass
class Task:
    """A task pulled from the board's tasks channel."""

    post_id: int
    title: str
    body: str
    agent_role: str
    epic_id: str = ""
    task_id: str = ""
    skills: list[str] = field(default_factory=list)
    acceptance_criteria: str = ""
    metadata: dict[str, Any] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Worker loop
# ---------------------------------------------------------------------------


def run_worker(
    *,
    task: Task,
    config: SwarmConfig,
    board: MessageBoard,
    work_dir: Path,
    repo_root: Path,
    agents_dir: Path | None = None,
) -> CompletionResult:
    """Execute a single worker loop for one task.

    This is the synchronous, blocking version. Each call is one complete
    task lifecycle: load prompt → load skills → tool loop → post completion.

    Parameters
    ----------
    task : Task
        The task to execute.
    config : SwarmConfig
        Swarm configuration (providers, model routing, budgets).
    board : MessageBoard
        Message board for coordination.
    work_dir : Path
        Working directory (sandbox) for file operations.
    repo_root : Path
        Repository root for loading agents and skills.
    agents_dir : Path | None
        Directory containing .agent.md files. Defaults to ``repo_root / ".github/agents"``.
    """
    if agents_dir is None:
        agents_dir = repo_root / ".github" / "agents"

    agent_role = task.agent_role

    # 1. Load agent personality
    logger.info("Worker loading agent: %s", agent_role)
    agent = load_agent(agent_role, agents_dir)

    # 2. Load auto-injected skills
    logger.info("Worker loading skills for: %s", agent_role)
    skills_context = load_injected_skills(agent_role, repo_root)

    # Also load any task-specific skills
    for skill_path in task.skills:
        try:
            from .skills import load_skill_file
            content = load_skill_file(skill_path, repo_root)
            skills_context += f"\n\n---\n\n## Skill: {skill_path}\n\n{content}"
        except FileNotFoundError:
            logger.warning("Task skill not found: %s", skill_path)

    # 3. Build system prompt
    system_prompt = build_system_prompt(agent, extra_context=skills_context)

    # 4. Build task prompt
    task_prompt = _build_task_prompt(task)

    # 5. Create LLM client + intelligent model selection
    client = create_client(config.primary_provider)
    suggestion = suggest_model(board, agent_role, task_type="implementation")
    if suggestion is not None:
        deployment = suggestion.model
        logger.info(
            "Intelligence suggested model %s for %s: %s",
            deployment, agent_role, suggestion.reason,
        )
    else:
        deployment = config.model_routing.standard.deployment

    # 6. Run the tool-use loop
    logger.info(
        "Worker starting tool-use loop: agent=%s, model=%s, task=%s",
        agent_role, deployment, task.title,
    )
    result = agent_loop(
        client=client,
        deployment=deployment,
        system_prompt=system_prompt,
        user_message=task_prompt,
        work_dir=work_dir,
        board=board,
        agent_id=agent_role,
        repo_root=repo_root,
    )

    # 7. Detect changed files
    files_changed = _detect_changed_files(work_dir)

    # 8. Post structured completion to the board
    completion_metadata = {
        "task_id": task.task_id,
        "epic_id": task.epic_id,
        "files_changed": files_changed,
        "tokens_in": result.total_tokens_in,
        "tokens_out": result.total_tokens_out,
        "tool_calls": result.tool_calls_made,
        "duration_ms": result.duration_ms,
        "model_used": result.model_used,
    }

    board.post(
        channel="completions",
        agent_id=agent_role,
        body=result.content,
        title=f"{task.title} — complete",
        metadata=completion_metadata,
    )

    logger.info(
        "Worker completed: agent=%s, tools=%d, files=%d",
        agent_role,
        result.tool_calls_made,
        len(files_changed),
    )

    # 9. Record outcome for model routing intelligence
    board.record_outcome(
        epic_id=task.epic_id or "unknown",
        task_id=task.task_id or str(task.post_id),
        agent_role=agent_role,
        model_used=result.model_used,
        tokens_in=result.total_tokens_in,
        tokens_out=result.total_tokens_out,
        duration_ms=result.duration_ms,
        success=True,
        task_type="implementation",
        description=task.title,
    )

    return result


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _build_task_prompt(task: Task) -> str:
    """Assemble the user-facing task prompt from task fields."""
    parts = [f"## Task: {task.title}", "", task.body]

    if task.acceptance_criteria:
        parts.extend(["", "## Acceptance Criteria", "", task.acceptance_criteria])

    if task.skills:
        parts.extend(["", "## Required Skills", ""])
        for skill in task.skills:
            parts.append(f"- {skill}")

    return "\n".join(parts)


def _detect_changed_files(work_dir: Path) -> list[str]:
    """Detect files changed in the working directory via git status.

    Returns a list of relative file paths. If git is not available or the
    directory is not a git repo, returns an empty list.
    """
    try:
        result = subprocess.run(
            ["git", "status", "--porcelain"],
            cwd=str(work_dir),
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode != 0:
            return []

        files = []
        for line in result.stdout.strip().split("\n"):
            if line.strip():
                # Format: XY filename or XY -> filename
                parts = line[3:].strip().split(" -> ")
                files.append(parts[-1])
        return files
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return []


# ---------------------------------------------------------------------------
# Worktree-integrated worker (Phase 2)
# ---------------------------------------------------------------------------


@dataclass
class WorkerResult:
    """Result from a worktree-integrated worker run."""

    completion: CompletionResult
    worktree: WorktreeInfo
    files_changed: list[str]
    committed: bool = False
    commit_sha: str = ""


def run_worker_in_worktree(
    *,
    task: Task,
    config: SwarmConfig,
    board: MessageBoard,
    repo_root: Path,
    claims: ClaimsRegistry | None = None,
    claimed_paths: list[str] | None = None,
    base_ref: str = "origin/main",
    agents_dir: Path | None = None,
) -> WorkerResult:
    """Execute a worker in an isolated git worktree.

    This is the Phase 2 entry point. It:
      1. Creates a git worktree for the worker
      2. Optionally acquires file-path claims
      3. Runs the standard worker loop in the worktree
      4. Commits any changes in the worktree
      5. Returns results (worktree is NOT cleaned up — merge gate handles that)

    Parameters
    ----------
    task : Task
        The task to execute.
    config : SwarmConfig
        Swarm configuration.
    board : MessageBoard
        Message board for coordination.
    repo_root : Path
        Main repository root.
    claims : ClaimsRegistry | None
        If provided, the worker will attempt to claim paths before starting.
    claimed_paths : list[str] | None
        Paths to claim. Required if ``claims`` is provided.
    base_ref : str
        Git ref to create the worktree from.
    agents_dir : Path | None
        Directory containing .agent.md files.
    """
    worker_id = f"{task.agent_role}-{task.task_id or task.post_id}"

    # 1. Acquire claims if configured
    if claims is not None and claimed_paths:
        claim_result = claims.claim(worker_id, claimed_paths)
        if not claim_result.granted:
            raise RuntimeError(
                f"Claim rejected for {worker_id}: "
                f"{len(claim_result.conflicts)} conflict(s)"
            )

    # 2. Create worktree
    worktree = create_worktree(repo_root, worker_id, base_ref=base_ref)

    try:
        # 3. Run standard worker loop in the worktree
        result = run_worker(
            task=task,
            config=config,
            board=board,
            work_dir=worktree.path,
            repo_root=repo_root,
            agents_dir=agents_dir,
        )

        # 4. Detect and commit changes
        files_changed = _detect_changed_files(worktree.path)
        committed = False
        commit_sha = ""

        if files_changed:
            committed, commit_sha = _commit_worktree_changes(
                worktree.path, worker_id, task.title
            )

        return WorkerResult(
            completion=result,
            worktree=worktree,
            files_changed=files_changed,
            committed=committed,
            commit_sha=commit_sha,
        )

    except Exception:
        # On failure, clean up the worktree and release claims
        remove_worktree(repo_root, worker_id)
        if claims is not None:
            claims.release(worker_id)
        raise


def _commit_worktree_changes(
    worktree_path: Path, worker_id: str, task_title: str
) -> tuple[bool, str]:
    """Stage and commit all changes in a worktree.

    Returns (committed: bool, commit_sha: str).
    """
    try:
        subprocess.run(
            ["git", "add", "-A"],
            cwd=str(worktree_path),
            check=True,
            capture_output=True,
            timeout=30,
        )
        subprocess.run(
            ["git", "commit", "-m", f"{worker_id}: {task_title}"],
            cwd=str(worktree_path),
            check=True,
            capture_output=True,
            timeout=30,
        )
        sha_result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=str(worktree_path),
            capture_output=True,
            text=True,
            timeout=10,
        )
        return True, sha_result.stdout.strip()
    except subprocess.CalledProcessError:
        logger.warning("Failed to commit changes in worktree %s", worker_id)
        return False, ""
