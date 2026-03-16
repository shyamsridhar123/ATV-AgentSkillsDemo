"""Tests for skills.py — SKILL.md loader + enforcement map."""

from pathlib import Path

import pytest

from swarm.skills import (
    SKILL_ENFORCEMENT,
    get_auto_inject_skills,
    get_read_file_skills,
    load_injected_skills,
    load_skill_file,
)

REPO_ROOT = Path(__file__).resolve().parents[2]


# ---------------------------------------------------------------------------
# Enforcement map tests (AC #7)
# ---------------------------------------------------------------------------


class TestSkillEnforcementMap:
    """Verify the enforcement map matches inject-skills.mjs exactly."""

    def test_developer_inject(self):
        skills = get_auto_inject_skills("developer")
        assert skills == [".github/skills/vercel-react-best-practices/SKILL.md"]

    def test_developer_read_file(self):
        skills = get_read_file_skills("developer")
        assert ".github/skills/shadcn-ui/SKILL.md" in skills
        assert ".github/skills/vercel-react-best-practices/AGENTS.md" in skills

    def test_ux_designer_inject(self):
        skills = get_auto_inject_skills("ux-designer")
        assert skills == [".github/skills/web-design-guidelines/SKILL.md"]

    def test_ux_designer_read_file(self):
        skills = get_read_file_skills("ux-designer")
        assert ".github/skills/framer-components/SKILL.md" in skills
        assert ".github/prompts/ui-ux-pro-max/PROMPT.md" in skills

    def test_product_manager_no_inject(self):
        assert get_auto_inject_skills("product-manager") == []

    def test_product_manager_read_file(self):
        assert get_read_file_skills("product-manager") == [".github/skills/prd/SKILL.md"]

    def test_security_reviewer_no_inject(self):
        assert get_auto_inject_skills("security-reviewer") == []

    def test_security_reviewer_read_file(self):
        assert get_read_file_skills("security-reviewer") == [
            ".github/skills/security-analysis/SKILL.md"
        ]

    def test_tester_inject(self):
        skills = get_auto_inject_skills("tester")
        assert skills == [".github/skills/web-design-guidelines/SKILL.md"]

    def test_tester_no_read_file(self):
        assert get_read_file_skills("tester") == []

    def test_researcher_inject(self):
        skills = get_auto_inject_skills("researcher")
        assert skills == [".github/skills/web-search/SKILL.md"]

    def test_researcher_no_read_file(self):
        assert get_read_file_skills("researcher") == []

    def test_unknown_agent_returns_empty(self):
        assert get_auto_inject_skills("nonexistent") == []
        assert get_read_file_skills("nonexistent") == []

    def test_all_six_agents_present(self):
        expected = {
            "ux-designer",
            "developer",
            "product-manager",
            "security-reviewer",
            "tester",
            "researcher",
        }
        assert set(SKILL_ENFORCEMENT.keys()) == expected


# ---------------------------------------------------------------------------
# Skill file loading tests (AC #2)
# ---------------------------------------------------------------------------


class TestLoadSkillFile:
    @pytest.mark.skipif(
        not (REPO_ROOT / ".github/skills/vercel-react-best-practices/SKILL.md").exists(),
        reason="Real skill files not available",
    )
    def test_load_real_skill(self):
        content = load_skill_file(
            ".github/skills/vercel-react-best-practices/SKILL.md", REPO_ROOT
        )
        assert len(content) > 100
        # Should contain React-related content
        assert "react" in content.lower() or "next" in content.lower()

    def test_load_nonexistent_skill(self, tmp_path):
        with pytest.raises(FileNotFoundError):
            load_skill_file("nonexistent/SKILL.md", tmp_path)

    def test_load_from_tmp(self, tmp_path):
        skill_dir = tmp_path / ".github" / "skills" / "test-skill"
        skill_dir.mkdir(parents=True)
        skill_file = skill_dir / "SKILL.md"
        skill_file.write_text("# Test Skill\n\nDo the thing.", encoding="utf-8")

        content = load_skill_file(".github/skills/test-skill/SKILL.md", tmp_path)
        assert "# Test Skill" in content
        assert "Do the thing." in content


# ---------------------------------------------------------------------------
# load_injected_skills tests
# ---------------------------------------------------------------------------


class TestLoadInjectedSkills:
    @pytest.mark.skipif(
        not (REPO_ROOT / ".github/skills/vercel-react-best-practices/SKILL.md").exists(),
        reason="Real skill files not available",
    )
    def test_developer_skills_loaded(self):
        result = load_injected_skills("developer", REPO_ROOT)
        assert "vercel-react-best-practices" in result
        assert len(result) > 100

    def test_no_skills_returns_empty(self):
        result = load_injected_skills("product-manager", "/nonexistent")
        assert result == ""

    def test_missing_file_graceful(self, tmp_path):
        # Developer has inject skills but files don't exist at tmp_path
        result = load_injected_skills("developer", tmp_path)
        assert "[Skill file not found]" in result
