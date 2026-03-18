---
id: BETH-53.1
title: Sanitize smoke_live.py hardcoded AOAI endpoint
status: To Do
assignee: []
created_date: '2026-03-18 05:55'
labels: []
dependencies: []
parent_task_id: BETH-53
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Replace hardcoded beth-swarm-aoai.openai.azure.com fallback in swarm/tests/smoke_live.py with a fail-fast env var requirement. Users must set AZURE_OPENAI_ENDPOINT.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 No hardcoded AOAI endpoint URLs in any tracked .py file
- [ ] #2 smoke_live.py requires AZURE_OPENAI_ENDPOINT env var — skips test if missing
- [ ] #3 grep -r 'beth-swarm-aoai' swarm/tests/ returns zero results
<!-- AC:END -->
