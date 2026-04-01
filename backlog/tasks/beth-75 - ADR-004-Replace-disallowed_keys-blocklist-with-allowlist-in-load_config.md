---
id: BETH-75
title: 'ADR-004: Replace disallowed_keys blocklist with allowlist in load_config()'
status: To Do
assignee: []
created_date: '2026-04-01 19:22'
labels: []
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Replace disallowed_keys={'pat'} with an explicit allowlist of permitted config keys for .beth/ado-sync.json. Unknown keys are ignored, not trusted. Fail-safe. Ref: ADR-004
<!-- SECTION:DESCRIPTION:END -->
