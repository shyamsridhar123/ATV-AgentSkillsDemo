---
id: BETH-79
title: 'ADR-004: Remove get_settings() — unify to load_settings()'
status: To Do
assignee: []
created_date: '2026-04-01 19:22'
labels: []
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Remove get_settings() from config.py. Replace all callers (main.py, mcp_server.py) with load_settings(). One entry point = one security posture. Ref: ADR-004
<!-- SECTION:DESCRIPTION:END -->
