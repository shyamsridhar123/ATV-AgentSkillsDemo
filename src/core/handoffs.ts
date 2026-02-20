/**
 * Handoff Manager
 *
 * Manages agent-to-agent transfers, including:
 * - Interactive handoffs (user reviews before transfer)
 * - Autonomous handoffs (subagent spawning — orchestrator decides)
 * - Context transfer (conversation summary passed to new agent)
 * - Handoff history tracking
 *
 * Handoffs are defined in agent frontmatter:
 * ```yaml
 * handoffs:
 *   - label: "Development"
 *     agent: developer
 *     prompt: "Implement this feature"
 *     send: true  # auto-send vs. prepare for review
 * ```
 */

import type { AgentDefinition, AgentHandoff } from './agents/types.js';
import type { ConversationContext, ConversationSummary } from './context.js';
import { AgentRouter } from './router.js';

// =============================================================================
// Types
// =============================================================================

/**
 * A handoff request — the intent to transfer from one agent to another.
 */
export interface HandoffRequest {
  /** Source agent initiating the handoff */
  fromAgentId: string;

  /** Target agent receiving the handoff */
  toAgentId: string;

  /** The prompt/message to send to the target agent */
  prompt: string;

  /** Label for this handoff (from agent definition) */
  label: string;

  /** Whether to auto-send or wait for user review */
  autoSend: boolean;

  /** Summary of the conversation being handed off */
  conversationSummary?: ConversationSummary;
}

/**
 * The result of executing a handoff.
 */
export interface HandoffResult {
  /** Whether the handoff was executed */
  executed: boolean;

  /** The target agent (resolved) */
  targetAgent?: AgentDefinition;

  /** Reason if handoff was not executed */
  reason?: string;

  /** The handoff request that was processed */
  request: HandoffRequest;
}

/**
 * Record of a completed handoff, for history tracking.
 */
export interface HandoffRecord {
  /** Handoff request */
  request: HandoffRequest;

  /** When the handoff occurred */
  timestamp: number;

  /** Whether it was executed */
  executed: boolean;
}

/**
 * Mode for handoff execution.
 */
export type HandoffMode = 'interactive' | 'autonomous';

// =============================================================================
// HandoffManager
// =============================================================================

/**
 * Manages agent handoffs and context transfer.
 *
 * @example
 * ```typescript
 * const manager = new HandoffManager(router);
 *
 * // Get available handoffs for the current agent
 * const available = manager.getAvailableHandoffs(bethAgent);
 *
 * // Prepare a handoff
 * const request = manager.prepareHandoff(bethAgent, 'developer', 'Implement login');
 *
 * // Execute the handoff
 * const result = manager.executeHandoff(request, currentContext);
 * ```
 */
export class HandoffManager {
  /** Router for resolving agent references */
  private readonly router: AgentRouter;

  /** History of handoffs in this session */
  private readonly history: HandoffRecord[] = [];

  /** Maximum depth of handoff chains to prevent infinite loops */
  private readonly maxDepth: number;

  constructor(router: AgentRouter, options?: { maxDepth?: number }) {
    this.router = router;
    this.maxDepth = options?.maxDepth ?? 10;
  }

  // ===========================================================================
  // Handoff Discovery
  // ===========================================================================

  /**
   * Get the handoff definitions available from an agent.
   */
  getAvailableHandoffs(agent: AgentDefinition): AgentHandoff[] {
    return agent.frontmatter.handoffs ?? [];
  }

  /**
   * Find a handoff definition by target agent name.
   */
  findHandoff(agent: AgentDefinition, targetAgentId: string): AgentHandoff | undefined {
    const handoffs = this.getAvailableHandoffs(agent);
    return handoffs.find(
      (h) => h.agent.toLowerCase() === targetAgentId.toLowerCase()
    );
  }

  // ===========================================================================
  // Handoff Preparation
  // ===========================================================================

