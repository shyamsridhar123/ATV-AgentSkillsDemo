# E2E Skill Routing Tests

> Test matrix for verifying every skill is routable via prompt inference.
> Generated from `.github/skills/` inventory (66 skills) and `inject-skills.mjs` hook mapping.
> Last updated: 2026-03-15

## Test Design

Each test verifies: **Given a natural-language prompt to Beth, the correct subagent is spawned and the correct skill is loaded.**

### Enforcement Layers

| Layer | Mechanism | What it proves |
|-------|-----------|---------------|
| **Hook injection** | `inject-skills.mjs` fires on `SubagentStart` | Mandatory skills are loaded deterministically (no LLM choice) |
| **Prompt inference** | VS Code skill matching via description/triggers | Conditional skills are loaded when prompt keywords match |
| **Agent routing** | Beth selects the right `agentName` for `runSubagent()` | The right specialist handles the task |

### Test Structure

```typescript
// Parameterized test pattern
describe.each(SKILL_TEST_MATRIX)('Skill: $skill', ({ skill, agent, prompt, enforcement }) => {
  it('routes to correct agent', () => { /* verify agentName */ });
  it('loads the skill', () => { /* verify skill file read or injection */ });
});
```

---

## Category 1: Hook-Enforced Mandatory Skills (9 tests)

These skills are **deterministically injected** by `inject-skills.mjs`. No prompt inference needed — the hook fires on agent type alone. Tests verify the hook output, not LLM behavior.

| # | Skill | Agent | Enforcement | Test Prompt |
|---|-------|-------|-------------|-------------|
| 1 | `web-design-guidelines` | ux-designer | inject | "Review the login page for accessibility compliance" |
| 2 | `framer-components` | ux-designer | readFile | "Create a Framer component with property controls for a card" |
| 3 | `ui-ux-pro-max` | ux-designer | readFile | "Design a color palette and style guide for the dashboard" |
| 4 | `vercel-react-best-practices` | developer | inject | "Optimize the data fetching in our Next.js product page" |
| 5 | `shadcn-ui` | developer | readFile | "Add a shadcn dialog component for the settings modal" |
| 6 | `vercel-react-best-practices/AGENTS.md` | developer | readFile | "Refactor the server components to eliminate waterfalls" |
| 7 | `prd` | product-manager | readFile | "Create a PRD for the user notifications feature" |
| 8 | `security-analysis` | security-reviewer | readFile | "Run an OWASP security review on the auth module" |
| 9 | `web-design-guidelines` | tester | inject | "Audit the checkout flow for WCAG 2.1 AA compliance" |

> **Note:** `web-search` is injected for `researcher` via hook. It is a capability wrapper (Brave Search MCP) rather than domain knowledge, but is tested as prompt #37 in Category 4.

---

## Category 2: Azure Skills (22 tests)

Conditional skills loaded by keyword matching. Primary agent is `developer` unless noted. These are the **weakest link** — they depend on LLM keyword recognition, not deterministic hooks.

