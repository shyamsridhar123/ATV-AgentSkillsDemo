# PRD: ADO Sync Self-Service

**Author:** Product Manager Agent  
**Date:** 2026-03-22  
**Status:** Draft  
**Epic:** BETH-64  
**Relates to:** BETH-58 through BETH-63 (Phase 1 — complete)

---

## 1. Problem Statement

ADO Sync exists as a working Phase 1 service (`ado-sync/`) that automatically creates Azure DevOps user stories when Beth starts work on BacklogMD tasks. It works — but only for one person, on one machine, with one ADO org hardcoded via `.env` variables.

**The gap:** There is no path from "it works on Steph's machine" to "any beth-copilot user can enable this for their project." Specifically:

- **No CLI integration.** ADO Sync is invisible to `npx beth-copilot init`. Users would need to manually clone the Python service, create a `.env` file, configure systemd, and hope it works.
- **No per-project config.** The service reads a single global `.env`. If a user works on two projects pointing at different ADO orgs, they're editing environment variables by hand.
- **No interactive auth.** Users must obtain a PAT or manually configure Entra tenant IDs. There's no `az login`-style interactive browser flow.
- **No discoverability.** `npx beth-copilot doctor` has no idea ADO Sync exists. Users get no health checks, no status, no guided setup.

Enterprise teams are the primary beth-copilot growth vector, and enterprise teams use Azure DevOps. If enabling ADO Sync requires a developer to manually configure a Python service with environment variables and systemd, adoption will be near zero.

### IDEO Lens

- **Desirability:** Enterprise developers want their ADO boards to reflect reality without manual work. They already have Beth; they want the bridge to their project management tool to "just work."
- **Feasibility:** The Python service already works. The ADO REST API, Entra auth, and AI formatting are all proven. This is packaging and integration work, not R&D.
- **Viability:** ADO Sync makes Beth sticky for enterprise teams. A team that sees their ADO board auto-populated from Beth's work is a team that doesn't churn.

---

## 2. Target User

### Primary: Enterprise Developer using Beth + Azure DevOps

- Works on a team that tracks work in Azure DevOps (user stories, sprints, boards)
- Uses beth-copilot as their AI coding agent
- Has an Entra ID (corporate Azure AD) account with access to their team's ADO org
- May work on multiple projects, each pointing to a different ADO project
- Does NOT want to edit `.env` files or manage systemd services
- Expects setup to feel like `az login` — interactive, guided, done in 30 seconds

### Secondary: Beth Power User (Solo/Startup)

- Uses ADO for personal project tracking or client visibility
- May use PAT auth instead of Entra (smaller org, no Entra)
- Wants the feature but tolerates slightly more setup friction

### Anti-User

- Someone without Azure DevOps. ADO Sync is opt-in; it should never get in the way of users who don't use ADO.

---

## 3. User Stories

### US-001: Interactive ADO Setup During Init

**As a** developer running `npx beth-copilot init` for the first time,  
**I want** to be offered ADO Sync setup as part of initialization,  
**So that** I can connect my project to Azure DevOps without a separate workflow.

**Acceptance Criteria:**
- [ ] `npx beth-copilot init` asks "Do you use Azure DevOps for this project? (y/N)"
- [ ] If yes, launches the interactive Entra auth + org/project selection flow (see US-002, US-003)
- [ ] If no (or Enter), skips ADO Sync setup entirely — no errors, no leftover config
- [ ] Selecting "no" does not create any ADO Sync config files
- [ ] ADO Sync setup is offered AFTER core Beth init (agents, skills, hooks) completes successfully
- [ ] Works with both `npx beth-copilot init` and `npx beth-copilot quickstart`

### US-002: Entra ID Interactive Authentication

**As a** developer setting up ADO Sync,  
**I want** to authenticate with my corporate Entra ID via a browser-based login,  
**So that** I don't have to find, generate, or paste a Personal Access Token.

