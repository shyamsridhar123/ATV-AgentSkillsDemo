"""Domain models for ADO Sync."""

from pydantic import BaseModel, Field, field_validator
from typing import Optional
from datetime import datetime
from enum import Enum


class FibonacciEffort(int, Enum):
    """Fibonacci scale for story point estimation."""
    XS = 1
    S = 2
    M = 3
    L = 5
    XL = 8
    XXL = 13
    EPIC = 21


class BacklogTask(BaseModel):
    """Parsed BacklogMD task."""
    task_id: str = Field(..., description="Task identifier (e.g., BETH-42)")
    title: str = Field(..., description="Task title")
    description: str = Field(default="", description="Task description body")
    status: str = Field(default="To Do", description="Current status")
    acceptance_criteria: list[str] = Field(default_factory=list, description="List of acceptance criteria")
    labels: list[str] = Field(default_factory=list, description="Task labels")
    assignee: Optional[str] = Field(default=None, description="Assigned agent/person")
    priority: Optional[str] = Field(default=None, description="Task priority")

    @field_validator("assignee", mode="before")
    @classmethod
    def _coerce_assignee(cls, v):
        if isinstance(v, list):
            return v[0] if v else None
        return v or None
    notes: str = Field(default="", description="Implementation notes")
    plan: str = Field(default="", description="Implementation plan")
    raw_content: str = Field(default="", description="Full raw markdown content")


class ADOUserStory(BaseModel):
    """Formatted Azure DevOps user story ready for creation."""
    title: str = Field(..., description="Story title")
    description_html: str = Field(..., description="HTML-formatted description with persona format")
    acceptance_criteria_html: str = Field(..., description="HTML-formatted acceptance criteria")
    effort: FibonacciEffort = Field(..., description="Story points (Fibonacci)")
    tags: str = Field(default="", description="Semicolon-separated tags")
    backlog_task_id: str = Field(..., description="Original BacklogMD task ID")


class ADOWorkItemResult(BaseModel):
    """Result from creating/updating an ADO work item."""
    work_item_id: int = Field(..., description="ADO work item ID")
    url: str = Field(..., description="URL to the work item in ADO")
    title: str = Field(..., description="Work item title")
    state: str = Field(..., description="Work item state")
    backlog_task_id: str = Field(..., description="Linked BacklogMD task ID")
    created_at: datetime = Field(default_factory=datetime.utcnow)


class GitHubPRPayload(BaseModel):
    """Relevant fields from a GitHub PR webhook payload."""
    action: str
    pr_number: int
    pr_title: str
    pr_body: str = ""
    pr_url: str = ""
    branch: str = ""
    repo_full_name: str = ""
    commits: list[dict] = Field(default_factory=list)


class StoryTaskMapping(BaseModel):
    """Maps a BacklogMD task to its ADO work item."""
    task_id: str
    work_item_id: int
    work_item_url: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = None
    pr_linked: bool = False
