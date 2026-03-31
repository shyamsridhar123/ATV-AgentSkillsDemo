---
id: BETH-64.14.1
title: 'Test: init — ADO declined skips cleanly, no .beth created'
status: Done
assignee: []
created_date: '2026-03-30 17:09'
updated_date: '2026-03-31 14:37'
labels: []
dependencies: []
parent_task_id: BETH-64.14
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
E2E test: During 'npx beth-copilot init', when user answers 'N' to 'Do you use Azure DevOps?', verify: no .beth/ directory created, no ado-sync config files, no ADO-related prompts shown after decline, init completes normally with agents/skills/hooks.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Declining ADO prompt does not create .beth/ directory
- [ ] #2 No ado-sync.json, no .beth/ado-sync.pid created
- [ ] #3 No further ADO-related prompts after declining
- [ ] #4 Core init completes successfully (agents, skills, hooks installed)
- [ ] #5 Exit code 0
<!-- AC:END -->
