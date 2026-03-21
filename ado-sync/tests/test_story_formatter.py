"""Tests for backlog parser and story formatter."""

import pytest
from app.backlog_parser import parse_task_content, _extract_acceptance_criteria
from app.story_formatter import format_story_offline, _map_to_fibonacci, _estimate_effort_offline
from app.models import BacklogTask, FibonacciEffort


# ---------------------------------------------------------------------------
# Backlog Parser Tests
# ---------------------------------------------------------------------------

SAMPLE_TASK_MD = """---
id: BETH-42
title: Implement JWT auth middleware
status: In Progress
assignee: "@beth"
labels: [auth, middleware, security]
priority: high
---

## Description
Add JWT-based authentication middleware to the API layer.
This should validate tokens on all protected routes and handle
token refresh seamlessly.

## Acceptance Criteria
- [ ] Middleware validates JWT tokens on protected routes
- [ ] Invalid tokens return 401 with clear error message
- [x] Token refresh flow is implemented
- [ ] Rate limiting applied to auth endpoints

## Implementation Plan
1. Create middleware function in src/middleware/auth.ts
2. Add to Express route chain
3. Implement token refresh endpoint
4. Add rate limiting via express-rate-limit

## Notes
Using jose library for JWT validation. Tokens issued by Azure AD B2C.
"""


def test_parse_task_content_full():
    """Test parsing a complete task with all sections."""
    task = parse_task_content(SAMPLE_TASK_MD, "beth-42 - Implement JWT auth middleware.md")
    assert task is not None
    assert task.task_id == "BETH-42"
    assert task.title == "Implement JWT auth middleware"
    assert task.status == "In Progress"
    assert task.priority == "high"
    assert "auth" in task.labels
    assert "middleware" in task.labels
    assert len(task.acceptance_criteria) == 4
    assert "Middleware validates JWT tokens on protected routes" in task.acceptance_criteria
    assert "Token refresh flow is implemented" in task.acceptance_criteria
    assert "jose library" in task.notes
    assert "Create middleware function" in task.plan


def test_parse_task_content_minimal():
    """Test parsing a minimal task with just frontmatter."""
    md = """---
id: BETH-1
title: Fix typo in README
status: To Do
---

Fix the typo on line 42.
"""
    task = parse_task_content(md)
    assert task is not None
    assert task.task_id == "BETH-1"
    assert task.title == "Fix typo in README"
    assert task.status == "To Do"
    assert "Fix the typo" in task.description


def test_parse_task_content_no_frontmatter():
    """Test parsing a task without YAML frontmatter."""
    md = """# Implement search

## Description
Add full-text search to the task list.

## Acceptance Criteria
- [ ] Search by title works
- [ ] Search by description works
"""
    task = parse_task_content(md, "beth-99 - Implement search.md")
    assert task is not None
    assert task.task_id == "beth-99"
    assert task.title == "Implement search"
    assert len(task.acceptance_criteria) == 2


def test_parse_task_content_empty():
    """Test parsing empty content returns None."""
    assert parse_task_content("") is None
    assert parse_task_content("   ") is None


def test_extract_id_from_filename():
    """Test task ID extraction from various filename formats."""
    task = parse_task_content("Simple task body", "beth-42 - My Task.md")
    assert task.task_id == "beth-42"

    task = parse_task_content("Body", "beth-1.1 - Subtask.md")
    assert task.task_id == "beth-1.1"

    task = parse_task_content("Body", "task-99 - Legacy Task.md")
    assert task.task_id == "task-99"


def test_extract_acceptance_criteria_variants():
    """Test AC extraction with different checkbox formats."""
    body = """
## Acceptance Criteria
- [ ] Unchecked item
- [x] Checked item
- [X] Uppercase checked
- [ ] Another unchecked
"""
    criteria = _extract_acceptance_criteria(body)
    assert len(criteria) == 4


# ---------------------------------------------------------------------------
# Story Formatter Tests
# ---------------------------------------------------------------------------

def test_format_story_offline_basic():
    """Test offline story formatting produces valid output."""
    task = BacklogTask(
        task_id="BETH-42",
        title="Implement JWT auth middleware",
        description="Add JWT-based authentication middleware to the API layer.",
        status="In Progress",
        acceptance_criteria=[
            "Middleware validates JWT tokens",
            "Invalid tokens return 401",
        ],
        labels=["auth", "security"],
        priority="high",
    )

    story = format_story_offline(task)
    assert story.title == task.title
    assert story.backlog_task_id == "BETH-42"
    assert "As a" in story.description_html
    assert "BETH-42" in story.description_html
    assert "<li>" in story.acceptance_criteria_html
    assert story.effort.value in [1, 2, 3, 5, 8, 13, 21]
    assert "auth" in story.tags


