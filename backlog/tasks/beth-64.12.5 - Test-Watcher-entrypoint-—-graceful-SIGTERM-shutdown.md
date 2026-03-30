---
id: BETH-64.12.5
title: 'Test: Watcher entrypoint — graceful SIGTERM shutdown'
status: Done
assignee: []
created_date: '2026-03-30 17:08'
updated_date: '2026-03-30 21:13'
labels: []
dependencies: []
parent_task_id: BETH-64.12
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Unit test: watcher_main.py handles SIGTERM gracefully — stops the watcher loop, flushes logs, exits with code 0. Send SIGTERM to running watcher process. Verify clean shutdown without orphaned threads or file locks.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 SIGTERM handler registered on startup
- [ ] #2 Watcher loop stops cleanly on SIGTERM
- [ ] #3 Process exits with code 0 after SIGTERM
- [ ] #4 No orphaned file watchers or threads after shutdown
<!-- AC:END -->
