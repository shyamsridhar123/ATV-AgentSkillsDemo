# Beth

<p align="center">
  <img src="assets/yellowstone-beth.png" alt="Beth" width="600">
</p>

She doesn't do excuses. She doesn't do hand-holding. She does results—and she'll have your entire project shipping while everyone else is still scheduling their kickoff meeting. Think of her as the managing director your codebase didn't know it needed, but absolutely deserves.

They broke her wings once. They forgot she had claws.

---

## What Is This?

Beth is a **multi-agent AI orchestrator** with a TypeScript runtime, CLI toolchain, MCP integrations, and agent-to-agent (A2A) delegation—all driven by a ruthless coordinator who runs your development team the way Beth Dutton runs Schwartz & Meyer.

She commands seven specialized agents, each with their own expertise, tools, and handoff chains. On top of the GitHub Copilot agent layer, Beth ships a **TypeScript core engine** with a full agentic loop: agent routing, conversation context management, tool calling, subagent spawning, and agent-to-agent handoffs—all backed by an Azure OpenAI LLM provider with streaming and retry.

**The system has four execution layers:**

| Layer | What It Does | Status |
|-------|-------------|--------|
| **Copilot Agents** | `.agent.md` definitions running in VS Code Agent Mode | Live |
| **CLI Toolchain** | `beth init`, `beth doctor`, `beth quickstart` — TypeScript commands | Live |
| **Orchestration Engine** | Fan-out routing, tool calling loop, subagent spawning, handoffs | Live |
| **Tool Abstraction** | 6 CLI tools + MCP bridge — uniform interface for all agent capabilities | Live |
| **LLM Provider** | Azure OpenAI with Entra ID auth, streaming, retry, tool calling | Live |

**814 tests.** 813 pass, 1 skip, 0 fail.

---

## Architecture

```mermaid
flowchart TB
    subgraph Input["Entry Points"]
        Copilot["VS Code Copilot Chat"]
        CLI["Beth CLI"]
    end

    subgraph Engine["Orchestration Engine"]
        Orch["Orchestrator<br/><i>Route → LLM → Tools → Response</i>"]
    end

    subgraph Agents["Specialist Agents"]
        Beth["@Beth"]
        PM["@product-manager"]
        UX["@ux-designer"]
        Dev["@developer"]
        Sec["@security-reviewer"]
        Test["@tester"]
        Res["@researcher"]
    end

    subgraph Capabilities["Capabilities"]
        Tools["Tools<br/><i>files · terminal · search · beads</i>"]
        Skills["Skills<br/><i>PRD · React · shadcn · security</i>"]
        MCPs["MCP Servers<br/><i>shadcn · Playwright · Azure</i>"]
    end

    LLM["Azure OpenAI<br/><i>Entra ID · Streaming</i>"]

    Copilot & CLI --> Orch
    Orch --> Beth
    Beth -->|"delegates"| PM & UX & Dev & Sec & Test & Res
    Orch <-->|"chat"| LLM
    Orch --> Tools & Skills & MCPs

    style Beth fill:#1e3a5f,color:#fff
    style Engine fill:#fff3e0
    style Capabilities fill:#e3f2fd
```

---

## Tech Stack

| Category | Technology | Notes |
|----------|-----------|-------|
| **Runtime** | Node.js ≥ 18 | ES modules, built-in test runner |
| **Language** | TypeScript (strict mode) | No `any`. Zod for runtime validation |
| **Target Framework** | React 19 + Next.js App Router | Server Components, Server Actions, Suspense, streaming |
| **Styling** | Tailwind CSS + `class-variance-authority` (cva) | Utility-first with typed variants |
| **Components** | shadcn/ui | Radix primitives, copy-paste ownership |
| **LLM Provider** | Azure OpenAI via `openai` SDK | Entra ID auth (no API keys), streaming + tool calling |
| **Auth** | `@azure/identity` DefaultAzureCredential | az login, managed identity, VS Code creds |
| **Frontmatter** | `gray-matter` | Parses `.agent.md` and `SKILL.md` YAML |
| **Testing** | Node.js built-in test runner | 814 tests — unit, integration, E2E |
| **Task Tracking** | beads (`bd` CLI) | Dependency-aware issue tracking for agents |
| **Package Manager** | pnpm | Lockfile committed |

