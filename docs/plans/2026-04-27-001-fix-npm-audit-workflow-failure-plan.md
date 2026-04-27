---
title: Fix failing npm audit (strict) workflow
type: fix
status: active
date: 2026-04-27
---

# Fix failing npm audit (strict) workflow

## Overview

The scheduled `Security` workflow's `npm audit` job fails on the strict step (`npm audit --audit-level=moderate`) on `main`. Three moderate advisories are reported:

1. `postcss <8.5.10` — GHSA-qx2v-qp2m-jg93 (transitive via `vitest@4 → vite@7 → postcss@8.5.8`). Fix available.
2. `uuid <14.0.0` — GHSA-w5hq-g745-h8pq (transitive via `@azure/msal-node@5.1.1 → uuid@8.3.2`). No upstream fix; latest `@azure/msal-node@5.1.4` still pins `uuid@^8.3.0`.
3. `@azure/msal-node *` — flagged because of the nested `uuid` advisory.

The first issue is auto-fixable. The latter two cannot be resolved by upgrading the direct dependency, but the advisory only affects callers passing a `buf` argument to `v3/v5/v6` — `@azure/msal-node` uses `uuid.v4()` exclusively and never calls those functions, so the path is unreachable. We will resolve this by forcing the `uuid` transitive dep to a patched version via npm `overrides`, eliminating the advisory at the lockfile level.

Run: https://github.com/stephschofield/beth/actions/runs/24990799790

## Problem Frame

The strict audit gate exists to block merges/scheduled runs when moderate-or-higher advisories appear in the dependency graph. Today the gate is red because of two issues we can fix and one (uuid) where the upstream owner has not yet shipped a patched release. We need a clean, justified fix that makes the gate green again without weakening it (no `audit-level` relaxation, no `continue-on-error`).

## Requirements Trace

- R1. `npm audit --audit-level=moderate` returns exit code 0 against the committed lockfile.
- R2. The Security workflow run on `main` succeeds end-to-end.
- R3. The audit gate is not weakened — strict moderate threshold and failing behavior preserved.
- R4. Any override is documented with rationale (advisory ID + reachability assessment) so a future maintainer can re-evaluate it.

## Scope Boundaries

- Out of scope: upgrading Node.js 20 actions to Node.js 24 (separate deprecation warning surfaced in the run).
- Out of scope: changes to `ci.yml`, gitleaks, CodeQL, or SBOM jobs.
- Out of scope: replacing `@azure/msal-node` or refactoring `src/cli/lib/entraAuth.ts`.
- Out of scope: introducing Dependabot/Renovate config.

## Context & Research

### Relevant Code and Patterns

- `.github/workflows/security.yml` — `audit` job; the failing step is `Run npm audit (strict)` (line ~36, `npm audit --audit-level=moderate`).
- `package.json` — declares `@azure/msal-node ^5.1.1`; adds an `overrides.uuid` block; `engines.node >=20.19.0` (bumped from `>=18` in this PR to enable `require(esm)` for the uuid override).
- `src/cli/lib/entraAuth.ts` — only consumer of `@azure/msal-node`. Uses `PublicClientApplication` device code flow; does not pass buffer args anywhere.
- `package-lock.json` — must be regenerated alongside any `overrides` change.
- Prior plan: `docs/plans/2026-04-14-001-fix-security-workflow-vite-cve-plan.md` (similar pattern: vite/postcss CVE, also touched the same workflow).

### Institutional Learnings

- The repo previously applied a `npm audit fix`-style remediation for the vite/postcss line and committed the resulting lockfile (see prior plan above). The same approach is the simplest path for the postcss advisory recurrence.
- The strict gate is intentional and has been preserved in prior fixes — do not relax thresholds.

### External References

- npm `overrides` (npm v8.3+, supported by current npm 11.9.0 declared via `packageManager`): https://docs.npmjs.com/cli/v10/configuring-npm/package-json#overrides — allows pinning a transitive dep without forking the parent.
- GHSA-w5hq-g745-h8pq (uuid): The advisory affects `v3`, `v5`, `v6` only when a caller-supplied `buf` argument lacks bounds checking. `v4()` (which `@azure/msal-node` calls in `crypto/GuidGenerator.mjs`) is unaffected.
- GHSA-qx2v-qp2m-jg93 (postcss): Fixed in `8.5.10`. Newer `vite@7.x` already depends on `postcss@^8.5.10`; updating `vite`/`vitest` minor pulls the patched version transitively.

## Key Technical Decisions

