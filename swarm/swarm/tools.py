"""Tool definitions and execution — 9-tool registry sandboxed to a working directory.

Each tool is a callable that operates within a specified working directory
(typically a git worktree). Tools are exposed to the LLM as OpenAI
function-calling tool definitions and executed when the model requests them.

Tools:
  1. read_file     — Read file contents
  2. write_file    — Create or overwrite a file
  3. edit_file     — Apply a targeted search/replace edit
  4. run_command   — Execute a shell command
  5. list_directory — List contents of a directory
  6. search_files  — Grep search across the working directory
  7. post_message  — Write to the SQLite message board
  8. read_messages — Read messages from a board channel
  9. load_skill    — Read a skill file from .github/skills/
"""

from __future__ import annotations

import json
import os
import re
import subprocess
from pathlib import Path
from typing import Any, Callable

from .board import MessageBoard


# ---------------------------------------------------------------------------
# Command blocklist — defense-in-depth against prompt injection RCE
# ---------------------------------------------------------------------------

DEFAULT_BLOCKED_PATTERNS: list[str] = [
    r"\brm\s+(-\w+\s+)*/($|\s|\*)",        # rm [-rf] / or /*
    r"\bcurl\b.*\|\s*\b(ba)?sh\b",           # curl ... | sh/bash
    r"\bwget\b.*\|\s*\b(ba)?sh\b",           # wget ... | sh/bash
    r"\b(nc|ncat|netcat)\b",                  # netcat variants
    r"\bchmod\s+777\b",                       # chmod 777
    r"\bmkfs\b",                               # make filesystem
    r"\bdd\s+if=",                              # dd raw disk operations
]


def _check_command_blocklist(
    command: str,
    blocked_patterns: list[str] | None = None,
) -> str | None:
    """Check a command against blocked patterns.

    Returns an error message string if the command matches a blocked pattern,
    or None if the command is allowed.
    """
    patterns = blocked_patterns if blocked_patterns is not None else DEFAULT_BLOCKED_PATTERNS
    for pattern in patterns:
        if re.search(pattern, command):
            return f"Command blocked by security policy: matches pattern '{pattern}'"
    return None


# ---------------------------------------------------------------------------
# Path validation — sandbox enforcement
# ---------------------------------------------------------------------------


def _resolve_sandboxed(relative_path: str, work_dir: Path) -> Path:
    """Resolve a path and verify it stays within the sandbox.

    Raises ValueError if the resolved path escapes the working directory.
    """
    # Normalize and resolve
    resolved = (work_dir / relative_path).resolve()
    work_resolved = work_dir.resolve()

    if not str(resolved).startswith(str(work_resolved)):
        raise ValueError(
            f"Path '{relative_path}' resolves to '{resolved}' which is outside "
            f"the working directory '{work_resolved}'"
        )
    return resolved


# ---------------------------------------------------------------------------
# Tool implementations
# ---------------------------------------------------------------------------


def tool_read_file(path: str, *, work_dir: Path) -> str:
    """Read and return the contents of a file."""
    resolved = _resolve_sandboxed(path, work_dir)
    if not resolved.is_file():
        return json.dumps({"error": f"File not found: {path}"})
    try:
        content = resolved.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return json.dumps({"error": f"Cannot read binary file: {path}"})
    # Truncate very large files to avoid blowing context
    max_chars = 100_000
    if len(content) > max_chars:
        content = content[:max_chars] + f"\n\n[Truncated — file is {len(content)} chars]"
    return content


def tool_write_file(path: str, content: str, *, work_dir: Path) -> str:
    """Create or overwrite a file with the given content."""
    resolved = _resolve_sandboxed(path, work_dir)
    resolved.parent.mkdir(parents=True, exist_ok=True)
    resolved.write_text(content, encoding="utf-8")
    return json.dumps({"success": True, "path": path, "bytes_written": len(content.encode("utf-8"))})


def tool_edit_file(path: str, old_string: str, new_string: str, *, work_dir: Path) -> str:
    """Apply a search/replace edit to a file. old_string must appear exactly once."""
    resolved = _resolve_sandboxed(path, work_dir)
    if not resolved.is_file():
        return json.dumps({"error": f"File not found: {path}"})

    content = resolved.read_text(encoding="utf-8")
    count = content.count(old_string)
    if count == 0:
        return json.dumps({"error": f"old_string not found in {path}"})
    if count > 1:
        return json.dumps({"error": f"old_string appears {count} times in {path} — must be unique"})

    new_content = content.replace(old_string, new_string, 1)
    resolved.write_text(new_content, encoding="utf-8")
    return json.dumps({"success": True, "path": path})


