# Hooks & Handoff Enforcement

> How Beth ensures every agent loads its skills and every handoff routes through the orchestrator.

## Overview

Beth enforces skill compliance and handoff discipline through a **three-layer defense-in-depth** architecture. No single layer is sufficient on its own — they overlap so that if one fails, the others catch it.

| Layer | Hook / Mechanism | When It Fires | What It Does |
|-------|-----------------|---------------|--------------|
| **Layer 1** | `SubagentStart` hook | Before subagent sees its first message | Deterministically injects required skills into context |
| **Layer 2** | `SubagentStop` hook | When subagent tries to complete | Blocks first attempt, demands skill compliance confirmation |
| **Layer 3** | Agent `.agent.md` instructions | Always (embedded in agent definition) | Lists MANDATORY skills in the agent's own instructions |

Handoff enforcement is structural — defined in YAML frontmatter — creating a **hub-and-spoke topology** where all specialists route back through Beth.

---

## Architecture

### File Structure

```
.github/
├── hooks/
│   ├── skill-enforcement.json          # Hook registration (SubagentStart + SubagentStop)
│   └── scripts/
│       ├── inject-skills.mjs           # Layer 1: Deterministic skill injection
│       └── verify-skills.mjs           # Layer 2: Stop-gate verification
├── agents/
│   ├── beth.agent.md                   # Orchestrator (hub) — handoffs to all specialists
│   ├── developer.agent.md              # Specialist — handoff back to Beth only
│   ├── ux-designer.agent.md            # Specialist — handoff back to Beth only
│   ├── product-manager.agent.md        # Specialist — handoff back to Beth only
│   ├── security-reviewer.agent.md      # Specialist — handoff back to Beth only
│   ├── tester.agent.md                 # Specialist — handoff back to Beth only
│   └── researcher.agent.md             # Specialist — handoff back to Beth only
└── skills/
    ├── vercel-react-best-practices/    # Developer skill
    ├── shadcn-ui/                      # Developer skill
    ├── web-design-guidelines/          # UX Designer + Tester skill
    ├── framer-components/              # UX Designer skill
    ├── prd/                            # Product Manager skill
    ├── security-analysis/              # Security Reviewer skill
    └── web-search/                     # Researcher skill
```

---

## Layer 1: SubagentStart Hook (Deterministic Injection)

### Purpose

When Beth (or any orchestrator) spawns a subagent via `runSubagent()`, this hook **automatically injects** required skill content into the subagent's context before it starts working. The LLM doesn't choose whether to load skills — **the code chooses**.

### Registration

**File:** `.github/hooks/skill-enforcement.json`

```json
{
  "hooks": {
    "SubagentStart": [
      {
        "type": "command",
        "command": "node .github/hooks/scripts/inject-skills.mjs",
        "timeout": 15
      }
    ]
  }
}
```

### Implementation

**File:** `.github/hooks/scripts/inject-skills.mjs`

The script reads JSON from stdin (the hook event payload), looks up `data.agent_type` against a hardcoded skill map, and outputs JSON to stdout with `hookSpecificOutput.additionalContext`.

#### The Skill Map (Single Source of Truth)

```javascript
const AGENT_SKILLS = {
  'ux-designer': {
    inject: ['.github/skills/web-design-guidelines/SKILL.md'],
    readFile: [
      '.github/skills/framer-components/SKILL.md',
      '.github/prompts/ui-ux-pro-max/PROMPT.md',
    ],
  },
  'developer': {
    inject: ['.github/skills/vercel-react-best-practices/SKILL.md'],
    readFile: [
      '.github/skills/shadcn-ui/SKILL.md',
      '.github/skills/vercel-react-best-practices/AGENTS.md',
    ],
  },
  'product-manager': {
    inject: [],
    readFile: ['.github/skills/prd/SKILL.md'],
  },
  'security-reviewer': {
    inject: [],
    readFile: ['.github/skills/security-analysis/SKILL.md'],
  },
  'tester': {
    inject: ['.github/skills/web-design-guidelines/SKILL.md'],
    readFile: [],
  },
  'researcher': {
    inject: ['.github/skills/web-search/SKILL.md'],
    readFile: [],
  },
};
```

#### Two Injection Strategies

| Strategy | Field | Behavior | Use When |
|----------|-------|----------|----------|
| **Direct inject** | `inject` | File read from disk, content embedded in `additionalContext` | Small skill files that fit in context |
| **ReadFile mandate** | `readFile` | Path listed with instruction to `readFile` before any work | Large skill files that would bloat context |

#### Output Format

For a known agent (e.g., `developer`):

