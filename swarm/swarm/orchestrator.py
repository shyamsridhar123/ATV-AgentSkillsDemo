"""Orchestrator — Beth's persistent daemon loop.

Implements the full orchestration lifecycle:
  1. Epic decomposition: LLM-driven breakdown of features into subtasks
  2. Dependency-aware dispatch: only unblocked tasks go to idle workers
  3. Worker lifecycle: heartbeat monitoring, stuck detection, reassignment
  4. Merge sequencing: merge completed work in dependency order
  5. Backlog.md auto-update: close tasks when all work is done

The orchestrator runs as an async poll loop, reading the message board
for completions, blockers, and heartbeats each tick.
"""

from __future__ import annotations

import asyncio
import json
import logging
import subprocess
import time
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any

from .board import MessageBoard
from .claims import ClaimsRegistry
from .config import SwarmConfig
from .git import MergeResult, cleanup_all_worktrees, merge_worker, remove_worktree
from .intelligence import BudgetExceeded, CostTracker
from .llm import CompletionResult, agent_loop, create_client
from .worker import Task, WorkerResult, run_worker_in_worktree

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Task state machine
# ---------------------------------------------------------------------------


class TaskStatus(str, Enum):
    """Lifecycle states for a subtask."""

    PENDING = "pending"  # Waiting for dependencies
    READY = "ready"  # All deps satisfied, can be dispatched
    RUNNING = "running"  # Worker executing
    COMPLETED = "completed"  # Worker done, awaiting merge
    MERGED = "merged"  # Branch merged into epic
    FAILED = "failed"  # Worker failed or stuck
    BLOCKED = "blocked"  # Worker reported blocker


# ---------------------------------------------------------------------------
# TaskNode — subtask with dependencies
# ---------------------------------------------------------------------------


@dataclass
class TaskNode:
    """A subtask within an epic, with dependency tracking."""

    id: str
    title: str
    body: str
    agent_role: str
    dependencies: list[str] = field(default_factory=list)
    skills: list[str] = field(default_factory=list)
    acceptance_criteria: str = ""
    claimed_paths: list[str] = field(default_factory=list)
    status: TaskStatus = TaskStatus.PENDING
    worker_id: str = ""
    post_id: int = 0
    completion_post_id: int = 0
    merge_result: MergeResult | None = None
    last_heartbeat: float = 0.0
    dispatch_time: float = 0.0


# ---------------------------------------------------------------------------
# EpicState — full epic tracking
# ---------------------------------------------------------------------------


@dataclass
class EpicState:
    """Tracks the full state of an epic decomposition."""

    epic_id: str
    title: str
    original_request: str
    tasks: dict[str, TaskNode] = field(default_factory=dict)
    epic_branch: str = ""
    created_at: float = field(default_factory=time.time)
    completed_at: float = 0.0

    @property
    def all_merged(self) -> bool:
        """True if every task has been successfully merged."""
        return all(t.status == TaskStatus.MERGED for t in self.tasks.values())

    @property
    def has_failures(self) -> bool:
        """True if any task has permanently failed."""
        return any(t.status == TaskStatus.FAILED for t in self.tasks.values())

    @property
    def active_count(self) -> int:
        """Number of tasks currently being worked on."""
        return sum(
            1 for t in self.tasks.values() if t.status == TaskStatus.RUNNING
        )


# ---------------------------------------------------------------------------
# Dependency graph helpers
# ---------------------------------------------------------------------------


def get_ready_tasks(epic: EpicState) -> list[TaskNode]:
    """Return tasks whose dependencies are all satisfied and are ready to dispatch.

    A task is ready when:
      - Its status is PENDING
      - ALL of its dependencies are in MERGED status
    """
    ready = []
    for task in epic.tasks.values():
        if task.status != TaskStatus.PENDING:
            continue
        deps_met = all(
            epic.tasks[dep_id].status == TaskStatus.MERGED
            for dep_id in task.dependencies
            if dep_id in epic.tasks
        )
        if deps_met:
            ready.append(task)
    return ready


def get_completed_tasks(epic: EpicState) -> list[TaskNode]:
    """Return tasks that are completed and ready to merge."""
    return [
        t for t in epic.tasks.values() if t.status == TaskStatus.COMPLETED
    ]


