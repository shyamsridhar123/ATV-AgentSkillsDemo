---
id: BETH-64.10
title: 'CLI command: npx beth-copilot set-ado-org'
status: Done
assignee: []
created_date: '2026-03-22 16:36'
updated_date: '2026-03-24 03:18'
labels: []
dependencies: []
parent_task_id: BETH-64
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement the set-ado-org CLI command that orchestrates the full interactive flow: Entra auth -> org listing -> project selection -> config write -> credential store. Also handles reconfiguration (shows current config, offers to change). Covers FR-1, US-004 from PRD.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Command registered in CLI: npx beth-copilot set-ado-org
- [ ] #2 Full flow: authenticate -> list orgs -> select org -> list projects -> select project -> save config
- [ ] #3 If credentials already exist and are valid, reuses them (no forced re-auth)
- [ ] #4 If credentials are expired or missing, prompts for re-authentication
- [ ] #5 Shows current configuration before prompting: 'Currently: myorg/myproject — change?'
- [ ] #6 Updates .beth/ado-sync.json with new selection
- [ ] #7 .gitignore updated if .beth/ not already listed
- [ ] #8 Success message with next steps: 'Run npx beth-copilot ado-sync start to begin syncing'
- [ ] #9 E2E test with mocked auth + API (no real ADO calls)
<!-- AC:END -->