**Acceptance Criteria:**
- [ ] CLI launches a browser-based Entra ID auth flow (device code flow or localhost redirect)
- [ ] Auth targets the Azure DevOps resource scope (`499b84ac-1321-427f-aa17-267ca6975798/.default`)
- [ ] On success, token is stored securely (see FR-6 for storage mechanism)
- [ ] On failure (timeout, cancelled, no permissions), shows a clear error and offers PAT fallback
- [ ] Token refresh is handled automatically — user should not need to re-authenticate during normal use
- [ ] Works behind corporate proxies (respects `HTTPS_PROXY` env var)

### US-003: ADO Org and Project Selection

**As an** authenticated developer,  
**I want** to see my accessible ADO organizations and select one, then select a project within it,  
**So that** Beth knows exactly where to create user stories.

**Acceptance Criteria:**
- [ ] After auth, CLI calls the ADO accounts API to list orgs the user has access to
- [ ] User selects an org from an interactive list (arrow keys + enter, or type-to-filter)
- [ ] After org selection, CLI lists projects within that org
- [ ] User selects a project from an interactive list
- [ ] Selected org + project are saved to per-project config (see FR-5)
- [ ] If user has access to only 1 org, auto-select it (skip the prompt)
- [ ] If user has access to only 1 project, auto-select it (skip the prompt)

### US-004: Reconfigure ADO Org/Project Any Time

**As a** developer who already set up ADO Sync,  
**I want** to run `npx beth-copilot set-ado-org` to change my ADO org or project,  
**So that** I can switch contexts without editing config files.

**Acceptance Criteria:**
- [ ] `npx beth-copilot set-ado-org` re-runs the org/project selection flow
- [ ] Uses existing stored credentials (does not force re-authentication)
- [ ] If credentials are expired or missing, prompts for re-authentication first
- [ ] Updates the per-project config file with the new selection
- [ ] Shows current configuration before prompting for changes ("Currently: org/project — change?")
- [ ] Works without stopping the ADO Sync watcher (config reloaded on next event)

### US-005: ADO Sync Service Lifecycle Management

**As a** developer,  
**I want** CLI commands to start, stop, and check the status of the ADO Sync watcher,  
**So that** I can control the service without knowing about Python, systemd, or process management.

**Acceptance Criteria:**
- [ ] `npx beth-copilot ado-sync start` starts the backlog watcher for the current project
- [ ] `npx beth-copilot ado-sync stop` stops the watcher
- [ ] `npx beth-copilot ado-sync status` shows: running/stopped, configured org/project, last sync event, uptime
- [ ] Starting the service when it's already running is a no-op with a friendly message
- [ ] Stopping the service when it's not running is a no-op with a friendly message
- [ ] The watcher runs as a background process (not blocking the terminal)
- [ ] On unexpected crash, the next `status` check reports the crash cleanly

### US-006: Doctor Checks for ADO Sync

**As a** developer running `npx beth-copilot doctor`,  
**I want** health checks for my ADO Sync configuration,  
**So that** I can diagnose issues without debugging Python code.

**Acceptance Criteria:**
- [ ] If ADO Sync is NOT configured, doctor says "ADO Sync: not configured (optional)" — no warnings, no errors
- [ ] If configured, doctor validates:
  - Credentials exist and are not expired
  - ADO org/project is reachable (lightweight API call)
  - Python runtime is available (required for the service)
  - MCP server entry exists in `.vscode/mcp.json` (or `copilot-mcp-config.json`)
  - Watcher process status (running/stopped)
- [ ] Each sub-check has pass/warn/fail status with actionable fix messages
- [ ] `--fix` flag auto-repairs what it can (e.g., adds MCP entry, refreshes expired token)

### US-007: MCP Server Auto-Configuration

**As a** developer who just set up ADO Sync,  
**I want** the `ado-sync` MCP server to be automatically added to my MCP config,  
**So that** Beth can call ADO Sync tools directly without manual config editing.

**Acceptance Criteria:**
- [ ] After successful ADO Sync setup, the MCP entry for `ado-sync` is added to `.vscode/mcp.json` (or `copilot-mcp-config.json`)
- [ ] The MCP entry uses the correct Python path and working directory for this project
- [ ] If the MCP config file doesn't exist, it is created with the `ado-sync` entry plus existing required servers
- [ ] If the MCP config already has an `ado-sync` entry, it is updated (not duplicated)
- [ ] MCP entry template: `{ "command": "python", "args": ["-m", "app.mcp_server"], "cwd": "<path>" }`
- [ ] Doctor validates this entry exists when ADO Sync is configured

