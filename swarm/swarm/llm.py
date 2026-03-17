"""LLM client wrapper — Azure OpenAI with tool-use loop and provider failover.

Implements the agent_loop: chat → tool_calls → execute → loop until stop.
Provider-abstracted: same ``openai`` package connects to Azure OpenAI,
OpenAI direct, or any compatible endpoint via ``base_url``.
"""

from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from openai import APIStatusError, AzureOpenAI, OpenAI

from .board import MessageBoard
from .config import ProviderConfig, SwarmConfig
from .tools import TOOL_DEFINITIONS, execute_tool

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Client factory
# ---------------------------------------------------------------------------


def create_client(provider: ProviderConfig) -> AzureOpenAI | OpenAI:
    """Create an OpenAI client from provider config.

    Returns ``AzureOpenAI`` for ``name="azure"``, ``OpenAI`` for
    ``name="openai"`` (or any compatible endpoint).
    """
    if provider.name == "azure":
        return AzureOpenAI(
            azure_endpoint=provider.endpoint,
            api_key=provider.api_key,
            api_version=provider.api_version,
        )
    else:
        return OpenAI(
            base_url=provider.endpoint or None,
            api_key=provider.api_key,
        )


# ---------------------------------------------------------------------------
# Provider failover
# ---------------------------------------------------------------------------

_RETRIABLE_STATUS_CODES = {429, 500, 502, 503}


def completions_with_failover(
    *,
    config: SwarmConfig,
    deployment: str,
    messages: list[dict[str, Any]],
    tools: list[dict[str, Any]] | None = None,
    max_tokens: int = 4096,
    retries: int = 2,
    backoff_base: float = 1.0,
) -> Any:
    """Call chat.completions.create with automatic retry + fallback provider.

    On retriable errors (429, 500, 502, 503), retries up to ``retries`` times
    with exponential backoff.  If all retries exhaust on the primary, falls
    through to ``config.fallback_provider`` (if configured).

    Workers never know which provider served the request — the failover is
    transparent.

    Returns the raw ``ChatCompletion`` response.
    """
    providers = [config.primary_provider]
    if config.fallback_provider:
        providers.append(config.fallback_provider)

    last_error: Exception | None = None

    for provider in providers:
        client = create_client(provider)
        for attempt in range(retries + 1):
            try:
                return client.chat.completions.create(
                    model=deployment,
                    messages=messages,
                    tools=tools if tools else None,
                    tool_choice="auto" if tools else None,
                    max_tokens=max_tokens,
                )
            except APIStatusError as exc:
                last_error = exc
                if exc.status_code in _RETRIABLE_STATUS_CODES and attempt < retries:
                    delay = backoff_base * (2 ** attempt)
                    logger.warning(
                        "LLM %d from %s (attempt %d/%d) — retrying in %.1fs",
                        exc.status_code, provider.name, attempt + 1, retries + 1, delay,
                    )
                    time.sleep(delay)
                elif exc.status_code in _RETRIABLE_STATUS_CODES:
                    logger.warning(
                        "LLM %d from %s — exhausted retries, trying next provider",
                        exc.status_code, provider.name,
                    )
                    break  # Try next provider
                else:
                    raise  # Non-retriable (400, 401, 404, etc.) — bubble up

    # All providers exhausted
    raise last_error  # type: ignore[misc]


# ---------------------------------------------------------------------------
# Completion result
# ---------------------------------------------------------------------------


@dataclass
class CompletionResult:
    """Result from a complete agent_loop run."""

    content: str  # Final assistant message content
    total_tokens_in: int = 0
    total_tokens_out: int = 0
    tool_calls_made: int = 0
    duration_ms: int = 0
    model_used: str = ""


# ---------------------------------------------------------------------------
# Tool-use loop
# ---------------------------------------------------------------------------


