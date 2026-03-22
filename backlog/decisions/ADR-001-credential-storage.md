# ADR-001: Credential Storage for ADO Sync Self-Service

**Status:** Accepted  
**Date:** 2026-03-22  
**Task:** BETH-64.1  
**Deciders:** Beth (orchestrator), Researcher agent  

---

## Context

ADO Sync self-service needs to securely store Entra ID tokens and PATs on the developer's machine. The CLI is a Node.js/TypeScript npm package installed via `npx beth-copilot`. Credentials must work across macOS, Linux (including WSL/headless), and Windows.

## Decision

**Use `cross-keychain` npm package with environment variable override layer.**

### Fallback Chain (priority order)

| Priority | Backend | When Used |
|----------|---------|-----------|
| 1 | Environment variables (`BETH_ENTRA_TOKEN`, `BETH_PAT`) | CI/automation, containers |
| 2 | Native OS keychain (`@napi-rs/keyring` optional dep) | Best security — macOS Keychain, Windows Credential Manager, libsecret |
| 3 | CLI-based OS keychain (`security`, `secret-tool`, PowerShell) | When native bindings unavailable |
| 4 | Encrypted file (AES-256-GCM, `~/.config/beth/`) | Headless/Docker/no keychain daemon |

`cross-keychain` implements layers 2-4 automatically. Layer 1 is a one-liner env var check before calling `cross-keychain`.

## Options Considered

| Option | Verdict | Reason |
|--------|---------|--------|
| **A: `keytar`** | Rejected | Dead — last release 4y ago. C++ node-gyp breaks on minimal Docker images and with `npx`. |
| **B: Shell out to platform CLIs** | Rejected standalone | Cross-platform maintenance burden. But acceptable as fallback (which `cross-keychain` includes). |
| **C: `cross-keychain`** | **Accepted** | Rust NAPI prebuilt binaries (no compilation), built-in layered fallback, API mirrors keytar. |
| **D: Encrypted file only** | Rejected standalone | Key on same machine as data — weaker security. But acceptable as final fallback. |
| **E: `node:crypto` + machine ID** | Rejected | Reinventing `cross-keychain`'s encrypted file backend, but worse. |

## Rationale

- **Follows `gh` CLI / `docker` pattern** — keychain → fallback. The most respected credential flow in CLI tooling.
- **No node-gyp** — `@napi-rs/keyring` ships prebuilt Rust NAPI binaries. Works with `npx`.
- **Graceful degradation** — if native bindings fail, CLI tools kick in; if those fail, encrypted file. Never crashes.
- **Tiny API surface** — `setPassword(service, account, token)` / `getPassword(service, account)` / `deletePassword(service, account)`.

## Competitive Analysis

| CLI Tool | Credential Storage | Keychain? |
|----------|-------------------|-----------|
| `gh` (GitHub CLI) | `go-keyring` → plaintext file | Yes + fallback |
| `az` (Azure CLI) | MSAL cache: encrypted on Windows, plaintext Linux/macOS | Windows only |
| `aws` | Plaintext `~/.aws/credentials` | No |
| `docker` | `docker-credential-helpers` → base64 config.json | Yes + fallback |
| `npm` | Plaintext `.npmrc` | No |

## Risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| `cross-keychain` abandoned | Medium | API matches keytar — easy to swap. Core dep `@napi-rs/keyring` is independent (1M/wk). |
| D-Bus not available (WSL1) | Medium | File backend auto-selected. |
| Native module install fails | Low | CLI fallback → file fallback already handled. |

## Consequences

- Add `cross-keychain` to `package.json` dependencies
- Credential storage for Entra tokens and PATs uses `cross-keychain` with service name `beth-copilot`
- Environment variables (`BETH_ENTRA_TOKEN`, `BETH_PAT`) bypass keychain entirely
- NOTE: For the MSAL token cache (see ADR-003), the shared cache file is the primary token store; `cross-keychain` is used for PAT storage and as a secondary credential mechanism
