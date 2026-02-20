/**
 * Orchestrator — Beth's Brain
 *
 * The main agentic loop that ties everything together:
 *
 *   User message
 *      → Route to agent (AgentRouter)
 *      → Build context (ConversationContext)
 *      → Inject skills (if triggers match)
 *      → Send to LLM (Provider)
 *      → If tool calls → execute tools (ToolRegistry)
 *         → If subagent request → spawn child conversation
 *         → Return tool results to LLM → loop
 *      → If handoff → transfer to new agent (HandoffManager)
 *      → If text response → return to caller
 *
 * The orchestrator supports both streaming and non-streaming modes,
 * and handles the full tool-calling loop until the model produces
 * a final text response or a handoff.
 */

import type { ChatMessage, ToolCall, ToolDefinition } from '../providers/types.js';
import type { LLMProviderBase, ChatRequestOptions } from '../providers/interface.js';

import type { ToolRegistry } from '../tools/registry.js';
import type { ToolContext, ToolResult } from '../tools/types.js';
import { isSubagentRequest } from '../tools/cli/subagent.js';
import type { AgentDefinition, AgentLoadResult } from './agents/types.js';
import type { SkillLoadResult } from './skills/types.js';
import { ConversationContext } from './context.js';
import type { ConversationContextOptions } from './context.js';
import { AgentRouter } from './router.js';
import type { RouteResult } from './router.js';
import { HandoffManager } from './handoffs.js';
import type { HandoffRequest, HandoffResult } from './handoffs.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Configuration for the Orchestrator.
 */
export interface OrchestratorConfig {
  /** Loaded agent definitions */
  agents: AgentLoadResult;

  /** Loaded skill definitions */
  skills: SkillLoadResult;

  /** LLM provider for chat completions */
  provider: LLMProviderBase;

  /** Tool registry with all available tools */
  toolRegistry: ToolRegistry;

  /** Tool execution context (working dir, permissions) */
  toolContext: ToolContext;

  /** Default agent ID (default: 'beth') */
  defaultAgentId?: string;

  /** Maximum tool-calling iterations per turn (default: 25) */
  maxIterations?: number;

  /** Maximum subagent depth (default: 3) */
  maxSubagentDepth?: number;

  /** Maximum handoff depth (default: 10) */
  maxHandoffDepth?: number;

  /** Options for conversation contexts */
  contextOptions?: ConversationContextOptions;
}

/**
 * The result of processing a single user turn.
 */
export interface TurnResult {
  /** The final text response from the agent */
  response: string;

  /** The agent that produced this response */
  agentId: string;

  /** How the agent was selected */
  routeReason: RouteResult['reason'];

  /** Tool calls that were executed during this turn */
  toolCallsExecuted: ToolCallRecord[];

  /** Any handoff that occurred */
  handoff?: HandoffResult;

  /** Any subagent results that were collected */
  subagentResults: SubagentResult[];

  /** Number of LLM iterations used */
  iterations: number;

  /** Skills that were injected for this turn */
  injectedSkills: string[];
}

/**
 * Record of a tool call execution.
 */
export interface ToolCallRecord {
  /** Tool call ID */
  id: string;

  /** Tool name */
  name: string;

  /** Whether the tool executed successfully */
  success: boolean;

  /** Brief output or error */
  output: string;
}

/**
 * Result from a subagent invocation.
 */
export interface SubagentResult {
  /** The subagent's ID */
  agentId: string;

  /** The prompt sent to the subagent */
  prompt: string;

  /** The subagent's response */
  response: string;

  /** Whether the subagent completed successfully */
  success: boolean;
}

/**
 * Callback for observing orchestrator events.
 * Useful for logging, UI updates, and debugging.
 */
export interface OrchestratorObserver {
  /** Called when routing is decided */
  onRoute?: (result: RouteResult) => void;

  /** Called before each LLM call */
  onLLMCall?: (agentId: string, messageCount: number) => void;

  /** Called when the LLM responds with text */
  onLLMResponse?: (agentId: string, content: string) => void;

  /** Called when a tool call starts */
  onToolCallStart?: (toolName: string, args: string) => void;

  /** Called when a tool call completes */
  onToolCallEnd?: (record: ToolCallRecord) => void;

