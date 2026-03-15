---
id: BETH-10.1
title: 'Phase 0: Foundation - SQLite WAL message board + config'
status: To Do
assignee: []
created_date: '2026-03-15 06:42'
labels: []
dependencies: []
parent_task_id: BETH-10
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Objective: Prove the coordination layer works before touching LLMs or git. Build Python project structure, SwarmConfig dataclass with env var interpolation, SQLite WAL message board (7 channels, self-referencing posts, cursor-based read_new), outcomes table schema. ~500 LOC. Milestone: pytest swarm/tests/test_board.py passes concurrent read/write tests, config loads from swarm.yaml.
<!-- SECTION:DESCRIPTION:END -->