def get_mergeable_tasks(epic: EpicState) -> list[TaskNode]:
    """Return completed tasks whose dependencies are all merged.

    Merges must happen in dependency order — a task can only be merged
    after all its dependencies have been merged.
    """
    mergeable = []
    for task in epic.tasks.values():
        if task.status != TaskStatus.COMPLETED:
            continue
        deps_merged = all(
            epic.tasks[dep_id].status == TaskStatus.MERGED
            for dep_id in task.dependencies
            if dep_id in epic.tasks
        )
        if deps_merged:
            mergeable.append(task)
    return mergeable


def topological_order(epic: EpicState) -> list[str]:
    """Return task IDs in topological (dependency) order.

    Uses Kahn's algorithm. Raises ValueError on cycles.
    """
    in_degree: dict[str, int] = {tid: 0 for tid in epic.tasks}
    for task in epic.tasks.values():
        for dep in task.dependencies:
            if dep in in_degree:
                in_degree[task.id] += 1

    queue = [tid for tid, deg in in_degree.items() if deg == 0]
    order: list[str] = []

    while queue:
        tid = queue.pop(0)
        order.append(tid)
        for task in epic.tasks.values():
            if tid in task.dependencies:
                in_degree[task.id] -= 1
                if in_degree[task.id] == 0:
                    queue.append(task.id)

    if len(order) != len(epic.tasks):
        raise ValueError("Dependency cycle detected in epic tasks")

    return order


# ---------------------------------------------------------------------------
# Epic decomposition — LLM-driven
# ---------------------------------------------------------------------------

_DECOMPOSITION_SYSTEM_PROMPT = """\
You are Beth, an expert software engineering orchestrator. Your job is to \
decompose a feature request into concrete subtasks that can be executed by \
specialist agents working in parallel where possible.

Each subtask must specify:
- id: A short lowercase identifier (e.g., "impl-auth", "test-auth", "review-auth")
- title: A clear one-line description
- body: Detailed instructions for the worker agent
- agent_role: One of: developer, tester, security-reviewer, ux-designer, product-manager, researcher
- dependencies: List of task IDs this task depends on (empty if none)
- skills: List of skill paths to load (e.g., ".github/skills/vercel-react-best-practices/SKILL.md")
- acceptance_criteria: What "done" looks like
- claimed_paths: File paths this task will modify (for conflict prevention)

Rules:
1. Maximize parallelism — only add dependencies where truly required
2. Always include at least one test task
3. Security-sensitive features must include a security review task
4. Each task must be completable by a single agent in one session
5. Use specific file paths in claimed_paths to prevent conflicts

Respond with a JSON array of task objects. No markdown wrapping, just the JSON.
"""


def parse_decomposition(raw_json: str) -> list[TaskNode]:
    """Parse LLM decomposition output into TaskNode objects.

    Handles both raw JSON arrays and markdown-wrapped JSON.
    """
    # Strip markdown code fences if present
    cleaned = raw_json.strip()
    if cleaned.startswith("```"):
        # Remove first line (```json or ```) and last line (```)
        lines = cleaned.split("\n")
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        cleaned = "\n".join(lines)

    tasks_data = json.loads(cleaned)
    if not isinstance(tasks_data, list):
        raise ValueError("Decomposition must be a JSON array of tasks")

    nodes: list[TaskNode] = []
    for item in tasks_data:
        node = TaskNode(
            id=item["id"],
            title=item["title"],
            body=item.get("body", ""),
            agent_role=item["agent_role"],
            dependencies=item.get("dependencies", []),
            skills=item.get("skills", []),
            acceptance_criteria=item.get("acceptance_criteria", ""),
            claimed_paths=item.get("claimed_paths", []),
        )
        nodes.append(node)

    return nodes


