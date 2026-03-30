---
id: BETH-64.12
title: Python watcher_main.py — standalone watcher entrypoint
status: Done
assignee: []
created_date: '2026-03-22 16:37'
updated_date: '2026-03-30 21:13'
labels: []
dependencies: []
parent_task_id: BETH-64
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create a new Python entrypoint (ado-sync/app/watcher_main.py) that runs ONLY the backlog file watcher — no FastAPI HTTP server, no open ports. Reads config from .beth/ado-sync.json with .env fallback. This is what the CLI starts via 'ado-sync start'. Covers AD-6, FR-13 from PRD.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 New file: ado-sync/app/watcher_main.py
- [ ] #2 Loads config from .beth/ado-sync.json (passed via --config flag or PROJECT_ROOT env var)
- [ ] #3 Falls back to .env if .beth/ado-sync.json not found
- [ ] #4 Initializes ADOClient with config values
- [ ] #5 Runs backlog_watcher in foreground (file watching loop)
- [ ] #6 Does NOT start FastAPI/uvicorn — no HTTP server, no open ports
- [ ] #7 Handles credentials via azure-identity DefaultAzureCredential (or env var override)
- [ ] #8 Graceful shutdown on SIGTERM (PID-based lifecycle)
- [ ] #9 Logs to stdout (CLI captures) and optionally to .beth/ado-sync.log
- [ ] #10 Unit tests for config loading and watcher initialization
<!-- AC:END -->
