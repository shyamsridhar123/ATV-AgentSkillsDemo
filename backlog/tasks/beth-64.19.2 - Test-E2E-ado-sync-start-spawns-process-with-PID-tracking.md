---
id: BETH-64.19.2
title: 'Test E2E: ado-sync start spawns process with PID tracking'
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
E2E integration test: After config exists, run ado-sync start. Verify process spawns as detached background child. Verify .beth/ado-sync.pid created. Verify PID matches actual running process.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 ado-sync start exits 0 after spawning watcher
- [ ] #2 .beth/ado-sync.pid file created
- [ ] #3 PID in file corresponds to a running process
- [ ] #4 Spawned process is the Python watcher (not a shell wrapper)
- [ ] #5 Watcher process survives after CLI parent process exits (detached)
<!-- AC:END -->
