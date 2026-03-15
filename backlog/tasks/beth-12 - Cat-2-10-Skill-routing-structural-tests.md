---
id: BETH-12
title: 'Cat 2-10: Skill routing structural tests'
status: Done
assignee: []
created_date: '2026-03-15 06:59'
updated_date: '2026-03-15 15:41'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Objective: Verify every skill has a valid SKILL.md on disk and is mapped to a valid agent. Covers Categories 2-10: Azure (22 tests), Design/Frontend, Product/Research, Developer Workflow, Testing/QA, Orchestration/Swarm, CE Pipeline, Language-Specific, Remaining Skills. Plus cross-cutting matrix integrity. File: src/__tests__/skills/skill-routing.test.ts (36 tests). Assigned to: tester. Parent: BETH-8
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 All skills in .github/skills/ have non-empty SKILL.md files
- [ ] #2 Each skill maps to one of the 7 valid agents (Beth, developer, product-manager, ux-designer, security-reviewer, tester, researcher)
- [ ] #3 Cross-cutting: no duplicate test IDs, no missing skill paths, all categories covered
- [ ] #4 External skills (~/.agents/skills/) handled when present
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified: 223/223 tests pass (expanded from original 36). All 10 categories covered.

Added trigger-coverage.test.ts: 147 tests verifying all 72 test prompts match skill keywords. Added mapping-completeness.test.ts: 12 tests for orphan detection, hook source validation, agent definition checks
<!-- SECTION:NOTES:END -->
