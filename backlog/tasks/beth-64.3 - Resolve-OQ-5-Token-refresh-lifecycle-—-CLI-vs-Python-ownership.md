---
id: BETH-64.3
title: 'Resolve OQ-5: Token refresh lifecycle — CLI vs Python ownership'
status: Done
assignee: []
created_date: '2026-03-22 16:34'
updated_date: '2026-03-22 23:48'
labels: []
dependencies: []
parent_task_id: BETH-64
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
BLOCKING DECISION for Phase 2a. Who refreshes Entra tokens at runtime? (a) Python reads/refreshes from keychain via keyring. (b) CLI refreshes on start, passes via env var — tokens expire during long sessions. (c) Python uses azure-identity DefaultAzureCredential with its own token cache, CLI uses MSAL for interactive auth. PRD recommends (c). Validate and document.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Decision documented in backlog/decisions/ with tradeoff analysis
- [ ] #2 Token flow diagram: CLI auth -> storage -> Python runtime reads -> refresh
- [ ] #3 Edge cases defined: token expired mid-session, refresh token revoked, keychain locked
- [ ] #4 Interface contract between CLI (TypeScript) and Python service specified
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
ADR-003 written in backlog/decisions/ADR-003-token-refresh-lifecycle.md. Decision: Shared MSAL token cache file (.beth/msal_token_cache.json). CLI writes via MSAL.js, Python reads/refreshes via MSAL Python. Azure CLI pattern. Same clientId required.
<!-- SECTION:NOTES:END -->
