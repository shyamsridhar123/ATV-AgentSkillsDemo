---
id: BETH-64.13.2
title: 'Test: ado-sync stop — terminates process and cleans PID'
status: Done
assignee: []
created_date: '2026-03-30 17:08'
updated_date: '2026-03-30 21:51'
labels: []
dependencies: []
parent_task_id: BETH-64.13
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
E2E test: 'npx beth-copilot ado-sync stop' reads .beth/ado-sync.pid, sends SIGTERM to the process, waits for exit, and removes the PID file. Verify process is no longer running. Verify PID file removed.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 ado-sync stop reads PID from .beth/ado-sync.pid
- [ ] #2 Sends SIGTERM to the watcher process
- [ ] #3 Process terminates within reasonable timeout
- [ ] #4 PID file is removed after process exits
- [ ] #5 Exit code 0 on successful stop
<!-- AC:END -->
