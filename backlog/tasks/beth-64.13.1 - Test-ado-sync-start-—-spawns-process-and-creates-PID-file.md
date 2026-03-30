---
id: BETH-64.13.1
title: 'Test: ado-sync start — spawns process and creates PID file'
status: To Do
assignee: []
created_date: '2026-03-30 17:08'
labels: []
dependencies: []
parent_task_id: BETH-64.13
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
E2E test: 'npx beth-copilot ado-sync start' spawns Python watcher as detached background process. Verify .beth/ado-sync.pid created with valid PID. Verify process is actually running (kill -0 PID). Clean up after test.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 ado-sync start creates .beth/ado-sync.pid file
- [ ] #2 PID file contains a valid numeric PID
- [ ] #3 Process with that PID is actually running
- [ ] #4 Process is detached (survives parent exit)
- [ ] #5 Test cleans up spawned process after verification
<!-- AC:END -->
