---
id: BETH-64.18
title: ADO Sync user documentation and setup guide
status: To Do
assignee: []
created_date: '2026-03-22 16:38'
labels: []
dependencies: []
parent_task_id: BETH-64
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create end-user documentation for ADO Sync self-service setup. Not a developer README — a user-facing guide for someone running npx beth-copilot set-ado-org for the first time. Includes prerequisites, walkthrough, troubleshooting, and FAQ.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 New file: docs/ADO-SYNC-SETUP.md
- [ ] #2 Prerequisites listed: Node.js, Python 3.10+, Azure DevOps access, Entra ID or PAT
- [ ] #3 Step-by-step walkthrough with expected terminal output at each step
- [ ] #4 Troubleshooting section: common errors and fixes (no Python, auth failed, org not found)
- [ ] #5 FAQ: how to change org, how to stop syncing, where config lives, what gets created in ADO
- [ ] #6 Security section: where credentials are stored, what's safe to commit, what's gitignored
- [ ] #7 Links from main README to this doc
- [ ] #8 Reviewed for clarity by someone who isn't the author
<!-- AC:END -->
