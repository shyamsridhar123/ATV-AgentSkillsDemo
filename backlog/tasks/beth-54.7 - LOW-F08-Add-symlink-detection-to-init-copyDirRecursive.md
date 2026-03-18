---
id: BETH-54.7
title: '[LOW] F08: Add symlink detection to init copyDirRecursive'
status: Done
assignee: []
created_date: '2026-03-18 06:11'
updated_date: '2026-03-18 18:19'
labels: []
dependencies: []
parent_task_id: BETH-54
priority: low
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
bin/cli.js copyDirRecursive uses statSync (follows symlinks) not lstatSync. If a malicious symlink exists at a destination path (e.g. .github/agents/ → /etc/), copyFileSync follows it. Low probability but easy fix.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 copyDirRecursive uses lstatSync to detect symlinks at destination paths
- [ ] #2 Symlink destinations are skipped with a warning message
- [ ] #3 Normal (non-symlink) directory copy still works correctly
- [ ] #4 Unit test verifies symlink destination is skipped
<!-- AC:END -->
