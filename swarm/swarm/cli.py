"""CLI for the Beth Swarm — ``swarm start|run|stop|status|resume|attach|board|outcomes``.

Designed for humans operating the daemon.  Each subcommand maps to a
thin wrapper around the orchestrator / tmux / board APIs.

Usage::

    python -m swarm start --config swarm.yaml          # daemon (tmux)
    python -m swarm run   --config swarm.yaml           # foreground
    python -m swarm stop                                # graceful stop
    python -m swarm status                              # show workers/queue/spend
    python -m swarm resume --config swarm.yaml          # crash recovery
    python -m swarm attach                              # tmux attach
    python -m swarm board  [channel]                    # query message board
    python -m swarm outcomes [--epic EPIC] [--limit N]  # query outcomes
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path
from typing import Any

from .board import MessageBoard
from .config import SwarmConfig
from .logging_config import configure_logging
from .orchestrator import (
    Orchestrator,
    attach_daemon,
    daemon_status,
    start_daemon,
    stop_daemon,
)


def build_parser() -> argparse.ArgumentParser:
    """Build the argparse parser with all subcommands."""
    parser = argparse.ArgumentParser(
        prog="swarm",
        description="Beth Swarm — persistent multi-agent orchestrator",
    )
    parser.add_argument(
        "--log-level", default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        help="Log level (default: INFO)",
    )
    parser.add_argument(
        "--human", action="store_true",
        help="Use human-readable log format instead of JSON",
    )

    subs = parser.add_subparsers(dest="command", required=True)

    # --- start (daemon mode via tmux) ---
    p_start = subs.add_parser("start", help="Start swarm as tmux daemon")
    p_start.add_argument("--config", required=True, help="Path to swarm.yaml")
    p_start.add_argument("--repo", default=".", help="Repo root (default: cwd)")
    p_start.add_argument("--session", default="beth-swarm", help="tmux session name")

    # --- run (foreground) ---
    p_run = subs.add_parser("run", help="Run swarm in foreground")
    p_run.add_argument("--config", required=True, help="Path to swarm.yaml")
    p_run.add_argument("--repo", default=".", help="Repo root (default: cwd)")
    p_run.add_argument(
        "--drain-timeout", type=float, default=60.0,
        help="Seconds to wait for in-progress tasks on shutdown (default: 60)",
    )

    # --- stop ---
    p_stop = subs.add_parser("stop", help="Gracefully stop the daemon")
    p_stop.add_argument("--session", default="beth-swarm", help="tmux session name")

    # --- status ---
    p_status = subs.add_parser("status", help="Show swarm status")
    p_status.add_argument("--config", help="Path to swarm.yaml (for board query)")
    p_status.add_argument("--session", default="beth-swarm", help="tmux session name")

    # --- resume (crash recovery) ---
    p_resume = subs.add_parser("resume", help="Resume from crash (rebuild state from board)")
    p_resume.add_argument("--config", required=True, help="Path to swarm.yaml")
    p_resume.add_argument("--repo", default=".", help="Repo root (default: cwd)")
    p_resume.add_argument(
        "--drain-timeout", type=float, default=60.0,
        help="Seconds to wait for in-progress tasks on shutdown (default: 60)",
    )

    # --- attach ---
    p_attach = subs.add_parser("attach", help="Attach to the daemon tmux session")
    p_attach.add_argument("--session", default="beth-swarm", help="tmux session name")

    # --- board ---
    p_board = subs.add_parser("board", help="Query the message board")
    p_board.add_argument("channel", nargs="?", help="Channel name (or list all)")
    p_board.add_argument("--config", required=True, help="Path to swarm.yaml")
    p_board.add_argument("--limit", type=int, default=20, help="Max posts to show")

    # --- outcomes ---
    p_outcomes = subs.add_parser("outcomes", help="Query outcome history")
    p_outcomes.add_argument("--config", required=True, help="Path to swarm.yaml")
    p_outcomes.add_argument("--epic", help="Filter by epic ID")
    p_outcomes.add_argument("--limit", type=int, default=20, help="Max results")

    return parser


# ---------------------------------------------------------------------------
# Command handlers
# ---------------------------------------------------------------------------


def cmd_start(args: argparse.Namespace) -> int:
    """Launch daemon in tmux."""
    ok = start_daemon(
        config_path=args.config,
        repo_root=args.repo,
        session_name=args.session,
    )
    if ok:
        print(f"Swarm daemon started in tmux session '{args.session}'")
        print(f"  Attach: swarm attach --session {args.session}")
        print(f"  Status: swarm status --session {args.session}")
        return 0
    else:
        print("Failed to start daemon (is tmux installed? session already running?)", file=sys.stderr)
        return 1


def cmd_run(args: argparse.Namespace) -> int:
    """Run orchestrator in foreground."""
    config = SwarmConfig.from_yaml(args.config)
    repo_root = Path(args.repo).resolve()
    board = MessageBoard(config.db_path)

    orch = Orchestrator(config=config, board=board, repo_root=repo_root)

    try:
        asyncio.run(orch.run(drain_timeout=args.drain_timeout))
    except KeyboardInterrupt:
        pass
    finally:
        board.close()

    return 0


def cmd_stop(args: argparse.Namespace) -> int:
    """Send stop signal to daemon."""
    ok = stop_daemon(session_name=args.session)
    if ok:
        print(f"Stop signal sent to '{args.session}'")
        return 0
    else:
        print(f"No running session '{args.session}'", file=sys.stderr)
        return 1


def cmd_status(args: argparse.Namespace) -> int:
    """Show daemon/board status."""
    info = daemon_status(session_name=args.session)
    print(json.dumps(info, indent=2))

    # If config provided, also show board summary
    if args.config:
        config = SwarmConfig.from_yaml(args.config)
        board = MessageBoard(config.db_path)
        try:
            channels = board.list_channels()
            print("\nBoard channels:")
            for ch in channels:
                posts = board.read_all(ch["name"])
                print(f"  {ch['name']}: {len(posts)} posts")
        finally:
            board.close()

    return 0


def cmd_resume(args: argparse.Namespace) -> int:
    """Resume from crash — recover state from board + run."""
    config = SwarmConfig.from_yaml(args.config)
    repo_root = Path(args.repo).resolve()
    board = MessageBoard(config.db_path)

    print("Recovering state from board...")
    orch = Orchestrator.recover_from_board(config=config, board=board, repo_root=repo_root)

    epic_count = len(orch.epics)
    task_count = sum(len(e.tasks) for e in orch.epics.values())
    print(f"Recovered {epic_count} epics, {task_count} tasks")
    print("Resuming orchestration loop...")

    try:
        asyncio.run(orch.run(drain_timeout=args.drain_timeout))
    except KeyboardInterrupt:
        pass
    finally:
        board.close()

    return 0


def cmd_attach(args: argparse.Namespace) -> int:
    """Attach to tmux session."""
    import subprocess

    if not attach_daemon(session_name=args.session):
        print(f"No running session '{args.session}'", file=sys.stderr)
        return 1

    subprocess.run(["tmux", "attach-session", "-t", args.session])
    return 0


def cmd_board(args: argparse.Namespace) -> int:
    """Query the message board."""
    config = SwarmConfig.from_yaml(args.config)
    board = MessageBoard(config.db_path)

    try:
        if args.channel:
            posts = board.read_all(args.channel)
            for post in posts[-args.limit:]:
                entry = {
                    "id": post.id,
                    "agent": post.agent_id,
                    "title": post.title,
                    "body": post.body[:200],
                    "metadata": post.metadata,
                    "created_at": post.created_at,
                }
                print(json.dumps(entry))
        else:
            channels = board.list_channels()
            for ch in channels:
                posts = board.read_all(ch["name"])
                print(f"{ch['name']}: {len(posts)} posts")
    finally:
        board.close()

    return 0


def cmd_outcomes(args: argparse.Namespace) -> int:
    """Query outcome history."""
    config = SwarmConfig.from_yaml(args.config)
    board = MessageBoard(config.db_path)

    try:
        outcomes = board.query_outcomes(
            epic_id=args.epic,
            limit=args.limit,
        )
        for o in outcomes:
            entry = {
                "epic": o.epic_id,
                "task": o.task_id,
                "agent": o.agent_role,
                "model": o.model_used,
                "tokens_in": o.tokens_in,
                "tokens_out": o.tokens_out,
                "duration_ms": o.duration_ms,
                "success": o.success,
                "created_at": o.created_at,
            }
            print(json.dumps(entry))
    finally:
        board.close()

    return 0


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

_COMMANDS = {
    "start": cmd_start,
    "run": cmd_run,
    "stop": cmd_stop,
    "status": cmd_status,
    "resume": cmd_resume,
    "attach": cmd_attach,
    "board": cmd_board,
    "outcomes": cmd_outcomes,
}


def main(argv: list[str] | None = None) -> int:
    """CLI entry point."""
    parser = build_parser()
    args = parser.parse_args(argv)

    configure_logging(level=args.log_level, json_output=not args.human)

    handler = _COMMANDS.get(args.command)
    if handler is None:
        parser.print_help()
        return 1

    return handler(args)
