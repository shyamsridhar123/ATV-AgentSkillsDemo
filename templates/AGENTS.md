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

> **War story (March 7, 2026):** A formatter reverted a critical routing file back to importing an old component. The tracking issue said "routing wired up" but the code was back to the previous state. It was caught and fixed — but only because we checked.

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
