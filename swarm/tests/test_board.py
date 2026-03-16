"""Tests for swarm.board — SQLite WAL message board.

Covers:
- Channel creation (7 channels)
- Post CRUD and threading (self-referencing parent_id)
- Cursor-based read_new() per reader
- Concurrent writes from multiple threads (no corruption)
- WAL recovery after simulated crash
- Outcomes table CRUD
- Busy timeout under write contention
"""

from __future__ import annotations

import sqlite3
import threading
import time
from pathlib import Path

import pytest

from swarm.board import MessageBoard, Post, connect_board
from swarm.config import CHANNEL_NAMES


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


@pytest.fixture
def board() -> MessageBoard:
    """In-memory board for isolated tests."""
    b = MessageBoard(":memory:")
    yield b
    b.close()


@pytest.fixture
def disk_board(tmp_path: Path) -> MessageBoard:
    """On-disk board for WAL/crash tests."""
    db_path = tmp_path / "test_swarm.db"
    b = MessageBoard(db_path)
    yield b
    b.close()


# ---------------------------------------------------------------------------
# Channel tests
# ---------------------------------------------------------------------------


class TestChannels:
    def test_seven_channels_created(self, board: MessageBoard) -> None:
        channels = board.list_channels()
        assert len(channels) == 7
        names = {ch["name"] for ch in channels}
        assert names == set(CHANNEL_NAMES)

    def test_channel_ids_are_sequential(self, board: MessageBoard) -> None:
        channels = board.list_channels()
        ids = [ch["id"] for ch in channels]
        assert ids == list(range(1, 8))

    def test_unknown_channel_raises(self, board: MessageBoard) -> None:
        with pytest.raises(ValueError, match="Unknown channel"):
            board.get_channel_id("nonexistent")

    def test_idempotent_init(self) -> None:
        """Creating two boards on same DB doesn't duplicate channels."""
        b1 = MessageBoard(":memory:")
        # Re-init schema on same connection (simulating re-open)
        b1._init_schema()
        channels = b1.list_channels()
        assert len(channels) == 7
        b1.close()


# ---------------------------------------------------------------------------
# Post CRUD
# ---------------------------------------------------------------------------


class TestPosts:
    def test_post_and_read(self, board: MessageBoard) -> None:
        post_id = board.post("tasks", "beth", "Build auth flow", title="Auth Epic")
        assert post_id >= 1

        posts = board.read_all("tasks")
        assert len(posts) == 1
        assert posts[0].body == "Build auth flow"
        assert posts[0].title == "Auth Epic"
        assert posts[0].agent_id == "beth"
        assert posts[0].channel_name == "tasks"

    def test_post_with_metadata(self, board: MessageBoard) -> None:
        meta = {"epic_id": "beth-123", "skills": ["react", "typescript"]}
        post_id = board.post(
            "tasks", "beth", "Implement feature",
            metadata=meta,
        )
        post = board.get_post(post_id)
        assert post is not None
        assert post.metadata == meta

    def test_post_without_metadata(self, board: MessageBoard) -> None:
        post_id = board.post("heartbeats", "developer", "alive")
        post = board.get_post(post_id)
        assert post is not None
        assert post.metadata is None

    def test_threading_parent_id(self, board: MessageBoard) -> None:
        """Self-referencing parent_id for threaded replies."""
        parent_id = board.post("tasks", "beth", "Main task")
        reply_id = board.post(
            "tasks", "developer", "Working on it",
            parent_id=parent_id,
        )

        parent = board.get_post(parent_id)
        reply = board.get_post(reply_id)
        assert parent is not None
        assert reply is not None
        assert parent.parent_id is None
        assert reply.parent_id == parent_id

    def test_get_replies(self, board: MessageBoard) -> None:
        parent_id = board.post("tasks", "beth", "Epic task")
        board.post("tasks", "developer", "Reply 1", parent_id=parent_id)
        board.post("tasks", "tester", "Reply 2", parent_id=parent_id)
        board.post("tasks", "developer", "Unrelated post")  # not a reply

        replies = board.get_replies(parent_id)
        assert len(replies) == 2
        assert replies[0].agent_id == "developer"
        assert replies[1].agent_id == "tester"

    def test_get_post_nonexistent(self, board: MessageBoard) -> None:
        assert board.get_post(99999) is None

    def test_posts_across_channels(self, board: MessageBoard) -> None:
        board.post("tasks", "beth", "A task")
        board.post("completions", "developer", "Done!")
        board.post("blockers", "tester", "Stuck")

        assert len(board.read_all("tasks")) == 1
        assert len(board.read_all("completions")) == 1
        assert len(board.read_all("blockers")) == 1
        assert len(board.read_all("learnings")) == 0


# ---------------------------------------------------------------------------
# Cursor-based read_new()
# ---------------------------------------------------------------------------


