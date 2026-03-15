# Beth Agent Swarm — Architecture Plan

> *"I'm not here to wreck one thing. When I fix this, I'm fixing it for generations."*

**Status:** Plan — not yet implemented (open questions resolved, implementation phases defined)  
**Date:** 2026-03-15 (updated 2026-03-15: aligned message board schema with Pied Piper source code)  
**Supersedes:** [DOCKER-SWARM.md](DOCKER-SWARM.md) (conceptual Docker/Redis approach — abandoned in favor of this design)

---

## TL;DR

Refactor Beth from a Copilot-hosted agent (synchronous `runSubagent()` calls inside VS Code) into a **persistent Python daemon swarm** where Beth orchestrates autonomous worker agents. Each worker runs in its own **git worktree**, communicates via a **SQLite WAL message board** (based on Pied Piper's channel/post model, with task-specific extensions), and calls **Azure OpenAI directly** for LLM inference. All existing logic, handoffs, skills, and agent roles are preserved.

---

## Table of Contents

1. [Why](#why)
2. [Key Architectural Decisions](#key-architectural-decisions)
3. [Current Architecture (What We're Leaving)](#current-architecture)
4. [Target Architecture (What We're Building)](#target-architecture)
5. [Message Board (SQLite WAL)](#message-board)
6. [Git Worktree Isolation](#git-worktree-isolation)
7. [Merge Conflict Resolution](#merge-conflict-resolution)
8. [LLM Client (Provider-Abstracted)](#llm-client-provider-abstracted)
9. [Agent Roles & Skills (Preserved)](#agent-roles--skills)
10. [Orchestrator (Beth)](#orchestrator)
11. [Worker Agent Loop](#worker-agent-loop)
12. [Context Window Management](#context-window-management)
13. [Module Map](#module-map)
14. [Migration Path](#migration-path)
15. [Phased Implementation](#phased-implementation)
16. [What We're Dropping](#what-were-dropping)
17. [What We're Keeping](#what-were-keeping)
18. [Open Questions (Resolved)](#open-questions-resolved)
19. [Competitive Intelligence](#competitive-intelligence)

---

## Why

The current Beth system runs inside GitHub Copilot's agent mode. That gives us:

- **Sequential execution only** — `runSubagent()` is blocking, request/response, one-at-a-time
- **No persistence** — agents die when the chat session ends; context is gone
- **No true parallelism** — can't have two agents working simultaneously on different files
- **Copilot session constraints** — token lifecycle tied to VS Code, no daemon capability
- **Beads is broken** — single-writer JSONL with no locking, race conditions, data loss, metadata corruption

What we need:

- **Concurrent workers** — multiple agents building in parallel on isolated branches
- **Persistent orchestration** — Beth runs as a daemon, survives session boundaries
- **Durable coordination** — message board with real concurrency guarantees (SQLite WAL)
- **Direct LLM access** — no GitHub auth token lifecycle issues, full parameter control
- **Git-native isolation** — worktrees prevent file-level conflicts between concurrent agents

---

## Key Architectural Decisions

| Decision | Choice | Alternatives Rejected | Rationale |
|----------|--------|----------------------|-----------|
| **Language** | Python | TypeScript | Rich ML/AI ecosystem, first-class `openai` SDK, faster prototyping for daemon loops |
| **LLM Client** | Azure OpenAI primary, OpenAI fallback (`openai` package) | Copilot SDK, GitHub Models API | No GitHub auth token lifecycle for daemons; full control over parameters; simpler dependency; provider abstraction via `base_url`; automatic failover |
| **Model Routing** | 3-tier routing (complex/standard/simple) per agent role | Single model for all | Different tasks deserve different models; cheap models for cheap tasks saves cost without sacrificing quality where it matters |
| **Coordination** | SQLite WAL (native) | Pied Piper Go server, Redis, RabbitMQ, NATS | Zero external dependencies; single-file database; WAL mode gives concurrent reads + serialized writes; steal Pied Piper's proven schema without running their server |
| **Isolation** | Git worktrees | Docker containers, separate clones | Filesystem-level isolation per worker without cloning the repo; shared `.git` directory; lightweight; native git tooling |
| **Tracking** | SQLite message board replaces beads | Beads (no-db JSONL), Backlog.md CLI | Beads is broken at its core (TOCTOU races, metadata corruption). SQLite WAL provides the concurrency guarantees beads never had |
| **Orchestrator** | Beth as persistent Python daemon | Copilot agent mode, cron jobs | Must survive session boundaries; must dispatch work and monitor board continuously |
| **Agent identity** | Same 7 roles from current system | New roles, fewer roles | Proven role decomposition; skills/handoffs already battle-tested |

---

## Current Architecture

```
User → VS Code → @Beth (Copilot Agent Mode)
                    │
                    ├── runSubagent("developer", prompt) → sync, blocking
                    ├── runSubagent("tester", prompt) → sync, blocking
                    ├── runSubagent("security-reviewer", prompt) → sync, blocking
                    └── ...
                    
State: beads (JSONL, broken) + Backlog.md (human-facing)
Skills: .github/skills/<name>/SKILL.md (loaded on-demand)
Agents: .github/agents/<name>.agent.md (YAML frontmatter + instructions)
```

**Limitations:**
- One agent works at a time (sequential subagent calls)
- Session-scoped — everything dies when the chat ends
- Beads has TOCTOU race conditions on concurrent writes
- No way to run agents outside VS Code
- Context window is shared across all subagent invocations

---

## Target Architecture

```
┌─────────────────────────────────────────────────────┐
│                 Beth Daemon (Python)                  │
│                                                       │
│  ┌─────────────┐    ┌──────────────────────────────┐ │
│  │ Orchestrator │───▶│ SQLite WAL Message Board     │ │
│  │              │◀───│ (channels/posts)             │ │
│  └──────┬───────┘    └──────────────────────────────┘ │
│         │                                             │
│    ┌────┼──────────┬──────────┬──────────┐           │
│    ▼    ▼          ▼          ▼          ▼           │
│  ┌────┐┌────┐  ┌────┐    ┌────┐    ┌────┐          │
│  │ W1 ││ W2 │  │ W3 │    │ W4 │    │ W5 │          │
│  │dev ││test│  │sec │    │PM  │    │UX  │          │
│  └──┬─┘└──┬─┘  └──┬─┘    └──┬─┘    └──┬─┘          │
│     │     │       │         │         │             │
│  ┌──▼─┐┌──▼─┐ ┌──▼─┐   ┌──▼─┐   ┌──▼─┐           │
│  │ wt ││ wt │ │ wt │   │ wt │   │ wt │           │
│  │ /1 ││ /2 │ │ /3 │   │ /4 │   │ /5 │           │
│  └────┘└────┘ └────┘   └────┘   └────┘           │
│  (git worktrees — isolated filesystem per worker)    │
└─────────────────────────────────────────────────────┘
         │
         ▼
   Azure OpenAI API
```

**Key properties:**
- Beth daemon runs persistently (systemd, tmux, or direct)
- Each worker is a Python async task with its own Azure OpenAI tool-use loop
- Each worker operates in its own git worktree (physical filesystem isolation)
- All coordination goes through the SQLite WAL message board
- Workers read skills from `.github/skills/` (same files, same format)
- Agent personalities/instructions loaded from `.github/agents/` (same `.agent.md` files, parsed as system prompts)

---

## Message Board (SQLite WAL)

### Design Source: Pied Piper / AgentHub

The message board's **channel → post** architecture is adopted from [Pied Piper](https://github.com/stephschofield/piedpiper) (fork of [AgentHub](https://github.com/ygivenx/agenthub) by ygivenx). We implement it natively in Python with `sqlite3` — no Go server dependency.

**What we adopt from Pied Piper (verified against source code):**
- Channel/post data model with SQLite WAL (`journal_mode=WAL`, `busy_timeout=5000`, `synchronous=NORMAL`, `foreign_keys=ON`)
- Self-referencing `parent_id` on posts for threaded replies (no separate replies table — replies are just posts)
- Named channels for topic separation
- Agent identity model (agent_id per post)

**What we extend beyond Pied Piper:**
- Pied Piper posts have a single `content TEXT` field (platform-agnostic). We add structured `title`, `body`, and `metadata` (JSON) fields for task coordination.
- `outcomes` table for model routing intelligence (inspired by ruflo, not Pied Piper).
- Channel semantics (tasks, completions, claims, etc.) are our domain-specific design — Pied Piper channels are generic.
- No HTTP server — Pied Piper is a Go HTTP API for remote agents. We access SQLite directly since all workers are local processes.
- No rate limiting — Pied Piper has per-agent rate limits for its multi-tenant server. Our workers are trusted processes within the daemon.

### Schema

Follows Pied Piper's self-referencing post model: replies are posts with a `parent_id` pointing to another post. No separate replies table — this is simpler, proven, and supports arbitrary threading depth.

```sql
CREATE TABLE channels (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT UNIQUE NOT NULL,
    description TEXT DEFAULT '',
    created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE posts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id  INTEGER NOT NULL REFERENCES channels(id),
    agent_id    TEXT NOT NULL,
    parent_id   INTEGER REFERENCES posts(id),  -- NULL = top-level post, set = reply
    title       TEXT,           -- optional (replies may omit)
    body        TEXT NOT NULL,
    metadata    TEXT,           -- JSON blob for structured data (our extension)
    created_at  TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_posts_channel ON posts(channel_id);
CREATE INDEX idx_posts_parent ON posts(parent_id);
CREATE INDEX idx_posts_agent ON posts(agent_id);
```

**Comparison with Pied Piper's actual schema:**

| Aspect | Pied Piper | Beth Swarm | Rationale |
|--------|-----------|------------|----------|
| Channels | `name TEXT UNIQUE`, `description TEXT` | Same | Direct adoption |
| Posts | `channel_id`, `agent_id`, `parent_id`, `content TEXT` | Same + `title`, `body`, `metadata` (replaces `content`) | Structured fields for task coordination |
| Replies | Self-referencing `parent_id` on posts | Same | Direct adoption |
| Rate limits | `rate_limits` table (per-agent, per-action) | Not needed | Workers are trusted local processes |
| Agents | `agents` table with `api_key` | No table — agent roles are config | No HTTP auth needed |

### SQLite WAL Configuration

```python
import sqlite3

def connect_board(db_path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.row_factory = sqlite3.Row
    return conn
```

All four pragmas match Pied Piper's configuration (see `internal/db/db.go:Open()`).

**Why WAL mode:**
- Writers never block readers (concurrent read access while one writer is active)
- Single write lock serializes concurrent writes (~0.05–0.2ms per INSERT)
- `busy_timeout=5000` means a writer retries for 5 seconds if another write is in progress
- No external server process — it's just a file
- Survives process crashes (WAL recovery is automatic on next open)

### Channels

| Channel | Purpose | Who Writes | Who Reads |
|---------|---------|------------|-----------|
| `tasks` | Work assignments from Beth to workers | Beth | Workers |
| `completions` | Workers report finished work | Workers | Beth |
| `claims` | Workers announce which files/dirs they're touching | Workers | Workers, Beth |
| `conflicts` | Merge conflict reports and resolution requests | Workers | Beth |
| `learnings` | Reusable insights discovered during work | Workers | All |
| `blockers` | Workers report they're stuck | Workers | Beth |
| `heartbeats` | Worker liveness signals | Workers | Beth |

### Outcome Tracking

The board also stores structured outcomes for model routing intelligence (see [Competitive Intelligence](#competitive-intelligence)):

```sql
CREATE TABLE outcomes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    epic_id     TEXT NOT NULL,
    task_id     TEXT NOT NULL,
    agent_role  TEXT NOT NULL,
    task_type   TEXT,              -- 'feature', 'bugfix', 'test', 'security', 'docs'
    model_used  TEXT NOT NULL,
    tokens_in   INTEGER NOT NULL,
    tokens_out  INTEGER NOT NULL,
    duration_ms INTEGER NOT NULL,
    success     BOOLEAN NOT NULL,  -- did tests pass after merge?
    description TEXT,              -- one-line task summary
    created_at  TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_outcomes_agent ON outcomes(agent_role);
CREATE INDEX idx_outcomes_type ON outcomes(task_type);
CREATE INDEX idx_outcomes_success ON outcomes(success);
```

### Message Protocol

**Task assignment (Beth → Worker):**
```json
{
    "channel": "tasks",
    "agent_id": "beth",
    "title": "Implement JWT auth flow",
    "body": "Build JWT access tokens with 15min expiry, refresh token rotation, secure httpOnly cookies.",
    "metadata": {
        "epic_id": "beth-abc123",
        "task_id": "beth-abc123.3",
        "assigned_to": "developer",
        "skills": ["vercel-react-best-practices", "shadcn-ui"],
        "acceptance_criteria": [
            "JWT access tokens with 15min expiry",
            "Refresh token rotation",
            "Secure httpOnly cookies"
        ],
        "worktree_branch": "worker/developer-abc123"
    }
}
```

**Completion report (Worker → Beth):**
```json
{
    "channel": "completions",
    "agent_id": "developer",
    "title": "JWT auth flow complete",
    "body": "Implemented in src/lib/auth/jwt.ts and src/lib/actions/auth.ts. All acceptance criteria met.",
    "metadata": {
        "task_id": "beth-abc123.3",
        "files_changed": ["src/lib/auth/jwt.ts", "src/lib/actions/auth.ts", "src/middleware.ts"],
        "branch": "worker/developer-abc123",
        "tests_passing": true,
        "follow_up": []
    }
}
```

**Claim announcement (Worker → All):**
```json
{
    "channel": "claims",
    "agent_id": "developer",
    "title": "Claiming src/lib/auth/",
    "body": "Working on auth flow. Will touch src/lib/auth/*, src/middleware.ts",
    "metadata": {
        "paths": ["src/lib/auth/", "src/middleware.ts"],
        "task_id": "beth-abc123.3",
        "expires_at": "2026-03-13T15:00:00Z"
    }
}
```

---

## Git Worktree Isolation

### The Principle

Each worker agent gets its own **git worktree** — a physically separate checkout of the repo on a unique branch. This eliminates file-level conflicts between concurrent agents entirely.

### Worktree Lifecycle

```
1. Beth creates the worktree:
   git worktree add .worktrees/developer-abc123 -b worker/developer-abc123 origin/main

2. Worker operates exclusively inside its worktree:
   cd .worktrees/developer-abc123/
   # ... makes changes, runs tests ...

3. Worker commits to its branch:
   git add -A && git commit -m "beth-abc123.3: Implement JWT auth"

4. Beth sequences the merge back to the epic branch:
   git checkout epic/beth-abc123
   git merge worker/developer-abc123 --no-ff
   # Run tests after merge
   npm test

5. Beth cleans up:
   git worktree remove .worktrees/developer-abc123
   git branch -d worker/developer-abc123
```

### Directory Layout

```
repo/
├── .git/                          # Shared git database
├── .worktrees/                    # All worker checkouts (gitignored)
│   ├── developer-abc123/          # Developer's isolated checkout
│   ├── tester-def456/             # Tester's isolated checkout
│   └── security-ghi789/          # Security reviewer's checkout
├── src/                           # Main checkout (Beth's view)
├── .github/
│   ├── agents/                    # Agent definitions (read by all workers)
│   └── skills/                    # Skills (read by all workers)
└── swarm.db                       # SQLite WAL message board
```

### Rules

1. **Workers NEVER touch the main checkout** — only their worktree
2. **Workers NEVER merge** — only Beth merges, and only sequentially
3. **Workers read skills/agents from the shared `.github/` directory** — these are read-only reference files
4. **Worktree branches are ephemeral** — created per task, deleted after merge
5. **`.worktrees/` is gitignored** — local-only, never committed

---

## Merge Conflict Resolution

Three strategies, applied in order of preference:

### Strategy 1: Semantic Partitioning (Prevent Conflicts)

The best conflict is the one that never happens. Beth uses the **claims channel** to partition work:

1. Before assigning a task, Beth checks existing claims on the board
2. If two tasks would touch overlapping files, Beth sequences them (dependency edge) instead of parallelizing
3. Workers announce their claims before starting work
4. Beth monitors claims for overlap and re-sequences if needed

**This handles ~80% of cases.** Most agent work is semantically partitioned by role — the developer writes `src/`, the tester writes `__tests__/`, the security reviewer writes audit reports.

### Strategy 2: Branch-per-Worker + Sequential Rebase

When partitioning isn't enough (e.g., two developers touching different parts of the same file):

1. Each worker commits to their isolated worktree branch
2. Beth merges branches **sequentially** into the epic branch
3. After each merge, Beth runs the test suite — if tests fail, the merge is reverted
4. If a merge has conflicts, Beth can:
   - Auto-resolve trivial conflicts (non-overlapping hunks in same file)
   - Post to the `conflicts` channel asking the original worker to resolve
   - Re-sequence the remaining merges

```
Worker A commits → Beth merges A → tests pass ✅
Worker B commits → Beth merges B → conflict! → Worker B resolves → tests pass ✅
Worker C commits → Beth merges C → tests pass ✅
```

### Strategy 3: Test Validation Gate

After every merge, regardless of conflict status:

```python
def merge_worker_branch(worker_branch: str, epic_branch: str) -> bool:
    subprocess.run(["git", "checkout", epic_branch])
    result = subprocess.run(["git", "merge", worker_branch, "--no-ff"])
    
    if result.returncode != 0:
        # Merge conflict — abort and handle
        subprocess.run(["git", "merge", "--abort"])
        return False
    
    # Run tests even on clean merges
    test_result = subprocess.run(["npm", "test"])
    if test_result.returncode != 0:
        # Tests fail — revert the merge
        subprocess.run(["git", "reset", "--hard", "HEAD~1"])
        return False
    
    return True
```

---

## LLM Client (Provider-Abstracted)

### Provider Strategy

Primary: Azure OpenAI (corporate deployment, Entra ID upgrade path). Fallback: OpenAI direct (or any OpenAI-compatible API via `base_url`). The `openai` Python package supports all of these natively — no abstraction layer needed.

### Why Not Copilot SDK

The [Copilot SDK](https://github.com/nicolo-ribaudo/github-copilot-sdk-packages) is designed for **web apps embedding Copilot** — Express API + React UI, `GITHUB_TOKEN` auth with token expiry, session-scoped request/response patterns. It doesn't provide a tool-use loop, and its auth lifecycle is incompatible with persistent daemons. The BYOM (Bring Your Own Model) path ultimately just calls Azure OpenAI with an extra abstraction layer for no benefit.

### Implementation

```python
from openai import AzureOpenAI

client = AzureOpenAI(
    azure_endpoint=os.environ["AZURE_OPENAI_ENDPOINT"],
    api_key=os.environ["AZURE_OPENAI_API_KEY"],
    api_version="2024-12-01-preview"
)

def agent_loop(system_prompt: str, tools: list[dict], initial_message: str) -> str:
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": initial_message}
    ]
    
    while True:
        response = client.chat.completions.create(
            model=os.environ["AZURE_OPENAI_DEPLOYMENT"],
            messages=messages,
            tools=tools,
            tool_choice="auto"
        )
        
        choice = response.choices[0]
        
        if choice.finish_reason == "stop":
            return choice.message.content
        
        if choice.finish_reason == "tool_calls":
            messages.append(choice.message)
            for call in choice.message.tool_calls:
                result = execute_tool(call.function.name, call.function.arguments)
                messages.append({
                    "role": "tool",
                    "tool_call_id": call.id,
                    "content": result
                })
```

### Tool Definitions

Workers get the same capabilities they have today, expressed as OpenAI function-calling tools:

| Tool | Description |
|------|-------------|
| `read_file` | Read file contents from the worktree |
| `write_file` | Create or overwrite a file in the worktree |
| `edit_file` | Apply a targeted edit (search/replace) to a file |
| `run_command` | Execute a shell command in the worktree |
| `list_directory` | List contents of a directory |
| `search_files` | Grep or glob search across the worktree |
| `post_message` | Write to the SQLite message board |
| `read_messages` | Read messages from a board channel |
| `load_skill` | Read a skill file from `.github/skills/` |

---

## Agent Roles & Skills (Preserved)

### The Seven Agents (Unchanged)

| Agent | Role | System Prompt Source |
|-------|------|---------------------|
| **Beth** | Orchestrator daemon — decomposes work, dispatches, monitors, merges | `.github/agents/beth.agent.md` |
| **Product Manager** | WHAT to build: PRDs, user stories, priorities, success metrics | `.github/agents/product-manager.agent.md` |
| **Researcher** | User/market research, competitive analysis | `.github/agents/researcher.agent.md` |
| **UX Designer** | HOW it works: component specs, design tokens, accessibility | `.github/agents/ux-designer.agent.md` |
| **Developer** | React/TypeScript/Next.js — UI and full-stack implementation | `.github/agents/developer.agent.md` |
| **Security Reviewer** | Security audits, threat modeling, compliance | `.github/agents/security-reviewer.agent.md` |
| **Tester** | QA, accessibility, performance testing | `.github/agents/tester.agent.md` |

### Skills (Unchanged)

All existing skills in `.github/skills/<name>/SKILL.md` are preserved. Workers load them via the `load_skill` tool when their task metadata includes skill references.

**Skill injection logic** is preserved from the current hook system (`.github/hooks/scripts/inject-skills.mjs`):

| Agent | Auto-Injected Skills | On-Demand Skills |
|-------|---------------------|------------------|
| **Developer** | vercel-react-best-practices | shadcn-ui, framer-components, 12 Azure skills |
| **UX Designer** | web-design-guidelines | framer-components, ui-ux-pro-max |
| **Product Manager** | — | prd, azure-cost-optimization, azure-cloud-migrate |
| **Security Reviewer** | — | security-analysis, azure-rbac, azure-compliance, entra |
| **Tester** | web-design-guidelines | azure-diagnostics, appinsights |
| **Researcher** | web-search | — |

### Handoff Pattern (Preserved as Hub-and-Spoke)

The current "Escalate to Beth" pattern is preserved. Workers never communicate directly with each other — all coordination goes through the message board, where Beth reads and routes:

```
Worker A → posts to completions channel → Beth reads → posts new task to Worker B
Worker C → posts to blockers channel → Beth reads → decides resolution
```

This is the same hub-and-spoke topology we have today, just async and durable.

---

## Orchestrator (Beth)

Beth is the only agent that runs the **orchestration loop** rather than the **worker loop**.

### Orchestration Loop

```python
async def orchestrate(board: MessageBoard, config: SwarmConfig):
    while True:
        # 1. Check for new completions
        completions = board.read_new("completions")
        for msg in completions:
            handle_completion(board, msg)
        
        # 2. Check for blockers
        blockers = board.read_new("blockers")
        for msg in blockers:
            handle_blocker(board, msg)
        
        # 3. Check for conflicts
        conflicts = board.read_new("conflicts")
        for msg in conflicts:
            handle_conflict(board, msg)
        
        # 4. Merge completed work (sequential)
        ready_merges = get_ready_merges(board)
        for merge in ready_merges:
            success = merge_worker_branch(merge.branch, merge.epic_branch)
            if not success:
                post_conflict(board, merge)
        
        # 5. Dispatch new work to idle workers
        idle_workers = get_idle_workers(board)
        unblocked_tasks = get_unblocked_tasks(board)
        for worker, task in zip(idle_workers, unblocked_tasks):
            dispatch(board, worker, task)
        
        # 6. Check heartbeats (detect stuck workers)
        check_heartbeats(board)
        
        await asyncio.sleep(config.poll_interval_seconds)
```

### Epic Decomposition

When Beth receives a complex request, she uses the same decomposition logic as today:

1. Create an epic post on the `tasks` channel
2. Decompose into subtasks with dependencies
3. Post subtasks to the board
4. Let the orchestration loop dispatch unblocked tasks to workers

```python
def decompose_epic(request: str) -> list[Task]:
    """Beth uses her own LLM call to decompose work."""
    response = client.chat.completions.create(
        model=config.orchestrator_model,
        messages=[
            {"role": "system", "content": load_beth_prompt()},
            {"role": "user", "content": request}
        ]
    )
    # Parse structured output into Task objects with dependencies
    return parse_tasks(response.choices[0].message.content)
```

---

## Worker Agent Loop

Each worker runs an autonomous tool-use loop until its task is complete.

```python
async def worker_loop(
    agent_role: str,
    task: Task,
    board: MessageBoard,
    worktree_path: str
):
    # 1. Load agent personality
    system_prompt = load_agent_prompt(agent_role)
    
    # 2. Load required skills
    skills_context = ""
    for skill in task.skills:
        skills_context += load_skill(skill)
    
    # 3. Announce claims
    board.post("claims", agent_id=agent_role, title=f"Claiming {task.paths}",
               metadata={"paths": task.paths, "task_id": task.id})
    
    # 4. Run the tool-use loop
    full_prompt = f"{skills_context}\n\nTask: {task.body}\n\nAcceptance Criteria:\n{task.acceptance_criteria}"
    
    result = agent_loop(
        system_prompt=system_prompt,
        tools=get_worker_tools(worktree_path, board),
        initial_message=full_prompt
    )
    
    # 5. Commit work
    subprocess.run(["git", "add", "-A"], cwd=worktree_path)
    subprocess.run(["git", "commit", "-m", f"{task.epic_id}: {task.title}"], cwd=worktree_path)
    
    # 6. Report completion
    board.post("completions", agent_id=agent_role, title=f"{task.title} complete",
               body=result, metadata={"task_id": task.id, "branch": task.branch})
    
    # 7. Post heartbeat
    board.post("heartbeats", agent_id=agent_role, body="idle",
               metadata={"status": "idle"})
```

---

## Context Window Management

Long-running daemon agents need explicit context management to avoid filling the context window.

### Strategies

1. **Fresh context per task** — each worker starts a new message thread for each task. No carryover between tasks.

2. **Skill loading on-demand** — skills are only loaded when referenced in task metadata, not pre-loaded into the system prompt.

3. **Summarize-and-compact** — for long tasks, periodically summarize the conversation history and replace the full thread with the summary + recent messages.

4. **Board messages are structured, not conversational** — the SQLite board stores structured data (JSON metadata), not full chat transcripts. Workers read only what they need.

5. **Worktree scope limits file reads** — workers can only see files in their worktree, which reduces the "read everything" temptation.

### Token Budget

```python
@dataclass
class TokenBudget:
    max_context: int = 128_000       # Model context window
    system_prompt_reserve: int = 4_000  # Agent personality + skills
    tool_results_reserve: int = 80_000  # Room for file reads and search results
    generation_reserve: int = 16_000    # Room for model output
    compaction_threshold: int = 100_000  # Trigger summarization at this point
```

---

## Module Map

```
swarm/
├── __init__.py
├── main.py              # Entry point: CLI + daemon startup
├── config.py            # SwarmConfig dataclass, env vars, defaults
├── board.py             # SQLite WAL message board (channels, posts with threading, outcomes)
├── llm.py               # LLM client wrapper, agent_loop(), provider failover
├── routing.py           # Model routing: tier resolution, outcome-based suggestion
├── tools.py             # Tool definitions and execution (read/write/edit/run/search)
├── git.py               # Worktree management (create, merge, cleanup)
├── orchestrator.py      # Beth's orchestration loop
├── worker.py            # Worker agent loop
├── agents.py            # Agent prompt loading from .agent.md files
├── skills.py            # Skill loading from .github/skills/
├── budget.py            # Token budget tracking, cost estimation, context compaction
└── tests/
    ├── test_board.py
    ├── test_git.py
    ├── test_tools.py
    ├── test_orchestrator.py
    ├── test_worker.py
    ├── test_llm.py
    ├── test_routing.py
    └── test_budget.py
```

### Module Responsibilities

| Module | Responsibility | Key Dependencies |
|--------|---------------|-----------------|
| `main.py` | CLI parsing, daemon mode (tmux), signal handling, `swarm start/stop/status/attach/resume` | `orchestrator`, `config` |
| `config.py` | Load config from `swarm.yaml` or env vars; model routing tiers; provider definitions; budget thresholds | stdlib only |
| `board.py` | SQLite WAL CRUD for channels/posts/outcomes; `read_new()` with cursor tracking; `get_replies()` via `parent_id` | `sqlite3` |
| `llm.py` | LLM chat completions with tool-use loop; provider failover (primary → fallback on 429/500/503) | `openai` |
| `routing.py` | Resolve model deployment for a task; query outcomes for learned routing; `suggest_model()` | `board`, `config` |
| `tools.py` | Tool function registry; maps function names → callables; sandboxed to worktree | `board`, `git` |
| `git.py` | `create_worktree()`, `merge_branch()`, `cleanup_worktree()`, conflict detection | `subprocess` (git CLI) |
| `orchestrator.py` | Beth's poll loop: read board, dispatch tasks, sequence merges, check heartbeats, record outcomes, auto-update Backlog.md | `board`, `git`, `llm`, `worker`, `routing` |
| `worker.py` | Tool-use agent loop with context management; one instance per task | `llm`, `tools`, `board`, `skills` |
| `agents.py` | Parse `.agent.md` YAML frontmatter + instructions into system prompts; ignore Copilot-specific fields | `yaml` |
| `skills.py` | Load `SKILL.md` files, inject per skill enforcement map | filesystem reads |
| `budget.py` | Token counting (`tiktoken`), per-task/epic/daily budget enforcement, compaction trigger, cost estimation | `tiktoken`, `config` |

---

## Migration Path

### What Changes

| Component | Current | Target |
|-----------|---------|--------|
| **Runtime** | VS Code Copilot agent mode | Python daemon process |
| **LLM calls** | Copilot's built-in model routing | Azure OpenAI direct via `openai` package |
| **Concurrency** | Sequential `runSubagent()` | Parallel workers in git worktrees |
| **Coordination** | Beads (broken JSONL) | SQLite WAL message board |
| **Agent definitions** | `.agent.md` → Copilot YAML schema | `.agent.md` → parsed as system prompts |
| **Skill loading** | Hook-injected via `inject-skills.mjs` | Python module reads same files |
| **Tool execution** | Copilot's built-in tools | Python tool registry (same capabilities) |
| **Git strategy** | Single branch, sequential commits | Worktrees per worker, Beth merges |
| **Human tracking** | Backlog.md CLI | Backlog.md CLI (unchanged) |

### What Stays the Same

| Component | Status |
|-----------|--------|
| Agent roles (7 agents) | Unchanged |
| Agent personalities/instructions | Same `.agent.md` files, loaded as system prompts |
| Skills system | Same `.github/skills/<name>/SKILL.md` files |
| Skill enforcement map | Same mapping (developer → vercel-react, UX → web-design, etc.) |
| Hub-and-spoke handoff pattern | Same (all agents → Beth) |
| IDEO Design Thinking workflow | Same (Empathize → Define → Ideate → Prototype → Test) |
| Quality standards (WCAG, TypeScript strict, test coverage) | Same |
| Epic decomposition pattern | Same logic, different runtime |
| Backlog.md for human tracking | Unchanged |
| `/memories/` filesystem | Unchanged |

---

## Phased Implementation

### Overview

Six phases, each gated by a concrete milestone that must be demonstrated before moving to the next. Phases 0–2 are the foundation — they prove the architecture works. Phases 3–4 are the system — they make it useful. Phase 5 is hardening — it makes it reliable.

| Phase | Name | Milestone | Estimated Scope |
|-------|------|-----------|-----------------|
| **0** | Foundation | SQLite board passes concurrent read/write tests, config loads from YAML + env | New Python project, 4 modules, ~500 LOC |
| **1** | Single Agent | One developer agent receives task via board, makes code changes, posts completion | 5 modules, tool registry, LLM integration, ~800 LOC |
| **2** | Parallel Workers | Two workers in separate worktrees complete tasks, Beth merges sequentially | Worktree lifecycle, merge gate, ~600 LOC |
| **3** | Orchestrator Daemon | Beth decomposes a feature, dispatches to 3+ workers, merges all results | Orchestration loop, epic decomposition, ~700 LOC |
| **4** | Intelligence | Model routing adapts based on outcome history, cost guardrails enforce budgets | Outcomes table, routing logic, budget module, ~500 LOC |
| **5** | Production Hardening | CLI interface, graceful shutdown, provider failover, structured logging | CLI, observability, robustness, ~600 LOC |

**Total estimated scope:** ~3,700 LOC of Python (excluding tests). Tests should roughly 1:1 match production code.

---

### Phase 0: Foundation

**Goal:** Prove the coordination layer works before touching LLMs or git.

**Deliverables:**
- [ ] Python project structure (`swarm/` package, `pyproject.toml`, dev dependencies)
- [ ] `config.py` — `SwarmConfig` dataclass, loads from `swarm.yaml` with env var interpolation (`${AZURE_OPENAI_ENDPOINT}`)
- [ ] `board.py` — SQLite WAL message board: create tables, CRUD for channels/posts (self-referencing `parent_id` for threading), `read_new()` with cursor tracking per reader
- [ ] `outcomes` table schema (for Phase 4, but created here so the schema is complete from day 1)
- [ ] Unit tests: concurrent reads, write serialization, busy timeout handling, WAL recovery after simulated crash

**Milestone:** `pytest swarm/tests/test_board.py` passes with concurrent read/write tests. Config loads from a sample `swarm.yaml`.

**Acceptance Criteria:**
- Board supports the 7 channels (tasks, completions, claims, conflicts, learnings, blockers, heartbeats)
- `read_new()` returns only unread posts per reader (cursor-based)
- Two threads writing simultaneously never corrupt the database
- Config resolves `${ENV_VAR}` references from environment

---

### Phase 1: Single Agent Loop

**Goal:** Prove one agent can receive a task, use tools to modify code, and report back.

**Deliverables:**
- [ ] `llm.py` — Azure OpenAI client with tool-use loop (chat → tool_calls → execute → loop until `stop`)
- [ ] `tools.py` — Tool registry: `read_file`, `write_file`, `edit_file`, `run_command`, `list_directory`, `search_files`, `post_message`, `read_messages`, `load_skill`
- [ ] `agents.py` — Parse `.agent.md` YAML frontmatter + markdown body into system prompts; ignore Copilot-specific fields
- [ ] `skills.py` — Load `SKILL.md` files from `.github/skills/`; skill enforcement map (agent → auto-injected skills)
- [ ] `worker.py` — Single worker loop: load prompt → load skills → run tool loop → commit → post completion
- [ ] Provider config in `swarm.yaml` (primary Azure OpenAI, no fallback yet)
- [ ] Integration test: developer agent receives a task to create a file, creates it, commits, posts completion

**Milestone:** One developer agent receives "Create a hello world Express server in `src/server.ts`" via the board, creates the file, and posts completion — all without human intervention.

**Acceptance Criteria:**
- Agent correctly parses `.github/agents/developer.agent.md` into a system prompt
- Agent loads `vercel-react-best-practices` SKILL.md when referenced in task metadata
- All 9 tools are functional (read, write, edit, run, list, search, post, read_messages, load_skill)
- Tool execution is sandboxed to the specified working directory
- Worker posts structured completion to the board with files_changed metadata

---

### Phase 2: Parallel Workers + Git Worktrees

**Goal:** Prove two agents can work simultaneously on different tasks without conflicts.

**Deliverables:**
- [ ] `git.py` — Worktree lifecycle: `create_worktree()`, `merge_worker_branch()`, `cleanup_worktree()`
- [ ] Merge sequencing: Beth merges worker branches one-at-a-time into the epic branch
- [ ] Test validation gate: `npm test` (or configurable test command) runs after every merge; revert on failure
- [ ] Claims channel: workers announce paths before starting; Beth checks for overlap before parallel dispatch
- [ ] Wire worktree creation into worker startup (worker receives worktree path, operates inside it)
- [ ] `.worktrees/` added to `.gitignore`

**Milestone:** Developer agent and tester agent work simultaneously on different files in separate worktrees. Beth merges both branches sequentially into the epic branch. Tests pass.

**Acceptance Criteria:**
- Worktrees are created from `origin/main` (or specified base branch)
- Each worker's git operations are isolated to its worktree
- Beth merges worker A, runs tests, then merges worker B, runs tests
- If merge B conflicts, it's aborted cleanly (no partial state)
- Worktrees and ephemeral branches are cleaned up after merge
- Claims channel prevents two workers from being assigned overlapping file paths

---

### Phase 3: Orchestrator Daemon

**Goal:** Beth runs as a persistent daemon that decomposes work, dispatches tasks, and manages the full lifecycle.

**Deliverables:**
- [ ] `orchestrator.py` — Beth's async poll loop: read completions → handle blockers → merge ready work → dispatch new tasks → check heartbeats
- [ ] Epic decomposition: Beth uses her own LLM call to break a complex request into subtasks with dependencies
- [ ] Dependency-aware dispatch: tasks with unmet dependencies stay queued; only unblocked tasks are dispatched to idle workers
- [ ] Heartbeat monitoring: workers post heartbeats; Beth detects stuck workers (no heartbeat for N seconds) and can kill/reassign
- [ ] tmux session management: `swarm start` launches the daemon in a named tmux session, `swarm attach` connects, `swarm stop` sends graceful shutdown signal
- [ ] Backlog.md auto-update: Beth runs `backlog task edit <id> -s "Done" --plain` when an epic closes (all subtasks merged, tests passing)

**Milestone:** User submits "Build a JWT auth system with login and logout endpoints" to the board. Beth decomposes it into 3+ subtasks (implement, test, security review), dispatches to workers, merges results, and the epic branch has working, tested code.

**Acceptance Criteria:**
- Beth correctly decomposes a feature request into subtasks with logical dependencies
- Subtasks are dispatched only when their dependencies are satisfied
- Workers receive tasks, execute, and report completion autonomously
- Beth merges all worker branches in dependency order
- Final test suite passes on the merged epic branch
- Stuck worker (simulated by killing a worker process) is detected within 2× heartbeat interval
- tmux session survives terminal close; `swarm attach` reconnects

---

### Phase 4: Intelligence (Model Routing + Outcome Learning + Cost Guardrails)

**Goal:** The system gets smarter and cheaper over time by learning from outcomes and routing work to the right models.

**Deliverables:**
- [ ] Outcome recording: after every merge (success or failure), Beth writes a row to the `outcomes` table with agent, model, tokens, duration, success
- [ ] `suggest_model()` — query outcomes to find the best-performing model for a given agent role + task type
- [ ] Model routing config in `swarm.yaml`: per-agent tier defaults, per-task override capability
- [ ] `budget.py` — Token budget tracking: per-task limits, per-epic spending caps, global daily kill switch
- [ ] Worker enforcement: if a worker exceeds its task token budget, it stops and posts a blocker
- [ ] Beth enforcement: if epic budget exceeded, pause dispatch, notify user
- [ ] Cost estimation: convert token counts to estimated USD using per-model pricing table in config
- [ ] `budget.py` — Context window management: token counting via `tiktoken`, compaction trigger at threshold, conversation summarization

**Milestone:** After running 10+ tasks, `suggest_model()` returns a non-default model recommendation based on historical success rates. Cost guardrails correctly halt a worker that exceeds its token budget.

**Acceptance Criteria:**
- Outcomes table captures all fields: agent, model, tokens_in, tokens_out, duration, success, task_type
- `suggest_model()` only recommends models with ≥5 historical data points (no premature optimization)
- Per-task budget stops a runaway worker before it burns the entire context window
- Per-epic budget pauses dispatch (not kills workers) when threshold is crossed
- Daily kill switch halts all work; `swarm resume` command unpauses
- Token counting matches actual API usage within ±5%

---

### Phase 5: Production Hardening

**Goal:** Make the system reliable, observable, and pleasant to operate.

**Deliverables:**
- [ ] CLI interface: `swarm start` (daemon), `swarm run` (foreground), `swarm stop`, `swarm status`, `swarm resume`, `swarm attach`
- [ ] Graceful shutdown: finish in-progress workers, don't accept new tasks, merge completed work, clean up worktrees
- [ ] Provider failover: if primary LLM provider returns 429/500/503, retry on fallback provider (from `swarm.yaml`)
- [ ] Structured logging: JSON-format logs with agent_id, task_id, epic_id fields for filtering
- [ ] Board query CLI: `swarm board` shows recent messages, `swarm outcomes` shows success rates
- [ ] Error recovery: if the daemon crashes, restart picks up where it left off (board state is durable in SQLite)
- [ ] Documentation: `docs/SWARM-USAGE.md` with setup guide, configuration reference, troubleshooting
- [ ] Integration with Backlog.md CLI for human-facing updates
- [ ] systemd unit file (optional, documented for CI/production environments)

**Milestone:** The system runs for a full work session (1+ hour), handles multiple epics, survives a simulated crash, restarts cleanly, and produces structured logs that can be grepped for specific agents or tasks.

**Acceptance Criteria:**
- `swarm status` shows: running workers, queued tasks, recent completions, current spend
- `swarm stop` completes in-progress work (up to configurable timeout) before shutting down
- Provider failover is transparent to workers (they don't know which provider served the request)
- After a crash, `swarm start` resumes: reads board state, re-dispatches incomplete tasks, doesn't re-merge already-merged work
- Logs are parseable by `jq` and include timestamps, agent IDs, and task IDs
- README documentation is sufficient for a new developer to set up and run the swarm

---

## What We're Dropping

| Component | Reason |
|-----------|--------|
| **Beads** (`bd` CLI, `.beads/`, JSONL store) | Fundamentally broken: TOCTOU races on concurrent writes, metadata corruption, dual-tracking overhead. SQLite WAL message board replaces it entirely. |
| **Dolt** (embedded database server) | Was beads' backend. Going away with beads. |
| **`runSubagent()` pattern** | Copilot-specific. Replaced by async worker dispatch via message board. |
| **GitHub Copilot agent mode** (as the runtime) | Still usable for ad-hoc chat, but no longer the execution runtime for multi-agent work. |
| **Skill injection hooks** (`inject-skills.mjs`, `verify-skills.mjs`) | JavaScript hooks for Copilot's SubagentStart/Stop events. Replaced by Python skill loading in worker startup. Same mapping, different runtime. |
| **Docker Swarm architecture** ([DOCKER-SWARM.md](DOCKER-SWARM.md)) | Over-engineered for current needs. Worktrees + SQLite provide isolation and coordination without container orchestration overhead. |

---

## What We're Keeping

| Component | Notes |
|-----------|-------|
| **Agent definitions** (`.github/agents/*.agent.md`) | Parsed as system prompts — same files, new consumer |
| **Skills** (`.github/skills/<name>/SKILL.md`) | Read by Python skill loader — same files, new consumer |
| **Skill enforcement map** | Same agent→skill mapping, enforced in Python instead of JS hooks |
| **Hub-and-spoke handoff pattern** | Workers → board → Beth → board → next worker |
| **Backlog.md CLI** | Human-facing tracking unchanged |
| **`/memories/` filesystem** | Per-user and per-repo notes unchanged |
| **Quality gates** (tests, accessibility, TypeScript strict) | Enforced via test validation after every merge |
| **Epic discipline** | Same decomposition pattern, tracked on board instead of beads |
| **IDEO Design Thinking phases** | Same 5-phase workflow across agent roles |
| **Beth's personality** | *"They broke my wings and forgot I had claws."* — unchanged and non-negotiable |

---

## Open Questions (Resolved)

> All 8 questions resolved 2026-03-13 based on competitive analysis of ruflo v3.5 and architectural reasoning.

### 1. Daemon lifecycle → **tmux session (default), systemd optional**

tmux gives us the best of both worlds: survives terminal close, trivially inspectable (`tmux attach`), and logs scroll back. No root access required. The CLI provides `swarm start` (launches tmux session), `swarm attach` (inspects), `swarm stop` (graceful shutdown). For production/CI environments, we document a systemd unit file as an optional alternative. Direct foreground mode (`swarm run`) available for debugging.

### 2. Multi-repo support → **One swarm per repo. Period.**

Sufficient for all current use cases. Cross-repo work is a different problem — it's a coordination layer above the swarm, not within it. Don't design for it until there's a real user need. ruflo supports "one project scope" as their default too.

### 3. Model routing → **Yes. 3-tier routing, stolen from ruflo.**

Different tasks deserve different models. This is high-value, low-effort since the `openai` package already supports different deployments via `model` parameter. See [Competitive Intelligence: Model Routing](#stolen-pattern-model-routing) below for full design.

### 4. Cost guardrails → **Per-task token limits + per-epic spending caps + kill switch**

Three layers of protection:
- **Per-task:** Workers track token usage via the `openai` response `usage` field. If a single task exceeds its budget (configurable, default 50K input + 10K output tokens), the worker stops and posts a blocker.
- **Per-epic:** Beth tracks cumulative token usage across all workers for an epic. If the epic budget is exceeded (configurable, default $5.00 estimated cost), Beth pauses dispatch and notifies the user.
- **Kill switch:** Global `swarm.yaml` setting `max_daily_spend_usd`. If cumulative daily spend exceeds this, the daemon pauses all work and logs a warning. User must `swarm resume` to continue.

Token costs are estimated using known per-model pricing in `config.py`. Not exact — but close enough for guardrails.

### 5. Backlog.md integration → **Auto-update on epic close, manual for subtasks**

When Beth closes an epic (all subtasks merged, tests passing), she runs `backlog task edit <id> -s "Done" --plain` automatically. Subtask status updates during the epic remain internal to the board — Backlog.md only reflects epic-level milestones. This keeps the human-facing view clean while the board handles the fine-grained coordination.

### 6. Copilot coexistence → **Both coexist. Independent systems, shared repo.**

The swarm daemon and Copilot agent mode are independent. The swarm operates on its own branches (worker worktrees, epic branches). Copilot operates on whatever branch the user has checked out. They share the same `.github/agents/` and `.github/skills/` directories (read-only for both). The only conflict risk is if a user in Copilot and a swarm worker try to push to the same branch — avoided by convention (swarm uses `worker/*` and `epic/*` branch namespaces).

### 7. Authentication → **API key for v1. Entra ID documented for later.**

API key (`AZURE_OPENAI_API_KEY` env var) is the right choice for Phase 0–3. It's simple, works on any workstation, no Azure AD configuration required. Entra ID (managed identity) is documented as the upgrade path for team/CI environments where key rotation is a concern. The `openai` package supports both via `AzureOpenAI(api_key=...)` vs `AzureOpenAI(azure_ad_token_provider=...)` — the switch is a config change, not a refactor.

### 8. `.agent.md` parsing → **Extract what we need, ignore Copilot-specific fields**

The Python parser reads `.agent.md` YAML frontmatter and extracts: `name`, `description`, and the markdown body (personality/instructions). Copilot-specific fields (`tools`, `handoffs`, `infer`, `model`) are silently ignored. The tool→callable mapping lives in `tools.py` (not in the agent definition), and handoff routing lives in `orchestrator.py`. No need for a field-by-field mapping document — the parser is three lines of YAML extraction.

---

## Competitive Intelligence

> Analysis of [ruflo v3.5](https://github.com/ruvnet/ruflo) (formerly claude-flow) — 20.9k stars, 2.3k forks, shipping MCP-based multi-agent orchestrator for Claude Code.

### What ruflo Gets Right (Stolen Patterns)

Three patterns worth stealing. Everything else is feature sprawl or overengineering for our use case.

### Stolen Pattern: Model Routing

ruflo routes tasks through 3 tiers: WASM transforms for trivial edits ($0, <1ms), cheap models for medium tasks (Haiku-class), and full models for complex reasoning (Opus-class). We adapt this to Azure OpenAI deployments.

**Design:**

```yaml
# swarm.yaml
model_routing:
  default: "gpt-4o"           # Default deployment for most work
  tiers:
    orchestrator: "gpt-4o"    # Beth decomposition and routing
    complex: "gpt-4o"         # Architecture, security design, multi-file reasoning
    standard: "gpt-4o-mini"   # Feature implementation, bug fixes, test writing
    simple: "gpt-4o-mini"     # Documentation, formatting, single-file edits
  
  # Agent → tier mapping (overridable per-task)
  agent_defaults:
    beth: "orchestrator"
    developer: "standard"
    tester: "simple"
    security-reviewer: "complex"
    product-manager: "standard"
    ux-designer: "standard"
    researcher: "standard"
```

**Implementation in `llm.py`:**

```python
def get_model_for_task(agent_role: str, task_complexity: str | None = None) -> str:
    """Resolve model deployment name for a task."""
    if task_complexity:
        return config.model_routing.tiers[task_complexity]
    return config.model_routing.agent_defaults.get(
        agent_role, config.model_routing.default
    )
```

Beth can override the tier per-task based on complexity assessment. This is a config concern, not a code concern — the `openai` client already accepts different `model` values per call.

**Why we skip WASM/Agent Booster:** ruflo's Agent Booster handles trivial edits (var→const, add-types) without LLM calls. Clever, but premature for us. Our agents don't do mechanical transforms — they reason about code. If we find a class of tasks that's wasting LLM calls on trivial edits, we can add a pre-routing filter later.

### Stolen Pattern: Outcome-Based Learning

ruflo stores successful task→agent→outcome patterns in a ReasoningBank with HNSW vector search. We steal the *concept* but implement it simply in SQLite — no vector layer, no neural networks, no SONA.

**Design:** The `outcomes` table schema is defined in [Outcome Tracking](#outcome-tracking) above.

**How Beth uses it:**

1. After every merge (success or failure), Beth writes an outcome row.
2. When routing a new task, Beth queries: *"What model tier has the highest success rate for this task type with this agent role?"*
3. If `gpt-4o-mini` has a 95% success rate for tester tasks, Beth routes tester work to the cheap model. If `gpt-4o-mini` fails 30% of security reviews, Beth routes those to `gpt-4o`.

```python
def suggest_model(agent_role: str, task_type: str) -> str:
    """Query outcomes to find best-performing model for this work."""
    rows = board.query("""
        SELECT model_used, 
               COUNT(*) as total,
               SUM(CASE WHEN success THEN 1 ELSE 0 END) as successes
        FROM outcomes 
        WHERE agent_role = ? AND task_type = ?
        GROUP BY model_used
        HAVING total >= 5
        ORDER BY (CAST(successes AS REAL) / total) DESC
        LIMIT 1
    """, (agent_role, task_type))
    return rows[0]["model_used"] if rows else get_model_for_task(agent_role)
```

This is 20 lines of SQL, not a neural network. It gets 80% of the value of ruflo's learning loop with 0.1% of the complexity.

### Stolen Pattern: Provider Abstraction

ruflo supports 6 LLM providers with automatic failover. We don't need 6, but we should not hardcode Azure OpenAI.

**Design:** The `openai` Python package already supports multiple backends via `base_url`:
- Azure OpenAI: `AzureOpenAI(azure_endpoint=...)`
- OpenAI direct: `OpenAI(api_key=...)`
- Any OpenAI-compatible API: `OpenAI(base_url="https://your-provider/v1")`

```yaml
# swarm.yaml
providers:
  primary:
    type: "azure"
    endpoint: "${AZURE_OPENAI_ENDPOINT}"
    api_key: "${AZURE_OPENAI_API_KEY}"
    api_version: "2024-12-01-preview"
  fallback:
    type: "openai"
    api_key: "${OPENAI_API_KEY}"
```

**Implementation:** `llm.py` creates the primary client on startup. If a call fails with a retryable error (429, 500, 503), it falls back to the secondary provider. This is ~30 lines of code on top of what we already have.

### What We're NOT Stealing from ruflo

| ruflo Feature | Why We Skip It |
|---------------|---------------|
| HNSW vector memory | Premature. SQLite text search handles our scale. Add vectors when we have 10K+ outcomes. |
| SONA self-learning neural architecture | Academic overengineering. Our SQL-based outcome learning is sufficient. |
| Byzantine fault-tolerant consensus | Our agents aren't adversarial Byzantine nodes. They're LLM calls on your laptop. Sequential merge is fine. |
| 60+ agent types | Feature padding. Our 7 roles with clear IDEO boundaries are more useful than 60 vaguely-differentiated prompt variants. |
| Queen/Worker hierarchy | We already have this — it's called Beth + 6 workers. No need for a formal "queen" abstraction. |
| 137+ skills / IPFS marketplace | Our 40+ skills cover our domain. Marketplace is a distribution concern, not an architecture concern. |
| Agent Booster (WASM transforms) | Our agents reason about code, not do mechanical transforms. If we need this, we add it as a pre-filter later. |
| Agentic-Jujutsu (jj-based VCS) | Git worktrees already solve our isolation problem. Adding a second VCS is unnecessary complexity. |
| Claims-based human-agent coordination | Our Backlog.md CLI already handles this. Don't build a second coordination layer. |
