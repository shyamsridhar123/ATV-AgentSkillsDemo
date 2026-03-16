"""Tests for tools.py — 9-tool registry + sandbox enforcement."""

import json
import os
from pathlib import Path

import pytest

from swarm.board import MessageBoard
from swarm.tools import (
    TOOL_DEFINITIONS,
    execute_tool,
    tool_edit_file,
    tool_list_directory,
    tool_load_skill,
    tool_post_message,
    tool_read_file,
    tool_read_messages,
    tool_run_command,
    tool_search_files,
    tool_write_file,
    _resolve_sandboxed,
)

REPO_ROOT = Path(__file__).resolve().parents[2]


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def work_dir(tmp_path):
    """Create a temporary working directory with some test files."""
    (tmp_path / "hello.txt").write_text("Hello, world!\n", encoding="utf-8")
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "main.ts").write_text('console.log("hi");\n', encoding="utf-8")
    (tmp_path / "src" / "utils.ts").write_text(
        'export function add(a: number, b: number) { return a + b; }\n',
        encoding="utf-8",
    )
    return tmp_path


@pytest.fixture
def board():
    """In-memory message board."""
    b = MessageBoard(":memory:")
    yield b
    b.close()


# ---------------------------------------------------------------------------
# Sandbox tests (AC #4)
# ---------------------------------------------------------------------------


class TestSandbox:
    def test_resolve_within_sandbox(self, work_dir):
        resolved = _resolve_sandboxed("hello.txt", work_dir)
        assert resolved == (work_dir / "hello.txt").resolve()

    def test_resolve_subdirectory(self, work_dir):
        resolved = _resolve_sandboxed("src/main.ts", work_dir)
        assert resolved == (work_dir / "src" / "main.ts").resolve()

    def test_reject_path_traversal(self, work_dir):
        with pytest.raises(ValueError, match="outside"):
            _resolve_sandboxed("../../etc/passwd", work_dir)

    def test_reject_absolute_path_outside(self, work_dir):
        with pytest.raises(ValueError, match="outside"):
            _resolve_sandboxed("/etc/passwd", work_dir)

    def test_allow_dotdot_within_sandbox(self, work_dir):
        # src/../hello.txt resolves to hello.txt which is inside sandbox
        resolved = _resolve_sandboxed("src/../hello.txt", work_dir)
        assert resolved == (work_dir / "hello.txt").resolve()


# ---------------------------------------------------------------------------
# Tool: read_file (AC #3)
# ---------------------------------------------------------------------------


class TestReadFile:
    def test_read_existing_file(self, work_dir):
        result = tool_read_file("hello.txt", work_dir=work_dir)
        assert "Hello, world!" in result

    def test_read_nested_file(self, work_dir):
        result = tool_read_file("src/main.ts", work_dir=work_dir)
        assert 'console.log("hi")' in result

    def test_read_nonexistent(self, work_dir):
        result = tool_read_file("nonexistent.txt", work_dir=work_dir)
        parsed = json.loads(result)
        assert "error" in parsed

    def test_read_rejects_escape(self, work_dir):
        # Direct call raises ValueError (sandbox enforcement)
        with pytest.raises(ValueError, match="outside"):
            tool_read_file("../../etc/passwd", work_dir=work_dir)

        # execute_tool catches the error and returns JSON
        board = MessageBoard(":memory:")
        try:
            result = execute_tool(
                "read_file",
                json.dumps({"path": "../../etc/passwd"}),
                work_dir=work_dir,
                board=board,
                agent_id="test",
                repo_root=work_dir,
            )
            parsed = json.loads(result)
            assert "error" in parsed
        finally:
            board.close()


# ---------------------------------------------------------------------------
# Tool: write_file (AC #3)
# ---------------------------------------------------------------------------


