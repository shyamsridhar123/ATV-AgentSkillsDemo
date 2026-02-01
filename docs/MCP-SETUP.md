# MCP Server Setup Guide

> *"Optional tools that make your agents smarter. Skip what you don't need."*

Model Context Protocol (MCP) servers extend agent capabilities with external tools and data sources. All MCPs are **optional**—agents gracefully degrade without them.

---

## Quick Start

All MCP servers are configured in `.vscode/mcp.json`. Copy from the example and enable what you need:

```bash
cp mcp.json.example .vscode/mcp.json
```

Then add servers as needed.

---

## Available MCP Servers

| Server | Purpose | Used By |
|--------|---------|---------|
| **shadcn/ui** | Component browsing, installation | Frontend Engineer |
| **Playwright** | Browser automation, E2E testing | Tester, Frontend Engineer |
| **Azure** | Cloud resource management | Developer, Security Reviewer |
| **Microsoft Learn** | Documentation access | All agents |
| **Web Search** | Internet research | Researcher |

---

## Server Configurations

### shadcn/ui (Recommended)

Browse and install UI components directly from the shadcn registry.

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

**First-time setup:**
```bash
npx shadcn@latest mcp init --client vscode
```

**Without MCP:** Use CLI commands instead:
- `npx shadcn@latest add button`
- `npx shadcn@latest diff`

---

### Playwright (Testing)

Browser automation for E2E tests and visual regression.

```json
{
  "servers": {
    "playwright": {
      "command": "npx",
      "args": ["@anthropic-ai/mcp-server-playwright"]
    }
  }
}
```

**Capabilities:**
- Navigate to URLs
- Take screenshots
- Click elements
- Fill forms
- Execute JavaScript

**Without MCP:** Write standard Playwright test files:
```typescript
import { test, expect } from '@playwright/test';
```

---

### Azure (Cloud Operations)

Manage Azure resources, deployments, and security configurations.

```json
{
  "servers": {
    "azure": {
      "command": "npx",
      "args": ["@azure/mcp-server"],
      "env": {
        "AZURE_SUBSCRIPTION_ID": "${env:AZURE_SUBSCRIPTION_ID}"
      }
    }
  }
}
```

**Prerequisites:**
1. Install Azure CLI: `winget install Microsoft.AzureCLI`
2. Login: `az login`
3. Set subscription: `az account set --subscription <id>`

**Capabilities:**
- Resource management
- Deployment operations
- Security configuration
- Cost analysis

**Without MCP:** Use Azure CLI directly or Azure Portal.

---

### Microsoft Learn (Documentation)

Access Microsoft documentation and learning paths.

```json
{
  "servers": {
    "microsoft-learn": {
      "command": "npx",
      "args": ["@microsoft/mcp-server-learn"]
    }
  }
}
```

**Capabilities:**
- Search documentation
- Retrieve code samples
- Access best practices
- Find troubleshooting guides

**Without MCP:** Search docs.microsoft.com manually.

---

### Web Search (Research)

Internet search for competitive analysis and research.

```json
{
  "servers": {
    "web-search": {
      "command": "npx",
      "args": ["@anthropic-ai/mcp-server-brave-search"],
      "env": {
        "BRAVE_API_KEY": "${env:BRAVE_API_KEY}"
      }
    }
  }
}
```

**Prerequisites:**
1. Get API key from [Brave Search API](https://brave.com/search/api/)
2. Set environment variable: `BRAVE_API_KEY`

**Without MCP:** Researcher agent will ask you to provide information or use web tool if available.

---

## Complete Configuration Example

`.vscode/mcp.json`:
```json
{
  "$schema": "https://code.visualstudio.com/docs/copilot/chat/mcp-servers",
  "servers": {
    "shadcn": {
      "command": "npx",
      "args": ["shadcn@latest", "mcp"]
    },
    "playwright": {
      "command": "npx",
      "args": ["@anthropic-ai/mcp-server-playwright"]
    },
    "azure": {
      "command": "npx",
      "args": ["@azure/mcp-server"],
      "env": {
        "AZURE_SUBSCRIPTION_ID": "${env:AZURE_SUBSCRIPTION_ID}"
      }
    },
    "web-search": {
      "command": "npx",
      "args": ["@anthropic-ai/mcp-server-brave-search"],
      "env": {
        "BRAVE_API_KEY": "${env:BRAVE_API_KEY}"
      }
    }
  }
}
```

---

## Graceful Degradation

Every agent works without MCPs. Here's how they adapt:

| Agent | With MCP | Without MCP |
|-------|----------|-------------|
| **Frontend Engineer** | Browses shadcn registry | Uses CLI commands |
| **Tester** | Automates browser directly | Writes test files for you to run |
| **Developer** | Manages Azure resources | Provides CLI commands |
| **Researcher** | Searches the web | Asks you for information |
| **Security Reviewer** | Queries Azure security | Reviews code and configs only |

---

## Troubleshooting

### MCP server not starting
1. Check VS Code Output panel → "MCP Servers"
2. Verify npm/npx is in PATH
3. Try running the command manually in terminal

### Authentication issues (Azure)
```bash
az login
az account show  # Verify correct subscription
```

### API key errors (Web Search)
```bash
echo $BRAVE_API_KEY  # Should show your key
```

### Server timeout
Some MCPs take time to initialize. VS Code shows status in the MCP Servers output.

---

## Security Notes

- **Never commit API keys.** Use environment variables.
- **Azure MCP** uses your logged-in Azure CLI credentials.
- **Web Search** queries are sent to Brave's API.
- **Playwright** can execute JavaScript on pages—use carefully.

---

*"Tools are optional. Results aren't."*
