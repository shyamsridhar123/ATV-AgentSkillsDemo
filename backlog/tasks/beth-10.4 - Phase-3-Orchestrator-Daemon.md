---
id: BETH-10.4
title: 'Phase 3: Orchestrator Daemon'
status: Done
assignee: []
created_date: '2026-03-15 06:42'
updated_date: '2026-03-16 19:38'
labels: []
dependencies: []
parent_task_id: BETH-10
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Objective: Beth runs as a persistent daemon that decomposes work, dispatches tasks, and manages the full lifecycle. Build orchestrator.py async poll loop, LLM-driven epic decomposition, dependency-aware dispatch, heartbeat monitoring, tmux session management, Backlog.md auto-update. ~700 LOC. Milestone: User submits 'Build a JWT auth system' → Beth decomposes into 3+ subtasks → dispatches to workers → merges results → epic branch has working tested code.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Beth correctly decomposes a feature request into subtasks with logical dependencies
- [ ] #2 Subtasks dispatched only when their dependencies are satisfied
- [ ] #3 Workers receive tasks, execute, and report completion autonomously
- [ ] #4 Beth merges all worker branches in dependency order
- [ ] #5 Final test suite passes on the merged epic branch
- [ ] #6 Stuck worker detected within 2x heartbeat interval (simulated by killing process)
- [ ] #7 tmux session survives terminal close; swarm attach reconnects
- [ ] #8 Backlog.md auto-update: backlog task edit runs when epic closes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Depends on: BETH-10.3 (Phase 2). Cannot start until Phase 2 milestone passes.
<!-- SECTION:NOTES:END -->
