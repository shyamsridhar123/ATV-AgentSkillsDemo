---
id: BETH-64.5
title: 'Resolve OQ-6: .env backward compat — support both or deprecate?'
status: To Do
assignee: []
created_date: '2026-03-22 16:35'
labels: []
dependencies: []
parent_task_id: BETH-64
priority: low
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Design decision: Phase 1 uses .env for config. Should we support .env alongside .beth/ado-sync.json forever, or deprecate .env after a migration period? PRD recommends supporting both with .beth/ taking precedence, deprecating .env in a future major version. Decide and document migration path.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Decision documented in backlog/decisions/
- [ ] #2 Migration path for Phase 1 users defined (if deprecating)
- [ ] #3 Config precedence documented in ado-sync README
<!-- AC:END -->
