# Backlog

> *"I don't have time to explain things twice. Read this."*

Last updated: 2026-03-09

---

## Completed

| Task | Notes |
|------|-------|
| **CI fix: Split unit vs E2E Vitest configs (beth-1j8)** | `src/**/*.e2e.test.ts` (including `beads.e2e.test.ts`) were failing CI because the `bd` CLI isn't installed in the GitHub Actions runner. Updated `vitest.config.ts` to exclude all E2E specs from the default run and added a separate E2E Vitest config. Default CI jobs now only run unit/integration tests; E2E suites are expected to run via the dedicated E2E config (locally or from an explicit CI job, e.g. `npm run test:e2e`). 17/17 non‑E2E test files, 361 passed, 0 failures. |
| **Agent Coordination Enforcement Phase 1 COMPLETE (beth-1j8.1)** | `npx beth-copilot close` with 3-layer enforcement: (1) open blocker deps via `bd dep list`, (2) open children via `bd children`, (3) mandatory test subtasks (unit/e2e/security) for epics via `bd show`. 66 unit tests. All 16+ agent/doc files updated from `bd close` → `npx beth-copilot close`. `--force` bypasses all checks. Excluded `beads.e2e.test.ts` from tsc compilation (separate epic). |
| **Quality Gate Phases 2-5 COMPLETE (beth-7cu)** | Phase 2: Added mandatory test subtask rules to 10 files (beth/developer/tester/security-reviewer agent + AGENTS.md, source + templates). Epic creation patterns now require unit/E2E/security test subtasks. Phase 3: Updated Landing the Plane in AGENTS.md (both occurrences) and beth.agent.md to require `npm test` + `npm run test:gate` before closing. Phase 4: Created `docs/test-reports/TEMPLATE.md`. Phase 5: Created `scripts/quality-gate.mjs` — runs vitest + legacy tests, parses results, generates markdown report, exits non-zero on failure. Added `test:gate` to package.json. 296 tests, 295 pass, 1 skip, 0 fail. |
| **Standardize on npm, fix CI lock file (beth-i2r)** | `package-lock.json` was 165 lines — missing vitest, coverage-v8, and all transitive deps. Regenerated (1858 lines). Added `"packageManager": "npm@11.9.0"` to package.json. Deleted `pnpm-lock.yaml` to eliminate dual lock file drift. Replaced `pnpm run` references in scripts with `npm run`. CI `npm ci` now passes. |
| **Backport drift-prevention session startup (beth-0cf)** | Added Session Startup (MANDATORY) section to AGENTS.md with 4-step drift-check procedure, war story, and trust-the-code principle. Rewrote beth.agent.md "Before You Do Anything" from simple list to structured 4-step procedure with git commands and drift handling. Updated both template counterparts so new projects ship with protection. |
| **Simplify all architecture mermaid diagrams (beth-7bo)** | Rewrote all mermaid diagrams in README.md (7 diagrams) and docs/SYSTEM-FLOW.md (gutted from 449→170 lines). Removed bloated subgraph-heavy charts, fake "Live" component references (orchestrator, tool abstraction, LLM provider that don't exist in src/), and overly detailed sequence diagrams. All diagrams now tight, simple, and accurate to actual codebase: CLI toolchain, Copilot agent definitions, core parsers (agents/skills), and templates. |
| **Simplify README architecture diagram** | Replaced the 90-line, 9-subgraph, 40+ node architecture diagram with a clean 30-line overview: 4 groups (Entry Points → Orchestration Engine → Specialist Agents → Capabilities) plus LLM connection. Old diagram was trying to be architecture docs AND overview simultaneously. Deep internals (Router, Context, HandoffManager, StreamAccumulator) remain in detailed README sections and docs/SYSTEM-FLOW.md where they belong. |
| **README update for Phases 2-4 (beth-h7i)** | Updated README.md and INSTALLATION.md to document Phase 3 (Tool Abstraction) and Phase 4 (Orchestration Engine). New architecture diagram with Orchestration Engine, Tool Abstraction Layer, and fan-out flow. New sections: Orchestration Engine (fan-out pattern with Mermaid flowchart, capabilities list, TypeScript usage), Tool Abstraction Layer (7-tool table, createDefaultRegistry/loadAllMCPTools examples). Updated: execution layers (3→5), test count (485→814), project structure (added orchestrator/router/context/handoffs/tools tree), test coverage table (9→24 rows by category). Added beads CGO troubleshooting for Linux/WSL (build-essential, CGO_ENABLED, Dolt migration recovery) to both README and INSTALLATION.md. |
| **Phase 4: Orchestration Engine COMPLETE** | Epic beth-y04 closed. 6/6 subtasks done. `src/core/` — ConversationContext (.1), AgentRouter (.2), HandoffManager (.3), Orchestrator agent loop (.4), 86 new tests (.5), barrel exports + wiring (.6). Full agentic loop: user message → route → skill injection → LLM → tool calls → subagent spawning → handoffs → response. Token-estimated context window truncation, tool call/result repair, observer callbacks, parallel subagent execution. 814 total tests (813 pass, 1 skip, 0 fail). |
| **Phase 3: Tool Abstraction Layer COMPLETE** | Epic beth-qh2 closed. 6/6 subtasks done. `src/tools/` — Tool interface, types, registry (.1), readFile + editFile (.2), search + terminal (.3), beads + subagent (.4), MCP client + bridge (.5), barrel exports + integration tests (.6). 243 tool tests, 728 total (727 pass, 1 skip, 0 fail). `createDefaultRegistry()` convenience factory, OpenAI function calling schema generation, MCP JSON-RPC 2.0 over stdio. |
| Fix package-lock.json sync + CI guard | Lock file was stale (v1.0.14, missing optionalDependencies). Regenerated with `npm install`. Added `.github/workflows/ci.yml` running on all branches/PRs (`npm ci`, build, test). Local pre-commit hook blocks `package.json` commits without matching lock file. Pushed to `release/v1.0.15`. |
| Run bd doctor during beth init (beth-mvp) | Added `runBeadsDoctor()` to `bin/cli.js` — after beads is installed and initialized during `npx beth-copilot init`, runs `bd doctor` to verify beads configuration health. Non-blocking (warns on failure, doesn't halt init). Same shell security pattern as `initializeBeads()`. 33/33 tests pass. |
| Comprehensive README rewrite — MCP/CLI/A2A/architecture (beth-0jf) | Full README.md rewrite with Mermaid architecture diagram (Copilot + CLI → Core Engine → Agents → Skills → MCP → Provider), Tech Stack section (12 technologies), CLI Commands table, A2A orchestration model with delegation diagram + sequence diagram with parallel quality gates, MCP integrations (5 servers), Skills trigger table (8 skills), LLM Provider Layer diagram (config → auth → Azure → streaming → retry), TypeScript Core project structure, test coverage breakdown (485 tests by suite), IDEO design thinking, quality standards with enforcement gates. |
| Add E2E tests: MCP validation, help command, init-to-doctor pipeline (beth-27j) | 3 new test files: `mcp.e2e.test.ts` (13 tests — template JSON validation, server structure, init copy/skip/force), `help.e2e.test.ts` (25 tests — all invocation methods, every CLI command/option listed, install contents documented, @Beth guidance, unknown command handling), `pipeline.e2e.test.ts` (14 tests — init→doctor compose correctly, agent/skill/beads checks, --force repairs, JSONC settings, A2A delegation enabled). Total: 52 new tests, 485 total (484 pass, 1 skip, 0 fail). |
| Beads infrastructure cleanup (Dolt migration) | Fixed metadata.json (beads.db → dolt), set beads.role=maintainer, archived SQLite artifact, cleaned worktree cruft, imported JSONL into Dolt, generated repo fingerprint (50139a6c), set sync.mode=dolt-native. 8→4 warnings, 0 errors. Follow-up: beth-b1m for remaining cosmetic warnings. |
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
| Fix security-reviewer agent format | Removed obsolete `chatagent` wrapper, now uses standard YAML frontmatter like other agents |
| Create PR and review process documentation | CONTRIBUTING.md, PR template, issue templates for bug/feature/security |
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

| Task | Epic | Notes |
|------|------|-------|
| **Agent Handoff & Skill Routing Optimization (beth-gau)** | beth-gau | Overhaul Beth's subagent handoff config, skill routing, and context efficiency. 7 subtasks below. |

### Epic beth-gau — Subtask Breakdown

| # | Task | ID | Priority | Deps | Status |
|---|------|----|----------|------|--------|
| 1 | **Add Skill Routing Table to Beth's Agent Definition** | beth-gau.1 | P0 | none | open |
| 2 | **Replace Lateral Handoffs with Escalate-to-Beth Pattern** | beth-gau.2 | P0 | none | open |
| 3 | **Restructure Subagent Prompt Templates with Explicit Skill Loading** | beth-gau.3 | P1 | beth-gau.1 | open |
| 4 | **Extract Shared Boilerplate to AGENTS.md Reference** | beth-gau.4 | P1 | none | open |
| 5 | **Migrate Areas of Expertise to On-Demand Skills** | beth-gau.5 | P2 | beth-gau.4 | open |
| 6 | **Wire Orphaned Skills to Their Natural Agents** | beth-gau.6 | P1 | none | open |
| 7 | **Update Beth Handoff Prompts with Context-Rich Defaults** | beth-gau.7 | P2 | beth-gau.1 | open |

#### Task 1 (beth-gau.1): Add Skill Routing Table to Beth's Agent Definition
- **Objective:** Beth has ZERO skill references. When she works directly, she operates without domain knowledge. Add explicit skill routing table.
- **Files:** `.github/agents/beth.agent.md`, `templates/.github/agents/beth.agent.md`
- **Implementation:** Add `## Skill Routing` section after `## Your Team`, before `## How You Operate`. Table maps all 8 skills to agents and trigger conditions. Rules subsection mandates loading skills when working directly AND when spawning subagents.
- **DoD:** Table lists all 8 skills with correct paths, agents, triggers. Rules instruct Beth to load before direct work and include in subagent prompts. Templates mirror.

#### Task 2 (beth-gau.2): Replace Lateral Handoffs with Escalate-to-Beth Pattern
- **Objective:** 15 lateral handoffs across 6 subagents create a mesh that bypasses Beth's orchestration. Replace with single "Escalate to Beth" per subagent.
- **Files:** All 6 subagent `.agent.md` files + their templates (12 files total)
- **Implementation:** Replace each agent's `handoffs:` YAML block with single entry: `{label: "Escalate to Beth", agent: Beth, prompt: "Report findings...", send: true}`. Beth's own handoffs unchanged.
- **DoD:** All 6 subagents have exactly 1 handoff (Escalate to Beth, send: true). Beth keeps 6 outbound. YAML valid. Templates mirror.

#### Task 3 (beth-gau.3): Restructure Subagent Prompt Templates with Explicit Skill Loading
- **Objective:** Beth's subagent prompts never mention which SKILL.md to load. Skill loading is trigger-based and fragile. Replace freeform templates with structured format.
- **Files:** `.github/agents/beth.agent.md`, `templates/.github/agents/beth.agent.md`
- **Implementation:** Replace `### Subagent Templates` section with structured format: Task, Branch, Skills (MANDATORY), Context, Acceptance Criteria, Return Format, On Completion. Add skill mapping table per agent.
- **DoD:** Old freeform templates removed. New format includes `## Skills` as mandatory field. Mapping table covers all 6 agents. Parallel execution example preserved. Templates mirror.

#### Task 4 (beth-gau.4): Extract Shared Boilerplate to AGENTS.md Reference
- **Objective:** Identical "Work Tracking" and "Team Coordination" sections (~20 lines) duplicated across 6 subagents = ~120 lines wasted context per epic.
- **Files:** All 6 subagent `.agent.md` files + templates (12 files total)
- **Implementation:** Replace both sections with 3-line `## Work Tracking & Team Coordination` referencing AGENTS.md. AGENTS.md already has full protocol.
- **DoD:** All 6 files have compact reference. Old sections removed. Net ~102 lines saved. Templates mirror.

#### Task 5 (beth-gau.5): Migrate Areas of Expertise to On-Demand Skills
- **Objective:** Each agent carries 50-100 lines of static reference material loaded every spawn. Move to skills, load on-demand.
- **Files:** All 6 subagent `.agent.md` files + templates (12 files total)
- **Implementation:** Replace `## Areas of Expertise` with compact `## Expertise (loaded via skills on-demand)` pointer section. Preserve Core Philosophy and Invocation Checklist.
- **DoD:** No agent has Areas of Expertise > 10 lines. All skill refs point to existing files. Net ~250-350 lines saved. Templates mirror.

#### Task 6 (beth-gau.6): Wire Orphaned Skills to Their Natural Agents
- **Objective:** web-search, web-design-guidelines, azure-operations exist but no agent references them. Zero orphaned skills should remain.
- **Files:** researcher, tester, ux-designer, developer `.agent.md` + templates (8 files total)
- **Implementation:** Add `## Skills` sections to researcher (web-search) and tester (web-design-guidelines). Add web-design-guidelines to ux-designer's existing Skills. Add azure-operations to developer's existing Skills.
- **DoD:** `grep -r` confirms all 8 skills referenced by at least one agent. Templates mirror.

#### Task 7 (beth-gau.7): Update Beth Handoff Prompts with Context-Rich Defaults
- **Objective:** Beth's 6 handoffs use sparse one-liners with `send: false`. Manual handoffs lose all context. Make prompts richer, enable context transfer.
- **Files:** `.github/agents/beth.agent.md`, `templates/.github/agents/beth.agent.md`
- **Implementation:** Change all 6 handoffs to `send: true`. Add SKILL.md paths, concrete deliverables, and AGENTS.md reference to each prompt.
- **DoD:** All 6 handoffs have send: true, reference SKILL.md, specify deliverables. YAML valid. Templates mirror.

---

## Backlog (Prioritized)

### High Priority (P1)

| Task | Notes |
|------|-------|
| **Agent Coordination Enforcement Phase 2 (beth-l2j8)** | Branch guard pre-push hook (beth-l2j8.1) → landing gate command `bd land` (beth-l2j8.2). Phase 1 (close enforcement) complete. |
| **Clean up E2E test crud in beads (beth-lhie)** | Closed — tracked as part of Phase 2 work. ~50 orphaned "E2E test:" issues need cleanup script or test isolation. |

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
| Standardize on npm + fix CI lock file (beth-i2r) | `package-lock.json` regenerated to fix `npm ci` missing-dep errors (vite@7.3.1 etc). Added `"packageManager": "npm@10.9.2"` to package.json. Removed stale `pnpm-lock.yaml`. Fixed scripts referencing pnpm. Verified upstream `ATV-AgentSkillsDemo` repo unaffected (no package.json at all). Build clean, 295 tests pass. |
| Adopt drift-prevention session startup | Backported from ATV-AgentSkillsDemo after formatter silently reverted agent changes. All agents now check git state before trusting trackers. Applied to source + templates. | 2026-03-07 |

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

- Cut next npm release to ship drift-prevention to all `npx beth-copilot init` users
- Test Quality Gate Infrastructure (beth-gtl) — Vitest/RTL/Playwright configs, agent test requirements, quality gate script
- Agent Coordination Enforcement (beth-cip) — dependency enforcement on `bd close`, branch guard hook, `bd land` command
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
