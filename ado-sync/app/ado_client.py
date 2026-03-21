"""Azure DevOps REST API client.

Creates and updates work items (User Stories) via the ADO REST API v7.1.
Uses PAT authentication and JSON Patch operations.

API Reference:
  POST https://dev.azure.com/{org}/{project}/_apis/wit/workitems/$User%20Story?api-version=7.1
"""

import base64
import json as _json
import logging
import re
from html import escape as html_escape
from pathlib import Path
from typing import Optional
from datetime import datetime
from urllib.parse import urlparse

import httpx

from .config import Settings
from .models import ADOUserStory, ADOWorkItemResult, StoryTaskMapping

logger = logging.getLogger(__name__)

# Persistent mapping of task IDs to ADO work items (JSON file)
_MAPPING_FILE = Path(__file__).parent.parent / ".ado-sync-mappings.json"
_task_story_map: dict[str, StoryTaskMapping] = {}


def _canonicalize_task_id(task_id: str) -> str:
    """Normalize a task ID to canonical uppercase form (e.g., BETH-42)."""
    match = re.match(r"([a-zA-Z]+)-(\d+(?:\.\d+)?)", task_id)
    if match:
        return f"{match.group(1).upper()}-{match.group(2)}"
    return task_id.upper()


def _load_mappings() -> None:
    """Load persisted task-story mappings from disk."""
    global _task_story_map
    if _MAPPING_FILE.exists():
        try:
            data = _json.loads(_MAPPING_FILE.read_text())
            for key, val in data.items():
                _task_story_map[key] = StoryTaskMapping(**val)
            logger.info(f"Loaded {len(_task_story_map)} task-story mappings from {_MAPPING_FILE}")
        except Exception as e:
            logger.warning(f"Failed to load mappings from {_MAPPING_FILE}: {e}")


def _save_mappings() -> None:
    """Persist task-story mappings to disk."""
    try:
        data = {k: v.model_dump(mode="json") for k, v in _task_story_map.items()}
        _MAPPING_FILE.write_text(_json.dumps(data, indent=2, default=str))
    except Exception as e:
        logger.warning(f"Failed to save mappings to {_MAPPING_FILE}: {e}")


