---
id: BETH-64.17.2
title: 'Test: PAT validation — validates against ADO API before storing'
status: To Do
assignee: []
created_date: '2026-03-30 17:12'
labels: []
dependencies: []
parent_task_id: BETH-64.17
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Unit test: PAT is validated via GET _apis/projects before being stored. Test cases: valid PAT -> accepted, invalid PAT (401) -> rejected with message, PAT without Work Items scope -> warning about limited functionality.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Valid PAT (200 response) is accepted and flow continues
- [ ] #2 Invalid PAT (401 response) is rejected with 'invalid PAT' message
- [ ] #3 Network error during validation produces clear error message
- [ ] #4 PAT without Work Items scope triggers scope warning
<!-- AC:END -->
