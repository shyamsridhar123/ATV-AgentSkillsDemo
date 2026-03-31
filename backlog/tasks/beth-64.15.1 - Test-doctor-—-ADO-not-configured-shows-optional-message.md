---
id: BETH-64.15.1
title: 'Test: doctor — ADO not configured shows optional message'
status: Done
assignee: []
created_date: '2026-03-30 17:10'
updated_date: '2026-03-31 15:13'
labels: []
dependencies: []
parent_task_id: BETH-64.15
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Unit test: When .beth/ado-sync.json does not exist, doctor reports 'ADO Sync: not configured (optional)' — no warnings, no errors. Verify it does NOT run any ADO-specific health checks.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Doctor output includes 'ADO Sync: not configured (optional)'
- [ ] #2 No ADO-related warnings or errors when not configured
- [ ] #3 No ADO API calls or credential checks attempted
- [ ] #4 Doctor still passes overall (ADO is optional)
<!-- AC:END -->
