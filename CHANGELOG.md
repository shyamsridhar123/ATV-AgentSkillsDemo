# Changelog

> *"Here's what changed. I don't repeat myself."*

All notable changes to Beth are documented here. Format based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

## [2.1.0] - 2026-03-16

### Added
- **`npx beth-copilot uninstall` command** — Cleanly removes all Beth-installed files from a project: `.github/agents/`, `.github/skills/`, `.github/hooks/`, `AGENTS.md`, `Backlog.md`, `.github/copilot-instructions.md`, `.vscode/settings.json`, `mcp.json.example`, and `backlog/` directory. Removes Beth guard block from pre-push hook (preserving non-Beth content). Cleans up empty `.github/` and `.vscode/` directories. 17 tests covering all removal paths.
- **Auto-derived backlog prefix** — `backlog init` during `beth-copilot init` now automatically derives a 6-letter prefix from the project name (e.g., `my-app` → `MYAPP`), eliminating the interactive prompt that blocked agent workflows.

### Fixed
- **Shell command injection in backlog init** — Fixed GHAS-flagged command injection vulnerability where unsanitized project directory names were interpolated into shell commands. Now validates input against a strict allowlist pattern before use.

### Changed
- **885 tests** — Up from 860 in v2.0.0. Added uninstall command tests and init prefix derivation coverage.

## [2.0.0] - 2026-03-16

### Breaking Changes
- **Beads removed — Backlog.md is the sole task tracker.** The entire beads/Dolt database layer has been removed. All agent instructions, hooks, and CLI commands now use `backlog` CLI exclusively. If you were using `bd` commands in scripts, they will no longer be referenced by Beth agents.
- **`npx beth-copilot close` command removed** (~560 lines deleted). This command enforced beads-specific close logic (blocker deps, child issues, mandatory test subtasks via `bd`). The workflow is now handled by `backlog task edit BETH-X -s "Done" --plain`.

### Added
- **Backlog.md CLI integration** — All agent instructions now reference `backlog task create`, `backlog task edit`, `backlog task list`, `backlog board`, and `backlog overview` commands. The `--plain` flag is enforced everywhere to prevent TUI mode in agent contexts.
- **`npx beth-copilot update` command** — Updates project files to latest templates without full re-init. Supports `--check-only` for dry-run inspection.
- **Behavioral skill tests** — 302 E2E skill routing tests across 3 files validating deterministic hook injection, trigger coverage, and mapping completeness.
- **SubagentStart/SubagentStop hook enforcement** — `inject-skills.mjs` deterministically maps agent types to required skills. `verify-skills.mjs` gates subagent completion on both skill compliance and task tracking.
- **Hub-and-spoke agent coordination** — Replaced 15 lateral handoffs across 6 agents with single "Escalate to Beth" handoff per agent. All agents now report to Beth.
- **Community skills** — Added brainstorming, framer-components, frontend-design, proof, rclone, feature-video, and other community-contributed skill modules.
- **27+ Azure skills** — Full Azure skill suite: compute, storage, AI, messaging, diagnostics, compliance, RBAC, cost optimization, cloud migration, resource lookup/visualizer, Entra ID, Copilot SDK, Foundry, and more.
- **860 tests** — Up from 438 in v1.1.0. Comprehensive coverage for CLI commands, skill routing, hook injection, pipeline integration, and path validation.

### Changed
- **Agent instructions rewritten for Backlog.md** — All 7 agent files (`beth.agent.md`, `developer.agent.md`, etc.) and `AGENTS.md` updated to reference `backlog` CLI instead of `bd` commands.
- **Hook enforcement updated** — `verify-skills.mjs` now checks for `backlog task edit` compliance instead of `bd` commands.
- **Templates synced** — All template files in `templates/` now match live `.github/` configuration.
- **Test framework consolidated** — Migrated from mixed `node:test`/vitest to vitest-only imports across all test files.

### Removed
- **`beth-copilot close` command** — Entire close command and its 560-line implementation deleted.
- **Beads stub functions** — Removed `bd`-related stubs from `bin/cli.js`.
- **Dead code cleanup** — Removed 8 redundant/deprecated skills, unused `bs-buster` dependency, dead `bin/lib` files, legacy test scripts, empty barrel exports, and orphaned documentation.
- **Dolt/beads references** — Purged from all production source code, agent instructions, templates, and documentation.

### Fixed
- **Template drift** — Templates now stay in sync with live `.github/` config via the `update` command.
- **Duplicate tools in beth.agent.md** — Removed duplicate tool entries in frontmatter.
- **Dead pathValidation.ts exports** — Cleaned unused exports that inflated the public API surface.
- **Pre-push guard test isolation** — Removed unused `child_process` mock that caused CI failures.

---

## [1.1.0] - 2026-03-10

