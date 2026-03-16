"""Tests for llm.py — Azure OpenAI client with tool-use loop."""

import json
from pathlib import Path
from types import SimpleNamespace
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from swarm.board import MessageBoard
from swarm.llm import CompletionResult, _message_to_dict, agent_loop, create_client
from swarm.config import ProviderConfig


# ---------------------------------------------------------------------------
# Helpers for mocking OpenAI responses
# ---------------------------------------------------------------------------


def _make_tool_call(call_id: str, name: str, arguments: dict) -> SimpleNamespace:
    """Build a mock tool_call object."""
    return SimpleNamespace(
        id=call_id,
        type="function",
        function=SimpleNamespace(
            name=name,
            arguments=json.dumps(arguments),
        ),
    )


def _make_response(
    content: str | None = None,
    finish_reason: str = "stop",
    tool_calls: list | None = None,
    tokens_in: int = 100,
    tokens_out: int = 50,
) -> SimpleNamespace:
    """Build a mock ChatCompletion response."""
    message = SimpleNamespace(
        content=content,
        tool_calls=tool_calls,
    )
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
    (tmp_path / "existing.txt").write_text("hello", encoding="utf-8")
    return tmp_path


# ---------------------------------------------------------------------------
# create_client tests
# ---------------------------------------------------------------------------


class TestCreateClient:
    @patch("swarm.llm.AzureOpenAI")
    def test_azure_provider(self, mock_azure):
        config = ProviderConfig(name="azure", endpoint="https://test.openai.azure.com", api_key="key123")
        create_client(config)
        mock_azure.assert_called_once_with(
            azure_endpoint="https://test.openai.azure.com",
            api_key="key123",
            api_version="2024-12-01-preview",
        )

    @patch("swarm.llm.OpenAI")
    def test_openai_provider(self, mock_openai):
        config = ProviderConfig(name="openai", endpoint="https://api.openai.com", api_key="key456")
        create_client(config)
        mock_openai.assert_called_once_with(
            base_url="https://api.openai.com",
            api_key="key456",
        )


# ---------------------------------------------------------------------------
# agent_loop tests (AC #6)
# ---------------------------------------------------------------------------


