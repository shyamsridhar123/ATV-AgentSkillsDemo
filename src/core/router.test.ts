/**
 * AgentRouter Tests
 *
 * Tests for agent routing: @mention parsing, skill trigger matching,
 * agent resolution, and default routing behavior.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { AgentRouter } from './router.js';
import type { AgentLoadResult, AgentDefinition } from './agents/types.js';
import type { SkillLoadResult, SkillDefinition } from './skills/types.js';

// =============================================================================
// Test Fixtures
// =============================================================================

function createAgent(id: string, name: string, infer?: boolean): AgentDefinition {
  return {
    id,
    frontmatter: {
      name,
      description: `${name} agent`,
      tools: ['readFile'],
      infer,
      handoffs: [
        { label: 'Test Handoff', agent: 'tester', prompt: 'Test this' },
      ],
    },
    body: `# ${name}`,
    sourcePath: `/agents/${id}.agent.md`,
  };
}

function createSkill(id: string, name: string, triggers: string[]): SkillDefinition {
  return {
    id,
    frontmatter: { name, description: `Triggers on: ${triggers.join(', ')}` },
    body: `Skill content for ${name}`,
    sourcePath: `/skills/${id}/SKILL.md`,
    triggers,
  };
}

function createTestRouter(
  agents?: AgentDefinition[],
  skills?: SkillDefinition[],
  defaultId?: string
): AgentRouter {
  const agentResult: AgentLoadResult = {
    agents: agents ?? [
      createAgent('beth', 'Beth', true),
      createAgent('developer', 'developer', true),
      createAgent('tester', 'tester', true),
      createAgent('product-manager', 'product-manager', true),
      createAgent('ux-designer', 'ux-designer', true),
    ],
    errors: [],
  };

  const skillResult: SkillLoadResult = {
    skills: skills ?? [
      createSkill('prd', 'PRD Generation', ['create a prd', 'product requirements']),
      createSkill('shadcn-ui', 'shadcn/ui', ['shadcn', 'ui component']),
    ],
    errors: [],
  };

  return new AgentRouter(agentResult, skillResult, defaultId ?? 'beth');
}

// =============================================================================
// Tests
// =============================================================================

describe('AgentRouter', () => {
  describe('Construction', () => {
    it('should create with agents and skills', () => {
      const router = createTestRouter();

      assert.ok(router.hasAgent('beth'));
      assert.ok(router.hasAgent('developer'));
      assert.strictEqual(router.getAgents().length, 5);
    });

    it('should handle empty agents', () => {
      assert.throws(() => {
        const router = createTestRouter([]);
        router.route('hello');
      }, /No agents loaded/);
    });
  });

  describe('Route by @mention', () => {
    it('should route @developer to developer agent', () => {
      const router = createTestRouter();
      const result = router.route('@developer implement login');

      assert.strictEqual(result.agent.id, 'developer');
      assert.strictEqual(result.reason, 'mention');
      assert.strictEqual(result.cleanedPrompt, 'implement login');
    });

    it('should route @Beth to Beth agent (case-insensitive name)', () => {
      const router = createTestRouter();
      const result = router.route('@Beth plan a feature');

      assert.strictEqual(result.agent.id, 'beth');
      assert.strictEqual(result.reason, 'mention');
      assert.strictEqual(result.cleanedPrompt, 'plan a feature');
    });

    it('should route @product-manager correctly', () => {
      const router = createTestRouter();
      const result = router.route('@product-manager create a PRD');

      assert.strictEqual(result.agent.id, 'product-manager');
      assert.strictEqual(result.reason, 'mention');
    });

    it('should fall through to default for unknown @mention', () => {
      const router = createTestRouter();
      const result = router.route('@unknown-agent do something');

      // Unknown mention falls through to default behavior
      assert.strictEqual(result.reason, 'default');
    });

    it('should handle @mention with no trailing text', () => {
      const router = createTestRouter();
      const result = router.route('@developer');

      // '@developer' without trailing text — the match won't capture the second group
      // This should fall through since the regex requires whitespace after the mention
      assert.ok(result.agent !== undefined);
    });
  });

  describe('Route with skill matching', () => {
    it('should find matching skills in user message', () => {
      const router = createTestRouter();
      const result = router.route('create a prd for authentication');

      assert.ok(result.matchedSkills.length > 0);
      assert.strictEqual(result.matchedSkills[0].id, 'prd');
    });

    it('should find shadcn skills', () => {
      const router = createTestRouter();
      const result = router.route('add a shadcn button component');

      assert.ok(result.matchedSkills.length > 0);
      assert.strictEqual(result.matchedSkills[0].id, 'shadcn-ui');
    });

    it('should return empty skills when no triggers match', () => {
      const router = createTestRouter();
      const result = router.route('hello world');

      assert.strictEqual(result.matchedSkills.length, 0);
    });

    it('should combine @mention routing with skill matching', () => {
      const router = createTestRouter();
      const result = router.route('@developer create a shadcn button');

      assert.strictEqual(result.agent.id, 'developer');
      assert.strictEqual(result.reason, 'mention');
      assert.ok(result.matchedSkills.length > 0);
    });
  });

  describe('Default routing', () => {
    it('should default to Beth when no mention or current agent', () => {
      const router = createTestRouter();
      const result = router.route('do something');

      assert.strictEqual(result.agent.id, 'beth');
      assert.strictEqual(result.reason, 'default');
    });

    it('should stay with current agent when one is active', () => {
      const router = createTestRouter();
      const result = router.route('do something else', 'developer');

      assert.strictEqual(result.agent.id, 'developer');
      assert.strictEqual(result.reason, 'default');
    });

    it('@mention should override current agent', () => {
      const router = createTestRouter();
      const result = router.route('@tester test this', 'developer');

      assert.strictEqual(result.agent.id, 'tester');
      assert.strictEqual(result.reason, 'mention');
    });
  });

  describe('Agent resolution', () => {
    it('should resolve by ID', () => {
      const router = createTestRouter();
      const agent = router.resolveAgent('developer');
      assert.strictEqual(agent?.id, 'developer');
    });

    it('should resolve by name (case-insensitive)', () => {
      const router = createTestRouter();
      const agent = router.resolveAgent('Beth');
      assert.strictEqual(agent?.id, 'beth');
    });

    it('should return undefined for unknown agent', () => {
      const router = createTestRouter();
      const agent = router.resolveAgent('nonexistent');
      assert.strictEqual(agent, undefined);
    });

    it('should check agent existence', () => {
      const router = createTestRouter();
      assert.strictEqual(router.hasAgent('developer'), true);
      assert.strictEqual(router.hasAgent('nonexistent'), false);
    });
  });

  describe('Inferable agents', () => {
    it('should return agents with infer: true', () => {
      const router = createTestRouter();
      const inferable = router.getInferableAgents();

      assert.ok(inferable.length > 0);
      for (const agent of inferable) {
        assert.strictEqual(agent.frontmatter.infer, true);
      }
    });

    it('should not include non-inferable agents', () => {
      const agents = [
        createAgent('beth', 'Beth', true),
        createAgent('helper', 'Helper', false),
        createAgent('developer', 'developer', true),
      ];
      const router = createTestRouter(agents);
      const inferable = router.getInferableAgents();

      assert.strictEqual(inferable.length, 2);
      const ids = inferable.map((a) => a.id);
      assert.ok(!ids.includes('helper'));
    });
  });

  describe('Default agent', () => {
    it('should return the configured default agent', () => {
      const router = createTestRouter(undefined, undefined, 'beth');
      const agent = router.getDefaultAgent();
      assert.strictEqual(agent.id, 'beth');
    });

    it('should fallback to first agent if default not found', () => {
      const agents = [createAgent('dev', 'Developer')];
      const router = createTestRouter(agents, [], 'nonexistent');
      const agent = router.getDefaultAgent();
      assert.strictEqual(agent.id, 'dev');
    });
  });
});
