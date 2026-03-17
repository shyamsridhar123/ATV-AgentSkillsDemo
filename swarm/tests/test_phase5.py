"""Tests for Phase 5 — CLI, structured logging, provider failover, graceful shutdown, crash recovery."""

import asyncio
import json
import logging
import signal
import time
from pathlib import Path
from types import SimpleNamespace
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from swarm.board import MessageBoard
from swarm.cli import build_parser, cmd_board, cmd_outcomes, cmd_status, main
from swarm.config import ProviderConfig, SwarmConfig
from swarm.llm import completions_with_failover
from swarm.logging_config import JsonFormatter, configure_logging
from swarm.orchestrator import (
    EpicState,
    Orchestrator,
    TaskNode,
    TaskStatus,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_config(**overrides: Any) -> SwarmConfig:
    """Build a SwarmConfig with test defaults."""
    defaults = {
        "db_path": ":memory:",
        "poll_interval_seconds": 0.01,
        "primary_provider": ProviderConfig(name="azure", endpoint="https://test.azure.com", api_key="test-key"),
    }
    defaults.update(overrides)
    return SwarmConfig(**defaults)


def _make_response(content: str = "done", tokens_in: int = 100, tokens_out: int = 50) -> SimpleNamespace:
    """Build a mock ChatCompletion response."""
    return SimpleNamespace(
        choices=[SimpleNamespace(
            finish_reason="stop",
            message=SimpleNamespace(content=content, tool_calls=None),
        )],
        usage=SimpleNamespace(prompt_tokens=tokens_in, completion_tokens=tokens_out),
    )


# ===========================================================================
# Structured JSON Logging
# ===========================================================================

class TestJsonFormatter:
    def test_basic_format_is_valid_json(self):
        fmt = JsonFormatter()
        record = logging.LogRecord(
            name="test", level=logging.INFO, pathname="", lineno=0,
            msg="hello world", args=(), exc_info=None,
        )
        line = fmt.format(record)
        data = json.loads(line)
        assert data["level"] == "INFO"
        assert data["msg"] == "hello world"
        assert "ts" in data

    def test_extra_fields_included(self):
        fmt = JsonFormatter()
        record = logging.LogRecord(
            name="swarm.worker", level=logging.INFO, pathname="", lineno=0,
            msg="task started", args=(), exc_info=None,
        )
        record.agent_id = "dev-1"
        record.task_id = "BETH-42.1"
        record.epic_id = "BETH-42"
        line = fmt.format(record)
        data = json.loads(line)
        assert data["agent_id"] == "dev-1"
        assert data["task_id"] == "BETH-42.1"
        assert data["epic_id"] == "BETH-42"

    def test_exception_included(self):
        fmt = JsonFormatter()
        try:
            raise ValueError("boom")
        except ValueError:
            import sys
            record = logging.LogRecord(
                name="test", level=logging.ERROR, pathname="", lineno=0,
                msg="crash", args=(), exc_info=sys.exc_info(),
            )
        line = fmt.format(record)
        data = json.loads(line)
        assert "exception" in data
        assert "ValueError" in data["exception"]

    def test_missing_extra_fields_omitted(self):
        fmt = JsonFormatter()
        record = logging.LogRecord(
            name="test", level=logging.DEBUG, pathname="", lineno=0,
            msg="no extras", args=(), exc_info=None,
        )
        line = fmt.format(record)
        data = json.loads(line)
        assert "agent_id" not in data
        assert "task_id" not in data


class TestConfigureLogging:
    def test_json_mode(self):
        configure_logging(level="DEBUG", json_output=True)
        root = logging.getLogger()
        assert any(isinstance(h.formatter, JsonFormatter) for h in root.handlers)

    def test_human_mode(self):
        configure_logging(level="INFO", json_output=False)
        root = logging.getLogger()
        assert not any(isinstance(h.formatter, JsonFormatter) for h in root.handlers)

    def test_no_duplicate_handlers(self):
        configure_logging(level="INFO", json_output=True)
        configure_logging(level="DEBUG", json_output=True)
        root = logging.getLogger()
        # Should only have our one handler
        swarm_handlers = [h for h in root.handlers if isinstance(h.formatter, JsonFormatter)]
        assert len(swarm_handlers) == 1


# ===========================================================================
# Provider Failover
# ===========================================================================

class TestCompletionsWithFailover:
    def test_success_on_first_try(self):
        config = _make_config()
        expected = _make_response("hello")

        with patch("swarm.llm.create_client") as mock_create:
            mock_client = MagicMock()
            mock_client.chat.completions.create.return_value = expected
            mock_create.return_value = mock_client

            result = completions_with_failover(
                config=config,
                deployment="gpt-4o",
                messages=[{"role": "user", "content": "hi"}],
            )
            assert result.choices[0].message.content == "hello"

    def test_retry_on_429(self):
        from openai import APIStatusError

        config = _make_config()
        expected = _make_response("recovered")

        mock_response = MagicMock()
        mock_response.status_code = 429
        mock_response.headers = {}
        error = APIStatusError("rate limited", response=mock_response, body=None)

        with patch("swarm.llm.create_client") as mock_create:
            mock_client = MagicMock()
            mock_client.chat.completions.create.side_effect = [error, expected]
            mock_create.return_value = mock_client

            with patch("swarm.llm.time.sleep"):  # Skip actual backoff
                result = completions_with_failover(
                    config=config,
                    deployment="gpt-4o",
                    messages=[{"role": "user", "content": "hi"}],
                    retries=1,
                    backoff_base=0.01,
                )
                assert result.choices[0].message.content == "recovered"

    def test_fallback_provider_on_exhausted_retries(self):
        from openai import APIStatusError

        fallback_provider = ProviderConfig(name="openai", endpoint="https://api.openai.com", api_key="fb-key")
        config = _make_config(fallback_provider=fallback_provider)

        mock_response = MagicMock()
        mock_response.status_code = 503
        mock_response.headers = {}
        error = APIStatusError("service unavailable", response=mock_response, body=None)

        expected = _make_response("from fallback")

        with patch("swarm.llm.create_client") as mock_create:
            primary_client = MagicMock()
            primary_client.chat.completions.create.side_effect = error

            fallback_client = MagicMock()
            fallback_client.chat.completions.create.return_value = expected

            mock_create.side_effect = [primary_client, fallback_client]

            with patch("swarm.llm.time.sleep"):
                result = completions_with_failover(
                    config=config,
                    deployment="gpt-4o",
                    messages=[{"role": "user", "content": "hi"}],
                    retries=0,
                )
                assert result.choices[0].message.content == "from fallback"

    def test_non_retriable_error_raises_immediately(self):
        from openai import APIStatusError

        config = _make_config()

        mock_response = MagicMock()
        mock_response.status_code = 401
        mock_response.headers = {}
        error = APIStatusError("unauthorized", response=mock_response, body=None)

        with patch("swarm.llm.create_client") as mock_create:
            mock_client = MagicMock()
            mock_client.chat.completions.create.side_effect = error
            mock_create.return_value = mock_client

            with pytest.raises(APIStatusError):
                completions_with_failover(
                    config=config,
                    deployment="gpt-4o",
                    messages=[{"role": "user", "content": "hi"}],
                )

    def test_all_providers_exhausted_raises(self):
        from openai import APIStatusError

        config = _make_config()

        mock_response = MagicMock()
        mock_response.status_code = 500
        mock_response.headers = {}
        error = APIStatusError("server error", response=mock_response, body=None)

        with patch("swarm.llm.create_client") as mock_create:
            mock_client = MagicMock()
            mock_client.chat.completions.create.side_effect = error
            mock_create.return_value = mock_client

            with patch("swarm.llm.time.sleep"):
                with pytest.raises(APIStatusError):
                    completions_with_failover(
                        config=config,
                        deployment="gpt-4o",
                        messages=[{"role": "user", "content": "hi"}],
                        retries=1,
                    )


# ===========================================================================
# Graceful Shutdown
# ===========================================================================

class TestGracefulShutdown:
    @pytest.fixture
    def board(self):
        b = MessageBoard(":memory:")
        yield b
        b.close()

    def test_stop_sets_running_false(self, board, tmp_path):
        config = _make_config()
        orch = Orchestrator(config=config, board=board, repo_root=tmp_path)
        orch._running = True
        orch.stop()
        assert orch._running is False

    def test_handle_signal_stops_orchestrator(self, board, tmp_path):
        config = _make_config()
        orch = Orchestrator(config=config, board=board, repo_root=tmp_path)
        orch._running = True
        orch._handle_signal(signal.SIGINT)
        assert orch._running is False

    def test_draining_detects_running_tasks(self, board, tmp_path):
        config = _make_config()
        orch = Orchestrator(config=config, board=board, repo_root=tmp_path)

        # No epics = not draining
        assert orch._draining() is False

        # Add epic with running task
        task = TaskNode(id="t1", title="Test", body="", agent_role="developer")
        task.status = TaskStatus.RUNNING
        epic = EpicState(
            epic_id="e1", title="Test", original_request="test",
            tasks={"t1": task}, epic_branch="main",
        )
        orch.epics["e1"] = epic
        assert orch._draining() is True

        # Mark done — no longer draining
        task.status = TaskStatus.COMPLETED
        assert orch._draining() is False

    @pytest.mark.asyncio
    async def test_run_stops_after_max_ticks(self, board, tmp_path):
        config = _make_config()
        orch = Orchestrator(config=config, board=board, repo_root=tmp_path)
        await orch.run(max_ticks=3)
        # max_ticks breaks the loop without setting _running=False (by design)
        # Verify it ran and exited cleanly
        assert orch._running is True  # Was never signaled to stop


# ===========================================================================
# Status Summary
# ===========================================================================

class TestStatusSummary:
    @pytest.fixture
    def board(self):
        b = MessageBoard(":memory:")
        yield b
        b.close()

    def test_empty_status(self, board, tmp_path):
        config = _make_config()
        orch = Orchestrator(config=config, board=board, repo_root=tmp_path)
        status = orch.status_summary()
        assert status["epics"] == 0
        assert status["running_workers"] == []
        assert status["queued_tasks"] == []

    def test_status_with_tasks(self, board, tmp_path):
        config = _make_config()
        orch = Orchestrator(config=config, board=board, repo_root=tmp_path)

        running_task = TaskNode(id="t1", title="Build UI", body="", agent_role="developer")
        running_task.status = TaskStatus.RUNNING
        pending_task = TaskNode(id="t2", title="Write tests", body="", agent_role="tester")
        pending_task.status = TaskStatus.PENDING
        merged_task = TaskNode(id="t3", title="Auth flow", body="", agent_role="developer")
        merged_task.status = TaskStatus.MERGED

        epic = EpicState(
            epic_id="e1", title="Feature X", original_request="test",
            tasks={"t1": running_task, "t2": pending_task, "t3": merged_task},
            epic_branch="main",
        )
        orch.epics["e1"] = epic

        status = orch.status_summary()
        assert len(status["running_workers"]) == 1
        assert status["running_workers"][0]["task"] == "t1"
        assert len(status["queued_tasks"]) == 1
        assert len(status["recent_completions"]) == 1


# ===========================================================================
# Crash Recovery
# ===========================================================================

class TestCrashRecovery:
    def test_recover_empty_board(self, tmp_path):
        config = _make_config()
        board = MessageBoard(":memory:")
        orch = Orchestrator.recover_from_board(config=config, board=board, repo_root=tmp_path)
        assert len(orch.epics) == 0
        board.close()

    def test_recover_with_epic_and_tasks(self, tmp_path):
        config = _make_config()
        board = MessageBoard(":memory:")

        # Simulate: an epic was submitted
        board.post(
            channel="tasks",
            agent_id="beth",
            title="Epic: Feature X",
            body="Build feature X",
            metadata={
                "epic_id": "e1",
                "task_count": 2,
                "task_ids": ["t1", "t2"],
            },
        )

        # Simulate: task dispatch posts
        board.post(
            channel="tasks",
            agent_id="beth",
            title="t1",
            body="Build the UI",
            metadata={
                "epic_id": "e1",
                "task_id": "t1",
                "agent_role": "developer",
                "deps": [],
            },
        )
        board.post(
            channel="tasks",
            agent_id="beth",
            title="t2",
            body="Write tests",
            metadata={
                "epic_id": "e1",
                "task_id": "t2",
                "agent_role": "tester",
                "deps": ["t1"],
            },
        )

        # Simulate: t1 completed before crash
        board.post(
            channel="completions",
            agent_id="dev-1",
            title="t1 done",
            body="UI built",
            metadata={
                "epic_id": "e1",
                "task_id": "t1",
            },
        )

        # Recover
        with patch("swarm.orchestrator.cleanup_all_worktrees"):
            orch = Orchestrator.recover_from_board(config=config, board=board, repo_root=tmp_path)

        assert "e1" in orch.epics
        epic = orch.epics["e1"]
        assert len(epic.tasks) == 2
        assert epic.tasks["t1"].status == TaskStatus.COMPLETED
        # t2 was RUNNING/PENDING at crash — should be reset to PENDING
        assert epic.tasks["t2"].status == TaskStatus.PENDING

        board.close()

    def test_recover_cleans_worktrees(self, tmp_path):
        config = _make_config()
        board = MessageBoard(":memory:")

        board.post(
            channel="tasks",
            agent_id="beth",
            title="Epic: Y",
            body="feature",
            metadata={"epic_id": "e2", "task_count": 1, "task_ids": ["t1"]},
        )

        with patch("swarm.orchestrator.cleanup_all_worktrees") as mock_cleanup:
            Orchestrator.recover_from_board(config=config, board=board, repo_root=tmp_path)
            mock_cleanup.assert_called_once_with(tmp_path)

        board.close()


# ===========================================================================
# CLI Parser
# ===========================================================================

class TestCLIParser:
    def test_run_command_parsed(self):
        parser = build_parser()
        args = parser.parse_args(["run", "--config", "swarm.yaml"])
        assert args.command == "run"
        assert args.config == "swarm.yaml"

    def test_start_command_parsed(self):
        parser = build_parser()
        args = parser.parse_args(["start", "--config", "swarm.yaml"])
        assert args.command == "start"
        assert args.session == "beth-swarm"

    def test_stop_command_parsed(self):
        parser = build_parser()
        args = parser.parse_args(["stop"])
        assert args.command == "stop"

    def test_status_command_parsed(self):
        parser = build_parser()
        args = parser.parse_args(["status"])
        assert args.command == "status"

    def test_resume_command_parsed(self):
        parser = build_parser()
        args = parser.parse_args(["resume", "--config", "swarm.yaml"])
        assert args.command == "resume"

    def test_attach_command_parsed(self):
        parser = build_parser()
        args = parser.parse_args(["attach"])
        assert args.command == "attach"

    def test_board_command_parsed(self):
        parser = build_parser()
        args = parser.parse_args(["board", "--config", "swarm.yaml", "tasks"])
        assert args.command == "board"
        assert args.channel == "tasks"

    def test_outcomes_command_parsed(self):
        parser = build_parser()
        args = parser.parse_args(["outcomes", "--config", "swarm.yaml", "--epic", "e1"])
        assert args.command == "outcomes"
        assert args.epic == "e1"

    def test_log_level_flag(self):
        parser = build_parser()
        args = parser.parse_args(["--log-level", "DEBUG", "stop"])
        assert args.log_level == "DEBUG"

    def test_human_flag(self):
        parser = build_parser()
        args = parser.parse_args(["--human", "stop"])
        assert args.human is True

    def test_no_command_raises(self):
        parser = build_parser()
        with pytest.raises(SystemExit):
            parser.parse_args([])


class TestCLIMain:
    def test_main_stop(self):
        with patch("swarm.cli.stop_daemon", return_value=True) as mock_stop:
            with patch("swarm.cli.configure_logging"):
                rc = main(["stop"])
                assert rc == 0
                mock_stop.assert_called_once()

    def test_main_status(self):
        with patch("swarm.cli.daemon_status", return_value={"running": False}) as mock_status:
            with patch("swarm.cli.configure_logging"):
                rc = main(["status"])
                assert rc == 0

    def test_main_board_list_channels(self, tmp_path):
        # Create a real board to query
        db_path = str(tmp_path / "test.db")
        board = MessageBoard(db_path)
        board.post(channel="tasks", agent_id="test", body="hello")
        board.close()

        yaml_path = tmp_path / "swarm.yaml"
        yaml_path.write_text(f"db_path: {db_path}\n")

        with patch("swarm.cli.configure_logging"):
            rc = main(["board", "--config", str(yaml_path)])
            assert rc == 0

    def test_main_outcomes_empty(self, tmp_path):
        db_path = str(tmp_path / "test.db")
        board = MessageBoard(db_path)
        board.close()

        yaml_path = tmp_path / "swarm.yaml"
        yaml_path.write_text(f"db_path: {db_path}\n")

        with patch("swarm.cli.configure_logging"):
            rc = main(["outcomes", "--config", str(yaml_path)])
            assert rc == 0


# ===========================================================================
# Integration: Phase 5 end-to-end
# ===========================================================================

class TestPhase5Integration:
    """Integration tests proving Phase 5 features work together."""

    @pytest.mark.asyncio
    async def test_run_with_signal_shutdown(self, tmp_path):
        """Orchestrator handles graceful shutdown from SIGINT."""
        config = _make_config(poll_interval_seconds=0.01)
        board = MessageBoard(":memory:")
        orch = Orchestrator(config=config, board=board, repo_root=tmp_path)

        # Schedule a stop after a few ticks
        async def delayed_stop():
            await asyncio.sleep(0.05)
            orch.stop()

        asyncio.create_task(delayed_stop())
        await orch.run()

        assert orch._running is False
        board.close()

    def test_crash_recovery_then_status(self, tmp_path):
        """Recover from crash, then verify status_summary works."""
        config = _make_config()
        board = MessageBoard(":memory:")

        # Submit an epic
        board.post(
            channel="tasks", agent_id="beth",
            title="Epic: Recovery Test", body="test",
            metadata={"epic_id": "e1", "task_count": 1, "task_ids": ["t1"]},
        )
        board.post(
            channel="tasks", agent_id="beth",
            title="t1", body="task",
            metadata={"epic_id": "e1", "task_id": "t1", "agent_role": "developer", "deps": []},
        )

        with patch("swarm.orchestrator.cleanup_all_worktrees"):
            orch = Orchestrator.recover_from_board(config=config, board=board, repo_root=tmp_path)

        status = orch.status_summary()
        assert status["epics"] == 1
        assert len(status["queued_tasks"]) == 1  # t1 reset to PENDING
        board.close()

    def test_failover_transparent_to_agent_loop(self):
        """agent_loop with config uses failover path transparently."""
        config = _make_config()
        board = MessageBoard(":memory:")

        expected = _make_response("failover worked")

        with patch("swarm.llm.completions_with_failover", return_value=expected) as mock_fo:
            from swarm.llm import agent_loop, create_client

            mock_client = MagicMock()
            result = agent_loop(
                client=mock_client,
                deployment="gpt-4o",
                system_prompt="You are a test.",
                user_message="Hello",
                tools=None,
                work_dir=Path("/tmp"),
                board=board,
                agent_id="test",
                repo_root=Path("/tmp"),
                config=config,
            )
            mock_fo.assert_called_once()
            assert result.content == "failover worked"

        board.close()
