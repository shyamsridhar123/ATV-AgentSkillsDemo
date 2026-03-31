---
id: BETH-64.14.2
title: 'Test: init — ADO accepted launches set-ado-org flow'
status: Done
assignee: []
created_date: '2026-03-30 17:09'
updated_date: '2026-03-31 14:37'
labels: []
dependencies: []
parent_task_id: BETH-64.14
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
E2E test: During init, when user answers 'Y' to ADO prompt, verify set-ado-org flow is launched. Use mocked auth/API responses. Verify .beth/ado-sync.json created with org/project. Verify ADO prompt appears AFTER core init completes (not before).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 ADO prompt appears AFTER agents/skills/hooks installation (not before)
- [ ] #2 Accepting launches device code auth flow (mocked)
- [ ] #3 Org/project selection proceeds after auth (mocked)
- [ ] #4 .beth/ado-sync.json created with valid config
- [ ] #5 Overall init reports success including ADO setup
<!-- AC:END -->
