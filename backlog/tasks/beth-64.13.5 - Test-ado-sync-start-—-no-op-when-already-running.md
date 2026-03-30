---
id: BETH-64.13.5
title: 'Test: ado-sync start — no-op when already running'
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
E2E test: Running 'ado-sync start' when watcher is already running should be a no-op with friendly message. Verify no second process spawned. Verify PID file unchanged. Verify exit code 0 (not an error).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Second start produces friendly 'already running' message
- [ ] #2 No duplicate process spawned
- [ ] #3 PID file unchanged (same PID as before)
- [ ] #4 Exit code 0 (informational, not error)
<!-- AC:END -->
