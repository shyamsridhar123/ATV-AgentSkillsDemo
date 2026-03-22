---
id: BETH-62
title: 'ADO Sync: Hook up Azure OpenAI for smart story formatter'
status: Done
assignee: []
created_date: '2026-03-22 15:29'
updated_date: '2026-03-22 15:58'
labels: []
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Connect an Azure OpenAI resource to the story formatter. Currently falls back to offline formatter (format_story_offline). Config already accepts AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_DEPLOYMENT, AZURE_OPENAI_API_KEY. Needs: provision or reuse an AOAI resource, set env vars, verify format_story() produces proper persona-based descriptions and Fibonacci effort estimates via GPT-4o.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Azure OpenAI resource provisioned (or existing BETH-50 resource reused)
- [ ] #2 AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, AZURE_OPENAI_DEPLOYMENT set in service env
- [ ] #3 format_story() returns persona-based description ('As a [persona], I want...')
- [ ] #4 format_story() returns Fibonacci effort estimate (1/2/3/5/8/13/21)
- [ ] #5 format_story() returns improved acceptance criteria as bullet list
- [ ] #6 Graceful fallback to format_story_offline() when AOAI is unreachable
<!-- AC:END -->
