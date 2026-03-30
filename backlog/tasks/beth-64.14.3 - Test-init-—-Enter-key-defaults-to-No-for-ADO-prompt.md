---
id: BETH-64.14.3
title: 'Test: init — Enter key defaults to No for ADO prompt'
status: To Do
assignee: []
created_date: '2026-03-30 17:09'
labels: []
dependencies: []
parent_task_id: BETH-64.14
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
E2E test: Pressing Enter without typing anything at the 'Do you use Azure DevOps? (y/N)' prompt defaults to No. Verify same behavior as explicitly typing N — no .beth/ created, init completes normally.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Empty input (just Enter) treated as N (default)
- [ ] #2 No .beth/ directory or ADO config created
- [ ] #3 Init completes successfully
<!-- AC:END -->
