"""Tests for watcher_main.py — standalone watcher entrypoint.

TDD: These tests are written BEFORE the implementation.
Covers BETH-64.12.1 through BETH-64.12.6.
"""

import asyncio
import json
import os
import signal
import sys
import tempfile
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_config(tmp_path: Path, **overrides) -> Path:
    """Create a .beth/ado-sync.json config file and return its path."""
    beth_dir = tmp_path / ".beth"
    beth_dir.mkdir(exist_ok=True)
    config_path = beth_dir / "ado-sync.json"
    config = {
        "organization": "test-org",
        "project": "test-project",
        "authMethod": "pat",
        "pat": "test-pat-token",
        "tenantId": "",
        "backlogTasksDir": str(tmp_path / "backlog" / "tasks"),
        **overrides,
    }
    config_path.write_text(json.dumps(config))
    return config_path


def _make_dotenv(tmp_path: Path, **overrides) -> Path:
    """Create a .env file in tmp_path and return its path."""
    env_vars = {
        "ADO_ORG": "env-org",
        "ADO_PROJECT": "env-project",
        "ADO_PAT": "env-pat-token",
        **overrides,
    }
    env_path = tmp_path / ".env"
    lines = [f"{k}={v}" for k, v in env_vars.items()]
    env_path.write_text("\n".join(lines) + "\n")
    return env_path


# ---------------------------------------------------------------------------
# BETH-64.12.1: Loads config from --config flag
# ---------------------------------------------------------------------------

class TestConfigFromFlag:
    """watcher_main loads .beth/ado-sync.json when passed via --config."""

    def test_reads_config_flag_value(self, tmp_path):
        """--config flag value is used as config file path."""
        from app.watcher_main import load_config

        config_path = _make_config(tmp_path, organization="flag-org")
        config = load_config(config_path=str(config_path))

        assert config["organization"] == "flag-org"

    def test_parses_json_fields(self, tmp_path):
        """Parses JSON and extracts organization, project, authMethod."""
        from app.watcher_main import load_config

        config_path = _make_config(
            tmp_path,
            organization="my-org",
            project="my-proj",
            authMethod="entra",
        )
        config = load_config(config_path=str(config_path))

        assert config["organization"] == "my-org"
        assert config["project"] == "my-proj"
        assert config["authMethod"] == "entra"

    def test_ado_client_receives_config_values(self, tmp_path):
        """ADOClient is initialized with correct config values from the parsed file."""
        from app.watcher_main import load_config, build_settings

        config_path = _make_config(
            tmp_path,
            organization="client-org",
            project="client-proj",
        )
        config = load_config(config_path=str(config_path))
        settings = build_settings(config)

        assert settings.ado_organization == "client-org"
        assert settings.ado_project == "client-proj"


# ---------------------------------------------------------------------------
# BETH-64.12.2: Loads config from PROJECT_ROOT env var
# ---------------------------------------------------------------------------

class TestConfigFromProjectRoot:
    """watcher_main discovers .beth/ado-sync.json via PROJECT_ROOT."""

    def test_reads_project_root_env(self, tmp_path, monkeypatch):
        """Reads PROJECT_ROOT env var when --config flag absent."""
        from app.watcher_main import load_config

        _make_config(tmp_path, organization="root-org")
        monkeypatch.setenv("PROJECT_ROOT", str(tmp_path))

        config = load_config()
        assert config["organization"] == "root-org"

    def test_constructs_path_from_project_root(self, tmp_path, monkeypatch):
        """Constructs path as PROJECT_ROOT/.beth/ado-sync.json."""
        from app.watcher_main import resolve_config_path

        monkeypatch.setenv("PROJECT_ROOT", str(tmp_path))
        _make_config(tmp_path)

        path = resolve_config_path()
        assert path == str(tmp_path / ".beth" / "ado-sync.json")

    def test_config_values_loaded_correctly(self, tmp_path, monkeypatch):
        """Config values loaded correctly from discovered file."""
        from app.watcher_main import load_config

        _make_config(tmp_path, project="root-project", authMethod="pat")
        monkeypatch.setenv("PROJECT_ROOT", str(tmp_path))

        config = load_config()
        assert config["project"] == "root-project"
        assert config["authMethod"] == "pat"


