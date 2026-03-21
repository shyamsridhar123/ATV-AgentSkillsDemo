"""ADO Sync -- FastAPI application.

Handles:
1. BacklogMD file watcher (primary trigger -- story creation on task start)
2. GitHub webhook (secondary trigger -- story enrichment on PR)
3. REST API for manual operations and status checks
"""

import asyncio
import hashlib
import hmac
import json
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse

from .config import get_settings, Settings
from .backlog_parser import parse_task_file
from .backlog_watcher import watch_backlog_tasks
from .story_formatter import format_story, format_story_offline
from .ado_client import ADOClient
from .models import BacklogTask, GitHubPRPayload

# Logging setup
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# Global references
_ado_client: ADOClient | None = None
_settings: Settings | None = None
_watcher_task: asyncio.Task | None = None


async def handle_task_started(task: BacklogTask):
    """Called when a BacklogMD task moves to 'In Progress'.

    This is the moment you say 'Go on task 62' and Beth starts working.
    ADO Sync creates the user story immediately so your client sees it.
    """
    global _ado_client, _settings

    if not _ado_client or not _settings:
        logger.error("ADO client not initialized")
        return

    try:
        # Format the task into an ADO user story via Azure OpenAI
        try:
            story = format_story(task, _settings)
        except Exception as e:
            logger.warning(f"Azure OpenAI unavailable, using offline formatter: {e}")
            story = format_story_offline(task)

        # Create the story in ADO
        result = await _ado_client.create_user_story(story)

        logger.info(
            f"ADO Story created for {task.task_id}: "
            f"#{result.work_item_id} '{result.title}' "
            f"({story.effort.value} pts) -> {result.url}"
        )

    except Exception as e:
        logger.error(f"Failed to create ADO story for {task.task_id}: {e}", exc_info=True)


