"""Skill loading from .github/skills/ and enforcement map.

Mirrors the deterministic skill injection from
.github/hooks/scripts/inject-skills.mjs — same mapping, same semantics.

The enforcement map defines two categories per agent:
  - ``inject``: skills whose content is prepended to the system prompt
    automatically (the agent gets them whether it asks or not).
  - ``read_file``: skills the agent is expected to load via the ``load_skill``
    tool during execution (listed for doc/enforcement, not auto-injected).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# Skill enforcement map — single source of truth (Python port of inject-skills.mjs)
# ---------------------------------------------------------------------------

SKILL_ENFORCEMENT: dict[str, dict[str, list[str]]] = {
    "ux-designer": {
        "inject": [".github/skills/web-design-guidelines/SKILL.md"],
        "read_file": [
            ".github/skills/framer-components/SKILL.md",
            ".github/prompts/ui-ux-pro-max/PROMPT.md",
        ],
    },
    "developer": {
        "inject": [".github/skills/vercel-react-best-practices/SKILL.md"],
        "read_file": [
            ".github/skills/shadcn-ui/SKILL.md",
            ".github/skills/vercel-react-best-practices/AGENTS.md",
        ],
    },
    "product-manager": {
        "inject": [],
        "read_file": [".github/skills/prd/SKILL.md"],
    },
    "security-reviewer": {
        "inject": [],
        "read_file": [".github/skills/security-analysis/SKILL.md"],
    },
    "tester": {
        "inject": [".github/skills/web-design-guidelines/SKILL.md"],
        "read_file": [],
    },
    "researcher": {
        "inject": [".github/skills/web-search/SKILL.md"],
        "read_file": [],
    },
}


def get_auto_inject_skills(agent_name: str) -> list[str]:
    """Return skill paths that should be auto-injected for an agent type.

    These are prepended to the system prompt automatically.
    Returns an empty list for unknown agents.
    """
    config = SKILL_ENFORCEMENT.get(agent_name, {})
    return list(config.get("inject", []))


def get_read_file_skills(agent_name: str) -> list[str]:
    """Return skill paths the agent is expected to load via ``load_skill``.

    These are NOT auto-injected but the agent should load them during
    execution. The enforcement gate can verify compliance.
    """
    config = SKILL_ENFORCEMENT.get(agent_name, {})
    return list(config.get("read_file", []))


def load_skill_file(skill_path: str, repo_root: str | Path) -> str:
    """Read and return the content of a skill file.

    Parameters
    ----------
    skill_path : str
        Relative path from repo root (e.g. ``.github/skills/prd/SKILL.md``).
    repo_root : str | Path
        Absolute path to the repository root.

    Returns
    -------
    str
        The full text content of the skill file.

    Raises
    ------
    FileNotFoundError
        If the skill file doesn't exist.
    """
    full_path = Path(repo_root) / skill_path
    if not full_path.is_file():
        raise FileNotFoundError(f"Skill file not found: {full_path}")
    return full_path.read_text(encoding="utf-8")


def load_injected_skills(agent_name: str, repo_root: str | Path) -> str:
    """Load and concatenate all auto-inject skills for an agent.

    Returns the combined skill content ready to be prepended to the
    system prompt. Returns empty string if the agent has no inject skills
    or if skill files are not found (logs a warning but doesn't fail).
    """
    paths = get_auto_inject_skills(agent_name)
    if not paths:
        return ""

    parts: list[str] = []
    for skill_path in paths:
        try:
            content = load_skill_file(skill_path, repo_root)
            parts.append(f"## Skill: {skill_path}\n\n{content}")
        except FileNotFoundError:
            # Skill file missing — warn but don't crash the worker
            parts.append(f"## Skill: {skill_path}\n\n[Skill file not found]")

    return "\n\n---\n\n".join(parts)