  /** Called when a handoff is initiated */
  onHandoff?: (request: HandoffRequest) => void;

  /** Called when a subagent starts */
  onSubagentStart?: (agentId: string, prompt: string) => void;

  /** Called when a subagent completes */
  onSubagentEnd?: (result: SubagentResult) => void;

  /** Called when an iteration completes */
  onIteration?: (iteration: number, agentId: string) => void;
}

// =============================================================================
// Orchestrator
// =============================================================================

/** Default maximum tool-call iterations per user turn */
const DEFAULT_MAX_ITERATIONS = 25;

/** Default maximum subagent nesting depth */
const DEFAULT_MAX_SUBAGENT_DEPTH = 3;

/**
 * The Orchestrator — Beth's brain.
 *
 * Manages the full agent loop: routing → LLM → tool calls → response.
 *
 * @example
 * ```typescript
 * const orchestrator = new Orchestrator({
 *   agents: loadAgents('.github/agents'),
 *   skills: loadSkills('.github/skills'),
 *   provider: new AzureOpenAIProvider(config),
 *   toolRegistry: createDefaultRegistry(),
 *   toolContext: { workingDir: process.cwd(), permissions: { ... } },
 * });
 *
 * const result = await orchestrator.processMessage('Implement the login page');
 * console.log(result.response);
 * ```
 */
export class Orchestrator {
  private readonly router: AgentRouter;
  private readonly handoffs: HandoffManager;
  private readonly provider: LLMProviderBase;
  private readonly toolRegistry: ToolRegistry;
  private readonly toolContext: ToolContext;
  private readonly maxIterations: number;
  private readonly maxSubagentDepth: number;
  private readonly contextOptions?: ConversationContextOptions;

  /** Active conversation contexts by agent ID */
  private readonly contexts: Map<string, ConversationContext> = new Map();

  /** Currently active agent ID */
  private activeAgentId: string;

  /** Observer for event callbacks */
  private observer?: OrchestratorObserver;

