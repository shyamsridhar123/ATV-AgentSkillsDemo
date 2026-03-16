---
id: BETH-29
title: 'TD-11: Migrate tests from node:test to vitest imports'
status: To Do
assignee: []
created_date: '2026-03-16 03:12'
labels: []
dependencies: []
priority: low
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
22 of 22 test files import from 'node:test' instead of 'vitest'. A vitest.config alias maps 'node:test' → 'vitest' to make this work. There's an entire test file (framework-isolation.test.ts) that exists solely to validate this hack. Fragile coupling — if vitest changes alias behavior, all tests break.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 All .test.ts files import describe/it/beforeEach/etc from 'vitest' directly
- [ ] #2 No remaining imports from 'node:test' in any test file
- [ ] #3 vitest.config.ts alias for 'node:test' removed (no longer needed)
- [ ] #4 framework-isolation.test.ts deleted (exists only to test the alias)
- [ ] #5 npm test passes with zero failures
<!-- AC:END -->
