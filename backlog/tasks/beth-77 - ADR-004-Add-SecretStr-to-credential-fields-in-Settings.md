---
id: BETH-77
title: 'ADR-004: Add SecretStr to credential fields in Settings'
status: To Do
assignee: []
created_date: '2026-04-01 19:22'
labels: []
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Change ado_pat, azure_openai_api_key, github_webhook_secret from str to pydantic.SecretStr. Prevents accidental exposure via repr(), logging, or traceback. Ref: ADR-004
<!-- SECTION:DESCRIPTION:END -->