  constructor(config: OrchestratorConfig) {
    this.router = new AgentRouter(
      config.agents,
      config.skills,
      config.defaultAgentId
    );

    this.handoffs = new HandoffManager(this.router, {
      maxDepth: config.maxHandoffDepth,
    });

    this.provider = config.provider;
    this.toolRegistry = config.toolRegistry;
    this.toolContext = config.toolContext;
    this.maxIterations = config.maxIterations ?? DEFAULT_MAX_ITERATIONS;
    this.maxSubagentDepth = config.maxSubagentDepth ?? DEFAULT_MAX_SUBAGENT_DEPTH;
    this.contextOptions = config.contextOptions;

    // Start with the default agent
    this.activeAgentId = config.defaultAgentId ?? 'beth';
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Set an observer for orchestrator events.
   */
  setObserver(observer: OrchestratorObserver): void {
    this.observer = observer;
  }

  /**
   * Process a user message through the full agent loop.
   *
   * This is the main entry point. It:
   * 1. Routes the message to the appropriate agent
   * 2. Injects any matching skills
   * 3. Runs the agent loop (LLM → tools → LLM → ...)
   * 4. Returns the final response
   *
   * @param userMessage - The user's input
   * @returns The complete turn result
   */
  async processMessage(userMessage: string): Promise<TurnResult> {
    return this.processMessageAtDepth(userMessage, 0);
  }

  /**
   * Process a message at a specific subagent depth.
   * Used internally for subagent chains.
   */
  private async processMessageAtDepth(
    userMessage: string,
    subagentDepth: number
  ): Promise<TurnResult> {
    // 1. Route the message
    const routeResult = this.router.route(userMessage, this.activeAgentId);
    this.observer?.onRoute?.(routeResult);

    // Switch active agent if routing changed it
    const agent = routeResult.agent;
    this.activeAgentId = agent.id;

    // 2. Get or create conversation context
    const context = this.getOrCreateContext(agent);

    // 3. Inject matched skills
    const injectedSkills: string[] = [];
    for (const skill of routeResult.matchedSkills) {
      if (context.injectSkill(skill)) {
        injectedSkills.push(skill.id);
      }
    }

    // 4. Add user message
    const prompt = routeResult.cleanedPrompt ?? userMessage;
    context.addUserMessage(prompt);

    // 5. Run the agent loop
    const toolCallsExecuted: ToolCallRecord[] = [];
    const subagentResults: SubagentResult[] = [];
    let iterations = 0;
    let handoffResult: HandoffResult | undefined;
    let finalResponse = '';

    while (iterations < this.maxIterations) {
      iterations++;
      this.observer?.onIteration?.(iterations, agent.id);

      // Build messages and tool definitions
      const messages = context.getMessages();
      const toolDefs = this.getToolDefinitions(agent);

      // Call the LLM
      this.observer?.onLLMCall?.(agent.id, messages.length);

      const requestOptions: ChatRequestOptions = {};
      if (toolDefs.length > 0) {
        requestOptions.tools = toolDefs;
      }

      const llmResult = await this.callLLM(messages, requestOptions);

      // Process the LLM response
      if (llmResult.toolCalls.length > 0) {
        // LLM wants to call tools
        context.addAssistantToolCalls(
          llmResult.toolCalls,
          llmResult.content || undefined
        );

        // Execute all tool calls
        for (const toolCall of llmResult.toolCalls) {
          const record = await this.executeToolCall(toolCall, subagentDepth, subagentResults);
          toolCallsExecuted.push(record);

          // Add tool result to context
          context.addToolResult(toolCall.id, record.output);
        }

        // Continue the loop — LLM needs to see tool results
        continue;
      }

      // No tool calls — this is the final response
      finalResponse = llmResult.content;
      this.observer?.onLLMResponse?.(agent.id, finalResponse);

      if (finalResponse) {
        context.addAssistantMessage(finalResponse);
      }

      break;
    }

    // Check if we hit the iteration limit
    if (iterations >= this.maxIterations && !finalResponse) {
      finalResponse = `[Agent reached maximum iterations (${this.maxIterations}). Last response may be incomplete.]`;
      context.addAssistantMessage(finalResponse);
    }

    return {
      response: finalResponse,
      agentId: agent.id,
      routeReason: routeResult.reason,
      toolCallsExecuted,
      handoff: handoffResult,
      subagentResults,
      iterations,
      injectedSkills,
    };
  }

  /**
   * Execute a handoff to a different agent.
   *
   * @param toAgentId - Target agent ID
   * @param prompt - Message to the new agent
   * @returns The handoff result and potentially a new TurnResult
   */
  async executeHandoff(
    toAgentId: string,
    prompt: string
  ): Promise<{ handoff: HandoffResult; turnResult?: TurnResult }> {
    const currentAgent = this.router.resolveAgent(this.activeAgentId);
    if (!currentAgent) {
      return {
        handoff: {
          executed: false,
          reason: `Current agent "${this.activeAgentId}" not found`,
          request: {
            fromAgentId: this.activeAgentId,
            toAgentId,
            prompt,
            label: 'Handoff',
            autoSend: false,
          },
        },
      };
    }

    const currentContext = this.contexts.get(this.activeAgentId);
    const request = this.handoffs.prepareHandoff(
      currentAgent,
      toAgentId,
      prompt,
      currentContext
    );

    if (!request) {
      return {
        handoff: {
          executed: false,
          reason: `Target agent "${toAgentId}" not found`,
          request: {
            fromAgentId: this.activeAgentId,
            toAgentId,
            prompt,
            label: 'Handoff',
            autoSend: false,
          },
        },
      };
    }

    this.observer?.onHandoff?.(request);

    const handoffResult = this.handoffs.executeHandoff(request);

    if (!handoffResult.executed || !handoffResult.targetAgent) {
      return { handoff: handoffResult };
    }

    // Switch to the new agent
    this.activeAgentId = handoffResult.targetAgent.id;

    // Create new context for the target agent with handoff context
    const newContext = this.getOrCreateContext(handoffResult.targetAgent);
    const handoffContext = this.handoffs.buildHandoffContext(request);
    newContext.addContext(handoffContext);

    // If auto-send, process the prompt immediately
    if (request.autoSend && request.prompt) {
      const turnResult = await this.processMessage(request.prompt);
      return { handoff: handoffResult, turnResult };
    }

    return { handoff: handoffResult };
  }

  /**
   * Get the currently active agent ID.
   */
  getActiveAgentId(): string {
    return this.activeAgentId;
  }

  /**
   * Get the conversation context for the active agent.
   */
  getActiveContext(): ConversationContext | undefined {
    return this.contexts.get(this.activeAgentId);
  }

  /**
   * Get the router for external agent queries.
   */
  getRouter(): AgentRouter {
    return this.router;
  }

  /**
   * Get the handoff manager.
   */
  getHandoffManager(): HandoffManager {
    return this.handoffs;
  }

  /**
   * Reset all conversation state.
   */
  reset(): void {
    this.contexts.clear();
    this.handoffs.clearHistory();
    const defaultAgent = this.router.getDefaultAgent();
    this.activeAgentId = defaultAgent.id;
  }

  // ===========================================================================
  // Internal: LLM Communication
  // ===========================================================================

  /**
   * Call the LLM and collect the full response.
   * Uses streaming internally for reliability, collects into a single result.
   */
  private async callLLM(
    messages: ChatMessage[],
    options?: ChatRequestOptions
  ): Promise<{ content: string; toolCalls: ToolCall[] }> {
    // Use non-streaming chat for simplicity and reliability
    const response = await this.provider.chat(messages, options);

    const choice = response.choices[0];
    if (!choice) {
      return { content: '', toolCalls: [] };
    }

    return {
      content: choice.message.content ?? '',
      toolCalls: choice.message.tool_calls ?? [],
    };
  }

  // ===========================================================================
  // Internal: Tool Execution
  // ===========================================================================

  /**
   * Execute a single tool call and return a record.
   */
  private async executeToolCall(
    toolCall: ToolCall,
    subagentDepth: number,
    subagentResults: SubagentResult[]
  ): Promise<ToolCallRecord> {
    const toolName = toolCall.function.name;

    this.observer?.onToolCallStart?.(toolName, toolCall.function.arguments);

    // Look up the tool
    const tool = this.toolRegistry.get(toolName);
    if (!tool) {
      const record: ToolCallRecord = {
        id: toolCall.id,
        name: toolName,
        success: false,
        output: `Tool "${toolName}" not found in registry`,
      };
      this.observer?.onToolCallEnd?.(record);
      return record;
    }

    try {
      // Parse arguments
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(toolCall.function.arguments);
      } catch {
        const record: ToolCallRecord = {
          id: toolCall.id,
          name: toolName,
          success: false,
          output: `Invalid JSON arguments: ${toolCall.function.arguments.slice(0, 200)}`,
        };
        this.observer?.onToolCallEnd?.(record);
        return record;
      }

      // Execute the tool
      const result = await tool.execute(args, this.toolContext);

      // Check for subagent requests
      if (isSubagentRequest(result)) {
        const subResult = await this.handleSubagentRequest(
          result,
          subagentDepth,
          subagentResults
        );
        const record: ToolCallRecord = {
          id: toolCall.id,
          name: toolName,
          success: subResult.success,
          output: subResult.response,
        };
        this.observer?.onToolCallEnd?.(record);
        return record;
      }

      const record: ToolCallRecord = {
        id: toolCall.id,
        name: toolName,
        success: result.success,
        output: result.output,
      };
      this.observer?.onToolCallEnd?.(record);
      return record;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const record: ToolCallRecord = {
        id: toolCall.id,
        name: toolName,
        success: false,
        output: `Tool execution error: ${errorMessage}`,
      };
      this.observer?.onToolCallEnd?.(record);
      return record;
    }
  }

