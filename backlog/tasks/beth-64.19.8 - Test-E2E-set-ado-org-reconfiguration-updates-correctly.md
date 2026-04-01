---
id: BETH-64.19.8
title: 'Test E2E: set-ado-org reconfiguration updates correctly'
status: Done
assignee: []
created_date: '2026-03-30 17:14'
updated_date: '2026-04-01 06:11'
labels: []
dependencies: []
parent_task_id: BETH-64.19
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
E2E integration test: Run set-ado-org twice with different org/project. Verify second run updates .beth/ado-sync.json (not duplicates or corrupts). Verify old org/project replaced. Verify new auth flow is triggered so credentials match the new org context.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Second set-ado-org updates existing .beth/ado-sync.json
- [ ] #2 New org/project values replace old values
- [ ] #3 No duplicate or corrupted config entries
- [ ] #4 Config file is valid JSON after update
- [ ] #5 Auth method preserved or appropriately updated
- [ ] #6 Re-auth flow triggered for new org (device code or PAT prompt, verified via mock call count)
<!-- AC:END -->
