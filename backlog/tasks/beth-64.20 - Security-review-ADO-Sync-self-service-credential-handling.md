---
id: BETH-64.20
title: 'Security review: ADO Sync self-service credential handling'
status: Done
assignee: []
created_date: '2026-03-22 16:38'
updated_date: '2026-03-31 06:00'
labels: []
dependencies: []
parent_task_id: BETH-64
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Security audit of the complete credential flow: Entra device code auth, token storage in keychain, credential fallback, Python runtime token access, PAT handling. Must validate no secrets leak to git, logs, or config files.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Threat model for credential flow documented (Entra tokens, PATs, refresh tokens)
- [ ] #2 Verified: no tokens/PATs in .beth/ado-sync.json or any plain-text files
- [ ] #3 Verified: .beth/ in .gitignore, enforced during setup
- [ ] #4 Verified: PAT masked during input, never logged or shown in errors
- [ ] #5 Verified: encrypted file fallback uses proper encryption (not base64)
- [ ] #6 Verified: env var overrides don't persist to disk
- [ ] #7 Secret scanning rule: CI catches committed credentials in .beth/ path
- [ ] #8 OWASP top 10 review for auth flow (broken auth, credential stuffing, etc.)
<!-- AC:END -->
