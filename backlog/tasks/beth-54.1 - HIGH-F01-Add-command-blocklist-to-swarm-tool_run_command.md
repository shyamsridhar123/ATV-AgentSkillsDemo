---
id: BETH-54.1
title: '[HIGH] F01: Add command blocklist to swarm tool_run_command'
status: Done
assignee: []
created_date: '2026-03-18 06:09'
updated_date: '2026-03-18 14:46'
labels: []
dependencies: []
parent_task_id: BETH-54
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
swarm/swarm/tools.py tool_run_command executes arbitrary shell commands with shell=True from LLM output. Add a dangerous-command blocklist to reduce RCE surface from prompt injection. Long-term: container sandboxing.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Blocklist rejects rm -rf /, curl|sh, wget|sh, nc/ncat, chmod 777, mkfs, dd if= patterns
- [ ] #2 Blocklist applied BEFORE subprocess.run — rejected commands return error JSON, never execute
- [ ] #3 Unit tests cover each blocked pattern and verify clean commands pass through
- [ ] #4 Blocklist is configurable via swarm.yaml (optional allowed_commands or blocked_patterns)
- [ ] #5 Existing passing swarm tests still pass
<!-- AC:END -->
