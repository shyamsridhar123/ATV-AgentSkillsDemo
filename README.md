# Beth

<p align="center">
  <img src="assets/yellowstone-beth.png" alt="Beth" width="600">
</p>

She doesn't do excuses. She doesn't do hand-holding. She does results—and she'll have your entire project shipping while everyone else is still scheduling their kickoff meeting. Think of her as the managing director your codebase didn't know it needed, but absolutely deserves.

They broke her wings once. They forgot she had claws.

---

## What Is This?

Beth is a **multi-agent AI orchestrator** with a TypeScript runtime, CLI toolchain, MCP integrations, and agent-to-agent (A2A) delegation—all driven by a ruthless coordinator who runs your development team the way Beth Dutton runs Schwartz & Meyer.

She commands seven specialized agents, each with their own expertise, tools, and handoff chains. On top of the GitHub Copilot agent layer, Beth now ships a **TypeScript core engine** with parsed agent/skill schemas, an Azure OpenAI LLM provider, streaming tool-call support, and a CLI that validates your entire installation in one command.

**The system has three execution layers:**

| Layer | What It Does | Status |
|-------|-------------|--------|
| **Copilot Agents** | `.agent.md` definitions running in VS Code Agent Mode | Live |
| **CLI Toolchain** | `beth init`, `beth doctor`, `beth quickstart` — TypeScript commands with 485 tests | Live |
| **LLM Provider** | Azure OpenAI with Entra ID auth, streaming, retry, tool calling | Live |

---

## Architecture

```mermaid
flowchart TB
    subgraph UI["User Interfaces"]
        Copilot["VS Code Copilot Chat<br/><i>Agent Mode</i>"]
        CLI["Beth CLI<br/><i>init · doctor · quickstart</i>"]
    end

    subgraph Core["Beth Core Engine — TypeScript"]
        AgentLoader["Agent Loader<br/><i>Parse .agent.md frontmatter</i>"]
        SkillLoader["Skill Loader<br/><i>Parse SKILL.md + triggers</i>"]
        Types["Agent & Skill Types<br/><i>Typed schemas</i>"]
        PathVal["Path Validation<br/><i>Traversal/injection guard</i>"]
    end

    subgraph Agents["Specialist Agents (A2A)"]
        Beth["@Beth<br/><i>Orchestrator</i>"]
        PM["@product-manager"]
        Researcher["@researcher"]
        Designer["@ux-designer"]
        Developer["@developer"]
        Security["@security-reviewer"]
        Tester["@tester"]
    end

    subgraph Skills["Skills — On-Demand Knowledge"]
        PRD["PRD Generation"]
        Framer["Framer Components"]
        React["React/Next.js<br/>Best Practices"]
        WebDesign["Web Design<br/>Guidelines"]
        Shadcn["shadcn/ui"]
        SecAnalysis["Security Analysis"]
        AzureOps["Azure Operations"]
        WebSearch["Web Search"]
    end

    subgraph MCP["MCP Servers — Optional"]
        MCPShadcn["shadcn/ui"]
        MCPPlaywright["Playwright"]
        MCPAzure["Azure"]
        MCPBrave["Brave Search"]
        MCPDeepWiki["DeepWiki"]
    end

    subgraph Provider["LLM Provider Layer"]
        Interface["LLMProviderBase<br/><i>Abstract interface</i>"]
        Azure["AzureOpenAIProvider<br/><i>Entra ID · Streaming</i>"]
        Retry["Retry + Backoff<br/><i>Exponential w/ jitter</i>"]
        Stream["StreamAccumulator<br/><i>Tool call assembly</i>"]
        Config["Config Loader<br/><i>env → ~/.beth/.env</i>"]
    end

    subgraph Tracking["Work Tracking"]
        Beads["beads (bd CLI)<br/><i>Agent coordination</i>"]
        Backlog["Backlog.md<br/><i>Human changelog</i>"]
    end

    Copilot --> Beth
    CLI --> Core
    Core --> Agents
    Beth -->|"routes"| PM & Researcher & Designer & Developer & Security & Tester

    PM -.->|"loads"| PRD
    Designer -.->|"loads"| Framer & WebDesign
    Developer -.->|"loads"| React & Shadcn
    Security -.->|"loads"| SecAnalysis
    Researcher -.->|"loads"| WebSearch
    Developer -.->|"uses"| MCPShadcn
    Tester -.->|"uses"| MCPPlaywright
    Security -.->|"uses"| MCPAzure
    Researcher -.->|"uses"| MCPBrave

    Azure --> Interface
    Retry --> Azure
    Stream --> Azure
    Config --> Azure

    Beth -.->|"tracks"| Beads
    Beth -.->|"updates"| Backlog

    style Beth fill:#1e3a5f,color:#fff
    style Core fill:#f0f4f8
    style Provider fill:#e8f5e9
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
| **Testing** | Node.js built-in test runner | 485 tests — unit, integration, E2E |
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

The engine that powers everything. Parses agent and skill definitions, validates configuration, and provides typed APIs.

### Project Structure

```
beth/
├── bin/
│   └── cli.js                      # CLI entry point (init, doctor, quickstart, help)
├── src/
│   ├── index.ts                    # Barrel exports
│   ├── cli/commands/
│   │   ├── doctor.ts               # System health validation
│   │   └── quickstart.ts           # Guided setup flow
│   ├── core/
│   │   ├── agents/
│   │   │   ├── types.ts            # AgentDefinition, AgentFrontmatter, AgentHandoff
│   │   │   └── loader.ts           # Parse .agent.md → typed definitions
│   │   └── skills/
│   │       ├── types.ts            # SkillDefinition, TriggerMap
│   │       └── loader.ts           # Parse SKILL.md, extract triggers, match queries
│   ├── lib/
│   │   └── pathValidation.ts       # Traversal/injection guards
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

**485 tests** (484 pass, 1 skip, 0 fail):

| Suite | Tests | What It Covers |
|-------|-------|---------------|
| Agent loader | 30+ | Frontmatter parsing, validation, code fence stripping, handoffs |
| Skill loader | 30+ | Trigger extraction, query matching, trigger map building |
| Provider types | 40+ | LLMError codes, ChatMessage shapes, ToolDefinition schemas |
| Provider retry | 40+ | Exponential backoff, jitter, transient error detection |
| Provider config | 30+ | Env precedence, dotenv parsing, URL validation |
| Provider streaming | 40+ | Chunk accumulation, tool call delta assembly |
| Provider Azure | 30+ | Message mapping, response mapping, error wrapping |
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
