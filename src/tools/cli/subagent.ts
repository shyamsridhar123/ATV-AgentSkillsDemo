/**
 * Subagent Tool
 *
 * Spawns a new agent conversation by preparing a subagent invocation request.
 *
 * **This is intentionally a stub/placeholder.** The actual agent conversation
 * loop requires the orchestrator (Phase 4). For now, `execute` validates input
 * and returns a ToolResult with `status: 'pending'` metadata. The orchestrator
 * will inspect tool results using `isSubagentRequest()` and handle the real
 * invocation.
 *
 * @example
 * ```typescript
 * const result = await subagentTool.execute(
 *   { agentName: 'developer', prompt: 'Implement the login page', description: 'Login UI' },
 *   context,
 * );
 * if (isSubagentRequest(result)) {
 *   // Phase 4 orchestrator handles this
 * }
 * ```
 */

import type { Tool } from '../interface.js';
import type { ToolContext, ToolInputSchema, ToolResult } from '../types.js';
import { ToolError } from '../types.js';

/** Metadata shape for a pending subagent request */
interface SubagentMetadata {
  agentName: string;
  prompt: string;
  description: string | undefined;
  status: 'pending';
}

/** Input schema for the subagent tool */
const inputSchema: ToolInputSchema = {
  type: 'object',
  properties: {
    agentName: {
      type: 'string',
      description: 'Name of the agent to invoke (e.g., "developer", "tester")',
    },
    prompt: {
      type: 'string',
      description: 'The task prompt to send to the subagent',
    },
    description: {
      type: 'string',
      description: 'Short description of the task (optional)',
    },
  },
  required: ['agentName', 'prompt'],
};

/**
 * Check whether a ToolResult represents a pending subagent invocation.
 *
 * Used by the orchestrator (Phase 4) to detect subagent requests in
 * tool execution results and route them to the appropriate agent.
 *
 * @param result - A ToolResult to inspect
 * @returns true if the result contains a pending subagent request
 */
export function isSubagentRequest(result: ToolResult): boolean {
  return (
    result.success === true &&
    result.metadata !== undefined &&
    result.metadata.status === 'pending' &&
    typeof result.metadata.agentName === 'string' &&
    typeof result.metadata.prompt === 'string'
  );
}

/**
 * Subagent tool implementation.
 *
 * **Stub for Phase 3** — validates input and returns a pending subagent request.
 * The Phase 4 orchestrator will call this tool, detect the pending result via
 * `isSubagentRequest()`, and execute the actual agent conversation.
 */
export const subagentTool: Tool = {
  name: 'subagent',
  description: 'Spawn a subagent to perform a task. Returns a pending request for the orchestrator.',
  inputSchema,

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    // Check permission — subagent calls use LLM API (network)
    if (!context.permissions.allowNetwork) {
      throw new ToolError('Network permission denied', 'PERMISSION_DENIED', 'subagent');
    }

    // Validate agentName
    const agentName = input.agentName;
    if (typeof agentName !== 'string' || agentName.trim().length === 0) {
      throw new ToolError('agentName is required and must be a non-empty string', 'INVALID_INPUT', 'subagent');
    }

    // Validate prompt
    const prompt = input.prompt;
    if (typeof prompt !== 'string' || prompt.trim().length === 0) {
      throw new ToolError('prompt is required and must be a non-empty string', 'INVALID_INPUT', 'subagent');
    }

    const description = typeof input.description === 'string' ? input.description : undefined;

    const metadata: Record<string, unknown> = {
      agentName: agentName.trim(),
      prompt: prompt.trim(),
      description,
      status: 'pending',
    } satisfies SubagentMetadata;

    return {
      success: true,
      output: `Subagent request prepared: ${agentName} — ${description ?? 'no description'}`,
      metadata,
    };
  },
};
