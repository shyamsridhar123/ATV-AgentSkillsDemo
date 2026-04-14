---
id: BETH-78
title: 'ADR-004: Update .get_secret_value() call sites'
status: To Do
assignee: []
created_date: '2026-04-01 19:22'
labels: []
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Update all callers that read ado_pat, azure_openai_api_key, github_webhook_secret to use .get_secret_value(). Affected files: ado_client.py, story_formatter.py, main.py. Depends on BETH-77. Ref: ADR-004
<!-- SECTION:DESCRIPTION:END -->