def agent_loop(
    *,
    client: AzureOpenAI | OpenAI,
    deployment: str,
    system_prompt: str,
    user_message: str,
    tools: list[dict[str, Any]] | None = None,
    work_dir: Path,
    board: MessageBoard,
    agent_id: str,
    repo_root: Path,
    max_iterations: int = 50,
    max_tokens: int = 4096,
    config: SwarmConfig | None = None,
) -> CompletionResult:
    """Run the tool-use agent loop until the model produces a final response.

    Implements: chat → tool_calls → execute → loop until ``finish_reason == "stop"``.

    When *config* is provided, uses :func:`completions_with_failover` for
    transparent provider failover.  Otherwise falls back to the direct
    *client* (backward-compatible).

    Parameters
    ----------
    client : AzureOpenAI | OpenAI
        The LLM client (used when *config* is None).
    deployment : str
        Model deployment name (e.g. ``"gpt-4o"``).
    system_prompt : str
        The agent's system prompt (personality + skills).
    user_message : str
        The task prompt (what the agent should do).
    tools : list[dict] | None
        Tool definitions. Defaults to ``TOOL_DEFINITIONS``.
    work_dir : Path
        Working directory for tool execution (sandbox root).
    board : MessageBoard
        Message board for post/read tools.
    agent_id : str
        Agent identifier.
    repo_root : Path
        Repo root for skill file loading.
    max_iterations : int
        Safety limit on tool-use loops.
    max_tokens : int
        Max tokens for model generation.
    """
    if tools is None:
        tools = TOOL_DEFINITIONS

    messages: list[dict[str, Any]] = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]

    total_in = 0
    total_out = 0
    tool_calls_count = 0
    start = time.monotonic()

    for iteration in range(max_iterations):
        logger.debug(
            "agent_loop iteration %d/%d (agent=%s, model=%s)",
            iteration + 1, max_iterations, agent_id, deployment,
        )

        if config is not None:
            response = completions_with_failover(
                config=config,
                deployment=deployment,
                messages=messages,
                tools=tools if tools else None,
                max_tokens=max_tokens,
            )
        else:
            response = client.chat.completions.create(
                model=deployment,
                messages=messages,
                tools=tools if tools else None,
                tool_choice="auto" if tools else None,
                max_tokens=max_tokens,
            )

        # Track token usage
        if response.usage:
            total_in += response.usage.prompt_tokens
            total_out += response.usage.completion_tokens

        choice = response.choices[0]
        message = choice.message

        # Model done — return final content
        if choice.finish_reason == "stop" or not message.tool_calls:
            elapsed = int((time.monotonic() - start) * 1000)
            return CompletionResult(
                content=message.content or "",
                total_tokens_in=total_in,
                total_tokens_out=total_out,
                tool_calls_made=tool_calls_count,
                duration_ms=elapsed,
                model_used=deployment,
            )

        # Model wants to call tools
        # Append the assistant message (with tool_calls) to conversation
        messages.append(_message_to_dict(message))

        for tool_call in message.tool_calls:
            tool_calls_count += 1
            logger.debug(
                "Tool call #%d: %s(%s)",
                tool_calls_count,
                tool_call.function.name,
                tool_call.function.arguments[:200],
            )

            result = execute_tool(
                name=tool_call.function.name,
                arguments=tool_call.function.arguments,
                work_dir=work_dir,
                board=board,
                agent_id=agent_id,
                repo_root=repo_root,
            )

            messages.append({
                "role": "tool",
                "tool_call_id": tool_call.id,
                "content": result,
            })

    # Exhausted iterations — return whatever we have
    elapsed = int((time.monotonic() - start) * 1000)
    logger.warning("agent_loop exhausted %d iterations for agent %s", max_iterations, agent_id)
    return CompletionResult(
        content="[Agent exhausted maximum iterations without completing]",
        total_tokens_in=total_in,
        total_tokens_out=total_out,
        tool_calls_made=tool_calls_count,
        duration_ms=elapsed,
        model_used=deployment,
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _message_to_dict(message: ChatCompletionMessage) -> dict[str, Any]:
    """Convert a ChatCompletionMessage to a dict for the messages list."""
    d: dict[str, Any] = {"role": "assistant"}
    if message.content:
        d["content"] = message.content
    if message.tool_calls:
        d["tool_calls"] = [
            {
                "id": tc.id,
                "type": "function",
                "function": {
                    "name": tc.function.name,
                    "arguments": tc.function.arguments,
                },
            }
            for tc in message.tool_calls
        ]
    return d