class TestWriteFile:
    def test_write_new_file(self, work_dir):
        result = tool_write_file("new.txt", "new content", work_dir=work_dir)
        parsed = json.loads(result)
        assert parsed["success"] is True
        assert (work_dir / "new.txt").read_text() == "new content"

    def test_write_creates_directories(self, work_dir):
        result = tool_write_file("deep/nested/file.txt", "deep content", work_dir=work_dir)
        parsed = json.loads(result)
        assert parsed["success"] is True
        assert (work_dir / "deep" / "nested" / "file.txt").read_text() == "deep content"

    def test_write_overwrite(self, work_dir):
        tool_write_file("hello.txt", "overwritten", work_dir=work_dir)
        assert (work_dir / "hello.txt").read_text() == "overwritten"


# ---------------------------------------------------------------------------
# Tool: edit_file (AC #3)
# ---------------------------------------------------------------------------


class TestEditFile:
    def test_edit_success(self, work_dir):
        result = tool_edit_file("hello.txt", "Hello, world!", "Goodbye, world!", work_dir=work_dir)
        parsed = json.loads(result)
        assert parsed["success"] is True
        assert "Goodbye, world!" in (work_dir / "hello.txt").read_text()

    def test_edit_not_found_string(self, work_dir):
        result = tool_edit_file("hello.txt", "nonexistent string", "replacement", work_dir=work_dir)
        parsed = json.loads(result)
        assert "error" in parsed
        assert "not found" in parsed["error"]

    def test_edit_nonexistent_file(self, work_dir):
        result = tool_edit_file("nope.txt", "a", "b", work_dir=work_dir)
        parsed = json.loads(result)
        assert "error" in parsed

    def test_edit_duplicate_string(self, work_dir):
        (work_dir / "dupes.txt").write_text("aaa\naaa\n", encoding="utf-8")
        result = tool_edit_file("dupes.txt", "aaa", "bbb", work_dir=work_dir)
        parsed = json.loads(result)
        assert "error" in parsed
        assert "2 times" in parsed["error"]


# ---------------------------------------------------------------------------
# Tool: run_command (AC #3)
# ---------------------------------------------------------------------------


class TestRunCommand:
    def test_echo(self, work_dir):
        result = tool_run_command("echo hello", work_dir=work_dir)
        parsed = json.loads(result)
        assert parsed["exit_code"] == 0
        assert "hello" in parsed["output"]

    def test_pwd_in_work_dir(self, work_dir):
        result = tool_run_command("pwd", work_dir=work_dir)
        parsed = json.loads(result)
        assert str(work_dir) in parsed["output"]

    def test_failing_command(self, work_dir):
        result = tool_run_command("false", work_dir=work_dir)
        parsed = json.loads(result)
        assert parsed["exit_code"] != 0


# ---------------------------------------------------------------------------
# Tool: list_directory (AC #3)
# ---------------------------------------------------------------------------


class TestListDirectory:
    def test_list_root(self, work_dir):
        result = tool_list_directory(".", work_dir=work_dir)
        parsed = json.loads(result)
        assert "hello.txt" in parsed["entries"]
        assert "src/" in parsed["entries"]

    def test_list_subdirectory(self, work_dir):
        result = tool_list_directory("src", work_dir=work_dir)
        parsed = json.loads(result)
        assert "main.ts" in parsed["entries"]
        assert "utils.ts" in parsed["entries"]

    def test_list_nonexistent(self, work_dir):
        result = tool_list_directory("nonexistent", work_dir=work_dir)
        parsed = json.loads(result)
        assert "error" in parsed


# ---------------------------------------------------------------------------
# Tool: search_files (AC #3)
# ---------------------------------------------------------------------------


class TestSearchFiles:
    def test_search_pattern(self, work_dir):
        result = tool_search_files("console.log", work_dir=work_dir)
        parsed = json.loads(result)
        assert len(parsed["matching_files"]) >= 1
        assert any("main.ts" in f for f in parsed["matching_files"])

    def test_search_no_match(self, work_dir):
        result = tool_search_files("xyz_no_match_123", work_dir=work_dir)
        parsed = json.loads(result)
        # Empty matches or single empty string
        assert len(parsed["matching_files"]) == 0 or parsed["matching_files"] == [""]


# ---------------------------------------------------------------------------
# Tool: post_message (AC #3)
# ---------------------------------------------------------------------------


