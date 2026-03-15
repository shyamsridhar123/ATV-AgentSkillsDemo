---
id: BETH-10.2
title: 'Phase 1: Single Agent Loop - LLM client + tools + worker'
status: To Do
assignee: []
created_date: '2026-03-15 06:42'
updated_date: '2026-03-15 06:45'
labels: []
dependencies: []
parent_task_id: BETH-10
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Objective: Prove one agent can receive a task, use tools to modify code, and report back. Build Azure OpenAI client with tool-use loop, 9-tool registry, agent.md parser, SKILL.md loader with enforcement map, single worker loop (load prompt → skills → tool loop → commit → post completion). ~800 LOC. Milestone: Developer agent receives 'create hello world Express server' via board, creates file, posts completion autonomously.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Agent correctly parses .github/agents/developer.agent.md YAML frontmatter + markdown body into system prompt
- [ ] #2 Agent loads vercel-react-best-practices SKILL.md when referenced in task metadata
- [ ] #3 All 9 tools functional: read_file, write_file, edit_file, run_command, list_directory, search_files, post_message, read_messages, load_skill
- [ ] #4 Tool execution sandboxed to specified working directory
- [ ] #5 Worker posts structured completion to board with files_changed metadata
- [ ] #6 Azure OpenAI client with tool-use loop: chat → tool_calls → execute → loop until stop
- [ ] #7 Skill enforcement map: agent type → auto-injected skills (same mapping as current JS hooks)
- [ ] #8 Integration test: developer agent creates file via board task and posts completion without human intervention
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Depends on: BETH-10.1 (Phase 0). Cannot start until Phase 0 milestone passes.
<!-- SECTION:NOTES:END -->