**Production dependencies:** 1 (`gray-matter`). That's it. Minimal attack surface by design.

---

## Getting Started

**One command:**
```bash
npx beth-copilot init
```

**Global install:**
```bash
npm i -g beth-copilot
beth init
```

Then open VS Code, switch Copilot Chat to **Agent mode**, and type `@Beth`.

**Verify everything works:**
```bash
beth doctor       # Health check: Node.js, beads, agents, skills
beth quickstart   # Init + doctor + beads setup in one shot
```

For detailed setup (prerequisites, task tracking, MCP servers): [docs/INSTALLATION.md](docs/INSTALLATION.md)

---

## CLI Commands

| Command | What It Does |
|---------|-------------|
| `beth init` | Install agents, skills, VS Code settings, beads tracking |
| `beth init --force` | Overwrite existing files |
| `beth doctor` | Validate Node.js ≥18, beads CLI, agents frontmatter, skills directories |
| `beth quickstart` | Run init + doctor + beads init in one shot |
| `beth help` | Show all commands and options |

**Flags:** `--force`, `--skip-backlog`, `--skip-mcp`, `--skip-beads`, `--verbose`

---

## Agent-to-Agent (A2A) Orchestration

Beth doesn't micromanage. She delegates to specialists over **subagent** and **handoff** channels, tracks dependencies with beads, and holds every agent accountable.

### The Family

| Agent | Role | What They Do |
|-------|------|--------------|
| **@Beth** | The Boss | Orchestrates everything. Routes work. Takes names. |
| **@product-manager** | The Strategist | WHAT to build: PRDs, user stories, priorities, success metrics |
| **@researcher** | The Intelligence | Competitive analysis, user insights, market dirt |
| **@ux-designer** | The Architect | HOW it works: component specs, design tokens, accessibility |
| **@developer** | The Builder | React/TypeScript/Next.js — UI and full-stack |
| **@tester** | The Enforcer | Quality assurance, accessibility, performance |
| **@security-reviewer** | The Bodyguard | OWASP, compliance, threat modeling |

### A2A Delegation Model

```mermaid
flowchart TB
    subgraph Orchestration["Beth Orchestration Layer"]
        BethCore["@Beth<br/><i>Routes work · Spawns subagents</i>"]
    end

    subgraph Specialists["Specialist Agents"]
        PM["@product-manager<br/>Requirements · Priorities"]
        R["@researcher<br/>User insights · Market intel"]
        UX["@ux-designer<br/>Component specs · Design tokens"]
        D["@developer<br/>React/TS/Next.js · Implementation"]
        S["@security-reviewer<br/>Threat modeling · Vulnerabilities"]
        T["@tester<br/>QA · a11y · Performance"]
    end

    BethCore -->|"Product Strategy"| PM
    BethCore -->|"User Research"| R
    BethCore -->|"UX Design"| UX
    BethCore -->|"Development"| D
    BethCore -->|"Security Review"| S
    BethCore -->|"Quality Assurance"| T

    PM -.->|"subagent"| R
    PM -.->|"subagent"| UX
    UX -.->|"subagent"| D
    D -.->|"subagent"| T
    S -.->|"subagent"| D
    T -.->|"subagent"| D

    style BethCore fill:#1e3a5f,color:#fff
```

### Subagent vs Handoff

| Mechanism | Control | Use When |
|-----------|---------|----------|
| **Subagent** | Beth decides | Task can run autonomously, no human review needed |
| **Handoff** | User decides | User needs to review before proceeding |

```typescript
// Beth spawns a specialist — autonomous execution
runSubagent({
  agentName: "developer",
  prompt: "Implement JWT auth flow with refresh token rotation...",
  description: "Implement auth"
})
```

