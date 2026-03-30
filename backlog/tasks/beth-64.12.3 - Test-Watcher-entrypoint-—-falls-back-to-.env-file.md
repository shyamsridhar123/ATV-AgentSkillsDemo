---
id: BETH-64.12.3
title: 'Test: Watcher entrypoint — falls back to .env file'
status: Done
assignee: []
created_date: '2026-03-30 17:07'
updated_date: '2026-03-30 21:13'
labels: []
dependencies: []
parent_task_id: BETH-64.12
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Unit test: When no --config and no PROJECT_ROOT, watcher_main.py falls back to loading config from .env file (python-dotenv). Create temp .env with ADO_ORG, ADO_PROJECT, ADO_PAT. Verify ADOClient initialized from .env values.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Falls back to .env when --config and PROJECT_ROOT are both absent
- [ ] #2 Reads ADO_ORG, ADO_PROJECT, ADO_PAT from .env file
- [ ] #3 ADOClient initialized with .env values
<!-- AC:END -->
