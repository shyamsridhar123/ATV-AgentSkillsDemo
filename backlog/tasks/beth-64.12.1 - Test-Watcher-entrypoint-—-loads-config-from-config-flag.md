---
id: BETH-64.12.1
title: 'Test: Watcher entrypoint — loads config from --config flag'
status: Done
assignee: []
created_date: '2026-03-30 17:06'
updated_date: '2026-03-30 21:13'
labels: []
dependencies: []
parent_task_id: BETH-64.12
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Unit test: watcher_main.py loads .beth/ado-sync.json when passed via --config CLI flag. Create a temp config file, invoke watcher_main with --config pointing to it. Verify ADOClient initialized with correct org/project/auth values from that file.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 watcher_main reads --config flag value as config file path
- [ ] #2 Parses JSON and extracts organization, project, authMethod fields
- [ ] #3 ADOClient receives correct config values from the parsed file
<!-- AC:END -->