### US-008: PAT Fallback Authentication

**As a** developer in an environment without Entra ID (or with restrictive policies),  
**I want** to authenticate with a Personal Access Token,  
**So that** I can still use ADO Sync even if interactive Entra auth isn't available.

**Acceptance Criteria:**
- [ ] If Entra auth fails or user explicitly chooses PAT, prompt for PAT input (masked)
- [ ] Validate the PAT against ADO API before saving
- [ ] Store PAT securely using the same mechanism as Entra tokens (see FR-6)
- [ ] PAT must have `Work Items (Read, Write)` scope — CLI warns if scope appears insufficient
- [ ] PAT is never written to plain-text config files or committed to git

---

## 4. Functional Requirements

### CLI Commands

**FR-1:** Add `set-ado-org` command to beth-copilot CLI. Interactive flow: authenticate → list orgs → select org → list projects → select project → save config → configure MCP.

**FR-2:** Add `ado-sync` command group to beth-copilot CLI with subcommands: `start`, `stop`, `status`. These manage the Python watcher process as a background daemon for the current project.

**FR-3:** Extend `init` command to offer ADO Sync setup after core initialization. Triggered by user confirmation prompt, not automatic. Same flow as `set-ado-org`.

**FR-4:** Extend `doctor` command with ADO Sync health checks. Checks are conditional — only run if ADO Sync config exists for the current project. Checks include: credentials valid, ADO reachable, Python available, MCP configured, watcher status.

### Per-Project Configuration

**FR-5:** ADO Sync config lives in `.beth/ado-sync.json` in the project root directory.

Config schema:
```json
{
  "organization": "my-ado-org",
  "project": "MyProject",
  "areaPath": "",
  "iterationPath": "",
  "authMethod": "entra",
  "tenantId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "taskPrefix": "BETH",
  "tasksDir": "./backlog/tasks",
  "aiFormatting": {
    "enabled": true,
    "endpoint": "",
    "deployment": "gpt-4o"
  }
}
```

- This file contains NO secrets (no tokens, no PATs, no API keys).
- Tokens are stored separately via OS keychain or credential helper (see FR-6).
- `.beth/` MUST be added to `.gitignore` during setup.
- The config file IS safe to commit (org/project names are not secrets) — but `.beth/` is gitignored by default to avoid any future accidental secret leakage if the format evolves.

**FR-6:** Credentials (Entra tokens, PATs) are stored using the OS keychain via `keytar` (Node.js) or the system credential manager.

Storage strategy (ordered by preference):
1. **OS Keychain** (`keytar` or `@aspect-build/secret_store`): macOS Keychain, Windows Credential Manager, libsecret (Linux). Service name: `beth-copilot-ado-sync`, account: `{org}/{project}`.
2. **Encrypted file fallback**: If keychain is unavailable (headless Linux server), store in `.beth/.credentials` encrypted with a machine-specific key. This file MUST be in `.gitignore`.
3. **Environment variable override**: `BETH_ADO_PAT` or `BETH_ADO_TOKEN` env vars bypass stored credentials entirely. This supports CI/CD and containerized scenarios.

**FR-7:** The CLI automatically adds `.beth/` to the project's `.gitignore` during setup. If `.gitignore` doesn't exist, create it. If `.beth/` is already listed, skip.

### Authentication Flow

**FR-8:** Entra ID authentication uses the device code flow (not localhost redirect) for maximum compatibility across environments including SSH sessions, WSL, containers, and corporate networks.

Flow:
1. CLI prints: "To sign in, open https://microsoft.com/devicelogin and enter code XXXXXX"
2. User completes auth in browser
3. CLI receives tokens (access + refresh)
4. Access token is used for ADO API calls
5. Refresh token is stored for silent renewal
6. Token refresh happens automatically before API calls when the access token is expired

**FR-9:** The Entra auth targets the ADO resource (`499b84ac-1321-427f-aa17-267ca6975798/.default`) with the user's tenant. The tenant ID is discovered from the org selection (via ADO's connection data API), not prompted manually.

