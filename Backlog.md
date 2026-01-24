# Backlog

> *"I don't have time to explain things twice. Read this."*

Last updated: 2026-01-24

---

## Active Work

| ID | Task | Owner | Status | Notes |
|----|------|-------|--------|-------|
| beth-ihh | Rebrand orchestrator to Beth | Beth | ✅ Done | Agent renamed, personality defined |
| beth-591 | Update README with Beth persona | Beth | ✅ Done | Full rewrite complete |
| beth-fvz | Create Backlog.md | Beth | ✅ Done | Two-layer tracking established |
| beth-zo0 | Wire beads tracking into Beth | Beth | ✅ Done | Mandatory tracking enforced |
| beth-c8r | Add hero image to README | Beth | ✅ Done | bethflames.png added |
| beth-n5n | Add second image to README | Beth | ✅ Done | beth-questioning.png in Why Beth |
| beth-y4l | Rewrite Why Beth section | Beth | ✅ Done | Positive tone, humor about competence |
| beth-pqd | Update README cigarette line | Beth | ✅ Done | Watching crew build code |
| beth-mr1 | Strengthen beads enforcement in Beth | Beth | ✅ Done | Response framework now requires issue ID |
| beth-wkl | Create frontend-engineer agent | — | 🔲 Queued | Dedicated React/TypeScript UI specialist |
| beth-eua | Create security-reviewer agent | — | 🔲 Queued | Enterprise security, OWASP, threat modeling |
| beth-b65 | Create security-analysis skill | — | 🔲 Queued | Vulnerability assessment workflow |
| beth-sd7 | Create MCP setup guide | — | 🔲 Queued | Onboarding for optional MCP servers |

---

## Backlog (Prioritized)

### High Priority (P1)

- [ ] **frontend-engineer.agent.md** — Pixel-perfect React/TypeScript specialist. Separate from full-stack developer.
- [ ] **security-reviewer.agent.md** — Enterprise security agent. OWASP, compliance, threat modeling.
- [ ] **security-analysis skill** — Skill module for security workflows.
- [ ] **MCP setup guide** — Onboarding guide for optional MCP servers (web search, Playwright, Azure, Microsoft Learn). Skills gracefully degrade if not configured.

### Medium Priority (P2)

- [ ] Update all existing agents to reference Beth as orchestrator
- [ ] Add handoffs in beth.agent.md for new agents once created
- [ ] Review and update copilot-instructions.md
- [ ] **Upgrade skills for web search MCP** — Enhance researcher agent with web search when configured
- [ ] **Upgrade skills for Playwright MCP** — Enhance tester/frontend agents with browser automation
- [ ] **Upgrade skills for Azure MCP** — Enhance developer/security agents with Azure cloud ops
- [ ] **Upgrade skills for Microsoft Learn MCP** — Enhance all agents with MS Learn documentation access

### Low Priority (P3)

- [ ] Add more Beth-isms to agent responses
- [ ] Create example workflows in DEMO.md showcasing Beth's personality
- [ ] Consider additional skills (API security, performance profiling)

---

## Decisions

| Decision | Rationale | Date |
|----------|-----------|------|
| Rename orchestrator → Beth | Brand identity, memorable persona, clear leadership | 2026-01-24 |
| Split frontend-engineer from developer | Separation of concerns: UI specialists vs full-stack | 2026-01-24 |
| Add security-reviewer agent | Enterprise security is non-negotiable | 2026-01-24 |
| Two-layer tracking: Backlog.md + bd | Leadership visibility (Backlog) + agent ops (beads) | 2026-01-24 |
| Optional MCP integrations | Web search, Playwright, Azure, MS Learn MCPs enhance agents but are opt-in. Skills gracefully degrade without them. | 2026-01-24 |

---

## Status Summary

**For Leadership:**

The Beth orchestrator system is being built. Core personality and README are complete. Next phase is expanding the agent roster with dedicated frontend and security specialists, plus optional MCP integrations for enhanced capabilities.

**What's Working:**

- Beth agent (orchestrator) — Live
- Product Manager, Researcher, UX Designer, Developer, Tester — Existing
- PRD, Framer, React Best Practices, Web Design skills — Existing

**What's Coming:**

- Frontend Engineer agent
- Security Reviewer agent  
- Security Analysis skill
- MCP Setup Guide (web search, Playwright, Azure, Microsoft Learn)
- MCP-enhanced skills (optional, graceful degradation)

**Blockers:** None.

---

## Architecture

```
Backlog.md          ← You are here (leadership view)
    │
    └── bd (beads)  ← Agent implementation tracking
           │
           └── .beads/issues/  ← Detailed work breakdown
```

**Rule:** Big picture goes in Backlog.md. Detailed implementation tracking goes in bd.

---

*"Now you know what's happening. Questions? I'll answer them. Complaints? Keep them to yourself."*
