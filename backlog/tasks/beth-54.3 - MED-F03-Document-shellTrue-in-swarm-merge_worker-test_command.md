---
id: BETH-54.3
title: '[MED] F03: Document shell=True in swarm merge_worker test_command'
status: Done
assignee: []
created_date: '2026-03-18 06:10'
updated_date: '2026-03-18 16:57'
labels: []
dependencies: []
parent_task_id: BETH-54
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
swarm/swarm/git.py merge_worker runs test_command from swarm.yaml with shell=True. Lower risk (operator-controlled config) but should be documented and optionally validated.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 swarm.yaml.example documents that test_command runs with shell=True
- [ ] #2 Config loader validates test_command does not contain pipe-to-shell patterns (|sh, |bash)
- [ ] #3 Warning logged if test_command contains suspicious patterns
<!-- AC:END -->
