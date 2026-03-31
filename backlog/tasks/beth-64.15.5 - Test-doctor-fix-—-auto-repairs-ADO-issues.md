---
id: BETH-64.15.5
title: 'Test: doctor --fix — auto-repairs ADO issues'
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
Unit test: Doctor --fix flag auto-repairs: adds missing MCP entry, refreshes expired token (triggers re-auth), creates missing venv. Verify each fix action is attempted and reported. Verify fix does NOT auto-start watcher.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 --fix adds missing MCP entry to .vscode/mcp.json
- [ ] #2 --fix triggers token refresh when credentials expired
- [ ] #3 --fix creates venv when Python found but venv missing
- [ ] #4 --fix reports each repair action taken
- [ ] #5 --fix does NOT auto-start the watcher process
<!-- AC:END -->
