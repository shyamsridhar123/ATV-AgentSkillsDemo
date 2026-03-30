---
id: BETH-64.13.7
title: 'Test: ado-sync lifecycle — full start/status/stop cycle'
status: Done
assignee: []
created_date: '2026-03-30 17:09'
updated_date: '2026-03-30 21:51'
labels: []
dependencies: []
parent_task_id: BETH-64.13
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
E2E integration test: Run the complete lifecycle — start -> verify running via status -> stop -> verify stopped via status. This is the happy path end-to-end test. Must use mocked Python watcher (lightweight script) to avoid external deps.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 start succeeds and status shows running
- [ ] #2 status shows correct org/project while running
- [ ] #3 stop succeeds and status shows stopped
- [ ] #4 PID file exists after start, gone after stop
- [ ] #5 No zombie processes after full cycle
<!-- AC:END -->
