# ADO Sync: Agent Instructions

This project uses **ADO Sync** to automatically create and update Azure DevOps user stories from BacklogMD tasks. ADO Sync runs as a background service. These instructions describe what happens automatically and what you (the agent) must do to ensure stories are created correctly.

## What ADO Sync Does

ADO Sync watches the `backlog/tasks/` directory. When a task's status changes to **"In Progress"**, it automatically:

1. Reads the task markdown file (title, description, acceptance criteria, labels, priority, plan)
2. Sends the task data to Azure OpenAI to generate a formatted ADO user story
3. Creates the user story in Azure DevOps with state "Active"
4. Maps the task ID to the ADO work item ID for later enrichment

When a PR is opened, ADO Sync automatically:

1. Matches the PR to the original ADO story via the task ID in the branch name
2. Links the PR URL and commit messages to the work item
3. Moves the story to "Resolved"

## What You Must Do

### When starting a task

Set the task status to "In Progress" using the `--plain` flag. This is the trigger.

```bash
backlog task edit BETH-X -s "In Progress" --plain
```

ADO Sync handles everything else. You do not need to call any additional commands or APIs. The user story will appear on the client's ADO board within seconds.

### Writing good task content BEFORE starting

ADO Sync uses whatever is in the task file at the moment the status changes. The better the task content, the better the ADO story. Before setting a task to "In Progress", make sure the task has:

**Required:**
- A clear, descriptive **title** (this becomes the story title)
- **Acceptance criteria** as checkbox items under `## Acceptance Criteria`

**Strongly recommended:**
- A **description** under `## Description` explaining what the task achieves and why
- **Labels** for categorization (these become ADO tags)
- **Priority** if applicable

**Optional but helpful:**
- An **implementation plan** under `## Implementation Plan`
- **Notes** under `## Notes`

Example of a well-structured task that produces a good ADO story:

```markdown
---
id: BETH-42
title: Implement JWT auth middleware
status: To Do
labels: [auth, middleware, security]
priority: high
---

## Description
Add JWT-based authentication middleware to the API layer.
Validates tokens on all protected routes and handles refresh seamlessly.

## Acceptance Criteria
- [ ] Middleware validates JWT tokens on protected routes
- [ ] Invalid tokens return 401 with clear error message
- [ ] Token refresh flow is implemented
- [ ] Rate limiting applied to auth endpoints

## Implementation Plan
1. Create middleware function in src/middleware/auth.ts
2. Add to Express route chain
3. Implement token refresh endpoint
```

### Branch naming convention

Include the task ID in the branch name so ADO Sync can match PRs back to stories. Use any of these patterns:

```
beth-42-implement-auth
BETH-42/implement-auth
task-42-auth-middleware
```

### When landing work

Use `beth land` as normal. The PR that Beth opens will be automatically detected by ADO Sync's GitHub webhook. The webhook will:

- Link the PR to the ADO story
- Add commit messages to the story's history
- Move the story to "Resolved"

You do not need to do anything extra.

### MCP tools (optional direct access)

If you need to interact with ADO Sync directly rather than relying on the file watcher, these MCP tools are available:

| Tool | When to Use |
|------|-------------|
| `create_story_from_task(task_id)` | Manually trigger story creation for a specific task |
| `update_story_with_pr(task_id, pr_url, commit_messages)` | Manually link a PR to an existing story |
| `get_story_status(task_id)` | Check if a story already exists for a task |
| `list_recent_stories(limit)` | See recently created stories |

Use these only if the automatic flow did not fire (e.g., the watcher was not running). Under normal operation, you should not need them.

## What NOT to Do

- **Do not** create ADO work items manually or through any other tool. ADO Sync is the single source of truth for the BacklogMD-to-ADO mapping.
- **Do not** set a task to "In Progress" before the task content is ready. ADO Sync creates the story immediately on status change. Update the description and acceptance criteria first, then change the status.
- **Do not** worry about Fibonacci effort estimation, persona-based descriptions, or ADO formatting. ADO Sync and Azure OpenAI handle all of that.
- **Do not** manually link commits or PRs to ADO work items. The GitHub webhook handles this automatically.

## Story Format Reference

For awareness, every ADO story created by ADO Sync follows this format:

- **Title**: Derived from the task title, made client-readable
- **Effort**: Fibonacci scale (1, 2, 3, 5, 8, 13, 21) estimated by AI based on task complexity
- **Description**: "As a [persona], I want to [objective] in order to [key results]."
- **Acceptance Criteria**: Bulleted list derived from the task's checkbox items
- **History**: Includes source BacklogMD task ID, linked PR URL, and commit messages
- **Tags**: Derived from task labels
- **State**: "Active" on creation, "Resolved" when PR is linked

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Story not created | Task set to "In Progress" before watcher started | Use MCP tool `create_story_from_task(task_id)` |
| Story has poor description | Task had no description or AC when status changed | Update the task content, then use MCP tool to recreate |
| PR not linked to story | Branch name doesn't contain task ID | Use MCP tool `update_story_with_pr(task_id, pr_url)` |
| Duplicate story created | Task toggled in/out of "In Progress" | ADO Sync deduplicates by task ID; this should not happen |
