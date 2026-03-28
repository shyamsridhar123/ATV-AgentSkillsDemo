---
id: BETH-64.6
title: 'Per-project config: .beth/ado-sync.json schema and storage'
status: Done
assignee: []
created_date: '2026-03-22 16:35'
updated_date: '2026-03-23 23:53'
labels: []
dependencies: []
parent_task_id: BETH-64
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement per-project ADO Sync configuration. Config lives in .beth/ado-sync.json at the project root. Contains org, project, auth method, tenant ID, task prefix, tasks dir, AI formatting settings. NO SECRETS in this file. Covers FR-5, FR-7 from PRD.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 JSON schema defined and documented for .beth/ado-sync.json
- [ ] #2 TypeScript type/interface for the config shape (shared between CLI commands)
- [ ] #3 Read/write utility functions in src/cli/ for loading and saving config
- [ ] #4 Config file is created during set-ado-org flow
- [ ] #5 .beth/ directory auto-created if missing
- [ ] #6 .gitignore automatically updated to include .beth/ during setup
- [ ] #7 If .gitignore doesn't exist, it is created with .beth/ entry
- [ ] #8 Config contains NO tokens, PATs, or API keys — only org/project/settings
- [ ] #9 Unit tests for config read/write utilities
<!-- AC:END -->