class TestPostMessage:
    def test_post_to_tasks(self, board):
        result = tool_post_message(
            "tasks", "Do the thing", board=board, agent_id="developer", title="Task 1"
        )
        parsed = json.loads(result)
        assert parsed["success"] is True
        assert parsed["channel"] == "tasks"
        assert parsed["post_id"] > 0

    def test_post_with_metadata(self, board):
        result = tool_post_message(
            "completions",
            "Done",
            board=board,
            agent_id="developer",
            metadata={"files_changed": ["src/main.ts"]},
        )
        parsed = json.loads(result)
        assert parsed["success"] is True


# ---------------------------------------------------------------------------
# Tool: read_messages (AC #3)
# ---------------------------------------------------------------------------


class TestReadMessages:
    def test_read_new_messages(self, board):
        board.post("tasks", "beth", "Build something", title="Task A")
        result = tool_read_messages("tasks", board=board, reader_id="developer")
        parsed = json.loads(result)
        assert parsed["count"] == 1
        assert parsed["posts"][0]["title"] == "Task A"

    def test_read_returns_empty_after_read(self, board):
        board.post("tasks", "beth", "First task")
        tool_read_messages("tasks", board=board, reader_id="developer")
        # Second read should return nothing new
        result = tool_read_messages("tasks", board=board, reader_id="developer")
        parsed = json.loads(result)
        assert parsed["count"] == 0


# ---------------------------------------------------------------------------
# Tool: load_skill (AC #3)
# ---------------------------------------------------------------------------


class TestLoadSkill:
    def test_load_existing_skill(self, tmp_path):
        skill_dir = tmp_path / ".github" / "skills" / "test"
        skill_dir.mkdir(parents=True)
        (skill_dir / "SKILL.md").write_text("# Test Skill", encoding="utf-8")

        result = tool_load_skill(".github/skills/test/SKILL.md", repo_root=tmp_path)
        assert "# Test Skill" in result

    def test_load_nonexistent_skill(self, tmp_path):
        result = tool_load_skill(".github/skills/nope/SKILL.md", repo_root=tmp_path)
        parsed = json.loads(result)
        assert "error" in parsed

    @pytest.mark.skipif(
        not (REPO_ROOT / ".github/skills/vercel-react-best-practices/SKILL.md").exists(),
        reason="Real skill files not available",
    )
    def test_load_real_skill(self):
        result = tool_load_skill(
            ".github/skills/vercel-react-best-practices/SKILL.md", repo_root=REPO_ROOT
        )
        assert len(result) > 100


# ---------------------------------------------------------------------------
# execute_tool dispatcher (AC #3)
# ---------------------------------------------------------------------------


class TestExecuteTool:
    def test_all_nine_tools_defined(self):
        names = {t["function"]["name"] for t in TOOL_DEFINITIONS}
        expected = {
            "read_file", "write_file", "edit_file", "run_command",
            "list_directory", "search_files", "post_message",
            "read_messages", "load_skill",
        }
        assert names == expected

    def test_dispatch_read_file(self, work_dir, board):
        result = execute_tool(
            "read_file",
            json.dumps({"path": "hello.txt"}),
            work_dir=work_dir,
            board=board,
            agent_id="test",
            repo_root=work_dir,
        )
        assert "Hello, world!" in result

    def test_dispatch_unknown_tool(self, work_dir, board):
        result = execute_tool(
            "nonexistent_tool",
            "{}",
            work_dir=work_dir,
            board=board,
            agent_id="test",
            repo_root=work_dir,
        )
        parsed = json.loads(result)
        assert "error" in parsed
        assert "Unknown tool" in parsed["error"]

    def test_dispatch_invalid_json(self, work_dir, board):
        result = execute_tool(
            "read_file",
            "not valid json",
            work_dir=work_dir,
            board=board,
            agent_id="test",
            repo_root=work_dir,
        )
        parsed = json.loads(result)
        assert "error" in parsed

    def test_dispatch_missing_args(self, work_dir, board):
        result = execute_tool(
            "write_file",
            json.dumps({"path": "test.txt"}),  # missing "content"
            work_dir=work_dir,
            board=board,
            agent_id="test",
            repo_root=work_dir,
        )
        parsed = json.loads(result)
        assert "error" in parsed
