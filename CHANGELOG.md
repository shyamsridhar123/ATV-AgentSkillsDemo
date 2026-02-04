# Changelog

> *"Here's what changed. I don't repeat myself."*

All notable changes to Beth are documented here. Format based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.14] - 2026-02-04

### Changed
- **User-friendly error messages** — CLI errors now display formatted boxes with clear problem descriptions, fix instructions, and the exact command to run. No more raw stack traces.

---

## [1.0.13] - 2026-02-04

### Fixed
- **ENOTDIR crash during init** — Fixed `copyDirRecursive` crashing when destination path exists as a file instead of a directory. Now properly detects the conflict and provides a clear error message (or removes the file with `--force`).

---

## [Unreleased]

### Added
- **CLI TypeScript foundation** — Migrated CLI to TypeScript with proper build system
- **Doctor command** — `beth doctor` validates installation and configuration
- **Quickstart command** — `beth quickstart` for guided setup
- **Agent schema types** — TypeScript types for agent definitions
- **Unit tests** — 86 tests passing for CLI commands and path validation
- **Architecture diagrams** — Interactive mermaid diagrams with zoom in README

### Changed
- **DEMO.md** — Rewritten with Beth's personality and beads integration
- **P2 backlog completed** — Beth orchestrator references added to all agents, MCP skills updated, documentation fixes

### Fixed
- Removed unnecessary backlog.md CLI dependency
- Fixed security-reviewer.agent.md syntax errors
- Corrected agent/skill counts in help output
- Allowlisted security documentation examples in Gitleaks config

### Documentation
- CLI Architecture guide (docs/CLI-ARCHITECTURE.md)
- CLI Implementation Plan (docs/CLI-IMPLEMENTATION-PLAN.md)

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
