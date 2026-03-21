# ADO Sync

Automatically creates Azure DevOps user stories the moment Beth starts work on a BacklogMD task. No manual tracking. No developer friction. Your client's ADO board reflects reality in real time.

## The Flow

```
You: "Beth, what's next?"
Beth: "Task 62 -- Implement auth middleware"
You: "Go on task 62."

    ↓ Beth sets task to "In Progress" via backlog CLI
    ↓ BacklogMD status change triggers ADO Sync
    ↓ ADO Sync reads the task markdown (title, description, acceptance criteria)
    ↓ Azure OpenAI formats it into a proper ADO user story
      (persona-based description, Fibonacci effort estimate, bulleted AC)
    ↓ User Story is created in Azure DevOps, state = "Active"
    ↓ Client sees it on their board immediately

You: "Land the plane."

    ↓ Beth commits, pushes, opens PR
    ↓ GitHub webhook fires
    ↓ ADO Sync updates the user story with commit links + PR URL
    ↓ Story state moves to "Resolved"
    ↓ Client sees completed work with full traceability
```

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    ADO Sync Service                  │
│                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │   Triggers    │  │  AI Formatter │  │  ADO Client │ │
│  │              │  │              │  │            │ │
│  │ - Backlog    │  │ - Azure AOAI │  │ - REST API │ │
│  │   file watch │──│ - Story fmt  │──│ - v7.1     │ │
│  │ - GitHub     │  │ - Fibonacci  │  │ - PAT auth │ │
│  │   webhooks   │  │ - Persona    │  │            │ │
│  └──────────────┘  └──────────────┘  └────────────┘ │
│                                                      │
│  ┌──────────────┐  ┌──────────────────────────────┐  │
│  │  FastMCP     │  │  FastAPI                     │  │
│  │  (agents)    │  │  (webhooks + REST)           │  │
│  └──────────────┘  └──────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

- **FastAPI** handles GitHub webhooks and direct REST calls
- **FastMCP** exposes tools so Beth can call ADO Sync directly
- **Azure OpenAI** transforms BacklogMD task data into formatted ADO user stories
- **Azure DevOps REST API v7.1** creates/updates work items and links commits

## Two Triggers

### 1. Backlog File Watcher (primary -- story creation)
Watches the `backlog/tasks/` directory for status changes. When a task moves to "In Progress", ADO Sync reads the task markdown and creates a user story.

### 2. GitHub Webhook (secondary -- story enrichment)
When Beth opens a PR via `beth land`, the webhook enriches the existing ADO story with commit links, PR URL, and moves it to "Resolved".

## User Story Format

Every generated story follows this structure:

**Title:** Derived from the BacklogMD task title

**Effort (Story Points):** Fibonacci scale (1, 2, 3, 5, 8, 13, 21)

**Description:**
> As a [persona], I want to [objective] in order to [key results].

**Acceptance Criteria:**
- Criterion from BacklogMD task acceptance criteria
- Additional criteria inferred from task description
- Validation/testing criteria

**GitHub Links:** Commits and PR linked to the work item for full traceability.

## Setup

### 1. Install

```bash
pip install -r requirements.txt
```

### 2. Configure

```bash
cp .env.example .env
# Fill in your values (see .env.example for docs)
```

### 3. Run

```bash
# Option A: FastAPI server (webhooks + REST + file watcher)
uvicorn app.main:app --host 0.0.0.0 --port 8000

# Option B: MCP server (for Beth/agent access)
python -m app.mcp_server
```

### 4. GitHub Webhook (for PR enrichment)

Point your repo webhook to `https://your-host:8000/webhooks/github`:
- Content type: `application/json`
- Events: Pull requests
- Secret: your `GITHUB_WEBHOOK_SECRET`

## MCP Tools

| Tool | Description |
|------|-------------|
| `create_story_from_task` | Creates an ADO user story from a BacklogMD task ID |
| `update_story_with_pr` | Enriches an existing story with PR/commit data |
| `get_story_status` | Checks if a story already exists for a given task |
| `list_recent_stories` | Lists recently created ADO stories |

## Project Structure

```
ado-sync/
├── app/
│   ├── main.py              # FastAPI app + GitHub webhook handler
│   ├── mcp_server.py        # FastMCP server for agent access
│   ├── backlog_watcher.py   # File watcher for backlog task status changes
│   ├── backlog_parser.py    # Parses BacklogMD task markdown files
│   ├── story_formatter.py   # Azure OpenAI -- formats tasks into ADO stories
│   ├── ado_client.py        # Azure DevOps REST API client
│   ├── config.py            # Environment config + validation
│   └── models.py            # Pydantic models
├── tests/
│   └── test_story_formatter.py
├── .env.example
├── requirements.txt
└── README.md
```
