"""Worker agent loop — single autonomous worker.

Implements the full cycle:
  1. Load agent personality from .agent.md
  2. Load auto-injected skills per enforcement map
  3. Build system prompt + task prompt
  4. Run the LLM tool-use loop
  5. Post structured completion to the board with files_changed metadata
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
from .config import SwarmConfig
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

    # 5. Create LLM client
    client = create_client(config.primary_provider)
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