  /**
   * Prepare a handoff request from the current agent to a target.
   *
   * @param fromAgent - The agent initiating the handoff
   * @param toAgentId - The target agent's ID or name
   * @param prompt - The message to send (overrides handoff default)
   * @param context - Optional conversation context for summary
   * @returns The prepared handoff request, or null if the target agent isn't found
   */
  prepareHandoff(
    fromAgent: AgentDefinition,
    toAgentId: string,
    prompt?: string,
    context?: ConversationContext
  ): HandoffRequest | null {
    // Resolve the target agent
    const targetAgent = this.router.resolveAgent(toAgentId);
    if (!targetAgent) {
      return null;
    }

    // Look up the handoff definition for defaults
    const handoffDef = this.findHandoff(fromAgent, toAgentId);

    const request: HandoffRequest = {
      fromAgentId: fromAgent.id,
      toAgentId: targetAgent.id,
      prompt: prompt ?? handoffDef?.prompt ?? '',
      label: handoffDef?.label ?? `Handoff to ${targetAgent.frontmatter.name}`,
      autoSend: handoffDef?.send ?? false,
      conversationSummary: context?.getSummary(),
    };

    return request;
  }

  // ===========================================================================
  // Handoff Execution
  // ===========================================================================

  /**
   * Execute a handoff — validate and prepare the transfer.
   *
   * The actual agent switch happens in the orchestrator. This method
   * validates the handoff, checks depth limits, and records it.
   *
   * @param request - The handoff request to execute
   * @returns The handoff result
   */
  executeHandoff(request: HandoffRequest): HandoffResult {
    // Check depth limit to prevent infinite handoff chains
    if (this.isDepthExceeded(request.toAgentId)) {
      const result: HandoffResult = {
        executed: false,
        reason: `Handoff depth limit (${this.maxDepth}) exceeded — possible loop detected`,
        request,
      };
      this.recordHandoff(request, false);
      return result;
    }

    // Resolve the target agent
    const targetAgent = this.router.resolveAgent(request.toAgentId);
    if (!targetAgent) {
      const result: HandoffResult = {
        executed: false,
        reason: `Agent "${request.toAgentId}" not found`,
        request,
      };
      this.recordHandoff(request, false);
      return result;
    }

    // Record and succeed
    this.recordHandoff(request, true);

    return {
      executed: true,
      targetAgent,
      request,
    };
  }

  // ===========================================================================
  // Context Transfer
  // ===========================================================================

  /**
   * Build the context injection string for the target agent.
   *
   * Creates a summary of the previous conversation that gets injected
   * into the new agent's system prompt.
   */
  buildHandoffContext(request: HandoffRequest): string {
    const parts: string[] = [];

    parts.push(`## Handoff from ${request.fromAgentId}`);
    parts.push(`**Reason:** ${request.label}`);

    if (request.conversationSummary) {
      const summary = request.conversationSummary;
      parts.push(`**Previous conversation** (${summary.turnCount} turns with ${summary.agentId}):`);
      parts.push(summary.summary);

      if (summary.toolCallSummary.length > 0) {
        parts.push(`**Tools used:** ${summary.toolCallSummary.join(', ')}`);
      }
    }

    if (request.prompt) {
      parts.push(`\n**Task:** ${request.prompt}`);
    }

    return parts.join('\n');
  }

  // ===========================================================================
  // History & Safety
  // ===========================================================================

  /**
   * Get the handoff history for this session.
   */
  getHistory(): HandoffRecord[] {
    return [...this.history];
  }

  /**
   * Get the current handoff chain depth for a target agent.
   * Counts consecutive handoffs in recent history.
   */
  getDepth(): number {
    return this.history.filter((h) => h.executed).length;
  }

  /**
   * Clear handoff history (e.g., when starting a new conversation).
   */
  clearHistory(): void {
    this.history.length = 0;
  }

  /**
   * Check if handing off to a specific agent would exceed the depth limit.
   */
  private isDepthExceeded(_targetAgentId: string): boolean {
    const executedCount = this.history.filter((h) => h.executed).length;

    if (executedCount >= this.maxDepth) {
      return true;
    }

    // Also check for direct ping-pong loops (A→B→A→B...)
    const recentExecuted = this.history
      .filter((h) => h.executed)
      .slice(-4);

    if (recentExecuted.length >= 4) {
      const pattern = recentExecuted.map((h) => h.request.toAgentId);
      // Check for A-B-A-B pattern
      if (
        pattern[0] === pattern[2] &&
        pattern[1] === pattern[3] &&
        pattern[0] !== pattern[1]
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Record a handoff in history.
   */
  private recordHandoff(request: HandoffRequest, executed: boolean): void {
    this.history.push({
      request,
      timestamp: Date.now(),
      executed,
    });
  }
}
