# Security Review: Repository Secret Scan

**Date:** March 18, 2026
**Reviewer:** Beth (AI Orchestrator)
**Scope:** Full repository scan — stephschofield/beth
**Branch at time of review:** `epic/beth-53`
**Verdict:** PASS — No secrets detected

---

## Scan Summary

| Check | Result | Details |
|-------|--------|---------|
| Hardcoded API keys / tokens | ✅ Clean | No real keys (OpenAI, GitHub PAT, AWS, Google, Slack) in source |
| Git history (secret files) | ✅ Clean | No `.env`, `.pem`, `.key`, `.p12`, `.pfx` files ever committed |
| Git history (pickaxe for `sk-`) | ✅ Clean | Only test/doc references, no real OpenAI keys |
| Private keys (PEM/RSA/DSA/EC) | ✅ Clean | Only in gitignored `.venv/` (certifi, msal — not tracked) |
| Connection strings / DB URLs | ✅ Clean | No hardcoded postgres://, redis://, mongodb://, etc. |
| npm / netrc tokens | ✅ Clean | No `.npmrc` or `.netrc` with auth tokens |
| `.env` files committed | ✅ Clean | None tracked; `.gitignore` covers `.env`, `.env.local`, `.env.*.local` |
| Config files with credentials | ✅ Clean | `.vscode/mcp.json` tracked but contains no secrets |
| Example configs | ✅ Clean | Proper placeholders (`your-resource`, `${ENV_VAR}` patterns) |
| GitHub Advanced Security | ⚠️ Not enabled | Gitleaks compensates, but GHAS push protection not active |

## Files Inspected

- `package.json` — no embedded credentials
- `.github/copilot-mcp-config.json` — public MCP URLs only
- `.github/workflows/ci.yml` — uses `${{ secrets.GITHUB_TOKEN }}` (correct)
- `.github/workflows/security.yml` — uses `${{ secrets.GITHUB_TOKEN }}` (correct)
- `.vscode/mcp.json` — npx commands and public URLs, no secrets
- `mcp.json.example` — clean template
- `swarm/swarm.yaml.example` — placeholder endpoints, env var references for keys
- `src/index.ts` — re-exports only
- `bin/cli.js` — CLI logic, no credentials
- `.gitleaks.toml` — sane allowlist (only clearly-fake doc examples)
- `.pre-commit-config.yaml` — gitleaks + detect-private-key hooks configured
- `.gitignore` — covers `.env*`, `*.db`, `swarm/.venv/`, `.dolt/`

## Existing Defenses

| Layer | Tool | Status |
|-------|------|--------|
| Pre-commit | Gitleaks v8.18.4 | ✅ Configured |
| Pre-commit | detect-private-key | ✅ Configured |
| CI/CD | Gitleaks Action v2 | ✅ Running on push + PR to main |
| CI/CD | CodeQL (JavaScript) | ✅ Running on push + PR to main |
| CI/CD | npm audit (moderate) | ✅ Running on push + PR to main |
| CI/CD | SBOM generation (CycloneDX) | ✅ Running on push + PR to main |
| Scheduled | Security workflow | ✅ Weekly (Monday 9am UTC) |
| Platform | GitHub Advanced Security | ⚠️ Not enabled |

## Recommendation

Enable **GitHub Advanced Security** (GHAS) if the plan supports it. GHAS provides push protection that blocks commits containing detected secrets *before* they reach the remote — a layer that gitleaks alone cannot provide. It also covers a broader set of secret patterns from partner integrations.

## Methodology

1. `grep` for common secret patterns (API keys, tokens, passwords, connection strings) across all tracked source files
2. `git log --diff-filter` to check for secret files ever added or deleted in history
3. `git log -S 'sk-'` pickaxe search for OpenAI key patterns in commit diffs
4. `find` for `.env`, `.pem`, `.key`, `.p12`, `.pfx`, `id_rsa`, `id_ed25519` files
5. Verified `.gitignore` coverage for sensitive file patterns
6. Inspected `.gitleaks.toml` allowlist for overly broad exceptions
7. Inspected all config files (MCP, swarm, CI workflows) for embedded credentials
8. Attempted GitHub Advanced Security secret scanning (unavailable — GHAS not enabled)
9. Verified pre-commit hooks and CI security pipeline are properly configured