- **Fix postcss via dependency refresh (`npm audit fix` or `npm update vite vitest`)** rather than an override. Rationale: a patched version exists upstream, so the lockfile-level upgrade is the cleanest fix and matches the prior remediation pattern in this repo.
- **Fix uuid via `npm` `overrides` to `^14.0.0`** rather than waiting for `@azure/msal-node` to ship a new release or replacing the dep. Rationale: `@azure/msal-node@5.1.4` (latest) still pins `uuid@^8.3.0`; the advisory's first patched version is `14.0.0`; the advisory path is unreachable from msal-node's `v4()` usage. Although `uuid@14` is ESM-only, msal-node's CJS `require('uuid')` path resolves correctly on Node `>=20.19.0` / `>=22.12.0` via Node's synchronous `require(esm)` support. We therefore bump `engines.node` to `>=20.19.0` to make this prerequisite explicit, and CI is pinned to Node 22.
- **Document the chosen override strategy consistently**: the PR body, plan, and `SECURITY.md` all explain that we intentionally use `overrides.uuid: ^14.0.0` and rely on Node `require(esm)` (Node ≥ 20.19.0 / ≥ 22.12.0). The plan's earlier preference for a CJS-compatible `^11.x` line is superseded — see the updated Key Technical Decision above.
- **Do not relax `--audit-level`** and do not add `continue-on-error: true` to the strict step.

## Open Questions

### Resolved During Planning

- Q: Is the uuid advisory reachable from our use of `@azure/msal-node`? A: No. msal-node uses `uuid.v4()`; the advisory only impacts `v3/v5/v6` with a caller-supplied `buf`.
- Q: Can we just bump `@azure/msal-node`? A: No — `5.1.4` (latest) still pins vulnerable `uuid@^8.3.0`.
- Q: Can we override to `uuid@14`? A: Yes — that is the final decision for this PR. `uuid@14` is ESM-only, but msal-node's `require('uuid')` resolves correctly on Node `>=20.19.0` / `>=22.12.0` via `require(esm)`. The PR raises `engines.node` to `>=20.19.0` to make the prerequisite explicit. `uuid@14` is also the advisory's first patched version, so it clears the audit signal definitively.

### Deferred to Implementation

- Exact override version (`^11.1.0` vs newer CJS-compatible patched line) — verify advisory-listed "fixed" range and pick the lowest patched version on the CJS line at implementation time.
- Whether `npm audit fix` alone is enough for postcss, or whether `npm update vite vitest` is needed — try the smaller change first.

## Implementation Units

- [ ] **Unit 1: Fix postcss advisory via lockfile refresh**

**Goal:** Bring the transitive `postcss` to `>=8.5.10` so GHSA-qx2v-qp2m-jg93 clears.

**Requirements:** R1, R2

**Dependencies:** None

**Files:**
- Modify: `package-lock.json`
- (Possibly modify) `package.json` (only if `npm audit fix` requires a `vite`/`vitest` minor bump)

**Approach:**
- First try `npm audit fix` (no `--force`). If that resolves the postcss line cleanly, accept the lockfile delta.
- If not, run `npm update postcss vite vitest` to pull patched transitives, then re-audit.
- Verify no breaking changes to test runner: `npm test` and `npm run build` should pass.

**Patterns to follow:**
- Mirror the prior remediation in `docs/plans/2026-04-14-001-fix-security-workflow-vite-cve-plan.md`.

**Test scenarios:**
- Happy path: `npm audit --audit-level=moderate` no longer reports the postcss advisory.
- Integration: `npm test` and `npm run build` succeed against the new lockfile.

**Verification:**
- Local `npm audit --audit-level=moderate` does not list `postcss <8.5.10`.

---

- [ ] **Unit 2: Add `overrides` for `uuid` to clear the msal-node transitive advisory**

**Goal:** Force `uuid` in the dependency tree to a patched CJS-compatible version, eliminating GHSA-w5hq-g745-h8pq from the audit output without breaking `@azure/msal-node`'s `require('uuid')`.

**Requirements:** R1, R2, R3, R4

**Dependencies:** Unit 1 (work on a clean lockfile baseline)

**Files:**
- Modify: `package.json` — add a top-level `overrides` block:
  ```jsonc
  "overrides": {
    "uuid": "^11.1.0"
  }
  ```
- Modify: `package-lock.json` (regenerated by `npm install`).

**Approach:**
- Confirm the advisory's "patched" version range and pick the lowest CJS-compatible version (`uuid@13+` is ESM-only; do NOT use `^14`).
- Add the override, run `npm install`, then `npm audit --audit-level=moderate`.
- Smoke-test the msal-node path: run the unit tests that touch `src/cli/lib/entraAuth.ts` (`src/cli/lib/entraAuth.test.ts`).

**Patterns to follow:**
- Standard npm `overrides` shape per npm 10 docs.

