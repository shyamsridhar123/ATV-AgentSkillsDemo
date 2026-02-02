# CLI Implementation Plan: TypeScript Foundation + Commands

> **Status:** APPROVED  
> **Created:** February 2026  
> **Branch:** `feat/cli-typescript-foundation`

## Language Decision

### Why TypeScript over Rust/Go?

| Factor | TypeScript | Rust | Go |
|--------|-----------|------|-----|
| **Cold start** | ~150ms | ~5ms | ~10ms |
| **Migration cost** | Low (existing JS) | Full rewrite | Full rewrite |
| **Anthropic SDK** | Official, mature | Community | Official |
| **Agent/skill parsing** | `gray-matter` (proven) | Roll your own | `goldmark` + manual YAML |
| **MCP client** | JS ecosystem has libs | Would need to build | Would need to build |
| **Copilot bridge potential** | Native (same runtime) | FFI complexity | FFI complexity |
| **Your codebase** | Already JS | Foreign | Foreign |

### Rust Pros/Cons

**Pros:**
- Blazing fast cold start (~5ms)
- Single binary distribution (no Node.js dependency)
- Memory safety guarantees
- Excellent error handling with `Result<T, E>`

**Cons:**
- Full rewrite of existing JavaScript code
- Steeper learning curve
- No official Anthropic SDK (community crates only)
- MCP client would need to be built from scratch
- Slower iteration speed during development
- No runtime sharing potential with VS Code/Copilot

### Go Pros/Cons

**Pros:**
- Fast startup (~10ms)
- Single binary distribution
- Official Anthropic SDK available
- Simpler than Rust, good for CLI tools
- Strong concurrency primitives

**Cons:**
- Full rewrite of existing JavaScript code
- YAML frontmatter parsing less ergonomic than `gray-matter`
- MCP client would need to be built
- No runtime sharing with Copilot
- Less expressive type system than TypeScript

### Decision: TypeScript

**Rationale:**
1. **Existing code stays useful** - `init` logic, path validation, tests migrate cleanly
2. **Anthropic SDK is battle-tested** - Handles streaming, retries, token counting
3. **MCP compatibility** - Reference implementations exist in JS/TS ecosystem
4. **Copilot parity** - Same language as VS Code extensions enables runtime sharing
5. **Team context** - Agents and skills already embed React/TypeScript patterns
6. **Developer velocity** - Ship features in weeks, not months

The 150ms startup penalty is irrelevant for a REPL that runs for minutes/hours.

---

## Overview

Bootstrap TypeScript infrastructure, then add `doctor` and `quickstart` as simple utility commands. This creates the foundation for the full CLI architecture (see [CLI-ARCHITECTURE.md](CLI-ARCHITECTURE.md)) while delivering useful commands immediately.

**Why this order:**
- Can't parse agent frontmatter without TypeScript + `gray-matter`
- TypeScript catches errors before users find them
- New commands benefit from types immediately
- Aligns with CLI-ARCHITECTURE.md Phase 1 requirements

---

## Implementation Steps

### Part A: TypeScript Foundation

1. **Add TypeScript and build tooling to `package.json`**
   - Add `typescript`, `@types/node` as dev dependencies
   - Add `gray-matter` for YAML frontmatter parsing (needed for architecture)
   - Add build script: `"build": "tsc"`
   - Update bin entry to point to compiled output

2. **Create `tsconfig.json` at project root**
   - Target `ES2022`, module `NodeNext`
   - Output to `dist/`
   - Include `src/**/*`
   - Enable strict mode

3. **Create `src/` directory structure** per architecture doc:
   ```
   src/
   ├── index.ts
   ├── core/
   │   └── agents/
   │       └── types.ts
   └── cli/
       └── commands/
   ```

4. **Update `bin/cli.js` to be a thin wrapper**
   - Keep it as ESM JavaScript (Node runs it directly)
   - Import and dispatch to compiled TypeScript in `dist/`
   - Preserves `npx beth-copilot` ergonomics

### Part B: Simple Commands

5. **Create `doctor` command in `src/cli/commands/doctor.ts`**
   - Check Node.js version (≥18)
   - Check `beads` CLI available
   - Check `backlog.md` CLI available  
   - Validate `.github/agents/` exists with valid frontmatter
   - Validate `.github/skills/` exists
   - Report health status with clear pass/fail

6. **Create `quickstart` command in `src/cli/commands/quickstart.ts`**
   - Run `init` (existing logic, migrated or called)
   - Run `doctor` to validate
   - Initialize beads if needed
   - Print "what's next" guidance

7. **Migrate existing `bin/lib/` utilities to TypeScript**
   - `pathValidation.js` → `src/lib/pathValidation.ts`
   - Keep `animation.js` in JavaScript (it works, no benefit to migrate)

### Part C: Agent Schema Types (Architecture Phase 1 start)

8. **Define agent schema types in `src/core/agents/types.ts`**
   - Type for agent frontmatter: `name`, `model`, `tools`, `handoffs`, `infer`
   - Type for parsed agent: frontmatter + body content
   - This enables the loader in architecture Phase 1

---

## Verification

- [ ] `npm run build` compiles without errors
- [ ] `beth doctor` runs and reports status
- [ ] `beth quickstart` scaffolds a new project and validates it
- [ ] Existing `beth init --help` still works
- [ ] `npm test` passes (migrate tests to TypeScript or keep JS with type-checking)

---

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Language | TypeScript | Developer velocity, SDK availability, existing codebase |
| TypeScript first | Yes | Sets architecture foundation, catches bugs, minimal overhead |
| Keep bin/cli.js as JavaScript shim | Yes | `npx` runs it directly without compilation step |
| Don't migrate animation.js | Keep JS | It works, adds no value to type it |
| Agent types before loader | Yes | Types inform loader design, can be tested independently |

---

## What This Enables

After this plan completes, we have the foundation for:

- **Phase 1 completion:** Agent loader, skill loader (just add implementation)
- **Phase 2:** LLM provider (add `@anthropic-ai/sdk`, implement interface)
- **Easy addition of more commands**

See [CLI-ARCHITECTURE.md](CLI-ARCHITECTURE.md) for the full 7-phase plan.
