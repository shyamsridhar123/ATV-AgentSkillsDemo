---
id: BETH-10.2
title: 'Phase 1: Single Agent Loop - LLM client + tools + worker'
status: To Do
assignee: []
created_date: '2026-03-15 06:42'
labels: []
dependencies: []
parent_task_id: BETH-10
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Objective: Prove one agent can receive a task, use tools to modify code, and report back. Build Azure OpenAI client with tool-use loop, 9-tool registry, agent.md parser, SKILL.md loader with enforcement map, single worker loop (load prompt → skills → tool loop → commit → post completion). ~800 LOC. Milestone: Developer agent receives 'create hello world Express server' via board, creates file, posts completion autonomously.
<!-- SECTION:DESCRIPTION:END -->
