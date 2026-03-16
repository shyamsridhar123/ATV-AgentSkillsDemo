"""Tests for worker.py — single worker loop."""

import json
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from swarm.board import MessageBoard
from swarm.config import SwarmConfig, ProviderConfig, ModelRouting, ModelTier
from swarm.worker import Task, _build_task_prompt, _detect_changed_files, run_worker


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_tool_call(call_id: str, name: str, arguments: dict) -> SimpleNamespace:
    return SimpleNamespace(
        id=call_id,
        type="function",
        function=SimpleNamespace(
            name=name,
            arguments=json.dumps(arguments),
        ),
    )


def _make_response(content=None, finish_reason="stop", tool_calls=None, tokens_in=50, tokens_out=25):
    message = SimpleNamespace(content=content, tool_calls=tool_calls)
    return SimpleNamespace(
        choices=[SimpleNamespace(finish_reason=finish_reason, message=message)],
        usage=SimpleNamespace(prompt_tokens=tokens_in, completion_tokens=tokens_out),
    )


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def board():
    b = MessageBoard(":memory:")
    yield b
    b.close()


@pytest.fixture
def work_dir(tmp_path):
    return tmp_path


@pytest.fixture
def agent_dir(tmp_path):
    """Create a minimal agent file for testing."""
    agents = tmp_path / ".github" / "agents"
    agents.mkdir(parents=True)
    (agents / "developer.agent.md").write_text(
        "---\nname: developer\ndescription: Test developer\n---\n\nYou are a developer.\n",
        encoding="utf-8",
    )
    return agents


@pytest.fixture
def repo_root(tmp_path, agent_dir):
    """Repo root with agents dir."""
    return tmp_path


@pytest.fixture
def config():
    return SwarmConfig(
        primary_provider=ProviderConfig(
            name="azure",
            endpoint="https://test.openai.azure.com",
            api_key="test-key",
        ),
        model_routing=ModelRouting(
            standard=ModelTier(deployment="gpt-4o-mini"),
        ),
    )


# ---------------------------------------------------------------------------
# _build_task_prompt tests
# ---------------------------------------------------------------------------


class TestBuildTaskPrompt:
    def test_basic_prompt(self):
        task = Task(
            post_id=1,
            title="Create hello world",
            body="Create a file called hello.txt with 'Hello World!'",
            agent_role="developer",
        )
        prompt = _build_task_prompt(task)
        assert "Create hello world" in prompt
        assert "Create a file called hello.txt" in prompt

    def test_with_acceptance_criteria(self):
        task = Task(
            post_id=1,
            title="Test task",
            body="Do the thing",
            agent_role="developer",
            acceptance_criteria="- File exists\n- Content is correct",
        )
        prompt = _build_task_prompt(task)
        assert "Acceptance Criteria" in prompt
        assert "File exists" in prompt

    def test_with_skills(self):
        task = Task(
            post_id=1,
            title="Skill task",
            body="Use skills",
            agent_role="developer",
            skills=[".github/skills/prd/SKILL.md"],
        )
        prompt = _build_task_prompt(task)
        assert "Required Skills" in prompt
        assert "prd/SKILL.md" in prompt


# ---------------------------------------------------------------------------
# _detect_changed_files tests
# ---------------------------------------------------------------------------


class TestDetectChangedFiles:
    def test_in_git_repo(self, tmp_path):
        """In a non-git directory, returns empty list."""
        files = _detect_changed_files(tmp_path)
        assert files == []


# ---------------------------------------------------------------------------
# run_worker tests (AC #5)
# ---------------------------------------------------------------------------


class TestRunWorker:
    @patch("swarm.worker.create_client")
    def test_full_worker_loop(self, mock_create_client, board, work_dir, repo_root, config):
        """Worker loads agent, runs tool loop, posts completion with metadata."""
        mock_client = MagicMock()
        mock_create_client.return_value = mock_client

        # LLM: write a file, then stop
        first_response = _make_response(
            content=None, finish_reason="tool_calls",
            tool_calls=[_make_tool_call("c1", "write_file", {
                "path": "hello.txt", "content": "Hello World!"
            })],
        )
        second_response = _make_response(content="Created hello.txt successfully.")
        mock_client.chat.completions.create.side_effect = [first_response, second_response]

        task = Task(
            post_id=1,
            title="Create hello world file",
            body="Create a file called hello.txt containing 'Hello World!'",
            agent_role="developer",
            epic_id="beth-test",
            task_id="BETH-TEST-1",
        )

        result = run_worker(
            task=task,
            config=config,
            board=board,
            work_dir=work_dir,
            repo_root=repo_root,
        )

        # Verify the file was written
        assert (work_dir / "hello.txt").read_text() == "Hello World!"

        # Verify completion posted to board (AC #5)
        completions = board.read_all("completions")
        assert len(completions) == 1
        comp = completions[0]
        assert "hello world file" in comp.title.lower()
        assert comp.agent_id == "developer"
        assert comp.metadata is not None
        assert comp.metadata["task_id"] == "BETH-TEST-1"
        assert comp.metadata["epic_id"] == "beth-test"
        assert "files_changed" in comp.metadata
        assert comp.metadata["tool_calls"] == 1

        # Verify outcome recorded
        outcomes = board.query_outcomes(agent_role="developer")
        assert len(outcomes) == 1
        assert outcomes[0].success is True
        assert outcomes[0].model_used == "gpt-4o-mini"

    @patch("swarm.worker.create_client")
    def test_worker_posts_structured_metadata(self, mock_create_client, board, work_dir, repo_root, config):
        """AC #5: Completion has required metadata fields."""
        mock_client = MagicMock()
        mock_create_client.return_value = mock_client
        mock_client.chat.completions.create.return_value = _make_response(
            content="Done.", tokens_in=200, tokens_out=100,
        )

        task = Task(
            post_id=42,
            title="Test metadata",
            body="Just testing",
            agent_role="developer",
            epic_id="epic-123",
            task_id="TASK-456",
        )

        run_worker(
            task=task, config=config, board=board,
            work_dir=work_dir, repo_root=repo_root,
        )

        completions = board.read_all("completions")
        assert len(completions) == 1
        meta = completions[0].metadata
        assert meta["task_id"] == "TASK-456"
        assert meta["epic_id"] == "epic-123"
        assert "files_changed" in meta
        assert "tokens_in" in meta
        assert "tokens_out" in meta
        assert "tool_calls" in meta
        assert "duration_ms" in meta
        assert "model_used" in meta

    @patch("swarm.worker.create_client")
    def test_worker_with_task_skills(self, mock_create_client, board, work_dir, repo_root, config):
        """Worker loads task-specific skills if they exist."""
        mock_client = MagicMock()
        mock_create_client.return_value = mock_client
        mock_client.chat.completions.create.return_value = _make_response(content="Done.")

        # Create a test skill file
        skill_dir = repo_root / ".github" / "skills" / "test-skill"
        skill_dir.mkdir(parents=True)
        (skill_dir / "SKILL.md").write_text("# Test Skill\nDo specific things.", encoding="utf-8")

        task = Task(
            post_id=1,
            title="Skill test",
            body="Use the skill",
            agent_role="developer",
            skills=[".github/skills/test-skill/SKILL.md"],
        )

        run_worker(
            task=task, config=config, board=board,
            work_dir=work_dir, repo_root=repo_root,
        )

        # Verify skill was in the system prompt
        call_args = mock_client.chat.completions.create.call_args
        messages = call_args.kwargs["messages"]
        system_msg = messages[0]["content"]
        assert "Test Skill" in system_msg
