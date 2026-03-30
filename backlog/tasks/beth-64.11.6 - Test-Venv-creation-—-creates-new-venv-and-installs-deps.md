---
id: BETH-64.11.6
title: 'Test: Venv creation — creates new venv and installs deps'
status: To Do
assignee: []
created_date: '2026-03-30 17:06'
labels: []
dependencies: []
parent_task_id: BETH-64.11
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Unit test: createVenv() runs 'python -m venv .beth/ado-sync/.venv' and then pip install -r requirements.txt. Mock child_process.execSync. Verify correct commands called in order with correct paths.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Calls python -m venv with correct target path (.beth/ado-sync/.venv)
- [ ] #2 Calls pip install -r requirements.txt from ado-sync source after venv creation
- [ ] #3 Uses the venv's pip (not system pip)
- [ ] #4 Returns success on clean creation + install
<!-- AC:END -->
