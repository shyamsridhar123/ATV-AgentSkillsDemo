"""Story formatter using Azure OpenAI.

Transforms BacklogMD task data into properly formatted Azure DevOps user stories
with persona-based descriptions, Fibonacci effort estimates, and bulleted
acceptance criteria.
"""

import json
import logging
from openai import AzureOpenAI

from .config import Settings
from .models import BacklogTask, ADOUserStory, FibonacciEffort

logger = logging.getLogger(__name__)

# Cached token providers keyed by tenant ID (or "default" for same-tenant)
_token_providers: dict[str, callable] = {}

SYSTEM_PROMPT = """You are an expert agile project manager who creates Azure DevOps user stories from developer task descriptions.

You will receive a BacklogMD task with a title, description, acceptance criteria, and other metadata. Your job is to transform this into a properly formatted ADO user story.

RULES:
1. TITLE: Create a clear, concise title that describes the deliverable (not the task). Keep the original title's intent but make it client-readable.

2. DESCRIPTION: Write in this exact format:
   "As a [persona], I want to [objective] in order to [key results]."
   - Persona should be inferred from the task context (e.g., "platform user", "API consumer", "system administrator", "development team")
   - Objective should describe what is being achieved
   - Key results should describe the business value or outcome

3. EFFORT: Estimate effort on the Fibonacci scale (1, 2, 3, 5, 8, 13, 21).
   Guidelines:
   - 1: Trivial change (config update, copy change)
   - 2: Small task (single function, simple UI tweak)
   - 3: Standard task (new component, API endpoint, middleware)
   - 5: Multi-part task (feature with tests, integration work)
   - 8: Complex feature (multi-component, significant logic)
   - 13: Large feature (cross-cutting concern, major refactor)
   - 21: Epic-level (architectural change, full subsystem)

4. ACCEPTANCE CRITERIA: Return as a list of clear, testable criteria. Use the provided acceptance criteria as a base, but improve them to be:
   - Specific and measurable
   - Written from the user/system perspective
   - Testable (someone could verify pass/fail)
   If the task has no acceptance criteria, generate reasonable ones from the description.

Respond ONLY with valid JSON in this exact schema:
{
  "title": "string",
  "description": "As a ..., I want to ... in order to ...",
  "effort": <fibonacci_number>,
  "acceptance_criteria": ["criterion 1", "criterion 2", ...],
  "tags": "tag1;tag2"
}"""


def build_user_prompt(task: BacklogTask) -> str:
    """Build the user prompt from a BacklogMD task."""
    parts = [
        f"Task ID: {task.task_id}",
        f"Title: {task.title}",
    ]

    if task.description:
        parts.append(f"Description:\n{task.description}")

    if task.acceptance_criteria:
        ac_text = "\n".join(f"- {ac}" for ac in task.acceptance_criteria)
        parts.append(f"Acceptance Criteria:\n{ac_text}")

    if task.labels:
        parts.append(f"Labels: {', '.join(task.labels)}")

    if task.priority:
        parts.append(f"Priority: {task.priority}")

    if task.plan:
        parts.append(f"Implementation Plan:\n{task.plan}")

    if task.notes:
        parts.append(f"Notes:\n{task.notes}")

    return "\n\n".join(parts)


