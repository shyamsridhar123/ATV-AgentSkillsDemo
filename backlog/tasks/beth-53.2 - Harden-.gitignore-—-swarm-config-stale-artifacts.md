---
id: BETH-53.2
title: Harden .gitignore — swarm config + stale artifacts
status: To Do
assignee: []
created_date: '2026-03-18 05:55'
labels: []
dependencies: []
parent_task_id: BETH-53
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Ensure root .gitignore explicitly ignores user-specific swarm config, .bs-buster state, and swarm virtual envs. Remove stale .beads comments. Document that swarm.yaml is user-provided.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Root .gitignore has entry for swarm/swarm.yaml (defense in depth with swarm/.gitignore)
- [ ] #2 Root .gitignore ignores .bs-buster/ directory
- [ ] #3 Root .gitignore ignores swarm/.venv/
- [ ] #4 Stale .beads comments removed from .gitignore
- [ ] #5 git check-ignore swarm/swarm.yaml confirms ignored
<!-- AC:END -->
