"""Tests for swarm.config — SwarmConfig loading and env var interpolation."""

from __future__ import annotations

import os
import textwrap
from pathlib import Path

import pytest

from swarm.config import (
    CHANNEL_NAMES,
    ModelRouting,
    ModelTier,
    ProviderConfig,
    SwarmConfig,
    resolve_env_vars,
)


# ---------------------------------------------------------------------------
# resolve_env_vars
# ---------------------------------------------------------------------------


class TestResolveEnvVars:
    def test_resolves_single_var(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("MY_VAR", "hello")
        assert resolve_env_vars("${MY_VAR}") == "hello"

    def test_resolves_multiple_vars(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("HOST", "localhost")
        monkeypatch.setenv("PORT", "8080")
        assert resolve_env_vars("${HOST}:${PORT}") == "localhost:8080"

    def test_preserves_non_var_text(self) -> None:
        assert resolve_env_vars("just plain text") == "just plain text"

    def test_raises_on_missing_var(self) -> None:
        # Ensure the var isn't set
        os.environ.pop("_BETH_TEST_MISSING_", None)
        with pytest.raises(KeyError, match="_BETH_TEST_MISSING_"):
            resolve_env_vars("${_BETH_TEST_MISSING_}")

    def test_empty_string(self) -> None:
        assert resolve_env_vars("") == ""

    def test_var_with_underscores_and_numbers(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("MY_VAR_123", "works")
        assert resolve_env_vars("${MY_VAR_123}") == "works"


# ---------------------------------------------------------------------------
# CHANNEL_NAMES
# ---------------------------------------------------------------------------


class TestChannelNames:
    def test_has_seven_channels(self) -> None:
        assert len(CHANNEL_NAMES) == 7

    def test_expected_channels(self) -> None:
        expected = {
            "tasks", "completions", "claims", "conflicts",
            "learnings", "blockers", "heartbeats",
        }
        assert set(CHANNEL_NAMES) == expected


# ---------------------------------------------------------------------------
# SwarmConfig.from_dict
# ---------------------------------------------------------------------------


class TestSwarmConfigFromDict:
    def test_defaults(self) -> None:
        cfg = SwarmConfig.from_dict({})
        assert cfg.db_path == "swarm.db"
        assert cfg.poll_interval_seconds == 2.0
        assert cfg.max_daily_spend_usd == 50.0
        assert cfg.primary_provider.name == "azure"
        assert cfg.fallback_provider is None

    def test_overrides(self) -> None:
        cfg = SwarmConfig.from_dict({
            "db_path": "/tmp/test.db",
            "poll_interval_seconds": 5.0,
            "test_command": "pytest",
        })
        assert cfg.db_path == "/tmp/test.db"
        assert cfg.poll_interval_seconds == 5.0
        assert cfg.test_command == "pytest"

    def test_provider_config(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("AZURE_KEY", "secret123")
        cfg = SwarmConfig.from_dict({
            "primary_provider": {
                "name": "azure",
                "endpoint": "https://my-oai.openai.azure.com",
                "api_key": "${AZURE_KEY}",
            }
        })
        assert cfg.primary_provider.api_key == "secret123"
        assert cfg.primary_provider.endpoint == "https://my-oai.openai.azure.com"

    def test_model_routing(self) -> None:
        cfg = SwarmConfig.from_dict({
            "model_routing": {
                "complex": {"deployment": "gpt-4o", "max_tokens": 8192},
                "simple": {"deployment": "gpt-4o-mini", "max_tokens": 2048},
            }
        })
        assert cfg.model_routing.complex.deployment == "gpt-4o"
        assert cfg.model_routing.complex.max_tokens == 8192
        assert cfg.model_routing.simple.deployment == "gpt-4o-mini"
        # standard wasn't overridden — keeps default
        assert cfg.model_routing.standard.deployment == "gpt-4o-mini"

    def test_env_var_interpolation_in_nested(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("ENDPOINT", "https://example.com")
        monkeypatch.setenv("KEY", "abc")
        cfg = SwarmConfig.from_dict({
            "primary_provider": {
                "name": "azure",
                "endpoint": "${ENDPOINT}",
                "api_key": "${KEY}",
            }
        })
        assert cfg.primary_provider.endpoint == "https://example.com"
        assert cfg.primary_provider.api_key == "abc"


# ---------------------------------------------------------------------------
# SwarmConfig.from_yaml
# ---------------------------------------------------------------------------


class TestSwarmConfigFromYaml:
    def test_loads_yaml_file(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("OAI_EP", "https://oai.test")
        monkeypatch.setenv("OAI_KEY", "test-key")
        yaml_content = textwrap.dedent("""\
            db_path: test.db
            poll_interval_seconds: 1.0

            primary_provider:
              name: azure
              endpoint: "${OAI_EP}"
              api_key: "${OAI_KEY}"

            model_routing:
              complex:
                deployment: gpt-4o
                max_tokens: 8192
        """)
        yaml_file = tmp_path / "swarm.yaml"
        yaml_file.write_text(yaml_content)

        cfg = SwarmConfig.from_yaml(yaml_file)
        assert cfg.db_path == "test.db"
        assert cfg.poll_interval_seconds == 1.0
        assert cfg.primary_provider.endpoint == "https://oai.test"
        assert cfg.primary_provider.api_key == "test-key"
        assert cfg.model_routing.complex.deployment == "gpt-4o"

    def test_empty_yaml(self, tmp_path: Path) -> None:
        yaml_file = tmp_path / "empty.yaml"
        yaml_file.write_text("")
        cfg = SwarmConfig.from_yaml(yaml_file)
        assert cfg.db_path == "swarm.db"  # defaults


class TestProviderConfigValidation:
    def test_valid_auth_modes(self) -> None:
        for mode in ("key", "identity"):
            cfg = ProviderConfig.from_dict({"auth_mode": mode})
            assert cfg.auth_mode == mode

    def test_invalid_auth_mode_raises(self) -> None:
        with pytest.raises(ValueError, match="Invalid auth_mode"):
            ProviderConfig.from_dict({"auth_mode": "identitiy"})

    def test_default_auth_mode_is_key(self) -> None:
        cfg = ProviderConfig.from_dict({})
        assert cfg.auth_mode == "key"
