---
name: azure-operations
description: Azure resource management via Azure MCP Server
triggers:
  - azure resource
  - azure deployment
  - azure storage
  - cosmos db
  - key vault
  - deploy to azure
---

# Azure Operations Skill

## When to Use
Use this skill when you need to:
- Manage Azure resources (storage, databases, compute)
- Deploy applications to Azure services
- Query Azure security configurations
- Access Azure Key Vault secrets

## MCP Check (Run First)
Before using Azure tools, verify:
1. Azure MCP extension installed in VS Code
2. User authenticated: `az login`
3. Subscription selected: `az account show`

## Supported Services (41+)
| Category | Services |
|----------|----------|
| **Compute** | App Service, Container Apps, AKS, Functions |
| **Data** | Cosmos DB, SQL Database, Storage, Data Explorer |
| **AI/ML** | Microsoft Foundry, AI Search, Speech Services |
| **Security** | Key Vault, RBAC, Confidential Ledger |
| **DevOps** | Container Registry, Event Grid, Service Bus |

## Common Operations

### Resource Discovery
- "List my resource groups"
- "Show storage accounts in subscription"
- "Get details for Cosmos DB account"

### Security Operations
- "List Key Vault secrets in vault X"
- "Show RBAC assignments for resource group Y"
- "Check Advisor recommendations"

### Deployment
- "Create storage account in East US"
- "Deploy container app from image X"

## Graceful Degradation
If MCP unavailable, generate Azure CLI commands:
```bash
# Resource listing
az storage account list
az group list

# Security
az keyvault secret list --vault-name myvault
az role assignment list --scope /subscriptions/<id>

# Deployment
az group create --name mygroup --location eastus
az storage account create --name mystorageacct --resource-group mygroup
```

## Security Notes
- Azure MCP uses your Azure CLI credentials
- Apply least-privilege RBAC roles
- Review operations before confirming destructive actions
- Never expose connection strings or keys in code

## Configuration
Install via VS Code extension: `ms-azuretools.vscode-azure-mcp-server`
See docs/MCP-SETUP.md for setup.
