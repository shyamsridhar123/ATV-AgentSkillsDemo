---
id: BETH-64.11.3
title: 'Test: Python discovery — falls back to python on PATH'
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
Unit test: When no venv and no python3, discoverPython() finds python on PATH. Mock venv missing, python3 missing, but python available. Verify it returns the python path.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 discoverPython() returns python path when venv and python3 are both missing
- [ ] #2 python is the last resort before failure
<!-- AC:END -->
