/**
 * Conversation Context Manager
 *
 * Manages conversation state for agent interactions:
 * - Message history with role tracking
 * - Context window management (token estimation + truncation)
 * - System prompt construction from agent definitions + skills
 * - Skill injection when trigger phrases match user input
 *
 * Each agent session gets its own ConversationContext. When handoffs occur,
 * a summary can be extracted and injected into the new agent's context.
 */

import type { ChatMessage } from '../providers/types.js';
import type { AgentDefinition } from './agents/types.js';
import type { SkillDefinition } from './skills/types.js';

// =============================================================================
// Configuration
// =============================================================================

/** Default context window size in estimated tokens */
const DEFAULT_MAX_TOKENS = 128_000;

/** Reserve tokens for the model's response */
const DEFAULT_RESPONSE_RESERVE = 4_096;

/** Approximate characters per token (GPT-family heuristic) */
const CHARS_PER_TOKEN = 4;

// =============================================================================
// Types
// =============================================================================

/**
 * Options for creating a ConversationContext.
 */
export interface ConversationContextOptions {
  /** Maximum tokens for the context window (default: 128000) */
  maxTokens?: number;

  /** Tokens reserved for the model's response (default: 4096) */
  responseReserve?: number;

  /** Initial conversation history to restore (e.g., from a handoff) */
  initialMessages?: ChatMessage[];
}

/**
 * Summary of a conversation for handoff purposes.
 */
export interface ConversationSummary {
  /** The agent that was running this conversation */
  agentId: string;

  /** Key points from the conversation */
  summary: string;

  /** Number of turns in the original conversation */
  turnCount: number;

  /** Any tool calls that were made */
  toolCallSummary: string[];
}

// =============================================================================
// ConversationContext
// =============================================================================

/**
 * Manages conversation state for a single agent session.
 *
 * Handles message accumulation, context window enforcement,
 * and system prompt construction from agent definitions and skills.
 *
 * @example
 * ```typescript
 * const ctx = new ConversationContext(developerAgent);
 * ctx.addUserMessage('Implement the login page');
 *
 * const messages = ctx.getMessages(); // system + user message
 * // Send to LLM...
 *
 * ctx.addAssistantMessage('I\'ll create the login component...');
 * ctx.addAssistantToolCalls([{ id: '1', type: 'function', function: { name: 'editFile', arguments: '...' } }]);
 * ctx.addToolResult('1', 'File updated successfully');
 * ```
 */
export class ConversationContext {
  /** The agent this context belongs to */
  private readonly agent: AgentDefinition;

  /** Conversation messages (excluding system prompt; it's built dynamically) */
  private messages: ChatMessage[] = [];

  /** Skills injected into this context */
  private injectedSkills: Set<string> = new Set();

  /** Skill content appended to system prompt */
  private skillContent: string[] = [];

  /** Context window configuration */
  private readonly maxTokens: number;
  private readonly responseReserve: number;

  /** Custom context additions (handoff summaries, etc.) */
  private additionalContext: string[] = [];

  constructor(agent: AgentDefinition, options?: ConversationContextOptions) {
    this.agent = agent;
    this.maxTokens = options?.maxTokens ?? DEFAULT_MAX_TOKENS;
    this.responseReserve = options?.responseReserve ?? DEFAULT_RESPONSE_RESERVE;

    if (options?.initialMessages) {
      this.messages = [...options.initialMessages];
    }
  }

  // ===========================================================================
  // Message Management
  // ===========================================================================

  /**
   * Add a user message to the conversation.
   */
  addUserMessage(content: string): void {
    this.messages.push({ role: 'user', content });
  }

  /**
   * Add an assistant text response to the conversation.
   */
  addAssistantMessage(content: string): void {
    this.messages.push({ role: 'assistant', content });
  }

  /**
   * Add an assistant message with tool calls.
   */
  addAssistantToolCalls(toolCalls: ChatMessage['tool_calls'], content?: string): void {
    this.messages.push({
      role: 'assistant',
      content: content ?? '',
      tool_calls: toolCalls,
    });
  }