def decompose_epic(
    request: str,
    config: SwarmConfig,
    *,
    model: str | None = None,
) -> list[TaskNode]:
    """Use LLM to decompose a feature request into subtasks.

    Parameters
    ----------
    request : str
        The user's feature request.
    config : SwarmConfig
        Configuration (for provider and model).
    model : str | None
        Override model deployment. Defaults to complex tier.

    Returns
    -------
    list[TaskNode]
        Decomposed subtasks with dependencies.
    """
    client = create_client(config.primary_provider)
    deployment = model or config.model_routing.complex.deployment

    response = client.chat.completions.create(
        model=deployment,
        messages=[
            {"role": "system", "content": _DECOMPOSITION_SYSTEM_PROMPT},
            {"role": "user", "content": request},
        ],
        max_tokens=4096,
        temperature=0.2,  # Low temperature for structured output
    )

    raw = response.choices[0].message.content or "[]"
    return parse_decomposition(raw)


# ---------------------------------------------------------------------------
# Heartbeat monitoring
# ---------------------------------------------------------------------------


def check_heartbeats(
    epic: EpicState,
    board: MessageBoard,
    config: SwarmConfig,
    reader_id: str = "orchestrator",
) -> list[TaskNode]:
    """Check for stuck workers based on heartbeat timestamps.

    Reads new heartbeat posts and updates task last_heartbeat times.
    Returns a list of tasks whose workers are stuck (no heartbeat for
    longer than ``heartbeat_interval * heartbeat_timeout_multiplier``).
    """
    # Read new heartbeats
    heartbeats = board.read_new("heartbeats", reader_id)
    for hb in heartbeats:
        meta = hb.metadata or {}
        worker_id = meta.get("worker_id", hb.agent_id)
        # Find the task this worker is running
        for task in epic.tasks.values():
            if task.worker_id == worker_id and task.status == TaskStatus.RUNNING:
                task.last_heartbeat = time.time()
                break

    # Check for stuck workers
    timeout = (
        config.heartbeat_interval_seconds * config.heartbeat_timeout_multiplier
    )
    now = time.time()
    stuck: list[TaskNode] = []

    for task in epic.tasks.values():
        if task.status != TaskStatus.RUNNING:
            continue
        if task.last_heartbeat == 0.0:
            # Use dispatch time as initial heartbeat
            effective_hb = task.dispatch_time
        else:
            effective_hb = task.last_heartbeat

        if effective_hb > 0 and (now - effective_hb) > timeout:
            stuck.append(task)

    return stuck


# ---------------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------------


def dispatch_task(
    task: TaskNode,
    epic: EpicState,
    config: SwarmConfig,
    board: MessageBoard,
) -> int:
    """Post a task to the board's tasks channel for a worker to pick up.

    Returns the post ID.
    """
    metadata = {
        "epic_id": epic.epic_id,
        "task_id": task.id,
        "agent_role": task.agent_role,
        "dependencies": task.dependencies,
        "skills": task.skills,
        "claimed_paths": task.claimed_paths,
    }

    post_id = board.post(
        channel="tasks",
        agent_id="beth",
        body=task.body,
        title=task.title,
        metadata=metadata,
    )

    task.status = TaskStatus.RUNNING
    task.post_id = post_id
    task.dispatch_time = time.time()
    task.last_heartbeat = time.time()

    logger.info(
        "Dispatched task %s (%s) to %s — post_id=%d",
        task.id, task.title, task.agent_role, post_id,
    )

    return post_id


# ---------------------------------------------------------------------------
# Completion handling
# ---------------------------------------------------------------------------


def handle_completions(
    epic: EpicState,
    board: MessageBoard,
    reader_id: str = "orchestrator",
) -> list[TaskNode]:
    """Read new completions from the board and update task states.

    Returns a list of tasks that just completed.
    """
    completions = board.read_new("completions", reader_id)
    newly_completed: list[TaskNode] = []

    for post in completions:
        meta = post.metadata or {}
        task_id = meta.get("task_id", "")

        if task_id and task_id in epic.tasks:
            task = epic.tasks[task_id]
            if task.status == TaskStatus.RUNNING:
                task.status = TaskStatus.COMPLETED
                task.completion_post_id = post.id
                newly_completed.append(task)
                logger.info("Task %s completed by %s", task_id, post.agent_id)

    return newly_completed


# ---------------------------------------------------------------------------
# Blocker handling
# ---------------------------------------------------------------------------


