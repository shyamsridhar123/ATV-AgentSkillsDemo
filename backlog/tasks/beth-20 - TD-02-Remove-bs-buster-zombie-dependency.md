---
id: BETH-20
title: 'TD-02: Remove bs-buster zombie dependency'
status: To Do
assignee: []
created_date: '2026-03-16 03:11'
labels: []
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
bs-buster is listed in package.json dependencies but has zero code imports, isn't installed in node_modules, and serves no purpose. BETH-17 'fixed' this on epic/beth-17 but that branch never merged to main. Tracker says Done — code says otherwise.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 bs-buster removed from package.json dependencies
- [ ] #2 npm install runs clean (updated lockfile)
- [ ] #3 npm test passes
- [ ] #4 BETH-17 status corrected in backlog (reopened or noted as superseded)
<!-- AC:END -->