### Workflow: New Feature

```mermaid
sequenceDiagram
    participant U as User
    participant B as Beth
    participant PM as Product Manager
    participant UX as UX Designer
    participant D as Developer
    participant S as Security
    participant T as Tester

    U->>B: "Build me a feature"
    B->>B: Assess & Plan

    B->>PM: Define requirements
    PM-->>B: PRD + user stories

    B->>UX: Design the experience
    UX-->>B: Component specs + tokens

    B->>D: Implement feature
    D-->>B: Implementation complete

    par Parallel quality gates
        B->>S: Security review
        S-->>B: OWASP approved
    and
        B->>T: Test & verify
        T-->>B: a11y + regression pass
    end

    B->>U: Feature complete ✅
```

**Bug Hunt?** Tester → Developer → Security → Tester
**Security Audit?** Security → Developer → Tester → Security sign-off

---

## MCP Integrations

Model Context Protocol servers extend agent capabilities. All **optional** — agents gracefully degrade without them.

| Server | Agent | Capability |
|--------|-------|-----------|
| **shadcn/ui** | Developer | Component browsing & installation |
| **Playwright** | Tester | Browser automation, E2E testing |
| **Azure** | Developer, Security | Cloud resource management |
| **Brave Search** | Researcher | Internet research |
| **DeepWiki** | All | Repository documentation lookup |

### Quick Setup

```bash
# Copy example config and enable what you need
cp mcp.json.example .vscode/mcp.json
```

```json
{
  "servers": {
    "shadcn":     { "command": "npx", "args": ["shadcn@latest", "mcp"] },
    "playwright": { "command": "npx", "args": ["@playwright/mcp@latest"] },
    "azure":      { "command": "npx", "args": ["@azure/mcp-server"] },
    "web-search": { "command": "npx", "args": ["@brave/brave-search-mcp-server"] },
    "deepwiki":   { "url": "https://mcp.deepwiki.com/mcp" }
  }
}
```

Full details: [docs/MCP-SETUP.md](docs/MCP-SETUP.md)

---

## Skills (On-Demand Knowledge)

Skills are domain-knowledge modules that agents load automatically when trigger phrases match. Each skill lives in `.github/skills/<name>/SKILL.md`.

| Skill | Triggers On | Used By |
|-------|------------|---------|
| **PRD Generation** | "create a prd", "product requirements" | Product Manager |
| **Framer Components** | "framer component", "property controls" | UX Designer |
| **React/Next.js Best Practices** | React performance, Next.js patterns | Developer |
| **Web Design Guidelines** | "review my UI", "check accessibility" | UX Designer |
| **shadcn/ui** | "shadcn", "ui component" | Developer |
| **Security Analysis** | "security review", "OWASP", "threat model" | Security Reviewer |
| **Azure Operations** | Azure resource management | Developer |
| **Web Search** | Internet research via Brave | Researcher |

---

## Orchestration Engine (Fan-Out Pattern)

The orchestration engine is Beth's brain — the full agentic loop that processes user messages through routing, skill injection, LLM calls, tool execution, and subagent spawning.

```mermaid
flowchart TB
    User["User Message"] --> Route["AgentRouter\n@mention · skill match · default"]
    Route --> Context["ConversationContext\nBuild system prompt + history"]
    Context --> Skills{"Skill triggers match?"}
    Skills -->|yes| Inject["Inject skill into system prompt"]
    Skills -->|no| LLM
    Inject --> LLM["LLM Call\nAzure OpenAI"]
    LLM --> Decision{"Response type?"}
    Decision -->|text| Done["Return response"]
    Decision -->|tool calls| ToolExec["Execute tools\nvia ToolRegistry"]
    ToolExec --> SubCheck{"Subagent request?"}
    SubCheck -->|yes| SubAgent["Spawn child loop\ndepth-limited"]
    SubCheck -->|no| ToolResult["Return tool result"]
    SubAgent --> ToolResult
    ToolResult --> LLM
    Decision -->|handoff| Handoff["HandoffManager\nContext transfer"]
    Handoff --> Route

    style User fill:#1e3a5f,color:#fff
    style LLM fill:#e8f5e9
    style ToolExec fill:#e3f2fd
    style SubAgent fill:#fff3e0
```