def handle_blockers(
    epic: EpicState,
    board: MessageBoard,
    reader_id: str = "orchestrator",
) -> list[TaskNode]:
    """Read blocker posts and mark tasks as blocked.

    Returns a list of tasks that were just blocked.
    """
    blockers = board.read_new("blockers", reader_id)
    newly_blocked: list[TaskNode] = []

    for post in blockers:
        meta = post.metadata or {}
        task_id = meta.get("task_id", "")

        if task_id and task_id in epic.tasks:
            task = epic.tasks[task_id]
            if task.status == TaskStatus.RUNNING:
                task.status = TaskStatus.BLOCKED
                newly_blocked.append(task)
                logger.warning(
                    "Task %s blocked: %s", task_id, post.body[:200]
                )

    return newly_blocked


# ---------------------------------------------------------------------------
# Merge sequencing
# ---------------------------------------------------------------------------


def merge_completed_tasks(
    epic: EpicState,
    board: MessageBoard,
    repo_root: Path,
    config: SwarmConfig,
) -> list[MergeResult]:
    """Merge completed tasks in dependency order.

    Only merges tasks whose dependencies are already merged.
    Runs the test command after each merge; reverts on failure.

    Returns a list of MergeResult objects.
    """
    mergeable = get_mergeable_tasks(epic)
    results: list[MergeResult] = []

    # Sort by topological order so lower-dependency tasks merge first
    topo = topological_order(epic)
    topo_index = {tid: i for i, tid in enumerate(topo)}
    mergeable.sort(key=lambda t: topo_index.get(t.id, 999))

    target_branch = epic.epic_branch or "main"

    for task in mergeable:
        worker_id = task.worker_id or f"{task.agent_role}-{task.id}"

        result = merge_worker(
            repo_root,
            worker_id,
            target_branch=target_branch,
            test_command=config.test_command,
        )

        results.append(result)

        if result.success:
            task.status = TaskStatus.MERGED
            task.merge_result = result
            logger.info("Merged task %s (worker %s)", task.id, worker_id)

            # Clean up worktree
            remove_worktree(repo_root, worker_id)
        else:
            task.status = TaskStatus.FAILED
            task.merge_result = result
            logger.error(
                "Merge failed for task %s: conflict=%s test_failed=%s error=%s",
                task.id, result.conflict, result.test_failed, result.error,
            )

    return results


# ---------------------------------------------------------------------------
# Backlog.md auto-update
# ---------------------------------------------------------------------------


def update_backlog(
    epic: EpicState,
    repo_root: Path,
) -> bool:
    """Run backlog CLI to mark the epic as done.

    Returns True if the command succeeded.
    """
    cmd = [
        "backlog", "task", "edit", epic.epic_id,
        "-s", "Done", "--plain",
    ]
    try:
        result = subprocess.run(
            cmd,
            cwd=str(repo_root),
            capture_output=True,
            text=True,
            timeout=30,
        )
        if result.returncode == 0:
            logger.info("Backlog updated: %s → Done", epic.epic_id)
            return True
        else:
            logger.warning(
                "Backlog update failed: %s — %s",
                epic.epic_id, result.stderr,
            )
            return False
    except (subprocess.TimeoutExpired, FileNotFoundError) as exc:
        logger.warning("Backlog update error: %s — %s", epic.epic_id, exc)
        return False


# ---------------------------------------------------------------------------
# Orchestrator — the main loop
# ---------------------------------------------------------------------------