```json
{
  "continue": true,
  "hookSpecificOutput": {
    "hookEventName": "SubagentStart",
    "additionalContext": "## ⚡ SKILL ENFORCEMENT — INJECTED BY HOOK (NON-NEGOTIABLE)\n\nYou are `developer`. The following skills are MANDATORY...\n\n### Skills loaded into context (apply immediately):\n\n#### .github/skills/vercel-react-best-practices/SKILL.md\n\n<full file content>\n\n### Skills to load via readFile (MANDATORY FIRST STEP):\n\n- `.github/skills/shadcn-ui/SKILL.md`\n- `.github/skills/vercel-react-best-practices/AGENTS.md`\n\nDo NOT proceed with any task until you have read ALL of the above files."
  }
}
```

For an unknown agent type:

```json
{
  "continue": true
}
```

#### Error Handling

| Scenario | Behavior |
|----------|----------|
| Malformed JSON input | Outputs `{ "continue": true }`, exits cleanly |
| Empty input | Same — doesn't block the subagent |
| Missing `agent_type` | Same — passes through |
| Skill file not found on disk | Injects warning: "⚠️ Could not load [path]. You MUST use readFile to load this skill manually." |

---

## Layer 2: SubagentStop Hook (Verification Gate)

### Purpose

When a subagent finishes its work and tries to stop, this hook fires. It implements a **two-pass challenge model**:

1. **First stop attempt** — Block the agent, demand it confirm which skills it applied
2. **Second attempt** (with `stop_hook_active: true`) — Let it through

This catches any subagent that ignored the injected context from Layer 1.

### Registration

```json
{
  "hooks": {
    "SubagentStop": [
      {
        "type": "command",
        "command": "node .github/hooks/scripts/verify-skills.mjs",
        "timeout": 10
      }
    ]
  }
}
```

### Implementation

**File:** `.github/hooks/scripts/verify-skills.mjs`

#### First Stop (Block)

Input: `{}` or any payload without `stop_hook_active: true`

Output:
```json
{
  "hookSpecificOutput": {
    "hookEventName": "Stop",
    "decision": "block",
    "reason": "Before finishing: Confirm you loaded and applied your MANDATORY skills. If you were injected skill context by the enforcement hook, state which key rules you applied. If you did NOT read your required skill files, read them now and verify your work complies."
  }
}
```

#### Second Stop (Pass-through)

Input: `{ "stop_hook_active": true }`

Output:
```json
{
  "continue": true
}
```

#### Error Handling

| Scenario | Behavior |
|----------|----------|
| Malformed JSON input | `{ "continue": true }` — doesn't trap the agent |
| Empty input | Same |
| `stop_hook_active: false` | Treated as first attempt — blocks |

---

## Layer 3: Agent Instructions (Defense in Depth)

### Purpose

Covers the case where a **user directly activates an agent** (via `@developer` in chat, clicking a handoff button) rather than spawning it as a subagent. No `SubagentStart` hook fires in that case — the agent's own `.agent.md` instructions serve as the enforcement layer.

### Implementation

Every specialist agent's `.agent.md` includes a `## MANDATORY Skills (Non-Negotiable)` section:

```markdown
## MANDATORY Skills (Non-Negotiable)

**BEFORE doing ANY work**, you MUST load your required skills. This is not optional.
Skills are also injected by the `SubagentStart` hook when you are spawned as a subagent.

**Required skills — load ALL of these before responding to any request:**

1. **Read** `.github/skills/<skill-name>/SKILL.md` — <description>

After reading, confirm which key patterns you will apply before proceeding with work.
```

### Per-Agent Required Skills

| Agent | Required Skills (via instructions) | Conditional Skills |
|-------|-----------------------------------|-------------------|
| **developer** | shadcn-ui, vercel-react-best-practices (SKILL.md + AGENTS.md) | framer-components, Azure skills |
| **ux-designer** | framer-components, web-design-guidelines, ui-ux-pro-max | — |
| **product-manager** | prd | azure-cost-optimization, azure-cloud-migrate |
| **security-reviewer** | security-analysis | azure-rbac, azure-compliance, entra-app-registration |
| **tester** | web-design-guidelines | — |
| **researcher** | web-search | — |

---

## Handoff Enforcement

### Hub-and-Spoke Topology

Handoffs are declared in YAML frontmatter of each `.agent.md`. The topology enforces that:

- **Beth** can hand off to all 6 specialists
- **Every specialist** can only hand off **back to Beth**
- Specialists **cannot** hand off to each other directly

This prevents unsupervised lateral delegation and ensures Beth maintains situational awareness of all work in progress.

### Beth's Handoffs (Hub → Spokes)