### ADO Discovery

**FR-10:** After authentication, list accessible ADO organizations via the Azure DevOps accounts API:
```
GET https://app.vssps.visualstudio.com/_apis/accounts?memberId={userId}&api-version=7.1
```
The `userId` (member ID) is extracted from the authenticated profile.

**FR-11:** After org selection, list projects via:
```
GET https://dev.azure.com/{org}/_apis/projects?api-version=7.1&$top=100&stateFilter=wellFormed
```
Display as interactive list with project name and description.

### MCP Server Configuration

**FR-12:** After setup, add `ado-sync` server entry to the project's MCP config (`.vscode/mcp.json` or `.github/copilot-mcp-config.json`, whichever exists). Format:
```json
{
  "ado-sync": {
    "_comment": "Local process — syncs BacklogMD tasks to Azure DevOps",
    "command": "python3",
    "args": ["-m", "app.mcp_server"],
    "cwd": "<absolute-path-to-ado-sync>"
  }
}
```

**FR-13:** The Python ADO Sync service MUST read its config from `.beth/ado-sync.json` (per-project) instead of exclusively from `.env` (global). The existing `.env` loading remains as a fallback for backward compatibility with Phase 1 deployments.

### Service Management

**FR-14:** `ado-sync start` spawns the Python process as a detached background process. PID is written to `.beth/ado-sync.pid`. The process inherits credentials from the keychain (or env vars), not from `.env`.

**FR-15:** `ado-sync stop` reads the PID file and sends `SIGTERM`. Cleans up the PID file. If the process is already dead, cleans up the stale PID file.

**FR-16:** `ado-sync status` reports:
- Running / Stopped (checks PID file and validates process is alive)
- Configured org/project
- Auth method (Entra / PAT) and credential expiry
- Last sync event timestamp (read from a `.beth/ado-sync.log` or status file)
- Uptime (if running)

### Python Runtime Discovery

**FR-17:** The CLI must locate a working Python 3.10+ runtime. Discovery order:
1. `.beth/ado-sync/.venv/bin/python` (project-local venv, created during setup)
2. `python3` on PATH
3. `python` on PATH (validate version ≥ 3.10)

If no Python is found, display a clear error: "Python 3.10+ is required for ADO Sync. Install from https://python.org or your system package manager."

**FR-18:** During `set-ado-org` (or init), the CLI creates a Python virtual environment at `.beth/ado-sync/.venv/` and installs dependencies from `ado-sync/requirements.txt`. This isolates ADO Sync's Python deps from the system.

---

## 5. Non-Functional Requirements

### Security

**NFR-1:** Tokens and PATs MUST NEVER be written to plain-text files that could be committed to git. The `.beth/` directory is gitignored, but credentials go in OS keychain, not in `.beth/ado-sync.json`.

**NFR-2:** The `ado-sync.json` config file contains NO secrets. It is safe to inspect, debug, or share. Secrets live exclusively in keychain or encrypted storage.

**NFR-3:** Token refresh must happen silently. Users should not be prompted to re-authenticate unless their refresh token is revoked or expired (typically 90 days for Entra).

**NFR-4:** PAT input must be masked in the terminal (no echo). PATs must not appear in logs, error messages, or crash reports.

**NFR-5:** The Python watcher process must not expose any network ports by default when run via CLI lifecycle commands. (The existing FastAPI server on port 8321 is only for the Phase 1 systemd deployment and webhook ingestion — the CLI-managed mode should run the watcher directly, not the full HTTP server.)

### Performance

**NFR-6:** `set-ado-org` interactive flow should complete in under 10 seconds (excluding browser auth time). API calls to ADO for org/project listing should use pagination and caching.

**NFR-7:** The background watcher must consume minimal resources — under 50MB RSS memory, negligible CPU when idle. It's watching for file changes, not polling an API.

**NFR-8:** `ado-sync status` must respond in under 1 second (local PID check + config read, no network calls).

### Reliability

**NFR-9:** If the watcher crashes, it should be restartable via `ado-sync start` without manual cleanup. Stale PID files are detected and cleaned up automatically.

