---
id: BETH-19
title: Delete dead bin/lib files
status: Done
assignee: []
created_date: '2026-03-16 03:11'
updated_date: '2026-03-16 05:01'
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
- [ ] #6 bin/lib/animation.js deleted
- [ ] #7 bin/lib/pathValidation.js deleted
- [ ] #8 bin/lib/pathValidation.test.js deleted
- [ ] #9 bin/beth-animation.sh deleted
- [ ] #10 assets/beth-portrait-small.txt deleted
- [ ] #11 assets/beth-portrait.txt deleted
- [ ] #12 bin/cli.js dead-code comment on line 8 updated
- [ ] #13 All tests pass
- [ ] #14 CLI commands work
<!-- AC:END -->
