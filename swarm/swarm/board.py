"""SQLite WAL message board — channels, posts, threading, cursors, outcomes.

Design adopted from Pied Piper/AgentHub (channel → post model, self-referencing
parent_id for threading) and extended with structured metadata fields and an
outcomes table for model routing intelligence.

All SQLite pragmas match Pied Piper's configuration:
  journal_mode=WAL, busy_timeout=5000, foreign_keys=ON, synchronous=NORMAL
"""

from __future__ import annotations

import json
import sqlite3
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .config import CHANNELS

# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass
class Post:
    """A single message board post."""

    id: int
    channel_id: int
    channel_name: str
    agent_id: str
    parent_id: int | None
    title: str | None
    body: str
    metadata: dict[str, Any] | None
    created_at: str


@dataclass
class Outcome:
    """A recorded outcome for model routing intelligence."""

    id: int
    epic_id: str
    task_id: str
    agent_role: str
    task_type: str | None
    model_used: str
    tokens_in: int
    tokens_out: int
    duration_ms: int
    success: bool
    description: str | None
    created_at: str


# ---------------------------------------------------------------------------
# Connection helper
# ---------------------------------------------------------------------------


def connect_board(db_path: str | Path) -> sqlite3.Connection:
    """Open a SQLite connection with WAL mode and matching Pied Piper pragmas.

    ``check_same_thread=False`` is safe here because all public access is
    serialised through ``MessageBoard._lock``.
    """
    conn = sqlite3.connect(str(db_path), check_same_thread=False)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.row_factory = sqlite3.Row
    return conn


# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------

_SCHEMA_SQL = """\
CREATE TABLE IF NOT EXISTS channels (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT UNIQUE NOT NULL,
    description TEXT DEFAULT '',
    created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS posts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id  INTEGER NOT NULL REFERENCES channels(id),
    agent_id    TEXT NOT NULL,
    parent_id   INTEGER REFERENCES posts(id),
    title       TEXT,
    body        TEXT NOT NULL,
    metadata    TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_posts_channel ON posts(channel_id);
CREATE INDEX IF NOT EXISTS idx_posts_parent ON posts(parent_id);
CREATE INDEX IF NOT EXISTS idx_posts_agent ON posts(agent_id);

CREATE TABLE IF NOT EXISTS outcomes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    epic_id     TEXT NOT NULL,
    task_id     TEXT NOT NULL,
    agent_role  TEXT NOT NULL,
    task_type   TEXT,
    model_used  TEXT NOT NULL,
    tokens_in   INTEGER NOT NULL,
    tokens_out  INTEGER NOT NULL,
    duration_ms INTEGER NOT NULL,
    success     BOOLEAN NOT NULL,
    description TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_outcomes_agent ON outcomes(agent_role);
CREATE INDEX IF NOT EXISTS idx_outcomes_type ON outcomes(task_type);
CREATE INDEX IF NOT EXISTS idx_outcomes_success ON outcomes(success);
"""


# ---------------------------------------------------------------------------
# MessageBoard
# ---------------------------------------------------------------------------


