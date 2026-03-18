---
id: BETH-13
title: Disambiguation tests (overlapping skill triggers)
status: Done
assignee: []
created_date: '2026-03-15 07:00'
updated_date: '2026-03-18 17:51'
labels: []
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Objective: Verify structurally similar skill pairs can be distinguished. Tests known challenge pairs: brainstorming vs ce:brainstorm, compound-docs vs ce:compound, ce:plan vs deepen-plan, document-review vs ce:review, frontend-design vs framer-components, azure-prepare vs azure-deploy, azure-diagnostics vs azure-validate, rclone vs azure-storage. File: src/__tests__/skills/disambiguation.test.ts (28 tests). Assigned to: tester. Parent: BETH-8
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each pair confirmed to be distinct files with different content
- [ ] #2 Each skill in a pair has unique trigger patterns (natural language vs slash commands, create vs enhance, etc.)
- [ ] #3 Azure disambiguation: prepare focuses on creation, deploy on execution, diagnostics on debugging, validate on pre-deploy checks
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified: 28/28 tests pass. All 8 disambiguation pairs structurally distinct.

Existing 28 tests verified passing. Trigger coverage now validates disambiguation pairs have matching keywords in their SKILL.md content
<!-- SECTION:NOTES:END -->
