---
id: BETH-10.5
title: 'Phase 4: Intelligence - Model routing + outcome learning + cost guardrails'
status: Done
assignee: []
created_date: '2026-03-15 06:42'
updated_date: '2026-03-16 20:23'
labels: []
dependencies: []
parent_task_id: BETH-10
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Objective: System gets smarter and cheaper over time. Build outcome recording after every merge, suggest_model() based on historical success, per-agent model routing config, token budget tracking (per-task, per-epic, daily kill switch), cost estimation via pricing table, context window management with tiktoken. ~500 LOC. Milestone: After 10+ tasks, suggest_model() returns non-default recommendation; cost guardrails halt budget-exceeding worker.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Outcomes table captures: agent, model, tokens_in, tokens_out, duration, success, task_type
- [ ] #2 suggest_model() only recommends models with >=5 historical data points (no premature optimization)
- [ ] #3 Per-task budget stops runaway worker before burning entire context window
- [ ] #4 Per-epic budget pauses dispatch (not kills workers) when threshold crossed
- [ ] #5 Daily kill switch halts all work; swarm resume unpauses
- [ ] #6 Token counting matches actual API usage within +-5%
- [ ] #7 Cost estimation converts token counts to USD via per-model pricing table in config
- [ ] #8 Context window management: tiktoken counting, compaction trigger at threshold
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Depends on: BETH-10.4 (Phase 3). Cannot start until Phase 3 milestone passes.
<!-- SECTION:NOTES:END -->