def tool_run_command(
    command: str,
    *,
    work_dir: Path,
    blocked_patterns: list[str] | None = None,
) -> str:
    """Execute a shell command in the working directory. Returns stdout/stderr.

    Commands are checked against a blocklist before execution.
    Pass ``blocked_patterns`` to override the default blocklist,
    or an empty list to disable blocking.
    """
    blocked_reason = _check_command_blocklist(command, blocked_patterns)
    if blocked_reason:
        return json.dumps({"error": blocked_reason})
    try:
        result = subprocess.run(
            command,
            shell=True,
            cwd=str(work_dir),
            capture_output=True,
            text=True,
            timeout=120,
        )
        output = result.stdout
        if result.stderr:
            output += f"\nSTDERR:\n{result.stderr}"

        # Truncate large output
        max_chars = 50_000
        if len(output) > max_chars:
            output = output[:max_chars] + "\n\n[Output truncated]"

        return json.dumps({
            "exit_code": result.returncode,
            "output": output,
        })
    except subprocess.TimeoutExpired:
        return json.dumps({"error": "Command timed out after 120 seconds"})


def tool_list_directory(path: str = ".", *, work_dir: Path) -> str:
    """List contents of a directory."""
    resolved = _resolve_sandboxed(path, work_dir)
    if not resolved.is_dir():
        return json.dumps({"error": f"Directory not found: {path}"})

    entries: list[str] = []
    try:
        for entry in sorted(resolved.iterdir()):
            name = entry.name
            if entry.is_dir():
                name += "/"
            entries.append(name)
    except PermissionError:
        return json.dumps({"error": f"Permission denied: {path}"})

    return json.dumps({"path": path, "entries": entries})


def tool_search_files(pattern: str, *, work_dir: Path, path: str = ".") -> str:
    """Grep search for a pattern across files in the working directory."""
    search_dir = _resolve_sandboxed(path, work_dir)
    if not search_dir.is_dir():
        return json.dumps({"error": f"Directory not found: {path}"})

    try:
        result = subprocess.run(
            ["grep", "-rn", "--include=*", "-l", pattern, str(search_dir)],
            capture_output=True,
            text=True,
            timeout=30,
            cwd=str(work_dir),
        )
        files = [
            os.path.relpath(f, str(work_dir))
            for f in result.stdout.strip().split("\n")
            if f
        ]
        return json.dumps({"pattern": pattern, "matching_files": files[:50]})
    except subprocess.TimeoutExpired:
        return json.dumps({"error": "Search timed out after 30 seconds"})


def tool_post_message(
    channel: str, body: str, *, board: MessageBoard, agent_id: str,
    title: str | None = None, parent_id: int | None = None,
    metadata: dict[str, Any] | None = None,
) -> str:
    """Post a message to the board."""
    post_id = board.post(
        channel=channel,
        agent_id=agent_id,
        body=body,
        title=title,
        parent_id=parent_id,
        metadata=metadata,
    )
    return json.dumps({"success": True, "post_id": post_id, "channel": channel})


def tool_read_messages(channel: str, *, board: MessageBoard, reader_id: str) -> str:
    """Read new messages from a board channel."""
    posts = board.read_new(channel, reader_id)
    return json.dumps({
        "channel": channel,
        "count": len(posts),
        "posts": [
            {
                "id": p.id,
                "agent_id": p.agent_id,
                "title": p.title,
                "body": p.body[:500],  # Truncate for context efficiency
                "metadata": p.metadata,
                "created_at": p.created_at,
            }
            for p in posts
        ],
    })


def tool_load_skill(skill_path: str, *, repo_root: Path) -> str:
    """Load a skill file from the repo."""
    try:
        full_path = _resolve_sandboxed(skill_path, repo_root)
    except ValueError as e:
        return json.dumps({"error": str(e)})
    if not full_path.is_file():
        return json.dumps({"error": f"Skill file not found: {skill_path}"})
    try:
        content = full_path.read_text(encoding="utf-8")
        return content
    except Exception as e:
        return json.dumps({"error": f"Failed to read skill: {e}"})


# ---------------------------------------------------------------------------
# Tool registry — maps names to OpenAI function-calling definitions + callables
# ---------------------------------------------------------------------------


