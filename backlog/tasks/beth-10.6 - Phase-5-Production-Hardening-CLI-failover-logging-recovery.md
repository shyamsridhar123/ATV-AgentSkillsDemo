---
id: BETH-10.6
title: 'Phase 5: Production Hardening - CLI, failover, logging, recovery'
status: To Do
assignee: []
created_date: '2026-03-15 06:42'
labels: []
dependencies: []
parent_task_id: BETH-10
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Objective: Make the system reliable, observable, and pleasant to operate. Build CLI interface (swarm start/run/stop/status/resume/attach), graceful shutdown, provider failover on 429/500/503, structured JSON logging with agent/task/epic fields, board query CLI, crash recovery from durable SQLite state, SWARM-USAGE.md docs, Backlog.md integration, optional systemd unit. ~600 LOC. Milestone: System runs 1+ hour, handles multiple epics, survives simulated crash, restarts cleanly, produces jq-parseable logs.
<!-- SECTION:DESCRIPTION:END -->
