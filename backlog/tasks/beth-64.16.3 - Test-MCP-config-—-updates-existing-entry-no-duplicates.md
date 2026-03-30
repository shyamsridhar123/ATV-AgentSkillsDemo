---
id: BETH-64.16.3
title: 'Test: MCP config — updates existing entry, no duplicates'
status: To Do
assignee: []
created_date: '2026-03-30 17:11'
labels: []
dependencies: []
parent_task_id: BETH-64.16
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Unit test: When ado-sync entry already exists in mcp.json, updates it with new Python path/cwd (e.g., after venv recreation). Verify no duplicate ado-sync entries. Verify other server entries untouched.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Existing ado-sync entry updated with new values
- [ ] #2 No duplicate ado-sync entries in servers object
- [ ] #3 Other server entries are not modified
- [ ] #4 Updated entry has correct new Python path and cwd
<!-- AC:END -->