  /**
   * Add a tool result message.
   */
  addToolResult(toolCallId: string, result: string): void {
    this.messages.push({
      role: 'tool',
      content: result,
      tool_call_id: toolCallId,
    });
  }

  /**
   * Get the full message array for sending to the LLM.
   * Includes the constructed system prompt as the first message.
   * Applies truncation if context window is exceeded.
   */
  getMessages(): ChatMessage[] {
    const systemPrompt = this.buildSystemPrompt();
    const systemMessage: ChatMessage = { role: 'system', content: systemPrompt };

    const systemTokens = this.estimateTokens(systemPrompt);
    const availableTokens = this.maxTokens - this.responseReserve - systemTokens;

    const truncated = this.truncateMessages(this.messages, availableTokens);

    return [systemMessage, ...truncated];
  }

  /**
   * Get just the conversation messages (without system prompt).
   */
  getRawMessages(): ChatMessage[] {
    return [...this.messages];
  }

  /**
   * Get the number of conversation turns (user messages).
   */
  getTurnCount(): number {
    return this.messages.filter((m) => m.role === 'user').length;
  }

  /**
   * Get estimated token count for the current context.
   */
  getEstimatedTokens(): number {
    const systemPrompt = this.buildSystemPrompt();
    const systemTokens = this.estimateTokens(systemPrompt);
    const messageTokens = this.messages.reduce(
      (sum, m) => sum + this.estimateMessageTokens(m),
      0
    );
    return systemTokens + messageTokens;
  }

  /**
   * Clear the conversation history, keeping injected skills.
   */
  clearHistory(): void {
    this.messages = [];
  }

  // ===========================================================================
  // Skill Injection
  // ===========================================================================

  /**
   * Inject a skill's content into the system prompt.
   * Each skill is only injected once per context.
   *
   * @param skill - The skill to inject
   * @returns true if the skill was injected, false if already present
   */
  injectSkill(skill: SkillDefinition): boolean {
    if (this.injectedSkills.has(skill.id)) {
      return false;
    }

    this.injectedSkills.add(skill.id);
    this.skillContent.push(
      `\n\n---\n## Skill: ${skill.frontmatter.name}\n\n${skill.body}`
    );
    return true;
  }

  /**
   * Check if a skill has been injected.
   */
  hasSkill(skillId: string): boolean {
    return this.injectedSkills.has(skillId);
  }

  /**
   * Get the IDs of all injected skills.
   */
  getInjectedSkillIds(): string[] {
    return [...this.injectedSkills];
  }

  // ===========================================================================
  // Context Additions
  // ===========================================================================

  /**
   * Add additional context (e.g., handoff summary from previous agent).
   */
  addContext(context: string): void {
    this.additionalContext.push(context);
  }

  // ===========================================================================
  // Summary / Handoff
  // ===========================================================================