**Key capabilities:**
- **Agent routing** — `@mention` parsing, skill trigger matching, current-agent stickiness
- **Fan-out tool calling** — Iterative LLM → tool call → result → LLM loop (up to 25 iterations)
- **Subagent spawning** — Nested agent loops with depth limiting (default: 3 levels deep)
- **Handoff management** — Context transfer between agents with conversation summaries, ping-pong loop detection
- **Context window management** — Token-estimated truncation with tool call/result consistency repair
- **Observer callbacks** — Hook into routing decisions, LLM calls, tool executions, handoffs for logging/UI

```typescript
// Full orchestrator usage
import { Orchestrator, createDefaultRegistry } from 'beth-copilot';

const orchestrator = new Orchestrator({
  agents: loadAgents('.github/agents'),
  skills: loadSkills('.github/skills'),
  provider: new AzureOpenAIProvider(config),
  toolRegistry: createDefaultRegistry(),
  toolContext: { workingDir: process.cwd(), permissions: { ... } },
});

const result = await orchestrator.processMessage('Implement the login page');
// result.response — final text
// result.agentId — who handled it
// result.toolCallsExecuted — what tools ran
// result.subagentResults — any nested agent work
// result.injectedSkills — skills loaded for this turn
```

---

## Tool Abstraction Layer

A uniform interface for all agent capabilities — file I/O, terminal, search, beads, subagent spawning, and MCP server tools. Tools expose OpenAI-compatible function calling schemas so the LLM can invoke them directly.

| Tool | What It Does | Key Features |
|------|-------------|-------------- |
| **readFile** | Read file contents | Line ranges, path validation, traversal guards |
| **editFile** | Atomic string replacement | Single-match enforcement, whitespace-safe |
| **search** | Ripgrep search | Node.js fallback, regex support, file filtering |
| **terminal** | Execute shell commands | `execFile('/bin/sh')` — no shell injection, timeouts |
| **beads** | Issue tracking | `bd create`, `bd close`, `bd list` via CLI wrapper |
| **subagent** | Spawn nested agents | Returns structured result for orchestrator to process |
| **MCP Bridge** | External tool servers | JSON-RPC 2.0 over stdio, JSONC config, namespaced tools |

```typescript
import { createDefaultRegistry, ToolRegistry, loadAllMCPTools } from 'beth-copilot';

// Built-in tools
const registry = createDefaultRegistry();
// → readFile, editFile, search, terminal, beads, subagent

// Add MCP server tools
const { tools: mcpTools } = await loadAllMCPTools('.vscode/mcp.json');
for (const tool of mcpTools) {
  registry.register(tool); // e.g., mcp_shadcn_listComponents
}

// Get OpenAI function calling definitions
const definitions = registry.getDefinitions();
// Pass to LLM as tools parameter
```

---

## LLM Provider Layer

The TypeScript core includes a production-ready provider abstraction for running Beth outside VS Code.

```mermaid
flowchart LR
    subgraph Config["Configuration"]
        Env["process.env"]
        DotEnv["~/.beth/.env"]
    end

    subgraph Auth["Authentication"]
        Entra["Entra ID<br/><i>DefaultAzureCredential</i>"]
    end

    subgraph Provider["Provider"]
        Base["LLMProviderBase<br/><i>Abstract interface</i>"]
        AzureOAI["AzureOpenAIProvider<br/><i>chat · chatStream · countTokens</i>"]
    end

    subgraph Resilience["Resilience"]
        RetryMod["Exponential Backoff<br/><i>Jitter · 3 retries</i>"]
        Errors["LLMError<br/><i>Typed error codes</i>"]
    end

    subgraph Streaming["Streaming"]
        Accum["StreamAccumulator<br/><i>Content + tool call assembly</i>"]
        Collect["collectStream<br/><i>Full response</i>"]
        Map["mapStream<br/><i>Transform chunks</i>"]
    end

    Env --> AzureOAI
    DotEnv --> AzureOAI
    Entra --> AzureOAI
    Base --> AzureOAI
    RetryMod --> AzureOAI
    AzureOAI --> Accum
    AzureOAI --> Collect
    Errors --> RetryMod
```

