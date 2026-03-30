---
id: BETH-64.17.3
title: 'Test: PAT security — never in config, logs, or error messages'
status: To Do
assignee: []
created_date: '2026-03-30 17:12'
labels: []
dependencies: []
parent_task_id: BETH-64.17
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Security unit test: PAT must never appear in .beth/ado-sync.json, console.log output, error messages, or stack traces. Store PAT, then scan all outputs and files for the PAT value. Also verify PAT input is masked (no echo).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 PAT value not present in .beth/ado-sync.json after storage
- [ ] #2 PAT value not present in any console.log or console.error output
- [ ] #3 PAT value not present in error messages or stack traces on failure
- [ ] #4 authMethod set to 'pat' in config (not the actual PAT value)
- [ ] #5 PAT input uses masked/no-echo readline
<!-- AC:END -->
