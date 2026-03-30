---
id: BETH-64.11.5
title: 'Test: Python discovery — error when no Python found'
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
Unit test: When no venv, no python3, no python on PATH, discoverPython() throws with actionable error message including install URL. Verify exact error text includes 'Python 3.10+ required' and 'https://python.org'.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Throws/returns error when no Python binary found anywhere
- [ ] #2 Error message contains 'Python 3.10+ required'
- [ ] #3 Error message contains install URL 'https://python.org'
- [ ] #4 Error is user-friendly (not a stack trace)
<!-- AC:END -->
