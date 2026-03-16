---
id: BETH-36
title: Sync diverged template skills with live versions
status: Done
assignee: []
created_date: '2026-03-16 03:46'
updated_date: '2026-03-16 05:55'
labels: []
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
4 template skills in templates/.github/skills/ have diverged from their live counterparts in .github/skills/: framer-components, prd, vercel-react-best-practices, web-design-guidelines. Template versions are stale. Copy live SKILL.md files to templates.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 All 4 template skill SKILL.md files match their live counterparts
- [ ] #2 npx beth-copilot init installs current skill content
<!-- AC:END -->
