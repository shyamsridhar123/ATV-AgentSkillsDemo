---
id: BETH-64.16.2
title: 'Test: MCP config — creates mcp.json when missing'
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
Unit test: When .vscode/mcp.json does not exist, creates it with ado-sync entry plus any required default servers. Verify .vscode/ directory created if needed. Verify valid JSON output.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Creates .vscode/ directory if it doesn't exist
- [ ] #2 Creates .vscode/mcp.json with ado-sync entry
- [ ] #3 Output is valid JSON with proper formatting
- [ ] #4 ado-sync entry has correct command, args, and cwd
<!-- AC:END -->
