---
id: BETH-64.15.2
title: 'Test: doctor — checks credential validity when configured'
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
Unit test: When ADO Sync is configured, doctor checks if credentials exist and are not expired. Test cases: valid creds -> pass, expired creds -> warn with refresh instructions, no creds -> fail with setup instructions.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Valid credentials produce pass status
- [ ] #2 Expired credentials produce warn with 'run set-ado-org to refresh' message
- [ ] #3 Missing credentials produce fail with setup instructions
- [ ] #4 Credential check uses credentialStore.hasCredentials() (no actual API call)
<!-- AC:END -->
