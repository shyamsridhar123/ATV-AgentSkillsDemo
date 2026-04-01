---
id: BETH-74
title: 'ADR-004: Config vs secrets separation — assessment'
status: Done
assignee: []
created_date: '2026-04-01 15:30'
updated_date: '2026-04-01 19:20'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Security reviewer and developer independently assess the .env vs .beth/ado-sync.json problem and propose solutions. Parent: BETH-64.5
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Developer Assessment: ADO Sync Config Architecture

Assessment completed April 1, 2026. Full analysis below.

## Security Assessment: ADO Sync Config vs. Secrets Architecture

**Reviewer:** security-reviewer agent
**Date:** 2026-04-01
**Frameworks Applied:** OWASP Top 10:2025 (A01, A02, A07), Azure WAF SE:03/SE:05/SE:07/SE:09, STRIDE
**Scope:** ado-sync/app/config.py, credential flow, .env handling, .beth/ directory

---

### Files Reviewed
- ado-sync/app/config.py (config loader with precedence chain)
- ado-sync/app/ado_client.py (credential usage in auth headers)
- ado-sync/app/main.py (FastAPI app + get_settings() usage)
- ado-sync/app/watcher_main.py (standalone watcher config loading)
- ado-sync/app/story_formatter.py (AOAI credential usage)
- backlog/decisions/ADR-001 (superseded credential storage)
- backlog/decisions/ADR-003 (MSAL shared cache - accepted)
- backlog/docs/prd-ado-sync-self-service.md (FR-5, FR-6, FR-13)
- .gitignore (coverage verification)
- ado-sync/.env (live file - permissions + contents inspected)

## THREAT MODEL: STRIDE Analysis

### Assets Under Review
- ADO PAT (restricted credential)
- Azure OpenAI API Key (restricted credential)
- GitHub Webhook Secret (restricted credential)
- MSAL tokens (restricted - managed by ADR-003)
- ADO org/project config (internal - non-secret)
- AI formatting config (internal - non-secret)

### Trust Boundaries
1. Config file (.beth/ado-sync.json) ↔ Python process
2. Environment variables ↔ Python process
3. Python process ↔ ADO REST API
4. Python process ↔ Azure OpenAI API
5. GitHub webhook ↔ FastAPI endpoint

### STRIDE Threats

| Threat | Category | Impact | Likelihood | Risk | Current Mitigation | Gap |
|--------|----------|--------|------------|------|-------------------|-----|
| Attacker reads .env (mode 644) | Information Disclosure | Critical | Medium | HIGH | .gitignore prevents commit | File is world-readable on disk |
| Secret in error message via HTTP 500 | Information Disclosure | High | Medium | HIGH | None | str(e) passed to HTTPException |
| repr(Settings) in traceback | Information Disclosure | High | Low | MEDIUM | None | No SecretStr on credential fields |
| Secret stored in .beth/ado-sync.json | Tampering / Info Disclosure | High | Low | MEDIUM | disallowed_keys={"pat"} | Allowlist is incomplete |
| Wrong .env loaded via CWD change | Spoofing | Medium | Low | LOW | PROJECT_ROOT env var | Implicit CWD dependency in pydantic |
| get_settings() bypasses validation | Elevation of Privilege | Medium | Medium | MEDIUM | None | Dual code paths with different security |

### Threat Diagram

```
                    ┌─────────────────┐
                    │  .env (SECRETS)  │ ← mode 644 (VULN: world-readable)
                    │  + config values │ ← VULN: secrets co-mingled
                    └────────┬────────┘
                             │ dotenv_values() / pydantic env_file
                             ▼
┌──────────────────┐   ┌─────────────┐   ┌──────────────────────┐
│ .beth/ado-sync   │──▶│  Settings   │──▶│ ADO API (pat/bearer) │
│   .json (config) │   │ (ALL in     │   │ AOAI API (api key)   │
│                  │   │  memory)    │   │ GitHub webhook verify│
└──────────────────┘   └──────┬──────┘   └──────────────────────┘
                              │
                    repr() / str() / logging
                              │
                    ┌─────────▼────────┐
                    │ RISK: secret     │
                    │ leakage in logs  │
                    │ errors, HTTP 500 │
                    └──────────────────┘
```

ADR-004 written at backlog/decisions/ADR-004-config-vs-secrets-separation.md. Decision: Keep .env as env var convenience, fix architecture (allowlist, SecretStr, unified entry point, sanitized errors, mode 600).
<!-- SECTION:NOTES:END -->
