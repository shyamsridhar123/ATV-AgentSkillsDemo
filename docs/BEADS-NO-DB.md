# Beads No-DB Mode: JSONL-Only, Zero Dolt Dependency

> How Beth killed the database and lived to tell about it.

Beads supports a **no-db mode** where all data is stored in plain JSONL files — no Dolt, no SQLite, no daemon, no server. One config flag. That's it.

## Quick Setup

```bash
# 1. Install beads CLI
curl -fsSL https://raw.githubusercontent.com/steveyegge/beads/main/scripts/install.sh | bash

# 2. Initialize in your project
cd /path/to/project
bd init

# 3. Enable no-db mode
# Edit .beads/config.yaml and set:
#   no-db: true

# 4. Verify
bd list          # Should return empty or existing issues
bd --version     # Should show >= 0.59.0
```

## The One Line That Matters

In `.beads/config.yaml`:

```yaml
no-db: true
```

This single flag tells `bd` to:
- **Skip** SQLite/Dolt entirely — no database process, no SQL, no daemon
- **Read** from JSONL files on every command
- **Write** back to JSONL after every mutation
- Store everything as one JSON object per line

**Do NOT install Dolt.** It is not needed. Period.

## File Structure

```
.beads/
├── config.yaml              # Configuration (must have no-db: true)
├── backup/
│   ├── issues.jsonl         # SOURCE OF TRUTH — all issues
│   ├── dependencies.jsonl   # Dependency relationships
│   ├── events.jsonl         # Audit trail / history
│   ├── comments.jsonl       # Issue comments
│   ├── labels.jsonl         # Label definitions
│   ├── config.jsonl         # Internal config state
│   └── backup_state.json    # Backup metadata
└── hooks/                   # Git hooks (optional)
```

The **only files that matter** are `config.yaml` and the `backup/*.jsonl` files. Everything else (dolt/, daemon.log, .db files) is legacy cruft from the database era. Ignore it or `.gitignore` it.

## JSONL Record Format

Each line in `backup/issues.jsonl` is a self-contained JSON object:

```json
{
  "id": "beth-04i",
  "title": "E2E epic test-subtask check",
  "issue_type": "epic",
  "status": "closed",
  "priority": 2,
  "created_at": "2026-03-10T05:04:09Z",
  "created_by": "Stephanie Schofield",
  "owner": "sschofield@microsoft.com",
  "close_reason": "Closed",
  "closed_at": "2026-03-10T05:04:23Z",
  "description": "",
  "acceptance_criteria": "",
  "assignee": null,
  "due_at": null,
  "metadata": "{}"
}
```

No relational joins. No query layer. Beads reads the entire file on startup, operates in memory, writes back on mutation.

## Commands

Every `bd` command works identically in no-db mode — same syntax, same flags, same output. The storage backend is invisible to the user.

### Creating Issues

```bash
# Simple task
bd create "Fix login redirect" -l in_progress

# Epic for complex work
bd create "Auth system overhaul" --type epic -p 1

# Subtask under an epic
bd create "JWT token rotation" --parent <epic-id>

# Task with a dependency (blocked until blocker closes)
bd create "Deploy auth" --deps "<impl-id>"

# Task with description
bd create "Issue title" --description="Detailed description here"
```

### Reading Issues

```bash
bd list                          # All issues (human-readable table)
bd list --json                   # JSON output (most reliable for scripts)
bd show <id>                     # Single issue details
bd show <id> --json              # Single issue as JSON
bd ready                         # Issues with no open blockers
bd dep tree <id>                 # Dependency graph (ASCII tree)
bd dep cycles                    # Detect circular dependencies
```

### Updating Issues

```bash
bd close <id>                              # Close an issue
bd update <id> --status in_progress        # Change status
bd delete <id>                             # Delete an issue
bd delete --from-file <path>               # Batch delete from file of IDs
```

### Epic Management

```bash
bd epic status <id>              # Completion percentage
bd epic close-eligible           # Find epics where all children are closed
```

## Concurrency Rules

**This is the most important section. Read it twice.**

In no-db mode, `bd` performs a full read → modify → write cycle on the JSONL file for every mutation. This creates a classic race condition.

| Operation | Safe in Parallel? | What Happens if Parallel |
|-----------|-------------------|--------------------------|
| `bd list` | ✅ Yes | Read-only, no conflict |
| `bd show` | ✅ Yes | Read-only, no conflict |
| `bd ready` | ✅ Yes | Read-only, no conflict |
| `bd create` | ❌ **NO** | **Duplicate issues** — each process reads same state, both append |
| `bd close` | ⚠️ Tested safe, but don't rely on it | Theoretically risky |
| `bd update` | ❌ **NO** | Last writer wins, changes lost |
| `bd delete` | ❌ **NO** | Last writer wins, deletes lost |

### The Rule

> **All beads write commands (`bd create`, `bd close`, `bd update`, `bd delete`) must execute sequentially. Never in parallel. Never via `Promise.all()`.**

### For Multi-Agent / Subagent Workflows

If an orchestrator spawns multiple subagents that each need to create or close beads issues:

1. **Create all issues sequentially in the orchestrator** BEFORE spawning parallel subagents
2. Each subagent closes its own issue at the END of its work (sequential by nature — they finish at different times)
3. **Never** have two subagents call `bd create` at the same time

