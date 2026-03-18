---
id: BETH-14
title: SubagentStart hook unit tests (inject-skills.mjs)
status: Done
assignee: []
created_date: '2026-03-15 07:00'
updated_date: '2026-03-18 17:51'
labels: []
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Objective: Unit-test the inject-skills.mjs script in isolation. Verifies output structure, skill mapping per agent, NON-NEGOTIABLE headers, edge cases (unknown agent, empty input, missing cwd). File: src/__tests__/inject-skills.test.ts (20 tests). Assigned to: tester. Parent: BETH-8
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Output always sets continue:true and hookEventName:SubagentStart
- [ ] #2 ux-designer injects web-design-guidelines, mandates framer-components + ui-ux-pro-max via readFile
- [ ] #3 developer injects vercel-react-best-practices, mandates shadcn-ui + AGENTS.md via readFile
- [ ] #4 Graceful handling: unknown agent types, malformed JSON, empty input
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified: 20/20 tests pass. All agent types + edge cases covered.

Pipeline integration now tests inject+verify as unified system (41 tests). Existing 20 unit tests verified passing

UPDATED: Original 20 unit tests PLUS 12 new mapping-completeness tests verifying all agent types covered in hook, no orphan skills, every SKILL.md has valid format, agent .md files match expected skill mapping. File: src/__tests__/skills/mapping-completeness.test.ts
<!-- SECTION:NOTES:END -->