class Orchestrator:
    """Beth's persistent orchestration loop.

    Manages the lifecycle of epics: decomposition, dispatch, monitoring,
    merging, and completion.
    """

    def __init__(
        self,
        config: SwarmConfig,
        board: MessageBoard,
        repo_root: Path,
        claims: ClaimsRegistry | None = None,
        cost_tracker: CostTracker | None = None,
    ) -> None:
        self.config = config
        self.board = board
        self.repo_root = repo_root
        self.claims = claims or ClaimsRegistry(board)
        self.cost_tracker = cost_tracker or CostTracker(config=config)
        self.epics: dict[str, EpicState] = {}
        self._running = False
        self._reader_id = "orchestrator"

    def submit_epic(
        self,
        epic_id: str,
        title: str,
        request: str,
        *,
        tasks: list[TaskNode] | None = None,
        epic_branch: str = "",
    ) -> EpicState:
        """Submit a new epic for orchestration.

        If ``tasks`` is None, the orchestrator will decompose the request
        using the LLM. If provided, those tasks are used directly (useful
        for testing without LLM).

        Parameters
        ----------
        epic_id : str
            Unique identifier for the epic.
        title : str
            Human-readable title.
        request : str
            The original feature request.
        tasks : list[TaskNode] | None
            Pre-decomposed tasks (skips LLM decomposition).
        epic_branch : str
            Branch to merge work into.
        """
        if tasks is None:
            task_list = decompose_epic(request, self.config)
        else:
            task_list = tasks

        epic = EpicState(
            epic_id=epic_id,
            title=title,
            original_request=request,
            tasks={t.id: t for t in task_list},
            epic_branch=epic_branch or "main",
        )

        self.epics[epic_id] = epic

        # Post epic announcement to the board
        self.board.post(
            channel="tasks",
            agent_id="beth",
            title=f"Epic: {title}",
            body=request,
            metadata={
                "epic_id": epic_id,
                "task_count": len(task_list),
                "task_ids": [t.id for t in task_list],
            },
        )

        logger.info(
            "Epic submitted: %s — %d tasks", epic_id, len(task_list)
        )

        return epic

    def tick(self) -> dict[str, Any]:
        """Run one iteration of the orchestration loop.

        Returns a summary dict of what happened this tick.
        """
        summary: dict[str, Any] = {
            "completions": [],
            "blockers": [],
            "merges": [],
            "dispatched": [],
            "stuck": [],
            "epics_closed": [],
            "budget_paused": [],
            "killed": False,
        }

        # Check daily kill switch first
        if self.cost_tracker.is_killed():
            summary["killed"] = True
            logger.warning("Daily kill switch active — skipping tick")
            return summary

        for epic_id, epic in list(self.epics.items()):
            # 1. Handle completions + record costs
            completed = handle_completions(epic, self.board, self._reader_id)
            for t in completed:
                # Record cost from completion metadata
                comp_post = self.board.get_post(t.completion_post_id)
                if comp_post and comp_post.metadata:
                    meta = comp_post.metadata
                    try:
                        self.cost_tracker.record_usage(
                            task_id=t.id,
                            epic_id=epic_id,
                            model=meta.get("model_used", "gpt-4o-mini"),
                            tokens_in=meta.get("tokens_in", 0),
                            tokens_out=meta.get("tokens_out", 0),
                        )
                    except BudgetExceeded:
                        logger.warning("Task %s exceeded budget (post-completion)", t.id)
            summary["completions"].extend(
                {"epic": epic_id, "task": t.id} for t in completed
            )

            # 2. Handle blockers
            blocked = handle_blockers(epic, self.board, self._reader_id)
            summary["blockers"].extend(
                {"epic": epic_id, "task": t.id} for t in blocked
            )

            # 3. Merge completed work in dependency order
            merge_results = merge_completed_tasks(
                epic, self.board, self.repo_root, self.config,
            )
            summary["merges"].extend(
                {
                    "epic": epic_id,
                    "worker": r.worker_id,
                    "success": r.success,
                }
                for r in merge_results
            )

            # 4. Check epic budget before dispatching
            if self.cost_tracker.is_epic_paused(epic_id):
                summary["budget_paused"].append(epic_id)
                logger.info("Epic %s paused — budget exceeded, skipping dispatch", epic_id)
            else:
                # Dispatch ready tasks
                ready = get_ready_tasks(epic)
                for task in ready:
                    post_id = dispatch_task(task, epic, self.config, self.board)
                    summary["dispatched"].append(
                        {"epic": epic_id, "task": task.id, "post_id": post_id}
                    )

            # 5. Check heartbeats
            stuck = check_heartbeats(
                epic, self.board, self.config, self._reader_id,
            )
            for task in stuck:
                task.status = TaskStatus.FAILED
                logger.warning(
                    "Worker stuck — marking task %s as failed", task.id
                )
            summary["stuck"].extend(
                {"epic": epic_id, "task": t.id} for t in stuck
            )

            # 6. Check if epic is done
            if epic.all_merged:
                epic.completed_at = time.time()
                update_backlog(epic, self.repo_root)
                summary["epics_closed"].append(epic_id)
                logger.info("Epic %s complete — all tasks merged", epic_id)

        return summary

    async def run(self, max_ticks: int = 0) -> None:
        """Run the orchestration loop.

        Parameters
        ----------
        max_ticks : int
            If > 0, stop after this many ticks (for testing).
            If 0, run forever until stopped.
        """
        self._running = True
        tick_count = 0

        logger.info("Orchestrator starting — poll_interval=%.1fs", self.config.poll_interval_seconds)

        while self._running:
            tick_count += 1

            try:
                summary = self.tick()
                if any(summary[k] for k in summary):
                    logger.debug("Tick %d summary: %s", tick_count, summary)
            except Exception:
                logger.exception("Error in orchestrator tick %d", tick_count)

            if max_ticks and tick_count >= max_ticks:
                break

            await asyncio.sleep(self.config.poll_interval_seconds)

        logger.info("Orchestrator stopped after %d ticks", tick_count)

    def stop(self) -> None:
        """Signal the orchestrator to stop after the current tick."""
        self._running = False
        logger.info("Orchestrator stop requested")