**NFR-10:** If ADO is unreachable when a task starts, the sync should retry with exponential backoff (up to 3 attempts) and log the failure. The task status change in BacklogMD is never blocked by ADO availability.

**NFR-11:** If credentials expire mid-session, the watcher should attempt a silent token refresh. If refresh fails, log a clear error and shut down cleanly (not crash silently).

### Compatibility

**NFR-12:** Must work on macOS, Linux (including WSL), and Windows (via PowerShell or Git Bash).

**NFR-13:** Must work when beth-copilot is installed globally (`npm i -g`) and when run via `npx`. The config always lives in the PROJECT directory, not adjacent to the CLI installation.

**NFR-14:** Must not break existing Phase 1 deployments. The `.env` config path remains functional. Phase 1 users are not forced to migrate.

---

## 6. Non-Goals (Out of Scope)

- **Rewrite ADO Sync in TypeScript.** The Python service works. Rewriting adds risk and delay for no user-visible benefit. The integration layer (CLI commands) is TypeScript; the service stays Python.
- **Bidirectional sync.** We create ADO stories from BacklogMD tasks. We do NOT import ADO stories back into BacklogMD.
- **Multi-org simultaneous sync.** One project → one ADO org/project. Users working across orgs switch via `set-ado-org`.
- **Web UI or dashboard.** Status is CLI-only (`ado-sync status`). No web interface.
- **ADO Sync as a hosted cloud service.** It runs locally on the developer's machine, co-located with the Beth project. Not SaaS.
- **GitHub Issues / Jira / Linear integration.** This PRD is specifically for Azure DevOps. Other PM tools are separate efforts.
- **Auto-start on system boot.** The Phase 1 systemd approach works for power users. The CLI `start` command is manual-per-session. Auto-start may come in a future phase.

---

## 7. Architecture Decisions

### AD-1: Python Service Stays Python

**Decision:** Keep `ado-sync/` as Python. The CLI integration layer is TypeScript.

**Rationale:**
- The Python service is shipped, tested, and working (BETH-58–63).
- Rewriting in TypeScript would delay the self-service feature by weeks with no user benefit.
- The cross-language boundary is clean: the CLI manages lifecycle (start/stop process) and config; the Python process does the actual ADO API work.
- Python has better libraries for ADO API interaction (`azure-identity`, `azure-devops`).

**Tradeoff:** Users need Python 3.10+ on their machine. The CLI setup handles venv creation and dependency installation, so this is automated but does add a prerequisite.

### AD-2: Per-Project Config in `.beth/ado-sync.json`

**Decision:** Config lives in `.beth/ado-sync.json` at the project root.

**Rationale:**
- Per-project, not global — matches the "each project can have its own ADO org" requirement.
- `.beth/` directory can hold other Beth-specific state in the future (credential cache, logs, PID files).
- JSON format is human-readable and easily parsed by both TypeScript (CLI) and Python (service).
- No secrets in this file — it's config, not credentials.

**Alternative considered:** `~/.config/beth-copilot/projects/{hash}/ado-sync.json`. Rejected because it violates the "per-project, NOT global" requirement and makes the config invisible/hard to debug.

### AD-3: OS Keychain for Credential Storage

**Decision:** Use OS keychain (via `keytar` or equivalent) as the primary credential store.

**Rationale:**
- Industry standard for CLI tools (Azure CLI, GitHub CLI, Docker all use OS keychain).
- Encrypted at rest by the OS.
- Survives terminal restarts without re-auth.
- `keytar` is a mature Node.js library with native bindings for all platforms.

**Fallback:** Encrypted file in `.beth/.credentials` for headless environments where keychain is unavailable. Environment variable override (`BETH_ADO_PAT`) for CI.

**Tradeoff:** `keytar` requires native bindings and may need build tools on some Linux distros. Consider `@aspect-build/secret_store` as a lighter alternative, or shell out to `security` (macOS) / `secret-tool` (Linux) / `cmdkey` (Windows) directly.

### AD-4: Device Code Flow for Authentication

**Decision:** Use Entra ID device code flow, not localhost redirect.

