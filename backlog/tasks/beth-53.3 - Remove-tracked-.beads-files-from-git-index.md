---
id: BETH-53.3
title: Remove tracked .beads/ files from git index
status: Done
assignee: []
created_date: '2026-03-18 05:55'
updated_date: '2026-03-18 05:59'
labels: []
dependencies: []
parent_task_id: BETH-53
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The .beads/ directory was rm -rf'd but the files are still in git index. Remove them with git rm --cached so they stop showing as deleted.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 git ls-files .beads/ returns empty
- [ ] #2 No .beads references in .gitignore (clean removal)
- [ ] #3 .beads/ added to .gitignore to prevent re-tracking
<!-- AC:END -->