  /**
   * Handle a subagent request from a tool call.
   */
  private async handleSubagentRequest(
    toolResult: ToolResult,
    currentDepth: number,
    subagentResults: SubagentResult[]
  ): Promise<SubagentResult> {
    const metadata = toolResult.metadata!;
    const agentName = metadata.agentName as string;
    const prompt = metadata.prompt as string;

    // Check depth limit
    if (currentDepth >= this.maxSubagentDepth) {
      const result: SubagentResult = {
        agentId: agentName,
        prompt,
        response: `Subagent depth limit (${this.maxSubagentDepth}) reached. Cannot spawn "${agentName}".`,
        success: false,
      };
      subagentResults.push(result);
      return result;
    }

    // Verify the target agent exists
    const targetAgent = this.router.resolveAgent(agentName);
    if (!targetAgent) {
      const result: SubagentResult = {
        agentId: agentName,
        prompt,
        response: `Agent "${agentName}" not found. Available agents: ${this.router.getAgents().map((a) => a.id).join(', ')}`,
        success: false,
      };
      subagentResults.push(result);
      return result;
    }

    this.observer?.onSubagentStart?.(agentName, prompt);

    try {
      // Create a fresh orchestrator context for the subagent
      // This runs a full agent loop in a nested context
      const subContext = new ConversationContext(targetAgent, this.contextOptions);
      subContext.addUserMessage(prompt);

      // Run a mini agent loop for the subagent
      const subResult = await this.runSubagentLoop(targetAgent, subContext, currentDepth + 1);

      const result: SubagentResult = {
        agentId: agentName,
        prompt,
        response: subResult,
        success: true,
      };

      this.observer?.onSubagentEnd?.(result);
      subagentResults.push(result);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const result: SubagentResult = {
        agentId: agentName,
        prompt,
        response: `Subagent "${agentName}" failed: ${errorMessage}`,
        success: false,
      };
      this.observer?.onSubagentEnd?.(result);
      subagentResults.push(result);
      return result;
    }
  }

