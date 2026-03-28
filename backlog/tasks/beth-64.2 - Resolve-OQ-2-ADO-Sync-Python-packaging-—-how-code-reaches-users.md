---
id: BETH-64.2
title: 'Resolve OQ-2: ADO Sync Python packaging — how code reaches users'
status: Done
assignee: []
created_date: '2026-03-22 16:34'
updated_date: '2026-03-22 23:48'
labels: []
dependencies: []
parent_task_id: BETH-64
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
BLOCKING DECISION for Phase 2a. Current ado-sync/ lives in the beth repo. Users who install beth-copilot via npm need the Python code. Options: (a) Bundle in npm package, copy to .beth/ado-sync/ during setup. (b) Clone from separate repo. (c) Publish to PyPI and pip install. Decision affects install flow, update mechanism, and bundle size.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Decision documented in backlog/decisions/ with tradeoff analysis
- [ ] #2 Chosen approach prototyped end-to-end (npm install -> Python code available)
- [ ] #3 Update/upgrade path defined — how users get new ado-sync versions
- [ ] #4 Impact on npm package size measured if bundling
- [ ] #5 CI/CD changes identified if publishing to PyPI
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
ADR-002 written in backlog/decisions/ADR-002-python-packaging.md. Decision: Bundle ado-sync/ in npm package, copy to .beth/ado-sync/ during setup. ~50KB addition. Follows existing templates/ pattern.
<!-- SECTION:NOTES:END -->