```yaml
# From beth.agent.md frontmatter
handoffs:
  - label: Product Strategy
    agent: product-manager
    prompt: "Define WHAT to build. Load `.github/skills/prd/SKILL.md`. Deliver: user stories with acceptance criteria, RICE-scored priorities, success metrics. Follow workflow in AGENTS.md."
    send: true
  - label: User Research
    agent: researcher
    prompt: "Conduct research. Load `.github/skills/web-search/SKILL.md`. Deliver: findings with evidence, actionable recommendations, confidence levels. Follow workflow in AGENTS.md."
    send: true
  - label: UX Design
    agent: ux-designer
    prompt: "Specify HOW it works. Load `.github/skills/framer-components/SKILL.md` and `.github/skills/web-design-guidelines/SKILL.md`. Deliver: component specs, interaction states, design tokens, WCAG 2.1 AA compliance. Follow workflow in AGENTS.md."
    send: true
  - label: Development
    agent: developer
    prompt: "Implement in React/TypeScript/Next.js. Load `.github/skills/vercel-react-best-practices/SKILL.md` and `.github/skills/shadcn-ui/SKILL.md`. Deliver: working code with tests. Follow workflow in AGENTS.md."
    send: true
  - label: Security Review
    agent: security-reviewer
    prompt: "Security audit. Load `.github/skills/security-analysis/SKILL.md`. Deliver: OWASP Top 10 + Azure WAF assessment, severity-rated findings, remediation code. Follow workflow in AGENTS.md."
    send: true
  - label: Quality Assurance
    agent: tester
    prompt: "Test and verify. Load `.github/skills/web-design-guidelines/SKILL.md`. Deliver: test report with pass/fail counts, accessibility audit, performance assessment. Follow workflow in AGENTS.md."
    send: true
```

Each handoff includes:
- **`label`** — Human-readable name shown in the UI
- **`agent`** — Target agent name
- **`prompt`** — Context transferred to the agent, including which skills to load and expected deliverables
- **`send: true`** — Context is transferred automatically

### Specialist Handoffs (Spokes → Hub)

Every specialist has exactly one handoff:

```yaml
handoffs:
  - label: Escalate to Beth
    agent: Beth
    prompt: "Report findings and request next steps. Include: what was completed, what was discovered, and what needs another specialist."
    send: true
```

### Handoff vs Subagent

| Mechanism | Who Controls | When to Use |
|-----------|-------------|-------------|
| **Handoff** | User clicks button, reviews before proceeding | User needs visibility / approval |
| **Subagent** (`runSubagent`) | Beth spawns autonomously, results returned | Work can run without approval |

Subagents are the primary mechanism for multi-agent workflows. Handoffs are the escape hatch for human-in-the-loop scenarios.

---

## Reproduction Steps

### Prerequisites

1. A project initialized with `npx beth-copilot init` (which scaffolds the `.github/hooks/` and `.github/agents/` directories)
2. Node.js available in PATH

### Testing Layer 1: SubagentStart Hook

#### Verify developer skill injection

```bash
echo '{"agent_type": "developer"}' \
  | node .github/hooks/scripts/inject-skills.mjs \
  | python3 -m json.tool
```

**Expected output:** JSON with `continue: true` and `hookSpecificOutput.additionalContext` containing:
- `⚡ SKILL ENFORCEMENT — INJECTED BY HOOK (NON-NEGOTIABLE)`
- `You are \`developer\``
- Full content of `.github/skills/vercel-react-best-practices/SKILL.md` (inline)
- ReadFile mandates for `shadcn-ui/SKILL.md` and `vercel-react-best-practices/AGENTS.md`

#### Verify ux-designer skill injection

```bash
echo '{"agent_type": "ux-designer"}' \
  | node .github/hooks/scripts/inject-skills.mjs \
  | python3 -m json.tool
```

**Expected:** Inline web-design-guidelines content + readFile mandates for framer-components and ui-ux-pro-max.

#### Verify unknown agent passthrough

```bash
echo '{"agent_type": "unknown-agent"}' \
  | node .github/hooks/scripts/inject-skills.mjs \
  | python3 -m json.tool
```

**Expected:** `{ "continue": true }` — no `hookSpecificOutput`.

#### Verify malformed input handling

```bash
echo 'not json' \
  | node .github/hooks/scripts/inject-skills.mjs \
  | python3 -m json.tool
```

**Expected:** `{ "continue": true }` — graceful degradation, doesn't block the subagent.

### Testing Layer 2: SubagentStop Hook

#### First stop attempt (should block)

```bash
echo '{}' \
  | node .github/hooks/scripts/verify-skills.mjs \
  | python3 -m json.tool
```

**Expected:**
```json
{
  "hookSpecificOutput": {
    "hookEventName": "Stop",
    "decision": "block",
    "reason": "Before finishing: Confirm you loaded and applied your MANDATORY skills..."
  }
}
```

#### Second stop attempt (should pass through)

```bash
echo '{"stop_hook_active": true}' \
  | node .github/hooks/scripts/verify-skills.mjs \
  | python3 -m json.tool
```

