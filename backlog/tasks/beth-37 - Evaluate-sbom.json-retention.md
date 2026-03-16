---
id: BETH-37
title: Evaluate sbom.json retention
status: Done
assignee: []
created_date: '2026-03-16 03:46'
updated_date: '2026-03-16 06:35'
labels: []
dependencies: []
priority: low
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
sbom.json (1105 lines) is checked into git. SBOMs are typically generated artifacts, not source. Evaluate whether it should be gitignored and generated on demand (npm sbom), or kept for compliance. If generated: add to .gitignore, add npm script to regenerate.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Decision documented: keep or remove from git
- [ ] #2 If removed: .gitignore updated, npm script added for regeneration
- [ ] #3 If kept: comment added explaining why it's tracked
<!-- AC:END -->