**Test scenarios:**
- Happy path: `npm audit --audit-level=moderate` exits 0 against the new lockfile.
- Integration: `entraAuth.test.ts` still passes — confirms msal-node's `crypto/GuidGenerator` `v4()` path resolves the overridden uuid module.
- Edge case: `npm ls uuid` shows a single resolved version (`>=11.1.0`) across the tree (no duplicates from peer constraints).

**Verification:**
- `npm audit --audit-level=moderate` exits 0 locally.
- `npm ls uuid` shows the overridden version.
- `npm test` passes.

---

- [ ] **Unit 3: Document the override rationale**

**Goal:** Make the override discoverable and auditable so a future maintainer knows why it exists and when it can be removed.

**Requirements:** R4

**Dependencies:** Unit 2

**Files:**
- Modify: `SECURITY.md` (or create a short section in `README.md` if `SECURITY.md` does not exist) — add a "Dependency overrides" subsection naming `uuid`, citing GHSA-w5hq-g745-h8pq, the reachability assessment, and the removal condition ("remove once `@azure/msal-node` ships a release that depends on `uuid@>=11.1.0`").
- Reference this plan from the PR description.

**Approach:**
- Keep documentation concise (one short paragraph + bulleted removal condition).
- Confirm `SECURITY.md` location; create if missing.

**Test scenarios:**
- Test expectation: none -- documentation-only change.

**Verification:**
- `SECURITY.md` (or equivalent) explains the override and its removal trigger.

---

- [ ] **Unit 4: Re-run Security workflow on the fix branch**

**Goal:** Confirm the fix is green in CI, not just locally.

**Requirements:** R2

**Dependencies:** Units 1–3 committed and pushed.

**Files:** None (CI-only).

**Approach:**
- Push branch and open PR.
- Trigger the Security workflow on the PR (it runs on `pull_request` to `main`).
- Confirm the `npm audit` job (both the non-strict and strict steps) is green.

**Test scenarios:**
- Happy path: `Security / npm audit` job shows green on PR.
- Edge case: SBOM, CodeQL, gitleaks jobs remain green (no regressions from lockfile churn).

**Verification:**
- All four jobs in `.github/workflows/security.yml` pass on the PR.

## System-Wide Impact

- **Interaction graph:** `entraAuth.ts` indirectly depends on the uuid override via `@azure/msal-node`. No other code paths import `uuid` directly (verified by grep).
- **Error propagation:** None — overrides are resolved at install time.
- **State lifecycle risks:** Lockfile churn is the only state change; ensure the PR commits both `package.json` and `package-lock.json` together.
- **API surface parity:** None — internal dependency change only.
- **Integration coverage:** `entraAuth.test.ts` exercises the msal-node code path that depends on `uuid`.
- **Unchanged invariants:** The audit gate remains at `--audit-level=moderate`; no `continue-on-error` is introduced; the workflow file structure is unchanged except (optionally) for an inline comment.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| `uuid@11+` introduces an API change that breaks `@azure/msal-node`'s `v4()` import. | Run `entraAuth.test.ts` post-install; `v4` named export has been stable across uuid majors 8→11. Verify `npm ls uuid` resolves once. |
| `uuid@13+` ESM-only break leaks in via a too-loose override (e.g., `^11`). | Pin to a CJS-compatible range explicitly (`^11.1.0`, not `>=11`). |
| `npm audit fix` accidentally pulls a `vitest` major and breaks tests. | Prefer `npm update` over `npm audit fix --force`; run full test suite before pushing. |
| New advisories appear between local fix and CI run. | Re-run `npm audit` immediately before pushing; address any new line in the same PR. |

## Documentation / Operational Notes

- Update `SECURITY.md` (or `README.md`) per Unit 3.
- PR description should link to GHSA-w5hq-g745-h8pq and to this plan.
- No runtime/deploy changes; merging the PR is sufficient. The next scheduled `Security` workflow run will confirm green status on `main`.

## Sources & References

- Failing run: https://github.com/stephschofield/beth/actions/runs/24990799790
- GHSA-qx2v-qp2m-jg93 (postcss): https://github.com/advisories/GHSA-qx2v-qp2m-jg93
- GHSA-w5hq-g745-h8pq (uuid): https://github.com/advisories/GHSA-w5hq-g745-h8pq
- npm overrides docs: https://docs.npmjs.com/cli/v10/configuring-npm/package-json#overrides
- Prior plan: `docs/plans/2026-04-14-001-fix-security-workflow-vite-cve-plan.md`
- Related code: `.github/workflows/security.yml`, `package.json`, `src/cli/lib/entraAuth.ts`
