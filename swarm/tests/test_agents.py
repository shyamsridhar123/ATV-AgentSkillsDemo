"""Tests for agents.py — .agent.md parser."""

from pathlib import Path

import pytest

from swarm.agents import AgentDefinition, build_system_prompt, load_agent, parse_agent_file

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

SAMPLE_AGENT_MD = """\
---
name: developer
description: Expert developer for cutting-edge applications.
model: Claude Opus 4.6
tools:
  - codebase
  - readFile
  - editFiles
handoffs:
  - label: Escalate to Beth
    agent: Beth
    prompt: "Report findings."
    send: true
---

# IDEO Developer Agent

You are an expert developer.

## Work Tracking

Follow the workflow in AGENTS.md.
"""

MINIMAL_AGENT_MD = """\
---
name: minimal
description: A minimal agent.
---

Just the body.
"""

NO_FRONTMATTER = """\
# No YAML Frontmatter

This file has no --- delimiters.
"""


# ---------------------------------------------------------------------------
# parse_agent_file tests
# ---------------------------------------------------------------------------


class TestParseAgentFile:
    def test_full_frontmatter(self):
        agent = parse_agent_file(SAMPLE_AGENT_MD)
        assert agent.name == "developer"
        assert agent.description == "Expert developer for cutting-edge applications."
        assert agent.model == "Claude Opus 4.6"
        assert "codebase" in agent.tools
        assert "readFile" in agent.tools
        assert "editFiles" in agent.tools
        assert len(agent.handoffs) == 1
        assert agent.handoffs[0]["agent"] == "Beth"

    def test_body_extraction(self):
        agent = parse_agent_file(SAMPLE_AGENT_MD)
        assert "# IDEO Developer Agent" in agent.body
        assert "You are an expert developer." in agent.body
        assert "Follow the workflow in AGENTS.md." in agent.body

    def test_body_excludes_frontmatter(self):
        agent = parse_agent_file(SAMPLE_AGENT_MD)
        assert "name: developer" not in agent.body
        assert "model: Claude Opus" not in agent.body

    def test_minimal_agent(self):
        agent = parse_agent_file(MINIMAL_AGENT_MD)
        assert agent.name == "minimal"
        assert agent.description == "A minimal agent."
        assert agent.tools == []
        assert agent.handoffs == []
        assert "Just the body." in agent.body

    def test_no_frontmatter(self):
        agent = parse_agent_file(NO_FRONTMATTER)
        assert agent.name == "unknown"
        assert "# No YAML Frontmatter" in agent.body

    def test_empty_string(self):
        agent = parse_agent_file("")
        assert agent.name == "unknown"


# ---------------------------------------------------------------------------
# load_agent tests (against real .github/agents/ files)
# ---------------------------------------------------------------------------

REPO_ROOT = Path(__file__).resolve().parents[2]
AGENTS_DIR = REPO_ROOT / ".github" / "agents"


class TestLoadAgent:
    @pytest.mark.skipif(
        not (AGENTS_DIR / "developer.agent.md").exists(),
        reason="Real agent files not available",
    )
    def test_load_developer(self):
        agent = load_agent("developer", AGENTS_DIR)
        assert agent.name == "developer"
        assert len(agent.body) > 100  # Substantial system prompt
        assert "developer" in agent.description.lower() or "react" in agent.description.lower()
        assert len(agent.tools) > 0

    @pytest.mark.skipif(
        not (AGENTS_DIR / "tester.agent.md").exists(),
        reason="Real agent files not available",
    )
    def test_load_tester(self):
        agent = load_agent("tester", AGENTS_DIR)
        assert agent.name == "tester"
        assert len(agent.body) > 50

    def test_load_nonexistent(self, tmp_path):
        with pytest.raises(FileNotFoundError):
            load_agent("nonexistent", tmp_path)


# ---------------------------------------------------------------------------
# build_system_prompt tests
# ---------------------------------------------------------------------------


class TestBuildSystemPrompt:
    def test_body_only(self):
        agent = AgentDefinition(name="test", description="", body="You are a test agent.")
        prompt = build_system_prompt(agent)
        assert prompt == "You are a test agent."

    def test_with_extra_context(self):
        agent = AgentDefinition(name="test", description="", body="You are a test agent.")
        prompt = build_system_prompt(agent, extra_context="## Skill: React Best Practices\nUse hooks.")
        assert prompt.startswith("## Skill: React Best Practices")
        assert "You are a test agent." in prompt
        # Extra context comes BEFORE body
        assert prompt.index("React Best Practices") < prompt.index("test agent")

    def test_empty_extra_context_not_prepended(self):
        agent = AgentDefinition(name="test", description="", body="Body only.")
        prompt = build_system_prompt(agent, extra_context="")
        assert prompt == "Body only."