def format_story(task: BacklogTask, settings: Settings) -> ADOUserStory:
    """Use Azure OpenAI to transform a BacklogMD task into an ADO user story.

    Supports Entra ID auth (preferred) and API key auth (fallback).

    Args:
        task: Parsed BacklogMD task
        settings: Application settings with Azure OpenAI config

    Returns:
        Formatted ADOUserStory ready for creation in Azure DevOps
    """
    if not settings.azure_openai_endpoint:
        raise ValueError("Azure OpenAI not configured — use offline formatter")

    if settings.azure_openai_api_key:
        # API key auth
        client = AzureOpenAI(
            azure_endpoint=settings.azure_openai_endpoint,
            api_key=settings.azure_openai_api_key,
            api_version=settings.azure_openai_api_version,
        )
    else:
        # Entra ID auth (DefaultAzureCredential), cached per tenant
        cache_key = settings.azure_openai_tenant_id or "_default"
        if cache_key not in _token_providers:
            from azure.identity import DefaultAzureCredential
            cred_kwargs = {}
            if settings.azure_openai_tenant_id:
                cred_kwargs["additionally_allowed_tenants"] = [settings.azure_openai_tenant_id]
            credential = DefaultAzureCredential(**cred_kwargs)
            aoai_scope = "https://cognitiveservices.azure.com/.default"
            aoai_tenant = settings.azure_openai_tenant_id or None

            def _make_provider(_cred=credential, _scope=aoai_scope, _tenant=aoai_tenant):
                def _provider():
                    token = _cred.get_token(_scope, tenant_id=_tenant)
                    return token.token
                return _provider

            _token_providers[cache_key] = _make_provider()
            logger.info(f"AOAI: Created Entra ID token provider for tenant '{cache_key}'")
        client = AzureOpenAI(
            azure_endpoint=settings.azure_openai_endpoint,
            azure_ad_token_provider=_token_providers[cache_key],
            api_version=settings.azure_openai_api_version,
        )

    user_prompt = build_user_prompt(task)
    logger.info(f"Formatting story for task {task.task_id}: {task.title}")

    response = client.chat.completions.create(
        model=settings.azure_openai_deployment,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.3,
        max_completion_tokens=1000,
        response_format={"type": "json_object"},
    )

    raw = response.choices[0].message.content
    data = json.loads(raw)

    # Build HTML description
    description_html = f"<p>{_escape_html(data['description'])}</p>"
    description_html += f'<br/><p><em>Source: BacklogMD {task.task_id}</em></p>'

    # Build HTML acceptance criteria
    ac_items = data.get("acceptance_criteria", task.acceptance_criteria)
    ac_html_items = "\n".join(
        f"<li>{_escape_html(ac)}</li>" for ac in ac_items
    )
    acceptance_criteria_html = f"<ul>\n{ac_html_items}\n</ul>"

    # Map effort to Fibonacci enum
    raw_effort = data.get("effort", 3)
    effort = _map_to_fibonacci(raw_effort)

    # Build tags
    tags = data.get("tags", "")
    if not tags and task.labels:
        tags = ";".join(task.labels)

    return ADOUserStory(
        title=data.get("title", task.title),
        description_html=description_html,
        acceptance_criteria_html=acceptance_criteria_html,
        effort=effort,
        tags=tags,
        backlog_task_id=task.task_id,
    )


def format_story_offline(task: BacklogTask) -> ADOUserStory:
    """Create an ADO user story without calling Azure OpenAI.

    Useful for testing or when AOAI is unavailable. Uses the task data
    directly with reasonable defaults.
    """
    # Simple persona-based description
    description = (
        f"As a development team member, I want to {task.title.lower()} "
        f"in order to deliver the required functionality."
    )

    if task.description:
        description = (
            f"As a development team member, I want to {task.title.lower()} "
            f"in order to {task.description[:200].rstrip('.')}."
        )

    description_html = f"<p>{_escape_html(description)}</p>"
    description_html += f'<br/><p><em>Source: BacklogMD {task.task_id}</em></p>'

    # Use existing AC or generate minimal ones
    ac = task.acceptance_criteria or [
        f"{task.title} is implemented and functional",
        "Code passes all existing tests",
        "No regressions introduced",
    ]
    ac_html_items = "\n".join(f"<li>{_escape_html(c)}</li>" for c in ac)
    acceptance_criteria_html = f"<ul>\n{ac_html_items}\n</ul>"

    # Rough effort estimate based on content length
    effort = _estimate_effort_offline(task)

    tags = ";".join(task.labels) if task.labels else ""

    return ADOUserStory(
        title=task.title,
        description_html=description_html,
        acceptance_criteria_html=acceptance_criteria_html,
        effort=effort,
        tags=tags,
        backlog_task_id=task.task_id,
    )


def _map_to_fibonacci(value: int) -> FibonacciEffort:
    """Map an integer to the nearest Fibonacci effort value.

    Ties break upward (conservative estimation).
    """
    fib_values = [1, 2, 3, 5, 8, 13, 21]
    # Sort by distance, then by value descending to break ties upward
    closest = min(fib_values, key=lambda x: (abs(x - value), -x))
    return FibonacciEffort(closest)


def _estimate_effort_offline(task: BacklogTask) -> FibonacciEffort:
    """Rough effort estimate without AI, based on task complexity signals."""
    score = 0
    score += len(task.acceptance_criteria) * 1
    score += 1 if task.plan else 0
    score += 2 if len(task.description) > 500 else 0
    score += 1 if task.priority == "high" else 0

    if score <= 1:
        return FibonacciEffort.S
    elif score <= 3:
        return FibonacciEffort.M
    elif score <= 5:
        return FibonacciEffort.L
    elif score <= 8:
        return FibonacciEffort.XL
    else:
        return FibonacciEffort.XXL


def _escape_html(text: str) -> str:
    """Basic HTML escaping."""
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )
