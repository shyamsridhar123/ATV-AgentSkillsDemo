---
id: BETH-24
title: Fix duplicate tools in beth.agent.md
status: To Do
assignee: []
created_date: '2026-03-16 03:11'
updated_date: '2026-03-16 04:45'
labels: []
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The live .github/agents/beth.agent.md has every GitHub MCP tool listed TWICE in the tools array — 60+ duplicate entries. The template version uses clean shorthand ['vscode', 'execute', ...] which is correct. The live version needs to match the template pattern or at minimum deduplicate.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 No duplicate tool entries in .github/agents/beth.agent.md tools array
- [ ] #2 Tools array uses category shorthand where possible (matching template pattern)
- [ ] #3 Agent still functions correctly with all needed tool access
<!-- AC:END -->
