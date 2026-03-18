---
id: BETH-54.9
title: '[LOW] F11: Add private key patterns to .gitignore'
status: Done
assignee: []
created_date: '2026-03-18 06:13'
updated_date: '2026-03-18 16:57'
labels: []
dependencies: []
parent_task_id: BETH-54
priority: low
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Root .gitignore is missing common private key file patterns. Users may generate TLS certs or SSH keys in the repo during Azure deployment or local dev.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Root .gitignore includes: *.pem, *.key, *.p12, *.pfx, *.jks patterns
- [ ] #2 Patterns are grouped under a clear '# Private keys and certificates' comment
- [ ] #3 Existing tracked files are not affected (git status clean after adding patterns)
<!-- AC:END -->
