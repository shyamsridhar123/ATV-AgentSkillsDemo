---
id: BETH-30
title: Implement test report retention policy
status: Done
assignee: []
created_date: '2026-03-16 03:12'
updated_date: '2026-03-16 06:29'
labels: []
dependencies: []
priority: low
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
docs/test-reports/ accumulates a new markdown report every session via npm run test:gate. Currently 12 reports from March 8-13, growing indefinitely. No cleanup mechanism exists. Over time this becomes noise.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Retention policy defined: either keep last N reports or reports from last N days
- [ ] #2 quality-gate.mjs updated to prune old reports when generating new ones
- [ ] #3 Alternatively: .gitignore test reports and only keep TEMPLATE.md tracked
<!-- AC:END -->
