---
id: BETH-22
title: Remove deprecated close command (560 lines)
status: To Do
assignee: []
created_date: '2026-03-16 03:11'
updated_date: '2026-03-16 04:45'
labels: []
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
close.ts is a deprecated beads wrapper — 139 lines of stubs that return null, plus 421 lines of tests for a command that prints 'use Backlog.md instead'. The command header literally says DEPRECATED. 560 lines of code testing nothing.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 src/cli/commands/close.ts deleted
- [ ] #2 src/cli/commands/close.test.ts deleted
- [ ] #3 src/cli/commands/close.e2e.test.ts deleted
- [ ] #4 bin/cli.js close command handler updated to show deprecation message inline (or removed)
- [ ] #5 npm test passes after deletion
<!-- AC:END -->
