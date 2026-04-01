---
id: BETH-64.19.4
title: 'Test E2E: ado-sync stop terminates and cleans up'
status: Done
assignee: []
created_date: '2026-03-30 17:13'
updated_date: '2026-04-01 06:11'
labels: []
dependencies: []
parent_task_id: BETH-64.19
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
E2E integration test: After start, run ado-sync stop. Verify process terminated (PID no longer alive). Verify .beth/ado-sync.pid removed. Verify exit code 0.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 ado-sync stop terminates the watcher process
- [ ] #2 .beth/ado-sync.pid file removed
- [ ] #3 Process PID no longer alive after stop
- [ ] #4 Command exits 0
<!-- AC:END -->