| # | Skill | Agent | Test Prompt |
|---|-------|-------|-------------|
| 10 | `azure-prepare` | developer | "Create a new containerized Node.js app and deploy it to Azure Container Apps" |
| 11 | `azure-validate` | developer | "Validate my app's deployment readiness and check the Bicep configuration" |
| 12 | `azure-deploy` | developer | "Run azd up to push the app to production" |
| 13 | `azure-compute` | developer | "Recommend the best VM size for our ML training workload on Azure" |
| 14 | `azure-storage` | developer | "Set up blob storage with lifecycle management for our file upload service" |
| 15 | `azure-ai` | developer | "Configure Azure AI Search with vector search for our product catalog" |
| 16 | `azure-aigateway` | developer | "Set up semantic caching and token limits for our Azure OpenAI gateway" |
| 17 | `azure-kusto` | developer | "Write KQL queries to analyze the IoT telemetry in Azure Data Explorer" |
| 18 | `azure-messaging` | developer | "Troubleshoot this AMQP connection error with our Event Hub consumer" |
| 19 | `azure-hosted-copilot-sdk` | developer | "Build a copilot app using @github/copilot-sdk and deploy to Azure" |
| 20 | `appinsights-instrumentation` | developer | "Instrument our web app with Application Insights telemetry" |
| 21 | `microsoft-foundry` | developer | "Deploy our agent to Microsoft Foundry and run batch evaluation" |
| 22 | `azure-rbac` | security-reviewer | "Find the least privilege RBAC role for our managed identity to read blobs" |
| 23 | `azure-compliance` | security-reviewer | "Run a compliance scan and security audit on our Azure subscription" |
| 24 | `entra-app-registration` | security-reviewer | "Create an Entra ID app registration with OAuth and MSAL configuration" |
| 25 | `azure-cost-optimization` | product-manager | "Analyze our Azure spending and find cost optimization opportunities" |
| 26 | `azure-cloud-migrate` | product-manager | "Assess migrating our Lambda functions to Azure Functions" |
| 27 | `azure-diagnostics` | tester | "Troubleshoot why our Container App is failing health probes in production" |
| 28 | `azure-resource-lookup` | Beth | "List all VMs and storage accounts across our Azure subscriptions" |
| 29 | `azure-resource-visualizer` | Beth | "Generate a Mermaid architecture diagram of our Azure resource group" |
| 30 | `azure-postgres` | developer | "Configure passwordless Entra ID authentication for our Postgres server" |
| 31 | `azure-quotas` (external) | developer | "Check our Azure subscription quotas and vCPU limits" |

> **External skill note:** `azure-postgres` and `azure-quotas` live in `~/.agents/skills/`, not `.github/skills/`. CI environments won't have them. Tests should handle "skill not found" gracefully.

---

## Category 3: Design & Frontend (4 tests)

| # | Skill | Agent | Test Prompt |
|---|-------|-------|-------------|
| 32 | `frontend-design` | developer | "Build a distinctive, production-grade landing page with creative animations" |
| 33 | `brainstorming` | ux-designer | "Let's brainstorm approaches for the new onboarding flow" |
| 34 | `document-review` | ux-designer | "Review and refine this brainstorm document before we proceed to planning" |
| 35 | `every-style-editor` | product-manager | "Edit this blog post for grammar and style guide compliance" |

---

## Category 4: Product & Research (4 tests)

| # | Skill | Agent | Test Prompt |
|---|-------|-------|-------------|
| 36 | `prd` | product-manager | "Write a product requirements document for the billing dashboard feature" |
| 37 | `web-search` | researcher | "Research the competitive landscape for AI code assistants" |
| 38 | `proof` | product-manager | "Create a proof document and share it for team review" |
| 39 | `changelog` | developer | "Generate a changelog from recent commits" |

---

## Category 5: Developer Workflow (14 tests)

| # | Skill | Agent | Test Prompt |
|---|-------|-------|-------------|
| 40 | `create-agent-skills` | developer | "Create a new Claude Code skill for database migration workflows" |
| 41 | `git-worktree` | developer | "Create a git worktree for isolated parallel development on the feature branch" |
| 42 | `feature-video` | developer | "Record a video walkthrough of the new settings feature for the PR" |
| 43 | `resolve_parallel` | developer | "Resolve all code TODOs in the codebase using parallel processing" |
| 44 | `resolve_todo_parallel` | developer | "Resolve all pending CLI todos in my todo list" |
| 45 | `resolve-pr-parallel` | developer | "Address all PR review comments using parallel processing" |
| 46 | `lfg` | developer | "Execute the work plan sequentially — let's go" |
| 47 | `slfg` | developer | "Execute the work plan using swarm parallel processing" |
| 48 | `deepen-plan` | developer | "Enhance this plan with parallel research agents to add depth and best practices" |
| 49 | `agent-browser` | developer | "Browse the staging site and fill out the signup form to test it" |
| 50 | `agent-native-architecture` | developer | "Design an application where agents are first-class citizens with MCP tools" |
| 51 | `rclone` | developer | "Upload the generated video files to our S3 bucket" |
| 52 | `gemini-imagegen` | developer | "Generate a product mockup image using Gemini for the landing page" |
| 53 | `generate_command` | developer | "Generate a shell command to find all TypeScript files with TODO comments" |

---

## Category 6: Testing & QA (5 tests)

