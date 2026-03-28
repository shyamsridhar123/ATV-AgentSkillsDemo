# ADR-002: ADO Sync Python Packaging — How Code Reaches Users

**Status:** Accepted  
**Date:** 2026-03-22  
**Task:** BETH-64.2  
**Deciders:** Beth (orchestrator), Researcher agent  

---

## Context

ADO Sync is a Python service (`ado-sync/`) living inside the `beth` npm package repo. When users install beth-copilot via `npx beth-copilot init`, they need the Python code locally to run the watcher and MCP server. The question: how does Python code get from the npm package to the user's machine?

## Decision

**Bundle `ado-sync/` in the npm package. Copy to `.beth/ado-sync/` during setup.**

This follows the existing `templates/` pattern that beth-copilot already uses for agent definitions, skills, and hooks.

## Options Considered

| Option | Verdict | Reason |
|--------|---------|--------|
| **A: Bundle in npm, copy during init** | **Accepted** | Simplest. Version-locked. Offline-capable. Follows existing `templates/` pattern. |
| **B: Clone from separate GitHub repo** | Rejected | Two repos, git as runtime dep, version drift risk. Over-engineered for ~50KB. |
| **C: Publish to PyPI** | Rejected | Two registries, two release pipelines, version sync complexity. No benefit — ado-sync isn't a standalone tool. |
| **D: GitHub release artifacts** | Rejected | Appropriate for large binaries (MBs). Over-engineered for 50KB source code. |
| **E: Lazy download at use time** | Rejected | Worst UX — "your feature doesn't work because you're offline." |

## Rationale

### Size is a non-issue
The `ado-sync/` directory is ~50-60KB of Python source. For comparison:
- `esbuild` ships ~10MB per platform binary
- `prisma` is ~5MB before engine download
- beth-copilot's existing `templates/` directory already contains 179+ files

### Version synchronization is automatic
Python code version = npm package version. Single `package.json` version field governs both. Zero drift risk.

### Industry precedent
| Tool | Non-JS Component | Strategy |
|------|-----------------|----------|
| esbuild | Go binary (~10MB) | Platform-specific npm packages |
| Turbo | Rust binary | Platform-specific npm packages |
| Prisma | Rust engines (~20-40MB) | Bundled npm + postinstall download |
| Playwright | Browser binaries (~200-600MB) | Separate download command |
| sharp | C library | Platform-specific npm packages |

Platform-specific packages are for compiled binaries. Python source is platform-independent — simple bundling is correct.

## Implementation

### 1. Add to `package.json` `files` array
```json
"files": [
  "bin/",
  "dist/index.*",
  "dist/cli/",
  "dist/core/",
  "dist/lib/",
  "!dist/**/*.test.*",
  "!dist/**/*.e2e.test.*",
  "templates/",
  "ado-sync/app/",
  "ado-sync/requirements.txt",
  "ado-sync/README.md",
  "assets/",
  "sbom.json",
  "CHANGELOG.md"
]
```
Only ship `app/`, `requirements.txt`, `README.md`. NOT `.env`, `.venv/`, tests, or deploy scripts.

### 2. Copy logic during `set-ado-org` / init
- Resolve the npm package root (where `ado-sync/` is bundled)
- Copy `ado-sync/app/` and `ado-sync/requirements.txt` to `.beth/ado-sync/`
- Write `.beth/ado-sync/version.json` with current CLI version
- Create venv and install deps

### 3. Update flow
```
User runs: npx beth-copilot@latest set-ado-org
  → CLI checks .beth/ado-sync/version.json
  → Compares bundled version vs installed version
  → If different: prompt "ADO Sync update available (X → Y). Update? (Y/n)"
  → If yes: backup app/, copy new files, reinstall deps if requirements.txt changed
```

## Consequences

- npm package grows by ~50-60KB (negligible)
- Python code travels through npm registry (unusual but harmless — just files)
- Users who never use ADO Sync download 50KB they don't need (trivial)
- `.beth/ado-sync/version.json` tracks installed Python code version
- No new infrastructure (no PyPI, no separate repo, no release artifacts)
