---
id: BETH-64.19.6
title: 'Test E2E: .gitignore contains .beth/ after setup'
status: To Do
assignee: []
created_date: '2026-03-30 17:13'
labels: []
dependencies: []
parent_task_id: BETH-64.19
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
E2E integration test: After full set-ado-org flow, verify .gitignore contains .beth/ entry. Test both fresh .gitignore (created) and existing .gitignore (appended). Verify .beth/ is not committed to git.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 .gitignore contains .beth/ entry after setup
- [ ] #2 Works when .gitignore already exists (appends)
- [ ] #3 Works when .gitignore doesn't exist (creates)
- [ ] #4 .beth/ directory contents not tracked by git
<!-- AC:END -->
