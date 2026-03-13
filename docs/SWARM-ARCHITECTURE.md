# Beth Agent Swarm — Architecture Plan

> *"I'm not here to wreck one thing. When I fix this, I'm fixing it for generations."*

**Status:** Plan — not yet implemented  
**Date:** 2026-03-13  
**Supersedes:** [DOCKER-SWARM.md](DOCKER-SWARM.md) (conceptual Docker/Redis approach — abandoned in favor of this design)

---

## TL;DR

Refactor Beth from a Copilot-hosted agent (synchronous `runSubagent()` calls inside VS Code) into a **persistent Python daemon swarm** where Beth orchestrates autonomous worker agents. Each worker runs in its own **git worktree**, communicates via a **SQLite WAL message board** (Pied Piper's channel/post/reply schema, implemented natively), and calls **Azure OpenAI directly** for LLM inference. All existing logic, handoffs, skills, and agent roles are preserved.

---

## Table of Contents

1. [Why](#why)
2. [Key Architectural Decisions](#key-architectural-decisions)
3. [Current Architecture (What We're Leaving)](#current-architecture)
4. [Target Architecture (What We're Building)](#target-architecture)
5. [Message Board (SQLite WAL)](#message-board)
6. [Git Worktree Isolation](#git-worktree-isolation)
7. [Merge Conflict Resolution](#merge-conflict-resolution)
8. [LLM Client (Azure OpenAI Direct)](#llm-client)
9. [Agent Roles & Skills (Preserved)](#agent-roles--skills)
10. [Orchestrator (Beth)](#orchestrator)
11. [Worker Agent Loop](#worker-agent-loop)
12. [Context Window Management](#context-window-management)
13. [Module Map](#module-map)
14. [Migration Path](#migration-path)
15. [Phased Implementation](#phased-implementation)
16. [What We're Dropping](#what-were-dropping)
17. [What We're Keeping](#what-were-keeping)
18. [Open Questions](#open-questions)

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
| **LLM Client** | Azure OpenAI direct (`openai` package) | Copilot SDK, GitHub Models API | No GitHub auth token lifecycle for daemons; full control over parameters; simpler dependency; BYOM without abstraction overhead |
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
│  │              │◀───│ (channels/posts/replies)     │ │
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

The message board schema is adapted from [Pied Piper](https://github.com/stephschofield/piedpiper) (fork of [AgentHub](https://github.com/ygivenx/agenthub) by ygivenx). We steal their proven **channel → post → reply** model but implement it natively in Python with `sqlite3` — no Go server dependency.

### Schema

```sql
CREATE TABLE channels (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT UNIQUE NOT NULL,
    description TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE posts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id  INTEGER NOT NULL REFERENCES channels(id),
    agent_id    TEXT NOT NULL,
    title       TEXT NOT NULL,
    body        TEXT NOT NULL,
    metadata    TEXT,  -- JSON blob for structured data
    created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE replies (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id     INTEGER NOT NULL REFERENCES posts(id),
    agent_id    TEXT NOT NULL,
    body        TEXT NOT NULL,
    metadata    TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_posts_channel ON posts(channel_id);
CREATE INDEX idx_replies_post ON replies(post_id);
CREATE INDEX idx_posts_agent ON posts(agent_id);
```

### SQLite WAL Configuration

```python
import sqlite3

def connect_board(db_path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.row_factory = sqlite3.Row
    return conn
```

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

## LLM Client (Azure OpenAI Direct)

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
├── board.py             # SQLite WAL message board (channels, posts, replies)
├── llm.py               # Azure OpenAI client wrapper, agent_loop()
├── tools.py             # Tool definitions and execution (read/write/edit/run/search)
├── git.py               # Worktree management (create, merge, cleanup)
├── orchestrator.py      # Beth's orchestration loop
├── worker.py            # Worker agent loop
├── agents.py            # Agent prompt loading from .agent.md files
├── skills.py            # Skill loading from .github/skills/
├── budget.py            # Token budget tracking and context compaction
└── tests/
    ├── test_board.py
    ├── test_git.py
    ├── test_tools.py
    ├── test_orchestrator.py
    ├── test_worker.py
    └── test_llm.py
```

### Module Responsibilities

| Module | Responsibility | Key Dependencies |
|--------|---------------|-----------------|
| `main.py` | CLI parsing, daemon mode, signal handling | `orchestrator`, `config` |
| `config.py` | Load config from `swarm.yaml` or env vars | stdlib only |
| `board.py` | SQLite WAL CRUD for channels/posts/replies; `read_new()` with cursor tracking | `sqlite3` |
| `llm.py` | Azure OpenAI chat completions with tool-use loop | `openai` |
| `tools.py` | Tool function registry; maps function names → callables; sandboxed to worktree | `board`, `git` |
| `git.py` | `create_worktree()`, `merge_branch()`, `cleanup_worktree()`, conflict detection | `subprocess` (git CLI) |
| `orchestrator.py` | Beth's poll loop: read board, dispatch tasks, sequence merges, check heartbeats | `board`, `git`, `llm`, `worker` |
| `worker.py` | Tool-use agent loop with context management; one instance per task | `llm`, `tools`, `board`, `skills` |
| `agents.py` | Parse `.agent.md` YAML frontmatter + instructions into system prompts | `yaml` |
| `skills.py` | Load `SKILL.md` files, inject per skill enforcement map | filesystem reads |
| `budget.py` | Token counting, compaction trigger, conversation summarization | `tiktoken` |

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

### Phase 0: Foundation
- [ ] Set up Python project structure (`swarm/` package, pyproject.toml, tests)
- [ ] Implement `config.py` with environment variable loading
- [ ] Implement `board.py` — SQLite WAL message board with channel/post/reply CRUD
- [ ] Unit tests for board (concurrent reads, write serialization, WAL recovery)

### Phase 1: Single Agent Loop (Prove It Works)
- [ ] Implement `llm.py` — Azure OpenAI client with tool-use loop
- [ ] Implement `tools.py` — basic tools (read_file, write_file, edit_file, run_command)
- [ ] Implement `agents.py` — parse `.agent.md` into system prompts
- [ ] Implement `skills.py` — load SKILL.md files
- [ ] Implement `worker.py` — single worker loop
- [ ] **Milestone:** One developer agent can receive a task via the board, work on it, and post completion

### Phase 2: Git Worktrees
- [ ] Implement `git.py` — worktree create, merge, cleanup
- [ ] Wire worktree creation into worker startup
- [ ] Wire merge sequencing into Beth (manual, non-daemon)
- [ ] **Milestone:** Two workers operating in parallel on separate worktrees, Beth merges sequentially

### Phase 3: Orchestrator Daemon
- [ ] Implement `orchestrator.py` — Beth's poll loop
- [ ] Implement epic decomposition via LLM
- [ ] Wire claims channel for partition-based conflict prevention
- [ ] Implement heartbeat monitoring and stuck worker detection
- [ ] **Milestone:** Beth daemon decomposes a feature request, dispatches to 3+ workers, merges results

### Phase 4: Conflict Handling + Robustness
- [ ] Auto-resolve trivial merge conflicts
- [ ] Test validation gate after every merge
- [ ] Blocker escalation (worker posts to blockers → Beth intervenes)
- [ ] Implement `budget.py` — context window tracking and compaction
- [ ] **Milestone:** System handles a multi-agent epic with a merge conflict and recovers gracefully

### Phase 5: Production Hardening
- [ ] CLI interface (`python -m swarm start`, `swarm status`, `swarm stop`)
- [ ] Graceful shutdown (finish in-progress work, don't accept new tasks)
- [ ] Logging and observability (structured logs, board queries for status)
- [ ] Integration with Backlog.md CLI for human-facing updates
- [ ] Documentation and onboarding guide

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

## Open Questions

1. **Daemon lifecycle** — systemd service? tmux session? Direct foreground process? Needs to survive terminal close but also be easy to inspect.

2. **Multi-repo support** — current design is one swarm per repo. Is that sufficient, or do we need a swarm that spans multiple repos?

3. **Model routing** — should different agents use different models (e.g., GPT-4o for Beth orchestration, Claude for developer, cheaper models for tester)? The `openai` package supports this via different deployments, but needs config design.

4. **Cost guardrails** — budget module design: per-task token limits? Per-epic spending caps? Kill switch when costs exceed threshold?

5. **Backlog.md integration** — should the orchestrator auto-update Backlog.md when epics complete, or keep that manual/human-triggered?

6. **Copilot coexistence** — can the swarm run alongside Copilot agent mode for ad-hoc tasks, or is it one-or-the-other? Likely both can coexist since they're independent systems sharing the same repo.

7. **Authentication** — Azure OpenAI supports both API key and Entra ID (managed identity). Which is appropriate for a developer workstation daemon?

8. **Existing `.agent.md` parsing** — the YAML frontmatter includes Copilot-specific fields (`tools`, `handoffs`, `infer`). The Python parser needs to extract the useful parts (name, description, personality instructions) and ignore the Copilot-specific fields, or we define a mapping.