# ---------------------------------------------------------------------------
# BETH-64.12.3: Falls back to .env file
# ---------------------------------------------------------------------------

class TestDotenvFallback:
    """When no --config and no PROJECT_ROOT, falls back to .env."""

    def test_falls_back_to_dotenv(self, tmp_path, monkeypatch):
        """Falls back to .env when --config and PROJECT_ROOT are both absent."""
        from app.watcher_main import load_config

        monkeypatch.delenv("PROJECT_ROOT", raising=False)
        _make_dotenv(tmp_path, ADO_ORG="dotenv-org", ADO_PROJECT="dotenv-proj")
        monkeypatch.chdir(tmp_path)

        config = load_config()
        assert config["organization"] == "dotenv-org"

    def test_reads_env_vars_from_dotenv(self, tmp_path, monkeypatch):
        """Reads ADO_ORG, ADO_PROJECT, ADO_PAT from .env file."""
        from app.watcher_main import load_config

        monkeypatch.delenv("PROJECT_ROOT", raising=False)
        _make_dotenv(
            tmp_path,
            ADO_ORG="env-org",
            ADO_PROJECT="env-proj",
            ADO_PAT="env-pat",
        )
        monkeypatch.chdir(tmp_path)

        config = load_config()
        assert config["organization"] == "env-org"
        assert config["project"] == "env-proj"
        assert config.get("pat") == "env-pat"

    def test_ado_client_initialized_from_dotenv(self, tmp_path, monkeypatch):
        """ADOClient initialized with .env values."""
        from app.watcher_main import load_config, build_settings

        monkeypatch.delenv("PROJECT_ROOT", raising=False)
        # Use ADO_ORGANIZATION (matching Settings field) and also test
        # that ADO_ORG from .env doesn't leak into pydantic-settings
        _make_dotenv(tmp_path, ADO_ORG="env-org", ADO_PROJECT="env-proj", ADO_PAT="env-pat")
        monkeypatch.chdir(tmp_path)

        config = load_config()
        # Remove ADO_ORG from env if it leaked from dotenv_values side-effects
        monkeypatch.delenv("ADO_ORG", raising=False)
        settings = build_settings(config)

        assert settings.ado_organization == "env-org"
        assert settings.ado_project == "env-proj"
        assert settings.ado_pat == "env-pat"


# ---------------------------------------------------------------------------
# BETH-64.12.4: No HTTP server started
# ---------------------------------------------------------------------------

class TestNoHttpServer:
    """watcher_main does NOT start FastAPI/uvicorn."""

    def test_uvicorn_never_called(self, tmp_path):
        """uvicorn.run (or equivalent) is never called."""
        from app.watcher_main import load_config, run_watcher

        config_path = _make_config(tmp_path)

        with patch("app.watcher_main.watch_backlog_tasks", new_callable=AsyncMock) as mock_watch:
            # Make the watcher return immediately instead of looping forever
            mock_watch.return_value = None

            with patch.dict("sys.modules", {"uvicorn": MagicMock()}) as mocked:
                uvicorn_mock = sys.modules["uvicorn"]

                loop = asyncio.new_event_loop()
                try:
                    loop.run_until_complete(
                        run_watcher(config_path=str(config_path))
                    )
                finally:
                    loop.close()

                uvicorn_mock.run.assert_not_called()

    def test_only_watcher_loop_started(self, tmp_path):
        """Only backlog_watcher loop is started, no HTTP server."""
        from app.watcher_main import run_watcher

        config_path = _make_config(tmp_path)

        with patch("app.watcher_main.watch_backlog_tasks", new_callable=AsyncMock) as mock_watch, \
             patch("app.watcher_main.ADOClient") as mock_ado:
            mock_watch.return_value = None
            mock_ado.return_value = MagicMock(close=AsyncMock())

            loop = asyncio.new_event_loop()
            try:
                loop.run_until_complete(
                    run_watcher(config_path=str(config_path))
                )
            finally:
                loop.close()

            mock_watch.assert_called_once()


