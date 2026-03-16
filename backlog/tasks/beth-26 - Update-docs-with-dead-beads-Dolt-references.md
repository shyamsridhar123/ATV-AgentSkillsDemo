---
id: BETH-26
title: Update docs with dead beads/Dolt references
status: Done
assignee: []
created_date: '2026-03-16 03:12'
updated_date: '2026-03-16 05:49'
labels: []
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
4 docs still reference the deprecated beads/Dolt tracking system: DOCKER-SWARM.md (4 refs including a 'Beads Integration' section), SWARM-ARCHITECTURE.md (5 refs), quality-gate-plan.md (2 refs to 'bd' commands), CLI-IMPLEMENTATION-PLAN.md (2 refs). All should reference Backlog.md CLI instead.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 docs/DOCKER-SWARM.md: 'Beads Integration' section updated to Backlog.md CLI
- [ ] #2 docs/SWARM-ARCHITECTURE.md: beads/Dolt references updated or marked as historical
- [ ] #3 docs/quality-gate-plan.md: 'bd' commands replaced with 'backlog task' equivalents
- [ ] #4 docs/CLI-IMPLEMENTATION-PLAN.md: beads init references updated
- [ ] #5 grep -r 'beads' docs/ returns zero results (or only clearly-marked historical references)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Updated SWARM-ARCHITECTURE.md (surviving doc). 3 other docs (DOCKER-SWARM, CLI-IMPLEMENTATION-PLAN, quality-gate-plan) deferred to BETH-35 archive.
<!-- SECTION:NOTES:END -->
