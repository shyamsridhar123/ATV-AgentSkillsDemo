---
id: BETH-64.15
title: Doctor checks for ADO Sync health
status: To Do
assignee: []
created_date: '2026-03-22 16:37'
labels: []
dependencies: []
parent_task_id: BETH-64
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Extend npx beth-copilot doctor with conditional ADO Sync health checks. Only runs if .beth/ado-sync.json exists. Validates: credentials valid, ADO org reachable, Python available, MCP configured, watcher status. --fix auto-repairs what it can. Covers FR-4, US-006 from PRD.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 If ADO Sync NOT configured: doctor says 'ADO Sync: not configured (optional)' — no warnings
- [ ] #2 If configured, checks: credentials exist and not expired
- [ ] #3 If configured, checks: ADO org/project reachable (lightweight API call)
- [ ] #4 If configured, checks: Python runtime available at expected path
- [ ] #5 If configured, checks: MCP server entry exists for ado-sync
- [ ] #6 If configured, checks: watcher process status (running/stopped via PID)
- [ ] #7 Each sub-check has pass/warn/fail with actionable fix message
- [ ] #8 --fix flag: adds MCP entry, refreshes expired token, creates missing venv
- [ ] #9 Unit tests for each health check function
<!-- AC:END -->
