---
id: BETH-64.1
title: 'Resolve OQ-1: Credential storage — keytar vs native CLI helpers'
status: To Do
assignee: []
created_date: '2026-03-22 16:34'
labels: []
dependencies: []
parent_task_id: BETH-64
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
BLOCKING DECISION for Phase 2a. Evaluate keytar (Node native module, needs node-gyp) vs shelling out to platform CLIs (security on macOS, secret-tool on Linux, cmdkey on Windows). Decision determines the credential storage implementation for all downstream tasks.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Decision documented in backlog/decisions/ with tradeoff analysis
- [ ] #2 Prototype of chosen approach tested on macOS and Linux
- [ ] #3 Fallback strategy defined for headless environments without keychain
- [ ] #4 npm dependency impact assessed (bundle size, native compilation requirements)
<!-- AC:END -->