class ADOClient:
    """Client for Azure DevOps REST API work item operations."""

    def __init__(self, settings: Settings):
        self.settings = settings
        self.base_url = f"https://dev.azure.com/{settings.ado_organization}/{settings.ado_project}"
        self.api_version = "7.1"

        # PAT auth: base64 encode ":{pat}"
        pat_bytes = f":{settings.ado_pat}".encode("ascii")
        self.auth_header = f"Basic {base64.b64encode(pat_bytes).decode('ascii')}"

        # Load persisted mappings on init
        _load_mappings()

        self.client = httpx.AsyncClient(
            headers={
                "Authorization": self.auth_header,
                "Content-Type": "application/json-patch+json",
            },
            timeout=30.0,
        )

    async def create_user_story(self, story: ADOUserStory) -> ADOWorkItemResult:
        """Create a new User Story work item in Azure DevOps.

        Args:
            story: Formatted user story data

        Returns:
            ADOWorkItemResult with the created work item details
        """
        # Canonicalize task ID for consistent lookups
        canonical_id = _canonicalize_task_id(story.backlog_task_id)

        # Check if we already have a story for this task
        existing = _task_story_map.get(canonical_id)
        if existing:
            logger.info(
                f"Story already exists for {story.backlog_task_id}: "
                f"ADO #{existing.work_item_id}. Updating instead."
            )
            return await self.update_user_story(existing.work_item_id, story)

        # Build JSON Patch operations
        operations = [
            {
                "op": "add",
                "path": "/fields/System.Title",
                "value": story.title,
            },
            {
                "op": "add",
                "path": "/fields/System.Description",
                "value": story.description_html,
            },
            {
                "op": "add",
                "path": "/fields/Microsoft.VSTS.Common.AcceptanceCriteria",
                "value": story.acceptance_criteria_html,
            },
            {
                "op": "add",
                "path": "/fields/Microsoft.VSTS.Scheduling.StoryPoints",
                "value": story.effort.value,
            },
            {
                "op": "add",
                "path": "/fields/System.State",
                "value": "Active",
            },
        ]

        # Optional fields
        if self.settings.ado_area_path:
            operations.append({
                "op": "add",
                "path": "/fields/System.AreaPath",
                "value": self.settings.ado_area_path,
            })

        if self.settings.ado_iteration_path:
            operations.append({
                "op": "add",
                "path": "/fields/System.IterationPath",
                "value": self.settings.ado_iteration_path,
            })

        if story.tags:
            operations.append({
                "op": "add",
                "path": "/fields/System.Tags",
                "value": story.tags,
            })

        # Add a custom tag to identify auto-generated stories
        operations.append({
            "op": "add",
            "path": "/fields/System.History",
            "value": (
                f"<p>Auto-created by ADO Sync from BacklogMD task "
                f"<strong>{story.backlog_task_id}</strong>.</p>"
            ),
        })

        url = (
            f"{self.base_url}/_apis/wit/workitems/$User%20Story"
            f"?api-version={self.api_version}"
        )

        logger.info(f"Creating ADO User Story: {story.title}")
        response = await self.client.post(url, json=operations)
        response.raise_for_status()

        data = response.json()
        result = ADOWorkItemResult(
            work_item_id=data["id"],
            url=data["_links"]["html"]["href"],
            title=data["fields"]["System.Title"],
            state=data["fields"]["System.State"],
            backlog_task_id=story.backlog_task_id,
        )

        # Store mapping (with canonical ID)
        _task_story_map[canonical_id] = StoryTaskMapping(
            task_id=canonical_id,
            work_item_id=result.work_item_id,
            work_item_url=result.url,
        )
        _save_mappings()

        logger.info(
            f"Created ADO User Story #{result.work_item_id}: {result.title} "
            f"({story.effort.value} pts) -> {result.url}"
        )

        return result

    async def update_user_story(
        self, work_item_id: int, story: ADOUserStory
    ) -> ADOWorkItemResult:
        """Update an existing User Story work item."""
        operations = [
            {
                "op": "replace",
                "path": "/fields/System.Description",
                "value": story.description_html,
            },
            {
                "op": "replace",
                "path": "/fields/Microsoft.VSTS.Common.AcceptanceCriteria",
                "value": story.acceptance_criteria_html,
            },
        ]

        url = (
            f"{self.base_url}/_apis/wit/workitems/{work_item_id}"
            f"?api-version={self.api_version}"
        )

        response = await self.client.patch(url, json=operations)
        response.raise_for_status()

        data = response.json()
        return ADOWorkItemResult(
            work_item_id=data["id"],
            url=data["_links"]["html"]["href"],
            title=data["fields"]["System.Title"],
            state=data["fields"]["System.State"],
            backlog_task_id=story.backlog_task_id,
        )

    async def resolve_story(
        self, work_item_id: int, pr_url: str = "", commit_messages: list[str] = None
    ) -> ADOWorkItemResult:
        """Move a story to Resolved state and add PR/commit info.

        Called when Beth lands the plane (opens PR).
        """
        commit_messages = commit_messages or []

        history_html = "<p><strong>Work completed and PR opened.</strong></p>"
        if pr_url:
            # Validate URL scheme and HTML-escape to prevent injection
            parsed = urlparse(pr_url)
            if parsed.scheme not in ("https", "http"):
                logger.warning(f"Suspicious PR URL scheme: {parsed.scheme}")
            safe_url = html_escape(pr_url)
            history_html += f'<p>PR: <a href="{safe_url}">{safe_url}</a></p>'
        if commit_messages:
            commits_html = "<br/>".join(
                f"- {html_escape(msg)}" for msg in commit_messages[:10]
            )
            history_html += f"<p>Commits:<br/>{commits_html}</p>"

        operations = [
            {
                "op": "replace",
                "path": "/fields/System.State",
                "value": "Resolved",
            },
            {
                "op": "add",
                "path": "/fields/System.History",
                "value": history_html,
            },
        ]

        url = (
            f"{self.base_url}/_apis/wit/workitems/{work_item_id}"
            f"?api-version={self.api_version}"
        )

        response = await self.client.patch(url, json=operations)
        response.raise_for_status()

        data = response.json()

        # Update mapping and persist
        task_id = ""
        for tid, mapping in _task_story_map.items():
            if mapping.work_item_id == work_item_id:
                mapping.pr_linked = True
                mapping.updated_at = datetime.utcnow()
                task_id = tid
                break
        _save_mappings()

        logger.info(f"Resolved ADO Story #{work_item_id} with PR: {pr_url}")

        return ADOWorkItemResult(
            work_item_id=data["id"],
            url=data["_links"]["html"]["href"],
            title=data["fields"]["System.Title"],
            state=data["fields"]["System.State"],
            backlog_task_id=task_id,
        )

    async def add_github_link(
        self, work_item_id: int, github_url: str, link_type: str = "Hyperlink"
    ) -> None:
        """Add a GitHub URL (commit or PR) as a hyperlink to a work item."""
        operations = [
            {
                "op": "add",
                "path": "/relations/-",
                "value": {
                    "rel": "Hyperlink",
                    "url": github_url,
                    "attributes": {
                        "comment": f"GitHub: {link_type}",
                    },
                },
            }
        ]

        url = (
            f"{self.base_url}/_apis/wit/workitems/{work_item_id}"
            f"?api-version={self.api_version}"
        )

        response = await self.client.patch(url, json=operations)
        response.raise_for_status()
        logger.info(f"Linked {link_type} to ADO #{work_item_id}: {github_url}")

    def get_mapping(self, task_id: str) -> Optional[StoryTaskMapping]:
        """Get the ADO work item mapping for a BacklogMD task.

        Performs case-insensitive lookup via canonical ID normalization.
        """
        return _task_story_map.get(_canonicalize_task_id(task_id))

    def get_all_mappings(self) -> list[StoryTaskMapping]:
        """Get all task-to-story mappings."""
        return list(_task_story_map.values())

    async def close(self):
        """Close the HTTP client."""
        await self.client.aclose()
