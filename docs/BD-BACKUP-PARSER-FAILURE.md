# bd Backup Parser Failure

This documents the `bd backup` / `bd backup status` failure:

```text
Error: failed to parse backup state: invalid character '<' looking for beginning of value
```

## What Failed

`bd` reads backup metadata from `backup_state.json` before running JSONL backup logic.
If that file contains invalid JSON, both of these commands can fail:

```bash
bd backup --force
bd backup status --json
```

## Root Cause

The failure was caused by a corrupted backup state file:

```text
.beads/backup/backup_state.json
```

In the reproduced failure, the file contained merge-conflict markers:

```text
<<<<<<< HEAD
{
=======
}
>>>>>>> branch
```

That is not valid JSON, so `bd` fails while unmarshalling the file.

## Important Worktree Detail

In a git worktree, `bd` resolves `.beads` from the main repository first.
That means a failure seen from a worktree (e.g. `/tmp/beth-pr46`) can still be
caused by the main repository file at:

```text
$REPO_ROOT/.beads/backup/backup_state.json
```

where `$REPO_ROOT` is the path to your main checkout (find it with `git worktree list`).
Do not assume the worktree-local `.beads` copy is the one being read.

## Repro Steps

These steps intentionally corrupt the backup state file. Only use them when
debugging.

### 1. Save a known-good copy

```bash
cd "$REPO_ROOT"  # your main repo checkout, e.g. ~/repos/beth
cp .beads/backup/backup_state.json /tmp/beth-main-backup-state.good.json
```

### 2. Corrupt the file with invalid JSON

```bash
printf '<<<<<<< HEAD\n{\n=======\n}\n>>>>>>> branch\n' > .beads/backup/backup_state.json
```

### 3. Run the failing command

```bash
bd backup --force
```

Expected result:

```text
Error: failed to parse backup state: invalid character '<' looking for beginning of value
```

You can confirm the same parser failure through status:

```bash
bd backup status --json
```

## Resolution Steps

### Option 1: Restore from git HEAD

Use this when the committed file is known-good.

```bash
cd "$REPO_ROOT"
git show HEAD:.beads/backup/backup_state.json > .beads/backup/backup_state.json
bd backup status --json | head -40
bd backup --force
```

This is the safest recovery path when the file is tracked and healthy in git.

### Option 2: Restore from a manual saved copy

Use this only if you already saved a clean version before debugging.

```bash
cd "$REPO_ROOT"
cp /tmp/beth-main-backup-state.good.json .beads/backup/backup_state.json
bd backup status --json | head -40
bd backup --force
```

### Option 3: Reset the backup watermark file

If you cannot recover the file contents but can tolerate a fresh full export,
remove the corrupted state file and force a new backup.

```bash
cd "$REPO_ROOT"
rm .beads/backup/backup_state.json
bd backup --force
```

Consequence:

- Incremental backup watermarks are lost.
- `bd` will rebuild `backup_state.json` from a fresh backup run.

## Validation

After recovery, both commands should succeed:

```bash
bd backup status --json | head -40
bd backup --force
```

Expected healthy output includes a `jsonl` section with fields like:

```json
{
  "jsonl": {
    "last_dolt_commit": "...",
    "last_event_id": 0,
    "timestamp": "...",
    "counts": {
      "issues": 88,
      "events": 232
    }
  }
}
```

## Summary

- Symptom: `bd backup` fails with `failed to parse backup state`
- Cause: invalid JSON in `.beads/backup/backup_state.json`
- Worktree caveat: `bd` may read the main repo `.beads` first
- Fastest safe fix: restore `backup_state.json` from `git HEAD`
- Last-resort fix: delete the file and rerun `bd backup --force`