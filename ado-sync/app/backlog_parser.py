"""Parser for BacklogMD task markdown files.

BacklogMD stores tasks as markdown files with YAML frontmatter:
  backlog/tasks/task-42 - Implement auth middleware.md

Format:
  ---
  id: BETH-42
  title: Implement auth middleware
  status: In Progress
  assignee: @beth
  labels: [auth, middleware]
  priority: high
  ---

  ## Description
  Add JWT-based auth middleware to the API layer.

  ## Acceptance Criteria
  - [ ] Middleware validates JWT tokens on protected routes
  - [ ] Invalid tokens return 401 with clear error message
  - [x] Token refresh flow is implemented

  ## Implementation Plan
  1. Create middleware function
  2. Add to route chain

  ## Notes
  Using jose library for JWT validation.
"""

import re
import yaml
from pathlib import Path
from typing import Optional

from .models import BacklogTask


def parse_task_file(file_path: Path) -> Optional[BacklogTask]:
    """Parse a BacklogMD task markdown file into a BacklogTask model.

    Args:
        file_path: Path to the task .md file

    Returns:
        BacklogTask if successfully parsed, None if file is invalid
    """
    try:
        content = file_path.read_text(encoding="utf-8")
    except (FileNotFoundError, PermissionError):
        return None

    return parse_task_content(content, file_path.name)


def parse_task_content(content: str, filename: str = "") -> Optional[BacklogTask]:
    """Parse raw markdown content into a BacklogTask.

    Args:
        content: Raw markdown string
        filename: Original filename (used as fallback for title/id)

    Returns:
        BacklogTask if successfully parsed, None if content is invalid
    """
    if not content.strip():
        return None

    # Extract YAML frontmatter
    frontmatter, body = _split_frontmatter(content)

    # Parse frontmatter
    metadata = {}
    if frontmatter:
        try:
            metadata = yaml.safe_load(frontmatter) or {}
        except yaml.YAMLError:
            metadata = {}

    # Extract task ID and title from metadata or filename
    task_id = str(metadata.get("id", _extract_id_from_filename(filename)))
    title = metadata.get("title", _extract_title_from_filename(filename))
    status = metadata.get("status", "To Do")
    assignee = metadata.get("assignee")
    labels = metadata.get("labels", [])
    priority = metadata.get("priority")

    if isinstance(labels, str):
        labels = [l.strip() for l in labels.split(",")]

    # Parse body sections
    description = _extract_section(body, "Description")
    acceptance_criteria = _extract_acceptance_criteria(body)
    plan = _extract_section(body, "Implementation Plan")
    notes = _extract_section(body, "Notes")

    # If no structured description section, use the body before any ## heading
    if not description:
        description = _extract_preamble(body)

    return BacklogTask(
        task_id=task_id,
        title=title,
        description=description,
        status=status,
        acceptance_criteria=acceptance_criteria,
        labels=labels,
        assignee=assignee,
        priority=priority,
        notes=notes,
        plan=plan,
        raw_content=content,
    )


def _split_frontmatter(content: str) -> tuple[str, str]:
    """Split YAML frontmatter from markdown body."""
    match = re.match(r"^---\s*\n(.*?)\n---\s*\n(.*)$", content, re.DOTALL)
    if match:
        return match.group(1), match.group(2)
    return "", content


def _extract_section(body: str, heading: str) -> str:
    """Extract content under a ## heading until the next heading or EOF."""
    pattern = rf"##\s+{re.escape(heading)}\s*\n(.*?)(?=\n##\s|\Z)"
    match = re.search(pattern, body, re.DOTALL | re.IGNORECASE)
    if match:
        return match.group(1).strip()
    return ""


def _extract_preamble(body: str) -> str:
    """Extract text before the first ## heading."""
    match = re.match(r"^(.*?)(?=\n##\s|\Z)", body, re.DOTALL)
    if match:
        return match.group(1).strip()
    return ""


def _extract_acceptance_criteria(body: str) -> list[str]:
    """Extract acceptance criteria from checkbox list items.

    Matches both checked and unchecked items:
      - [ ] Some criterion
      - [x] Completed criterion
    """
    ac_section = _extract_section(body, "Acceptance Criteria")
    if not ac_section:
        # Try "Definition of Done" as alternate heading
        ac_section = _extract_section(body, "Definition of Done")

    if not ac_section:
        # Fall back to finding checkbox items anywhere in the body
        ac_section = body

    criteria = []
    for match in re.finditer(r"-\s*\[[ xX]\]\s*(.+)", ac_section):
        criterion = match.group(1).strip()
        if criterion:
            criteria.append(criterion)

    return criteria


def _extract_id_from_filename(filename: str) -> str:
    """Extract task ID from filename like 'beth-42 - Title.md' or 'task-42 - Title.md'."""
    match = re.match(r"((?:beth|task|BETH|TASK)-[\d.]+)", filename)
    if match:
        return match.group(1)
    return filename.replace(".md", "")


def _extract_title_from_filename(filename: str) -> str:
    """Extract title from filename like 'beth-42 - Implement auth middleware.md'."""
    match = re.match(r"(?:beth|task|BETH|TASK)-[\d.]+\s*-\s*(.+)\.md$", filename)
    if match:
        return match.group(1).strip().replace("-", " ")
    return filename.replace(".md", "")


def detect_status_change(old_content: str, new_content: str) -> Optional[tuple[str, str]]:
    """Detect if a task's status changed between two versions of its content.

    Returns:
        Tuple of (old_status, new_status) if status changed, None otherwise
    """
    old_task = parse_task_content(old_content)
    new_task = parse_task_content(new_content)

    if not old_task or not new_task:
        return None

    if old_task.status != new_task.status:
        return (old_task.status, new_task.status)

    return None
