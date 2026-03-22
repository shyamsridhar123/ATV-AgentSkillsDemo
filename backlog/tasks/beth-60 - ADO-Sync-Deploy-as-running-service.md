---
id: BETH-60
title: 'ADO Sync: Deploy as running service'
status: Done
assignee: []
created_date: '2026-03-22 15:29'
updated_date: '2026-03-22 15:58'
labels: []
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Deploy ado-sync as a running service. Options: Azure Container App, Azure Function, or systemd unit. The FastAPI app (main.py) already has lifespan management, backlog watcher, and GitHub webhook endpoints. Needs: Dockerfile, deployment config, health check endpoint verification, env var management for production secrets.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 systemd unit file created and installable via 'make install' or equivalent
- [ ] #2 FastAPI app starts on boot, restarts on failure (Restart=on-failure)
- [ ] #3 Health check endpoint (/health) returns 200 when service is running
- [ ] #4 Environment variables loaded from /etc/ado-sync/.env (not repo .env)
- [ ] #5 Logs visible via journalctl -u ado-sync
- [ ] #6 Service watches backlog/tasks/ directory successfully after start
<!-- AC:END -->
