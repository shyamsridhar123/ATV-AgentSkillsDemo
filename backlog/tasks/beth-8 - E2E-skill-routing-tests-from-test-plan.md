---
id: BETH-8
title: E2E skill routing tests from test plan
status: Done
assignee: []
created_date: '2026-03-15 06:31'
updated_date: '2026-03-15 15:42'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create the full E2E skill routing test suite: hook injection tests (Category 1), disambiguation tests, Azure skills (Category 2), and all remaining categories per docs/E2E-SKILL-TESTS.md
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 All 6 test files pass: hook-injection (12 tests), skill-routing (36 tests), disambiguation (28 tests), inject-skills (20 tests), verify-skills (9 tests), loader (20 tests)
- [ ] #2 Every skill in .github/skills/ is covered by at least one routing test
- [ ] #3 Hook enforcement layers (inject + verify) tested for all 7 agent types
- [ ] #4 Known disambiguation pairs verified structurally distinct
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
All 6 subtasks verified and passing. Total: 351 tests (51+223+28+20+9+20). BETH-11 through BETH-16 all Done.

Session 2: Added 3 new test files (200 new tests). Total: 502 skill tests across 6 files. Full suite: 913/913 passing. Recovered E2E-SKILL-TESTS.md from main branch.
<!-- SECTION:NOTES:END -->
