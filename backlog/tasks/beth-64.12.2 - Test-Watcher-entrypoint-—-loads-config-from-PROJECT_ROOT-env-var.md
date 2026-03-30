---
id: BETH-64.12.2
title: 'Test: Watcher entrypoint — loads config from PROJECT_ROOT env var'
status: To Do
assignee: []
created_date: '2026-03-30 17:07'
labels: []
dependencies: []
parent_task_id: BETH-64.12
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Unit test: watcher_main.py discovers .beth/ado-sync.json via PROJECT_ROOT environment variable when no --config flag provided. Set PROJECT_ROOT to temp dir containing .beth/ado-sync.json. Verify config loaded correctly.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 watcher_main reads PROJECT_ROOT env var when --config flag absent
- [ ] #2 Constructs path as PROJECT_ROOT/.beth/ado-sync.json
- [ ] #3 Config values loaded correctly from discovered file
<!-- AC:END -->
