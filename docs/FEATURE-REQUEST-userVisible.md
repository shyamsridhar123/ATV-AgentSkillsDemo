# Feature Request: Add `userVisible` frontmatter property to control agent dropdown visibility

## Problem Statement

When building orchestrator-pattern agent systems (like multi-agent workflows), users need:
1. **One primary agent visible** in the dropdown (the orchestrator)
2. **Multiple specialist agents hidden** from the dropdown but still callable via `runSubagent()`

Currently, **all** `.agent.md` files in `.github/agents/` automatically appear in the agents dropdown. The only way to hide agents is via the UI (Configure Custom Agents → eye icon), which:
- Is a **per-user setting**, not a repository default
- Requires manual action from every contributor
- Cannot be version-controlled or shared with the team

## Proposed Solution

Add an optional `userVisible` property to the agent frontmatter schema:

```yaml
---
name: developer
description: Expert React/TypeScript developer
model: Claude Sonnet 4
infer: true           # Can be called via runSubagent()
userVisible: false    # Hidden from dropdown by default
tools: [...]
---
```

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `userVisible` | boolean | `true` | When `false`, agent is hidden from the agents dropdown but remains available for subagent invocation (if `infer: true`) |

## Use Case: Orchestrator Pattern

Many teams implement an orchestrator pattern where:

```
┌─────────────────────────────────────────────────────┐
│                   User Interface                     │
│                                                      │
│   Agents Dropdown: [ Beth ▼ ]                       │
│                                                      │
└─────────────────────┬───────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────┐
│              Beth (Orchestrator)                     │
│              userVisible: true                       │
│                                                      │
│   Analyzes requests → Routes to specialists          │
│                                                      │
└──────┬──────────┬──────────┬──────────┬─────────────┘
       │          │          │          │
       ▼          ▼          ▼          ▼
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│Developer │ │Designer  │ │Researcher│ │Tester    │
│          │ │          │ │          │ │          │
│userVisible│ │userVisible│ │userVisible│ │userVisible│
│  false   │ │  false   │ │  false   │ │  false   │
│infer:true│ │infer:true│ │infer:true│ │infer:true│
└──────────┘ └──────────┘ └──────────┘ └──────────┘
     ▲              ▲            ▲            ▲
     └──────────────┴────────────┴────────────┘
              Called via runSubagent()
```

**Without this feature**, users see 7 agents in the dropdown when they should only see 1. This creates:
- Confusion about which agent to use
- Accidental direct invocation of specialists (bypassing the orchestrator)
- Poor UX for teams with many specialized agents

## Alternatives Considered

| Alternative | Why It's Insufficient |
|-------------|----------------------|
| **UI-based hiding** | Per-user, not version-controlled, requires manual setup per contributor |
| **Move to different folder** | `runSubagent()` only scans `.github/agents/` |
| **Inline all agents into orchestrator** | Creates monolithic 5000+ line file, loses modularity |
| **Convert agents to Skills** | Skills are context, not callable personas—loses agent behavior |

## Behavior Specification

1. **Default behavior unchanged**: If `userVisible` is omitted, agent appears in dropdown (backward compatible)

2. **Visibility is independent of `infer`**:
   - `infer: true, userVisible: true` → Appears in dropdown, callable as subagent
   - `infer: true, userVisible: false` → Hidden from dropdown, callable as subagent
   - `infer: false, userVisible: true` → Appears in dropdown, NOT callable as subagent
   - `infer: false, userVisible: false` → Hidden, not callable (effectively disabled)

3. **UI override**: Users can still show hidden agents via Configure Custom Agents → eye icon (their preference overrides the file default)

4. **Handoffs still work**: Hidden agents can be targets of `handoffs` from visible agents

## Example Implementation

**Orchestrator (visible):**
```yaml
# .github/agents/beth.agent.md
---
name: Beth
description: AI orchestrator that routes work to specialists
userVisible: true
infer: true
tools: ['runSubagent', 'search', 'read']
handoffs:
  - label: Development
    agent: developer
    prompt: "Implement the feature"
---
```

**Specialist (hidden):**
```yaml
# .github/agents/developer.agent.md
---
name: developer
description: React/TypeScript implementation specialist
userVisible: false
infer: true
tools: ['editFiles', 'runInTerminal', 'search']
---
```

## Impact

- **Low risk**: Additive change, fully backward compatible
- **High value**: Enables clean orchestrator patterns without UX pollution
- **Ecosystem benefit**: Shared agent libraries (like [awesome-copilot](https://github.com/github/awesome-copilot)) can include "internal" agents that don't clutter user dropdowns

## Related Documentation

- [VS Code Custom Agents Documentation](https://code.visualstudio.com/docs/copilot/customization/custom-agents)
- `infer` property (enables subagent invocation)
- `handoffs` property (enables guided transitions between agents)

## Current Workaround

Until this feature is implemented, users can manually hide agents:

1. Open Copilot Chat in VS Code
2. Click the agent dropdown
3. Select **Configure Custom Agents**
4. Hover over each specialist agent
5. Click the **eye icon** to hide from dropdown

**Limitation:** This is per-user and must be repeated by each contributor.

## Submission

**Title:** `[Feature Request] Add userVisible frontmatter property to hide agents from dropdown while keeping subagent invocation`

**Submit to:**
- **VS Code**: https://github.com/microsoft/vscode/issues
- **GitHub Copilot feedback**: https://github.com/orgs/community/discussions/categories/copilot
