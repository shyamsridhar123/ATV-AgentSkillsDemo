---
id: BETH-64.15.3
title: 'Test: doctor — checks ADO org reachability'
status: To Do
assignee: []
created_date: '2026-03-30 17:10'
labels: []
dependencies: []
parent_task_id: BETH-64.15
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Unit test: Doctor validates ADO org/project is reachable via lightweight API call. Test cases: org reachable -> pass, org unreachable (network error) -> warn, org returns 401 -> fail with re-auth message.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Reachable org/project produces pass
- [ ] #2 Network timeout/error produces warn (transient failure)
- [ ] #3 401/403 produces fail with re-auth instructions
- [ ] #4 Uses lightweight API call (not full project list)
<!-- AC:END -->
