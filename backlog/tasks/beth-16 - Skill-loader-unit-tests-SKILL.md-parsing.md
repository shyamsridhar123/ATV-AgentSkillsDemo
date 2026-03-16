---
id: BETH-16
title: Skill loader unit tests (SKILL.md parsing)
status: Done
assignee: []
created_date: '2026-03-15 07:00'
updated_date: '2026-03-15 15:42'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Objective: Unit-test the core skill loader that parses SKILL.md files into typed SkillDefinition objects. Tests loadSkills, loadSkill, getSkillById, extractTriggers, buildTriggerMap, findMatchingSkills. Validates frontmatter parsing, trigger extraction, error handling for missing files/dirs. File: src/core/skills/loader.test.ts (20 tests). Assigned to: tester. Parent: BETH-8
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 loadSkills: loads all skills from templates directory, returns typed SkillDefinition array with zero errors
- [ ] #2 loadSkill: parses YAML frontmatter (name, description) and body content from SKILL.md
- [ ] #3 extractTriggers: extracts trigger phrases from 'Triggers on:' patterns in descriptions
- [ ] #4 buildTriggerMap + findMatchingSkills: maps triggers to skills and resolves fuzzy matches
- [ ] #5 Error cases: non-existent directory, missing SKILL.md, malformed frontmatter
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified: 20/20 tests pass. loadSkills, loadSkill, extractTriggers, buildTriggerMap, findMatchingSkills all working.

Existing 20 loader tests verified passing. Mapping completeness adds SKILL.md content quality checks (100+ chars, valid header format)
<!-- SECTION:NOTES:END -->
