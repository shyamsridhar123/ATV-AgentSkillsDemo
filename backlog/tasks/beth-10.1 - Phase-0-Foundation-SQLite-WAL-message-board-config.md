---
id: BETH-10.1
title: 'Phase 0: Foundation - SQLite WAL message board + config'
status: To Do
assignee: []
created_date: '2026-03-15 06:42'
updated_date: '2026-03-15 06:43'
labels: []
dependencies: []
parent_task_id: BETH-10
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Objective: Prove the coordination layer works before touching LLMs or git. Build Python project structure, SwarmConfig dataclass with env var interpolation, SQLite WAL message board (7 channels, self-referencing posts, cursor-based read_new), outcomes table schema. ~500 LOC. Milestone: pytest swarm/tests/test_board.py passes concurrent read/write tests, config loads from swarm.yaml.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Board supports 7 channels: tasks, completions, claims, conflicts, learnings, blockers, heartbeats
- [ ] #2 read_new() returns only unread posts per reader via cursor-based tracking
- [ ] #3 Two threads writing simultaneously never corrupt the database
- [ ] #4 Config resolves ${ENV_VAR} references from environment
- [ ] #5 Python project structure: swarm/ package, pyproject.toml, dev dependencies
- [ ] #6 outcomes table schema created (for Phase 4, schema complete from day 1)
- [ ] #7 Unit tests pass: concurrent reads, write serialization, busy timeout, WAL recovery after crash
<!-- AC:END -->
