---
id: BETH-64.19.7
title: 'Test E2E: no secrets in .beth/ado-sync.json'
status: To Do
assignee: []
created_date: '2026-03-30 17:14'
labels: []
dependencies: []
parent_task_id: BETH-64.19
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Security E2E test: After complete setup flow, scan .beth/ado-sync.json contents for any secret material — access tokens, PATs, client secrets, passwords. File should contain ONLY non-sensitive config: org name, project name, auth method, client ID (public).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 File contains no access tokens or refresh tokens
- [ ] #2 File contains no PAT values
- [ ] #3 File contains no client secrets or passwords
- [ ] #4 Only non-sensitive fields: organization, project, authMethod, clientId (public)
- [ ] #5 Scan covers both Entra and PAT auth paths
<!-- AC:END -->
