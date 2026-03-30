---
id: BETH-64.13
title: 'CLI commands: ado-sync start/stop/status'
status: Done
assignee: []
created_date: '2026-03-22 16:37'
updated_date: '2026-03-30 21:51'
labels: []
dependencies: []
parent_task_id: BETH-64
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement service lifecycle management commands in the beth-copilot CLI. start spawns Python watcher as detached background process with PID file. stop sends SIGTERM. status reports running/stopped, configured org, credential expiry, and last sync. Covers FR-14, FR-15, FR-16, US-005 from PRD.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 npx beth-copilot ado-sync start: spawns Python process as detached background child
- [ ] #2 PID written to .beth/ado-sync.pid on start
- [ ] #3 npx beth-copilot ado-sync stop: reads PID, sends SIGTERM, cleans up PID file
- [ ] #4 npx beth-copilot ado-sync status: reports running/stopped, configured org/project, auth method, credential expiry
- [ ] #5 Starting when already running: no-op with friendly message
- [ ] #6 Stopping when not running: no-op with friendly message
- [ ] #7 Stale PID files detected and cleaned up (process not alive)
- [ ] #8 Status responds in under 1 second (local PID check + config read)
- [ ] #9 Works cross-platform: SIGTERM on Unix, taskkill on Windows
- [ ] #10 E2E tests for start/stop/status lifecycle
<!-- AC:END -->