**Rationale:**
- Works in SSH sessions, WSL, containers, and Codespaces (no localhost available).
- Works behind corporate firewalls that block arbitrary localhost ports.
- Same UX as `az login --use-device-code` — enterprise developers are already familiar.
- Simpler implementation (no HTTP server needed in the CLI).

**Alternative considered:** Authorization code flow with localhost redirect (like `az login` default). Better UX on local machines but fails in remote environments. Device code is universally compatible.

### AD-5: CLI Manages Python Process (Not Container, Not Bundled Binary)

**Decision:** The CLI spawns the Python process directly as a detached subprocess.

**Rationale:**
- Simplest approach. No Docker dependency, no PyInstaller bundling complexity.
- The CLI already knows where Python is (FR-17) and creates the venv (FR-18).
- PID file-based lifecycle is simple and well-understood.
- The Python process communicates config via the `.beth/ado-sync.json` file — no IPC needed.

**Alternatives considered:**
- **Docker container:** Eliminates Python prerequisite but adds Docker prerequisite (heavier, overkill for a file watcher).
- **PyInstaller/PyOxidizer bundled binary:** Eliminates Python prerequisite but adds CI complexity, platform-specific binaries, and update headaches.
- **Node.js child process with IPC:** Over-engineered for the communication needs (config is a file, not a stream).

### AD-6: Watcher-Only Mode for CLI-Managed Service

**Decision:** When started via CLI, the Python service runs ONLY the backlog file watcher — NOT the FastAPI HTTP server.

**Rationale:**
- The CLI-managed watcher doesn't need HTTP endpoints. It watches files and calls ADO APIs.
- Not opening a port eliminates a security surface (NFR-5).
- The FastAPI server with webhook support remains available for Phase 1 systemd deployments or future scenarios that need HTTP ingestion.
- Run via: `python -m app.watcher_main` (new entrypoint) instead of `uvicorn app.main:app`.

**New file needed:** `ado-sync/app/watcher_main.py` — a minimal entrypoint that loads config from `.beth/ado-sync.json`, initializes ADOClient, and runs the file watcher loop.

---

## 8. Phasing

### Phase 2a: MVP (Ship First)

The minimum to make ADO Sync usable by another human.

| Item | Stories | Priority |
|------|---------|----------|
| Per-project config (`.beth/ado-sync.json`) | FR-5, FR-7, FR-13 | P0 |
| `set-ado-org` command with Entra auth | US-002, US-003, US-004, FR-1, FR-8, FR-9, FR-10, FR-11 | P0 |
| Credential storage (keychain) | FR-6 | P0 |
| Service lifecycle (`start`/`stop`/`status`) | US-005, FR-14, FR-15, FR-16 | P0 |
| Python runtime discovery + venv creation | FR-17, FR-18 | P0 |
| Watcher-only mode (no HTTP server) | AD-6 | P0 |
| `.gitignore` enforcement | FR-7 | P0 |

**MVP outcome:** A developer can run `npx beth-copilot set-ado-org`, authenticate via browser, pick their org/project, and then `npx beth-copilot ado-sync start` to begin syncing. Config lives in the project. Tokens are in keychain.

### Phase 2b: Integration & Polish

| Item | Stories | Priority |
|------|---------|----------|
| Init flow integration | US-001, FR-3 | P1 |
| Doctor checks for ADO Sync | US-006, FR-4 | P1 |
| MCP auto-configuration | US-007, FR-12 | P1 |
| PAT fallback auth | US-008 | P1 |
| `doctor --fix` for ADO Sync issues | US-006 | P1 |

**Phase 2b outcome:** ADO Sync feels like a native Beth feature. Init offers it. Doctor validates it. MCP is auto-configured. PAT works for users without Entra.

### Phase 2c: Future Considerations (Not Committed)

- Auto-start watcher when VS Code opens the project (via VS Code task or extension)
- Auto-restart on crash (supervisor/watchdog pattern)
- `ado-sync logs` command for viewing recent sync activity
- Optional Azure OpenAI configuration in the interactive setup (currently uses env vars)
- Area path and iteration path selection (interactive, from ADO metadata)
- Telemetry: sync success/failure rates, latency percentiles
- `npx beth-copilot ado-sync uninstall` — clean removal of venv, config, credentials

---

