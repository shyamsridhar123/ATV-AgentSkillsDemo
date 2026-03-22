---
id: BETH-64
title: 'PRD: ADO Sync self-service — per-project Entra auth + org selection'
status: Done
assignee: []
created_date: '2026-03-22 16:24'
updated_date: '2026-03-22 16:44'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create a comprehensive PRD for productizing ado-sync as a self-service feature integrated into beth-copilot CLI. Key requirements: (1) Per-project config, not global/system-wide. (2) Entra ID interactive login. (3) ADO org/project selection after auth. (4) Re-configurable via npx beth-copilot set-ado-org. (5) Integrated into beth-copilot init flow. Phase 2 of ado-sync.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Session work: Fixed SubagentStart/SubagentStop hooks — node path was bare 'node' which fails in /bin/sh (nvm not on PATH). Updated skill-enforcement.json to use absolute nvm path. Added memory note for future session startup checks.
<!-- SECTION:NOTES:END -->