**Key capabilities:**
- **Entra ID auth** — No API keys. Uses `DefaultAzureCredential` (az login, managed identity, VS Code creds)
- **Streaming** — `chatStream()` yields `ChatChunk` objects with incremental tool call delta assembly
- **Retry** — Exponential backoff with jitter for 429/5xx/network errors. Non-transient errors fail fast
- **Config** — `process.env` → `~/.beth/.env` precedence chain
- **193 provider tests** covering types, retry, config, streaming, and Azure client

---

## TypeScript Core

The engine that powers everything. Parses agent and skill definitions, manages conversations, routes requests, executes tools, and provides typed APIs for the full agentic loop.

### Project Structure

```
beth/
├── bin/
│   └── cli.js                      # CLI entry point (init, doctor, quickstart, help)
├── src/
│   ├── index.ts                    # Barrel exports (all public API)
│   ├── cli/commands/
│   │   ├── doctor.ts               # System health validation
│   │   └── quickstart.ts           # Guided setup flow
│   ├── core/
│   │   ├── orchestrator.ts         # Agentic loop: route → LLM → tools → response
│   │   ├── router.ts               # @mention routing, skill matching, agent lookup
│   │   ├── context.ts              # Conversation state, token truncation, skill injection
│   │   ├── handoffs.ts             # Agent-to-agent transfers, loop detection
│   │   ├── agents/
│   │   │   ├── types.ts            # AgentDefinition, AgentFrontmatter, AgentHandoff
│   │   │   └── loader.ts           # Parse .agent.md → typed definitions
│   │   └── skills/
│   │       ├── types.ts            # SkillDefinition, TriggerMap
│   │       └── loader.ts           # Parse SKILL.md, extract triggers, match queries
│   ├── lib/
│   │   └── pathValidation.ts       # Traversal/injection guards
│   ├── tools/
│   │   ├── interface.ts            # Tool interface + toToolDefinition()
│   │   ├── types.ts                # ToolError, ToolResult, ToolContext, ToolPermissions
│   │   ├── registry.ts             # ToolRegistry: register, get, list, getDefinitions
│   │   ├── cli/
│   │   │   ├── readFile.ts         # File reading with line ranges
│   │   │   ├── editFile.ts         # Atomic string replacement
│   │   │   ├── search.ts           # Ripgrep with Node.js fallback
│   │   │   ├── terminal.ts         # Secure command execution
│   │   │   ├── beads.ts            # Issue tracking via bd CLI
│   │   │   └── subagent.ts         # Agent spawning interface
│   │   └── mcp/
│   │       ├── client.ts           # JSON-RPC 2.0 over stdio
│   │       └── bridge.ts           # JSONC config, tool namespacing
│   └── providers/
│       ├── interface.ts            # LLMProviderBase abstract class
│       ├── azure.ts                # AzureOpenAIProvider (Entra ID, streaming, tools)
│       ├── types.ts                # 17 types: ChatMessage, ToolCall, LLMError, etc.
│       ├── retry.ts                # Exponential backoff with jitter
│       ├── config.ts               # Environment + dotfile config loader
│       └── streaming.ts            # StreamAccumulator, collectStream, mapStream
├── templates/
│   └── .github/
│       ├── agents/                 # 7 agent definitions (.agent.md)
│       └── skills/                 # 8 skill modules (SKILL.md)
└── docs/
    ├── INSTALLATION.md
    ├── MCP-SETUP.md
    ├── CLI-ARCHITECTURE.md
    └── SYSTEM-FLOW.md
```

