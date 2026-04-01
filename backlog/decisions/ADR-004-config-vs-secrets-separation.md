# ADR-004: Config vs Secrets Separation — Keep .env, Fix the Architecture

**Status:** Accepted  
**Date:** 2026-04-01  
**Task:** BETH-74  
**Parent:** BETH-64.5  
**Deciders:** Beth (orchestrator), Security Reviewer agent, Developer agent, Human review  

---

## Context

ADO Sync's configuration system uses two sources: `.beth/ado-sync.json` (JSON config) and `.env` (environment variables). The `.env` file currently holds both non-secret config (org name, project, deployment names) and secrets (PAT, API keys, webhook secret) in a single file with a single permission model.

A joint security + developer assessment (BETH-74) identified six findings:

| # | Finding | Risk |
|---|---------|------|
| S1 | `.env` is mode 644 (world-readable on disk) | HIGH |
| S2 | `str(e)` in HTTP 500 responses can leak secrets | HIGH |
| S3 | No `SecretStr` on credential fields — secrets visible in repr/traceback | MEDIUM |
| S4 | `disallowed_keys` blocklist in JSON config only blocks `{"pat"}` — incomplete | MEDIUM |
| S5 | `get_settings()` bypasses config precedence chain and all security gates | MEDIUM |
| S6 | CWD-dependent `.env` loading | LOW |

Both assessments converge on the same root cause: **secrets and config are co-mingled**, and the code has **two entry points with different security postures**.

## Decision

**Keep `.env`. Fix the architecture around it.**

`.env` is a standard, ecosystem-compatible convenience for setting environment variables locally. The problem is not the format — it's what's in it and how the code handles it. We separate concerns without removing a tool everyone knows how to use.

### Three-tier config architecture

| Tier | What | Where | Permission Model |
|------|------|-------|-----------------|
| **Config** | Org, project, area path, iteration path, deployment names, task prefix, log level | `.beth/ado-sync.json` | Shareable, non-secret, can be version-controlled per-project |
| **Secrets** | PAT, API keys, webhook secret | Environment variables (set directly or via `.env` with mode 600) | User-only access, never parsed by application config logic |
| **Tokens** | Entra ID access/refresh tokens | MSAL cache at `.beth/msal_token_cache.json` (per ADR-003) | Encrypted at rest via `msal-extensions`, managed lifecycle |

### Key changes

1. **Stop parsing `.env` manually in `load_config()`.** Remove the 40-line `.env` → dict conversion block. Let pydantic-settings handle `.env` natively via its built-in `env_file` support. The `.env` file becomes what it's supposed to be — a local convenience for populating `os.environ`, not a config source competing with JSON.

2. **Unify to `load_settings()` as the single entry point.** Remove `get_settings()`. All callers (`main.py`, `mcp_server.py`, `watcher_main.py`) use `load_settings()`. One entry point = one security posture.

3. **Add `SecretStr` to credential fields.** `ado_pat`, `azure_openai_api_key`, and `github_webhook_secret` become `pydantic.SecretStr`. Prevents accidental exposure via `repr()`, logging, or traceback.

4. **Expand the JSON config blocklist to an allowlist.** Replace `disallowed_keys = {"pat"}` with an explicit allowlist of permitted config keys. If a key isn't on the list, it doesn't load from JSON. Fail-safe instead of fail-open.

5. **Fix `.env` file permissions.** `beth-copilot init` and `ado-sync` setup must create `.env` with mode 600 (user-only read/write). Document this in the README.

6. **Sanitize error responses.** Replace `HTTPException(status_code=500, detail=str(e))` with a generic message. Log the full error server-side; return only a safe summary to the caller.

## Options Considered

| Option | Verdict | Reason |
|--------|---------|--------|
| **A: Minimal fixes only** | Rejected | Fixes symptoms (perms, error messages) without addressing the architectural problem (co-mingled concerns, dual code paths). Same bugs will recur. |
| **B: Fix architecture, deprecate .env** | Rejected | `.env` deprecation swims upstream. Every tool speaks `.env` — Docker, pydantic, CI runners. Removing it costs ecosystem compatibility for zero security gain. |
| **B': Fix architecture, keep .env** | **Accepted** | Addresses all six findings. Separates concerns properly. Keeps `.env` as what it is — an env var convenience. No breaking changes for users. |
| **C: Full removal of .env** | Rejected | Hostile to users. Breaks standard workflows. The file format isn't the problem. |

## Config Precedence (Post-ADR-004)

```
Settings resolution order (highest wins):

1. Process environment variables (always highest — lets CI/containers override everything)
2. .env file (pydantic-settings native env_file, mode 600, local dev convenience)
3. .beth/ado-sync.json (non-secret config only, allowlisted keys)
4. Defaults in Settings class
```

Note the inversion: `.env` no longer competes with JSON config as a "config source" parsed by `load_config()`. Instead:
- JSON config provides **non-secret configuration**
- `.env` / env vars provide **secrets and overrides**
- pydantic-settings merges them with its standard precedence

## Implementation Checklist

- [ ] Replace `disallowed_keys` blocklist with allowlist in `load_config()`
- [ ] Remove manual `.env` parsing block from `load_config()` (the `dotenv_values()` section)
- [ ] Add `SecretStr` to `ado_pat`, `azure_openai_api_key`, `github_webhook_secret` in `Settings`
- [ ] Update all `.get_secret_value()` call sites in `ado_client.py`, `story_formatter.py`, `main.py`
- [ ] Remove `get_settings()` — replace all callers with `load_settings()`
- [ ] Sanitize `HTTPException(500, detail=str(e))` in `main.py`
- [ ] Set `.env` creation to mode 600 in setup tooling
- [ ] Update `ado-sync/README.md` with new config architecture
- [ ] Unit tests for allowlist enforcement
- [ ] Unit tests for `SecretStr` non-leakage in repr

## Consequences

### Positive
- Clear separation: config in JSON, secrets in env vars, tokens in MSAL cache
- Single entry point eliminates the dual-security-posture problem
- `SecretStr` provides type-level protection against accidental secret exposure
- Allowlist is fail-safe — unknown keys in JSON are ignored, not trusted
- `.env` continues to work exactly as users expect
- No breaking changes for existing users

### Negative
- Callers of `get_settings()` need migration (3 call sites: `main.py`, `mcp_server.py`, `config.py`)
- `SecretStr` requires `.get_secret_value()` at every usage point — slightly more verbose
- Allowlist needs maintenance when new config keys are added

### Neutral
- `.env` file permissions are a one-time fix; existing users need `chmod 600 ado-sync/.env`
- Error sanitization means developers need to check server logs instead of HTTP responses for debugging — standard practice

## Relationship to Other ADRs

- **ADR-001 (Superseded):** Credential storage — the env var override pattern (`BETH_PAT`) carries forward unchanged
- **ADR-003 (Accepted):** MSAL shared cache — Tier 3 (tokens) is fully handled by ADR-003. This ADR covers Tier 1 (config) and Tier 2 (secrets) only
- **BETH-64.5 (Resolved):** The `.env` backward compat question — answered here: `.env` stays, but as an env var convenience, not a config source