  /**
   * Run a mini agent loop for a subagent.
   * Returns the final text response.
   */
  private async runSubagentLoop(
    agent: AgentDefinition,
    context: ConversationContext,
    depth: number
  ): Promise<string> {
    const subagentResults: SubagentResult[] = [];
    let iterations = 0;

    while (iterations < this.maxIterations) {
      iterations++;

      const messages = context.getMessages();
      const toolDefs = this.getToolDefinitions(agent);

      const requestOptions: ChatRequestOptions = {};
      if (toolDefs.length > 0) {
        requestOptions.tools = toolDefs;
      }

      const llmResult = await this.callLLM(messages, requestOptions);

      if (llmResult.toolCalls.length > 0) {
        context.addAssistantToolCalls(llmResult.toolCalls, llmResult.content || undefined);

        for (const toolCall of llmResult.toolCalls) {
          const record = await this.executeToolCall(toolCall, depth, subagentResults);
          context.addToolResult(toolCall.id, record.output);
        }

        continue;
      }

      // Final response
      return llmResult.content;
    }

    return `[Subagent ${agent.id} reached maximum iterations (${this.maxIterations})]`;
  }

  // ===========================================================================
  // Internal: Context & Tools
  // ===========================================================================

  /**
   * Get or create a ConversationContext for an agent.
   */
  private getOrCreateContext(agent: AgentDefinition): ConversationContext {
    let context = this.contexts.get(agent.id);
    if (!context) {
      context = new ConversationContext(agent, this.contextOptions);
      this.contexts.set(agent.id, context);
    }
    return context;
  }

  /**
   * Get tool definitions for an agent based on its allowed tools.
   *
   * Filters the full tool registry to only include tools the agent
   * is allowed to use (from its frontmatter.tools list).
   */
  private getToolDefinitions(agent: AgentDefinition): ToolDefinition[] {
    const allowedTools = agent.frontmatter.tools;

    if (!allowedTools || allowedTools.length === 0) {
      // No tool restrictions — agent gets all tools
      return this.toolRegistry.getDefinitions();
    }

    // Map agent tool names to registry tool names
    // Agent tools use names like 'readFile', 'editFiles', 'runSubagent'
    // Registry tools use names like 'readFile', 'editFile', 'subagent'
    const toolNameMap: Record<string, string> = {
      editFiles: 'editFile',
      runSubagent: 'subagent',
      runInTerminal: 'terminal',
      getTerminalOutput: 'terminal', // Same tool handles both
    };

    const definitions: ToolDefinition[] = [];
    const seen = new Set<string>();

    for (const agentToolName of allowedTools) {
      const registryName = toolNameMap[agentToolName] ?? agentToolName;

      if (seen.has(registryName)) continue;
      seen.add(registryName);

      const tool = this.toolRegistry.get(registryName);
      if (tool) {
        definitions.push({
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema as Record<string, unknown>,
          },
        });
      }
    }

    return definitions;
  }
}