## 9. Risks and Open Questions

### Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| **Python prerequisite** — Users don't have Python 3.10+ installed | Blocks setup for some users | Medium | Clear error message with install link. Consider PyInstaller bundle in Phase 2c if this is a real barrier. |
| **Keychain unavailable** — Headless Linux servers without libsecret | Credential storage fails | Medium | Encrypted file fallback (FR-6). Env var override for CI. |
| **Entra conditional access policies** — Corporate policies block device code flow | Auth fails for some enterprises | Low-Medium | PAT fallback (US-008). Document known CA policy requirements. |
| **ADO API rate limits** — Org/project listing for large enterprises with 100+ projects | Slow or failed discovery | Low | Pagination, caching, type-to-filter UI. |
| **Background process management** — PID files, zombie processes, platform differences | Unreliable service lifecycle | Medium | Robust PID handling (FR-14/15), status checks validate process is alive (FR-16), stale PID cleanup. |
| **Cross-platform Python path** — `python3` vs `python` vs Windows `py` | Setup fails on some systems | Medium | FR-17 discovery order with clear fallback and error messaging. |

### Open Questions

**OQ-1: `keytar` vs native CLI credential helpers?**
`keytar` is a Node.js native module requiring node-gyp/build tools. Alternatively, the CLI could shell out to platform credential CLIs (`security` on macOS, `secret-tool` on Linux, `cmdkey` on Windows). Which approach is more reliable across environments?

**OQ-2: Where does the `ado-sync/` Python code live relative to the user's project?**
Currently it's in the beth repo (`ado-sync/`). For a user who installs beth-copilot via npm, the Python code needs to be either:
- (a) Bundled inside the npm package and copied to `.beth/ado-sync/` during setup.
- (b) Cloned from a separate repo during setup.
- (c) Installed via pip from PyPI.
Option (a) is simplest and most self-contained. Option (c) is cleanest but requires publishing to PyPI.

**OQ-3: How does the Python service discover `.beth/ado-sync.json`?**
The CLI starts the process with a working directory or `--config` flag pointing to the project root. The Python code needs a new config loader that reads from `.beth/ado-sync.json` with `.env` fallback.

**OQ-4: Should `ado-sync start` auto-start the watcher, or should it be event-driven (MCP tool call)?**
Two models:
- **Daemon:** Watcher runs continuously in background, auto-syncs on file change. Simple but uses resources when idle.
- **On-demand:** Beth calls the MCP `create_story_from_task` tool explicitly when starting a task. No background process needed. But requires Beth to remember to call it.
The daemon model matches the Phase 1 architecture and is more reliable. Recommend keeping it.

**OQ-5: Token refresh lifecycle — who owns it?**
If the CLI stores tokens in keychain, but the Python process needs them at runtime, who refreshes expired tokens? Options:
- (a) Python process reads from keychain, refreshes, writes back. (Requires keychain access from Python — `keyring` library.)
- (b) CLI refreshes tokens on `ado-sync start` and passes them via env var to the Python process. (Simpler but tokens expire during long sessions.)
- (c) Python process uses `azure-identity.DefaultAzureCredential` which manages its own token cache. (Cleanest — but the CLI still needs credentials for the org/project selection flow.)
Recommend (c) for the Python runtime with the CLI using MSAL for the interactive auth + discovery flow.

**OQ-6: Should we support `.env` files alongside `.beth/ado-sync.json`?**
Phase 1 uses `.env`. Should we support both forever, or deprecate `.env` after a migration period? Recommend: support both (FR-13), with `.beth/ado-sync.json` taking precedence. Document migration path. Remove `.env` support in a future major version.

---

## 10. Dependencies

### External Systems

| Dependency | Purpose | Risk |
|------------|---------|------|
| **Azure DevOps REST API v7.1** | Org listing, project listing, work item creation | Stable, well-documented. Rate limits per org. |
| **Microsoft Entra ID** | Interactive authentication, token issuance/refresh | Stable. Device code flow is GA. Conditional access policies may interfere. |
| **Azure OpenAI** (optional) | Smart story formatting (persona, effort estimation) | Optional — falls back to offline formatter. Not a hard dependency. |

