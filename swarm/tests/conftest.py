"""Shared test fixtures — including live Azure OpenAI configuration.

Live tests require:
  - BETH_LIVE_TESTS=1 environment variable
  - AZURE_TENANT_ID set if cross-tenant auth is needed
  - Valid swarm.yaml with a working Azure OpenAI endpoint
  - 'Cognitive Services OpenAI User' RBAC role on the AOAI resource
  - Active az login session (DefaultAzureCredential)
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from swarm.board import MessageBoard
from swarm.config import SwarmConfig


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SWARM_YAML = Path(__file__).resolve().parents[1] / "swarm.yaml"
REPO_ROOT = Path(__file__).resolve().parents[2]


# ---------------------------------------------------------------------------
# Live test gating
# ---------------------------------------------------------------------------

def _live_tests_enabled() -> bool:
    return os.environ.get("BETH_LIVE_TESTS", "").strip().lower() in ("1", "true", "yes")


def _can_load_config() -> bool:
    try:
        return SWARM_YAML.exists()
    except Exception:
        return False


requires_live = pytest.mark.skipif(
    not _live_tests_enabled(),
    reason="Live tests disabled — set BETH_LIVE_TESTS=1 to enable",
)

requires_config = pytest.mark.skipif(
    not _can_load_config(),
    reason="swarm.yaml not found — copy swarm.yaml.example and configure",
)


# ---------------------------------------------------------------------------
# Live fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def live_config() -> SwarmConfig:
    """Load real SwarmConfig from swarm.yaml for live tests."""
    return SwarmConfig.from_yaml(SWARM_YAML)


@pytest.fixture
def live_board():
    """In-memory board for live tests (no persistence needed)."""
    b = MessageBoard(":memory:")
    yield b
    b.close()
