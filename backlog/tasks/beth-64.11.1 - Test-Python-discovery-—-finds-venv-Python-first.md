---
id: BETH-64.11.1
title: 'Test: Python discovery — finds venv Python first'
status: Done
assignee: []
created_date: '2026-03-30 17:05'
updated_date: '2026-03-30 20:35'
labels: []
dependencies: []
parent_task_id: BETH-64.11
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Unit test: discoverPython() checks .beth/ado-sync/.venv/bin/python first before searching PATH. Mock fs.existsSync to return true for venv path. Verify it returns the venv path without checking system PATH.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 discoverPython() returns .beth/ado-sync/.venv/bin/python when venv exists
- [ ] #2 Does NOT call which/where for system Python when venv found
- [ ] #3 Works on both Unix (.venv/bin/python) and Windows (.venv/Scripts/python.exe)
<!-- AC:END -->
