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

# Close an issue (enforced — checks for open children)
npx beth-copilot close <id>
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

### 3. Spot-check closed work is intact
Pick 1-2 issues closed in the last session and verify the changes are actually in the code:
```bash
# Example: verify an import was actually added
grep -r "import.*ComponentName" src/
```
If beads says "done" but the code disagrees, reopen the issue and re-apply the fix.

### 4. Sync beads state
```bash
bd list
bd ready
```
Verify beads reflects reality before creating new work.

### The principle: Trust the code, not the tracker

> **War story (March 7, 2026):** A formatter reverted `app/workspace/agents/page.tsx` back to importing the old `WorkspaceAgents` component. Beads issue 9f6 said "routing wired up" but the code was back to the old state. Caught and fixed — but only because we checked.

This can happen to ANY file touched by agents. The most vulnerable are files touched by formatters on save (page.tsx, component files with import changes). When in doubt, check the code.

### Beads known issues

> **War story (March 9, 2026): Test pollution.** E2E tests for `bd` commands create real issues in the Dolt database. If `afterAll` cleanup doesn't run (crash, timeout, process kill), orphan "E2E test:" issues pollute `bd list` and `bd ready`, hiding real work behind 30+ garbage entries. **Fix:** `beads.e2e.test.ts` now runs a `beforeAll` safety net that searches for stale "E2E test:" issues and batch-deletes them before creating new ones. Cleanup also uses `bd delete --from-file` for speed instead of per-issue `execSync` loops.

> **War story (March 9, 2026): Tracking drift.** An epic (beth-gau) was planned in Backlog.md with 7 detailed subtasks but never created in beads. A new session saw the Backlog.md entry, tried `bd show beth-gau`, got "not found" (intermittent ID resolution), and created a duplicate epic. The duplicate was a phantom (Dolt transaction didn't persist). **Fix:** When checking for existing work, always use `bd list --json` as the source of truth — not `bd show`, which has intermittent resolution failures. And ALWAYS create beads issues before (or simultaneously with) Backlog.md entries.

> **Rule: beads and Backlog.md must be created together.** If it's in Backlog.md, it must be in beads. If it's in beads, the summary must be in Backlog.md. One system without the other is a lie waiting to cause damage.

## Workflow

### Simple Tasks
1. `bd create "Task" -l in_progress`
2. Do the work
3. `npx beth-copilot close <id>`
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
4. **Create MANDATORY test subtasks** for every implementation task:
   ```bash
   bd create "Unit tests for <feature>" --parent <epic-id> --deps "<impl-id>"
   bd create "E2E tests for <feature>" --parent <epic-id> --deps "<impl-id>"
   bd create "Security tests for <feature>" --parent <epic-id> --deps "<impl-id>"
   ```
5. `bd ready` to find unblocked work
6. Route to specialists with issue IDs **and branch name**
7. Close subtasks as they complete
8. `bd epic close-eligible` when all children done
9. Update Backlog.md with summary
10. Push the epic branch
11. **Create a PR to `main`** using GitHub MCP (`mcp_github2_create_pull_request`)

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds AND the PR is created.

**MANDATORY WORKFLOW:**

1. **Close beads issues** - `npx beth-copilot close <id>` for completed work
2. **Create follow-up issues** - `bd create` for any remaining work
3. **Update Backlog.md** - Add summary to Completed section for significant work
4. **Run quality gates** (if code changed) - ALL tests must pass:
   ```bash
   npm test                   # Unit + integration tests
   # If failures: create follow-up issues, DO NOT close parent issue
   ```
5. **Generate test report** (if code changed):
   ```bash
   npm run test:gate           # Runs tests + generates docs/test-reports/ report
   ```
6. **PUSH TO EPIC BRANCH** - This is MANDATORY:

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
npx beth-copilot close bd-42 --reason "Completed"
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
5. **Complete**: `npx beth-copilot close <id> --reason "Done"`

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

For more details, see README.md.

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - ALL tests must pass:
   ```bash
   npm test                   # Unit + integration tests
   npm run test:gate           # Generate test report
   # If failures: create follow-up issues, DO NOT close parent issue
   ```
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
