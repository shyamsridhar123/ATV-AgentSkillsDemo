---
id: BETH-61
title: 'ADO Sync: Wire up backlog watcher for auto-create'
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
Wire up the backlog watcher so task status changes auto-create ADO stories. The watcher code exists (backlog_watcher.py) and is started in the FastAPI lifespan, but needs end-to-end verification: file change detection -> parse_task_file -> format_story -> create_user_story. Test with a real task transition (backlog task edit BETH-X -s 'In Progress').
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Modifying a task file in backlog/tasks/ triggers the watcher callback within 5 seconds
- [ ] #2 Task moving to 'In Progress' creates an ADO user story (verified in ADO board)
- [ ] #3 Task moving to 'Done' resolves the linked ADO story
- [ ] #4 Duplicate detection: re-saving same task does NOT create duplicate stories
- [ ] #5 Watcher survives file rename/delete without crashing
- [ ] #6 Mapping file (.ado-sync-mappings.json) persists task-to-story links across restarts
<!-- AC:END -->
