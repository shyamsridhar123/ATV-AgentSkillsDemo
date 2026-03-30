---
id: BETH-64.11.8
title: 'Test: Venv creation — handles failures gracefully'
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
Unit test: createVenv() handles venv creation failure (e.g., subprocess throws) and pip install failure separately. Verify meaningful error messages for each failure mode: venv creation error, pip install error, disk space error.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Throws clear error when python -m venv fails (e.g., EACCES, ENOSPC)
- [ ] #2 Throws clear error when pip install fails (network, missing requirements.txt)
- [ ] #3 Error messages distinguish between venv creation failure and pip install failure
- [ ] #4 Partial state cleaned up on failure (no half-created .venv left behind)
<!-- AC:END -->
