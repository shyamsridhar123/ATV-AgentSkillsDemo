/**
 * Agent Router
 *
 * Routes user requests to the appropriate agent based on:
 * 1. Explicit @agent mentions in user input
 * 2. Active handoff targets from the current agent
 * 3. Skill trigger matching
 * 4. Default to the orchestrator (Beth)
 *
 * Also provides agent lookup utilities for the orchestrator.
 */

import type { AgentDefinition, AgentLoadResult } from './agents/types.js';
import type { SkillDefinition, TriggerMap, SkillLoadResult } from './skills/types.js';
import { findMatchingSkills, buildTriggerMap } from './skills/loader.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Result of routing a user request.
 */
export interface RouteResult {
  /** The agent that should handle this request */
  agent: AgentDefinition;

  /** How the agent was selected */
  reason: RouteReason;

  /** Skills that should be injected for this request */
  matchedSkills: SkillDefinition[];

  /** If routed via @mention, the cleaned prompt without the @mention */
  cleanedPrompt?: string;
}

/**
 * Why a particular agent was selected.
 */
export type RouteReason =
  | 'mention'       // User explicitly @mentioned the agent
  | 'handoff'       // Handoff from current agent
  | 'skill-match'   // Agent matched via skill triggers
  | 'default';      // Fell through to default orchestrator

// =============================================================================
// AgentRouter
// =============================================================================

/**
 * Routes requests to the appropriate agent.
 *
 * @example
 * ```typescript
 * const router = new AgentRouter(agentLoadResult, skillLoadResult, 'beth');
 *
 * const result = router.route('@developer implement login page');
 * // result.agent.id === 'developer'
 * // result.reason === 'mention'
 * // result.cleanedPrompt === 'implement login page'
 *
 * const result2 = router.route('create a prd for auth');
 * // result2.matchedSkills contains the PRD skill
 * ```
 */
export class AgentRouter {
  /** Map of agent ID → agent definition */
  private readonly agents: Map<string, AgentDefinition>;

  /** Map of agent name (lowercase) → agent ID for lookup */
  private readonly nameToId: Map<string, string>;

  /** Skill trigger map for matching */
  private readonly triggerMap: TriggerMap;

  /** Default agent ID (typically 'beth') */
  private readonly defaultAgentId: string;

  constructor(
    agentResult: AgentLoadResult,
    skillResult: SkillLoadResult,
    defaultAgentId: string = 'beth'
  ) {
    this.agents = new Map();
    this.nameToId = new Map();
    this.defaultAgentId = defaultAgentId;

    for (const agent of agentResult.agents) {
      this.agents.set(agent.id, agent);
      // Map both ID and name for flexible lookup
      this.nameToId.set(agent.id.toLowerCase(), agent.id);
      if (agent.frontmatter.name) {
        this.nameToId.set(agent.frontmatter.name.toLowerCase(), agent.id);
      }
    }

    this.triggerMap = buildTriggerMap(skillResult);
  }

  // ===========================================================================
  // Routing
  // ===========================================================================

  /**
   * Route a user message to the appropriate agent.
   *
   * @param userMessage - The user's input text
   * @param currentAgentId - The currently active agent (for handoff context)
   * @returns Routing result with selected agent and matched skills
   */
  route(userMessage: string, currentAgentId?: string): RouteResult {
    // 1. Check for explicit @mention
    const mentionResult = this.checkMention(userMessage);
    if (mentionResult) {
      return {
        ...mentionResult,
        matchedSkills: this.findSkills(mentionResult.cleanedPrompt ?? userMessage),
      };
    }

    // 2. Find matching skills
    const matchedSkills = this.findSkills(userMessage);

    // 3. Use current agent if one is active (stay in context)
    if (currentAgentId) {
      const currentAgent = this.agents.get(currentAgentId);
      if (currentAgent) {
        return {
          agent: currentAgent,
          reason: 'default',
          matchedSkills,
        };
      }
    }

    // 4. Default to orchestrator
    const defaultAgent = this.getDefaultAgent();
    return {
      agent: defaultAgent,
      reason: 'default',
      matchedSkills,
    };
  }

  /**
   * Route directly to a specific agent by ID or name.
   *
   * @param agentIdOrName - Agent ID or display name
   * @returns The agent definition, or undefined if not found
   */
  resolveAgent(agentIdOrName: string): AgentDefinition | undefined {
    // Try direct ID lookup first
    const direct = this.agents.get(agentIdOrName);
    if (direct) return direct;

    // Try name-based lookup (case-insensitive)
    const id = this.nameToId.get(agentIdOrName.toLowerCase());
    if (id) return this.agents.get(id);

    return undefined;
  }

  /**
   * Get all registered agents.
   */
  getAgents(): AgentDefinition[] {
    return [...this.agents.values()];
  }

  /**
   * Get agents that can be invoked as subagents (infer: true).
   */
  getInferableAgents(): AgentDefinition[] {
    return [...this.agents.values()].filter((a) => a.frontmatter.infer === true);
  }

  /**
   * Get the default orchestrator agent.
   */
  getDefaultAgent(): AgentDefinition {
    const agent = this.agents.get(this.defaultAgentId);
    if (!agent) {
      // Fallback: return the first agent
      const first = this.agents.values().next().value;
      if (!first) {
        throw new Error('No agents loaded — cannot route requests');
      }
      return first;
    }
    return agent;
  }

  /**
   * Check if a specific agent is registered.
   */
  hasAgent(agentIdOrName: string): boolean {
    return this.resolveAgent(agentIdOrName) !== undefined;
  }

  // ===========================================================================
  // Internal Routing Logic
  // ===========================================================================

  /**
   * Check for @agent mention in user input.
   *
   * Matches patterns like:
   * - "@developer implement the login page"
   * - "@product-manager create a PRD"
   * - "@Beth plan a feature"
   */
  private checkMention(
    userMessage: string
  ): { agent: AgentDefinition; reason: 'mention'; cleanedPrompt: string } | null {
    const mentionMatch = userMessage.match(/^@(\S+)\s*(.*)/s);
    if (!mentionMatch) return null;

    const mentionName = mentionMatch[1];
    const restOfMessage = mentionMatch[2].trim();

    const agent = this.resolveAgent(mentionName);
    if (!agent) return null;

    return {
      agent,
      reason: 'mention',
      cleanedPrompt: restOfMessage || userMessage,
    };
  }

  /**
   * Find skills whose triggers match the user message.
   */
  private findSkills(userMessage: string): SkillDefinition[] {
    return findMatchingSkills(userMessage, this.triggerMap);
  }
}
