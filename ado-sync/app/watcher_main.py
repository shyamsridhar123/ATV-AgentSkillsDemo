"""Standalone watcher entrypoint for ADO Sync.

Runs ONLY the backlog file watcher — no FastAPI, no HTTP server, no open ports.
This is what the CLI starts via `npx beth-copilot ado-sync start`.

Config resolution order:
  1. --config flag (explicit path to .beth/ado-sync.json)
  2. PROJECT_ROOT env var → PROJECT_ROOT/.beth/ado-sync.json
  3. .env file in cwd (legacy fallback)
"""

import argparse
import asyncio
import json
import logging
import os
import signal
import sys
from pathlib import Path
from typing import Optional

from dotenv import dotenv_values

from .backlog_watcher import watch_backlog_tasks
from .config import Settings
from .ado_client import ADOClient
from .story_formatter import format_story, format_story_offline
from .models import BacklogTask

logger = logging.getLogger(__name__)

_CONFIG_FILENAME = ".beth/ado-sync.json"


# ---------------------------------------------------------------------------
# Config resolution
# ---------------------------------------------------------------------------

def resolve_config_path(config_path: Optional[str] = None) -> Optional[str]:
    """Resolve the config file path using the priority chain.

    1. Explicit config_path argument (from --config flag)
    2. PROJECT_ROOT env var → PROJECT_ROOT/.beth/ado-sync.json
    3. None (caller should fall back to .env)

    When PROJECT_ROOT is set, its .beth/ado-sync.json is authoritative —
    if the file is missing, we return the expected path so load_config()
    can surface a clear error rather than silently falling back to .env.
    """
    if config_path:
        return config_path

    project_root = os.environ.get("PROJECT_ROOT")
    if project_root:
        return os.path.join(project_root, _CONFIG_FILENAME)

    return None


def load_config(
    config_path: Optional[str] = None,
) -> dict:
    """Load ADO Sync configuration.

    Tries .beth/ado-sync.json first (via --config or PROJECT_ROOT).
    If an explicit --config is provided but the file is missing/unreadable,
    fails fast instead of silently falling back to .env.
    Falls back to .env in the current directory only when no JSON config exists.
    """
    resolved = resolve_config_path(config_path)

    if resolved and os.path.isfile(resolved):
        with open(resolved, "r") as f:
            try:
                return json.load(f)
            except json.JSONDecodeError as e:
                raise json.JSONDecodeError(
                    f"Failed to parse JSON config at {resolved}: {e.msg}", e.doc, e.pos
                )

    # If an explicit --config or PROJECT_ROOT was provided but the file
    # is missing, fail fast instead of silently falling back to .env.
    if config_path is not None or os.environ.get("PROJECT_ROOT"):
        raise FileNotFoundError(
            f"Config file not found: {resolved or config_path}. "
            f"Ensure .beth/ado-sync.json exists at the expected location."
        )

    # Fallback: .env file (legacy behavior when no JSON config path is found)
    env_path = Path.cwd() / ".env"
    if env_path.is_file():
        env = dotenv_values(str(env_path))
        organization = env.get("ADO_ORGANIZATION") or env.get("ADO_ORG", "")
        log_level = env.get("LOG_LEVEL", "INFO")
        return {
            "organization": organization,
            "project": env.get("ADO_PROJECT", ""),
            "authMethod": "pat",
            "pat": env.get("ADO_PAT", ""),
            "tenantId": env.get("ADO_TENANT_ID", ""),
            "tasksDir": env.get("BACKLOG_TASKS_DIR", "./backlog/tasks"),
            "areaPath": env.get("ADO_AREA_PATH", ""),
            "iterationPath": env.get("ADO_ITERATION_PATH", ""),
            "logLevel": log_level,
        }

    raise FileNotFoundError(
        "No config found. Provide --config, set PROJECT_ROOT, or create a .env file."
    )


def build_settings(config: dict) -> Settings:
    """Build a pydantic Settings object from a config dict.

    Supports both the legacy watcher config keys (e.g. ``backlogTasksDir``)
    and the CLI's ``.beth/ado-sync.json`` schema (e.g. ``tasksDir``), and
    intentionally avoids reading secrets (PAT) from the JSON config file
    unless explicitly provided (e.g. from .env-derived config).
    """
    # Prefer CLI schema ``tasksDir``, fall back to legacy ``backlogTasksDir``
    backlog_tasks_dir = (
        config.get("tasksDir")
        or config.get("backlogTasksDir")
        or "./backlog/tasks"
    )

    # Extract AI formatting settings from CLI config's nested ``aiFormatting``
    ai = config.get("aiFormatting", {})

    settings_kwargs: dict = {
        "ado_organization": config.get("organization", ""),
        "ado_project": config.get("project", ""),
        "ado_tenant_id": config.get("tenantId", ""),
        "ado_area_path": config.get("areaPath", ""),
        "ado_iteration_path": config.get("iterationPath", ""),
        "backlog_tasks_dir": backlog_tasks_dir,
        "backlog_task_prefix": config.get("taskPrefix", "BETH"),
        "log_level": config.get("logLevel", "INFO"),
        "_env_file": None,
    }

    # Only set PAT when explicitly provided (from .env-derived config).
    # CLI JSON config should not contain secrets.
    pat = config.get("pat")
    if pat:
        settings_kwargs["ado_pat"] = pat

    # Map aiFormatting block to Settings fields
    if ai.get("endpoint"):
        settings_kwargs["azure_openai_endpoint"] = ai["endpoint"]
    if ai.get("deployment"):
        settings_kwargs["azure_openai_deployment"] = ai["deployment"]

    return Settings(**settings_kwargs)


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
