---
id: BETH-64.16.1
title: 'Test: MCP config — adds ado-sync entry to existing mcp.json'
status: Done
assignee: []
created_date: '2026-03-30 17:11'
updated_date: '2026-04-01 05:33'
labels: []
dependencies: []
parent_task_id: BETH-64.16
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Unit test: After set-ado-org, ado-sync entry is added to existing .vscode/mcp.json. Create a temp mcp.json with existing servers. Run MCP config function. Verify ado-sync entry added with correct Python path and cwd. Verify existing entries preserved.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 ado-sync entry added to servers in existing .vscode/mcp.json
- [ ] #2 Entry has correct command (venv python path), args [-m, app.mcp_server], and cwd
- [ ] #3 Existing MCP server entries are preserved (not overwritten)
- [ ] #4 JSON formatting preserved (not re-indented or mangled)
<!-- AC:END -->
