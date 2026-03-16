# PRD: v1.1.1 — CLI Invocation Fix + Doctor Hardening

## Introduction

Beth v1.1.0 shipped with two bugs in its own toolchain and a gap in its health check system. The CLI's primary entry point (`npx beth-copilot`) fails with "beth: not found" because `package.json` maps `bin.beth` instead of `bin.beth-copilot`. Doctor reports a false failure for backlog.md when the CLI binary isn't installed but the project config exists. And doctor doesn't detect orphaned Dolt processes or validate JSONL-only operation in no-db mode — leaving users blind to the most common failure modes.

These are trust-eroding defects. Every broken `npx beth-copilot` command in our docs, AGENTS.md, and agent instructions directs users to a dead path. A health check that cries wolf trains people to ignore it. And silent Dolt zombies are the #1 cause of beads confusion.

**Epic:** beth-xx7, beth-jj7, beth-m1i
**Target Version:** 1.1.1

## Goals

- Every `npx beth-copilot <command>` invocation works without workarounds
- Doctor produces zero false positives in a correctly configured project
- Doctor detects orphaned Dolt processes and warns users in no-db mode
- Doctor validates JSONL file integrity (parseable JSON on every line)
- All changes ship with tests — no exceptions

## User Stories

### US-001: Fix `npx beth-copilot` command resolution
**Description:** As a Beth user, I want `npx beth-copilot init` to work so that I can follow the installation docs without hitting "beth: not found."

**Acceptance Criteria:**
- [ ] `package.json` `bin` field maps `"beth-copilot"` (not just `"beth"`) to `bin/cli.js`
- [ ] `npx beth-copilot init` executes successfully in a fresh project
- [ ] `npx beth-copilot doctor` executes successfully
- [ ] `npx beth-copilot close <id>` executes successfully
- [ ] `npx beth-copilot land` executes successfully
- [ ] `npx beth-copilot update` executes successfully
- [ ] `npx beth-copilot --help` prints help text
- [ ] Backward compat: `npx beth` still works (keep both bin entries)
- [ ] Works on Linux and macOS (shebang `#!/usr/bin/env node`)
- [ ] Unit test verifies `package.json` bin field contains `beth-copilot` key
- [ ] Typecheck passes

**RICE:** Reach: 100% | Impact: 3 | Confidence: 100% | Effort: 0.25 wk → **Score: 1200**

---

### US-002: Fix doctor backlog.md false failure
**Description:** As a Beth user running `npx beth-copilot doctor`, I want the backlog check to pass when my project has `backlog/config.yml` so that I trust doctor output.

**Acceptance Criteria:**
- [ ] Doctor passes backlog check when `backlog/config.yml` exists (current behavior — already correct)
- [ ] Doctor warns (not fails) when backlog CLI binary isn't in PATH but config exists
- [ ] Doctor check status is `warn` (not `fail`) for missing CLI — this is a soft dependency
- [ ] Message clarifies: "backlog CLI not found in PATH (optional)" instead of current "backlog/ not initialized"
- [ ] Existing unit tests updated to cover warn vs fail distinction
- [ ] Typecheck passes

**RICE:** Reach: 100% | Impact: 1 | Confidence: 100% | Effort: 0.25 wk → **Score: 400**

---

### US-003: Doctor detects orphaned Dolt processes
**Description:** As a Beth maintainer running in no-db mode, I want doctor to warn me when Dolt server processes are still running so that I know to clean them up.

**Acceptance Criteria:**
- [ ] Doctor checks for running `dolt sql-server` processes (via `pgrep -f "dolt sql-server"` or `/proc` scan)
- [ ] When Dolt processes found AND `no-db: true`: status `warn` with message "Orphaned Dolt processes detected — kill with: pkill -f 'dolt sql-server'"
- [ ] When Dolt processes found AND no-db NOT set: status `info` (expected)
- [ ] When no Dolt processes: check is silent (no output, no pass message)
- [ ] Cross-platform: works on Linux, degrades gracefully on macOS (no `/proc`)
- [ ] Unit tests mock process detection for both scenarios
- [ ] Typecheck passes

**RICE:** Reach: 30% (no-db users) | Impact: 2 | Confidence: 80% | Effort: 0.5 wk → **Score: 96**

---

### US-004: Doctor validates JSONL file integrity
**Description:** As a beads user in no-db mode, I want doctor to verify my JSONL files are parseable so that I catch corruption before it causes silent data loss.

