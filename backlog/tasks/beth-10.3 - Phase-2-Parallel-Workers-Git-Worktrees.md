---
id: BETH-10.3
title: 'Phase 2: Parallel Workers + Git Worktrees'
status: To Do
assignee: []
created_date: '2026-03-15 06:42'
updated_date: '2026-03-15 06:45'
labels: []
dependencies: []
parent_task_id: BETH-10
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Objective: Prove two agents can work simultaneously on different tasks without conflicts. Build git.py worktree lifecycle, sequential merge gate with test validation, claims channel for path-level conflict prevention, wire worktree into worker startup. ~600 LOC. Milestone: Developer + tester agents work simultaneously in separate worktrees, Beth merges both sequentially, tests pass.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Worktrees created from origin/main (or specified base branch)
- [ ] #2 Each worker git operations isolated to its worktree
- [ ] #3 Beth merges worker A, runs tests, then merges worker B, runs tests (sequential)
- [ ] #4 If merge conflicts, abort cleanly with no partial state
- [ ] #5 Worktrees and ephemeral branches cleaned up after merge
- [ ] #6 Claims channel prevents two workers from being assigned overlapping file paths
- [ ] #7 Test validation gate: configurable test command runs after every merge, revert on failure
- [ ] #8 .worktrees/ added to .gitignore
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Depends on: BETH-10.2 (Phase 1). Cannot start until Phase 1 milestone passes.
<!-- SECTION:NOTES:END -->