class TestReadNew:
    def test_returns_only_unseen(self, board: MessageBoard) -> None:
        board.post("tasks", "beth", "Task 1")
        board.post("tasks", "beth", "Task 2")

        # First read: sees both
        new = board.read_new("tasks", "worker-1")
        assert len(new) == 2

        # Second read: nothing new
        new = board.read_new("tasks", "worker-1")
        assert len(new) == 0

        # Post something new
        board.post("tasks", "beth", "Task 3")
        new = board.read_new("tasks", "worker-1")
        assert len(new) == 1
        assert new[0].body == "Task 3"

    def test_independent_readers(self, board: MessageBoard) -> None:
        board.post("completions", "developer", "Done A")
        board.post("completions", "developer", "Done B")

        # Reader 1 reads both
        r1 = board.read_new("completions", "reader-1")
        assert len(r1) == 2

        # Reader 2 hasn't read yet — sees both
        r2 = board.read_new("completions", "reader-2")
        assert len(r2) == 2

        # Reader 1 is caught up
        assert len(board.read_new("completions", "reader-1")) == 0

    def test_cursors_per_channel(self, board: MessageBoard) -> None:
        board.post("tasks", "beth", "Task")
        board.post("completions", "dev", "Done")

        # Read tasks
        board.read_new("tasks", "worker")
        # Completions should still be unread
        new = board.read_new("completions", "worker")
        assert len(new) == 1

    def test_empty_channel(self, board: MessageBoard) -> None:
        assert board.read_new("learnings", "reader") == []


# ---------------------------------------------------------------------------
# Concurrent writes (thread safety)
# ---------------------------------------------------------------------------


class TestConcurrency:
    def test_concurrent_writes_no_corruption(self, board: MessageBoard) -> None:
        """Two threads writing simultaneously must not corrupt the database."""
        errors: list[Exception] = []
        posts_per_thread = 50

        def writer(agent_id: str) -> None:
            try:
                for i in range(posts_per_thread):
                    board.post("heartbeats", agent_id, f"heartbeat-{i}")
            except Exception as e:
                errors.append(e)

        t1 = threading.Thread(target=writer, args=("worker-1",))
        t2 = threading.Thread(target=writer, args=("worker-2",))
        t1.start()
        t2.start()
        t1.join()
        t2.join()

        assert errors == [], f"Concurrent writes produced errors: {errors}"

        all_posts = board.read_all("heartbeats")
        assert len(all_posts) == posts_per_thread * 2

    def test_concurrent_read_write(self, board: MessageBoard) -> None:
        """One thread writing, another reading — WAL allows this."""
        errors: list[Exception] = []
        read_counts: list[int] = []

        def writer() -> None:
            try:
                for i in range(30):
                    board.post("tasks", "beth", f"task-{i}")
                    time.sleep(0.001)
            except Exception as e:
                errors.append(e)

        def reader() -> None:
            try:
                total = 0
                for _ in range(40):
                    new = board.read_new("tasks", "reader-1")
                    total += len(new)
                    time.sleep(0.001)
                read_counts.append(total)
            except Exception as e:
                errors.append(e)

        tw = threading.Thread(target=writer)
        tr = threading.Thread(target=reader)
        tw.start()
        tr.start()
        tw.join()
        tr.join()

        assert errors == [], f"Concurrent read/write errors: {errors}"
        # Reader might not see all 30 if timing is off, but should see some
        assert read_counts[0] > 0
        # All 30 should be in the DB regardless
        all_posts = board.read_all("tasks")
        assert len(all_posts) == 30

    def test_many_concurrent_writers(self, board: MessageBoard) -> None:
        """5 threads, 20 posts each — 100 total, no corruption."""
        errors: list[Exception] = []
        n_threads = 5
        posts_per = 20

        def writer(agent_id: str) -> None:
            try:
                for i in range(posts_per):
                    board.post("claims", agent_id, f"claim-{i}")
            except Exception as e:
                errors.append(e)

        threads = [
            threading.Thread(target=writer, args=(f"worker-{i}",))
            for i in range(n_threads)
        ]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert errors == []
        all_posts = board.read_all("claims")
        assert len(all_posts) == n_threads * posts_per


# ---------------------------------------------------------------------------
# WAL recovery (disk-based tests)
# ---------------------------------------------------------------------------


