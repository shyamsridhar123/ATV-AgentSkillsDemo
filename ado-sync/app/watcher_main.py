"""Standalone watcher entrypoint for ADO Sync.

Runs ONLY the backlog file watcher — no FastAPI, no HTTP server, no open ports.
This is what the CLI starts via `npx beth-copilot ado-sync start`.

Config resolution is handled by config.py. See config.py for precedence docs.
"""

import argparse
import asyncio
import logging
import signal
import sys
from typing import Optional

from .backlog_watcher import watch_backlog_tasks
from .config import Settings, load_config, build_settings, resolve_config_path
from .ado_client import ADOClient
from .story_formatter import format_story, format_story_offline
from .models import BacklogTask

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

def configure_logging(level: str = "INFO") -> None:
    """Configure logging to stdout."""
    numeric_level = getattr(logging, level.upper(), logging.INFO)
    logging.basicConfig(
        level=numeric_level,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        stream=sys.stdout,
        force=True,
    )
    logging.getLogger().setLevel(numeric_level)


# ---------------------------------------------------------------------------
# Signal handling
# ---------------------------------------------------------------------------

def setup_signal_handlers(shutdown_event: asyncio.Event) -> None:
    """Register SIGTERM/SIGINT handlers that set the shutdown event."""

    def _handle_signal(signum, frame):
        logger.info(f"Received signal {signum}, shutting down...")
        shutdown_event.set()

    signal.signal(signal.SIGTERM, _handle_signal)
    signal.signal(signal.SIGINT, _handle_signal)


# ---------------------------------------------------------------------------
# Watcher callbacks
# ---------------------------------------------------------------------------

async def _handle_task_started(task: BacklogTask, ado_client: ADOClient, settings: Settings) -> None:
    """Called when a BacklogMD task moves to 'In Progress'."""
    try:
        try:
            # Run potentially blocking Azure OpenAI call in a worker thread
            # to avoid blocking the asyncio event loop used by the watcher.
            story = await asyncio.to_thread(format_story, task, settings)
        except Exception as e:
            logger.warning(f"Azure OpenAI unavailable, using offline formatter: {e}")
            story = await asyncio.to_thread(format_story_offline, task)

        result = await ado_client.create_user_story(story)
        logger.info(
            f"ADO Story created for {task.task_id}: "
            f"#{result.work_item_id} '{result.title}' -> {result.url}"
        )
    except Exception as e:
        logger.error(f"Failed to create ADO story for {task.task_id}: {e}", exc_info=True)


async def _handle_task_completed(task: BacklogTask, ado_client: ADOClient) -> None:
    """Called when a BacklogMD task moves to 'Done'."""
    mapping = ado_client.get_mapping(task.task_id)
    if not mapping:
        logger.info(f"No ADO story found for completed task {task.task_id}")
        return
    if mapping.pr_linked:
        logger.info(f"Story #{mapping.work_item_id} already resolved via PR")
        return
    try:
        await ado_client.resolve_story(mapping.work_item_id)
        logger.info(f"Resolved ADO Story #{mapping.work_item_id} (task completed)")
    except Exception as e:
        logger.error(f"Failed to resolve story: {e}", exc_info=True)


# ---------------------------------------------------------------------------
# Main entrypoint
# ---------------------------------------------------------------------------

async def run_watcher(config_path: Optional[str] = None) -> None:
    """Run the backlog watcher (no HTTP server)."""
    config = load_config(config_path)
    settings = build_settings(config)

    configure_logging(level=config.get("logLevel", settings.log_level))

    logger.info("ADO Sync watcher starting (standalone mode — no HTTP server)")
    logger.info(f"  ADO: {settings.ado_organization}/{settings.ado_project}")
    logger.info(f"  Watching: {settings.backlog_tasks_dir}")

    ado_client = ADOClient(settings)
    shutdown_event = asyncio.Event()
    setup_signal_handlers(shutdown_event)

    try:
        watcher_task = asyncio.create_task(
            watch_backlog_tasks(
                tasks_dir=settings.backlog_tasks_dir,
                on_task_started=lambda t: _handle_task_started(t, ado_client, settings),
                on_task_completed=lambda t: _handle_task_completed(t, ado_client),
            )
        )

        # Wait for shutdown signal or watcher completion
        done, pending = await asyncio.wait(
            [watcher_task, asyncio.create_task(shutdown_event.wait())],
            return_when=asyncio.FIRST_COMPLETED,
        )

        # Propagate watcher exceptions (don't silently swallow them)
        for completed_task in done:
            if completed_task is not watcher_task:
                continue
            exc = completed_task.exception()
            if exc and not isinstance(exc, asyncio.CancelledError):
                logger.error(f"Watcher crashed: {exc}", exc_info=exc)

        # Cancel remaining tasks
        for task in pending:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

    except asyncio.CancelledError:
        logger.info("Watcher cancelled")
    finally:
        await ado_client.close()
        logger.info("ADO Sync watcher stopped")


def main() -> None:
    """CLI entrypoint — parse args and run the watcher."""
    parser = argparse.ArgumentParser(description="ADO Sync standalone watcher")
    parser.add_argument(
        "--config",
        type=str,
        default=None,
        help="Path to .beth/ado-sync.json config file",
    )
    args = parser.parse_args()

    asyncio.run(run_watcher(config_path=args.config))


if __name__ == "__main__":
    main()
