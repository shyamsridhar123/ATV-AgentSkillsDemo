---
id: BETH-65.5
title: 'E2E test: init creates correct .gitignore in fresh project'
status: To Do
assignee: []
created_date: '2026-03-23 00:30'
labels: []
dependencies: []
parent_task_id: BETH-65
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Objective: Verify the full init flow correctly manages .gitignore in a realistic scenario — scaffolding a fresh project from scratch.

Acceptance Criteria:
- [ ] E2E test creates a temp directory simulating a fresh project (git init, npm init -y)
- [ ] Runs 'node bin/cli.js init' in the temp directory
- [ ] Asserts .gitignore exists and contains the beth marker section
- [ ] Asserts .beth/ entry is present in .gitignore
- [ ] Runs init a second time and asserts no duplicate entries
- [ ] Test cleans up temp directory after completion
- [ ] Test passes via 'npm run test:e2e' or vitest e2e config
- [ ] Test file located in src/__tests__/ with e2e naming convention
<!-- SECTION:DESCRIPTION:END -->
