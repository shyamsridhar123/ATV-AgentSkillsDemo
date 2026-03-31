---
id: BETH-65.4
title: Unit tests for ensureBethGitignore()
status: Done
assignee: []
created_date: '2026-03-23 00:30'
updated_date: '2026-03-31 04:27'
labels: []
dependencies: []
parent_task_id: BETH-65
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Objective: Write unit tests covering all ensureBethGitignore() behaviors — creation, append, idempotency, and edge cases.

Acceptance Criteria:
- [ ] Test: no .gitignore exists → creates file with beth section
- [ ] Test: .gitignore exists, no beth section → appends beth section with blank line separator
- [ ] Test: .gitignore exists, already has beth marker → no changes made (idempotent)
- [ ] Test: .gitignore exists with trailing newline → no double blank lines after append
- [ ] Test: .gitignore exists without trailing newline → blank line added before beth section
- [ ] Test: --force flag → replaces existing beth section with fresh entries
- [ ] Test: existing .gitignore content is preserved exactly (no reordering, no trimming)
- [ ] Tests use tmp directory (os.tmpdir) — never touch real .gitignore
- [ ] All tests pass via 'npm test'
- [ ] Tests located in src/__tests__/ or appropriate test directory
<!-- SECTION:DESCRIPTION:END -->
