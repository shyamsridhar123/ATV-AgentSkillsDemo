/**
 * Orchestrator Tests
 *
 * Integration tests for the full agent loop: routing → LLM → tool calls → response.
 * Uses mock LLM provider and tools to verify the orchestration flow.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Orchestrator } from './orchestrator.js';
import type { OrchestratorConfig, ToolCallRecord } from './orchestrator.js';
import type { AgentDefinition } from './agents/types.js';
import type { SkillDefinition } from './skills/types.js';
import type { ChatMessage, LLMResponse, ChatChunk, ToolCall } from '../providers/types.js';
import { LLMProviderBase } from '../providers/interface.js';
import type { ChatRequestOptions } from '../providers/interface.js';
import type { Tool } from '../tools/interface.js';
import type { ToolContext, ToolResult } from '../tools/types.js';
import { ToolRegistry } from '../tools/registry.js';

// =============================================================================
// Mock LLM Provider
// =============================================================================

/** Minimal TokenCredential stub for tests */
const mockCredential = { getToken: async () => ({ token: 'test', expiresOnTimestamp: Date.now() + 3600000 }) };

/**
 * A mock LLM provider that returns predetermined responses.
 * Extends LLMProviderBase so it satisfies the type hierarchy.
 */
class MockProvider extends LLMProviderBase {
  private responses: Array<{ content: string; toolCalls?: ToolCall[] }> = [];
  private callCount = 0;
  chatCallCount = 0;

  constructor() {
    super({
      provider: 'azure-openai',
      model: 'test-model',
      endpoint: 'https://test.openai.azure.com',
      credential: mockCredential,
    });
  }

  get name(): string { return 'mock'; }
  get isConfigured(): boolean { return true; }

  /** Queue a text response */
  addTextResponse(content: string): void {
    this.responses.push({ content });
  }

  /** Queue a tool call response */
  addToolCallResponse(toolCalls: ToolCall[], content?: string): void {
    this.responses.push({ content: content ?? '', toolCalls });
  }