# ---------------------------------------------------------------------------
# BETH-64.12.5: Graceful SIGTERM shutdown
# ---------------------------------------------------------------------------

class TestGracefulShutdown:
    """watcher_main handles SIGTERM gracefully."""

    def test_sigterm_handler_registered(self, tmp_path):
        """SIGTERM handler is registered on startup."""
        from app.watcher_main import setup_signal_handlers

        handler_called = False
        original_handler = signal.getsignal(signal.SIGTERM)

        try:
            shutdown_event = asyncio.Event()
            setup_signal_handlers(shutdown_event)

            current_handler = signal.getsignal(signal.SIGTERM)
            assert current_handler != signal.SIG_DFL, "SIGTERM handler should be registered"
            assert current_handler != original_handler, "SIGTERM handler should be changed"
        finally:
            signal.signal(signal.SIGTERM, original_handler)

    def test_watcher_stops_on_shutdown_event(self, tmp_path):
        """Watcher loop stops cleanly when shutdown event is set."""
        from app.watcher_main import run_watcher

        config_path = _make_config(tmp_path)

        call_count = 0

        async def fake_watch(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            # Simulate the watcher running briefly then being cancelled
            await asyncio.sleep(0.1)
            raise asyncio.CancelledError()

        with patch("app.watcher_main.watch_backlog_tasks", side_effect=fake_watch), \
             patch("app.watcher_main.ADOClient") as mock_ado:
            mock_ado.return_value = MagicMock(close=AsyncMock())

            loop = asyncio.new_event_loop()
            try:
                loop.run_until_complete(
                    run_watcher(config_path=str(config_path))
                )
            finally:
                loop.close()

            assert call_count == 1, "Watcher should have been called once"

    def test_shutdown_event_set_by_sigterm(self):
        """SIGTERM sets the shutdown event."""
        from app.watcher_main import setup_signal_handlers

        original_handler = signal.getsignal(signal.SIGTERM)
        try:
            shutdown_event = asyncio.Event()
            setup_signal_handlers(shutdown_event)

            # Manually invoke the SIGTERM handler
            handler = signal.getsignal(signal.SIGTERM)
            handler(signal.SIGTERM, None)

            assert shutdown_event.is_set(), "Shutdown event should be set after SIGTERM"
        finally:
            signal.signal(signal.SIGTERM, original_handler)


# ---------------------------------------------------------------------------
# BETH-64.12.6: Stdout logging output
# ---------------------------------------------------------------------------

class TestLoggingOutput:
    """watcher_main logs to stdout."""

    def test_configures_logging_to_stdout(self, tmp_path):
        """Logging is configured to write to stdout."""
        from app.watcher_main import configure_logging
        import logging

        configure_logging(level="INFO")

        logger = logging.getLogger("app.watcher_main")
        assert logger.level == logging.INFO or logging.getLogger().level == logging.INFO

        # Check that at least one handler writes to stdout/stderr
        root = logging.getLogger()
        stream_handlers = [
            h for h in root.handlers
            if hasattr(h, "stream") and h.stream in (sys.stdout, sys.stderr)
        ]
        assert len(stream_handlers) > 0, "Should have a stdout/stderr stream handler"

    def test_log_level_configurable(self, tmp_path):
        """Log level is configurable via config."""
        from app.watcher_main import configure_logging
        import logging

        configure_logging(level="DEBUG")

        root = logging.getLogger()
        assert root.level == logging.DEBUG
