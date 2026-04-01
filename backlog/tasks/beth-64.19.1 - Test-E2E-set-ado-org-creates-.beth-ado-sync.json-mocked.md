---
id: BETH-64.19.1
title: 'Test E2E: set-ado-org creates .beth/ado-sync.json (mocked)'
status: Done
assignee: []
created_date: '2026-03-30 17:13'
updated_date: '2026-04-01 06:11'
labels: []
dependencies: []
parent_task_id: BETH-64.19
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
E2E integration test: Run set-ado-org with mocked Entra auth and ADO API responses. Verify .beth/ado-sync.json created with correct organization, project, and authMethod fields.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 .beth/ado-sync.json exists after set-ado-org completes
- [ ] #2 Config contains correct organization name from mocked API
- [ ] #3 Config contains correct project name from mocked API
- [ ] #4 Config contains authMethod field (entra)
- [ ] #5 No secrets stored in the JSON file
<!-- AC:END -->
