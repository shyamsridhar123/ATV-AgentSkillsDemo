---
id: BETH-65.1
title: Define beth .gitignore entries and marker format
status: To Do
assignee: []
created_date: '2026-03-23 00:29'
labels: []
dependencies: []
parent_task_id: BETH-65
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Objective: Define the exact entries that beth-copilot init appends to .gitignore, and the marker comment format used for idempotency detection.

Acceptance Criteria:
- [ ] Document the entries to append: .beth/ (MSAL tokens, config, PID files), ado-sync/.venv/, ado-sync/.env
- [ ] Define a marker comment format (e.g. '# Beth — managed by beth-copilot init') that init uses to detect if entries already exist
- [ ] Entries must not duplicate anything commonly found in default .gitignore templates (node_modules, .env already covered by most)
- [ ] Confirm .beth/ covers all runtime artifacts: msal_token_cache.json, msal_token_cache.lock, ado-sync.json, ado-sync.pid
- [ ] Decision documented in code comments or ADR-001 consequences section
<!-- SECTION:DESCRIPTION:END -->
