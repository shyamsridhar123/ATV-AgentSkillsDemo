---
id: BETH-21
title: Remove legacy test scripts from package.json
status: To Do
assignee: []
created_date: '2026-03-16 03:11'
updated_date: '2026-03-16 04:45'
labels: []
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
test:legacy runs 'node --test bin/lib/*.test.js' against dead files. test:legacy:ts runs built dist/ tests via node:test — superseded by vitest. test:all chains both. All three scripts are dead weight.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 test:legacy script removed from package.json
- [ ] #2 test:legacy:ts script removed from package.json
- [ ] #3 test:all simplified to just 'npm run test' or removed entirely
- [ ] #4 npm test passes
<!-- AC:END -->
