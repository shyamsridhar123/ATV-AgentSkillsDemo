---
id: BETH-64.11.4
title: 'Test: Python discovery — rejects Python < 3.10'
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
Unit test: discoverPython() validates version >= 3.10. Mock python --version returning '3.9.7'. Verify it rejects and continues searching or throws. Also test boundary: 3.10.0 accepted, 3.9.19 rejected.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Python 3.9.x is rejected with clear error message
- [ ] #2 Python 3.10.0 is accepted (boundary case)
- [ ] #3 Python 3.12.x and higher are accepted
- [ ] #4 Version string parsing handles various formats (Python 3.10.1, Python 3.12.0rc1)
<!-- AC:END -->
