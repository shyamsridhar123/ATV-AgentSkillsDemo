---
id: BETH-25
title: Fix tester.agent.md template beads references
status: Done
assignee: []
created_date: '2026-03-16 03:11'
updated_date: '2026-03-16 05:17'
labels: []
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
templates/.github/agents/tester.agent.md still references 'dual tracking (beads + Backlog.md)' and tells agents to close with 'npx beth-copilot close <id>' — a deprecated command. The live version is correct; the template lags behind.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 templates/.github/agents/tester.agent.md updated: no beads references
- [ ] #2 References to 'npx beth-copilot close' replaced with 'backlog task edit <id> -s Done'
- [ ] #3 Template matches live .github/agents/tester.agent.md
<!-- AC:END -->