**Acceptance Criteria:**
- [ ] Doctor reads each line of `.beads/backup/issues.jsonl` and validates it's parseable JSON
- [ ] Corrupt lines (invalid JSON) reported with line number and first 80 chars of content
- [ ] Status `fail` if any line is unparseable (data integrity is non-negotiable)
- [ ] Status `pass` if all lines parse and count > 0
- [ ] Status `warn` if file empty or missing
- [ ] Performance: scan completes in < 500ms for files up to 1000 lines
- [ ] Check runs ONLY when `no-db: true` is set (don't validate for Dolt-backed projects)
- [ ] Unit tests cover: valid file, corrupt line, empty file, missing file
- [ ] Typecheck passes

**RICE:** Reach: 30% (no-db users) | Impact: 3 | Confidence: 90% | Effort: 0.5 wk → **Score: 162**

---

### US-005: Doctor validates metadata.json is not corrupt
**Description:** As a beads user, I want doctor to catch corrupt `metadata.json` before it silently changes my database name to "beads" (the fallback) and breaks all operations.

**Acceptance Criteria:**
- [ ] Doctor reads `.beads/metadata.json` and validates it's parseable JSON
- [ ] If JSON is corrupt or has dangling characters: status `fail` with message "metadata.json is corrupt — beads will fall back to 'beads' as database name, which breaks all operations"
- [ ] If JSON is valid and contains `database` key: status `pass`
- [ ] If file missing: status `warn` (not blocking)
- [ ] Unit tests cover: valid JSON, corrupt JSON (dangling `}`), missing file
- [ ] Typecheck passes

**RICE:** Reach: 100% | Impact: 2 | Confidence: 100% | Effort: 0.25 wk → **Score: 800**

---

### US-006: Tests for all doctor hardening
**Description:** As a developer, I want comprehensive tests for all new doctor checks so that regressions are caught automatically.

**Acceptance Criteria:**
- [ ] Unit tests for `checkDoltProcesses()` — mocked process detection
- [ ] Unit tests for JSONL integrity validation — valid, corrupt, empty, missing
- [ ] Unit tests for metadata.json validation — valid, corrupt, missing
- [ ] Unit test for `package.json` bin field — both `beth` and `beth-copilot` keys present
- [ ] E2E test: `npx beth-copilot doctor` runs end-to-end without errors
- [ ] All existing doctor tests still pass
- [ ] `npm test` passes with 0 failures
- [ ] Typecheck passes

**RICE:** Reach: 100% | Impact: 2 | Confidence: 100% | Effort: 0.5 wk → **Score: 400**

## Functional Requirements

- FR-1: `package.json` `bin` field must include `"beth-copilot": "bin/cli.js"` (keep `"beth"` for backward compat)
- FR-2: `checkBacklogInit()` must return `warn` (not `fail`) when backlog CLI is missing but `backlog/config.yml` exists
- FR-3: New `checkDoltProcesses()` function detects running `dolt sql-server` processes
- FR-4: New JSONL integrity check validates every line is parseable JSON
- FR-5: New `checkMetadataJson()` validates `.beads/metadata.json` is well-formed
- FR-6: All new checks are exported and individually testable
- FR-7: Doctor output groups checks by category (Beads, Backlog, CLI)

## Non-Goals (Out of Scope)

- **No Dolt process auto-kill** — doctor warns, user decides when to kill
- **No JSONL auto-repair** — integrity check detects corruption, doesn't fix it
- **No multi-provider LLM support** — that's v1.2.0
- **No `userVisible` frontmatter** — that's a VS Code platform feature request
- **No Dolt artifact cleanup** — that's beth-ajg.6, time-gated to March 17

## Technical Considerations

- `package.json` bin change is the simplest fix but requires `npm publish` to take effect for `npx` users
- Process detection (`pgrep`) varies across platforms — use `child_process.execSync` with try/catch
- JSONL integrity check must handle files with 100+ lines efficiently — read line-by-line, don't `JSON.parse` the entire file
- `metadata.json` is tracked in git (intentionally not gitignored) — corruption can come from Dolt init or manual edits
- All new doctor functions follow existing pattern: `(cwd: string) => CheckResult | CheckResult[]`

## Success Metrics

| Metric | Baseline (v1.1.0) | Target (v1.1.1) | How Measured |
|--------|-------------------|-----------------|--------------|
| `npx beth-copilot` success rate | 0% (broken) | 100% | Manual test + CI |
| Doctor false positives per run | 1 (backlog) | 0 | Doctor output |
| Orphaned Dolt process detection | 0% (invisible) | 100% | Doctor check output |
| JSONL corruption detection | 0% (silent) | 100% | Doctor check output |
| Test count | 471 | 490+ | `npm test` |

## Priority Order (RICE-Ranked)

| # | Story | RICE | Effort |
|---|-------|------|--------|
| 1 | US-001: Fix `npx beth-copilot` | 1200 | 0.25 wk |
| 2 | US-005: Validate metadata.json | 800 | 0.25 wk |
| 3 | US-002: Fix backlog false positive | 400 | 0.25 wk |
| 4 | US-006: Comprehensive tests | 400 | 0.5 wk |
| 5 | US-004: JSONL integrity check | 162 | 0.5 wk |
| 6 | US-003: Dolt process detection | 96 | 0.5 wk |

**Total estimated effort:** 2 person-weeks

## Open Questions

1. Should `beth` remain as a bin alias, or should we migrate entirely to `beth-copilot`? (Recommendation: keep both — `beth` is shorter for power users)
2. Should JSONL integrity check also validate `dependencies.jsonl`, `events.jsonl`, and `config.jsonl`? (Recommendation: start with `issues.jsonl` only — it's the critical path)
3. Should doctor auto-detect the Dolt circuit breaker error we hit this session and provide specific guidance? (Recommendation: yes — it's the most confusing error users see)
