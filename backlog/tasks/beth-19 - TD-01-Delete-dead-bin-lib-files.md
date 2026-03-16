---
id: BETH-19
title: 'TD-01: Delete dead bin/lib files'
status: To Do
assignee: []
created_date: '2026-03-16 03:11'
labels: []
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Remove 4 dead files from bin/: pathValidation.js, pathValidation.test.js, animation.js, beth-animation.sh. All confirmed zero imports — cli.js line 8 explicitly says pathValidation removed, animation logic is inline in cli.js.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 bin/lib/pathValidation.js deleted
- [ ] #2 bin/lib/pathValidation.test.js deleted
- [ ] #3 bin/lib/animation.js deleted
- [ ] #4 bin/beth-animation.sh deleted
- [ ] #5 npm test passes after deletion
<!-- AC:END -->
