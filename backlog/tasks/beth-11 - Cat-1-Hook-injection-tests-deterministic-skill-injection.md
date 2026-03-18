---
id: BETH-11
title: 'Cat 1: Hook injection tests (deterministic skill injection)'
status: Done
assignee: []
created_date: '2026-03-15 06:59'
updated_date: '2026-03-18 17:51'
labels: []
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Objective: Verify SubagentStart hook deterministically injects correct skills per agent_type. Tests inject-skills.mjs output for all 7 agent types. File: src/__tests__/skills/hook-injection.test.ts (12 tests). Assigned to: tester. Parent: BETH-8
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Hook output structure: continue=true, hookEventName=SubagentStart
- [ ] #2 Each agent_type gets correct injected skills (web-design-guidelines→ux-designer, vercel-react→developer, etc.)
- [ ] #3 readFile skills listed but NOT injected directly (framer-components, shadcn-ui, prd, security-analysis)
- [ ] #4 Context includes NON-NEGOTIABLE header and agent type identifier
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified: 51/51 tests pass (expanded from original 12 in test matrix)

Added pipeline-integration.test.ts: 41 tests covering full inject→verify round-trip, malformed input resilience, cross-hook consistency, content verification

UPDATED: Original 51 structural tests PLUS 41 new pipeline-integration tests (inject→verify round-trip, agent consistency, fail-open behavior). File: src/__tests__/skills/pipeline-integration.test.ts
<!-- SECTION:NOTES:END -->
