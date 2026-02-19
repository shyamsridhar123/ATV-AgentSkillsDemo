/**
 * HandoffManager Tests
 *
 * Tests for agent-to-agent transfers: preparation, execution,
 * context building, depth limits, and loop detection.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { HandoffManager } from './handoffs.js';
import { AgentRouter } from './router.js';
import { ConversationContext } from './context.js';
import type { AgentDefinition, AgentLoadResult } from './agents/types.js';
import type { SkillLoadResult } from './skills/types.js';

// =============================================================================
// Test Fixtures
// =============================================================================

function createAgent(id: string, name: string, handoffs?: { label: string; agent: string; prompt: string; send?: boolean }[]): AgentDefinition {
  return {
    id,
    frontmatter: {
      name,
      description: `${name} agent`,
      tools: ['readFile'],
      handoffs: handoffs ?? [],
    },
    body: `# ${name}`,
    sourcePath: `/agents/${id}.agent.md`,
  };
}

function createTestSetup(maxDepth?: number) {
  const beth = createAgent('beth', 'Beth', [
    { label: 'Development', agent: 'developer', prompt: 'Implement this', send: false },
    { label: 'Testing', agent: 'tester', prompt: 'Test this', send: true },
    { label: 'Design', agent: 'ux-designer', prompt: 'Design this' },
  ]);

  const developer = createAgent('developer', 'developer', [
    { label: 'QA', agent: 'tester', prompt: 'Test the implementation', send: false },
    { label: 'Review', agent: 'beth', prompt: 'Review complete' },
  ]);

  const tester = createAgent('tester', 'tester', [
    { label: 'Fix Issue', agent: 'developer', prompt: 'Fix this bug', send: false },
  ]);

  const designer = createAgent('ux-designer', 'ux-designer', []);

  const agentResult: AgentLoadResult = {
    agents: [beth, developer, tester, designer],
    errors: [],
  };

  const skillResult: SkillLoadResult = { skills: [], errors: [] };

  const router = new AgentRouter(agentResult, skillResult, 'beth');
  const manager = new HandoffManager(router, { maxDepth: maxDepth ?? 10 });

  return { router, manager, beth, developer, tester, designer };
}

// =============================================================================
// Tests
// =============================================================================

describe('HandoffManager', () => {
  describe('Handoff Discovery', () => {
    it('should list available handoffs for an agent', () => {
      const { manager, beth } = createTestSetup();
      const handoffs = manager.getAvailableHandoffs(beth);

      assert.strictEqual(handoffs.length, 3);
      assert.strictEqual(handoffs[0].label, 'Development');
      assert.strictEqual(handoffs[0].agent, 'developer');
    });

    it('should return empty array for agent with no handoffs', () => {
      const { manager, designer } = createTestSetup();
      const handoffs = manager.getAvailableHandoffs(designer);

      assert.strictEqual(handoffs.length, 0);
    });

    it('should find a specific handoff by target', () => {
      const { manager, beth } = createTestSetup();
      const handoff = manager.findHandoff(beth, 'developer');

      assert.ok(handoff);
      assert.strictEqual(handoff!.label, 'Development');
      assert.strictEqual(handoff!.prompt, 'Implement this');
    });

    it('should return undefined for unknown target', () => {
      const { manager, beth } = createTestSetup();
      const handoff = manager.findHandoff(beth, 'nonexistent');

      assert.strictEqual(handoff, undefined);
    });
  });

  describe('Handoff Preparation', () => {
    it('should prepare a handoff with defaults from definition', () => {
      const { manager, beth } = createTestSetup();
      const request = manager.prepareHandoff(beth, 'developer');

      assert.ok(request);
      assert.strictEqual(request!.fromAgentId, 'beth');
      assert.strictEqual(request!.toAgentId, 'developer');
      assert.strictEqual(request!.prompt, 'Implement this');
      assert.strictEqual(request!.label, 'Development');
      assert.strictEqual(request!.autoSend, false);
    });

    it('should override prompt when provided', () => {
      const { manager, beth } = createTestSetup();
      const request = manager.prepareHandoff(beth, 'developer', 'Build the login page');

      assert.ok(request);
      assert.strictEqual(request!.prompt, 'Build the login page');
    });

    it('should include conversation summary when context provided', () => {
      const { manager, beth } = createTestSetup();
      const ctx = new ConversationContext(beth);
      ctx.addUserMessage('Plan authentication');
      ctx.addAssistantMessage('I recommend JWT tokens.');

      const request = manager.prepareHandoff(beth, 'developer', 'Implement auth', ctx);

      assert.ok(request);
      assert.ok(request!.conversationSummary);
      assert.strictEqual(request!.conversationSummary!.agentId, 'beth');
      assert.strictEqual(request!.conversationSummary!.turnCount, 1);
    });

    it('should return null for unknown target agent', () => {
      const { manager, beth } = createTestSetup();
      const request = manager.prepareHandoff(beth, 'nonexistent');

      assert.strictEqual(request, null);
    });

    it('should use autoSend from handoff definition', () => {
      const { manager, beth } = createTestSetup();

      // Tester handoff has send: true
      const request = manager.prepareHandoff(beth, 'tester');
      assert.ok(request);
      assert.strictEqual(request!.autoSend, true);
    });
  });

  describe('Handoff Execution', () => {
    it('should execute a valid handoff', () => {
      const { manager, beth } = createTestSetup();
      const request = manager.prepareHandoff(beth, 'developer')!;
      const result = manager.executeHandoff(request);

      assert.strictEqual(result.executed, true);
      assert.ok(result.targetAgent);
      assert.strictEqual(result.targetAgent!.id, 'developer');
    });

    it('should fail for unknown target agent', () => {
      const { manager } = createTestSetup();
      const request = {
        fromAgentId: 'beth',
        toAgentId: 'nonexistent',
        prompt: 'Do something',
        label: 'Test',
        autoSend: false,
      };

      const result = manager.executeHandoff(request);

      assert.strictEqual(result.executed, false);
      assert.ok(result.reason?.includes('not found'));
    });

    it('should record handoff in history', () => {
      const { manager, beth } = createTestSetup();
      const request = manager.prepareHandoff(beth, 'developer')!;
      manager.executeHandoff(request);

      const history = manager.getHistory();
      assert.strictEqual(history.length, 1);
      assert.strictEqual(history[0].executed, true);
      assert.strictEqual(history[0].request.toAgentId, 'developer');
    });
  });

  describe('Depth Limits', () => {
    it('should enforce maximum handoff depth', () => {
      const { manager, beth, developer, tester } = createTestSetup(3);

      // Execute 3 handoffs
      manager.executeHandoff(manager.prepareHandoff(beth, 'developer')!);
      manager.executeHandoff(manager.prepareHandoff(developer, 'tester')!);
      manager.executeHandoff(manager.prepareHandoff(tester, 'developer')!);

      // 4th should fail
      const request = manager.prepareHandoff(developer, 'tester')!;
      const result = manager.executeHandoff(request);

      assert.strictEqual(result.executed, false);
      assert.ok(result.reason?.includes('depth limit'));
    });

    it('should detect ping-pong loops (A→B→A→B)', () => {
      const { manager, beth, developer } = createTestSetup(20);

      // Create a ping-pong pattern
      manager.executeHandoff(manager.prepareHandoff(beth, 'developer')!);
      manager.executeHandoff(manager.prepareHandoff(developer, 'beth')!);
      manager.executeHandoff(manager.prepareHandoff(beth, 'developer')!);
      manager.executeHandoff(manager.prepareHandoff(developer, 'beth')!);

      // 5th should be caught as a loop
      const request = manager.prepareHandoff(beth, 'developer')!;
      const result = manager.executeHandoff(request);

      assert.strictEqual(result.executed, false);
    });

    it('should track depth correctly', () => {
      const { manager, beth } = createTestSetup();
      assert.strictEqual(manager.getDepth(), 0);

      manager.executeHandoff(manager.prepareHandoff(beth, 'developer')!);
      assert.strictEqual(manager.getDepth(), 1);
    });
  });

  describe('Context Transfer', () => {
    it('should build handoff context string', () => {
      const { manager, beth } = createTestSetup();
      const ctx = new ConversationContext(beth);
      ctx.addUserMessage('Build auth');
      ctx.addAssistantMessage('I recommend JWT.');

      const request = manager.prepareHandoff(beth, 'developer', 'Implement auth', ctx)!;
      const context = manager.buildHandoffContext(request);

      assert.ok(context.includes('Handoff from beth'));
      assert.ok(context.includes('Development'));
      assert.ok(context.includes('Implement auth'));
      assert.ok(context.includes('JWT'));
    });

    it('should include tool call summary in context', () => {
      const { manager, beth } = createTestSetup();
      const ctx = new ConversationContext(beth);
      ctx.addUserMessage('Read the config');
      ctx.addAssistantToolCalls(
        [{ id: 'tc1', type: 'function', function: { name: 'readFile', arguments: '{"path":"config.ts"}' } }]
      );
      ctx.addToolResult('tc1', 'export const config = {};');
      ctx.addAssistantMessage('Config is empty.');

      const request = manager.prepareHandoff(beth, 'developer', 'Update config', ctx)!;
      const context = manager.buildHandoffContext(request);

      assert.ok(context.includes('Tools used'));
      assert.ok(context.includes('readFile'));
    });
  });

  describe('History Management', () => {
    it('should clear history', () => {
      const { manager, beth } = createTestSetup();

      manager.executeHandoff(manager.prepareHandoff(beth, 'developer')!);
      assert.strictEqual(manager.getHistory().length, 1);

      manager.clearHistory();
      assert.strictEqual(manager.getHistory().length, 0);
      assert.strictEqual(manager.getDepth(), 0);
    });

    it('should return a copy of history', () => {
      const { manager, beth } = createTestSetup();
      manager.executeHandoff(manager.prepareHandoff(beth, 'developer')!);

      const history1 = manager.getHistory();
      const history2 = manager.getHistory();

      assert.deepStrictEqual(history1, history2);
      assert.notStrictEqual(history1, history2); // Different array instances
    });
  });
});