### Test Coverage

**814 tests** (813 pass, 1 skip, 0 fail):

| Suite | Tests | What It Covers |
|-------|-------|---------------|
| **Orchestration** | | |
| Orchestrator | 30+ | Agentic loop, tool calling, subagent spawning, iteration limits |
| AgentRouter | 30+ | @mention routing, skill matching, agent resolution |
| ConversationContext | 30+ | Token truncation, skill injection, tool call repair |
| HandoffManager | 30+ | Context transfer, depth limits, ping-pong detection |
| **Tools** | | |
| Tool interface | 20+ | Tool → ToolDefinition conversion, schema validation |
| ToolRegistry | 20+ | Register, get, list, definitions, duplicate detection |
| readFile | 30+ | Line ranges, path validation, encoding |
| editFile | 30+ | String replacement, single-match enforcement |
| search | 30+ | Ripgrep, Node.js fallback, regex, file filtering |
| terminal | 30+ | Command execution, timeouts, output capture |
| beads | 30+ | bd CLI wrapper, create/close/list/ready |
| subagent | 30+ | Spawn interface, result marking, agent validation |
| MCP client | 30+ | JSON-RPC 2.0, protocol handshake, tool listing |
| MCP bridge | 30+ | JSONC parsing, tool namespacing, error handling |
| Tool suite | 10+ | createDefaultRegistry, integration tests |
| **Providers** | | |
| Provider types | 40+ | LLMError codes, ChatMessage shapes, ToolDefinition schemas |
| Provider retry | 40+ | Exponential backoff, jitter, transient error detection |
| Provider config | 30+ | Env precedence, dotenv parsing, URL validation |
| Provider streaming | 40+ | Chunk accumulation, tool call delta assembly |
| Provider Azure | 30+ | Message mapping, response mapping, error wrapping |
| **Core & CLI** | | |
| Agent loader | 30+ | Frontmatter parsing, validation, code fence stripping, handoffs |
| Skill loader | 30+ | Trigger extraction, query matching, trigger map building |
| CLI E2E | 52 | Init/doctor pipeline, MCP template validation, help output |
| Path validation | 33 | Traversal detection, injection prevention, allowlists |

---

## IDEO Design Thinking

Beth follows human-centered design methodology across agent workflows:

```mermaid
flowchart LR
    subgraph Empathize["1. Empathize"]
        E["@researcher<br/>User interviews<br/>Pain points"]
    end

    subgraph Define["2. Define"]
        D["@product-manager<br/>Problem framing<br/>Requirements"]
    end

    subgraph Ideate["3. Ideate"]
        I["@ux-designer<br/>Component specs<br/>Patterns"]
    end

    subgraph Prototype["4. Prototype"]
        P["@developer<br/>Build to learn<br/>Feature spikes"]
    end

    subgraph Test["5. Test"]
        T["@tester<br/>Validate<br/>Accessibility"]
    end

    E --> D --> I --> P --> T
    T -.->|iterate| E
    T -.->|iterate| I
```

---

## Quality Standards

Beth doesn't ship garbage:

| Standard | Gate | Enforced By |
|----------|------|-------------|
| **WCAG 2.1 AA** | Accessibility compliance | UX Designer + Tester |
| **Core Web Vitals** | LCP < 2.5s, FID < 100ms, CLS < 0.1 | Developer |
| **OWASP Top 10** | Zero known vulnerabilities | Security Reviewer |
| **TypeScript Strict** | No `any` | Developer |
| **Test Coverage** | Unit + Integration + E2E | Tester |

