---
id: BETH-65
title: 'Init: append .gitignore entries for beth runtime state'
status: Done
assignee: []
created_date: '2026-03-23 00:29'
updated_date: '2026-03-31 04:28'
labels: []
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Parent task for adding .gitignore management to the init() function in bin/cli.js. When a user runs npx beth-copilot init, we need to ensure .beth/ and other runtime state directories are gitignored so secrets (MSAL tokens) and local state never get committed.
<!-- SECTION:DESCRIPTION:END -->
