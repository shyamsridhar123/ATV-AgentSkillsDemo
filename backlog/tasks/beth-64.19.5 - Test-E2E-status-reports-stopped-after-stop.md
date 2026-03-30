---
id: BETH-64.19.5
title: 'Test E2E: status reports stopped after stop'
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
E2E integration test: After ado-sync stop, verify status reports stopped state. Verify it still shows org/project from config but indicates watcher is not running.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 ado-sync status reports 'stopped' after stop command
- [ ] #2 Still shows configured org/project
- [ ] #3 No PID file referenced
- [ ] #4 Command exits 0
<!-- AC:END -->
