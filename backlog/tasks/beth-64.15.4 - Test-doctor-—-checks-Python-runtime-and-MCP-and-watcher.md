---
id: BETH-64.15.4
title: 'Test: doctor — checks Python runtime and MCP and watcher'
status: Done
assignee: []
created_date: '2026-03-30 17:10'
updated_date: '2026-03-31 15:13'
labels: []
dependencies: []
parent_task_id: BETH-64.15
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Unit test: Doctor checks Python available at expected path, MCP server entry exists for ado-sync, and watcher process status. Test matrix: Python found/missing, MCP entry present/absent, watcher running/stopped.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Python at expected path -> pass; Python missing -> fail with install message
- [ ] #2 MCP entry exists -> pass; MCP entry missing -> warn with fix instructions
- [ ] #3 Watcher running (PID alive) -> pass; Watcher stopped -> info (not error)
- [ ] #4 Each sub-check reports pass/warn/fail independently
<!-- AC:END -->