class TestAgentLoop:
    def test_simple_stop(self, work_dir, board):
        """Model returns a simple response with no tool calls."""
        mock_client = MagicMock()
        mock_client.chat.completions.create.return_value = _make_response(
            content="Task completed successfully."
        )

        result = agent_loop(
            client=mock_client,
            deployment="gpt-4o",
            system_prompt="You are a developer.",
            user_message="Create a hello world file.",
            work_dir=work_dir,
            board=board,
            agent_id="developer",
            repo_root=work_dir,
        )

        assert isinstance(result, CompletionResult)
        assert result.content == "Task completed successfully."
        assert result.total_tokens_in == 100
        assert result.total_tokens_out == 50
        assert result.tool_calls_made == 0
        assert result.model_used == "gpt-4o"

    def test_tool_call_then_stop(self, work_dir, board):
        """Model makes a tool call, then returns a final response."""
        mock_client = MagicMock()

        # First call: model wants to write a file
        tool_calls = [
            _make_tool_call("call_1", "write_file", {"path": "hello.txt", "content": "Hello World!"})
        ]
        first_response = _make_response(
            content=None, finish_reason="tool_calls", tool_calls=tool_calls
        )

        # Second call: model says it's done
        second_response = _make_response(content="File created successfully.")

        mock_client.chat.completions.create.side_effect = [first_response, second_response]

        result = agent_loop(
            client=mock_client,
            deployment="gpt-4o",
            system_prompt="You are a developer.",
            user_message="Create hello.txt",
            work_dir=work_dir,
            board=board,
            agent_id="developer",
            repo_root=work_dir,
        )

        assert result.content == "File created successfully."
        assert result.tool_calls_made == 1
        # Verify the file was actually written
        assert (work_dir / "hello.txt").read_text() == "Hello World!"

    def test_multiple_tool_calls(self, work_dir, board):
        """Model makes multiple tool calls in sequence."""
        mock_client = MagicMock()

        # First: write file
        first_response = _make_response(
            content=None, finish_reason="tool_calls",
            tool_calls=[_make_tool_call("c1", "write_file", {"path": "a.txt", "content": "aaa"})],
        )
        # Second: read file
        second_response = _make_response(
            content=None, finish_reason="tool_calls",
            tool_calls=[_make_tool_call("c2", "read_file", {"path": "a.txt"})],
        )
        # Third: done
        third_response = _make_response(content="All done.")

        mock_client.chat.completions.create.side_effect = [
            first_response, second_response, third_response
        ]

        result = agent_loop(
            client=mock_client,
            deployment="gpt-4o-mini",
            system_prompt="Dev agent",
            user_message="Write and read a file",
            work_dir=work_dir,
            board=board,
            agent_id="developer",
            repo_root=work_dir,
        )

        assert result.content == "All done."
        assert result.tool_calls_made == 2
        assert (work_dir / "a.txt").read_text() == "aaa"

    def test_parallel_tool_calls_in_one_response(self, work_dir, board):
        """Model requests multiple tool calls in a single response."""
        mock_client = MagicMock()

        # First: two tool calls at once
        first_response = _make_response(
            content=None, finish_reason="tool_calls",
            tool_calls=[
                _make_tool_call("c1", "write_file", {"path": "one.txt", "content": "1"}),
                _make_tool_call("c2", "write_file", {"path": "two.txt", "content": "2"}),
            ],
        )
        # Second: done
        second_response = _make_response(content="Both files created.")

        mock_client.chat.completions.create.side_effect = [first_response, second_response]

        result = agent_loop(
            client=mock_client,
            deployment="gpt-4o",
            system_prompt="Dev",
            user_message="Create two files",
            work_dir=work_dir,
            board=board,
            agent_id="developer",
            repo_root=work_dir,
        )

        assert result.tool_calls_made == 2
        assert (work_dir / "one.txt").read_text() == "1"
        assert (work_dir / "two.txt").read_text() == "2"

    def test_max_iterations_safety(self, work_dir, board):
        """Agent loop respects max_iterations."""
        mock_client = MagicMock()

        # Always return tool calls — never stop
        endless_response = _make_response(
            content=None, finish_reason="tool_calls",
            tool_calls=[_make_tool_call("c1", "list_directory", {"path": "."})],
        )
        mock_client.chat.completions.create.return_value = endless_response

        result = agent_loop(
            client=mock_client,
            deployment="gpt-4o",
            system_prompt="Dev",
            user_message="Do stuff",
            work_dir=work_dir,
            board=board,
            agent_id="developer",
            repo_root=work_dir,
            max_iterations=3,
        )

        assert "exhausted" in result.content.lower()
        assert result.tool_calls_made == 3

    def test_board_tool_integration(self, work_dir, board):
        """Tool calls can post to and read from the message board."""
        mock_client = MagicMock()

        # Post a message
        first_response = _make_response(
            content=None, finish_reason="tool_calls",
            tool_calls=[
                _make_tool_call("c1", "post_message", {
                    "channel": "completions",
                    "body": "Task done",
                    "title": "Hello world complete",
                    "metadata": {"files_changed": ["hello.txt"]},
                }),
            ],
        )
        second_response = _make_response(content="Posted completion.")

        mock_client.chat.completions.create.side_effect = [first_response, second_response]

        result = agent_loop(
            client=mock_client,
            deployment="gpt-4o",
            system_prompt="Dev",
            user_message="Post completion",
            work_dir=work_dir,
            board=board,
            agent_id="developer",
            repo_root=work_dir,
        )

        assert result.content == "Posted completion."
        # Verify the post is on the board
        posts = board.read_all("completions")
        assert len(posts) == 1
        assert posts[0].title == "Hello world complete"


# ---------------------------------------------------------------------------
# _message_to_dict tests
# ---------------------------------------------------------------------------


class TestMessageToDict:
    def test_content_only(self):
        msg = SimpleNamespace(content="Hello", tool_calls=None)
        d = _message_to_dict(msg)
        assert d["role"] == "assistant"
        assert d["content"] == "Hello"
        assert "tool_calls" not in d

    def test_with_tool_calls(self):
        tc = _make_tool_call("c1", "read_file", {"path": "test.txt"})
        msg = SimpleNamespace(content=None, tool_calls=[tc])
        d = _message_to_dict(msg)
        assert d["role"] == "assistant"
        assert len(d["tool_calls"]) == 1
        assert d["tool_calls"][0]["function"]["name"] == "read_file"
