"""Agent prompt loading from .agent.md files.

Parses YAML frontmatter (---delimited) and markdown body from
.github/agents/<name>.agent.md files. Copilot-specific fields (tools,
handoffs, model, infer) are extracted but not used for the system prompt —
the markdown body IS the system prompt.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml


@dataclass
class AgentDefinition:
    """Parsed representation of an .agent.md file."""

    name: str
    description: str
    body: str  # Markdown body → becomes the system prompt
    model: str = ""
    tools: list[str] = field(default_factory=list)
    handoffs: list[dict[str, Any]] = field(default_factory=list)
    raw_frontmatter: dict[str, Any] = field(default_factory=dict)


def parse_agent_file(content: str) -> AgentDefinition:
    """Parse an .agent.md file's YAML frontmatter + markdown body.

    The file format is:
        ---
        name: developer
        description: ...
        model: ...
        tools: [...]
        handoffs: [...]
        ---

        # Markdown body (system prompt)
        ...

    Returns an ``AgentDefinition`` with the frontmatter fields extracted
    and the body available as the system prompt text.
    """
    content = content.lstrip()
    if not content.startswith("---"):
        # No frontmatter — treat entire content as body
        return AgentDefinition(name="unknown", description="", body=content)

    # Split on the closing --- delimiter
    parts = content.split("---", 2)
    if len(parts) < 3:
        return AgentDefinition(name="unknown", description="", body=content)

    frontmatter_raw = parts[1]
    body = parts[2].strip()

    fm: dict[str, Any] = yaml.safe_load(frontmatter_raw) or {}

    return AgentDefinition(
        name=fm.get("name", "unknown"),
        description=fm.get("description", ""),
        body=body,
        model=fm.get("model", ""),
        tools=fm.get("tools", []),
        handoffs=fm.get("handoffs", []),
        raw_frontmatter=fm,
    )


def load_agent(agent_name: str, agents_dir: str | Path) -> AgentDefinition:
    """Load and parse an agent definition from disk.

    Parameters
    ----------
    agent_name : str
        Agent name (e.g. ``"developer"``). Matches ``<name>.agent.md``.
    agents_dir : str | Path
        Directory containing agent files (typically ``.github/agents/``).

    Raises
    ------
    FileNotFoundError
        If the agent file doesn't exist.
    """
    agents_dir = Path(agents_dir)
    path = agents_dir / f"{agent_name}.agent.md"
    if not path.is_file():
        raise FileNotFoundError(f"Agent file not found: {path}")
    return parse_agent_file(path.read_text(encoding="utf-8"))


def build_system_prompt(agent: AgentDefinition, extra_context: str = "") -> str:
    """Assemble the system prompt from agent body + optional extra context.

    The agent's markdown body forms the base. If ``extra_context`` (e.g.
    injected skill content) is provided, it's prepended so the model sees
    domain knowledge before the role instructions.
    """
    parts: list[str] = []
    if extra_context:
        parts.append(extra_context)
    parts.append(agent.body)
    return "\n\n".join(parts)
