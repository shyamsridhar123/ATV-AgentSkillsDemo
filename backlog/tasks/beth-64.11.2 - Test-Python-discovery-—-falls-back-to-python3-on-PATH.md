---
id: BETH-64.11.2
title: 'Test: Python discovery — falls back to python3 on PATH'
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
Unit test: When no venv exists, discoverPython() checks for python3 on system PATH. Mock fs.existsSync to return false for venv, mock which/execSync to find python3. Verify it returns the python3 path.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 discoverPython() returns python3 path when venv missing but python3 is on PATH
- [ ] #2 python3 is preferred over python (checked first)
<!-- AC:END -->
