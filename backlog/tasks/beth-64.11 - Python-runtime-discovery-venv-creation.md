---
id: BETH-64.11
title: Python runtime discovery + venv creation
status: To Do
assignee: []
created_date: '2026-03-22 16:36'
labels: []
dependencies: []
parent_task_id: BETH-64
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement Python 3.10+ detection and virtual environment setup in the TypeScript CLI. Discovery order: .beth/ado-sync/.venv/bin/python -> python3 on PATH -> python on PATH. Creates venv and installs deps from requirements.txt during set-ado-org. Covers FR-17, FR-18 from PRD.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Python discovery function: check .beth/ado-sync/.venv/bin/python first, then python3, then python
- [ ] #2 Version validation: must be 3.10+ (parse python --version output)
- [ ] #3 Clear error if no Python found: 'Python 3.10+ required. Install from https://python.org'
- [ ] #4 Venv creation: python -m venv .beth/ado-sync/.venv
- [ ] #5 Dependency installation: pip install -r requirements.txt (from ado-sync source)
- [ ] #6 Works on macOS, Linux, and Windows (python vs python3 vs py)
- [ ] #7 Venv reused on subsequent runs — skip creation if already exists
- [ ] #8 Error handling: venv creation failure, pip install failure, disk space issues
- [ ] #9 Unit tests for Python discovery logic
<!-- AC:END -->
