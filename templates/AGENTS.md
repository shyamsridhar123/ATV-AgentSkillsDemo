# Agent Instructions

This project uses [Backlog.md](https://github.com/MrLesk/Backlog.md) for issue tracking.

## Quick Setup

```bash
# Install (choose one)
bun i -g backlog.md
npm i -g backlog.md
brew install backlog-md

# Initialize in your project
backlog init "Project Name"

# Shell completion (optional)
backlog completion install
```

## Quick Reference

```bash
# Create a task
backlog task create "Task title" -d "Description"

# List tasks
backlog task list --plain

# View Kanban board (TUI)
backlog board

# Web UI
backlog browser

# Configure settings
backlog config
```

## Workflow

1. Check available work: `backlog task list`
2. Claim work: `backlog task edit <id> --status "In Progress"`
3. Do the work
4. Complete: `backlog task edit <id> --status "Done"`
5. Commit and push

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **Update Backlog.md** - Move completed tasks, add new items for follow-up work
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git add -A
   git commit -m "description of work"
   git pull --rebase
   git push
   git status  # MUST show "up to date with origin"
   ```
4. **Verify** - All changes committed AND pushed
5. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