  /**
   * Generate a summary of this conversation for handoff purposes.
   */
  getSummary(): ConversationSummary {
    const toolCallSummary: string[] = [];

    for (const msg of this.messages) {
      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          toolCallSummary.push(`${tc.function.name}(${tc.function.arguments.slice(0, 100)})`);
        }
      }
    }

    // Build summary from the last few assistant messages
    const assistantMessages = this.messages
      .filter((m) => m.role === 'assistant' && m.content.length > 0)
      .slice(-3);

    const summaryText = assistantMessages.length > 0
      ? assistantMessages.map((m) => m.content.slice(0, 200)).join('\n')
      : 'No assistant responses yet.';

    return {
      agentId: this.agent.id,
      summary: summaryText,
      turnCount: this.getTurnCount(),
      toolCallSummary,
    };
  }

  /**
   * Get the agent definition this context belongs to.
   */
  getAgent(): AgentDefinition {
    return this.agent;
  }

  // ===========================================================================
  // System Prompt Construction
  // ===========================================================================

  /**
   * Build the full system prompt from the agent definition + injected content.
   */
  buildSystemPrompt(): string {
    const parts: string[] = [];

    // 1. Agent's body (main system prompt from .agent.md)
    if (this.agent.body) {
      parts.push(this.agent.body);
    }

    // 2. Additional context (handoff summaries, etc.)
    if (this.additionalContext.length > 0) {
      parts.push('\n\n---\n## Additional Context\n');
      parts.push(this.additionalContext.join('\n\n'));
    }

    // 3. Injected skills
    if (this.skillContent.length > 0) {
      parts.push(this.skillContent.join(''));
    }

    return parts.join('\n');
  }

  // ===========================================================================
  // Token Estimation & Truncation
  // ===========================================================================

  /**
   * Estimate token count for a string.
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / CHARS_PER_TOKEN);
  }

  /**
   * Estimate token count for a single message including structure overhead.
   */
  private estimateMessageTokens(message: ChatMessage): number {
    let chars = message.content.length;

    // Role + formatting overhead
    chars += message.role.length + 4;

    if (message.name) {
      chars += message.name.length + 2;
    }

    if (message.tool_call_id) {
      chars += message.tool_call_id.length + 4;
    }

    if (message.tool_calls) {
      for (const tc of message.tool_calls) {
        chars += tc.function.name.length;
        chars += tc.function.arguments.length;
        chars += 20; // Structure overhead
      }
    }

    return Math.ceil(chars / CHARS_PER_TOKEN);
  }

  /**
   * Truncate messages to fit within the token budget.
   *
   * Strategy: Keep the most recent messages. Drop oldest messages first,
   * but never drop tool results that are paired with a tool call in the
   * retained messages (to avoid orphaned tool call references).
   *
   * @param messages - Messages to truncate
   * @param maxTokens - Maximum tokens available
   * @returns Truncated message array
   */
  private truncateMessages(messages: ChatMessage[], maxTokens: number): ChatMessage[] {
    if (maxTokens <= 0) {
      return [];
    }

    // Calculate total tokens
    let totalTokens = 0;
    const tokenCounts = messages.map((m) => {
      const count = this.estimateMessageTokens(m);
      totalTokens += count;
      return count;
    });

    // If within budget, return all messages
    if (totalTokens <= maxTokens) {
      return [...messages];
    }

    // Drop oldest messages until we fit
    // Work from the beginning, marking messages for removal
    let tokensToRemove = totalTokens - maxTokens;
    const keep = new Array<boolean>(messages.length).fill(true);

    for (let i = 0; i < messages.length && tokensToRemove > 0; i++) {
      // Never drop the very last user message (the current request)
      if (i === messages.length - 1 && messages[i].role === 'user') {
        break;
      }

      keep[i] = false;
      tokensToRemove -= tokenCounts[i];
    }

    // Collect kept messages
    const result: ChatMessage[] = [];
    for (let i = 0; i < messages.length; i++) {
      if (keep[i]) {
        result.push(messages[i]);
      }
    }

    // Validate tool call consistency: ensure no orphaned tool results
    return this.repairToolCallConsistency(result);
  }

  /**
   * Remove orphaned tool results (where the corresponding assistant
   * tool_calls message was truncated) and orphaned tool calls
   * (where the results were truncated).
   */
  private repairToolCallConsistency(messages: ChatMessage[]): ChatMessage[] {
    // Collect all tool call IDs from assistant messages
    const toolCallIds = new Set<string>();
    for (const msg of messages) {
      if (msg.role === 'assistant' && msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          toolCallIds.add(tc.id);
        }
      }
    }

    // Collect all tool result IDs
    const toolResultIds = new Set<string>();
    for (const msg of messages) {
      if (msg.role === 'tool' && msg.tool_call_id) {
        toolResultIds.add(msg.tool_call_id);
      }
    }

    // Remove tool results without matching tool calls
    // Remove tool call messages where NONE of their calls have results
    return messages.filter((msg) => {
      if (msg.role === 'tool' && msg.tool_call_id) {
        return toolCallIds.has(msg.tool_call_id);
      }
      if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
        // Keep if at least one tool call has a matching result
        return msg.tool_calls.some((tc) => toolResultIds.has(tc.id));
      }
      return true;
    });
  }
}
