---
id: BETH-64.13.6
title: 'Test: ado-sync stop — no-op when not running'
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
E2E test: Running 'ado-sync stop' when no watcher is running (no PID file) should be a no-op with friendly message. Verify exit code 0. Also test: stop when PID file exists but process is dead (stale PID cleanup).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Stop with no PID file produces friendly 'not running' message
- [ ] #2 Exit code 0 (informational, not error)
- [ ] #3 Stop with stale PID file cleans up the stale PID file
- [ ] #4 Stale PID detected by checking if process is alive (kill -0)
<!-- AC:END -->