### Internal Systems

| Dependency | Purpose | Notes |
|------------|---------|-------|
| **beth-copilot CLI** (`src/cli/`) | Host for new commands (`set-ado-org`, `ado-sync`) | TypeScript. Existing command pattern (init, doctor, etc.) |
| **ado-sync Python service** (`ado-sync/`) | Business logic: file watching, ADO API calls, story formatting | Must be extended to read `.beth/ado-sync.json`. New `watcher_main.py` entrypoint. |
| **BacklogMD CLI** (`backlog`) | Task status changes trigger the watcher | No changes needed. Watcher reads task files directly. |
| **VS Code MCP config** | Agent tool access to ADO Sync | CLI auto-configures the MCP entry. |

### Node.js Libraries (New)

| Library | Purpose | Notes |
|---------|---------|-------|
| `@azure/msal-node` | Entra ID device code auth flow | Official Microsoft library. Well-maintained. |
| `keytar` or `@aspect-build/secret_store` | OS keychain access | Evaluate native dependency burden. |
| `inquirer` or `@inquirer/prompts` | Interactive org/project selection prompts | May already be a dependency. Check. |

### Python Libraries (Existing + New)

| Library | Purpose | Status |
|---------|---------|--------|
| `azure-identity` | Entra token management in Python runtime | Already in `requirements.txt` |
| `azure-devops` | ADO API client (could replace raw httpx calls) | Evaluate vs current httpx approach |
| `keyring` | Keychain access from Python (if needed) | Only if Python needs to read/write keychain |
| `watchfiles` | File system watcher | Already in `requirements.txt` |

---

## 11. Success Metrics

| Metric | Target | How to Measure |
|--------|--------|----------------|
| **Setup completion rate** | >80% of users who start `set-ado-org` complete it | CLI telemetry (opt-in) or user feedback |
| **Time to first sync** | <2 minutes from starting `set-ado-org` to first ADO story created | Manual testing during development |
| **Zero secrets in git** | 0 instances of tokens/PATs found in committed files | Automated secret scanning in CI |
| **Cross-platform success** | Works on macOS, Linux (incl. WSL), Windows | E2E test matrix |
| **Doctor detection rate** | Doctor catches 100% of misconfigurations | Unit tests for each doctor check |
| **No Phase 1 regression** | Existing `.env`-based deployments continue working | Integration test with `.env` config path |
| **User re-auth frequency** | <1 re-auth per 30 days (token refresh works) | Log analysis from watcher |

---

## 12. Implementation Notes for Developers

### CLI Changes (TypeScript)

New files to create:
- `src/cli/commands/set-ado-org.ts` — Interactive auth + org/project selection
- `src/cli/commands/ado-sync.ts` — Service lifecycle (start/stop/status)
- `src/cli/lib/adoAuth.ts` — Entra device code flow + token management
- `src/cli/lib/adoDiscovery.ts` — ADO org/project listing APIs
- `src/cli/lib/credentials.ts` — Keychain read/write abstraction

Files to modify:
- `src/cli/commands/init.ts` (or wherever `init` logic lives) — Add ADO Sync prompt
- `src/cli/commands/doctor.ts` — Add ADO Sync health checks
- CLI entry point — Register new commands

### Python Changes

New files:
- `ado-sync/app/watcher_main.py` — Standalone watcher entrypoint (no FastAPI)
- `ado-sync/app/config_v2.py` — Config loader that reads `.beth/ado-sync.json` with `.env` fallback

Files to modify:
- `ado-sync/app/config.py` — Add `.beth/ado-sync.json` config source (or refactor to use `config_v2.py`)
- `ado-sync/app/ado_client.py` — Support credential loading from keychain/env in addition to settings object

### Config File Templates

`.beth/ado-sync.json` (written by CLI during setup):
```json
{
  "version": 1,
  "organization": "contoso",
  "project": "TeamAlpha",
  "areaPath": "",
  "iterationPath": "",
  "authMethod": "entra",
  "tenantId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "taskPrefix": "BETH",
  "tasksDir": "./backlog/tasks"
}
```

`.gitignore` addition:
```
# Beth local config (credentials, PID files, venv)
.beth/
```
