# Test Quality Gate Plan

> *"I've seen this play before. Projects that skip test discipline early pay for it in compound interest later."*

**Status:** Complete (Phase 1-5)  
**Date:** March 8, 2026  
**Author:** Beth (Orchestrator)

---

## Problem Statement

The "Land the Plane" process currently has no enforcement that work has been tested. There is:

- **Zero test infrastructure** — No Vitest, Jest, Playwright, or test scripts in `package.json`
- **Zero test files** — No `*.test.*`, `*.spec.*`, or `__tests__/` directories
- **No test dependency on issues** — Issues can be closed without any tests existing
- **No test reporting** — No documentation of what was tested, how to reproduce, or results

The tester agent references Vitest and Playwright in its expertise but has nothing installed to run.

---

## Goals

1. Every issue/feature/epic MUST have associated tests (unit, UX, security) before it can close
2. The "Land the Plane" process MUST run all tests and document results
3. Test results, reproduction steps, and commit info MUST be captured in a markdown report
4. Test failures MUST block landing — no exceptions

---

## Phase 1: Test Infrastructure

Install and configure the test tooling foundation.

### Dependencies to Install

| Package | Purpose |
|---------|---------|
| `vitest` | Unit + component test runner |
| `@testing-library/react` | Component rendering/assertions |
| `@testing-library/jest-dom` | DOM matchers |
| `@testing-library/user-event` | User interaction simulation |
| `jsdom` | Browser environment for Vitest |
| `playwright` | E2E / UX flow tests |
| `@playwright/test` | Playwright test runner |

### Config Files to Create

| File | Purpose |
|------|---------|
| `vitest.config.ts` | Unit/component test configuration |
| `playwright.config.ts` | E2E test configuration |
| `vitest.setup.ts` | Test setup (jest-dom matchers, mocks) |

### Scripts to Add (package.json)

```json
{
  "scripts": {
    "test": "vitest run",
    "test:unit": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "test:security": "vitest run --config vitest.security.config.ts",
    "test:gate": "node scripts/quality-gate.mjs",
    "test:coverage": "vitest run --coverage"
  }
}
```

### Directory Structure

```
__tests__/
├── unit/           # Unit tests (Vitest + RTL)
│   └── components/ # Component-level tests
├── e2e/            # End-to-end tests (Playwright)
│   └── flows/      # User journey tests
├── security/       # Security-focused tests
│   └── owasp/      # OWASP-aligned checks
└── fixtures/       # Shared test data/mocks
```

### Smoke Test

Create a minimal test that verifies the infrastructure works before building anything else.

---

## Phase 2: Enforce Test Creation as Issue Dependencies

### The Rule

Every issue, feature, or epic MUST have test subtask(s) created as part of the work breakdown. Tests are not optional — they are structural dependencies.

### Dependency Chain

```
Issue Created
  ├── Implementation subtask
  ├── Unit test subtask (depends on implementation)
  ├── UX/E2E test subtask (depends on implementation)
  ├── Security test subtask (depends on implementation)
  └── All tests must PASS before issue can close
```

### Epic Creation Pattern (Updated)

```bash
# 1. Create the epic
bd create "Feature X" --type epic -p 1

# 2. Implementation
bd create "Implement Feature X" --parent <epic-id>

# 3. MANDATORY test subtasks
bd create "Unit tests for Feature X" --parent <epic-id> --deps "<impl-id>"
bd create "E2E tests for Feature X" --parent <epic-id> --deps "<impl-id>"
bd create "Security tests for Feature X" --parent <epic-id> --deps "<impl-id>"
```

### Files to Modify

| File | Change |
|------|--------|
| `AGENTS.md` | Add "Test Requirements" section — every issue MUST have test subtasks |
| `.github/agents/beth.agent.md` | Update Epic Creation Pattern to auto-create test subtasks; update Landing the Plane |
| `.github/agents/developer.agent.md` | Add rule: implementation is not "done" until test files exist |
| `.github/agents/tester.agent.md` | Add test creation templates and standards per test type |
| `.github/agents/security-reviewer.agent.md` | Add security test creation requirements (OWASP-aligned) |

---

## Phase 3: Updated "Land the Plane" Procedure

The current landing procedure gains enforced quality gates.

### Updated Workflow

