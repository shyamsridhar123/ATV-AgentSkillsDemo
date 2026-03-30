---
id: BETH-64.12.4
title: 'Test: Watcher entrypoint — no HTTP server started'
status: To Do
assignee: []
created_date: '2026-03-30 17:07'
labels: []
dependencies: []
parent_task_id: BETH-64.12
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Unit test: watcher_main.py does NOT start FastAPI/uvicorn. Verify no HTTP server binding, no open ports. Mock socket.bind or check that uvicorn.run is never called. This is critical — the watcher must be a pure file-watching process.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 uvicorn.run (or equivalent) is never called
- [ ] #2 No TCP/UDP port binding occurs
- [ ] #3 Only backlog_watcher loop is started
<!-- AC:END -->
