"""BacklogMD file watcher.

Monitors the backlog/tasks/ directory for file changes. When a task file
is modified and its status changes to "In Progress", triggers ADO story
creation.

This is the PRIMARY trigger -- fired when Beth starts work on a task via:
    backlog task edit BETH-X -s "In Progress"

Uses watchfiles for efficient filesystem watching.
"""

import asyncio
import logging
from pathlib import Path
from typing import Callable, Awaitable, Optional

from watchfiles import awatch, Change

from .backlog_parser import parse_task_file
from .models import BacklogTask

logger = logging.getLogger(__name__)

# Cache of last-seen task status (by file path) for change detection
_task_cache: dict[str, str] = {}


async def watch_backlog_tasks(
    tasks_dir: str,
    on_task_started: Callable[[BacklogTask], Awaitable[None]],
    on_task_completed: Optional[Callable[[BacklogTask], Awaitable[None]]] = None,
):
    """Watch the BacklogMD tasks directory for status changes.

    Args:
        tasks_dir: Path to the backlog/tasks/ directory
        on_task_started: Callback when a task moves to "In Progress"
        on_task_completed: Optional callback when a task moves to "Done"
    """
    tasks_path = Path(tasks_dir)

    if not tasks_path.exists():
        logger.warning(f"Tasks directory does not exist: {tasks_dir}")
        logger.info("Waiting for directory to be created...")
        while not tasks_path.exists():
            await asyncio.sleep(5)

    logger.info(f"Watching BacklogMD tasks at: {tasks_path.absolute()}")

    # Prime the cache with current task states
    await _prime_cache(tasks_path)

    async for changes in awatch(tasks_path):
        for change_type, change_path in changes:
            path = Path(change_path)

            # Only watch .md files
            if not path.suffix == ".md":
                continue

            # Only care about modifications (not deletes)
            if change_type == Change.deleted:
                _task_cache.pop(str(path), None)
                continue

            logger.debug(f"File changed: {change_type.name} {path.name}")

            try:
                task = parse_task_file(path)
                if not task:
                    continue

                old_status = _get_cached_status(str(path))
                new_status = task.status

                # Update cache
                _task_cache[str(path)] = task.status

                if old_status == new_status:
                    continue

                logger.info(
                    f"Task {task.task_id} status changed: "
                    f"{old_status or '(new)'} -> {new_status}"
                )

                # Task started -- create ADO story
                if new_status.lower() == "in progress":
                    logger.info(
                        f"Task {task.task_id} started! "
                        f"Creating ADO user story..."
                    )
                    await on_task_started(task)

                # Task completed -- resolve ADO story
                elif new_status.lower() == "done" and on_task_completed:
                    logger.info(
                        f"Task {task.task_id} completed! "
                        f"Resolving ADO user story..."
                    )
                    await on_task_completed(task)

            except Exception as e:
                logger.error(f"Error processing {path.name}: {e}", exc_info=True)


async def _prime_cache(tasks_path: Path):
    """Load current task states into cache on startup."""
    errors = 0
    for md_file in tasks_path.glob("*.md"):
        try:
            task = parse_task_file(md_file)
            if task:
                _task_cache[str(md_file)] = task.status
                logger.debug(f"Cached: {task.task_id} = {task.status}")
        except Exception as e:
            errors += 1
            logger.warning(f"Failed to parse {md_file.name}: {e}", exc_info=True)

    logger.info(f"Primed cache with {len(_task_cache)} existing tasks ({errors} parse errors)")


def _get_cached_status(path_key: str) -> Optional[str]:
    """Get the previously cached status for a task file."""
    return _task_cache.get(path_key)
