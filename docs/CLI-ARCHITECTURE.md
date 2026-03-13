# Beth Dual-Interface Architecture

> **Status:** DRAFT - Planning document  
> **Created:** February 2026  
> **Purpose:** Enable Beth to work identically via GitHub Copilot custom agents OR standalone CLI

## Overview

Make Beth work identically whether invoked via GitHub Copilot custom agents OR as a standalone CLI tool. Both interfaces share a common core engine; only the I/O layer differs.

**Key insight:** Currently Beth is a file distribution system—all intelligence lives in GitHub Copilot. This plan adds a proper runtime that can be used by BOTH Copilot (optional enhancement) AND CLI (required).

## Architecture

```
                    ┌─────────────────────────────────────┐
                    │           User Interface            │
                    ├──────────────────┬──────────────────┤
                    │   Copilot Agent  │    CLI REPL      │
                    │   (VS Code)      │   (Terminal)     │
                    └────────┬─────────┴────────┬─────────┘
                             │                  │
                    ┌────────▼──────────────────▼────────┐
                    │          Adapter Layer             │
                    │   CopilotAdapter │ CLIAdapter      │
                    └────────────────────┬───────────────┘
                                         │
┌────────────────────────────────────────▼────────────────────────────────────┐
│                            BETH CORE ENGINE                                  │
├─────────────────┬─────────────────┬─────────────────┬──────────────────────┤
│   Orchestrator  │   Agent Loader  │   Skill Loader  │  Context Manager     │
│   (routing)     │   (parse .md)   │   (triggers)    │  (conversation)      │
├─────────────────┴─────────────────┴─────────────────┴──────────────────────┤
│                           Tool Interface                                    │
│   readFile │ editFile │ search │ terminal │ subagent │ mcp              │
└────────────────────────────────────────────────────────────────────────────┘
                                         │
                    ┌────────────────────▼───────────────┐
                    │           LLM Provider             │
                    │          (Azure OpenAI)            │
                    └────────────────────────────────────┘
```

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| LLM Provider | **Azure OpenAI** | Enterprise-ready, integrated with Azure ecosystem |
| Interaction Model | Interactive REPL | Natural UX matching Copilot Chat |
| Agent Definitions | Single source (`.agent.md`) | Parsed for both interfaces |
| Tool Architecture | Abstraction layer | Same intent, different implementations per interface |
| MCP Support | Client in CLI | Required for full parity with Copilot MCP capabilities |
| Copilot Enhancement | Optional | Core can enhance Copilot agents, but not required for MVP |

## Implementation Phases

### Phase 1: Core Infrastructure

1. **Create TypeScript package structure** in `src/`:
   - `src/core/` - Orchestrator, context management, agent/skill loaders
   - `src/adapters/` - CLI and Copilot adapters
   - `src/tools/` - Abstract tool interface + implementations
   - `src/providers/` - LLM provider adapters

2. **Define agent schema types** in `src/core/agents/types.ts`:
   - Parse YAML frontmatter from `.agent.md` files into TypeScript types
   - Extract `name`, `description`, `model`, `tools`, `handoffs`, `infer`
   - Structure agent body (markdown) as system prompt template

3. **Build agent loader** in `src/core/agents/loader.ts`:
   - Read `.agent.md` files from `templates/.github/agents/`
   - Parse frontmatter with `gray-matter` or similar
   - Validate against schema
   - Return typed agent definitions

4. **Build skill loader** in `src/core/skills/loader.ts`:
   - Read `SKILL.md` files from `templates/.github/skills/`
   - Extract trigger phrases from description
   - Build trigger → skill content map

### Phase 2: LLM Integration ✅

5. **LLM provider interface** in `src/providers/interface.ts` ✅:
   - `LLMProviderBase` abstract class with `chat()`, `chatStream()`, `countTokens()`
   - `ChatRequestOptions` for per-request overrides (tools, temperature, etc.)
   - `ProviderFactory` and `ProviderRegistry` types for dynamic instantiation

