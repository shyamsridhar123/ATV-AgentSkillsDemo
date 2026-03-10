/**
 * Agent Suite Integration Tests
 *
 * Validates the complete Beth agent suite is coherent and functional together.
 * Tests all 7 agents: beth, developer, product-manager, researcher, security-reviewer, tester, ux-designer
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { join } from 'node:path';
import {
  loadAgents,
  getAgentById,
  getInferableAgents,
} from './loader.js';

// Test against templates directory - the source of truth for agent definitions
const TEMPLATES_AGENTS_DIR = join(process.cwd(), 'templates', '.github', 'agents');

// Expected agent IDs (from filenames)
const EXPECTED_AGENT_IDS = [
  'beth',
  'developer',
  'product-manager',
  'researcher',
  'security-reviewer',
  'tester',
  'ux-designer',
] as const;

const EXPECTED_AGENT_COUNT = 7;

describe('Agent Suite Integration Tests', () => {
  // Load agents once for all tests
  const result = loadAgents(TEMPLATES_AGENTS_DIR);

  describe('Suite Loading', () => {
    it('1. All 7 agent files load without errors', () => {
      assert.strictEqual(
        result.errors.length,
        0,
        `Agent loading errors: ${JSON.stringify(result.errors, null, 2)}`
      );
      assert.strictEqual(
        result.agents.length,
        EXPECTED_AGENT_COUNT,
        `Expected ${EXPECTED_AGENT_COUNT} agents, got ${result.agents.length}`
      );
    });

    it('15. Agent file count matches expected (7 agents)', () => {
      assert.strictEqual(
        result.agents.length,
        EXPECTED_AGENT_COUNT,
        `Expected exactly ${EXPECTED_AGENT_COUNT} agents`
      );

      const loadedIds = result.agents.map((a) => a.id).sort();
      const expectedIds = [...EXPECTED_AGENT_IDS].sort();
      assert.deepStrictEqual(loadedIds, expectedIds, 'Agent IDs should match expected set');
    });
  });

  describe('Required Fields', () => {
    it('2. All agents have required name field', () => {
      for (const agent of result.agents) {
        assert.ok(
          agent.frontmatter.name,
          `Agent ${agent.id} is missing required 'name' field`
        );
        assert.strictEqual(
          typeof agent.frontmatter.name,
          'string',
          `Agent ${agent.id} 'name' must be a string`
        );
        assert.ok(
          agent.frontmatter.name.length > 0,
          `Agent ${agent.id} 'name' must be non-empty`
        );
      }
    });

    it('3. All agents have description field', () => {
      for (const agent of result.agents) {
        assert.ok(
          agent.frontmatter.description,
          `Agent ${agent.id} is missing 'description' field`
        );
        assert.strictEqual(
          typeof agent.frontmatter.description,
          'string',
          `Agent ${agent.id} 'description' must be a string`
        );
        assert.ok(
          agent.frontmatter.description.length > 0,
          `Agent ${agent.id} 'description' must be non-empty`
        );
      }
    });

    it('14. All markdown bodies are non-empty', () => {
      for (const agent of result.agents) {
        assert.ok(
          agent.body,
          `Agent ${agent.id} has no body content`
        );
        assert.ok(
          agent.body.length > 50,
          `Agent ${agent.id} body is too short (${agent.body.length} chars), expected substantial instructions`
        );
      }
    });
  });

  describe('Beth Agent Specifics', () => {
    it('4. Beth agent is inferable (can be invoked as subagent)', () => {
      const beth = getAgentById(result, 'beth');
      assert.ok(beth, 'Beth agent must exist');
      // infer: true is deprecated — agents are inferable by default
      assert.ok(
        beth.frontmatter.infer !== false,
        'Beth must be inferable (not explicitly set to infer: false)'
      );
    });

    it('5. Beth agent has agent tool for subagent invocation', () => {
      const beth = getAgentById(result, 'beth');
      assert.ok(beth, 'Beth agent must exist');
      assert.ok(
        Array.isArray(beth.frontmatter.tools),
        'Beth must have tools array'
      );
      // The 'agent' tool is what enables spawning subagents in VS Code agents
      assert.ok(
        beth.frontmatter.tools.includes('agent'),
        `Beth must have 'agent' tool for subagent invocation. Found tools: ${beth.frontmatter.tools.join(', ')}`
      );
    });
  });

  describe('Uniqueness Constraints', () => {
    it('6. All agent names are unique', () => {
      const names = result.agents.map((a) => a.frontmatter.name);
      const uniqueNames = new Set(names);

      assert.strictEqual(
        uniqueNames.size,
        names.length,
        `Duplicate agent names found: ${findDuplicates(names).join(', ')}`
      );
    });

    it('7. All agent IDs (from filename) are unique', () => {
      const ids = result.agents.map((a) => a.id);
      const uniqueIds = new Set(ids);

      assert.strictEqual(
        uniqueIds.size,
        ids.length,
        `Duplicate agent IDs found: ${findDuplicates(ids).join(', ')}`
      );
    });
  });

  describe('Handoff Validation', () => {
    it('8. Handoff references are valid (target agents exist)', () => {
      const agentIds = new Set(result.agents.map((a) => a.id));
      const agentNames = new Set(
        result.agents.map((a) => a.frontmatter.name).filter(Boolean) as string[]
      );
      const validTargets = new Set([...agentIds, ...agentNames]);

      for (const agent of result.agents) {
        const handoffs = agent.frontmatter.handoffs ?? [];

        for (const handoff of handoffs) {
          assert.ok(
            validTargets.has(handoff.agent),
            `Agent ${agent.id} has handoff to non-existent agent '${handoff.agent}'. ` +
              `Valid agents: ${[...validTargets].join(', ')}`
          );
        }
      }
    });

    it('9. No circular handoff chains (single handoff does not create infinite loop)', () => {
      // Build handoff graph
      const handoffGraph = new Map<string, string[]>();

      for (const agent of result.agents) {
        const targets = (agent.frontmatter.handoffs ?? []).map((h) => h.agent);
        handoffGraph.set(agent.id, targets);
      }

      // Check for self-referential handoffs (immediate loop)
      for (const agent of result.agents) {
        const targets = handoffGraph.get(agent.id) ?? [];
        assert.ok(
          !targets.includes(agent.id),
          `Agent ${agent.id} has self-referential handoff (hands off to itself)`
        );
      }

      // Note: Bidirectional handoffs (A -> B and B -> A) are allowed
      // They represent valid collaboration patterns, not infinite loops
      // The warning is that a single handoff chain shouldn't loop back
    });
  });

  describe('Subagent Configuration', () => {
    it('10. All agents returned by getInferableAgents are not explicitly disabled', () => {
      const inferableAgents = getInferableAgents(result);

      // Verify all returned agents are not explicitly set to infer: false
      for (const agent of inferableAgents) {
        assert.ok(
          agent.frontmatter.infer !== false,
          `Agent ${agent.id} returned by getInferableAgents but has infer: false`
        );
      }

      // Beth should be in the list
      const bethInferable = inferableAgents.some((a) => a.id === 'beth');
      assert.ok(bethInferable, 'Beth must be inferable');
    });
  });

  describe('Agent-Specific Tool Requirements', () => {
    it('11. Developer agent has edit tools (editFiles, createFile)', () => {
      const developer = getAgentById(result, 'developer');
      assert.ok(developer, 'Developer agent must exist');
      assert.ok(
        Array.isArray(developer.frontmatter.tools),
        'Developer must have tools array'
      );

      const tools = developer.frontmatter.tools;
      assert.ok(
        tools.includes('editFiles'),
        `Developer must have 'editFiles' tool. Found: ${tools.join(', ')}`
      );
      assert.ok(
        tools.includes('createFile'),
        `Developer must have 'createFile' tool. Found: ${tools.join(', ')}`
      );
    });

    it('12. Security-reviewer agent exists and has appropriate tools', () => {
      const securityReviewer = getAgentById(result, 'security-reviewer');
      assert.ok(securityReviewer, 'Security-reviewer agent must exist');

      assert.ok(
        securityReviewer.frontmatter.name,
        'Security-reviewer must have a name'
      );
      assert.ok(
        securityReviewer.frontmatter.description,
        'Security-reviewer must have a description'
      );

      // Security reviewer should have code analysis tools
      const tools = securityReviewer.frontmatter.tools ?? [];
      assert.ok(
        tools.length > 0,
        'Security-reviewer should have tools for code analysis'
      );

      // Should have at least codebase or textSearch for finding vulnerabilities
      const hasAnalysisTools = tools.some((t) =>
        ['codebase', 'textSearch', 'readFile', 'fileSearch'].includes(t)
      );
      assert.ok(
        hasAnalysisTools,
        `Security-reviewer should have analysis tools. Found: ${tools.join(', ')}`
      );
    });
  });

  describe('Role Differentiation', () => {
    it('13. Product-manager and ux-designer are distinct agents', () => {
      const productManager = getAgentById(result, 'product-manager');
      const uxDesigner = getAgentById(result, 'ux-designer');

      assert.ok(productManager, 'Product-manager agent must exist');
      assert.ok(uxDesigner, 'UX-designer agent must exist');

      // Different IDs
      assert.notStrictEqual(
        productManager.id,
        uxDesigner.id,
        'Product-manager and UX-designer must have different IDs'
      );

      // Different names
      assert.notStrictEqual(
        productManager.frontmatter.name,
        uxDesigner.frontmatter.name,
        'Product-manager and UX-designer must have different names'
      );

      // Different descriptions (they serve different purposes)
      assert.notStrictEqual(
        productManager.frontmatter.description,
        uxDesigner.frontmatter.description,
        'Product-manager and UX-designer should have different descriptions'
      );

      // Different body content (different instructions)
      assert.notStrictEqual(
        productManager.body,
        uxDesigner.body,
        'Product-manager and UX-designer must have different instructions'
      );
    });
  });

  describe('Cross-Agent Consistency', () => {
    it('All expected agents are present and loadable', () => {
      for (const expectedId of EXPECTED_AGENT_IDS) {
        const agent = getAgentById(result, expectedId);
        assert.ok(
          agent,
          `Expected agent '${expectedId}' is missing from the suite`
        );
      }
    });

    it('All agents can be found by getAgentById', () => {
      for (const agent of result.agents) {
        const found = getAgentById(result, agent.id);
        assert.ok(found, `Agent ${agent.id} should be findable by ID`);
        assert.strictEqual(found.id, agent.id);
      }
    });

    it('Agent handoff network is well-connected (Beth has handoffs to specialists)', () => {
      const beth = getAgentById(result, 'beth');
      assert.ok(beth, 'Beth must exist');

      const bethHandoffs = beth.frontmatter.handoffs ?? [];
      const handoffTargets = new Set(bethHandoffs.map((h) => h.agent));

      // Beth should be able to hand off to at least the core specialist agents
      const coreSpecialists = ['developer', 'product-manager', 'ux-designer'];
      for (const specialist of coreSpecialists) {
        assert.ok(
          handoffTargets.has(specialist),
          `Beth should have handoff to ${specialist}. ` +
            `Found handoffs to: ${[...handoffTargets].join(', ')}`
        );
      }
    });
  });
});

/**
 * Helper to find duplicate values in an array.
 */
function findDuplicates(arr: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const item of arr) {
    if (seen.has(item)) {
      duplicates.add(item);
    }
    seen.add(item);
  }

  return [...duplicates];
}
