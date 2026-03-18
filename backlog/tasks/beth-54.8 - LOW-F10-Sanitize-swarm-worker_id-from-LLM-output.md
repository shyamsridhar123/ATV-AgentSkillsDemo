---
id: BETH-54.8
title: '[LOW] F10: Sanitize swarm worker_id from LLM output'
status: To Do
assignee: []
created_date: '2026-03-18 06:11'
labels: []
dependencies: []
parent_task_id: BETH-54
priority: low
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
swarm/swarm/worker.py constructs worker_id from task.agent_role and task.task_id which come from LLM decomposition. Used in git branch names and directory names. Special characters could cause issues.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 worker_id is sanitized with regex to allow only alphanumeric, dash, underscore
- [ ] #2 Special characters (spaces, slashes, dots, backticks) are stripped
- [ ] #3 Empty worker_id after sanitization falls back to a safe default
- [ ] #4 Unit test covers special character input (../../, `cmd`, spaces, unicode)
<!-- AC:END -->
