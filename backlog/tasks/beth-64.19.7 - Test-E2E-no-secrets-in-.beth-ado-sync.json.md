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
Security E2E test: After complete setup flow, scan .beth/ado-sync.json contents for any secret material — access tokens, PATs, client secrets, passwords. Use a denylist approach: assert no keys/values matching known secret patterns exist, rather than allowlisting specific fields (config schema may include additional non-secret fields like tenantId, taskPrefix, tasksDir, aiFormatting).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 File contains no access tokens or refresh tokens (denylist: accessToken, refreshToken, id_token)
- [ ] #2 File contains no PAT values (denylist: keys/values matching PAT patterns)
- [ ] #3 File contains no client secrets or passwords (denylist: clientSecret, password, secret)
- [ ] #4 All JSON keys are from known non-sensitive config schema (organization, project, authMethod, clientId, tenantId, taskPrefix, tasksDir, aiFormatting, etc.)
- [ ] #5 Scan covers both Entra and PAT auth paths
<!-- AC:END -->
