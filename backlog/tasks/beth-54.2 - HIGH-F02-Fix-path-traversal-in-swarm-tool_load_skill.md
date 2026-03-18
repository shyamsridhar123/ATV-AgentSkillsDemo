---
id: BETH-54.2
title: '[HIGH] F02: Fix path traversal in swarm tool_load_skill'
status: To Do
assignee: []
created_date: '2026-03-18 06:09'
labels: []
dependencies: []
parent_task_id: BETH-54
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
swarm/swarm/tools.py tool_load_skill resolves paths relative to repo_root but does NOT call _resolve_sandboxed() like all other file tools. LLM can read arbitrary files (../../etc/passwd). 3-line fix — add the same sandbox guard used by tool_read_file.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 tool_load_skill calls _resolve_sandboxed() before reading any file
- [ ] #2 Attempting to load ../../etc/passwd returns error JSON, not file contents
- [ ] #3 Attempting to load /etc/shadow returns error JSON
- [ ] #4 Attempting to load a valid skill path (.github/skills/prd/SKILL.md) still works
- [ ] #5 Unit test covers path traversal with ../, absolute paths, and symlink attempts
<!-- AC:END -->
