/**
 * ConversationContext Tests
 *
 * Tests for conversation state management, message handling,
 * context window enforcement, skill injection, and handoff summaries.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ConversationContext } from './context.js';
import type { AgentDefinition } from './agents/types.js';
import type { SkillDefinition } from './skills/types.js';
import type { ChatMessage } from '../providers/types.js';

// =============================================================================
// Test Fixtures
// =============================================================================

function createTestAgent(overrides?: Partial<AgentDefinition>): AgentDefinition {
  return {
    id: 'test-agent',
    frontmatter: {
      name: 'Test Agent',
      description: 'A test agent',
      tools: ['readFile', 'editFiles'],
    },
    body: '# Test Agent\n\nYou are a helpful test agent.',
    sourcePath: '/test/test-agent.agent.md',
    ...overrides,
  };
}

function createTestSkill(id: string, name: string, body: string): SkillDefinition {
  return {
    id,
    frontmatter: { name },
    body,
    sourcePath: `/test/skills/${id}/SKILL.md`,
    triggers: [`${id} trigger`],
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('ConversationContext', () => {
  describe('Construction', () => {
    it('should create with default options', () => {
      const agent = createTestAgent();
      const ctx = new ConversationContext(agent);

      assert.strictEqual(ctx.getTurnCount(), 0);
      assert.strictEqual(ctx.getRawMessages().length, 0);
      assert.deepStrictEqual(ctx.getInjectedSkillIds(), []);
    });

    it('should create with initial messages', () => {
      const agent = createTestAgent();
      const initial: ChatMessage[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there' },
      ];

      const ctx = new ConversationContext(agent, { initialMessages: initial });

      assert.strictEqual(ctx.getRawMessages().length, 2);
      assert.strictEqual(ctx.getTurnCount(), 1);
    });

    it('should store the agent definition', () => {
      const agent = createTestAgent({ id: 'my-agent' });
      const ctx = new ConversationContext(agent);

      assert.strictEqual(ctx.getAgent().id, 'my-agent');
    });
  });

  describe('Message Management', () => {
    it('should add user messages', () => {
      const ctx = new ConversationContext(createTestAgent());

      ctx.addUserMessage('Hello');
      ctx.addUserMessage('How are you?');

      assert.strictEqual(ctx.getTurnCount(), 2);
      assert.strictEqual(ctx.getRawMessages().length, 2);
      assert.strictEqual(ctx.getRawMessages()[0].role, 'user');
      assert.strictEqual(ctx.getRawMessages()[0].content, 'Hello');
    });

    it('should add assistant messages', () => {
      const ctx = new ConversationContext(createTestAgent());

      ctx.addUserMessage('Hello');
      ctx.addAssistantMessage('Hi there');

      const msgs = ctx.getRawMessages();
      assert.strictEqual(msgs.length, 2);
      assert.strictEqual(msgs[1].role, 'assistant');
      assert.strictEqual(msgs[1].content, 'Hi there');
    });

    it('should add assistant tool calls', () => {
      const ctx = new ConversationContext(createTestAgent());

      ctx.addUserMessage('Read my file');
      ctx.addAssistantToolCalls(
        [{ id: 'tc1', type: 'function', function: { name: 'readFile', arguments: '{"path":"test.ts"}' } }],
        'Let me read that file.'
      );

      const msgs = ctx.getRawMessages();
      assert.strictEqual(msgs.length, 2);
      assert.strictEqual(msgs[1].role, 'assistant');
      assert.strictEqual(msgs[1].tool_calls?.length, 1);
      assert.strictEqual(msgs[1].tool_calls![0].function.name, 'readFile');
      assert.strictEqual(msgs[1].content, 'Let me read that file.');
    });

    it('should add tool results', () => {
      const ctx = new ConversationContext(createTestAgent());

      ctx.addUserMessage('Read my file');
      ctx.addAssistantToolCalls(
        [{ id: 'tc1', type: 'function', function: { name: 'readFile', arguments: '{}' } }]
      );
      ctx.addToolResult('tc1', 'File contents here');

      const msgs = ctx.getRawMessages();
      assert.strictEqual(msgs.length, 3);
      assert.strictEqual(msgs[2].role, 'tool');
      assert.strictEqual(msgs[2].tool_call_id, 'tc1');
      assert.strictEqual(msgs[2].content, 'File contents here');
    });

    it('should clear history', () => {
      const ctx = new ConversationContext(createTestAgent());

      ctx.addUserMessage('Hello');
      ctx.addAssistantMessage('Hi');
      ctx.clearHistory();

      assert.strictEqual(ctx.getTurnCount(), 0);
      assert.strictEqual(ctx.getRawMessages().length, 0);
    });
  });

  describe('System Prompt Construction', () => {
    it('should include agent body in system prompt', () => {
      const agent = createTestAgent({ body: '# My Agent\n\nSpecial instructions.' });
      const ctx = new ConversationContext(agent);

      const prompt = ctx.buildSystemPrompt();
      assert.ok(prompt.includes('# My Agent'));
      assert.ok(prompt.includes('Special instructions.'));
    });

    it('should include additional context in system prompt', () => {
      const ctx = new ConversationContext(createTestAgent());
      ctx.addContext('Previous agent completed the design phase.');

      const prompt = ctx.buildSystemPrompt();
      assert.ok(prompt.includes('Additional Context'));
      assert.ok(prompt.includes('Previous agent completed the design phase.'));
    });

    it('should include injected skills in system prompt', () => {
      const ctx = new ConversationContext(createTestAgent());
      const skill = createTestSkill('prd', 'PRD Generation', 'Generate product requirements.');

      ctx.injectSkill(skill);

      const prompt = ctx.buildSystemPrompt();
      assert.ok(prompt.includes('Skill: PRD Generation'));
      assert.ok(prompt.includes('Generate product requirements.'));
    });

    it('getMessages should prepend system prompt', () => {
      const ctx = new ConversationContext(createTestAgent());
      ctx.addUserMessage('Hello');

      const msgs = ctx.getMessages();
      assert.strictEqual(msgs.length, 2);
      assert.strictEqual(msgs[0].role, 'system');
      assert.ok(msgs[0].content.includes('Test Agent'));
      assert.strictEqual(msgs[1].role, 'user');
    });
  });

  describe('Skill Injection', () => {
    it('should inject a skill once', () => {
      const ctx = new ConversationContext(createTestAgent());
      const skill = createTestSkill('prd', 'PRD', 'PRD content');

      const first = ctx.injectSkill(skill);
      const second = ctx.injectSkill(skill);

      assert.strictEqual(first, true);
      assert.strictEqual(second, false);
    });

    it('should track injected skill IDs', () => {
      const ctx = new ConversationContext(createTestAgent());

      ctx.injectSkill(createTestSkill('prd', 'PRD', 'content'));
      ctx.injectSkill(createTestSkill('shadcn', 'shadcn', 'content'));

      const ids = ctx.getInjectedSkillIds();
      assert.deepStrictEqual(ids.sort(), ['prd', 'shadcn']);
    });

    it('should check if a skill is injected', () => {
      const ctx = new ConversationContext(createTestAgent());

      ctx.injectSkill(createTestSkill('prd', 'PRD', 'content'));

      assert.strictEqual(ctx.hasSkill('prd'), true);
      assert.strictEqual(ctx.hasSkill('other'), false);
    });
  });

  describe('Token Estimation', () => {
    it('should estimate tokens for context', () => {
      const ctx = new ConversationContext(createTestAgent());
      ctx.addUserMessage('Hello world');

      const tokens = ctx.getEstimatedTokens();
      assert.ok(tokens > 0);
    });

    it('should increase count with more messages', () => {
      const ctx = new ConversationContext(createTestAgent());
      ctx.addUserMessage('Hello');

      const tokensSmall = ctx.getEstimatedTokens();

      ctx.addAssistantMessage('I am a very helpful assistant with a lot to say about this topic.');
      ctx.addUserMessage('Tell me more about something else.');

      const tokensLarge = ctx.getEstimatedTokens();
      assert.ok(tokensLarge > tokensSmall);
    });
  });

  describe('Context Window Truncation', () => {
    it('should truncate old messages when exceeding context window', () => {
      const agent = createTestAgent({ body: 'Short prompt.' });
      const ctx = new ConversationContext(agent, {
        maxTokens: 200, // Very small context window
        responseReserve: 50,
      });

      // Add many messages
      for (let i = 0; i < 20; i++) {
        ctx.addUserMessage(`Message number ${i} with some extra content to fill tokens.`);
        ctx.addAssistantMessage(`Response number ${i} with some extra content as well.`);
      }

      const msgs = ctx.getMessages();
      // Should be truncated — fewer messages than what we added
      assert.ok(msgs.length < 41); // 40 user+assistant + 1 system
      assert.strictEqual(msgs[0].role, 'system');
    });

    it('should return all messages when within context window', () => {
      const ctx = new ConversationContext(createTestAgent());

      ctx.addUserMessage('Hello');
      ctx.addAssistantMessage('Hi');

      const msgs = ctx.getMessages();
      assert.strictEqual(msgs.length, 3); // system + user + assistant
    });
  });

  describe('Tool Call Consistency Repair', () => {
    it('should handle normal tool call flow without issues', () => {
      const ctx = new ConversationContext(createTestAgent());

      ctx.addUserMessage('Read file');
      ctx.addAssistantToolCalls(
        [{ id: 'tc1', type: 'function', function: { name: 'readFile', arguments: '{}' } }]
      );
      ctx.addToolResult('tc1', 'file contents');
      ctx.addAssistantMessage('Here are the contents.');

      const msgs = ctx.getMessages();
      // system + user + assistant(tool_calls) + tool + assistant
      assert.strictEqual(msgs.length, 5);
    });
  });

  describe('Conversation Summary', () => {
    it('should generate a summary', () => {
      const ctx = new ConversationContext(createTestAgent({ id: 'developer' }));

      ctx.addUserMessage('Implement login');
      ctx.addAssistantMessage('I will create the login component.');
      ctx.addUserMessage('Include remember me');
      ctx.addAssistantMessage('Added remember me checkbox.');

      const summary = ctx.getSummary();
      assert.strictEqual(summary.agentId, 'developer');
      assert.strictEqual(summary.turnCount, 2);
      assert.ok(summary.summary.includes('login component'));
    });

    it('should include tool call summary', () => {
      const ctx = new ConversationContext(createTestAgent());

      ctx.addUserMessage('Edit file');
      ctx.addAssistantToolCalls(
        [{ id: 'tc1', type: 'function', function: { name: 'editFile', arguments: '{"path":"a.ts"}' } }]
      );
      ctx.addToolResult('tc1', 'OK');
      ctx.addAssistantMessage('Done.');

      const summary = ctx.getSummary();
      assert.ok(summary.toolCallSummary.length > 0);
      assert.ok(summary.toolCallSummary[0].includes('editFile'));
    });

    it('should handle empty conversation', () => {
      const ctx = new ConversationContext(createTestAgent());

      const summary = ctx.getSummary();
      assert.strictEqual(summary.turnCount, 0);
      assert.ok(summary.summary.includes('No assistant responses'));
    });
  });
});
