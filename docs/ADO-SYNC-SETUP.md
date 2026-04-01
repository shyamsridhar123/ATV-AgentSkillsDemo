# ADO Sync Setup Guide

Automatically creates Azure DevOps user stories the moment Beth starts work on a Backlog.md task. No manual data entry. No copy-paste. Your client's ADO board reflects reality in real time.

---

## Prerequisites

Before you start, make sure you have:

| Requirement | Minimum Version | How to Check |
|-------------|----------------|--------------|
| **Node.js** | 18+ | `node --version` |
| **Python** | 3.10+ | `python3 --version` |
| **Azure DevOps access** | — | Can you log into `dev.azure.com/<your-org>`? |
| **Authentication** | Entra ID (recommended) or Personal Access Token (PAT) | See [Authentication Methods](#authentication-methods) below |

### Authentication Methods

**Entra ID (recommended)** — Uses Microsoft's device code flow. You'll see a code in the terminal, open a browser link, and sign in with your corporate/personal Microsoft account. Tokens refresh automatically via MSAL cache.

**Personal Access Token (PAT)** — Fallback when Entra ID isn't available (e.g., no browser access, service accounts). Generate one at `https://dev.azure.com/<your-org>/_usersSettings/tokens` with these scopes:
- **Work Items**: Read & Write
- **Project and Team**: Read

---

## Step-by-Step Setup

### 1. Initialize Beth (if you haven't already)

```bash
npx beth-copilot init
```

This installs agents, skills, and creates the project structure.

### 2. Configure your ADO organization

```bash
npx beth-copilot set-ado-org
```

This interactive command walks you through:

1. **Credential check** — Reuses existing credentials if valid
2. **Authentication** — Entra ID device code flow (or PAT fallback if Entra fails)
3. **Organization discovery** — Lists your ADO organizations
4. **Organization selection** — Pick the one to sync with
5. **Project selection** — Choose the project within that org
6. **Config saved** — Written to `.beth/ado-sync.json`

**Expected terminal output (Entra ID flow):**

```
  ADO Sync Configuration
  ─────────────────────

  Checking credentials...

  No valid credentials found. Starting Entra ID authentication...
  (This will open a browser-based login flow)

  To sign in, use a web browser to open the page https://microsoft.com/devicelogin
  and enter the code ABCD1234 to authenticate.

  ✓ Authenticated as you@example.com

  Discovering ADO organizations...

  Select an organization:

    1. my-company
    2. my-side-project

  Organization (1-2): 1

  Loading projects for my-company...

  Select a project:

    1. ProjectAlpha — Main product development
    2. ProjectBeta — Internal tooling

  Project (1-2): 1

  Saving configuration...
  ✓ MCP server entry added in .vscode/mcp.json

  ✓ ADO Sync configured!
  Organization: my-company
  Project:      ProjectAlpha
  Auth:         entra
  Config:       .beth/ado-sync.json

  Next steps:
  Run npx beth-copilot ado-sync start to begin syncing
```

**Expected terminal output (PAT fallback):**

If Entra ID authentication fails, you'll be prompted to use a PAT instead:

```
  Entra auth failed. Enter a PAT instead?
  Use Personal Access Token? [y/N] y
  ADO organization name: my-company

  Generate a PAT at: https://dev.azure.com/<org>/_usersSettings/tokens
  Required scopes: Work Items (Read, Write), Project and Team (Read)

  Personal Access Token: ********

  Validating PAT...
  ✓ PAT validated and stored for my-company
```

### 3. Start the sync watcher

```bash
npx beth-copilot ado-sync start
```

**Expected output:**

```
ADO Sync watcher started (PID 12345).
```

The watcher runs as a background process. It monitors `backlog/tasks/` for status changes and automatically creates/updates Azure DevOps user stories.

### 4. Check watcher status

```bash
npx beth-copilot ado-sync status
```

**Expected output:**

```
State:    running
PID:      12345
Org:      my-company
Project:  ProjectAlpha
Auth:     entra
```

### 5. Stop the watcher

When you're done for the day:

```bash
npx beth-copilot ado-sync stop
```

**Expected output:**

```
ADO Sync watcher stopped (was PID 12345).
```

---

## How It Works

Once the watcher is running:

1. **Beth sets a task to "In Progress"** via `backlog task edit BETH-X -s "In Progress"`
2. **The watcher detects the file change** in `backlog/tasks/`
3. **Azure OpenAI formats the task** into a proper ADO user story (persona-based description, Fibonacci effort estimate, bulleted acceptance criteria)
4. **A User Story is created in Azure DevOps** with state "Active"
5. **When Beth lands the plane** (commit + push + PR), the story gets enriched with commit links and PR URL, and moves to "Resolved"

The result: your client's ADO board reflects reality without anyone doing manual data entry.

---

## Troubleshooting

### Python not found

**Error:** `No suitable Python found` or `python3: command not found`

**Fix:**
- Install Python 3.10 or later from [python.org](https://www.python.org/downloads/)
- On macOS: `brew install python@3.12`
- On Ubuntu/Debian: `sudo apt install python3`
- Verify: `python3 --version` should show 3.10+

Beth will create a virtual environment automatically at `.beth/venv/` when you run `ado-sync start`.

### Authentication error (Entra ID)

**Error:** `Device code auth timed out` or authentication failure

**Fix:**
- Make sure you opened the browser link and entered the code within 2 minutes
- Check that your Microsoft account has access to the ADO organization
- If your organization uses conditional access policies, you may need to use a PAT instead
- Try again: `npx beth-copilot set-ado-org`

### Authentication error (PAT)

**Error:** `PAT is invalid or has expired` (401/403)

**Fix:**
- Generate a new PAT at `https://dev.azure.com/<org>/_usersSettings/tokens`
- Ensure scopes include **Work Items (Read, Write)** and **Project and Team (Read)**
- Check that the PAT hasn't expired
- Re-run: `npx beth-copilot set-ado-org`

### Organization not found

**Error:** `No Azure DevOps organizations found for this account`

**Fix:**
- Verify you can log into `https://dev.azure.com/<your-org>` in a browser
- Check that your Entra account is linked to the ADO organization
- If using a PAT, double-check the organization name matches exactly (case-sensitive)
- For PAT auth, the organization name is the part after `dev.azure.com/` in your ADO URL

### Watcher won't start

**Error:** `ado-sync Python package not found` or process fails immediately

**Fix:**
- Ensure beth-copilot is installed (not just cloned): `npm install -g beth-copilot`
- Check that `.beth/ado-sync.json` exists: `npx beth-copilot ado-sync status`
- If config is missing, reconfigure: `npx beth-copilot set-ado-org`

---

## FAQ

### How do I change my organization or project?

Re-run the setup command to reconfigure. It will detect your existing configuration and ask if you want to change it:

```bash
npx beth-copilot set-ado-org
```

You'll see:

```
  Currently configured: my-company/ProjectAlpha
  Auth method: entra

  Change configuration? [y/N]
```

### How do I stop syncing?

Run `npx beth-copilot ado-sync stop` to stop the watcher process. Stories already created in ADO will remain — stopping the watcher just prevents new stories from being created.

To disable syncing permanently, stop the watcher and delete `.beth/ado-sync.json`.

### Where does the config live?

Configuration is stored at `.beth/ado-sync.json` in your project root. This file contains:

- Organization name
- Project name
- Auth method (entra or pat)
- Task prefix and directory paths
- AI formatting settings

**This file contains NO secrets.** It's safe to inspect but is gitignored by default since it's user-specific.

### What gets created in Azure DevOps?

When a Backlog.md task moves to "In Progress", ADO Sync creates a **User Story** work item in your selected project with:

- **Title** — Derived from the task title
- **Description** — AI-generated persona-based narrative ("As a [role], I want to [goal]...")
- **Acceptance Criteria** — Converted from the task's acceptance criteria
- **Effort (Story Points)** — AI-estimated on the Fibonacci scale (1, 2, 3, 5, 8, 13, 21)
- **State** — "Active" when work starts, "Resolved" when the PR is created

### Can I use this in CI/CD?

Yes. Set the `BETH_ADO_PAT` environment variable with a Personal Access Token. The credential store checks environment variables first, so no interactive auth is needed.

---

## Security

### Where credentials are stored

| Credential | Location | Permissions |
|-----------|----------|-------------|
| **Entra tokens** | `.beth/msal_token_cache.json` | MSAL-managed cache |
| **PAT** | `.beth/pat_credential` | `0600` (owner read/write only) |
| **Config** | `.beth/ado-sync.json` | No secrets stored here |

### What's safe to commit

The **entire `.beth/` directory is gitignored** by default. Beth adds `.beth/` to your `.gitignore` during setup. This means:

- `.beth/ado-sync.json` — gitignored (user-specific config)
- `.beth/msal_token_cache.json` — gitignored (auth tokens)
- `.beth/pat_credential` — gitignored (PAT storage)
- `.beth/ado-sync.pid` — gitignored (process state)
- `.beth/venv/` — gitignored (Python virtual environment)

**Do not commit tokens, PATs, or any credential files.** The `.beth/` gitignore entry prevents this by default, but if you've customized your `.gitignore`, verify that `.beth/` is listed.

### Environment variables

For CI/automation, credentials can be passed via environment variables instead of stored files:

| Variable | Purpose |
|----------|---------|
| `BETH_ADO_PAT` | Personal Access Token for ADO API calls |
| `BETH_ADO_TOKEN` | Alias for `BETH_ADO_PAT` |

These take precedence over all stored credentials.
