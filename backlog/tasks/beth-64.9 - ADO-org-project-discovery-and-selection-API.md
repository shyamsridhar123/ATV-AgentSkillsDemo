---
id: BETH-64.9
title: ADO org/project discovery and selection API
status: Done
assignee: []
created_date: '2026-03-22 16:36'
updated_date: '2026-03-24 00:01'
labels: []
dependencies: []
parent_task_id: BETH-64
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement ADO organization listing and project listing after Entra auth. Uses ADO accounts API (vssps.visualstudio.com) for orgs and dev.azure.com for projects. Covers FR-10, FR-11, US-003 from PRD.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 List accessible ADO orgs via GET vssps.visualstudio.com/_apis/accounts?memberId={userId}
- [ ] #2 List projects within selected org via GET dev.azure.com/{org}/_apis/projects
- [ ] #3 Pagination supported for orgs with 100+ projects
- [ ] #4 Interactive selection UI: arrow keys + enter, or type-to-filter
- [ ] #5 Auto-select if user has access to only 1 org (skip prompt)
- [ ] #6 Auto-select if org has only 1 project (skip prompt)
- [ ] #7 Selected org + project written to .beth/ado-sync.json
- [ ] #8 API errors handled gracefully: 401 (re-auth), 403 (permissions), 429 (rate limit)
- [ ] #9 Unit tests with mocked ADO API responses
<!-- AC:END -->
