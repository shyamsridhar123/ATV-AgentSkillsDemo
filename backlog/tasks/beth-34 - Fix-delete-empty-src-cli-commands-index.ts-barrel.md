---
id: BETH-34
title: Fix/delete empty src/cli/commands/index.ts barrel
status: Done
assignee: []
created_date: '2026-03-16 03:44'
updated_date: '2026-03-16 05:53'
labels: []
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
All exports commented out. Re-exported from src/index.ts as public API surface. CLI commands loaded dynamically by bin/cli.js, not through this barrel. Either uncomment exports to make functional, or delete file and remove from src/index.ts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Either: exports uncommented and barrel functional, OR file deleted and re-export from src/index.ts removed
- [ ] #2 No import errors
- [ ] #3 npm run build succeeds
- [ ] #4 npm test passes
- [ ] #5 CLI commands still work
<!-- AC:END -->
