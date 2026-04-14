---
id: BETH-64.5
title: 'Resolve OQ-6: .env backward compat — support both or deprecate?'
status: Done
assignee: []
created_date: '2026-03-22 16:35'
updated_date: '2026-04-01 19:20'
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Resolved by ADR-004. Decision: .env stays as local env var convenience (pydantic-settings native). Not deprecated. Config lives in .beth/ado-sync.json, secrets in env vars, tokens in MSAL cache. See backlog/decisions/ADR-004-config-vs-secrets-separation.md.
<!-- SECTION:NOTES:END -->
