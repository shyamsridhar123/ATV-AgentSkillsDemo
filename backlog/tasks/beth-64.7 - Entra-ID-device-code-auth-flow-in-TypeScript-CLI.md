---
id: BETH-64.7
title: Entra ID device code auth flow in TypeScript CLI
status: Done
assignee: []
created_date: '2026-03-22 16:35'
updated_date: '2026-03-23 23:57'
labels: []
dependencies: []
parent_task_id: BETH-64
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement Entra ID interactive authentication using device code flow in the beth-copilot CLI. Uses @azure/msal-node. Targets ADO resource scope (499b84ac-1321-427f-aa17-267ca6975798/.default). Stores tokens securely. Covers FR-8, FR-9, US-002 from PRD.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Device code flow implemented: CLI prints login URL + code, user completes in browser
- [ ] #2 Auth targets ADO resource scope (499b84ac-1321-427f-aa17-267ca6975798/.default)
- [ ] #3 Access token and refresh token obtained on success
- [ ] #4 Tokens stored via chosen credential storage mechanism (depends on OQ-1 resolution)
- [ ] #5 Tenant ID auto-discovered from user's account, not manually prompted
- [ ] #6 Clear error message on timeout, cancellation, or permission denied
- [ ] #7 Respects HTTPS_PROXY env var for corporate proxy environments
- [ ] #8 Token refresh implemented — silent renewal when access token expired
- [ ] #9 @azure/msal-node added as dependency in package.json
- [ ] #10 Unit tests for auth flow (mocked MSAL responses)
<!-- AC:END -->
