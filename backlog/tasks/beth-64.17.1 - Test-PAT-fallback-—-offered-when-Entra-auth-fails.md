---
id: BETH-64.17.1
title: 'Test: PAT fallback — offered when Entra auth fails'
status: Done
assignee: []
created_date: '2026-03-30 17:11'
updated_date: '2026-04-01 13:29'
labels: []
dependencies: []
parent_task_id: BETH-64.17
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Unit test: When Entra device code auth fails, user is prompted 'Entra auth failed. Enter a PAT instead? (y/N)'. If yes, PAT input flow begins. If no, setup aborts with clear message.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 PAT prompt shown after Entra auth failure
- [ ] #2 Prompt text includes 'Entra auth failed. Enter a PAT instead?'
- [ ] #3 Accepting (y) proceeds to PAT input
- [ ] #4 Declining (N or Enter) aborts setup with friendly message
<!-- AC:END -->
