---
id: BETH-65.3
title: Wire ensureBethGitignore() into init() flow
status: To Do
assignee: []
created_date: '2026-03-23 00:30'
labels: []
dependencies: []
parent_task_id: BETH-65
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Objective: Call ensureBethGitignore() at the correct point in the init() function so .gitignore is updated as part of every init run.

Acceptance Criteria:
- [ ] ensureBethGitignore() called after file copying but before backlog init (logical ordering: scaffold files → protect secrets → init tracker)
- [ ] Respects --force flag: if --force, re-append even if marker exists (overwrite stale entries)
- [ ] Does NOT have a --skip-gitignore flag — this is a security measure, not optional
- [ ] Works correctly when init is run from the project root (process.cwd())
- [ ] init() output includes the .gitignore status line in the summary
- [ ] Running 'npx beth-copilot init' in a fresh project creates .gitignore with beth entries
- [ ] Running 'npx beth-copilot init' in an existing project with .gitignore appends without clobbering
<!-- SECTION:DESCRIPTION:END -->
