---
id: BETH-64.17
title: PAT fallback authentication
status: Done
assignee: []
created_date: '2026-03-22 16:38'
updated_date: '2026-04-01 13:29'
labels: []
dependencies: []
parent_task_id: BETH-64
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement Personal Access Token fallback for users without Entra ID access. Offered when Entra auth fails or user explicitly chooses PAT. Validates PAT against ADO API before saving. Stores securely via same credential mechanism. Covers US-008 from PRD.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 If Entra auth fails, offer PAT as alternative: 'Entra auth failed. Enter a PAT instead? (y/N)'
- [ ] #2 PAT input is masked (no echo in terminal)
- [ ] #3 PAT validated against ADO API before storing (call GET _apis/projects with PAT)
- [ ] #4 Warning if PAT doesn't have Work Items (Read, Write) scope
- [ ] #5 PAT stored via same credential storage mechanism as Entra tokens
- [ ] #6 authMethod in .beth/ado-sync.json set to 'pat' when using PAT
- [ ] #7 PAT never written to plain-text config files or committed to git
- [ ] #8 PAT never appears in logs or error messages
- [ ] #9 Unit tests for PAT validation and masked input
<!-- AC:END -->