# ---------------------------------------------------------------------------
# tmux session management
# ---------------------------------------------------------------------------


def start_daemon(
    config_path: str | Path,
    repo_root: str | Path,
    session_name: str = "beth-swarm",
) -> bool:
    """Launch the orchestrator in a named tmux session.

    Returns True if the session was created successfully.
    """
    # Check if tmux is available
    try:
        subprocess.run(
            ["tmux", "-V"], capture_output=True, check=True, timeout=5,
        )
    except (FileNotFoundError, subprocess.CalledProcessError):
        logger.error("tmux not found — install tmux to run as daemon")
        return False

    # Check if session already exists
    check = subprocess.run(
        ["tmux", "has-session", "-t", session_name],
        capture_output=True,
        timeout=5,
    )
    if check.returncode == 0:
        logger.warning("tmux session '%s' already exists", session_name)
        return False

    # Build the command to run inside tmux
    cmd = (
        f"cd {repo_root} && python -m swarm.main run "
        f"--config {config_path}"
    )

    # Create detached tmux session
    result = subprocess.run(
        ["tmux", "new-session", "-d", "-s", session_name, cmd],
        capture_output=True,
        text=True,
        timeout=10,
    )

    if result.returncode == 0:
        logger.info("Daemon started in tmux session '%s'", session_name)
        return True
    else:
        logger.error("Failed to start daemon: %s", result.stderr)
        return False


def stop_daemon(session_name: str = "beth-swarm") -> bool:
    """Send a graceful stop signal to the daemon's tmux session.

    Returns True if the signal was sent.
    """
    result = subprocess.run(
        ["tmux", "send-keys", "-t", session_name, "C-c", ""],
        capture_output=True,
        timeout=5,
    )
    if result.returncode == 0:
        logger.info("Stop signal sent to '%s'", session_name)
        return True
    else:
        logger.warning("Failed to signal '%s': %s", session_name, result.stderr)
        return False


def attach_daemon(session_name: str = "beth-swarm") -> bool:
    """Check if a daemon tmux session exists and is attachable.

    Returns True if the session exists. Callers should run:
        subprocess.run(["tmux", "attach-session", "-t", session_name])
    to actually attach (this blocks the terminal).
    """
    result = subprocess.run(
        ["tmux", "has-session", "-t", session_name],
        capture_output=True,
        timeout=5,
    )
    return result.returncode == 0


def daemon_status(session_name: str = "beth-swarm") -> dict[str, Any]:
    """Get status information about the daemon session.

    Returns a dict with session info or an error.
    """
    check = subprocess.run(
        ["tmux", "has-session", "-t", session_name],
        capture_output=True,
        timeout=5,
    )
    if check.returncode != 0:
        return {"running": False, "session": session_name}

    # Get session details
    info = subprocess.run(
        ["tmux", "display-message", "-t", session_name, "-p",
         "#{session_created} #{session_windows} #{session_attached}"],
        capture_output=True,
        text=True,
        timeout=5,
    )

    return {
        "running": True,
        "session": session_name,
        "details": info.stdout.strip() if info.returncode == 0 else "",
    }
