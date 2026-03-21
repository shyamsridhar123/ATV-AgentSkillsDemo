"""FastMCP server for ADO Sync.

Exposes ADO Sync capabilities as MCP tools so Beth and other agents
can create/query ADO stories directly without going through the REST API.

Usage:
    python -m app.mcp_server

Or add to your MCP config:
    {
        "servers": {
            "ado-sync": {
                "command": "python",
                "args": ["-m", "app.mcp_server"]
            }
        }
    }
"""

import asyncio
import logging
from pathlib import Path

from fastmcp import FastMCP

from .config import get_settings
from .backlog_parser import parse_task_file
from .story_formatter import format_story, format_story_offline
from .ado_client import ADOClient

logger = logging.getLogger(__name__)

mcp = FastMCP(
    name="ado-sync",
    description=(
        "Syncs BacklogMD tasks to Azure DevOps user stories. "
        "Creates stories when work starts, enriches them when PRs land."
    ),
)

# Lazy-initialized globals
_settings = None
_ado_client = None


def _ensure_initialized():
    """Lazily initialize settings and ADO client."""
    global _settings, _ado_client
    if _settings is None:
        _settings = get_settings()
        _ado_client = ADOClient(_settings)


@mcp.tool()
async def create_story_from_task(task_id: str) -> dict:
    """Create an ADO user story from a BacklogMD task.

    Call this when starting work on a task. Reads the task markdown file,
    formats it into a user story with persona-based description, Fibonacci
    effort estimate, and acceptance criteria, then creates it in ADO.

    Args:
        task_id: The BacklogMD task identifier (e.g., "BETH-42" or "task-42")

    Returns:
        Dict with work_item_id, url, title, and state of the created story
    """
    _ensure_initialized()

    # Find the task file
    tasks_dir = Path(_settings.backlog_tasks_dir)
    task_file = _find_task_file(tasks_dir, task_id)

    if not task_file:
        return {"error": f"Task file not found for {task_id} in {tasks_dir}"}

    task = parse_task_file(task_file)
    if not task:
        return {"error": f"Could not parse task file: {task_file}"}

    # Format via Azure OpenAI
    try:
        story = format_story(task, _settings)
    except Exception as e:
        logger.warning(f"AOAI unavailable, using offline formatter: {e}")
        story = format_story_offline(task)

    # Create in ADO
    result = await _ado_client.create_user_story(story)

    return {
        "work_item_id": result.work_item_id,
        "url": result.url,
        "title": result.title,
        "state": result.state,
        "effort": story.effort.value,
        "task_id": task.task_id,
    }


@mcp.tool()
async def update_story_with_pr(
    task_id: str,
    pr_url: str,
    commit_messages: list[str] | None = None,
) -> dict:
    """Link a GitHub PR to an existing ADO story and resolve it.

    Call this when landing work (beth land). Links the PR URL and commit
    messages to the ADO story and moves it to Resolved state.

    Args:
        task_id: The BacklogMD task identifier
        pr_url: URL of the GitHub pull request
        commit_messages: Optional list of commit messages to include

    Returns:
        Dict with updated work item details
    """
    _ensure_initialized()

    mapping = _ado_client.get_mapping(task_id)
    if not mapping:
        return {"error": f"No ADO story found for task {task_id}"}

    # Link the PR
    await _ado_client.add_github_link(mapping.work_item_id, pr_url, "Pull Request")

    # Resolve the story
    result = await _ado_client.resolve_story(
        mapping.work_item_id,
        pr_url=pr_url,
        commit_messages=commit_messages or [],
    )

    return {
        "work_item_id": result.work_item_id,
        "url": result.url,
        "title": result.title,
        "state": result.state,
    }


@mcp.tool()
async def get_story_status(task_id: str) -> dict:
    """Check if an ADO story exists for a BacklogMD task.

    Args:
        task_id: The BacklogMD task identifier

    Returns:
        Dict with story mapping if found, or status indicating none exists
    """
    _ensure_initialized()

    mapping = _ado_client.get_mapping(task_id)
    if not mapping:
        return {"exists": False, "task_id": task_id}

    return {
        "exists": True,
        "task_id": mapping.task_id,
        "work_item_id": mapping.work_item_id,
        "url": mapping.work_item_url,
        "pr_linked": mapping.pr_linked,
        "created_at": mapping.created_at.isoformat(),
    }


@mcp.tool()
async def list_recent_stories(limit: int = 10) -> dict:
    """List recently created ADO stories.

    Args:
        limit: Maximum number of stories to return (default 10)

    Returns:
        Dict with count and list of story mappings
    """
    _ensure_initialized()

    mappings = _ado_client.get_all_mappings()
    recent = sorted(mappings, key=lambda m: m.created_at, reverse=True)[:limit]

    return {
        "count": len(recent),
        "total": len(mappings),
        "stories": [
            {
                "task_id": m.task_id,
                "work_item_id": m.work_item_id,
                "url": m.work_item_url,
                "pr_linked": m.pr_linked,
                "created_at": m.created_at.isoformat(),
            }
            for m in recent
        ],
    }


def _find_task_file(tasks_dir: Path, task_id: str) -> Path | None:
    """Find a task markdown file by its ID.

    BacklogMD stores tasks as: beth-42 - Title here.md
    The task_id might be "BETH-42", "beth-42", or just "42".
    """
    import re

    # Extract the numeric part
    num_match = re.search(r"(\d+(?:\.\d+)?)", task_id)
    if not num_match:
        return None

    task_num = num_match.group(1)

    # Search for matching files — handle both beth-{num} and task-{num} prefixes
    for md_file in tasks_dir.glob("*.md"):
        name_lower = md_file.name.lower()
        if f"beth-{task_num}" in name_lower or f"task-{task_num}" in name_lower:
            return md_file

    return None


def main():
    """Run the MCP server."""
    logging.basicConfig(level=logging.INFO)
    mcp.run()


if __name__ == "__main__":
    main()
