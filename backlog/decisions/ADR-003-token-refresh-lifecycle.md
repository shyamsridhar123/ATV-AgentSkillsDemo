# ADR-003: Token Refresh Lifecycle — Shared MSAL Cache

**Status:** Accepted  
**Date:** 2026-03-22  
**Task:** BETH-64.3  
**Deciders:** Beth (orchestrator), Researcher agent  

---

## Context

Beth ADO Sync has two processes that need Entra ID tokens for Azure DevOps:
1. **TypeScript CLI** — handles interactive auth (device code flow), config, service lifecycle
2. **Python watcher** — long-running daemon creating ADO work items on BacklogMD task changes

Access tokens expire after ~75 minutes. The Python watcher runs for hours/days. Someone needs to handle token refresh.

## Decision

**Option D: Shared MSAL token cache file. Both CLI (MSAL.js) and Python (MSAL Python) share a single serialized cache.**

This is the Azure CLI pattern — proven at scale, and the MSAL Unified Cache Schema was explicitly designed for cross-language interoperability.

## Options Considered

| Option | Verdict | Reason |
|--------|---------|--------|
| **A: Python reads from keychain via `keyring`** | Rejected | Cross-language keychain access is fragile. Wrong abstraction for MSAL token lifecycle. |
| **B: CLI passes token via env var** | Rejected | Fatal flaw — token expires after ~75 min. Watcher runs for hours/days. |
| **C: Python owns its own token cache** | Partially valid | Converges to Option D once you solve the initial token handoff. |
| **D: Shared MSAL token cache file** | **Accepted** | Production-proven (Azure CLI pattern). Cross-language MSAL Unified Cache Schema. |
| **E: Python shells out to CLI for refresh** | Rejected | 2-5s npx startup overhead per refresh. Fragile. |

## Rationale

### MSAL Unified Cache Schema is cross-language by design
All MSAL libraries (Node, Python, .NET, Java) serialize to the same JSON format with sections: `AccessToken`, `RefreshToken`, `IdToken`, `Account`, `AppMetadata`. This interoperability is an explicit Microsoft design goal.

### Azure CLI proves the pattern
- Azure CLI = Python + MSAL Python
- Token cache: `~/.azure/msal_token_cache.json`
- `acquireTokenSilent()` transparently refreshes expired access tokens using cached refresh tokens
- File locking via `msal-extensions` handles concurrent access
- VS Code and Azure CLI can share the same MSAL cache

### Refresh tokens last effectively forever
| Property | Value |
|----------|-------|
| Access token lifetime | 60-90 minutes |
| Refresh token inactive timeout | 90 days |
| Refresh token max age | Until-revoked |

A user who runs `ado-sync start` at least once every 90 days never needs to re-authenticate.

## Token Flow

```
INITIAL AUTH (one-time):
  npx beth-copilot set-ado-org
    → MSAL.js device code flow (scope: 499b84ac.../. default)
    → User opens browser, enters code
    → Tokens stored in .beth/msal_token_cache.json
    → Config written to .beth/ado-sync.json (no secrets)

RUNTIME (long-running watcher):
  npx beth-copilot ado-sync start
    → CLI spawns Python process
    → Python reads config from .beth/ado-sync.json
    → Python loads MSAL cache from .beth/msal_token_cache.json
    → On each ADO API call:
        acquire_token_silent(scopes, account)
          → Access token valid? Return it.
          → Expired? Use refresh token → new tokens written to cache.
          → Refresh failed? Log error + graceful shutdown.

RE-AUTH (rare — refresh token expired/revoked):
  npx beth-copilot auth login
    → Device code flow again → cache updated
    → npx beth-copilot ado-sync start
```

## Edge Cases

| Scenario | Behavior | Recovery |
|----------|----------|---------|
| Access token expired (normal) | MSAL auto-refreshes using cached refresh token | Automatic — transparent |
| Refresh token expired (90d inactive) | `acquire_token_silent()` → `InteractionRequired` | Watcher logs error, shuts down. User runs `auth login`. |
| Refresh token revoked (admin) | Same as expired | Same |
| Cache file locked by other process | `msal-extensions` file lock blocks briefly | Automatic — serialized access |
| Cache file corrupted | MSAL deserialize fails | Delete cache, re-authenticate |
| Network down during refresh | MSAL retry. Access token works until it expires. | Next refresh attempt may succeed |
| CLI and Python refresh simultaneously | File lock serializes. First writer wins. Second reader sees fresh tokens. | Automatic |
| **Different client_ids** | **Tokens partitioned — invisible to each other** | **MUST use same client_id** |

## Interface Contract: CLI ↔ Python

### Shared Artifacts

| Artifact | Owner | Location | Content |
|----------|-------|----------|---------|
| Config | CLI writes, Python reads | `.beth/ado-sync.json` | `{ org, project, tenantId, clientId }` — no secrets |
| MSAL cache | CLI writes (initial), both read/write (refresh) | `.beth/msal_token_cache.json` | Unified Cache JSON |
| Lock file | Both | `.beth/msal_token_cache.lock` | Cross-process file lock |
| PID file | CLI writes/reads | `.beth/ado-sync.pid` | Watcher process ID |

### Critical Constraint
Both CLI and Python **MUST use the same `clientId`** (Entra app registration). This is stored in `.beth/ado-sync.json`.

### Dependencies

**Node.js (CLI):**
```
@azure/msal-node             # Device code flow
@azure/msal-node-extensions  # Cache persistence + file locking
```

**Python (watcher):**
```
msal>=1.28.0                 # MSAL Python
msal-extensions>=1.1         # File-based cache persistence with locking
```

The existing `azure-identity` dependency in the Python service can remain as a fallback (`DefaultAzureCredential` for env vars, managed identity). The primary auth path for the local watcher uses MSAL Python directly with the shared cache.

## Consequences

- Single Entra app registration for beth-copilot (shared `clientId`)
- `.beth/msal_token_cache.json` is the single source of truth for auth state
- Python's `ado_client.py` refactored from `DefaultAzureCredential` to MSAL `acquire_token_silent()`
- New Node.js deps: `@azure/msal-node`, `@azure/msal-node-extensions`
- New Python deps: `msal`, `msal-extensions` (added to `requirements.txt`)
- Users re-authenticate only when refresh token expires (90d inactive) or is revoked
