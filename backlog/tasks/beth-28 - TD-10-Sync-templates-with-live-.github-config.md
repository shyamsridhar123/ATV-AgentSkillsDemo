---
id: BETH-28
title: 'TD-10: Sync templates with live .github config'
status: To Do
assignee: []
created_date: '2026-03-16 03:12'
labels: []
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Templates (.github/ installed by npx beth-copilot init) are missing 3 files present in live .github/: copilot-mcp-config.json, dependabot.yml, pull_request_template.md. Also copilot-instructions.md has diverged (different wording, missing Installation section). Templates should be the canonical init experience.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 templates/.github/copilot-mcp-config.json added (matching .github/copilot-mcp-config.json)
- [ ] #2 templates/.github/dependabot.yml added (matching .github/dependabot.yml)
- [ ] #3 templates/.github/pull_request_template.md added (matching .github/pull_request_template.md)
- [ ] #4 templates/.github/copilot-instructions.md synced with live version
<!-- AC:END -->