### Added
- **`npx beth-copilot land` command** — Automates session completion: verifies epic branch, runs tests, backs up beads, stages/commits/pushes, verifies sync. Options: `--skip-tests`, `--skip-backup`, `--message/-m`, `--force`, `--dry-run`. Protected branch blocking, epic ID extraction for commit prefixes, non-blocking beads backup, structured step results.
- **`npx beth-copilot close` enforcement** — 3-layer close enforcement: (1) open blocker dependencies via `bd dep list`, (2) open children via `bd children`, (3) mandatory test subtasks (unit/e2e/security) for epics. `--force` bypasses all checks.
- **Pre-push hook** — Git pre-push hook enforcing branch discipline: blocks pushes from `main`/`master` (exit 1), warns on non-epic branch names. Pure shell hook (no Node overhead). Auto-installed during `npx beth-copilot init`. Bypass with `BETH_SKIP_PUSH_GUARD=1`.
- **Quality gate infrastructure** — `npm run test:gate` generates markdown test reports to `docs/test-reports/`. `scripts/quality-gate.mjs` runs vitest + legacy tests, parses results, generates report, exits non-zero on failure.
- **Comprehensive CLI test suite** — 7 new test files: `close.e2e.test.ts`, `pre-push-guard.e2e.test.ts`, `quickstart-expanded.e2e.test.ts`, `cli-edge-cases.e2e.test.ts`, `framework-isolation.test.ts`, `init-logic.e2e.test.ts`, `doctor.e2e.test.ts`. 438 tests total.
- **Doctor: Dolt database hygiene** — `checkDoltDatabases()` detects orphaned `*test*` databases and warns when user DB count exceeds threshold. Extracted `parseDoltDatabases()` with 18 unit tests.
- **Session startup drift-prevention** — Mandatory 4-step session startup checklist in AGENTS.md: check uncommitted changes, unpushed commits, spot-check closed work, sync beads state.
- **Beads disaster recovery docs** — `docs/BD-BACKUP-PARSER-FAILURE.md` with exact parser error, root cause, repro steps, and 3 recovery paths.
- **Mandatory test subtask rules** — Epic creation patterns now require unit/E2E/security test subtasks across all agent files.

### Changed
- **Hub-and-spoke agent coordination** — Replaced 15 lateral handoffs across 6 agents with single "Escalate to Beth" handoff per agent. Before: 15-edge mesh where agents bypassed orchestration. After: all agents report to Beth.
- **Skill routing optimization** — Added Skill Routing Table to Beth agent. Subagent templates restructured with explicit skill loading instructions. All 8 skills wired to agents (zero orphaned).
- **Shared boilerplate extraction** — Replaced ~120 lines of duplicated Work Tracking + Team Coordination across 12 files with compact AGENTS.md reference. Net -260 lines.
- **Areas of Expertise** migrated to compact on-demand pointers — net -135 lines across 6 agents.
- **Landing command hardening** — `isUpToDateWithOrigin` rewritten to compare SHA refs directly, `remoteBranchExists()` helper, `gitRebaseAbort()` for conflict recovery.
- **Simplified architecture diagrams** — All mermaid diagrams in README.md and SYSTEM-FLOW.md rewritten for accuracy. Removed fake component references that don't exist in src/.
- **Standardized on npm** — Removed `pnpm-lock.yaml`, regenerated `package-lock.json`, added `packageManager` field.

