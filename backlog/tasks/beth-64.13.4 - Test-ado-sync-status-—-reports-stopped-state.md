---
id: BETH-64.13.4
title: 'Test: ado-sync status — reports stopped state'
status: To Do
assignee: []
created_date: '2026-03-30 17:08'
labels: []
dependencies: []
parent_task_id: BETH-64.13
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
E2E test: When no watcher is running (no PID file or process dead), 'npx beth-copilot ado-sync status' reports stopped. If config exists, still shows org/project. If no config, shows 'not configured'.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 ado-sync status output includes 'stopped' when no PID file exists
- [ ] #2 Shows 'stopped' when PID file exists but process is dead (stale PID)
- [ ] #3 Still shows org/project from config when configured but stopped
- [ ] #4 Shows 'not configured' when no .beth/ado-sync.json exists
<!-- AC:END -->
