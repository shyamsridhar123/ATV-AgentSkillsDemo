---
id: BETH-64.8
title: Credential storage implementation (keychain + fallback)
status: Done
assignee: []
created_date: '2026-03-22 16:36'
updated_date: '2026-03-23 23:59'
labels: []
dependencies: []
parent_task_id: BETH-64
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement secure credential storage for ADO Sync tokens and PATs. Primary: OS keychain. Fallback: encrypted file in .beth/.credentials. Override: BETH_ADO_PAT / BETH_ADO_TOKEN env vars. Covers FR-6 from PRD. Blocked by OQ-1 resolution.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Store/retrieve/delete credentials from OS keychain (macOS Keychain, Windows Credential Manager, libsecret on Linux)
- [ ] #2 Service name: beth-copilot-ado-sync, account key: {org}/{project}
- [ ] #3 Encrypted file fallback at .beth/.credentials when keychain unavailable
- [ ] #4 .beth/.credentials is in .gitignore (enforced)
- [ ] #5 Environment variable override: BETH_ADO_PAT and BETH_ADO_TOKEN bypass stored credentials
- [ ] #6 Credential API abstraction: store(key, value), retrieve(key), delete(key) — callers don't know the backend
- [ ] #7 Tokens never written to plain-text files, logs, or error messages
- [ ] #8 Works on macOS, Linux (incl. WSL), and Windows
- [ ] #9 Unit tests with mocked keychain backend
<!-- AC:END -->
