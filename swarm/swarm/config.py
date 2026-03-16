"""SwarmConfig — configuration loader with env var interpolation.

Loads from swarm.yaml (or a dict) and resolves ${ENV_VAR} references
from the environment. Provides typed access to all swarm settings.
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

_ENV_VAR_PATTERN = re.compile(r"\$\{([A-Za-z_][A-Za-z0-9_]*)\}")

# ---------------------------------------------------------------------------
# Channel definitions — single source of truth
# ---------------------------------------------------------------------------

CHANNELS: list[dict[str, str]] = [
    {"name": "tasks", "description": "Work assignments from Beth to workers"},
    {"name": "completions", "description": "Workers report finished work"},
    {"name": "claims", "description": "Workers announce which files/dirs they're touching"},
    {"name": "conflicts", "description": "Merge conflict reports and resolution requests"},
    {"name": "learnings", "description": "Reusable insights discovered during work"},
    {"name": "blockers", "description": "Workers report they're stuck"},
    {"name": "heartbeats", "description": "Worker liveness signals"},
]

CHANNEL_NAMES: list[str] = [ch["name"] for ch in CHANNELS]


# ---------------------------------------------------------------------------
# Env var interpolation
# ---------------------------------------------------------------------------


def resolve_env_vars(value: str) -> str:
    """Replace ${VAR} references with values from os.environ.

    Raises ``KeyError`` if a referenced variable is not set.
    """

    def _replace(match: re.Match[str]) -> str:
        var_name = match.group(1)
        try:
            return os.environ[var_name]
        except KeyError:
            raise KeyError(
                f"Environment variable '{var_name}' referenced in config but not set"
            ) from None

    return _ENV_VAR_PATTERN.sub(_replace, value)


def _walk_resolve(obj: Any) -> Any:
    """Recursively resolve env vars in strings throughout a nested structure."""
    if isinstance(obj, str):
        return resolve_env_vars(obj)
    if isinstance(obj, dict):
        return {k: _walk_resolve(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_walk_resolve(item) for item in obj]
    return obj


# ---------------------------------------------------------------------------
# Model tier config
# ---------------------------------------------------------------------------


@dataclass
class ModelTier:
    """A single model deployment configuration."""

    deployment: str
    max_tokens: int = 4096


@dataclass
class ModelRouting:
    """3-tier model routing per the architecture spec."""

    complex: ModelTier = field(default_factory=lambda: ModelTier(deployment="gpt-4o"))
    standard: ModelTier = field(default_factory=lambda: ModelTier(deployment="gpt-4o-mini"))
    simple: ModelTier = field(default_factory=lambda: ModelTier(deployment="gpt-4o-mini"))

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ModelRouting:
        tiers = {}
        for tier_name in ("complex", "standard", "simple"):
            if tier_name in data:
                tiers[tier_name] = ModelTier(**data[tier_name])
        return cls(**tiers)


# ---------------------------------------------------------------------------
# Provider config
# ---------------------------------------------------------------------------


@dataclass
class ProviderConfig:
    """LLM provider connection details."""

    name: str = "azure"
    endpoint: str = ""
    api_key: str = ""
    api_version: str = "2024-12-01-preview"

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ProviderConfig:
        return cls(**{k: v for k, v in data.items() if k in cls.__dataclass_fields__})


# ---------------------------------------------------------------------------
# Main config
# ---------------------------------------------------------------------------


@dataclass
class SwarmConfig:
    """Top-level swarm configuration.

    Load from a YAML file via ``SwarmConfig.from_yaml(path)`` or from a dict
    via ``SwarmConfig.from_dict(data)``.  All string values undergo
    ``${ENV_VAR}`` interpolation at load time.
    """

    # Database
    db_path: str = "swarm.db"

    # Polling
    poll_interval_seconds: float = 2.0

    # Heartbeat
    heartbeat_interval_seconds: float = 30.0
    heartbeat_timeout_multiplier: float = 2.0

    # Budget defaults
    max_task_tokens_in: int = 50_000
    max_task_tokens_out: int = 10_000
    max_epic_spend_usd: float = 5.0
    max_daily_spend_usd: float = 50.0

    # Test command (run after merges)
    test_command: str = "npm test"

    # Providers
    primary_provider: ProviderConfig = field(default_factory=ProviderConfig)
    fallback_provider: ProviderConfig | None = None

    # Model routing
    model_routing: ModelRouting = field(default_factory=ModelRouting)

    # --------------- Loaders ---------------

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> SwarmConfig:
        """Build config from an already-parsed dict, resolving env vars."""
        resolved = _walk_resolve(data)

        kwargs: dict[str, Any] = {}
        simple_fields = {
            "db_path", "poll_interval_seconds", "heartbeat_interval_seconds",
            "heartbeat_timeout_multiplier", "max_task_tokens_in",
            "max_task_tokens_out", "max_epic_spend_usd", "max_daily_spend_usd",
            "test_command",
        }
        for key in simple_fields:
            if key in resolved:
                kwargs[key] = resolved[key]

        if "primary_provider" in resolved:
            kwargs["primary_provider"] = ProviderConfig.from_dict(resolved["primary_provider"])
        if "fallback_provider" in resolved:
            kwargs["fallback_provider"] = ProviderConfig.from_dict(resolved["fallback_provider"])
        if "model_routing" in resolved:
            kwargs["model_routing"] = ModelRouting.from_dict(resolved["model_routing"])

        return cls(**kwargs)

    @classmethod
    def from_yaml(cls, path: str | Path) -> SwarmConfig:
        """Load config from a YAML file with env var interpolation."""
        path = Path(path)
        with path.open() as f:
            raw = yaml.safe_load(f) or {}
        return cls.from_dict(raw)
