/**
 * Handoff Validation Tests
 *
 * Tests for agent handoff configuration validation.
 * Handoff interface: { label, agent, prompt, send? }
 */

import { describe, it, beforeEach, afterEach } from 'vitest';
import assert from 'node:assert';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { loadAgent, loadAgents } from './loader.js';
import type { AgentHandoff, AgentLoadError } from './types.js';

// Test fixtures directory
const TEST_DIR = join(process.cwd(), 'test-fixtures-handoffs');
const TEMPLATES_AGENTS_DIR = join(process.cwd(), 'templates', '.github', 'agents');

/**
 * Type guard to check if loadAgent result is an error
 */
function isError(result: ReturnType<typeof loadAgent>): result is { error: AgentLoadError } {
  return 'error' in result;
}

/**
 * Create agent file with raw YAML content for more control
 */
function createTestAgentRaw(filename: string, yamlContent: string): string {
  const filePath = join(TEST_DIR, filename);
  const content = `---
${yamlContent}
---

# Test Agent

This is a test agent body.
`;
  writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

describe('Handoff Validation', () => {
  beforeEach(() => {
    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe('Valid handoff configurations', () => {
    it('1. Valid handoff with all required fields (label, agent, prompt) passes', () => {
      const filePath = createTestAgentRaw('valid-handoff.agent.md', `
name: Test Agent
handoffs:
  - label: Switch to Developer
    agent: developer
    prompt: Continue implementing the feature
`);

      const result = loadAgent(filePath);

      assert.ok(!('error' in result), `Should pass validation: ${JSON.stringify(result)}`);
      const { agent } = result as { agent: any };
      assert.strictEqual(agent.frontmatter.handoffs?.length, 1);
      assert.strictEqual(agent.frontmatter.handoffs[0].label, 'Switch to Developer');
      assert.strictEqual(agent.frontmatter.handoffs[0].agent, 'developer');
      assert.strictEqual(agent.frontmatter.handoffs[0].prompt, 'Continue implementing the feature');
    });

    it('2. Valid handoff with optional send: true passes', () => {
      const filePath = createTestAgentRaw('handoff-send-true.agent.md', `
name: Test Agent
handoffs:
  - label: Auto-send to Developer
    agent: developer
    prompt: Start immediately
    send: true
`);

      const result = loadAgent(filePath);

      assert.ok(!('error' in result), `Should pass validation: ${JSON.stringify(result)}`);
      const { agent } = result as { agent: any };
      assert.strictEqual(agent.frontmatter.handoffs?.[0].send, true);
    });

    it('3. Valid handoff with optional send: false passes', () => {
      const filePath = createTestAgentRaw('handoff-send-false.agent.md', `
name: Test Agent
handoffs:
  - label: Prepare for Developer
    agent: developer
    prompt: Review before sending
    send: false
`);

      const result = loadAgent(filePath);

      assert.ok(!('error' in result), `Should pass validation: ${JSON.stringify(result)}`);
      const { agent } = result as { agent: any };
      assert.strictEqual(agent.frontmatter.handoffs?.[0].send, false);
    });

    it('7. Empty handoffs array is valid', () => {
      const filePath = createTestAgentRaw('empty-handoffs.agent.md', `
name: Test Agent
handoffs: []
`);

      const result = loadAgent(filePath);

      assert.ok(!('error' in result), `Should pass validation: ${JSON.stringify(result)}`);
      const { agent } = result as { agent: any };
      assert.ok(Array.isArray(agent.frontmatter.handoffs));
      assert.strictEqual(agent.frontmatter.handoffs?.length, 0);
    });

    it('8. Multiple handoffs in array all get validated', () => {
      const filePath = createTestAgentRaw('multiple-handoffs.agent.md', `
name: Test Agent
handoffs:
  - label: To Developer
    agent: developer
    prompt: Implement this
  - label: To Tester
    agent: tester
    prompt: Test this
  - label: To Designer
    agent: ux-designer
    prompt: Design this
`);

      const result = loadAgent(filePath);

      assert.ok(!('error' in result), `Should pass validation: ${JSON.stringify(result)}`);
      const { agent } = result as { agent: any };
      assert.strictEqual(agent.frontmatter.handoffs?.length, 3);
      assert.strictEqual(agent.frontmatter.handoffs[0].agent, 'developer');
      assert.strictEqual(agent.frontmatter.handoffs[1].agent, 'tester');
      assert.strictEqual(agent.frontmatter.handoffs[2].agent, 'ux-designer');
    });

    it('13. Handoff with extra fields (ignored) passes', () => {
      const filePath = createTestAgentRaw('handoff-extra-fields.agent.md', `
name: Test Agent
handoffs:
  - label: To Developer
    agent: developer
    prompt: Do the thing
    extraField: should be ignored
    anotherExtra: also ignored
`);

      const result = loadAgent(filePath);

      assert.ok(!('error' in result), `Should pass validation: ${JSON.stringify(result)}`);
      const { agent } = result as { agent: any };
      assert.strictEqual(agent.frontmatter.handoffs?.length, 1);
      // Extra fields should be ignored in the normalized output
      assert.strictEqual(agent.frontmatter.handoffs[0].label, 'To Developer');
      assert.strictEqual(agent.frontmatter.handoffs[0].agent, 'developer');
      assert.strictEqual(agent.frontmatter.handoffs[0].prompt, 'Do the thing');
    });
  });

  describe('Invalid handoff configurations', () => {
    it('4. Handoff missing label fails validation', () => {
      const filePath = createTestAgentRaw('missing-label.agent.md', `
name: Test Agent
handoffs:
  - agent: developer
    prompt: Do work
`);

      const result = loadAgent(filePath);

      assert.ok(isError(result), 'Should fail validation');
      assert.ok(
        result.error.message.includes('missing required fields') ||
        result.error.message.includes('label'),
        `Error should mention missing fields: ${result.error.message}`
      );
    });

    it('5. Handoff missing agent fails validation', () => {
      const filePath = createTestAgentRaw('missing-agent.agent.md', `
name: Test Agent
handoffs:
  - label: To Someone
    prompt: Do work
`);

      const result = loadAgent(filePath);

      assert.ok(isError(result), 'Should fail validation');
      assert.ok(
        result.error.message.includes('missing required fields') ||
        result.error.message.includes('agent'),
        `Error should mention missing fields: ${result.error.message}`
      );
    });

    it('6. Handoff missing prompt fails validation', () => {
      const filePath = createTestAgentRaw('missing-prompt.agent.md', `
name: Test Agent
handoffs:
  - label: To Developer
    agent: developer
`);

      const result = loadAgent(filePath);

      assert.ok(isError(result), 'Should fail validation');
      assert.ok(
        result.error.message.includes('missing required fields') ||
        result.error.message.includes('prompt'),
        `Error should mention missing fields: ${result.error.message}`
      );
    });

    it('9. Handoff with empty string label fails validation', () => {
      const filePath = createTestAgentRaw('empty-label.agent.md', `
name: Test Agent
handoffs:
  - label: ""
    agent: developer
    prompt: Do work
`);

      const result = loadAgent(filePath);

      assert.ok(isError(result), 'Should fail validation for empty label');
      assert.ok(
        result.error.message.includes('missing required fields') ||
        result.error.message.includes('label'),
        `Error should mention missing/empty fields: ${result.error.message}`
      );
    });

    it('10. Handoff with empty string agent fails validation', () => {
      const filePath = createTestAgentRaw('empty-agent.agent.md', `
name: Test Agent
handoffs:
  - label: To Someone
    agent: ""
    prompt: Do work
`);

      const result = loadAgent(filePath);

      assert.ok(isError(result), 'Should fail validation for empty agent');
      assert.ok(
        result.error.message.includes('missing required fields') ||
        result.error.message.includes('agent'),
        `Error should mention missing/empty fields: ${result.error.message}`
      );
    });

    it('11. Handoff with empty string prompt fails validation', () => {
      const filePath = createTestAgentRaw('empty-prompt.agent.md', `
name: Test Agent
handoffs:
  - label: To Developer
    agent: developer
    prompt: ""
`);

      const result = loadAgent(filePath);

      assert.ok(isError(result), 'Should fail validation for empty prompt');
      assert.ok(
        result.error.message.includes('missing required fields') ||
        result.error.message.includes('prompt'),
        `Error should mention missing/empty fields: ${result.error.message}`
      );
    });

    it('12. Non-array handoffs value fails', () => {
      const filePath = createTestAgentRaw('non-array-handoffs.agent.md', `
name: Test Agent
handoffs: "not an array"
`);

      const result = loadAgent(filePath);

      assert.ok(isError(result), 'Should fail validation for non-array handoffs');
      assert.ok(
        result.error.message.includes('must be an array'),
        `Error should mention array requirement: ${result.error.message}`
      );
    });

    it('Non-array handoffs value (object) fails', () => {
      const filePath = createTestAgentRaw('object-handoffs.agent.md', `
name: Test Agent
handoffs:
  label: Single handoff as object
  agent: developer
  prompt: This is wrong
`);

      const result = loadAgent(filePath);

      // YAML interprets this as an object with keys, not an array
      assert.ok(isError(result), 'Should fail validation for object handoffs');
      assert.ok(
        result.error.message.includes('must be an array'),
        `Error should mention array requirement: ${result.error.message}`
      );
    });

    it('8. Multiple handoffs - second one invalid fails entire validation', () => {
      const filePath = createTestAgentRaw('second-invalid.agent.md', `
name: Test Agent
handoffs:
  - label: Valid One
    agent: developer
    prompt: This is valid
  - label: Invalid One
    agent: tester
`);

      const result = loadAgent(filePath);

      assert.ok(isError(result), 'Should fail when any handoff is invalid');
      assert.ok(
        result.error.message.includes('index 1') ||
        result.error.message.includes('missing required fields'),
        `Error should indicate which handoff failed: ${result.error.message}`
      );
    });
  });

  describe('Real agent files validation', () => {
    it('14. Test actual agent files have valid handoffs pointing to existing agents', () => {
      const result = loadAgents(TEMPLATES_AGENTS_DIR);

      // Should load without errors
      assert.strictEqual(
        result.errors.length,
        0,
        `Agent loading errors: ${JSON.stringify(result.errors)}`
      );

      // Build set of all agent IDs
      const agentIds = new Set(result.agents.map((a) => a.id.toLowerCase()));

      // Check every handoff references an existing agent
      const handoffErrors: string[] = [];

      for (const agent of result.agents) {
        const handoffs = agent.frontmatter.handoffs ?? [];

        for (const handoff of handoffs) {
          const targetAgent = handoff.agent.toLowerCase();

          if (!agentIds.has(targetAgent)) {
            handoffErrors.push(
              `Agent '${agent.id}' has handoff to non-existent agent '${handoff.agent}'`
            );
          }

          // Also verify required fields are present and non-empty
          if (!handoff.label || handoff.label.trim() === '') {
            handoffErrors.push(`Agent '${agent.id}' has handoff with empty label`);
          }
          if (!handoff.agent || handoff.agent.trim() === '') {
            handoffErrors.push(`Agent '${agent.id}' has handoff with empty agent`);
          }
          if (!handoff.prompt || handoff.prompt.trim() === '') {
            handoffErrors.push(`Agent '${agent.id}' has handoff with empty prompt`);
          }
        }
      }

      assert.strictEqual(
        handoffErrors.length,
        0,
        `Handoff validation errors:\n${handoffErrors.join('\n')}`
      );
    });

    it('All agents with handoffs have at least label, agent, and prompt', () => {
      const result = loadAgents(TEMPLATES_AGENTS_DIR);

      for (const agent of result.agents) {
        if (!agent.frontmatter.handoffs) continue;

        for (let i = 0; i < agent.frontmatter.handoffs.length; i++) {
          const handoff: AgentHandoff = agent.frontmatter.handoffs[i];

          assert.ok(
            typeof handoff.label === 'string' && handoff.label.length > 0,
            `${agent.id} handoff[${i}] should have non-empty label`
          );
          assert.ok(
            typeof handoff.agent === 'string' && handoff.agent.length > 0,
            `${agent.id} handoff[${i}] should have non-empty agent`
          );
          assert.ok(
            typeof handoff.prompt === 'string' && handoff.prompt.length > 0,
            `${agent.id} handoff[${i}] should have non-empty prompt`
          );

          // send should be boolean or undefined
          if (handoff.send !== undefined) {
            assert.strictEqual(
              typeof handoff.send,
              'boolean',
              `${agent.id} handoff[${i}].send should be boolean if present`
            );
          }
        }
      }
    });

    it('Beth agent has handoffs to all expected specialists', () => {
      const result = loadAgents(TEMPLATES_AGENTS_DIR);
      const beth = result.agents.find((a) => a.id === 'beth');

      assert.ok(beth, 'Beth agent should exist');
      assert.ok(beth.frontmatter.handoffs, 'Beth should have handoffs');

      const handoffTargets = beth.frontmatter.handoffs!.map((h) => h.agent.toLowerCase());
      const expectedTargets = ['developer', 'product-manager', 'ux-designer', 'tester', 'researcher'];

      for (const expected of expectedTargets) {
        assert.ok(
          handoffTargets.includes(expected),
          `Beth should have handoff to ${expected}`
        );
      }
    });
  });
});
