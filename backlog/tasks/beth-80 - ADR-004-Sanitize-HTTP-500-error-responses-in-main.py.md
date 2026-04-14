---
id: BETH-80
title: 'ADR-004: Sanitize HTTP 500 error responses in main.py'
status: To Do
assignee: []
created_date: '2026-04-01 19:22'
labels: []
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Replace HTTPException(status_code=500, detail=str(e)) with a generic error message. Log full error server-side, return safe summary to caller. Prevents secret leakage via error responses. Ref: ADR-004
<!-- SECTION:DESCRIPTION:END -->
