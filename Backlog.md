# Backlog

> *"I don't have time to explain things twice. Read this."*

Last updated: 2026-02-18

---

## Completed

| Task | Notes |
|------|-------|
| Update agent models + add DeepWiki MCP | All agents set to Claude Opus 4.6 (security-reviewer → GPT 5.3-codex). Added DeepWiki MCP server (`https://mcp.deepwiki.com/mcp`) to both `mcp.json.example` files. |
| **Phase 2: LLM Provider Integration COMPLETE** | Epic beth-47w closed. 9/9 subtasks done. `src/providers/` — types, retry, config, interface, streaming, azure client, barrel exports, 193 unit tests (359 total TS tests), test scripts updated. |
| Phase 2 Wave 4-5: tests + exports (.7, .8, .9) | 193 provider tests across 5 files (types, retry, config, streaming, azure). Barrel exports in `src/providers/index.ts`. `test:ts` script updated for providers path. CLI-ARCHITECTURE.md Phase 2 section updated to reflect reality. |
| Phase 2 Wave 3: Azure OpenAI client (.4) | `src/providers/azure.ts` — `AzureOpenAIProvider` extends `LLMProviderBase`. `AzureOpenAI` + `getBearerTokenProvider` for Entra ID auth (no API keys). Streaming with tool call deltas, error mapping to `LLMError`, retry for transient failures. `openai` v6.22.0 added. |
| Phase 2 Wave 2: interface + streaming (.1, .5) | `src/providers/interface.ts` (LLMProviderBase abstract class, ChatRequestOptions, ProviderFactory/Registry), `streaming.ts` (StreamAccumulator class, collectStream, mapStream). Parallel implementation, 239 tests pass. |
| Phase 2 Wave 1: types + retry + config (.3, .2, .6) | `src/providers/types.ts` (17 types, LLMError class), `retry.ts` (exponential backoff + jitter, RetryError), `config.ts` (env → ~/.beth/.env precedence, ConfigError). All compile clean, 239 tests pass. |
| Restructure Phase 2 dependency tree (beth-47w) | Types (.3) before interface (.1) to avoid contract churn. Streaming (.5) parallel with Azure client (.4). Added .9 for test-runner path. SDK: `openai` not `@azure/openai`. Config (.6): process.env → ~/.beth/.env precedence. |
| E2E Test Suite Implementation (beth-0nl) | 155 tests across 7 subtasks: CLI E2E (init, doctor, quickstart) + Agent validation (frontmatter, handoffs, tools, suite integration). All passing. |
| Full security review (beth-svq) | Overall risk: LOW. 0 critical/high findings. 2 medium (both well-mitigated). Clean npm audit, comprehensive path validation, minimal dependencies. |
| Fix CLI ENOTDIR crash + user-friendly errors (v1.0.13-14) | `copyDirRecursive` now detects file-vs-directory conflicts, UserError class for formatted error boxes with Problem/Fix/Command sections |
| CLI Phase 1 Complete: Agent & Skill Loaders | `src/core/agents/loader.ts`, `src/core/skills/loader.ts` with trigger extraction, 118 tests passing, updated architecture docs for Azure OpenAI |
| CLI Polish & Documentation Fixes | Fixed security-reviewer.agent.md syntax, removed unnecessary backlog.md CLI dependency, corrected agent/skill counts in help, all 86 tests passing |
| CLI TypeScript Foundation + Commands | TypeScript build system, doctor/quickstart commands, agent schema types, pathValidation migration |
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
| Update DEMO.md for Beth | Rewritten with Beth's personality, voice, and beads integration |

---

## In Progress

| Task | Notes |
|------|-------|
| *No active work* | Phase 2 complete. Ready for Phase 3. |

---

## Backlog (Prioritized)

### High Priority (P1)

| Task | Notes |
|------|-------|
| ~~Phase 2~~ | ~~COMPLETE — All 9 subtasks closed, epic closed~~ |

### Medium Priority (P2)

*All P2 items completed.*

### Low Priority (P3)

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
