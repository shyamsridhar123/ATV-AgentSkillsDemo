---
id: BETH-84
title: 'ADR-004: Unit tests for SecretStr non-leakage'
status: To Do
assignee: []
created_date: '2026-04-01 19:23'
labels: []
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Test that repr(Settings), str(Settings), and logging do NOT expose secret values for ado_pat, azure_openai_api_key, github_webhook_secret. Ref: ADR-004
<!-- SECTION:DESCRIPTION:END -->
