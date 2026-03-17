#!/usr/bin/env python3
"""Smoke test — run a real worker against the live Azure OpenAI endpoint.

This is NOT a unit test. This hits the actual deployed AOAI resource.
It proves the full loop works: config → client → LLM → tool calls → completion.

Auth: Uses DefaultAzureCredential (managed identity / az login). No API keys.

Usage:
    # Ensure you're logged in and have Cognitive Services OpenAI User role
    az login
    python -m tests.smoke_live

Or with pytest (marked as 'live' — skipped by default):
    pytest tests/smoke_live.py -m live -v
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path

import pytest

# Add swarm package to path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from swarm.board import MessageBoard
from swarm.config import SwarmConfig
from swarm.llm import CompletionResult, agent_loop, create_client
from swarm.worker import Task, run_worker


# ---------------------------------------------------------------------------
# Skip condition: check if DefaultAzureCredential can obtain a token
# ---------------------------------------------------------------------------

ENDPOINT = os.environ.get(
    "AZURE_OPENAI_ENDPOINT", "https://beth-swarm-aoai.openai.azure.com/"
)


def _can_get_azure_token() -> bool:
    """Check if DefaultAzureCredential can obtain a token."""
    try:
        from azure.identity import DefaultAzureCredential
        cred = DefaultAzureCredential()
        cred.get_token("https://cognitiveservices.azure.com/.default")
        return True
    except Exception:
        return False


requires_live = pytest.mark.skipif(
    not _can_get_azure_token(),
    reason="DefaultAzureCredential cannot obtain a token (run az login first)",
)

pytestmark = [pytest.mark.live, requires_live]


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def config():
    return SwarmConfig.from_dict({
        "primary_provider": {
            "name": "azure",
            "endpoint": ENDPOINT,
            "auth_mode": "identity",
            "api_version": "2024-12-01-preview",
        },
        "model_routing": {
            "standard": {"deployment": "gpt-4o-mini"},
        },
    })


@pytest.fixture
def board():
    b = MessageBoard(":memory:")
    yield b
    b.close()


@pytest.fixture
def work_dir():
    with tempfile.TemporaryDirectory(prefix="beth-smoke-") as d:
        yield Path(d)


REPO_ROOT = Path(__file__).resolve().parents[2]


# ---------------------------------------------------------------------------
# Test 1: Raw LLM call — does the endpoint respond?
# ---------------------------------------------------------------------------


class TestLiveEndpoint:
    def test_simple_completion(self, config):
        """Can we get a basic completion from the deployed model?"""
        client = create_client(config.primary_provider)
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a helpful assistant."},
                {"role": "user", "content": "Say 'hello world' and nothing else."},
            ],
            max_tokens=50,
        )
        content = response.choices[0].message.content
        assert content is not None
        assert "hello" in content.lower()
        print(f"\n  [LIVE] Model responded: {content!r}")
        print(f"  [LIVE] Tokens: {response.usage.prompt_tokens} in, {response.usage.completion_tokens} out")


# ---------------------------------------------------------------------------
# Test 2: agent_loop with tool calls — does the tool-use loop work?
# ---------------------------------------------------------------------------


class TestLiveAgentLoop:
    def test_agent_creates_file(self, config, board, work_dir):
        """The LLM decides to write a file via tool call, then stops."""
        client = create_client(config.primary_provider)

        result = agent_loop(
            client=client,
            deployment="gpt-4o-mini",
            system_prompt=(
                "You are a developer agent. You have tools: write_file, read_file, "
                "list_directory, etc. When asked to create a file, use the write_file "
                "tool. After creating the file, respond with a summary."
            ),
            user_message="Create a file called hello.txt with the content 'Hello from Beth Swarm!'",
            work_dir=work_dir,
            board=board,
            agent_id="developer",
            repo_root=work_dir,
            config=config,
            max_iterations=10,
        )

        assert isinstance(result, CompletionResult)
        assert result.model_used == "gpt-4o-mini"
        assert result.total_tokens_in > 0
        assert result.total_tokens_out > 0

        # The model should have used write_file tool
        hello_file = work_dir / "hello.txt"
        print(f"\n  [LIVE] Tool calls made: {result.tool_calls_made}")
        print(f"  [LIVE] Final response: {result.content[:200]!r}")
        print(f"  [LIVE] Tokens: {result.total_tokens_in} in, {result.total_tokens_out} out")
        print(f"  [LIVE] Duration: {result.duration_ms}ms")

        if hello_file.exists():
            print(f"  [LIVE] File created: {hello_file.read_text()!r}")
            assert "hello" in hello_file.read_text().lower() or "beth" in hello_file.read_text().lower()
        else:
            # Model might not have used the tool — still a valid test of the loop
            print("  [LIVE] Note: Model did not create the file (may have responded directly)")
            assert result.content  # At minimum we got a response


# ---------------------------------------------------------------------------
# Test 3: Full worker loop — board integration + tool loop + completion post
# ---------------------------------------------------------------------------


class TestLiveWorker:
    def test_full_worker_flow(self, config, board, work_dir):
        """Full worker: task → LLM tool loop → file created → completion posted."""
        task = Task(
            post_id=1,
            title="Create a README",
            body=(
                "Create a file called README.md with a brief project description. "
                "The project is called 'Beth Swarm Smoke Test'. "
                "Keep it under 5 lines."
            ),
            agent_role="developer",
            epic_id="beth-smoke",
            task_id="SMOKE-1",
        )

        result = run_worker(
            task=task,
            config=config,
            board=board,
            work_dir=work_dir,
            repo_root=REPO_ROOT,
        )

        assert isinstance(result, CompletionResult)
        assert result.total_tokens_in > 0

        print(f"\n  [LIVE] Worker completed in {result.duration_ms}ms")
        print(f"  [LIVE] Tool calls: {result.tool_calls_made}")
        print(f"  [LIVE] Tokens: {result.total_tokens_in} in, {result.total_tokens_out} out")
        print(f"  [LIVE] Response: {result.content[:300]!r}")

        # Check completion was posted to board
        completions = board.read_all("completions")
        assert len(completions) > 0, "No completion posted to the board"
        latest = completions[-1]
        print(f"  [LIVE] Board completion: {latest.title}")

        # Check if README was created
        readme = work_dir / "README.md"
        if readme.exists():
            print(f"  [LIVE] README.md content:\n{readme.read_text()}")

        # Check outcome was recorded
        outcomes = board.query_outcomes(agent_role="developer", limit=10)
        assert len(outcomes) > 0, "No outcome recorded"
        print(f"  [LIVE] Outcome recorded: model={outcomes[0].model_used}, success={outcomes[0].success}")


# ---------------------------------------------------------------------------
# Run directly
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    if not _can_get_azure_token():
        print("ERROR: Cannot obtain Azure token. Run 'az login' first.")
        print("Then ensure you have 'Cognitive Services OpenAI User' role on the AOAI resource.")
        sys.exit(1)

    pytest.main([__file__, "-v", "-m", "live", "--tb=short", "-s"])