6. **Azure OpenAI provider** in `src/providers/azure.ts` ✅:
   - Uses `openai` npm package (not `@azure/openai`) with `AzureOpenAI` client
   - Entra ID auth via `@azure/identity` `TokenCredential` + `getBearerTokenProvider`
   - Streaming with tool call delta assembly
   - Error mapping to `LLMError` with retry for transient failures

   Supporting modules:
   - `src/providers/types.ts` — 17 types, `LLMError` class with error codes
   - `src/providers/retry.ts` — Exponential backoff with jitter, `RetryError`
   - `src/providers/config.ts` — `process.env` → `~/.beth/.env` precedence, `ConfigError`
   - `src/providers/streaming.ts` — `StreamAccumulator`, `collectStream`, `mapStream`
   - `src/providers/index.ts` — Barrel exports for the provider module
   - 193 unit tests across 5 test files (359 total TS tests passing)

### Phase 3: Tool Abstraction ✅

7. **Abstract tool interface** in `src/tools/interface.ts` ✅:
   - `Tool` interface with name, description, inputSchema, execute()
   - `toToolDefinition()` bridges to OpenAI function calling format
   - Supporting: `src/tools/types.ts` (ToolError, ToolResult, ToolContext, ToolPermissions)
   - `src/tools/registry.ts` (ToolRegistry with register/get/list/getDefinitions)

8. **CLI tool implementations** in `src/tools/cli/` ✅:
   - `readFile.ts` — File reading with line ranges and path validation
   - `editFile.ts` — Atomic string replacement with single-match enforcement
   - `search.ts` — Ripgrep with Node.js fallback
   - `terminal.ts` — Secure command execution via execFile('/bin/sh', ['-c', cmd])
   - `subagent.ts` — Agent spawning stub (full implementation in Phase 4)
   - 108 tests across 5 test files

9. **MCP client** in `src/tools/mcp/` ✅:
   - `client.ts` — JSON-RPC 2.0 over stdio, MCP protocol handshake
   - `bridge.ts` — JSONC config parsing, tool namespacing (mcp_server_tool)
   - 33 tests across 2 test files

### Phase 4: Orchestration Engine

10. **Build orchestrator** in `src/core/orchestrator.ts`:
    - Route user requests to appropriate agent
    - Manage agent-to-agent handoffs
    - Handle subagent spawning and result collection
    - Track active issues via Backlog.md

11. **Implement context manager** in `src/core/context.ts`:
    - Maintain conversation history per agent
    - Handle context window limits (truncation strategy)
    - Skill injection when triggers match
    - System prompt construction from agent definition

12. **Build handoff manager** in `src/core/handoffs.ts`:
    - Parse handoff definitions from agent frontmatter
    - Manage state transfer between agents
    - Support both interactive (user reviews) and autonomous (subagent) modes

### Phase 5: CLI Adapter

13. **Build interactive REPL** in `src/adapters/cli/repl.ts`:
    - Use `readline` or `inquirer` for input handling
    - Stream LLM responses to terminal with formatting
    - Support `@agent` syntax to switch/invoke agents
    - Implement command shortcuts (`/help`, `/status`, `/exit`)

14. **Add CLI entry point** in `bin/cli.js`:
    - Add `chat` command alongside existing `init`
    - Load API key from environment (`AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT`)
    - Initialize orchestrator and start REPL
    - Handle graceful shutdown

15. **Implement rich terminal output** in `src/adapters/cli/renderer.ts`:
    - Markdown rendering with `marked` + `chalk`
    - Syntax highlighting for code blocks
    - Progress indicators for long operations
    - Agent identity badges (colored prefixes)

### Phase 6: Copilot Enhancement (Optional)

16. **Create Copilot adapter** in `src/adapters/copilot/`:
    - Bridge between Copilot's tool protocol and Beth core
    - Allow Beth core to enhance Copilot agents (optional use)
    - Enable shared skill/workflow logic

### Phase 7: Configuration & Distribution

17. **Add configuration schema** in `src/config/schema.ts`:
    - API keys (from env or config file)
    - Model preferences
    - Tool permissions
    - MCP server configurations

18. **Update `package.json`** with new dependencies:
    - `@anthropic-ai/sdk` - Claude API
    - `gray-matter` - YAML frontmatter parsing
    - `chalk` - Terminal colors
    - `marked` - Markdown rendering
    - `ora` - Spinners
    - `inquirer` - Enhanced prompts (optional)