```mermaid
flowchart TB
    subgraph Standards["Quality Standards"]
        A11y["WCAG 2.1 AA"]
        Perf["Core Web Vitals"]
        Sec["OWASP Compliant"]
        Type["Full TypeScript"]
        Coverage["Test Coverage"]
    end

    subgraph Gates["Enforcement"]
        Designer["UX Designer"]
        Developer["Developer"]
        Security["Security Reviewer"]
        Tester["Tester"]
    end

    A11y --> Designer
    Perf --> Developer
    Sec --> Security
    Type --> Developer
    Coverage --> Tester

    Designer --> Ship{Ship?}
    Developer --> Ship
    Security --> Ship
    Tester --> Ship

    Ship -->|All Pass| Deploy["🚀 Deploy"]
    Ship -->|Fail| Fix["🔧 Fix & Retry"]
    Fix --> Gates
```

---

## Quick Commands

Don't waste her time. Be direct.

```
@Beth Build me a dashboard for user analytics with real-time updates.
```

```
@Beth Security review for our authentication flow. Find the holes.
```

```
@developer Implement a drag-and-drop task board. Make it fast.
```

```
@security-reviewer OWASP top 10 assessment on our API endpoints.
```

```
@tester Accessibility audit. WCAG 2.1 AA. No excuses.
```

---

## Why Beth?

<p align="center">
  <img src="assets/beth-questioning.png" alt="Beth" width="500">
</p>

Look, you *could* try to coordinate seven specialists yourself. You could context-switch between product strategy, security reviews, and accessibility audits while keeping your sanity intact.

Or you could let Beth handle it.

She's got the crew. She's got the workflows. She delegates like a managing director because that's exactly what she is. You bring the problem, she brings the people—and somehow, the code ships on time, secure, and accessible.

Is it magic? No. It's just competence with very good hair.

> *"I made two decisions in my life based on fear, and they almost ruined me. I'll never make another."*

---

## Requirements

- **Node.js** ≥ 18
- **VS Code** with GitHub Copilot extension
- **GitHub Copilot Chat** in Agent mode
- [**beads**](https://github.com/steveyegge/beads) for task tracking (`bd` CLI)

### Installing Beads

```bash
curl -fsSL https://raw.githubusercontent.com/steveyegge/beads/main/scripts/install.sh | bash
```

**CGO Troubleshooting (Linux/WSL):** Beads uses Dolt (a Git-for-data database) which requires CGO. If `bd init` or `bd doctor` fails with CGO-related errors:

```bash
# Install C compiler toolchain (required for CGO)
sudo apt-get update && sudo apt-get install -y build-essential gcc

# Verify CGO is available
export CGO_ENABLED=1
go env CGO_ENABLED  # should print 1

# Re-install beads
curl -fsSL https://raw.githubusercontent.com/steveyegge/beads/main/scripts/install.sh | bash
```

**Common beads issues:**
- `bd: command not found` — Add `~/.local/bin` to your PATH: `export PATH="$HOME/.local/bin:$PATH"`
- `bd doctor` warnings about metadata — Run `bd doctor --fix` to auto-repair
- Dolt migration errors — Delete `.beads/` and re-initialize with `bd init`

```bash
# Verify beads is working
bd doctor
```

### Optional: MCP Servers

See [MCP Integrations](#mcp-integrations) above or [docs/MCP-SETUP.md](docs/MCP-SETUP.md) for setup.

---

## Documentation

| Doc | Purpose |
|-----|---------|
| [Installation Guide](docs/INSTALLATION.md) | Full setup: prerequisites, VS Code config, beads |
| [MCP Setup](docs/MCP-SETUP.md) | Optional server integrations |
| [CLI Architecture](docs/CLI-ARCHITECTURE.md) | Dual-interface design, implementation phases |
| [System Flow](docs/SYSTEM-FLOW.md) | Agent orchestration diagrams |
| [Contributing Guide](CONTRIBUTING.md) | How to contribute (PR process, review checklist) |
| [Changelog](CHANGELOG.md) | Version history |
| [Security Policy](SECURITY.md) | Vulnerability reporting |

---

## License

MIT — Take it. Run it. Build empires.

---

*Built with the kind of ferocity that would make John Dutton proud.*
