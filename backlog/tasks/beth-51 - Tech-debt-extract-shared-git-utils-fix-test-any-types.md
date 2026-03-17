---
id: BETH-51
title: 'Tech debt: extract shared git utils + fix test any types'
status: In Progress
assignee: []
created_date: '2026-03-17 13:53'
updated_date: '2026-03-17 13:53'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
DRY violation: git utilities duplicated in pre-push-guard.ts and land.ts. Plus 19+ any casts in test files. Extract shared module, fix types.
<!-- SECTION:DESCRIPTION:END -->
