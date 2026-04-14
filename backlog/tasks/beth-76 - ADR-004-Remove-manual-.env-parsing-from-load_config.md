---
id: BETH-76
title: 'ADR-004: Remove manual .env parsing from load_config()'
status: To Do
assignee: []
created_date: '2026-04-01 19:22'
labels: []
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Remove the dotenv_values() section that manually parses .env into a config dict. Let pydantic-settings handle .env natively via its built-in env_file support. .env becomes an env var convenience, not a config source. Ref: ADR-004
<!-- SECTION:DESCRIPTION:END -->