### Fixed
- **Pre-push-guard E2E branch assumptions** — Reworked E2E harness to create temporary git repos on explicit branches instead of assuming CI branch state.
- **Framework isolation** — Fixed `beforeAll`/`afterAll` imports from `node:test` (doesn't export those names; vitest alias masked the problem).
- **hasStagedChanges false positives** — Now distinguishes exit-1 (diffs) from unexpected errors.
- **Rebase conflict handling** — Land command now aborts cleanly on rebase conflicts instead of proceeding to push.
- **Beads E2E test pollution** — `beforeAll` safety net batch-deletes stale test issues from previous failed runs.
- **Beads database recovery** — Documented recovery from Dolt server database loss after orphaned test DBs overloaded server.

---

## [1.0.18] - 2026-03-06

### Changed
- **Simplified architecture diagrams** — Cleaned up README mermaid charts, removed A2A branding
- **Session branch workflow** — Automatic epic branch creation and PR-on-landing patterns

---

## [1.0.15] - 2026-02-19

### Added
- **LLM Provider abstraction** — Azure OpenAI provider with Entra ID auth, streaming support, retry logic, and full TypeScript types
- **E2E test suite** — MCP validation, help command, init-to-doctor pipeline tests
- **485 tests passing** — Comprehensive unit and integration test coverage

### Changed
- **Optional Azure dependencies** — `openai` and `@azure/identity` added as optionalDependencies so users only install them when needed
- **README rewritten** — Architecture diagrams, tech stack docs, CLI/MCP/provider documentation

### Fixed
- **CodeQL security fixes** — Shell command built from environment values, incomplete URL substring sanitization
- **Package-lock sync** — package-lock.json synced with package.json

---

## [1.0.14] - 2026-02-04

### Changed
- **User-friendly error messages** — CLI errors now display formatted boxes with clear problem descriptions, fix instructions, and the exact command to run. No more raw stack traces.

---

## [1.0.13] - 2026-02-04

### Fixed
- **ENOTDIR crash during init** — Fixed `copyDirRecursive` crashing when destination path exists as a file instead of a directory. Now properly detects the conflict and provides a clear error message (or removes the file with `--force`).

---

## [1.0.12] - 2026-02-01

### Changed
- Added CHANGELOG.md to npm package

---

## [1.0.11] - 2026-02-01

### Changed
- Reverted to fire animation for BETH banner (the way it should be)

### Fixed
- SBOM regeneration for accurate dependency tracking

---

## [1.0.10] - 2026-01-31

### Added
- **Path validation security** — 33 tests covering traversal detection, injection prevention, and allowlist validation
- **Work tracking for all agents** — Every agent now uses the dual tracking system (beads for agents, Backlog.md for humans)
- **Cross-platform npm installation** — Consistent installation across macOS, Linux, and Windows

### Security
- Path validation for user-supplied binary paths to prevent command injection
- Documented shell:true security constraints in SECURITY.md

---

## [1.0.6] - 2026-01-29

### Added
- **Multi-agent coordination system** — Epic patterns with dependencies, parallel execution, and hierarchical issue tracking
- **Beads integration** — Structured work tracking with `bd` CLI for agent memory and coordination
- **Subagent templates** — Ready-to-use patterns for spawning specialists

### Changed
- Beth instructions now include full orchestration workflows
- Updated SYSTEM-FLOW.md with multi-agent patterns

---

## [1.0.5] - 2026-01-28

### Added
- Beads multi-agent coordination documentation

---

## [1.0.4] - 2026-01-27

### Added
- **backlog.md CLI installation prompt** — Auto-prompts during init for human-readable tracking
- **.vscode/settings.json template** — Auto-configured agent settings for VS Code

---

## [1.0.3] - 2026-01-26

### Added
- **Version check** — CLI warns users when a newer version is available

---

## [1.0.2] - 2026-01-25

### Added
- **Security automation** — GitHub Actions workflow with npm audit, gitleaks, CodeQL, SBOM generation
- **Pre-commit hooks** — Secret scanning with gitleaks before commits
- **Subagent delegation settings** — Documentation for enabling autonomous agent coordination

### Changed
- Clarified Product Manager vs UX Designer roles in documentation

### Fixed
- Security hardening for enterprise production readiness

---

## [1.0.1] - 2026-01-24

### Added
- **Security Reviewer agent** — OWASP Top 10, compliance audits, threat modeling
- **Security Analysis skill** — Vulnerability assessment workflows
- **MCP setup guide** — docs/MCP-SETUP.md with all optional servers
- **Installation guide** — docs/INSTALLATION.md with full setup instructions
- **Dependabot configuration** — Weekly npm/GH Actions updates with grouped PRs

### Changed
- **Consolidated frontend-engineer into developer** — Developer now handles UI, full-stack, and shadcn-ui MCP integration
- Updated all agent handoffs to include security-reviewer

### Security
- Full enterprise security review completed
- HIGH findings addressed
- SECURITY.md created with security policies

---

## [1.0.0] - 2026-01-23

### Added
- **Beth orchestrator** — The ruthless, hyper-competent AI coordinator
- **Six specialist agents** — Product Manager, Researcher, UX Designer, Developer, Tester, (later Security Reviewer)
- **Five skills** — PRD generation, Framer components, Vercel React best practices, Web Design guidelines, shadcn-ui
- **npm package** — `npx beth-copilot init` for one-command installation
- **IDEO Design Thinking workflow** — Empathize → Define → Ideate → Prototype → Test
- **Dual tracking system** — beads for agents, Backlog.md for humans
- **ASCII art animation** — Beth's entrance with fire effect banner

### Architecture
- Agent definition format with YAML frontmatter
- Skills as domain-knowledge modules loaded on-demand
- Subagent vs handoff patterns for different control levels
- Hierarchical issue tracking for complex workflows

---

## What's Next

See [Backlog.md](Backlog.md) for planned work:
- MCP skill enhancements (web search, Playwright, Azure, Microsoft Learn)
- Agent consistency review
- Additional skills for API security and performance profiling

---

*"That's the history. Now stop looking backward and let's build something."*
