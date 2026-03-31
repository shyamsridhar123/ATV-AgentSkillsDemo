---
id: BETH-64.4
title: 'Resolve OQ-3: Python config loader — .beth/ado-sync.json discovery'
status: Done
assignee: []
created_date: '2026-03-22 16:35'
updated_date: '2026-03-31 15:53'
labels: []
dependencies: []
parent_task_id: BETH-64
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Design decision for how the Python service discovers and reads .beth/ado-sync.json. Options: (a) CLI passes --config flag with project root path. (b) Python walks up directories to find .beth/. (c) CLI sets ADO_SYNC_CONFIG env var. Affects watcher_main.py entrypoint design.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Config discovery mechanism chosen and documented
- [ ] #2 Backward compatibility with .env loading preserved
- [ ] #3 Config precedence order defined: .beth/ado-sync.json > .env > env vars
- [ ] #4 Python config.py changes specified (what to modify in Settings class)
<!-- AC:END -->