```typescript
// ❌ WRONG — parallel creates produce duplicates
await Promise.all([
  exec('bd create "Task A"'),
  exec('bd create "Task B"'),
  exec('bd create "Task C"'),
]);

// ✅ CORRECT — sequential creates
await exec('bd create "Task A"');
await exec('bd create "Task B"');
await exec('bd create "Task C"');
```

## What NOT to Do

| Don't | Why |
|-------|-----|
| Install Dolt | Not needed. no-db mode uses JSONL only. |
| Set `BEADS_DB` environment variable | Forces database mode. Leave it unset. |
| Start any database server or daemon | No server required. `bd` is a standalone CLI. |
| Run `bd init --force` with existing data | **Nukes everything.** Wipes JSONL files. Unrecoverable without git history. |
| Run `bd sync` | Git-based sync mechanism, not needed for single-repo no-db. |
| Run write commands in parallel | Duplicate issues, lost updates. See concurrency rules above. |

## Verification

### Manual Check

```bash
# 1. Confirm no-db mode is enabled
grep 'no-db: true' .beads/config.yaml

# 2. Confirm JSONL has data
wc -l .beads/backup/issues.jsonl

# 3. Confirm bd works
bd list
```

### Programmatic Check (from beth-copilot doctor)

The doctor command validates no-db setup with two checks:

1. **Config check**: Regex `/^no-db:\s*true/m` against `.beads/config.yaml`
2. **JSONL health**: Counts lines in `issues.jsonl` or `backup/issues.jsonl`

```bash
npx beth-copilot doctor
```

Expected output:
```
✓ Beads no-db: no-db mode enabled
✓ JSONL data: 139 issue(s) in JSONL
```

## Minimal .beads/config.yaml

For a fresh project, this is the minimum viable config:

```yaml
# Required: enables JSONL-only storage, no database
no-db: true

# Optional: Git branch for bd sync commits (if using multi-repo sync)
# sync-branch: "beads-sync"
```

## .gitignore for .beads/

Keep config and JSONL data in git. Ignore everything else:

```gitignore
# .beads/.gitignore

# Database artifacts (not used in no-db mode)
*.db*
dolt/
daemon.log
*.pid
*.pid.lock
*.lock
*.port
*.activity
*.log
.local_version

# Keep these (tracked in git):
# config.yaml
# backup/*.jsonl
# hooks/
```

## Migration from Dolt Mode

If you have an existing beads setup with Dolt:

1. **Verify backup JSONL exists and has data:**
   ```bash
   wc -l .beads/backup/issues.jsonl
   # Must be > 0
   ```

2. **Set no-db mode:**
   ```bash
   # Edit .beads/config.yaml
   # Add or change: no-db: true
   ```

3. **Remove BEADS_DB from environment** (check `.env`, `.vscode/mcp.json`, shell profiles):
   ```bash
   grep -r 'BEADS_DB' . --include='*.json' --include='*.env' --include='*.yaml'
   ```

4. **Verify everything works:**
   ```bash
   bd list        # Should show your existing issues
   bd ready       # Should show unblocked issues
   bd create "Migration test" && bd list  # Create and verify
   ```

5. **Stop any running Dolt processes** (optional cleanup):
   ```bash
   pkill -f dolt || true
   ```

6. **Do NOT run `bd init --force`** — this destroys data. The switch is just the config flag.

## Troubleshooting

### `bd list` returns nothing but I had issues

Check both JSONL locations:
```bash
wc -l .beads/issues.jsonl 2>/dev/null
wc -l .beads/backup/issues.jsonl 2>/dev/null
```

If `backup/issues.jsonl` has data but `issues.jsonl` doesn't, beads reads from backup in no-db mode. You're fine.

### `bd show <id>` says "not found" but `bd list` shows the issue

Known intermittent issue with `bd show` ID resolution. Always use `bd list --json` as the reliable source of truth.

### Duplicate issues appearing after parallel creates

You hit the concurrency bug. Fix:
```bash
# Find duplicates
bd list --json | jq -r '.[].title' | sort | uniq -d

# Delete the duplicates manually
bd delete <duplicate-id>
```

Then enforce sequential writes going forward.

### JSONL file is corrupted / parse errors

If a JSONL file has malformed lines:
```bash
# Validate each line
python3 -c "
import json, sys
for i, line in enumerate(open('.beads/backup/issues.jsonl'), 1):
    line = line.strip()
    if line:
        try:
            json.loads(line)
        except json.JSONDecodeError as e:
            print(f'Line {i}: {e}')
"
```

If corruption exists and the file is in git, recover from history:
```bash
git log --oneline -- .beads/backup/issues.jsonl
git show <good-commit>:.beads/backup/issues.jsonl > .beads/backup/issues.jsonl
```

## Summary

| Question | Answer |
|----------|--------|
| Do I need Dolt? | **No.** |
| Do I need SQLite? | **No.** |
| Do I need a database server? | **No.** |
| What do I need? | `bd` CLI + `no-db: true` in config |
| Where is the data? | `.beads/backup/issues.jsonl` (one JSON per line) |
| Can I read it with any text editor? | **Yes.** It's plain text. |
| Can agents write in parallel? | **No.** Sequential writes only. |
| Can agents read in parallel? | **Yes.** Reads are always safe. |
