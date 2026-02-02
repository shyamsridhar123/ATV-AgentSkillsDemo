# Backlog

> *"I don't have time to explain things twice. Read this."*

Last updated: 2026-02-01

---

## Completed

| Task | Notes |
|------|-------|
| Add Work Tracking to all agent files | All 7 agents now reference AGENTS.md and use beads + Backlog.md dual tracking |
| Add GitHub Actions security workflow | npm audit, gitleaks, CodeQL, SBOM generation |
| Add pre-commit hooks with gitleaks | Secret scanning before commit |
| Full security review for enterprise readiness | HIGH findings fixed, SECURITY.md created |
| Rebrand orchestrator to Beth | Agent renamed, personality defined |
| Update README with Beth persona | Full rewrite complete |
| Create Backlog.md | Single-source tracking |
| Add hero image to README | Updated to yellowstone-beth.png |
| Add second image to README | beth-questioning.png in Why Beth |
| Rewrite Why Beth section | Positive tone, humor about competence |
| Update README cigarette line | Watching crew build code |
| Consolidate frontend-engineer into developer | Developer now handles shadcn-ui, MCP integration |
| Create security-reviewer agent | Enterprise security, OWASP, threat modeling |
| Create security-analysis skill | Vulnerability assessment workflow |
| Create MCP setup guide | docs/MCP-SETUP.md with all optional servers |
| Update all agent handoffs | security-reviewer and developer wired in |
| Remove beads dependencies | Migrated to backlog.md CLI tool |
| Restore beads with dual tracking | beads for agents, Backlog.md for humans |
| Add multi-agent coordination system | Epic patterns, dependencies, subagent templates |
| Create comprehensive installation guide | docs/INSTALLATION.md with full setup instructions |
| Create npm package | `npx beth-copilot init` for one-command installation |
| Add path validation for binary paths | 33 tests, traversal/injection detection, allowlist validation |
| Document shell:true security constraints | JSDoc in cli.js + Shell Execution section in SECURITY.md |
| Include SBOM in npm package | CycloneDX JSON, auto-generates on publish |
| Add Dependabot configuration | Weekly npm/GH Actions updates, grouped PRs |
| Add Beth orchestrator reference to all agents | 12 agent files updated with Team Coordination section |
| Review copilot-instructions.md consistency | Template fixed, main file already consistent |
| Create web-search skill | .github/skills/web-search/SKILL.md for Brave Search MCP |
| Create azure-operations skill | .github/skills/azure-operations/SKILL.md for Azure MCP |
| Fix MCP-SETUP.md package names | Corrected Brave/Playwright packages, removed nonexistent MS Learn MCP |
| Update tester/developer agents for Playwright | MCP integration patterns added |
| Create PR and review process documentation | CONTRIBUTING.md, PR template, issue templates for bug/feature/security |

---

## In Progress

*Nothing currently in progress.*

---

## Backlog (Prioritized)

### High Priority (P1)

*All P1 items completed.*

### Medium Priority (P2)

*All P2 items completed.*

### Low Priority (P3)

- [ ] **Update DEMO.md for Beth** — Create example workflows showcasing Beth's personality
- [ ] Consider additional skills (API security, performance profiling)

---

## Decisions

| Decision | Rationale | Date |
|----------|-----------|------|
| Rename orchestrator → Beth | Brand identity, memorable persona, clear leadership | 2026-01-24 |
| Consolidate frontend-engineer into developer | Developer handles both UI and full-stack; reduces redundancy | 2026-01-25 |
| Add security-reviewer agent | Enterprise security is non-negotiable | 2026-01-24 |
| Single-source tracking: Backlog.md | Simplicity over tooling. One file, one truth. | 2026-01-25 |
| Optional MCP integrations | Web search, Playwright, Azure, MS Learn MCPs enhance agents but are opt-in. Skills gracefully degrade without them. | 2026-01-24 |

---

## Status Summary

**For Leadership:**

The Beth orchestrator system is operational. Core personality, README, and full agent roster are complete. Next phase is MCP integrations for enhanced capabilities.

**What's Working:**

- Beth agent (orchestrator) — Live
- Product Manager, Researcher, UX Designer, Developer, Tester — Live
- Developer — Enhanced with shadcn/ui MCP integration
- Security Reviewer — Live (OWASP, compliance, threat modeling)
- All skills — PRD, Framer, React Best Practices, Web Design, shadcn-ui, Security Analysis
- Installation guide — docs/INSTALLATION.md
- MCP setup guide — docs/MCP-SETUP.md
- npm package — `npx beth-copilot init` for one-command installation

**What's Coming:**

- MCP-enhanced skills (optional, graceful degradation)
- Agent consistency review

**Blockers:** None.

---

## How We Track Work

This file is the single source of truth. When you start work:

1. Move the task to **In Progress**
2. Do the work
3. Move to **Completed** when done
4. Commit changes

No external tools. No databases. Just this markdown file.

---

*"Now you know what's happening. Questions? I'll answer them. Complaints? Keep them to yourself."*
