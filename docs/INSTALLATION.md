# Beth Installation Guide

> *"I don't do half-measures. Neither should your setup."*

This guide gets you from zero to running Beth in under 10 minutes.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Installation](#installation)
3. [VS Code Setup](#vs-code-setup)
4. [Issue Tracking Setup](#issue-tracking-setup)
5. [Optional: MCP Servers](#optional-mcp-servers)
6. [Verify Installation](#verify-installation)
7. [Your First Task](#your-first-task)
8. [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before you start, you need:

| Requirement | Version | How to Check |
|-------------|---------|--------------|
| **VS Code** | 1.95+ | `code --version` |
| **GitHub Copilot** | Latest | VS Code Extensions panel |
| **GitHub Copilot Chat** | Latest | VS Code Extensions panel |
| **Node.js** | 18+ | `node --version` |
| **Git** | 2.30+ | `git --version` |

### Installing Prerequisites

**VS Code:**
- Download from [code.visualstudio.com](https://code.visualstudio.com/)
- Or via package manager:
  ```bash
  # Windows
  winget install Microsoft.VisualStudioCode
  
  # macOS
  brew install --cask visual-studio-code
  
  # Linux
  sudo snap install code --classic
  ```

**GitHub Copilot Extensions:**
1. Open VS Code
2. Go to Extensions (`Ctrl+Shift+X` / `Cmd+Shift+X`)
3. Search and install:
   - `GitHub Copilot`
   - `GitHub Copilot Chat`
4. Sign in with your GitHub account (requires Copilot subscription)

**Node.js:**
```bash
# Windows
winget install OpenJS.NodeJS.LTS

# macOS
brew install node

# Linux
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs
```

---

## Installation

### Option A: npx (Recommended - One Command)

The fastest way to add Beth to any project:

```bash
# Navigate to your project
cd your-project

# Run the installer
npx beth-copilot init
```

That's it. Beth and her team are now installed in your project.

**Options:**

```bash
npx beth-copilot init --force        # Overwrite existing files
npx beth-copilot init --skip-beads   # Don't initialize beads
npx beth-copilot init --skip-mcp     # Don't create mcp.json.example
npx beth-copilot help                # Show all options
```

### Option B: Clone the Repository (For New Projects)

```bash
# Clone Beth
git clone https://github.com/stephschofield/beth.git my-project
cd my-project

# Remove the existing git history if you want a fresh start
rm -rf .git
git init
git add -A
git commit -m "Initial commit with Beth agent system"

# Initialize beads for issue tracking
bd init
```

### Option C: Add Beth to an Existing Project (Manual)

```bash
# From your project root
cd your-existing-project

# Download just the Beth system files
git clone --depth 1 https://github.com/stephschofield/beth.git temp-beth

# Copy the required files
cp -r temp-beth/.github .
cp temp-beth/AGENTS.md .

# Clean up
rm -rf temp-beth

# Initialize beads for issue tracking
bd init

# Commit the additions
git add -A
git commit -m "Add Beth agent system"
```

### Option D: Manual Setup (Copy Files)

If you prefer manual control, copy these directories/files to your project:

```
your-project/
├── .github/
│   ├── agents/              # All agent definitions
│   │   ├── beth.agent.md
│   │   ├── developer.agent.md
│   │   ├── product-manager.agent.md
│   │   ├── researcher.agent.md
│   │   ├── security-reviewer.agent.md
│   │   ├── tester.agent.md
│   │   └── ux-designer.agent.md
│   ├── skills/              # All skill definitions
│   │   ├── framer-components/
│   │   ├── prd/
│   │   ├── security-analysis/
│   │   ├── shadcn-ui/
│   │   ├── vercel-react-best-practices/
│   │   └── web-design-guidelines/
│   └── copilot-instructions.md
├── .vscode/
│   └── settings.json        # Recommended VS Code settings
├── .beads/                  # Issue tracking database (created by bd init)
└── AGENTS.md                # Agent workflow documentation
```

---

## VS Code Setup

### 1. Open Your Project

```bash
code your-project
```

### 2. Enable Agent Mode

Copilot Chat needs to be in **Agent Mode** to use custom agents:

1. Open Copilot Chat (`Ctrl+Alt+I` / `Cmd+Alt+I`)
2. Look for the mode selector at the bottom of the chat panel
3. Select **"Agent"** mode (not "Chat" or "Edit")

### 3. Verify Agents Are Loaded

In Copilot Chat, type `@` and you should see Beth and her team:

```
@Beth
@product-manager
@researcher
@ux-designer
@developer
@security-reviewer
@tester
```

If you don't see them, ensure:
- You have the `.github/agents/` folder with `.agent.md` files
- VS Code has reloaded (try `Developer: Reload Window`)
- You're in Agent mode, not Chat mode

### 4. Enable Subagent Delegation (Auto-configured)

Beth orchestrates work by delegating to specialized agents like `@developer`, `@tester`, etc. 

**Good news:** When you install via `npx beth-copilot init`, this is already enabled in `.vscode/settings.json`.

If you installed manually, add to your `.vscode/settings.json`:

```json
{
  "chat.customAgentInSubagent.enabled": true
}
```

### 5. Recommended Settings (Auto-configured)

The `npx beth-copilot init` command automatically creates `.vscode/settings.json` with these settings:

```json
{
  "chat.customAgentInSubagent.enabled": true,
  "chat.agent.enabled": true,
  "github.copilot.chat.agent.thinkingTool": true,
  "github.copilot.chat.localeOverride": "en"
}
```

If you installed manually, create this file yourself.

---

## Issue Tracking Setup

Beth uses [beads](https://github.com/steveyegge/beads) (`bd`) for issue tracking. It provides dependency-aware issue management designed for AI agents.

### Install Beads

```bash
curl -fsSL https://raw.githubusercontent.com/steveyegge/beads/main/scripts/install.sh | bash
```

### Initialize in Your Project

```bash
cd your-project
bd init
```

### Verify Setup

```bash
bd doctor
```

### Quick Reference

```bash
# Create an issue
bd create "Issue title" --description="What needs to be done"

# List issues
bd list

# Show ready work (no blockers)
bd ready

# Show issue details
bd show <id>

# Mark in progress
bd update <id> -l in_progress

# Close an issue
bd close <id>
```

### Workflow

1. Check available work: `bd ready` or `bd list`
2. Claim work: `bd update <id> -l in_progress`
3. Do the work
4. Complete: `bd close <id>`
5. Commit and push

See [steveyegge/beads](https://github.com/steveyegge/beads) for full documentation.

---

## Optional: MCP Servers

MCP (Model Context Protocol) servers extend agent capabilities. All are **optional**—agents work fine without them.

### Quick Setup

```bash
# Copy the example config
cp mcp.json.example .vscode/mcp.json
```

### Available Servers

| Server | Purpose | Agent | Setup |
|--------|---------|-------|-------|
| **shadcn/ui** | Component browsing | Frontend Engineer | `npx shadcn@latest mcp init --client vscode` |
| **Playwright** | Browser automation | Tester | Add to mcp.json |
| **Azure** | Cloud management | Developer | `az login` first |
| **Web Search** | Internet research | Researcher | Needs API key |

### shadcn/ui (Recommended)

```bash
npx shadcn@latest mcp init --client vscode
```

Or add to `.vscode/mcp.json`:
```json
{
  "servers": {
    "shadcn": {
      "command": "npx",
      "args": ["shadcn@latest", "mcp"]
    }
  }
}
```

### Full MCP Configuration

See [docs/MCP-SETUP.md](MCP-SETUP.md) for detailed setup of all servers.

---

## Verify Installation

Run through this checklist:

### ✅ Agents Available

In Copilot Chat (Agent mode), type `@B` and verify you see `@Beth`.

### ✅ Beth Responds

```
@Beth What agents do I have available?
```

She should list her team.

### ✅ Skills Load

```
@developer Create a simple React component
```

The developer should reference React best practices.

### ✅ Beads Works

```bash
bd list
```

Should run without errors (empty list is fine for a new project).

### ✅ File Operations Work

```
@Beth List the files in this project
```

She should be able to see your project structure.

---

## Your First Task

Now let's put Beth to work:

### Example 1: Get Oriented

```
@Beth What's in this codebase? Give me the lay of the land.
```

### Example 2: Plan a Feature

```
@Beth I need a user authentication system with JWT tokens and refresh flow. Plan this out.
```

### Example 3: Direct Work

```
@developer Create a Button component using shadcn/ui patterns with variants for primary, secondary, and destructive states.
```

### Example 4: Security Review

```
@security-reviewer Review our authentication flow for OWASP Top 10 vulnerabilities.
```

### Example 5: Full Workflow

```
@Beth Build me a dashboard showing user analytics. I want charts, a data table, and real-time updates.
```

Beth will:
1. Route to Product Manager for requirements
2. Send to UX Designer for layout
3. Deploy Frontend Engineer for implementation
4. Have Tester verify accessibility
5. Get Security Reviewer sign-off

---

## Troubleshooting

### Agents Not Appearing

**Symptom:** `@Beth` doesn't appear when typing `@` in Chat

**Solutions:**
1. Ensure you're in **Agent mode**, not Chat mode
2. Verify `.github/agents/beth.agent.md` exists
3. Reload VS Code: `Developer: Reload Window`
4. Check Copilot is signed in and active

### "Agent not found" Error

**Symptom:** Error when invoking an agent

**Solutions:**
1. Check the agent file exists in `.github/agents/`
2. Verify YAML frontmatter is valid (no syntax errors)
3. Ensure file extension is `.agent.md`

### Skills Not Loading

**Symptom:** Agent doesn't use specialized knowledge

**Solutions:**
1. Verify skill folder exists in `.github/skills/`
2. Check `SKILL.md` file exists in the skill folder
3. Use trigger phrases from the skill description

### MCP Server Issues

**Symptom:** MCP features not working

**Solutions:**
1. Check VS Code Output → "MCP Servers" for errors
2. Verify `.vscode/mcp.json` syntax is valid
3. Ensure required tools (npx, az) are in PATH
4. Check API keys are set in environment

### Git/Push Issues

**Symptom:** Beth can't commit or push

**Solutions:**
1. Verify git is initialized: `git status`
2. Check remote is set: `git remote -v`
3. Ensure you have push permissions
4. Check for uncommitted changes conflicts

### Beads Issues

**Symptom:** `bd` commands fail

**Solutions:**
1. Verify beads is installed: `which bd` or `bd --version`
2. Initialize beads in project: `bd init`
3. Run diagnostics: `bd doctor`
4. Check PATH includes `~/.local/bin`

### Windows Path Issues

**Symptom:** Path errors in Git Bash on Windows

**Solutions:**
1. Use PowerShell instead of Git Bash for some operations
2. Avoid paths with spaces when possible
3. Use forward slashes in commands: `/c/Users/...`

---

## Updating Beth

To get the latest agents and skills:

```bash
# If you cloned the repo
git pull origin main

# If you copied files, re-download
git clone --depth 1 https://github.com/stephschofield/beth.git temp-beth
cp -r temp-beth/.github/* .github/
rm -rf temp-beth
```

---

## What's Next?

- **Read the [README](../README.md)** for Beth's philosophy and workflows
- **Check [MCP-SETUP.md](MCP-SETUP.md)** for optional tool integrations
- **Review [AGENTS.md](../AGENTS.md)** for agent workflow details
- **Explore `.github/skills/`** to see available domain knowledge

---

*"Installation complete. Now let's get to work."*