19. **Update `bin/cli.js`** commands:
    - `beth init` - Existing scaffolding (unchanged)
    - `beth chat` - Start interactive REPL
    - `beth ask "prompt"` - One-shot mode for scripting

20. **Create documentation** in `docs/CLI-USAGE.md`:
    - Setup (API key configuration)
    - Usage examples
    - Agent commands
    - Differences from Copilot mode (if any)

## File Structure (New)

```
beth/
├── bin/
│   └── cli.js                    # Entry point (add 'chat' command)
├── src/
│   ├── index.ts                  # Main exports
│   ├── core/
│   │   ├── orchestrator.ts       # Agent routing & coordination
│   │   ├── context.ts            # Conversation/context management
│   │   ├── handoffs.ts           # Agent-to-agent transfers
│   │   └── agents/
│   │       ├── types.ts          # Agent schema definitions
│   │       └── loader.ts         # Parse .agent.md files
│   │   └── skills/
│   │       ├── types.ts          # Skill schema definitions
│   │       └── loader.ts         # Parse SKILL.md files
│   ├── providers/
│   │   ├── interface.ts          # LLM provider contract
│   │   └── azure.ts              # Azure OpenAI implementation
│   ├── tools/
│   │   ├── interface.ts          # Abstract tool interface
│   │   ├── registry.ts           # Tool name → implementation map
│   │   └── cli/
│   │       ├── readFile.ts
│   │       ├── editFile.ts
│   │       ├── search.ts
│   │       ├── terminal.ts
│   │       └── subagent.ts
│   │   └── mcp/
│   │       ├── client.ts         # MCP protocol client
│   │       └── bridge.ts         # Expose MCP tools
│   ├── adapters/
│   │   ├── cli/
│   │   │   ├── repl.ts           # Interactive chat loop
│   │   │   └── renderer.ts       # Terminal output formatting
│   │   └── copilot/
│   │       └── bridge.ts         # Optional Copilot enhancement
│   └── config/
│       └── schema.ts             # Configuration types
├── templates/                     # Existing (unchanged)
│   └── .github/agents/...
│   └── .github/skills/...
└── docs/
    ├── CLI-ARCHITECTURE.md       # This document
    └── CLI-USAGE.md              # User documentation (Phase 7)
```

## Dependencies

| Package | Purpose | Size |
|---------|---------|------|
| `@azure/openai` | Azure OpenAI API | ~100KB |
| `gray-matter` | YAML frontmatter parsing | ~15KB |
| `chalk` | Terminal styling | ~20KB |
| `marked` | Markdown to terminal | ~30KB |
| `ora` | Spinners/progress | ~10KB |

## Verification

### Unit Tests
- Agent loader parses all 7 `.agent.md` files correctly
- Skill loader extracts triggers and maps to content
- Orchestrator routes requests to correct agents
- Context manager handles 100k+ token conversations

### Integration Tests
- Full conversation loop with mocked LLM
- Subagent spawning and result collection
- Handoff state preservation
- MCP server communication

### Manual Verification
1. Run `beth chat` and interact with Beth
2. Invoke `@developer` to switch agents
3. Complete a simple task (create file, run tests)
4. Compare output quality to Copilot agent mode

### Parity Check
- Same prompt to both Copilot and CLI produces similar results
- Agent personalities match
- Skills trigger on same phrases

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| LLM costs in CLI mode | User pays per-token | Clear cost warnings, local model fallback option (Phase 2) |
| Edit safety in CLI | Wrong edits hard to undo | Confirmation prompts, dry-run mode, git integration |
| Context window limits | Long conversations fail | Aggressive summarization, conversation branching |
| MCP complexity | Delays MVP | Make MCP optional in Phase 1, add later |

## Future Considerations

- **Multi-provider support**: Add Anthropic Claude, OpenAI, Ollama adapters
- **Local model fallback**: For cost-conscious or offline usage
- **Web interface**: Browser-based REPL using same core
- **VS Code extension**: Native extension using Beth core (not Copilot)
- **Workflow automation**: Headless mode for CI/CD pipelines