async def handle_task_completed(task: BacklogTask):
    """Called when a BacklogMD task moves to 'Done'.

    If beth land already triggered a PR webhook, this is a no-op.
    Otherwise, resolve the story.
    """
    global _ado_client

    if not _ado_client:
        return

    mapping = _ado_client.get_mapping(task.task_id)
    if not mapping:
        logger.info(f"No ADO story found for completed task {task.task_id}")
        return

    if mapping.pr_linked:
        logger.info(f"Story #{mapping.work_item_id} already resolved via PR")
        return

    try:
        await _ado_client.resolve_story(mapping.work_item_id)
        logger.info(f"Resolved ADO Story #{mapping.work_item_id} (task completed)")
    except Exception as e:
        logger.error(f"Failed to resolve story: {e}", exc_info=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle: start watcher, initialize ADO client."""
    global _ado_client, _settings, _watcher_task

    _settings = get_settings()
    _ado_client = ADOClient(_settings)

    logging.getLogger().setLevel(_settings.log_level)

    # Start the BacklogMD file watcher in the background
    _watcher_task = asyncio.create_task(
        watch_backlog_tasks(
            tasks_dir=_settings.backlog_tasks_dir,
            on_task_started=handle_task_started,
            on_task_completed=handle_task_completed,
        )
    )

    logger.info("ADO Sync started")
    logger.info(f"  ADO: {_settings.ado_organization}/{_settings.ado_project}")
    logger.info(f"  Watching: {_settings.backlog_tasks_dir}")

    yield

    # Cleanup
    if _watcher_task:
        _watcher_task.cancel()
    if _ado_client:
        await _ado_client.close()

    logger.info("ADO Sync stopped")


app = FastAPI(
    title="ADO Sync",
    description="Syncs BacklogMD tasks to Azure DevOps user stories automatically.",
    version="0.1.0",
    lifespan=lifespan,
)


# ---------------------------------------------------------------------------
# GitHub Webhook Handler
# ---------------------------------------------------------------------------

@app.post("/webhooks/github")
async def github_webhook(request: Request):
    """Handle GitHub webhook events.

    When Beth opens a PR via `beth land`, this endpoint:
    1. Finds the matching ADO story (by task ID in branch name or PR body)
    2. Links the PR and commits to the story
    3. Moves the story to "Resolved"
    """
    global _ado_client, _settings

    if not _ado_client or not _settings:
        raise HTTPException(status_code=503, detail="Service not initialized")

    # Verify webhook signature
    body = await request.body()
    if _settings.github_webhook_secret:
        signature = request.headers.get("X-Hub-Signature-256", "")
        if not _verify_signature(body, signature, _settings.github_webhook_secret):
            raise HTTPException(status_code=401, detail="Invalid signature")

    event_type = request.headers.get("X-GitHub-Event", "")
    payload = json.loads(body)

    if event_type == "pull_request":
        return await _handle_pr_event(payload)

    return JSONResponse({"status": "ignored", "event": event_type})


async def _handle_pr_event(payload: dict) -> JSONResponse:
    """Process a pull_request webhook event."""
    action = payload.get("action", "")
    pr = payload.get("pull_request", {})

    # Only care about opened/reopened PRs
    if action not in ("opened", "reopened", "synchronize"):
        return JSONResponse({"status": "ignored", "action": action})

    pr_data = GitHubPRPayload(
        action=action,
        pr_number=pr.get("number", 0),
        pr_title=pr.get("title", ""),
        pr_body=pr.get("body", "") or "",
        pr_url=pr.get("html_url", ""),
        branch=pr.get("head", {}).get("ref", ""),
        repo_full_name=payload.get("repository", {}).get("full_name", ""),
    )

    # Try to find the BacklogMD task ID from branch name or PR body
    task_id = _extract_task_id(pr_data.branch, pr_data.pr_body, pr_data.pr_title)
    if not task_id:
        logger.info(f"PR #{pr_data.pr_number}: No task ID found, skipping")
        return JSONResponse({"status": "no_task_id"})

    # Find existing ADO story
    mapping = _ado_client.get_mapping(task_id)
    if not mapping:
        logger.info(f"PR #{pr_data.pr_number}: No ADO story for task {task_id}")
        return JSONResponse({"status": "no_story", "task_id": task_id})

    # Link PR to the story and resolve it
    try:
        await _ado_client.add_github_link(
            mapping.work_item_id, pr_data.pr_url, "Pull Request"
        )

        # Extract commit messages from PR body (Beth includes these)
        commit_messages = _extract_commits_from_body(pr_data.pr_body)

        result = await _ado_client.resolve_story(
            mapping.work_item_id,
            pr_url=pr_data.pr_url,
            commit_messages=commit_messages,
        )

        logger.info(
            f"PR #{pr_data.pr_number} linked to ADO #{mapping.work_item_id}, "
            f"story resolved"
        )

        return JSONResponse({
            "status": "resolved",
            "task_id": task_id,
            "work_item_id": result.work_item_id,
            "work_item_url": result.url,
        })

    except Exception as e:
        logger.error(f"Failed to process PR webhook: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# REST API
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "ado_org": _settings.ado_organization if _settings else None,
        "watching": _settings.backlog_tasks_dir if _settings else None,
    }


@app.get("/stories")
async def list_stories():
    """List all task-to-story mappings."""
    if not _ado_client:
        raise HTTPException(status_code=503, detail="Not initialized")

    mappings = _ado_client.get_all_mappings()
    return {
        "count": len(mappings),
        "stories": [m.model_dump() for m in mappings],
    }


@app.get("/stories/{task_id}")
async def get_story(task_id: str):
    """Get the ADO story mapping for a specific BacklogMD task."""
    if not _ado_client:
        raise HTTPException(status_code=503, detail="Not initialized")

    mapping = _ado_client.get_mapping(task_id)
    if not mapping:
        raise HTTPException(status_code=404, detail=f"No story for task {task_id}")

    return mapping.model_dump()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _verify_signature(body: bytes, signature: str, secret: str) -> bool:
    """Verify GitHub webhook HMAC signature."""
    if not signature.startswith("sha256="):
        return False
    expected = hmac.new(
        secret.encode("utf-8"), body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(f"sha256={expected}", signature)


def _extract_task_id(branch: str, pr_body: str, pr_title: str) -> str | None:
    """Try to extract a BacklogMD task ID from PR metadata.

    Beth's branch naming convention typically includes the task ID.
    Examples: beth-42-implement-auth, BETH-42/implement-auth, task-42
    """
    import re

    # Try branch name first
    patterns = [
        r"(?:beth|BETH|task)-(\d+(?:\.\d+)?)",  # beth-42, BETH-42, task-42
        r"(?:BACK|back)-(\d+(?:\.\d+)?)",        # BACK-42
    ]

    for pattern in patterns:
        for source in [branch, pr_title, pr_body]:
            match = re.search(pattern, source)
            if match:
                # Reconstruct with prefix
                task_num = match.group(1)
                prefix = _settings.backlog_task_prefix if _settings else "BETH"
                return f"{prefix}-{task_num}"

    return None


def _extract_commits_from_body(pr_body: str) -> list[str]:
    """Extract commit messages from PR body.

    Beth typically includes a commit log in the PR description.
    """
    import re

    commits = []
    for line in pr_body.split("\n"):
        line = line.strip()
        # Match common commit reference patterns
        if re.match(r"^[-*]\s+\w{7,}", line):  # - abc1234 commit message
            commits.append(line.lstrip("-* "))
        elif re.match(r"^[-*]\s+", line) and len(line) > 10:
            commits.append(line.lstrip("-* "))

    return commits[:20]  # Cap at 20 commits
