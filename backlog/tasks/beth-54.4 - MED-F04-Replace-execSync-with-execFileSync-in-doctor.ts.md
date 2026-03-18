---
id: BETH-54.4
title: '[MED] F04: Replace execSync with execFileSync in doctor.ts'
status: Done
assignee: []
created_date: '2026-03-18 06:10'
updated_date: '2026-03-18 16:57'
labels: []
dependencies: []
parent_task_id: BETH-54
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
src/cli/commands/doctor.ts checkCli() uses execSync with string interpolation: execSync(`${command} --version`). Currently safe (hardcoded commands) but fragile pattern. Switch to execFileSync to eliminate shell interpretation.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 All execSync calls in doctor.ts replaced with execFileSync
- [ ] #2 execFileSync(command, ['--version']) pattern used instead of template literals
- [ ] #3 doctor command still correctly detects backlog CLI presence/absence
- [ ] #4 doctor --fix still works
- [ ] #5 All existing doctor tests pass
<!-- AC:END -->
