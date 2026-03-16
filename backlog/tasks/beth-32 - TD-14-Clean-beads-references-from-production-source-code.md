---
id: BETH-32
title: 'TD-14: Clean beads references from production source code'
status: To Do
assignee: []
created_date: '2026-03-16 03:13'
labels: []
dependencies: []
priority: low
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Production code in src/ still contains beads artifacts: close.ts (handled by TD-04), pre-push-guard.ts line 226 references '.beads/hooks/pre-push', land.ts line 211 returns 'beads removed' stub message. These are ghost references to a dead system in shipped code.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 pre-push-guard.ts: .beads/hooks/pre-push reference removed or updated
- [ ] #2 land.ts: 'beads removed' stub message cleaned up
- [ ] #3 grep -rn beads src/ --include=*.ts returns zero results (excluding close.ts if TD-04 not done yet)
<!-- AC:END -->
