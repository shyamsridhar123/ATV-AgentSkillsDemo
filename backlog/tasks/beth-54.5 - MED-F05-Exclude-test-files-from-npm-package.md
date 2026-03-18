---
id: BETH-54.5
title: '[MED] F05: Exclude test files from npm package'
status: Done
assignee: []
created_date: '2026-03-18 06:10'
updated_date: '2026-03-18 16:57'
labels: []
dependencies: []
parent_task_id: BETH-54
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
package.json files field includes dist/ which ships 148 compiled test files (.test.js, .test.d.ts, .e2e.test.js) to every user. Bloats package and reveals internal test infrastructure.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 npm pack --dry-run shows zero .test.js or .test.d.ts files
- [ ] #2 package.json files field explicitly includes only production paths (bin/, dist/cli/, dist/core/, dist/lib/, dist/index.*, templates/, assets/)
- [ ] #3 npx beth-copilot init still works correctly after package rebuild
- [ ] #4 npx beth-copilot doctor still works correctly after package rebuild
- [ ] #5 Package size reduced (document before/after in PR)
<!-- AC:END -->
