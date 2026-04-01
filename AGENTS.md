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

**NEVER DELETE BACKLOG FILES.** Not tasks, not archive, not config. Completed tasks move to `backlog/archive/tasks/` via `backlog task archive BETH-X`. If a merge conflict touches `backlog/`, keep BOTH sides. PR #65 wiped 64 task files during a merge — full forensic recovery required. Check `/memories/backlog-md-cli.md` (Copilot persistent memory) for the full CLI reference and incident details.

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
Use **targeted status queries** — not a bulk dump that can overflow output limits:
```bash
# Targeted queries (USE THESE — small, focused output)
backlog task list -s "To Do" --plain         # What's open and waiting?
backlog task list -s "In Progress" --plain   # What's supposed to be active?

# Only if you need a count of completed work
grep -rl 'status: Done' backlog/tasks/ | wc -l  # How many done tasks?
```

**CRITICAL:** If any command output gets written to a temp file ("Large tool result written to file"), you MUST read that file before proceeding. Do NOT report based on memory.

If a task says "In Progress" but the work is done, close it: `backlog task edit BETH-X -s "Done"`
If a task says "Done" but the code disagrees, reopen it: `backlog task edit BETH-X -s "In Progress"`

**Reporting discipline:** When presenting backlog status to the user:
- Only report tasks that the data shows as open. Never list tasks from memory.
- If suggesting NEW work ideas, verify they don't already exist as completed tasks first.

### 4. Spot-check closed work is intact
Pick 1-2 tasks closed in the last session and verify the changes are actually in the code:
```bash
# Example: verify an import was actually added
grep -r "import.*ComponentName" src/
```
If the tracker says "done" but the code disagrees, re-apply the fix.

### 5. Verify node path in hook configs
Node is installed via nvm, which doesn't add `node` to `PATH` in non-interactive shells. Copilot hooks run via `/bin/sh`, so they need the absolute path.
```bash
# Check that the node path in hook configs matches the active node version
which node                                          # e.g. /home/sschofield/.nvm/versions/node/v24.14.0/bin/node
grep "node" .github/hooks/skill-enforcement.json    # Should show the same absolute path
```
If the paths don't match (e.g. after `nvm install`), update `.github/hooks/skill-enforcement.json` with the correct absolute path. Without this, SubagentStart/SubagentStop hooks fail silently with `node: not found`.

### The principle: Trust the code, not the tracker

> **War story (March 7, 2026):** A formatter reverted `app/workspace/agents/page.tsx` back to importing the old `WorkspaceAgents` component. The tracker said "routing wired up" but the code was back to the old state. Caught and fixed — but only because we checked.

This can happen to ANY file touched by agents. The most vulnerable are files touched by formatters on save. When in doubt, check the code.

### 6. Check memory files for accumulated rules
The paths below are **Copilot persistent memory files** (accessed via the `memory` tool, not the repo filesystem). Review them at session start — they document mistakes that MUST NOT be repeated:
- `/memories/git-workflow-rules.md` — **NEVER commit directly to `main`.** Always branch first. (Incident: March 16, 2026 — 63 tests pushed straight to main.)
- `/memories/github-mcp-limitations.md` — GitHub MCP PR creation ALWAYS fails (403 EMU restriction). Use `gh` CLI instead. Two `gh auth` accounts exist — switch to `stephschofield` before pushing. NEVER touch `shyamsridhar123/ATV-AgentSkillsDemo` — it's not ours.
- `/memories/workflow-epic-reports.md` — Every completed epic requires a completion report (What We Tried, Learned, Completed, What Needs to Change, Recommendations).
- `/memories/workflow-session-startup.md` — Extended session startup checks including backlog file protection and E2E test pre-cleanup rules.
- `/memories/repo/git-workflow.md` — All PRs target `stephschofield/beth`. Confirm with `git remote -v`.

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
- **NEVER commit directly to `main`** — always use a feature/epic branch. Details in Copilot memory: `/memories/git-workflow-rules.md`.
- **Use `gh` CLI for PRs**, NOT GitHub MCP (403 EMU restriction). Check `gh auth status` — must be `stephschofield`, not `sschofield_microsoft`. Details in Copilot memory: `/memories/github-mcp-limitations.md`.
- **All PRs target `stephschofield/beth`** — never push to external repos. Details in Copilot memory: `/memories/repo/git-workflow.md`.
- **Epic completion requires a report** — share What We Tried/Learned/Completed/What Needs to Change with the user. Details in Copilot memory: `/memories/workflow-epic-reports.md`.