| # | Skill | Agent | Test Prompt |
|---|-------|-------|-------------|
| 54 | `test-browser` | tester | "Run browser tests on pages affected by the current PR" |
| 55 | `test-xcode` | tester | "Run Xcode tests for the iOS module" |
| 56 | `report-bug` | tester | "File a bug report for the broken pagination on the search results page" |
| 57 | `reproduce-bug` | tester | "Reproduce the intermittent crash reported in issue #42" |
| 58 | `triage` | tester | "Triage the incoming bug reports and prioritize by severity" |

---

## Category 7: Orchestration & Swarm (4 tests)

| # | Skill | Agent | Test Prompt |
|---|-------|-------|-------------|
| 59 | `orchestrating-swarms` | Beth | "Orchestrate a swarm of agents to parallelize the migration work" |
| 60 | `setup` | Beth | "Set up the project structure and initialize the development environment" |
| 61 | `heal-skill` | Beth | "Fix this broken skill that isn't loading correctly" |
| 62 | `file-todos` | developer | "Scan the codebase and create tasks for all TODO/FIXME comments" |

---

## Category 8: CE Workflow Pipeline (5 tests)

The `ce:*` skills are slash-command workflows. They form a sequential pipeline: brainstorm → plan → work → review → compound.

| # | Skill | Agent | Test Prompt |
|---|-------|-------|-------------|
| 63 | `ce:brainstorm` | ux-designer | "/ce:brainstorm — explore requirements for the new dashboard" |
| 64 | `ce:plan` | developer | "/ce:plan — transform the feature description into a structured project plan" |
| 65 | `ce:work` | developer | "/ce:work — execute the work plan and finish the feature" |
| 66 | `ce:review` | developer | "/ce:review — perform exhaustive multi-agent code review" |
| 67 | `ce:compound` | developer | "/ce:compound — document what we solved to compound team knowledge" |

---

## Category 9: Language-Specific (3 tests)

| # | Skill | Agent | Test Prompt |
|---|-------|-------|-------------|
| 68 | `dhh-rails-style` | developer | "Write a Rails controller for user management in DHH's 37signals style" |
| 69 | `andrew-kane-gem-writer` | developer | "Create a Ruby gem for CSV parsing following Andrew Kane's patterns" |
| 70 | `dspy-ruby` | developer | "Build an LLM module using DSPy.rb signatures for intent classification" |

---

## Category 10: Remaining Skills (2 tests)

| # | Skill | Agent | Test Prompt |
|---|-------|-------|-------------|
| 71 | `compound-docs` | developer | "That worked! Document this solution for the team" |
| 72 | `agent-native-audit` | security-reviewer | "Audit the agent-native architecture for security and reliability" |

---

## Known Disambiguation Challenges

These skill pairs share semantic space. Tests MUST verify the correct one fires:

| Pair | Resolution | Test Strategy |
|------|-----------|---------------|
| `brainstorming` vs `ce:brainstorm` | `brainstorming` = freeform ("let's brainstorm"), `ce:brainstorm` = slash command (`/ce:brainstorm`) | Test both prompts, verify different skills load |
| `compound-docs` vs `ce:compound` | `compound-docs` = auto-detect ("that worked!"), `ce:compound` = slash command (`/ce:compound`) | Test trigger phrase vs slash command |
| `ce:plan` vs `deepen-plan` | Sequential pipeline: `ce:plan` creates → `deepen-plan` enriches | Test "create a plan" vs "enhance this plan" |
| `ce:review` vs `document-review` | `ce:review` = code review, `document-review` = markdown doc review | Test "review the code" vs "review this document" |
| `resolve_parallel` vs `resolve_todo_parallel` vs `resolve-pr-parallel` | Source differs: code TODOs vs CLI todos vs PR comments | Test "resolve TODOs in code" vs "resolve my todos" vs "resolve PR comments" |
| `lfg` vs `slfg` | `lfg` = sequential, `slfg` = swarm parallel | Test "execute sequentially" vs "execute with swarm" |

---

## Implementation Notes

### Test Infrastructure Needed

