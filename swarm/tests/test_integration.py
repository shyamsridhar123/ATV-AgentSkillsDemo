"""Integration test — AC #8: Developer agent creates file via board task, posts completion.

This test simulates the complete Phase 1 flow:
  1. A task is posted to the board's tasks channel
  2. The developer worker picks it up
  3. The LLM (mocked) decides to create a file
  4. The worker creates the file, posts structured completion
  5. The completion has all required metadata

This covers all 8 acceptance criteria in a single end-to-end flow.
"""

import json
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from swarm.agents import load_agent, parse_agent_file
from swarm.board import MessageBoard
from swarm.config import ModelRouting, ModelTier, ProviderConfig, SwarmConfig
from swarm.skills import get_auto_inject_skills, load_injected_skills
from swarm.tools import TOOL_DEFINITIONS
from swarm.worker import Task, run_worker


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_tool_call(call_id, name, arguments):
    return SimpleNamespace(
        id=call_id, type="function",
        function=SimpleNamespace(name=name, arguments=json.dumps(arguments)),
    )


def _make_response(content=None, finish_reason="stop", tool_calls=None, tokens_in=100, tokens_out=50):
    msg = SimpleNamespace(content=content, tool_calls=tool_calls)
    return SimpleNamespace(
        choices=[SimpleNamespace(finish_reason=finish_reason, message=msg)],
        usage=SimpleNamespace(prompt_tokens=tokens_in, completion_tokens=tokens_out),
    )


# ---------------------------------------------------------------------------
# The milestone integration test
# ---------------------------------------------------------------------------

REPO_ROOT = Path(__file__).resolve().parents[2]
AGENTS_DIR = REPO_ROOT / ".github" / "agents"