class MessageBoard:
    """SQLite WAL message board with cursor-based reads.

    Thread-safe: each public method acquires a lock before touching the
    connection.  For true multi-process access, each process should open its
    own ``MessageBoard`` instance (SQLite WAL handles the coordination natively).

    Parameters
    ----------
    db_path : str | Path
        Path to the SQLite database file.  Use ``":memory:"`` for tests.
    """

    def __init__(self, db_path: str | Path = ":memory:") -> None:
        self._db_path = str(db_path)
        self._conn = connect_board(self._db_path)
        self._lock = threading.Lock()
        # Cursor tracking: reader_id → channel_name → last_seen_post_id
        self._cursors: dict[str, dict[str, int]] = {}
        self._init_schema()

    # ----- lifecycle -----

    def close(self) -> None:
        with self._lock:
            self._conn.close()

    # ----- schema -----

    def _init_schema(self) -> None:
        with self._lock:
            self._conn.executescript(_SCHEMA_SQL)
            # Seed the 7 channels
            for ch in CHANNELS:
                self._conn.execute(
                    "INSERT OR IGNORE INTO channels (name, description) VALUES (?, ?)",
                    (ch["name"], ch["description"]),
                )
            self._conn.commit()

    # ----- channel queries -----

    def get_channel_id(self, name: str) -> int:
        """Return the integer ID for a channel name. Raises ValueError if not found."""
        with self._lock:
            row = self._conn.execute(
                "SELECT id FROM channels WHERE name = ?", (name,)
            ).fetchone()
        if row is None:
            raise ValueError(f"Unknown channel: {name!r}")
        return row["id"]

    def list_channels(self) -> list[dict[str, Any]]:
        """Return all channels as dicts."""
        with self._lock:
            rows = self._conn.execute(
                "SELECT id, name, description, created_at FROM channels ORDER BY id"
            ).fetchall()
        return [dict(r) for r in rows]

    # ----- post writes -----

    def post(
        self,
        channel: str,
        agent_id: str,
        body: str,
        *,
        title: str | None = None,
        parent_id: int | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> int:
        """Write a post to a channel. Returns the new post ID.

        Parameters
        ----------
        channel : str
            Channel name (e.g. ``"tasks"``).
        agent_id : str
            Identifier for the posting agent (e.g. ``"developer"``).
        body : str
            Post body text.
        title : str | None
            Optional title.
        parent_id : int | None
            If set, this post is a reply to the given post ID.
        metadata : dict | None
            Arbitrary JSON-serialisable metadata.
        """
        channel_id = self.get_channel_id(channel)
        meta_json = json.dumps(metadata) if metadata is not None else None

        with self._lock:
            cur = self._conn.execute(
                "INSERT INTO posts (channel_id, agent_id, parent_id, title, body, metadata) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (channel_id, agent_id, parent_id, title, body, meta_json),
            )
            self._conn.commit()
            return cur.lastrowid  # type: ignore[return-value]

    # ----- post reads -----

    def read_new(self, channel: str, reader_id: str) -> list[Post]:
        """Return posts in *channel* that *reader_id* hasn't seen yet.

        Uses cursor-based tracking: each reader maintains the highest post ID
        they've consumed per channel.  Only posts with ``id > cursor`` are
        returned, and the cursor is then advanced.
        """
        channel_id = self.get_channel_id(channel)

        reader_cursors = self._cursors.setdefault(reader_id, {})
        last_seen = reader_cursors.get(channel, 0)

        with self._lock:
            rows = self._conn.execute(
                "SELECT p.id, p.channel_id, c.name AS channel_name, p.agent_id, "
                "p.parent_id, p.title, p.body, p.metadata, p.created_at "
                "FROM posts p JOIN channels c ON p.channel_id = c.id "
                "WHERE p.channel_id = ? AND p.id > ? ORDER BY p.id",
                (channel_id, last_seen),
            ).fetchall()

        posts = [self._row_to_post(r) for r in rows]
        if posts:
            reader_cursors[channel] = posts[-1].id
        return posts

    def read_all(self, channel: str) -> list[Post]:
        """Return *all* posts in a channel (ignores cursors)."""
        channel_id = self.get_channel_id(channel)
        with self._lock:
            rows = self._conn.execute(
                "SELECT p.id, p.channel_id, c.name AS channel_name, p.agent_id, "
                "p.parent_id, p.title, p.body, p.metadata, p.created_at "
                "FROM posts p JOIN channels c ON p.channel_id = c.id "
                "WHERE p.channel_id = ? ORDER BY p.id",
                (channel_id,),
            ).fetchall()
        return [self._row_to_post(r) for r in rows]

    def get_replies(self, post_id: int) -> list[Post]:
        """Return all direct replies to a post (self-referencing parent_id)."""
        with self._lock:
            rows = self._conn.execute(
                "SELECT p.id, p.channel_id, c.name AS channel_name, p.agent_id, "
                "p.parent_id, p.title, p.body, p.metadata, p.created_at "
                "FROM posts p JOIN channels c ON p.channel_id = c.id "
                "WHERE p.parent_id = ? ORDER BY p.id",
                (post_id,),
            ).fetchall()
        return [self._row_to_post(r) for r in rows]

    def get_post(self, post_id: int) -> Post | None:
        """Retrieve a single post by ID, or None."""
        with self._lock:
            row = self._conn.execute(
                "SELECT p.id, p.channel_id, c.name AS channel_name, p.agent_id, "
                "p.parent_id, p.title, p.body, p.metadata, p.created_at "
                "FROM posts p JOIN channels c ON p.channel_id = c.id "
                "WHERE p.id = ?",
                (post_id,),
            ).fetchone()
        return self._row_to_post(row) if row else None

    # ----- outcomes -----

    def record_outcome(
        self,
        *,
        epic_id: str,
        task_id: str,
        agent_role: str,
        model_used: str,
        tokens_in: int,
        tokens_out: int,
        duration_ms: int,
        success: bool,
        task_type: str | None = None,
        description: str | None = None,
    ) -> int:
        """Record a task outcome for model routing intelligence. Returns row ID."""
        with self._lock:
            cur = self._conn.execute(
                "INSERT INTO outcomes "
                "(epic_id, task_id, agent_role, task_type, model_used, "
                "tokens_in, tokens_out, duration_ms, success, description) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    epic_id, task_id, agent_role, task_type, model_used,
                    tokens_in, tokens_out, duration_ms, success, description,
                ),
            )
            self._conn.commit()
            return cur.lastrowid  # type: ignore[return-value]

    def query_outcomes(
        self,
        *,
        epic_id: str | None = None,
        agent_role: str | None = None,
        task_type: str | None = None,
        success: bool | None = None,
        limit: int = 100,
    ) -> list[Outcome]:
        """Query outcomes with optional filters."""
        clauses: list[str] = []
        params: list[Any] = []
        if epic_id is not None:
            clauses.append("epic_id = ?")
            params.append(epic_id)
        if agent_role is not None:
            clauses.append("agent_role = ?")
            params.append(agent_role)
        if task_type is not None:
            clauses.append("task_type = ?")
            params.append(task_type)
        if success is not None:
            clauses.append("success = ?")
            params.append(success)

        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        params.append(limit)

        with self._lock:
            rows = self._conn.execute(
                f"SELECT * FROM outcomes {where} ORDER BY created_at DESC LIMIT ?",
                params,
            ).fetchall()
        return [
            Outcome(
                id=r["id"],
                epic_id=r["epic_id"],
                task_id=r["task_id"],
                agent_role=r["agent_role"],
                task_type=r["task_type"],
                model_used=r["model_used"],
                tokens_in=r["tokens_in"],
                tokens_out=r["tokens_out"],
                duration_ms=r["duration_ms"],
                success=bool(r["success"]),
                description=r["description"],
                created_at=r["created_at"],
            )
            for r in rows
        ]

    # ----- internals -----

    @staticmethod
    def _row_to_post(row: sqlite3.Row) -> Post:
        meta_raw = row["metadata"]
        metadata = json.loads(meta_raw) if meta_raw else None
        return Post(
            id=row["id"],
            channel_id=row["channel_id"],
            channel_name=row["channel_name"],
            agent_id=row["agent_id"],
            parent_id=row["parent_id"],
            title=row["title"],
            body=row["body"],
            metadata=metadata,
            created_at=row["created_at"],
        )
