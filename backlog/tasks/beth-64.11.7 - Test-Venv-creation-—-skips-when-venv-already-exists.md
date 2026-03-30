---
id: BETH-64.11.7
title: 'Test: Venv creation — skips when venv already exists'
status: Done
assignee: []
created_date: '2026-03-30 17:06'
updated_date: '2026-03-30 20:35'
labels: []
dependencies: []
parent_task_id: BETH-64.11
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Unit test: createVenv() detects existing .beth/ado-sync/.venv and skips creation. Mock fs.existsSync returning true for .venv/bin/python. Verify python -m venv is NOT called. Verify pip install is still called (to update deps).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Skips venv creation when .venv/bin/python already exists
- [ ] #2 Does NOT call python -m venv when venv found
- [ ] #3 Still installs/updates deps via pip install -r requirements.txt
<!-- AC:END -->
