# Test Report — {YYYY-MM-DD}

## Commit: {full SHA} ({branch})
## Session: {brief description of work done}

## Summary

| Type     | Total | Passed | Failed | Skipped |
|----------|-------|--------|--------|---------|
| Unit     | X     | X      | X      | X       |
| E2E/UX   | X     | X      | X      | X       |
| Security | X     | X      | X      | X       |

## Issues Tested

### {issue-id}: {title}

- **Test files:**
  - `src/__tests__/{component}.test.ts`
  - `src/{module}/{module}.test.ts`
- **Status:** ✅ All passed / ❌ Failures (list below)
- **Reproduction:**
  ```bash
  npm test -- --reporter=verbose {test-file}
  ```

## Failed Tests (if any)

| Test | File | Error | Follow-up Issue |
|------|------|-------|-----------------|
| ... | ... | ... | BETH-XXX |

## Coverage

| Metric     | Value |
|------------|-------|
| Statements | X%    |
| Branches   | X%    |
| Functions  | X%    |
| Lines      | X%    |

## Environment

- Node: {version}
- OS: {os}
- Branch: {branch}
- Commit: {full SHA}
- Date: {ISO timestamp}
