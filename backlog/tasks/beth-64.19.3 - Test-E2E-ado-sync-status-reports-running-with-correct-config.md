---
id: BETH-64.19.3
title: 'Test E2E: ado-sync status reports running with correct config'
status: To Do
assignee: []
created_date: '2026-03-30 17:13'
labels: []
dependencies: []
parent_task_id: BETH-64.19
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
E2E integration test: After ado-sync start, verify status command reports running state with correct org/project from .beth/ado-sync.json. Verify output is both human-readable and parseable.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 ado-sync status reports 'running' state
- [ ] #2 Output includes org and project names from config
- [ ] #3 Output includes auth method
- [ ] #4 Command exits 0
<!-- AC:END -->