def test_format_story_offline_no_ac():
    """Test offline formatting generates AC when none provided."""
    task = BacklogTask(
        task_id="BETH-1",
        title="Fix typo",
        description="Fix typo in README",
        status="In Progress",
    )

    story = format_story_offline(task)
    assert "<li>" in story.acceptance_criteria_html
    assert "implemented and functional" in story.acceptance_criteria_html


def test_map_to_fibonacci():
    """Test mapping arbitrary integers to Fibonacci values."""
    assert _map_to_fibonacci(1) == FibonacciEffort.XS
    assert _map_to_fibonacci(2) == FibonacciEffort.S
    assert _map_to_fibonacci(3) == FibonacciEffort.M
    assert _map_to_fibonacci(4) == FibonacciEffort.L  # rounds to 5
    assert _map_to_fibonacci(5) == FibonacciEffort.L
    assert _map_to_fibonacci(7) == FibonacciEffort.XL  # rounds to 8
    assert _map_to_fibonacci(10) == FibonacciEffort.XL  # rounds to 8
    assert _map_to_fibonacci(15) == FibonacciEffort.XXL  # rounds to 13
    assert _map_to_fibonacci(21) == FibonacciEffort.EPIC
    assert _map_to_fibonacci(100) == FibonacciEffort.EPIC  # caps at 21


def test_estimate_effort_offline():
    """Test offline effort estimation based on task complexity."""
    # Simple task
    simple = BacklogTask(task_id="1", title="Fix typo", status="In Progress")
    assert _estimate_effort_offline(simple).value <= 3

    # Complex task
    complex_task = BacklogTask(
        task_id="2",
        title="Build auth system",
        description="A" * 600,  # Long description
        status="In Progress",
        acceptance_criteria=["AC1", "AC2", "AC3", "AC4", "AC5"],
        priority="high",
        plan="Detailed plan here",
    )
    assert _estimate_effort_offline(complex_task).value >= 5


# ---------------------------------------------------------------------------
# Webhook / Task ID Extraction Tests
# ---------------------------------------------------------------------------

def test_extract_task_id_from_branch():
    """Test task ID extraction from branch names (used by webhook handler)."""
    from app.main import _extract_task_id

    # Beth branch conventions
    assert _extract_task_id("beth-42-implement-auth", "", "") == "BETH-42"
    assert _extract_task_id("BETH-42/implement-auth", "", "") == "BETH-42"
    assert _extract_task_id("epic/beth-42", "", "") == "BETH-42"

    # Subtask IDs
    assert _extract_task_id("beth-1.2-subtask", "", "") == "BETH-1.2"

    # Fallback to PR title/body
    assert _extract_task_id("feature/unrelated", "BETH-42: Fix auth", "") == "BETH-42"
    assert _extract_task_id("feature/unrelated", "", "Fixes beth-42") == "BETH-42"

    # No match
    assert _extract_task_id("feature/unrelated", "No task here", "Nothing") is None


def test_extract_commits_from_body():
    """Test commit message extraction from PR body."""
    from app.main import _extract_commits_from_body

    body = """## Summary
- abc1234 BETH-42: implement auth middleware
- def5678 BETH-42: add rate limiting
- ghi9012 BETH-42: fix tests
"""
    commits = _extract_commits_from_body(body)
    assert len(commits) == 3
    assert "implement auth middleware" in commits[0]


def test_verify_signature():
    """Test GitHub webhook HMAC signature verification."""
    import hashlib
    import hmac as hmac_mod
    from app.main import _verify_signature

    secret = "test-secret"
    body = b'{"action": "opened"}'
    expected = hmac_mod.new(secret.encode(), body, hashlib.sha256).hexdigest()
    sig = f"sha256={expected}"

    assert _verify_signature(body, sig, secret) is True
    assert _verify_signature(body, "sha256=bad", secret) is False
    assert _verify_signature(body, "invalid", secret) is False


# ---------------------------------------------------------------------------
# Backlog Parser: Beth-prefix filenames
# ---------------------------------------------------------------------------

def test_beth_prefix_filename_parsing():
    """Test that files with beth- prefix are parsed correctly."""
    task = parse_task_content("Body text", "beth-58 - Commit-ADO-Sync-implementation.md")
    assert task.task_id == "beth-58"
    assert "Commit" in task.title
    assert "ADO" in task.title

    # Dashes in title are converted to spaces
    task = parse_task_content("Body", "beth-1.3 - Update-doctor-for-no-db-mode.md")
    assert task.task_id == "beth-1.3"
    assert "Update" in task.title


def test_frontmatter_overrides_filename():
    """Frontmatter ID and title should take priority over filename."""
    md = """---
id: BETH-99
title: Real title from frontmatter
status: To Do
---
Body content.
"""
    task = parse_task_content(md, "beth-99 - Wrong-title-from-filename.md")
    assert task.task_id == "BETH-99"
    assert task.title == "Real title from frontmatter"
