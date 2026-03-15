---
id: BETH-10.5
title: 'Phase 4: Intelligence - Model routing + outcome learning + cost guardrails'
status: To Do
assignee: []
created_date: '2026-03-15 06:42'
labels: []
dependencies: []
parent_task_id: BETH-10
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Objective: System gets smarter and cheaper over time. Build outcome recording after every merge, suggest_model() based on historical success, per-agent model routing config, token budget tracking (per-task, per-epic, daily kill switch), cost estimation via pricing table, context window management with tiktoken. ~500 LOC. Milestone: After 10+ tasks, suggest_model() returns non-default recommendation; cost guardrails halt budget-exceeding worker.
<!-- SECTION:DESCRIPTION:END -->
