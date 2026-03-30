---
id: BETH-64.13.3
title: 'Test: ado-sync status — reports running state'
status: To Do
assignee: []
created_date: '2026-03-30 17:08'
labels: []
dependencies: []
parent_task_id: BETH-64.13
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
E2E test: After ado-sync start, 'npx beth-copilot ado-sync status' reports running with correct org/project name, auth method, and credential expiry. Verify output format is machine-parseable and human-readable.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 ado-sync status output includes 'running' state
- [ ] #2 Shows configured organization and project names
- [ ] #3 Shows authentication method (entra or pat)
- [ ] #4 Shows credential expiry information
- [ ] #5 Responds in under 1 second (local PID check + config read)
<!-- AC:END -->
