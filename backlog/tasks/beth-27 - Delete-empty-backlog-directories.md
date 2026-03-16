---
id: BETH-27
title: Delete empty backlog directories
status: Done
assignee: []
created_date: '2026-03-16 03:12'
updated_date: '2026-03-16 06:26'
labels: []
dependencies: []
priority: low
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
8 empty directories in backlog/: archive/milestones, archive/drafts, archive/tasks, milestones, drafts, docs, completed, decisions. Created for the old file-based system, never populated. Backlog.md CLI stores tasks in backlog/tasks/ with YAML frontmatter — these extra dirs are structural noise.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 backlog/archive/milestones deleted
- [ ] #2 backlog/archive/drafts deleted
- [ ] #3 backlog/archive/tasks deleted
- [ ] #4 backlog/milestones deleted
- [ ] #5 backlog/drafts deleted
- [ ] #6 backlog/docs deleted
- [ ] #7 backlog/completed deleted
- [ ] #8 backlog/decisions deleted
- [ ] #9 backlog CLI still functions correctly after removal
<!-- AC:END -->