class TestWALRecovery:
    def test_data_persists_after_close_reopen(self, tmp_path: Path) -> None:
        """Data written to WAL DB survives close and reopen."""
        db_path = tmp_path / "persist.db"

        b1 = MessageBoard(db_path)
        b1.post("tasks", "beth", "Survive this")
        b1.close()

        b2 = MessageBoard(db_path)
        posts = b2.read_all("tasks")
        assert len(posts) == 1
        assert posts[0].body == "Survive this"
        b2.close()

    def test_wal_recovery_after_dirty_close(self, tmp_path: Path) -> None:
        """Simulate a crash by not calling close() — WAL should auto-recover."""
        db_path = tmp_path / "crash.db"

        # Write without closing cleanly
        b1 = MessageBoard(db_path)
        for i in range(10):
            b1.post("learnings", "developer", f"insight-{i}")
        # Simulate crash: just drop the reference without close()
        del b1

        # Reopen — WAL recovery happens automatically
        b2 = MessageBoard(db_path)
        posts = b2.read_all("learnings")
        assert len(posts) == 10
        b2.close()

    def test_concurrent_writes_on_disk(self, tmp_path: Path) -> None:
        """Concurrent writes on actual file (not :memory:) — WAL must handle."""
        db_path = tmp_path / "concurrent.db"
        board = MessageBoard(db_path)
        errors: list[Exception] = []

        def writer(agent_id: str) -> None:
            try:
                for i in range(25):
                    board.post("heartbeats", agent_id, f"hb-{i}")
            except Exception as e:
                errors.append(e)

        t1 = threading.Thread(target=writer, args=("w1",))
        t2 = threading.Thread(target=writer, args=("w2",))
        t1.start()
        t2.start()
        t1.join()
        t2.join()

        assert errors == []
        assert len(board.read_all("heartbeats")) == 50
        board.close()


# ---------------------------------------------------------------------------
# Busy timeout
# ---------------------------------------------------------------------------


class TestBusyTimeout:
    def test_busy_timeout_is_set(self, tmp_path: Path) -> None:
        """Verify the busy_timeout pragma is configured."""
        db_path = tmp_path / "timeout.db"
        conn = connect_board(db_path)
        result = conn.execute("PRAGMA busy_timeout").fetchone()
        assert result[0] == 5000
        conn.close()

    def test_wal_mode_is_set(self, tmp_path: Path) -> None:
        db_path = tmp_path / "wal.db"
        conn = connect_board(db_path)
        result = conn.execute("PRAGMA journal_mode").fetchone()
        assert result[0] == "wal"
        conn.close()


# ---------------------------------------------------------------------------
# Outcomes table
# ---------------------------------------------------------------------------


class TestOutcomes:
    def test_record_and_query(self, board: MessageBoard) -> None:
        oid = board.record_outcome(
            epic_id="beth-123",
            task_id="beth-123.1",
            agent_role="developer",
            model_used="gpt-4o",
            tokens_in=1000,
            tokens_out=500,
            duration_ms=3200,
            success=True,
            task_type="feature",
            description="Built auth flow",
        )
        assert oid >= 1

        outcomes = board.query_outcomes(agent_role="developer")
        assert len(outcomes) == 1
        o = outcomes[0]
        assert o.epic_id == "beth-123"
        assert o.task_id == "beth-123.1"
        assert o.success is True
        assert o.tokens_in == 1000
        assert o.model_used == "gpt-4o"

    def test_query_filters(self, board: MessageBoard) -> None:
        board.record_outcome(
            epic_id="e1", task_id="t1", agent_role="developer",
            model_used="gpt-4o", tokens_in=100, tokens_out=50,
            duration_ms=1000, success=True, task_type="feature",
        )
        board.record_outcome(
            epic_id="e1", task_id="t2", agent_role="tester",
            model_used="gpt-4o-mini", tokens_in=200, tokens_out=100,
            duration_ms=2000, success=False, task_type="test",
        )
        board.record_outcome(
            epic_id="e1", task_id="t3", agent_role="developer",
            model_used="gpt-4o-mini", tokens_in=150, tokens_out=75,
            duration_ms=1500, success=True, task_type="bugfix",
        )

        # Filter by role
        dev_outcomes = board.query_outcomes(agent_role="developer")
        assert len(dev_outcomes) == 2

        # Filter by success
        failures = board.query_outcomes(success=False)
        assert len(failures) == 1
        assert failures[0].agent_role == "tester"

        # Filter by task_type
        features = board.query_outcomes(task_type="feature")
        assert len(features) == 1

        # Combined filter
        dev_success = board.query_outcomes(agent_role="developer", success=True)
        assert len(dev_success) == 2

    def test_query_empty(self, board: MessageBoard) -> None:
        assert board.query_outcomes() == []

    def test_outcome_without_optional_fields(self, board: MessageBoard) -> None:
        oid = board.record_outcome(
            epic_id="e1", task_id="t1", agent_role="developer",
            model_used="gpt-4o", tokens_in=100, tokens_out=50,
            duration_ms=1000, success=True,
        )
        outcomes = board.query_outcomes()
        assert len(outcomes) == 1
        assert outcomes[0].task_type is None
        assert outcomes[0].description is None
