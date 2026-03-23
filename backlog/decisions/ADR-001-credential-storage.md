# ADR-001: Credential Storage for ADO Sync Self-Service

**Status:** Superseded by ADR-003  
**Date:** 2026-03-22  
**Superseded:** 2026-03-22  
**Task:** BETH-64.1  
**Deciders:** Beth (orchestrator), Researcher agent, Human review  

---

## Supersession Notice

**This ADR is superseded by [ADR-003](ADR-003-token-refresh-lifecycle.md).**

ADR-003's shared MSAL token cache (`msal-node-extensions` / `msal-extensions`) already provides:
- **Token storage**: MSAL Unified Cache at `.beth/msal_token_cache.json`
- **Cache encryption**: DPAPI (Windows), Keychain Services (macOS), libsecret (Linux) — via `msal-extensions` built-in. Note: Linux requires a running secret service (libsecret/gnome-keyring); in minimal containers/CI without one, use `BETH_PAT` env var instead. See ADR-003 Edge Cases.
- **Cross-language interop**: Node.js and Python share the same cache natively

The `cross-keychain` dependency proposed here is **not needed**. MSAL handles Entra token persistence and encryption. PAT fallback (US-008) is covered by the `BETH_PAT` environment variable — no keychain required.

### What remains valid
- **Environment variable override** (`BETH_PAT`) for CI/automation — this pattern carries forward
- **The competitive analysis** below is still accurate reference material
- **The rejection of `keytar`** remains correct — don't revisit it

### What is withdrawn
- `cross-keychain` dependency — **removed from design**
- Custom fallback chain (keychain → CLI → encrypted file) — **replaced by `msal-extensions` built-in encryption**
- PAT keychain storage — **replaced by env var only** (if you need a PAT, set `BETH_PAT`)

---

## Original Decision (for reference)

**Use `cross-keychain` npm package with environment variable override layer.**

### Original Fallback Chain

| Priority | Backend | When Used |
|----------|---------|-----------|
| 1 | Environment variables (`BETH_ENTRA_TOKEN`, `BETH_PAT`) | CI/automation, containers |
| 2 | Native OS keychain (`@napi-rs/keyring` optional dep) | Best security — macOS Keychain, Windows Credential Manager, libsecret |
| 3 | CLI-based OS keychain (`security`, `secret-tool`, PowerShell) | When native bindings unavailable |
| 4 | Encrypted file (AES-256-GCM, `~/.config/beth/`) | Headless/Docker/no keychain daemon |

## Options Considered

| Option | Verdict | Reason |
|--------|---------|--------|
| **A: `keytar`** | Rejected | Dead — last release 4y ago. C++ node-gyp breaks on minimal Docker images and with `npx`. |
| **B: Shell out to platform CLIs** | Rejected standalone | Cross-platform maintenance burden. But acceptable as fallback (which `cross-keychain` includes). |
| **C: `cross-keychain`** | ~~Accepted~~ **Superseded** | Unnecessary — `msal-extensions` provides equivalent cache encryption natively. |
| **D: Encrypted file only** | Rejected standalone | Key on same machine as data — weaker security. But acceptable as final fallback. |
| **E: `node:crypto` + machine ID** | Rejected | Reinventing `cross-keychain`'s encrypted file backend, but worse. |
| **F: Azure Key Vault** | Rejected | Bootstrap problem: need Entra tokens to access Key Vault, but Key Vault would store the Entra tokens. Also requires provisioning infrastructure for a local-only concern. |
| **G: MSAL-native (ADR-003)** | **Accepted** | `msal-extensions` already encrypts the cache per-platform. Zero additional dependencies. |

## Competitive Analysis

| CLI Tool | Credential Storage | Keychain? |
|----------|-------------------|-----------|
| `gh` (GitHub CLI) | `go-keyring` → plaintext file | Yes + fallback |
| `az` (Azure CLI) | MSAL cache: encrypted on Windows, plaintext Linux/macOS | Windows only |
| `aws` | Plaintext `~/.aws/credentials` | No |
| `docker` | `docker-credential-helpers` → base64 config.json | Yes + fallback |
| `npm` | Plaintext `.npmrc` | No |

## Revised Consequences

- **No `cross-keychain` dependency** — removed from `package.json` design
- Entra token storage is fully handled by MSAL cache + `msal-extensions` encryption (ADR-003)
- PAT fallback uses `BETH_PAT` environment variable only — simple, no keychain needed
- One fewer native dependency = simpler install, fewer failure modes for `npx` users
