---
id: BETH-54.6
title: '[MED] F06: Document third-party MCP servers and data exposure'
status: Done
assignee: []
created_date: '2026-03-18 06:11'
updated_date: '2026-03-18 16:57'
labels: []
dependencies: []
parent_task_id: BETH-54
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
MCP config templates include deepwiki (https://mcp.deepwiki.com/mcp) and context7 (https://mcp.context7.com/mcp) — third-party HTTP endpoints that receive user queries. Also npx-based MCP servers fetch remote code. Users deserve transparent disclosure.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 mcp.json.example has inline comments documenting each third-party MCP server and what data it receives
- [ ] #2 docs/MCP-SETUP.md updated with security considerations section listing all external endpoints
- [ ] #3 deepwiki and context7 entries clearly labeled as OPTIONAL third-party services
- [ ] #4 Comment notes that npx MCP servers fetch and execute remote code from npm registry
<!-- AC:END -->
