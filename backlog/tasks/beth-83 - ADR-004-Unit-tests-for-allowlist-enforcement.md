---
id: BETH-83
title: 'ADR-004: Unit tests for allowlist enforcement'
status: To Do
assignee: []
created_date: '2026-04-01 19:23'
labels: []
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Test that load_config() only accepts allowlisted keys from .beth/ado-sync.json. Unknown keys must be silently ignored. Secret-like keys must be rejected. Ref: ADR-004
<!-- SECTION:DESCRIPTION:END -->
