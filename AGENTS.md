# Agent Instructions

This project uses [Backlog.md](Backlog.md) for task tracking — the single source of truth for both agents and humans.

## Backlog.md CLI Quick Reference

```bash
# See everything at once (use --plain where supported to avoid TUI)
backlog task list --plain              # All tasks grouped by status
backlog task list -s "In Progress" --plain  # Filter by status
backlog board                          # Kanban board (always plain-text)
backlog overview                       # Project health stats (always plain-text)

# Task lifecycle (--plain prevents TUI after mutation)
backlog task create "Title" -d "Description" --plain   # Create
backlog task edit BETH-X -s "In Progress" --plain       # Start
backlog task edit BETH-X -s "Done" --plain              # Close
backlog task edit BETH-X --append-notes "text" --plain  # Add notes

# Search
backlog search "query" --plain         # Fuzzy search across tasks
```

**CRITICAL:** Always use `--plain` flag on commands that support it (`task list`, `task create`, `task edit`, `search`) — without it, these commands open a TUI that agents cannot interact with. Commands like `board` and `overview` are already plain-text.

## Quick Setup

```bash
# Initialize Beth in your project
npx beth-copilot init

# Check system health
npx beth-copilot doctor
```

## Session Startup (MANDATORY)

**Every new session starts by verifying ground truth.** Trackers lie. Code doesn't.

Before picking up new work — even continuing previous work — complete these checks:

### 1. Check for uncommitted changes (formatter reverts)
```bash
git status
git diff --stat
```
Formatters, editors, and VS Code extensions can silently revert agent changes between sessions. If you see unexpected diffs, investigate before proceeding.

### 2. Check for unpushed commits
```bash
git log --oneline origin/$(git branch --show-current)..HEAD
```
If there are unpushed commits from a previous session, push them or understand why they weren't pushed.

### 3. Review task status
```bash
backlog task list --plain              # See all tasks — what's open, done, in progress
backlog task list -s "In Progress" --plain  # What's supposed to be active?
```
If a task says "In Progress" but the work is done, close it: `backlog task edit BETH-X -s "Done"`
If a task says "Done" but the code disagrees, reopen it: `backlog task edit BETH-X -s "In Progress"`

### 4. Spot-check closed work is intact
Pick 1-2 tasks closed in the last session and verify the changes are actually in the code:
```bash
# Example: verify an import was actually added
grep -r "import.*ComponentName" src/
```
If the tracker says "done" but the code disagrees, re-apply the fix.

### The principle: Trust the code, not the tracker

> **War story (March 7, 2026):** A formatter reverted `app/workspace/agents/page.tsx` back to importing the old `WorkspaceAgents` component. The tracker said "routing wired up" but the code was back to the old state. Caught and fixed — but only because we checked.

This can happen to ANY file touched by agents. The most vulnerable are files touched by formatters on save. When in doubt, check the code.

## Workflow

### Simple Tasks
1. Create a task: `backlog task create "Title" -d "Description" --plain`
2. Mark it in progress: `backlog task edit BETH-X -s "In Progress" --plain`
3. Do the work
4. Mark it done: `backlog task edit BETH-X -s "Done" --plain`
5. Commit and push

### Complex Work (Multi-Agent)
1. **Create/checkout** an epic branch from main:

   ```bash
   git fetch origin main
   git checkout -b epic/<epic-id> origin/main
   ```

2. Create a parent task: `backlog task create "Epic title" -d "Description" --plain`
3. Break into subtasks, route to specialists
4. Each subtask: create → assign → work → mark done via `backlog task edit`
5. Push the epic branch
6. **Create a PR to `main`**

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds AND the PR is created.

**MANDATORY WORKFLOW:**

1. **Close tasks** - Mark all completed tasks as done:
   ```bash
   backlog task list -s "In Progress" --plain   # What's still open?
   backlog task edit BETH-X -s "Done" --plain   # Close each completed task
   ```
2. **Run quality gates** (if code changed) - ALL tests must pass:
   ```bash
   npm test                   # Unit + integration tests
   ```
3. **Generate test report** (if code changed):
   ```bash
   npm run test:gate           # Runs tests + generates docs/test-reports/ report
   ```
4. **PUSH TO EPIC BRANCH** - This is MANDATORY:

   ```bash
   git add -A
   git commit -m "<epic-id>: description of work"
   git pull origin "epic/<epic-id>" --rebase
   git push origin "epic/<epic-id>"
   git status  # MUST show "up to date with origin"
   ```

5. **CREATE A PR TO `main`** - Use `gh` CLI to create a pull request:

   ```bash
   gh pr create --base main --head "epic/<epic-id>" --title "<epic-id>: <summary>" --body "## Summary\n<what was done>"
   ```

6. **Share the PR link** with the user
7. **Hand off** - Provide context for next session including the epic ID, branch, and PR URL

**CRITICAL RULES:**

- Work is NOT complete until `git push` succeeds AND the PR is created
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
- The PR is how humans review your work. No PR = no review = no trust.

