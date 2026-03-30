---
id: BETH-64.19.8
title: 'Test E2E: set-ado-org reconfiguration updates correctly'
status: To Do
assignee: []
created_date: '2026-03-30 17:14'
labels: []
dependencies: []
parent_task_id: BETH-64.19
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
E2E integration test: Run set-ado-org twice with different org/project. Verify second run updates .beth/ado-sync.json (not duplicates or corrupts). Verify old org/project replaced. Verify credentials refreshed for new org.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Second set-ado-org updates existing .beth/ado-sync.json
- [ ] #2 New org/project values replace old values
- [ ] #3 No duplicate or corrupted config entries
- [ ] #4 Config file is valid JSON after update
- [ ] #5 Auth method preserved or appropriately updated
<!-- AC:END -->
