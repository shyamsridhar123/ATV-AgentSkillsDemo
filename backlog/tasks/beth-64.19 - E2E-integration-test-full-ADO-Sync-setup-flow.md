---
id: BETH-64.19
title: 'E2E integration test: full ADO Sync setup flow'
status: To Do
assignee: []
created_date: '2026-03-22 16:38'
labels: []
dependencies: []
parent_task_id: BETH-64
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
End-to-end test validating the complete self-service flow with mocked external services. Covers the full pipeline: set-ado-org -> config created -> ado-sync start -> watcher running -> ado-sync stop -> clean shutdown. Tests cross-platform PID handling.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 E2E test: set-ado-org with mocked Entra auth and ADO API creates .beth/ado-sync.json
- [ ] #2 E2E test: ado-sync start spawns process, creates .beth/ado-sync.pid
- [ ] #3 E2E test: ado-sync status reports running with correct org/project
- [ ] #4 E2E test: ado-sync stop terminates process, cleans up PID file
- [ ] #5 E2E test: ado-sync status after stop reports stopped
- [ ] #6 E2E test: .gitignore contains .beth/ after setup
- [ ] #7 E2E test: no secrets in .beth/ado-sync.json (scan file contents)
- [ ] #8 E2E test: set-ado-org reconfiguration updates config correctly
- [ ] #9 All tests pass on CI (GitHub Actions)
<!-- AC:END -->