1. **Hook unit tests** ✅ — Feed mock `SubagentStart` events to `inject-skills.mjs`, verify output contains correct `additionalContext` for each agent type. These are pure functions, fully deterministic.
   - `inject-skills.test.ts` (20 tests): Unit tests for inject-skills.mjs in isolation
   - `hook-injection.test.ts` (51 tests): Parameterized tests for all Category 1 matrix entries

2. **Skill trigger coverage tests** ✅ — Verify each of the 72 test prompts' keywords appear in the expected skill's SKILL.md content. Catches missing triggers, wrong descriptions, keyword drift.
   - `trigger-coverage.test.ts` (147 tests): All 72 test prompts with required keywords validated against actual skill content

3. **Pipeline integration tests** ✅ — Test inject-skills.mjs → verify-skills.mjs as a complete enforcement system. Verifies round-trip behavior, malformed input resilience, cross-hook consistency, and agent-specific context differentiation.
   - `pipeline-integration.test.ts` (41 tests): Full hook round-trip for all 6 agent types

4. **Agent-skill mapping completeness** ✅ — Verify no orphan skills, all hook references resolve, agent definitions exist, SKILL.md content quality.
   - `mapping-completeness.test.ts` (12 tests): Inventory validation, source-of-truth checks, content quality

5. **Skill resolution tests** ⚠️ BLOCKED — Verify VS Code's skill matching engine maps each test prompt to the expected skill file. Requires mocking the VS Code extension API which is not accessible in vitest.

6. **Agent routing integration tests** ⚠️ BLOCKED — Verify Beth selects the correct `agentName` when given each test prompt. Requires either:
   - Mocking `runSubagent` and asserting the `agentName` parameter
   - Or recording actual agent invocations in a test harness
   - This needs the VS Code Copilot extension's runtime, which is not testable in vitest

7. **External skill handling** ✅ — Skills in `~/.agents/skills/` (azure-postgres, azure-quotas) skip gracefully with `it.skipIf(!existsSync(path))` in both skill-routing.test.ts and trigger-coverage.test.ts.

### Implementation Status (2026-03-15)

| Test File | Tests | Coverage |
|-----------|-------|----------|
| `hook-injection.test.ts` | 51 | Category 1 hook output per agent type |
| `skill-routing.test.ts` | 223 | Categories 2-10 structural validation |
| `disambiguation.test.ts` | 28 | 8 known challenge pairs |
| `inject-skills.test.ts` | 20 | inject-skills.mjs unit tests |
| `verify-skills.test.ts` | 9 | verify-skills.mjs unit tests |
| `loader.test.ts` | 20 | Core SKILL.md parser |
| `pipeline-integration.test.ts` | 41 | Full inject→verify round-trip |
| `trigger-coverage.test.ts` | 147 | 72 prompt-to-keyword validations |
| `mapping-completeness.test.ts` | 12 | Orphan detection, content quality |
| **Total** | **551** | |

### Priority Order

1. **Hook injection tests** (Category 1) ✅ — Highest confidence, fully deterministic
2. **Disambiguation tests** (Known Challenges table) ✅ — Highest risk, verified
3. **Trigger coverage** (All categories) ✅ — Keyword validation for all 72 prompts
4. **Pipeline integration** ✅ — End-to-end hook behavior
5. **Mapping completeness** ✅ — No orphan skills, all references valid
6. **VS Code skill resolution** ⚠️ — Blocked on extension API access
7. **LLM agent routing** ⚠️ — Blocked on runtime test harness

### File Structure

```
src/__tests__/
├── skills/
│   ├── hook-injection.test.ts      # Category 1: deterministic hook tests
│   ├── skill-routing.test.ts       # Categories 2-10: prompt → skill mapping
│   ├── disambiguation.test.ts      # Known challenge pairs
│   ├── pipeline-integration.test.ts # Full inject→verify round-trip
│   ├── trigger-coverage.test.ts    # 72 prompt → keyword coverage
│   └── mapping-completeness.test.ts # Orphan/completeness checks
├── inject-skills.test.ts           # inject-skills.mjs unit tests
├── verify-skills.test.ts           # verify-skills.mjs unit tests
└── ...
src/core/skills/
└── loader.test.ts                  # SKILL.md parser unit tests
```
