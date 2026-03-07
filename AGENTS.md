# Agent Instructions

This project uses a **dual tracking system**:

| Tool | Audience | Purpose |
|------|----------|---------|
| [beads](https://github.com/steveyegge/beads) (`bd`) | Agents | Active work, dependencies, blockers, structured memory |
| [Backlog.md](Backlog.md) | Humans | Completed work archive, decisions, readable changelog |

**The rule:** beads is always current. Backlog.md gets updated when work completes.

## Quick Setup

```bash
# Install beads
curl -fsSL https://raw.githubusercontent.com/steveyegge/beads/main/scripts/install.sh | bash

# Initialize in your project
bd init

# Run doctor to verify setup
bd doctor
```

## Quick Reference

```bash
# Simple task
bd create "Issue title" --description="What needs to be done" -l in_progress

# Epic for complex work
bd create "Feature name" --type epic -p 1

# Subtask with parent
bd create "Subtask" --parent <epic-id>

# Task with dependency
bd create "Blocked task" --deps "<blocker-id>"

# List issues / see what's ready
bd list
bd ready

# View dependencies
bd dep tree <id>

# Close an issue
bd close <id>
```

## Workflow

### Simple Tasks
1. `bd create "Task" -l in_progress`
2. Do the work
3. `bd close <id>`
4. Update Backlog.md if significant
5. Commit and push

### Complex Work (Multi-Agent)
1. `bd create "Feature" --type epic -p 1`
2. **Create/checkout** the epic branch from main:

   ```bash
   git fetch origin main
   git checkout -b epic/<epic-id> origin/main
   ```

3. Break into subtasks with `--parent` and `--deps`
4. `bd ready` to find unblocked work
5. Route to specialists with issue IDs **and branch name**
6. Close subtasks as they complete
7. `bd epic close-eligible` when all children done
8. Update Backlog.md with summary
9. Push the epic branch
10. **Create a PR to `main`** using GitHub MCP (`mcp_github2_create_pull_request`)

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds AND the PR is created.

**MANDATORY WORKFLOW:**

1. **Close beads issues** - `bd close <id>` for completed work
2. **Create follow-up issues** - `bd create` for any remaining work
3. **Update Backlog.md** - Add summary to Completed section for significant work
4. **Run quality gates** (if code changed) - Tests, linters, builds
5. **PUSH TO EPIC BRANCH** - This is MANDATORY:

   ```bash
   git add -A
   git commit -m "<epic-id>: description of work"
   git pull origin "epic/<epic-id>" --rebase
   git push origin "epic/<epic-id>"
   git status  # MUST show "up to date with origin"
   ```

6. **CREATE A PR TO `main`** - Use GitHub MCP to create a pull request:

   ```text
   mcp_github2_create_pull_request(
     owner: <repo-owner>,
     repo: <repo-name>,
     title: "<epic-id>: <summary of work>",
     head: "epic/<epic-id>",
     base: "main",
     body: "## Summary\n<what was done>\n\n## Epic\n<epic-id>\n\n## Changes\n<list of changes>",
     draft: false
   )
   ```

7. **Share the PR link** with the user
8. **Hand off** - Provide context for next session including the epic ID, branch, and PR URL

**CRITICAL RULES:**

- Work is NOT complete until `git push` succeeds AND the PR is created
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
- The PR is how humans review your work. No PR = no review = no trust.

<!-- BEGIN BEADS INTEGRATION -->
## Issue Tracking with bd (beads)

**IMPORTANT**: This project uses **bd (beads)** for ALL issue tracking. Do NOT use markdown TODOs, task lists, or other tracking methods.

### Why bd?

- Dependency-aware: Track blockers and relationships between issues
- Git-friendly: Dolt-powered version control with native sync
- Agent-optimized: JSON output, ready work detection, discovered-from links
- Prevents duplicate tracking systems and confusion

### Quick Start

**Check for ready work:**

```bash
bd ready --json
```

**Create new issues:**

```bash
bd create "Issue title" --description="Detailed context" --type bug|feature|task -p 0-4 --json
bd create "Issue title" --description="What this issue is about" --type task -p 1 --deps discovered-from:bd-123 --json
```

**Claim and update:**

```bash
bd update <id> --claim --json
bd update bd-42 --priority 1 --json
```

**Complete work:**

```bash
bd close bd-42 --reason "Completed" --json
```

### Issue Types

- `bug` - Something broken
- `feature` - New functionality
- `task` - Work item (tests, docs, refactoring)
- `epic` - Large feature with subtasks
- `chore` - Maintenance (dependencies, tooling)

### Priorities

- `0` - Critical (security, data loss, broken builds)
- `1` - High (major features, important bugs)
- `2` - Medium (default, nice-to-have)
- `3` - Low (polish, optimization)
- `4` - Backlog (future ideas)

### Workflow for AI Agents

1. **Check ready work**: `bd ready` shows unblocked issues
2. **Claim your task atomically**: `bd update <id> --claim`
3. **Work on it**: Implement, test, document
4. **Discover new work?** Create linked issue:
   - `bd create "Found bug" --description="Details about what was found" -p 1 --deps discovered-from:<parent-id>`
5. **Complete**: `bd close <id> --reason "Done"`

### Auto-Sync

bd automatically syncs via Dolt:

- Each write auto-commits to Dolt history
- Use `bd dolt push`/`bd dolt pull` for remote sync
- No manual export/import needed!

### Important Rules

- ✅ Use bd for ALL task tracking
- ✅ Always use `--json` flag for programmatic use
- ✅ Link discovered work with `discovered-from` dependencies
- ✅ Check `bd ready` before asking "what should I work on?"
- ❌ Do NOT create markdown TODO lists
- ❌ Do NOT use external issue trackers
- ❌ Do NOT duplicate tracking systems

For more details, see README.md and docs/QUICKSTART.md.

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds

<!-- END BEADS INTEGRATION -->