```
1. Run ALL test suites
   - npm run test:unit
   - npm run test:e2e
   - npm run test:security

2. Capture results
   - Pass/fail per test
   - Coverage metrics
   - Error details for failures

3. Generate test report markdown
   - Written to docs/test-reports/
   - Named: test-report-{YYYY-MM-DD}-{commit-short}.md

4. Evaluate results
   - ALL tests must pass to proceed
   - If failures exist → create follow-up issues, DO NOT close parent issue

5. Close beads issues (only if tests pass)

6. Create follow-up issues for any failures or gaps

7. Update Backlog.md with summary

8. Commit everything (test report + code + config)
   git add -A
   git commit -m "description of work"
   git pull --rebase
   git push

9. Verify push succeeded
```

### Blocking Rules

- **Cannot close an issue** if its test subtasks haven't passed
- **Cannot land the plane** if any test suite has failures
- **Test failures create new issues** — they don't get ignored
- **Test reports are committed** — they're part of the git history

---

## Phase 4: Test Report Template

### Location

```
docs/test-reports/test-report-{YYYY-MM-DD}-{commit-short}.md
```

### Template

```markdown
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
  - `__tests__/unit/{component}.test.tsx`
  - `__tests__/e2e/{flow}.spec.ts`
  - `__tests__/security/{check}.test.ts`
- **Status:** ✅ All passed / ❌ Failures (list below)
- **Reproduction:**
  ```bash
  npm test:unit -- --reporter=verbose {test-file}
  npm test:e2e -- --grep="{test-name}"
  npm test:security -- --reporter=verbose {test-file}
  ```

## Failed Tests (if any)

| Test | File | Error | Follow-up Issue |
|------|------|-------|-----------------|
| ... | ... | ... | bd-XXX |

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
```

---

## Phase 5: Quality Gate Script (Optional)

A single `pnpm test:gate` command that automates the entire quality gate:

1. Runs all test suites (unit, e2e, security)
2. Collects results into structured data
3. Generates the markdown report automatically
4. Writes to `docs/test-reports/`
5. Exits non-zero if anything fails

**Implementation:** `scripts/quality-gate.mjs`

This makes "land the plane" mechanical — run one command, get a report, commit it.

---

## Execution Order

| Step | Phase | What | Blocks |
|------|-------|------|--------|
| 1 | Infrastructure | Install Vitest + RTL + Playwright, configure, verify | Everything |
| 2 | Infrastructure | Create test directory structure + smoke test | Steps 3-8 |
| 3 | Workflow | Update AGENTS.md — test requirements + updated landing procedure | — |
| 4 | Workflow | Update beth.agent.md — epic pattern + landing procedure | — |
| 5 | Workflow | Update developer.agent.md — test co-creation rule | — |
| 6 | Workflow | Update tester.agent.md — test creation standards per type | — |
| 7 | Workflow | Update security-reviewer.agent.md — security test requirements | — |
| 8 | Template | Create report template in `docs/test-reports/` | — |
| 9 | Automation | Build `test:gate` script | Steps 1-2 |

Steps 3–7 can be done in parallel. Steps 1–2 are the foundation everything else depends on.

---

## Test Standards Per Type

### Unit Tests (Vitest + RTL)

- One test file per component/module
- Test rendering, interactions, state changes, edge cases
- Mock external dependencies (API calls, context providers)
- Naming: `{component}.test.tsx` or `{module}.test.ts`
- Minimum: happy path + error state + edge case

### E2E/UX Tests (Playwright)

- One spec per user flow
- Test complete journeys (navigation, interaction, outcome)
- Validate accessibility basics (focus management, ARIA)
- Naming: `{flow-name}.spec.ts`
- Minimum: critical path + alternate path + error recovery

### Security Tests

- OWASP-aligned checks per feature
- XSS prevention (input sanitization, output encoding)
- Access control (persona permissions, route guards)
- Data exposure (sensitive data in responses, console, DOM)
- Naming: `{feature}-security.test.ts`
- Minimum: auth/authz check + input validation + data exposure scan

---

## Success Criteria

- [ ] `npm test:unit` runs and passes
- [ ] `npm test:e2e` runs and passes
- [ ] `npm test:security` runs and passes
- [ ] Every new issue has test subtasks in beads
- [ ] Landing the plane generates a test report
- [ ] Test reports are committed to git
- [ ] Test failures block issue closure
- [ ] Agent instructions reflect the new requirements
