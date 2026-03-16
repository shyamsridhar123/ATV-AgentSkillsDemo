---
id: BETH-33
title: Remove beads stub functions from bin/cli.js
status: To Do
assignee: []
created_date: '2026-03-16 03:44'
labels: []
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
3 dead stub functions (getBeadsPath, isBeadsInstalled, isBeadsInitialized) at line ~522 of bin/cli.js always return null/false and are called by nothing. Also --skip-beads flag in ALLOWED_FLAGS is a deprecated no-op.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 All 3 beads stubs removed from bin/cli.js
- [ ] #2 'Beads functions removed' comment block removed
- [ ] #3 --skip-beads removed from ALLOWED_FLAGS and help text
- [ ] #4 No runtime errors from any CLI command
- [ ] #5 npm test passes
<!-- AC:END -->
