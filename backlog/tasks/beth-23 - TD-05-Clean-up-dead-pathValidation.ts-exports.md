---
id: BETH-23
title: 'TD-05: Clean up dead pathValidation.ts exports'
status: To Do
assignee: []
created_date: '2026-03-16 03:11'
labels: []
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
src/lib/pathValidation.ts (255 lines) is exported via index.ts but zero consumers exist outside its own test. Contains validateBeadsPath() for a system that no longer exists. Exported from the package's public API surface — consumers installing beth-copilot get dead beads code.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 validateBeadsPath function removed from pathValidation.ts
- [ ] #2 All beads-specific validation logic removed
- [ ] #3 Either: file trimmed to only generally-useful path validation, OR file deleted entirely if no path validation is needed
- [ ] #4 src/lib/pathValidation.test.ts updated to match (or deleted if file removed)
- [ ] #5 npm test passes
<!-- AC:END -->