TOOL_DEFINITIONS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "Read the contents of a file. Returns the file text.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Relative path to the file from the working directory."},
                },
                "required": ["path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "write_file",
            "description": "Create or overwrite a file with the given content. Parent directories are created automatically.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Relative path to the file."},
                    "content": {"type": "string", "description": "The full content to write to the file."},
                },
                "required": ["path", "content"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "edit_file",
            "description": "Apply a targeted search/replace edit to a file. The old_string must appear exactly once in the file.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Relative path to the file."},
                    "old_string": {"type": "string", "description": "The exact text to find (must appear exactly once)."},
                    "new_string": {"type": "string", "description": "The replacement text."},
                },
                "required": ["path", "old_string", "new_string"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "run_command",
            "description": "Execute a shell command in the working directory. Returns stdout, stderr, and exit code.",
            "parameters": {
                "type": "object",
                "properties": {
                    "command": {"type": "string", "description": "The shell command to execute."},
                },
                "required": ["command"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_directory",
            "description": "List the contents of a directory. Directories have a trailing /.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Relative path to the directory (default: current directory)."},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_files",
            "description": "Grep search for a pattern across files in the working directory or a subdirectory.",
            "parameters": {
                "type": "object",
                "properties": {
                    "pattern": {"type": "string", "description": "The search pattern (grep regex)."},
                    "path": {"type": "string", "description": "Subdirectory to search in (default: entire working dir)."},
                },
                "required": ["pattern"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "post_message",
            "description": "Post a message to the message board on a specific channel.",
            "parameters": {
                "type": "object",
                "properties": {
                    "channel": {"type": "string", "description": "Channel name (tasks, completions, claims, conflicts, learnings, blockers, heartbeats)."},
                    "body": {"type": "string", "description": "The message body."},
                    "title": {"type": "string", "description": "Optional message title."},
                    "parent_id": {"type": "integer", "description": "Optional parent post ID for threading."},
                    "metadata": {"type": "object", "description": "Optional JSON metadata."},
                },
                "required": ["channel", "body"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "read_messages",
            "description": "Read new (unseen) messages from a message board channel.",
            "parameters": {
                "type": "object",
                "properties": {
                    "channel": {"type": "string", "description": "Channel name to read from."},
                },
                "required": ["channel"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "load_skill",
            "description": "Load a skill file from .github/skills/. Returns the skill content for domain-specific knowledge.",
            "parameters": {
                "type": "object",
                "properties": {
                    "skill_path": {"type": "string", "description": "Relative path to the skill file (e.g. '.github/skills/prd/SKILL.md')."},
                },
                "required": ["skill_path"],
            },
        },
    },
]


def execute_tool(
    name: str,
    arguments: str,
    *,
    work_dir: Path,
    board: MessageBoard,
    agent_id: str,
    repo_root: Path,
    blocked_patterns: list[str] | None = None,
) -> str:
    """Execute a tool by name with JSON arguments. Returns a string result.

    All file operations are sandboxed to ``work_dir``. Board operations
    use the provided ``MessageBoard`` instance.

    Parameters
    ----------
    name : str
        Tool function name.
    arguments : str
        JSON string of arguments from the LLM.
    work_dir : Path
        Working directory (sandbox root).
    board : MessageBoard
        Message board instance.
    agent_id : str
        Agent identifier for board posts.
    repo_root : Path
        Repository root for skill file lookups.
    """
    try:
        args = json.loads(arguments)
    except json.JSONDecodeError:
        return json.dumps({"error": f"Invalid JSON arguments: {arguments}"})

    try:
        if name == "read_file":
            return tool_read_file(args["path"], work_dir=work_dir)
        elif name == "write_file":
            return tool_write_file(args["path"], args["content"], work_dir=work_dir)
        elif name == "edit_file":
            return tool_edit_file(
                args["path"], args["old_string"], args["new_string"], work_dir=work_dir
            )
        elif name == "run_command":
            return tool_run_command(
                args["command"],
                work_dir=work_dir,
                blocked_patterns=blocked_patterns,
            )
        elif name == "list_directory":
            return tool_list_directory(args.get("path", "."), work_dir=work_dir)
        elif name == "search_files":
            return tool_search_files(
                args["pattern"], work_dir=work_dir, path=args.get("path", ".")
            )
        elif name == "post_message":
            return tool_post_message(
                channel=args["channel"],
                body=args["body"],
                board=board,
                agent_id=agent_id,
                title=args.get("title"),
                parent_id=args.get("parent_id"),
                metadata=args.get("metadata"),
            )
        elif name == "read_messages":
            return tool_read_messages(
                channel=args["channel"], board=board, reader_id=agent_id
            )
        elif name == "load_skill":
            return tool_load_skill(args["skill_path"], repo_root=repo_root)
        else:
            return json.dumps({"error": f"Unknown tool: {name}"})
    except KeyError as e:
        return json.dumps({"error": f"Missing required argument: {e}"})
    except ValueError as e:
        return json.dumps({"error": str(e)})
    except Exception as e:
        return json.dumps({"error": f"Tool execution failed: {type(e).__name__}: {e}"})