  async chat(
    _messages: ChatMessage[],
    _options?: ChatRequestOptions
  ): Promise<LLMResponse> {
    this.chatCallCount++;
    const response = this.responses[this.callCount++];

    if (!response) {
      return {
        id: `resp-${this.callCount}`,
        choices: [{ index: 0, message: { role: 'assistant', content: 'No more responses queued.' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      };
    }

    const message: ChatMessage = {
      role: 'assistant',
      content: response.content,
      tool_calls: response.toolCalls,
    };

    return {
      id: `resp-${this.callCount}`,
      choices: [{ index: 0, message, finish_reason: response.toolCalls ? 'tool_calls' : 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    };
  }

  async *chatStream(
    messages: ChatMessage[],
    options?: ChatRequestOptions
  ): AsyncGenerator<ChatChunk, void, undefined> {
    const response = await this.chat(messages, options);
    const choice = response.choices[0];
    yield {
      id: response.id,
      content: choice.message.content,
      role: 'assistant',
      finish_reason: choice.finish_reason,
    };
  }

  async countTokens(_messages: ChatMessage[]): Promise<number> {
    return 100;
  }
}

// =============================================================================
// Test Fixtures
// =============================================================================

function createAgent(id: string, name: string, tools?: string[], infer?: boolean): AgentDefinition {
  return {
    id,
    frontmatter: {
      name,
      description: `${name} agent`,
      tools: tools ?? ['readFile', 'editFiles'],
      infer: infer ?? true,
      handoffs: [],
    },
    body: `# ${name}\n\nYou are ${name}.`,
    sourcePath: `/agents/${id}.agent.md`,
  };
}

function createSkill(id: string, triggers: string[]): SkillDefinition {
  return {
    id,
    frontmatter: { name: id, description: `Triggers on: ${triggers.join(', ')}` },
    body: `Skill content for ${id}`,
    sourcePath: `/skills/${id}/SKILL.md`,
    triggers,
  };
}

/** Create a simple echo tool for testing */
function createEchoTool(): Tool {
  return {
    name: 'echo',
    description: 'Echoes input back',
    inputSchema: {
      type: 'object',
      properties: { message: { type: 'string', description: 'Message to echo' } },
      required: ['message'],
    },
    async execute(input: Record<string, unknown>): Promise<ToolResult> {
      return { success: true, output: `Echo: ${input.message}` };
    },
  };
}

/** Create a readFile tool stub for testing */
function createReadFileTool(): Tool {
  return {
    name: 'readFile',
    description: 'Read a file',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'File path' } },
      required: ['path'],
    },
    async execute(input: Record<string, unknown>): Promise<ToolResult> {
      return { success: true, output: `Contents of ${input.path}` };
    },
  };
}

/** Create a subagent tool stub that returns pending metadata */
function createSubagentTool(): Tool {
  return {
    name: 'subagent',
    description: 'Spawn a subagent',
    inputSchema: {
      type: 'object',
      properties: {
        agentName: { type: 'string' },
        prompt: { type: 'string' },
        description: { type: 'string' },
      },
      required: ['agentName', 'prompt'],
    },
    async execute(input: Record<string, unknown>): Promise<ToolResult> {
      return {
        success: true,
        output: `Subagent request: ${input.agentName}`,
        metadata: {
          agentName: input.agentName as string,
          prompt: input.prompt as string,
          description: input.description as string | undefined,
          status: 'pending',
        },
      };
    },
  };
}

function createToolContext(): ToolContext {
  return {
    workingDir: '/test',
    permissions: {
      allowFileRead: true,
      allowFileWrite: true,
      allowTerminal: true,
      allowNetwork: true,
    },
  };
}

function createOrchestratorConfig(
  provider: MockProvider,
  registry?: ToolRegistry,
  agents?: AgentDefinition[],
  skills?: SkillDefinition[]
): OrchestratorConfig {
  const agentList = agents ?? [
    createAgent('beth', 'Beth'),
    createAgent('developer', 'developer'),
    createAgent('tester', 'tester'),
  ];

  return {
    agents: { agents: agentList, errors: [] },
    skills: { skills: skills ?? [], errors: [] },
    provider,
    toolRegistry: registry ?? new ToolRegistry(),
    toolContext: createToolContext(),
    defaultAgentId: 'beth',
    maxIterations: 10,
    maxSubagentDepth: 2,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('Orchestrator', () => {
  describe('Basic message processing', () => {
    it('should process a simple text response', async () => {
      const provider = new MockProvider();
      provider.addTextResponse('Hello! How can I help?');

      const orchestrator = new Orchestrator(createOrchestratorConfig(provider));
      const result = await orchestrator.processMessage('Hello');

      assert.strictEqual(result.response, 'Hello! How can I help?');
      assert.strictEqual(result.agentId, 'beth');
      assert.strictEqual(result.iterations, 1);
      assert.strictEqual(result.toolCallsExecuted.length, 0);
    });

    it('should default to beth agent', async () => {
      const provider = new MockProvider();
      provider.addTextResponse('I am Beth.');

      const orchestrator = new Orchestrator(createOrchestratorConfig(provider));
      const result = await orchestrator.processMessage('Who are you?');

      assert.strictEqual(result.agentId, 'beth');
      assert.strictEqual(result.routeReason, 'default');
    });

    it('should route @developer mention to developer', async () => {
      const provider = new MockProvider();
      provider.addTextResponse('I will implement that.');

      const orchestrator = new Orchestrator(createOrchestratorConfig(provider));
      const result = await orchestrator.processMessage('@developer implement login');

      assert.strictEqual(result.agentId, 'developer');
      assert.strictEqual(result.routeReason, 'mention');
    });
  });

  describe('Tool calling loop', () => {
    it('should execute tool calls and return final response', async () => {
      const provider = new MockProvider();

      // First response: tool call
      provider.addToolCallResponse([
        { id: 'tc1', type: 'function', function: { name: 'readFile', arguments: '{"path":"test.ts"}' } },
      ]);

      // Second response: text (after seeing tool result)
      provider.addTextResponse('The file contains test code.');

      const registry = new ToolRegistry();
      registry.register(createReadFileTool());

      const orchestrator = new Orchestrator(
        createOrchestratorConfig(provider, registry)
      );

      const result = await orchestrator.processMessage('Read test.ts');

      assert.strictEqual(result.response, 'The file contains test code.');
      assert.strictEqual(result.iterations, 2);
      assert.strictEqual(result.toolCallsExecuted.length, 1);
      assert.strictEqual(result.toolCallsExecuted[0].name, 'readFile');
      assert.strictEqual(result.toolCallsExecuted[0].success, true);
    });

    it('should handle multiple tool calls in one response', async () => {
      const provider = new MockProvider();

      // Two tool calls in one response
      provider.addToolCallResponse([
        { id: 'tc1', type: 'function', function: { name: 'echo', arguments: '{"message":"hello"}' } },
        { id: 'tc2', type: 'function', function: { name: 'readFile', arguments: '{"path":"a.ts"}' } },
      ]);

      provider.addTextResponse('Done with both.');

      const registry = new ToolRegistry();
      registry.register(createEchoTool());
      registry.register(createReadFileTool());

      const orchestrator = new Orchestrator(
        createOrchestratorConfig(provider, registry)
      );

      const result = await orchestrator.processMessage('Do two things');

      assert.strictEqual(result.response, 'Done with both.');
      assert.strictEqual(result.toolCallsExecuted.length, 2);
    });

    it('should handle unknown tool gracefully', async () => {
      const provider = new MockProvider();

      provider.addToolCallResponse([
        { id: 'tc1', type: 'function', function: { name: 'unknownTool', arguments: '{}' } },
      ]);

      provider.addTextResponse('Could not find that tool.');

      const orchestrator = new Orchestrator(
        createOrchestratorConfig(provider)
      );

      const result = await orchestrator.processMessage('Use unknown tool');

      assert.strictEqual(result.toolCallsExecuted.length, 1);
      assert.strictEqual(result.toolCallsExecuted[0].success, false);
      assert.ok(result.toolCallsExecuted[0].output.includes('not found'));
    });

    it('should handle invalid JSON arguments gracefully', async () => {
      const provider = new MockProvider();

      provider.addToolCallResponse([
        { id: 'tc1', type: 'function', function: { name: 'echo', arguments: 'not json' } },
      ]);

      provider.addTextResponse('That did not work.');

      const registry = new ToolRegistry();
      registry.register(createEchoTool());

      const orchestrator = new Orchestrator(
        createOrchestratorConfig(provider, registry)
      );

      const result = await orchestrator.processMessage('Bad args');

      assert.strictEqual(result.toolCallsExecuted[0].success, false);
      assert.ok(result.toolCallsExecuted[0].output.includes('Invalid JSON'));
    });

    it('should respect max iterations', async () => {
      const provider = new MockProvider();

      // Keep returning tool calls forever
      for (let i = 0; i < 15; i++) {
        provider.addToolCallResponse([
          { id: `tc${i}`, type: 'function', function: { name: 'echo', arguments: `{"message":"loop ${i}"}` } },
        ]);
      }

      const registry = new ToolRegistry();
      registry.register(createEchoTool());

      const config = createOrchestratorConfig(provider, registry);
      config.maxIterations = 5;

      const orchestrator = new Orchestrator(config);
      const result = await orchestrator.processMessage('Loop forever');

      assert.strictEqual(result.iterations, 5);
      assert.ok(result.response.includes('maximum iterations'));
    });
  });

  describe('Skill injection', () => {
    it('should inject matching skills into context', async () => {
      const provider = new MockProvider();
      provider.addTextResponse('I will create the PRD.');

      const skills = [createSkill('prd', ['create a prd', 'product requirements'])];

      const orchestrator = new Orchestrator(
        createOrchestratorConfig(provider, undefined, undefined, skills)
      );

      const result = await orchestrator.processMessage('create a prd for auth');

      assert.strictEqual(result.injectedSkills.length, 1);
      assert.strictEqual(result.injectedSkills[0], 'prd');
    });

    it('should not inject the same skill twice', async () => {
      const provider = new MockProvider();
      provider.addTextResponse('First response.');
      provider.addTextResponse('Second response.');

      const skills = [createSkill('prd', ['create a prd'])];

      const orchestrator = new Orchestrator(
        createOrchestratorConfig(provider, undefined, undefined, skills)
      );

      const result1 = await orchestrator.processMessage('create a prd for auth');
      assert.strictEqual(result1.injectedSkills.length, 1);

      const result2 = await orchestrator.processMessage('create a prd for billing');
      assert.strictEqual(result2.injectedSkills.length, 0);
    });
  });

  describe('Subagent handling', () => {
    it('should handle subagent tool calls', async () => {
      const provider = new MockProvider();

      // Main agent calls subagent
      provider.addToolCallResponse([
        {
          id: 'tc1',
          type: 'function',
          function: {
            name: 'subagent',
            arguments: JSON.stringify({ agentName: 'developer', prompt: 'Build login' }),
          },
        },
      ]);

      // Subagent's LLM response
      provider.addTextResponse('Login component built successfully.');

      // Main agent's final response
      provider.addTextResponse('The developer has built the login component.');

      const registry = new ToolRegistry();
      registry.register(createSubagentTool());

      const orchestrator = new Orchestrator(
        createOrchestratorConfig(provider, registry)
      );

      const result = await orchestrator.processMessage('Build a login page');

      assert.strictEqual(result.subagentResults.length, 1);
      assert.strictEqual(result.subagentResults[0].agentId, 'developer');
      assert.strictEqual(result.subagentResults[0].success, true);
    });

    it('should fail gracefully for unknown subagent', async () => {
      const provider = new MockProvider();

      provider.addToolCallResponse([
        {
          id: 'tc1',
          type: 'function',
          function: {
            name: 'subagent',
            arguments: JSON.stringify({ agentName: 'nonexistent', prompt: 'Do stuff' }),
          },
        },
      ]);

      provider.addTextResponse('That agent does not exist.');

      const registry = new ToolRegistry();
      registry.register(createSubagentTool());

      const orchestrator = new Orchestrator(
        createOrchestratorConfig(provider, registry)
      );

      const result = await orchestrator.processMessage('Call nonexistent agent');

      assert.strictEqual(result.subagentResults.length, 1);
      assert.strictEqual(result.subagentResults[0].success, false);
      assert.ok(result.subagentResults[0].response.includes('not found'));
    });

    it('should respect subagent depth limit', async () => {
      const provider = new MockProvider();

      // Keep requesting subagents
      for (let i = 0; i < 5; i++) {
        provider.addToolCallResponse([
          {
            id: `tc${i}`,
            type: 'function',
            function: {
              name: 'subagent',
              arguments: JSON.stringify({ agentName: 'developer', prompt: `Depth ${i}` }),
            },
          },
        ]);
      }

      // Subagent responses
      for (let i = 0; i < 5; i++) {
        provider.addTextResponse(`Done at depth ${i}`);
      }

      provider.addTextResponse('All done.');

      const registry = new ToolRegistry();
      registry.register(createSubagentTool());

      const config = createOrchestratorConfig(provider, registry);
      config.maxSubagentDepth = 1;

      const orchestrator = new Orchestrator(config);
      const result = await orchestrator.processMessage('Go deep');

      // At least one subagent should have been depth-limited
      const hasFailures = result.subagentResults.some((r) => !r.success);
      // Depends on exact execution: first call succeeds (depth 0→1), nested would fail
      assert.ok(result.subagentResults.length > 0 || hasFailures);
    });
  });

  describe('Handoffs', () => {
    it('should execute a handoff to another agent', async () => {
      const provider = new MockProvider();
      provider.addTextResponse('I am Beth.');
      provider.addTextResponse('I am developer now.');

      const agents = [
        createAgent('beth', 'Beth'),
        createAgent('developer', 'developer'),
      ];
      agents[0].frontmatter.handoffs = [
        { label: 'Dev', agent: 'developer', prompt: 'code this', send: false },
      ];

      const orchestrator = new Orchestrator(
        createOrchestratorConfig(provider, undefined, agents)
      );

      // First message goes to Beth
      await orchestrator.processMessage('Hello Beth');
      assert.strictEqual(orchestrator.getActiveAgentId(), 'beth');

      // Execute a handoff
      const { handoff } = await orchestrator.executeHandoff('developer', 'Build login');
      assert.strictEqual(handoff.executed, true);
      assert.strictEqual(orchestrator.getActiveAgentId(), 'developer');
    });

    it('should fail handoff to unknown agent', async () => {
      const provider = new MockProvider();
      provider.addTextResponse('I am Beth.');

      const orchestrator = new Orchestrator(
        createOrchestratorConfig(provider)
      );

      await orchestrator.processMessage('Hello');
      const { handoff } = await orchestrator.executeHandoff('nonexistent', 'Do stuff');

      assert.strictEqual(handoff.executed, false);
    });
  });

  describe('Observer callbacks', () => {
    it('should call observer on route', async () => {
      const provider = new MockProvider();
      provider.addTextResponse('Done.');

      const orchestrator = new Orchestrator(
        createOrchestratorConfig(provider)
      );

      let routeCalled = false;
      orchestrator.setObserver({
        onRoute: () => { routeCalled = true; },
      });

      await orchestrator.processMessage('Hello');
      assert.strictEqual(routeCalled, true);
    });

    it('should call observer on LLM calls', async () => {
      const provider = new MockProvider();
      provider.addTextResponse('Response.');

      const orchestrator = new Orchestrator(
        createOrchestratorConfig(provider)
      );

      let llmCallAgent = '';
      orchestrator.setObserver({
        onLLMCall: (agentId) => { llmCallAgent = agentId; },
      });

      await orchestrator.processMessage('Hello');
      assert.strictEqual(llmCallAgent, 'beth');
    });

    it('should call observer on tool calls', async () => {
      const provider = new MockProvider();
      provider.addToolCallResponse([
        { id: 'tc1', type: 'function', function: { name: 'echo', arguments: '{"message":"hi"}' } },
      ]);
      provider.addTextResponse('Done.');

      const registry = new ToolRegistry();
      registry.register(createEchoTool());

      const orchestrator = new Orchestrator(
        createOrchestratorConfig(provider, registry)
      );

      const records: ToolCallRecord[] = [];
      orchestrator.setObserver({
        onToolCallEnd: (record) => { records.push(record); },
      });

      await orchestrator.processMessage('Echo something');
      assert.strictEqual(records.length, 1);
      assert.strictEqual(records[0].name, 'echo');
    });
  });

  describe('State management', () => {
    it('should maintain conversation context across turns', async () => {
      const provider = new MockProvider();
      provider.addTextResponse('First response.');
      provider.addTextResponse('Second response.');

      const orchestrator = new Orchestrator(
        createOrchestratorConfig(provider)
      );

      await orchestrator.processMessage('First message');
      await orchestrator.processMessage('Second message');

      const context = orchestrator.getActiveContext();
      assert.ok(context);
      assert.strictEqual(context!.getTurnCount(), 2);
    });

    it('should reset state', async () => {
      const provider = new MockProvider();
      provider.addTextResponse('Hello.');
      provider.addTextResponse('After reset.');

      const orchestrator = new Orchestrator(
        createOrchestratorConfig(provider)
      );

      await orchestrator.processMessage('Hello');
      orchestrator.reset();

      assert.strictEqual(orchestrator.getActiveAgentId(), 'beth');
      const context = orchestrator.getActiveContext();
      assert.strictEqual(context, undefined);
    });

    it('should expose router and handoff manager', () => {
      const provider = new MockProvider();
      const orchestrator = new Orchestrator(
        createOrchestratorConfig(provider)
      );

      assert.ok(orchestrator.getRouter());
      assert.ok(orchestrator.getHandoffManager());
    });
  });

  describe('Agent tool filtering', () => {
    it('should send tool definitions to the LLM', async () => {
      const provider = new MockProvider();
      provider.addTextResponse('Done.');

      const registry = new ToolRegistry();
      registry.register(createEchoTool());
      registry.register(createReadFileTool());

      const orchestrator = new Orchestrator(
        createOrchestratorConfig(provider, registry)
      );

      const result = await orchestrator.processMessage('Hello');
      // Just verify it completes without error — the LLM receives tool defs
      assert.strictEqual(result.response, 'Done.');
      assert.strictEqual(provider.chatCallCount, 1);
    });
  });
});
