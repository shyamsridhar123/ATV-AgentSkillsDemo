---
id: BETH-64.14
title: 'Init flow integration: offer ADO Sync during beth init'
status: Done
assignee: []
created_date: '2026-03-22 16:37'
updated_date: '2026-03-31 14:37'
labels: []
dependencies: []
parent_task_id: BETH-64
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Extend npx beth-copilot init to offer ADO Sync setup after core initialization. Prompts 'Do you use Azure DevOps for this project? (y/N)'. If yes, launches set-ado-org flow. If no, skips cleanly. Covers FR-3, US-001 from PRD.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 init asks 'Do you use Azure DevOps for this project? (y/N)' after core setup completes
- [ ] #2 If yes: launches full set-ado-org flow (auth -> org -> project -> config)
- [ ] #3 If no (or just Enter): skips entirely, no errors, no leftover config
- [ ] #4 Works with both npx beth-copilot init and npx beth-copilot quickstart
- [ ] #5 ADO setup only offered AFTER agents, skills, and hooks are installed
- [ ] #6 Skipping ADO setup does not create .beth/ directory or any ADO config
- [ ] #7 E2E test: init with ADO declined, init with ADO accepted (mocked)
<!-- AC:END -->