class TestPhase1Integration:
    """AC #8: developer agent creates file via board task and posts completion
    without human intervention."""

    @pytest.mark.skipif(
        not (AGENTS_DIR / "developer.agent.md").exists(),
        reason="Real agent files not available",
    )
    @patch("swarm.worker.create_client")
    def test_developer_creates_file_and_posts_completion(self, mock_create_client):
        """End-to-end: task → worker → file created → completion posted."""
        board = MessageBoard(":memory:")
        work_dir = Path("/tmp/beth-integration-test")
        work_dir.mkdir(exist_ok=True)

        try:
            # Clean up any previous test artifacts
            for f in work_dir.iterdir():
                if f.is_file():
                    f.unlink()

            # --- Setup: Mock LLM to create an Express server ---
            mock_client = MagicMock()
            mock_create_client.return_value = mock_client

            express_code = (
                'import express from "express";\n\n'
                "const app = express();\n\n"
                'app.get("/", (req, res) => {\n'
                '  res.send("Hello World!");\n'
                "});\n\n"
                "app.listen(3000, () => {\n"
                '  console.log("Server running on port 3000");\n'
                "});\n"
            )

            # LLM response 1: write the file
            write_response = _make_response(
                content=None, finish_reason="tool_calls",
                tool_calls=[_make_tool_call("c1", "write_file", {
                    "path": "src/server.ts",
                    "content": express_code,
                })],
            )

            # LLM response 2: post completion to board
            completion_response = _make_response(
                content=None, finish_reason="tool_calls",
                tool_calls=[_make_tool_call("c2", "post_message", {
                    "channel": "completions",
                    "body": "Created Express server at src/server.ts",
                    "title": "Hello World Express server complete",
                    "metadata": {
                        "files_changed": ["src/server.ts"],
                        "task_id": "BETH-INTEG-1",
                    },
                })],
            )

            # LLM response 3: final summary
            final_response = _make_response(
                content="Created a Hello World Express server in src/server.ts. "
                "The server listens on port 3000 and responds to GET / with 'Hello World!'."
            )

            mock_client.chat.completions.create.side_effect = [
                write_response, completion_response, final_response,
            ]

            # --- AC #1: Agent correctly parses developer.agent.md ---
            agent = load_agent("developer", AGENTS_DIR)
            assert agent.name == "developer"
            assert len(agent.body) > 100
            assert len(agent.tools) > 0

            # --- AC #2: Agent loads skills when referenced ---
            skills = get_auto_inject_skills("developer")
            assert ".github/skills/vercel-react-best-practices/SKILL.md" in skills
            skills_content = load_injected_skills("developer", REPO_ROOT)
            assert len(skills_content) > 100

            # --- AC #3: All 9 tools are defined ---
            tool_names = {t["function"]["name"] for t in TOOL_DEFINITIONS}
            assert tool_names == {
                "read_file", "write_file", "edit_file", "run_command",
                "list_directory", "search_files", "post_message",
                "read_messages", "load_skill",
            }

            # --- AC #7: Skill enforcement map ---
            from swarm.skills import SKILL_ENFORCEMENT
            assert "developer" in SKILL_ENFORCEMENT
            assert "ux-designer" in SKILL_ENFORCEMENT
            assert len(SKILL_ENFORCEMENT) == 6

            # --- Post task to board (simulating Beth dispatching) ---
            task_post_id = board.post(
                channel="tasks",
                agent_id="beth",
                body="Create a hello world Express server in src/server.ts",
                title="Create Hello World Express Server",
                metadata={
                    "agent_role": "developer",
                    "epic_id": "beth-integ",
                    "task_id": "BETH-INTEG-1",
                },
            )

            # --- Run the worker (AC #6: tool-use loop) ---
            config = SwarmConfig(
                primary_provider=ProviderConfig(
                    name="azure",
                    endpoint="https://test.openai.azure.com",
                    api_key="test-key",
                ),
                model_routing=ModelRouting(
                    standard=ModelTier(deployment="gpt-4o-mini"),
                ),
            )

            task = Task(
                post_id=task_post_id,
                title="Create Hello World Express Server",
                body="Create a hello world Express server in src/server.ts",
                agent_role="developer",
                epic_id="beth-integ",
                task_id="BETH-INTEG-1",
            )

            result = run_worker(
                task=task,
                config=config,
                board=board,
                work_dir=work_dir,
                repo_root=REPO_ROOT,
            )

            # --- Verify: File was created (AC #4: sandboxed to work_dir) ---
            server_file = work_dir / "src" / "server.ts"
            assert server_file.exists(), "src/server.ts was not created"
            content = server_file.read_text()
            assert "express" in content.lower()
            assert "Hello World" in content
            assert "3000" in content

            # --- Verify: Completion posted to board (AC #5) ---
            completions = board.read_all("completions")
            # Worker posts its own completion, plus the LLM posted one via tool
            assert len(completions) >= 1

            # Find the worker's structured completion (has full metadata)
            worker_completion = None
            for c in completions:
                if c.metadata and "tokens_in" in c.metadata:
                    worker_completion = c
                    break

            assert worker_completion is not None, "Worker did not post structured completion"
            assert worker_completion.agent_id == "developer"
            meta = worker_completion.metadata
            assert meta["task_id"] == "BETH-INTEG-1"
            assert meta["epic_id"] == "beth-integ"
            assert "files_changed" in meta
            assert meta["tool_calls"] >= 2
            assert meta["model_used"] == "gpt-4o-mini"
            assert meta["tokens_in"] > 0
            assert meta["tokens_out"] > 0

            # --- Verify: Outcome recorded for model routing ---
            outcomes = board.query_outcomes(agent_role="developer")
            assert len(outcomes) >= 1
            assert outcomes[0].success is True

            # --- AC #6: Tool-use loop ran correctly ---
            assert result.tool_calls_made >= 2  # write_file + post_message
            assert result.content != ""

        finally:
            # Cleanup
            import shutil
            if work_dir.exists():
                shutil.rmtree(work_dir, ignore_errors=True)
            board.close()

    @pytest.mark.skipif(
        not (AGENTS_DIR / "developer.agent.md").exists(),
        reason="Real agent files not available",
    )
    def test_all_seven_agents_parseable(self):
        """Verify all 7 agent files parse correctly."""
        agent_names = [
            "beth", "developer", "product-manager", "researcher",
            "security-reviewer", "tester", "ux-designer",
        ]
        for name in agent_names:
            path = AGENTS_DIR / f"{name}.agent.md"
            if path.exists():
                agent = load_agent(name, AGENTS_DIR)
                assert agent.name.lower() == name.lower(), (
                    f"Agent {name} has wrong name: {agent.name}"
                )
                assert len(agent.body) > 50, f"Agent {name} has suspiciously short body"