**Expected:** `{ "continue": true }`

#### Edge case: stop_hook_active=false (should block)

```bash
echo '{"stop_hook_active": false}' \
  | node .github/hooks/scripts/verify-skills.mjs \
  | python3 -m json.tool
```

**Expected:** Block with the skill verification challenge (same as first attempt).

### Testing Layer 3: Agent Instructions

Verify each agent has the MANDATORY Skills section:

```bash
grep -l "MANDATORY Skills" .github/agents/*.agent.md
```

**Expected:** All 6 specialist agents listed (developer, ux-designer, product-manager, security-reviewer, tester, researcher).

### Running the Full Test Suite

```bash
# Unit tests for both hooks
npx vitest run src/__tests__/inject-skills.test.ts
npx vitest run src/__tests__/verify-skills.test.ts

# Or run everything
npm test
```

**Test coverage includes:**
- Output structure validation (`continue: true`, `hookEventName`)
- Per-agent skill mapping (all 6 specialists)
- Edge cases: unknown agents, malformed input, empty input
- Two-pass stop model: block on first, pass on retry
- `stop_hook_active=false` treated as first attempt

---

## Known Limitations

### The Verification Gap

Layer 2 (SubagentStop) is a **trust-based gate**, not a code analysis gate. The hook asks the agent to *confirm* it applied its skills — it doesn't parse the agent's output to verify compliance. A sufficiently hallucinating LLM could claim compliance while ignoring the rules.

**Mitigation:** The real enforcement is Layer 1 — skills are literally in the agent's context before it starts working. That's not optional. Layer 2 is the safety net, not the safety harness. Layer 3 covers the direct-activation path.

### Handoff Prompts Are Advisory

The `prompt` field in handoff definitions tells the receiving agent what to load and deliver, but the agent _could_ ignore it. This is mitigated by:
1. The SubagentStart hook fires regardless of what the handoff prompt says
2. The agent's own MANDATORY Skills section applies regardless

### No Cross-Specialist Handoffs

Specialists cannot delegate to each other. If the developer discovers a security issue, they must escalate to Beth, who routes to the security reviewer. This is by design — Beth needs visibility — but adds latency.

---

## Adding a New Agent

1. **Create the agent definition:** `.github/agents/<name>.agent.md` with frontmatter defining `tools`, `handoffs` (to Beth only), and instructions including a `## MANDATORY Skills (Non-Negotiable)` section.

2. **Update the skill map** in `.github/hooks/scripts/inject-skills.mjs`:
   ```javascript
   '<agent-name>': {
     inject: ['<small-skill-path>'],      // Read from disk, embedded inline
     readFile: ['<large-skill-path>'],     // Agent must readFile before working
   },
   ```

3. **Add a handoff from Beth** in `.github/agents/beth.agent.md` frontmatter:
   ```yaml
   - label: <Human Label>
     agent: <agent-name>
     prompt: "<context including skill paths and expected deliverables>"
     send: true
   ```

4. **Add unit tests** in `src/__tests__/inject-skills.test.ts`:
   ```typescript
   describe('inject-skills.mjs: <agent-name>', () => {
     const ctx = () => getContext({ agent_type: '<agent-name>', cwd: PROJECT_ROOT });

     it('should inject/mandate the correct skills', () => {
       expect(ctx()).toContain('<skill-path>');
     });
   });
   ```

5. **Update the template** in `templates/.github/hooks/scripts/inject-skills.mjs` to match.

---

## Adding a New Skill

1. **Create the skill:** `.github/skills/<skill-name>/SKILL.md`

2. **Decide the injection strategy:**
   - Small file (< ~2KB) → add to `inject` array (embedded in context)
   - Large file → add to `readFile` array (agent reads on demand)

3. **Update the skill map** in `inject-skills.mjs` for the relevant agent(s).

4. **Update the agent's MANDATORY Skills section** in their `.agent.md`.

5. **Add tests** verifying the skill appears in the hook output.

---

## Summary

| Question | Answer |
|----------|--------|
| Where is the hook registration? | `.github/hooks/skill-enforcement.json` |
| Where is the skill map? | `.github/hooks/scripts/inject-skills.mjs` (the `AGENT_SKILLS` object) |
| Where is the stop gate? | `.github/hooks/scripts/verify-skills.mjs` |
| Can agents skip skills? | Only if all three layers fail simultaneously |
| Can specialists hand off to each other? | No — everything routes through Beth |
| Where are the tests? | `src/__tests__/inject-skills.test.ts` and `src/__tests__/verify-skills.test.ts` |
| How do I add a new agent? | Update skill map + Beth's handoffs + agent definition + tests |
| How do I add a new skill? | Create SKILL.md + update skill map + update agent instructions + tests |
