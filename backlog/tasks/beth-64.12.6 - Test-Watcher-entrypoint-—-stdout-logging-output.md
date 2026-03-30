---
id: BETH-64.12.6
title: 'Test: Watcher entrypoint — stdout logging output'
status: Done
assignee: []
created_date: '2026-03-30 17:08'
updated_date: '2026-03-30 21:13'
labels: []
dependencies: []
parent_task_id: BETH-64.12
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Unit test: watcher_main.py logs to stdout (captured by CLI). Verify startup log includes org/project info, config source (json vs .env), and watcher ready message. Verify log format is parseable.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Startup log includes configured organization and project
- [ ] #2 Startup log indicates config source (json file path or .env)
- [ ] #3 Watcher ready message logged when file watching begins
- [ ] #4 Logs written to stdout (not stderr) for CLI capture
<!-- AC:END -->
