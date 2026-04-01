---
id: BETH-64.16
title: MCP auto-configuration for ado-sync
status: Done
assignee: []
created_date: '2026-03-22 16:38'
updated_date: '2026-04-01 05:33'
labels: []
dependencies: []
parent_task_id: BETH-64
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
After ADO Sync setup, automatically add the ado-sync MCP server entry to .vscode/mcp.json. Uses correct Python path and working directory for the project. Covers FR-12, US-007 from PRD.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 After set-ado-org success, ado-sync entry added to .vscode/mcp.json
- [ ] #2 MCP entry uses project-local venv Python path and correct cwd
- [ ] #3 If .vscode/mcp.json doesn't exist, creates it with ado-sync entry + existing required servers
- [ ] #4 If ado-sync entry already exists, updates it (no duplicates)
- [ ] #5 MCP entry format: { command: python3, args: [-m, app.mcp_server], cwd: <path> }
- [ ] #6 Doctor validates this entry when ADO Sync is configured
- [ ] #7 Unit tests for MCP config reading/writing
<!-- AC:END -->
