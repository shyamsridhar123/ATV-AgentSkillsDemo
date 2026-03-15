---
id: BETH-10.6
title: 'Phase 5: Production Hardening - CLI, failover, logging, recovery'
status: To Do
assignee: []
created_date: '2026-03-15 06:42'
updated_date: '2026-03-15 06:45'
labels: []
dependencies: []
parent_task_id: BETH-10
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Objective: Make the system reliable, observable, and pleasant to operate. Build CLI interface (swarm start/run/stop/status/resume/attach), graceful shutdown, provider failover on 429/500/503, structured JSON logging with agent/task/epic fields, board query CLI, crash recovery from durable SQLite state, SWARM-USAGE.md docs, Backlog.md integration, optional systemd unit. ~600 LOC. Milestone: System runs 1+ hour, handles multiple epics, survives simulated crash, restarts cleanly, produces jq-parseable logs.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 swarm status shows: running workers, queued tasks, recent completions, current spend
- [ ] #2 swarm stop completes in-progress work (up to configurable timeout) before shutting down
- [ ] #3 Provider failover transparent to workers (they don't know which provider served request)
- [ ] #4 After crash, swarm start resumes: reads board state, re-dispatches incomplete tasks, no re-merge
- [ ] #5 Logs parseable by jq with timestamps, agent IDs, and task IDs
- [ ] #6 docs/SWARM-USAGE.md sufficient for new developer to set up and run the swarm
- [ ] #7 CLI commands: swarm start, run, stop, status, resume, attach, board, outcomes
- [ ] #8 Integration with Backlog.md CLI for human-facing task updates
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Depends on: BETH-10.5 (Phase 4). Cannot start until Phase 4 milestone passes.
<!-- SECTION:NOTES:END -->
