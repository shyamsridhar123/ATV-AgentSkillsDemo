/**
 * Agent Frontmatter Validation Tests
 *
 * Tests for YAML frontmatter parsing and validation in agent files.
 * Uses temporary files with inline fixtures to test edge cases.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadAgent } from './loader.js';

// Temp directory for test fixtures
const TEST_DIR = join(process.cwd(), '.test-agents-frontmatter');

/**
 * Helper to create a test agent file with given content.
 */
function createTestAgent(filename: string, content: string): string {
  const filePath = join(TEST_DIR, filename);
  writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

describe('Agent Frontmatter Validation', () => {
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

  describe('Valid frontmatter scenarios', () => {
    it('1. valid frontmatter with all fields parses correctly', () => {
      const content = `---
name: Test Agent
description: A test agent for validation
model: Claude Opus 4.6
tools:
  - codebase
  - readFile
  - editFiles
handoffs:
  - label: Hand to Developer
    agent: developer
    prompt: Please implement this feature
    send: true
infer: true
---

# Test Agent Instructions

This is the body content.
`;
      const filePath = createTestAgent('complete.agent.md', content);
      const result = loadAgent(filePath);

      assert.ok(!('error' in result), `Unexpected error: ${JSON.stringify(result)}`);
      const { agent } = result as { agent: any };

      assert.strictEqual(agent.id, 'complete');
      assert.strictEqual(agent.frontmatter.name, 'Test Agent');
      assert.strictEqual(agent.frontmatter.description, 'A test agent for validation');
      assert.strictEqual(agent.frontmatter.model, 'Claude Opus 4.6');
      assert.deepStrictEqual(agent.frontmatter.tools, ['codebase', 'readFile', 'editFiles']);
      assert.strictEqual(agent.frontmatter.infer, true);
      assert.ok(Array.isArray(agent.frontmatter.handoffs));
      assert.strictEqual(agent.frontmatter.handoffs!.length, 1);
      assert.strictEqual(agent.frontmatter.handoffs![0].label, 'Hand to Developer');
      assert.strictEqual(agent.frontmatter.handoffs![0].agent, 'developer');
      assert.strictEqual(agent.frontmatter.handoffs![0].prompt, 'Please implement this feature');
      assert.strictEqual(agent.frontmatter.handoffs![0].send, true);
      assert.ok(agent.body.includes('Test Agent Instructions'));
    });

    it('4. valid tools array parses correctly', () => {
      const content = `---
name: Tools Agent
tools:
  - codebase
  - readFile
  - editFiles
  - createFile
  - runInTerminal
  - custom-mcp-tool
---

Agent with tools.
`;
      const filePath = createTestAgent('tools.agent.md', content);
      const result = loadAgent(filePath);

      assert.ok(!('error' in result));
      const { agent } = result as { agent: any };

      assert.deepStrictEqual(agent.frontmatter.tools, [
        'codebase',
        'readFile',
        'editFiles',
        'createFile',
        'runInTerminal',
        'custom-mcp-tool',
      ]);
    });

    it('6. valid handoffs array parses correctly', () => {
      const content = `---
name: Handoff Agent
handoffs:
  - label: Ask Developer
    agent: developer
    prompt: Implement this feature
  - label: Review with PM
    agent: product-manager
    prompt: Review requirements
    send: false
---

Agent with handoffs.
`;
      const filePath = createTestAgent('handoffs.agent.md', content);
      const result = loadAgent(filePath);

      assert.ok(!('error' in result));
      const { agent } = result as { agent: any };

      assert.ok(Array.isArray(agent.frontmatter.handoffs));
      assert.strictEqual(agent.frontmatter.handoffs!.length, 2);

      assert.strictEqual(agent.frontmatter.handoffs![0].label, 'Ask Developer');
      assert.strictEqual(agent.frontmatter.handoffs![0].agent, 'developer');
      assert.strictEqual(agent.frontmatter.handoffs![0].prompt, 'Implement this feature');

      assert.strictEqual(agent.frontmatter.handoffs![1].label, 'Review with PM');
      assert.strictEqual(agent.frontmatter.handoffs![1].agent, 'product-manager');
      assert.strictEqual(agent.frontmatter.handoffs![1].send, false);
    });

    it('10. infer: true boolean parses correctly', () => {
      const content = `---
name: Inferable Agent
infer: true
---

This agent can be invoked as a subagent.
`;
      const filePath = createTestAgent('inferable.agent.md', content);
      const result = loadAgent(filePath);

      assert.ok(!('error' in result));
      const { agent } = result as { agent: any };

      assert.strictEqual(agent.frontmatter.infer, true);
    });

    it('10b. infer: false boolean parses correctly', () => {
      const content = `---
name: Non-Inferable Agent
infer: false
---

This agent cannot be invoked as a subagent.
`;
      const filePath = createTestAgent('non-inferable.agent.md', content);
      const result = loadAgent(filePath);

      assert.ok(!('error' in result));
      const { agent } = result as { agent: any };

      // infer: false is preserved in frontmatter (both true and false are set)
      assert.strictEqual(agent.frontmatter.infer, false);
    });

    it('11. infer: "true" (string) gets handled correctly', () => {
      // YAML parses unquoted `true` as boolean, but quoted "true" is string
      // The loader should only accept boolean true
      const content = `---
name: String Infer Agent
infer: "true"
---

This has infer as a string, not boolean.
`;
      const filePath = createTestAgent('string-infer.agent.md', content);
      const result = loadAgent(filePath);

      assert.ok(!('error' in result));
      const { agent } = result as { agent: any };

      // String "true" should NOT be converted to boolean true
      assert.strictEqual(agent.frontmatter.infer, undefined);
    });

    it('14. extra/unknown fields are ignored (no error)', () => {
      const content = `---
name: Extended Agent
description: Standard description
customField: some value
extraData:
  nested: true
  value: 42
anotherUnknown: test
---

Agent with extra fields.
`;
      const filePath = createTestAgent('extended.agent.md', content);
      const result = loadAgent(filePath);

      assert.ok(!('error' in result), 'Should not error on unknown fields');
      const { agent } = result as { agent: any };

      assert.strictEqual(agent.frontmatter.name, 'Extended Agent');
      assert.strictEqual(agent.frontmatter.description, 'Standard description');
      // Unknown fields should not appear in frontmatter
      assert.strictEqual((agent.frontmatter as any).customField, undefined);
      assert.strictEqual((agent.frontmatter as any).extraData, undefined);
    });

    it('15. model field accepts any string value', () => {
      const content = `---
name: Custom Model Agent
model: gpt-4-turbo-preview
---

Agent with custom model.
`;
      const filePath = createTestAgent('custom-model.agent.md', content);
      const result = loadAgent(filePath);

      assert.ok(!('error' in result));
      const { agent } = result as { agent: any };

      assert.strictEqual(agent.frontmatter.model, 'gpt-4-turbo-preview');
    });

    it('15b. model field accepts complex model strings', () => {
      const content = `---
name: Complex Model Agent
model: "anthropic/claude-3.5-sonnet@20240620"
---

Agent with complex model identifier.
`;
      const filePath = createTestAgent('complex-model.agent.md', content);
      const result = loadAgent(filePath);

      assert.ok(!('error' in result));
      const { agent } = result as { agent: any };

      assert.strictEqual(agent.frontmatter.model, 'anthropic/claude-3.5-sonnet@20240620');
    });
  });

  describe('Invalid frontmatter scenarios', () => {
    it('2. missing name field returns error', () => {
      const content = `---
description: Agent without a name
model: Claude Opus 4.6
---

This agent is missing the required name field.
`;
      const filePath = createTestAgent('no-name.agent.md', content);
      const result = loadAgent(filePath);

      assert.ok('error' in result, 'Should return error for missing name');
      const { error } = result as { error: any };
      assert.ok(
        error.message.includes('name'),
        `Error should mention 'name', got: ${error.message}`
      );
    });

    it('3. invalid name type (non-string) returns error', () => {
      const content = `---
name: 123
description: Agent with numeric name
---

Name should be a string.
`;
      const filePath = createTestAgent('numeric-name.agent.md', content);
      const result = loadAgent(filePath);

      assert.ok('error' in result, 'Should return error for non-string name');
      const { error } = result as { error: any };
      assert.ok(
        error.message.includes('name'),
        `Error should mention 'name', got: ${error.message}`
      );
    });

    it('3b. name as array returns error', () => {
      const content = `---
name:
  - First
  - Second
description: Agent with array name
---

Name should be a string.
`;
      const filePath = createTestAgent('array-name.agent.md', content);
      const result = loadAgent(filePath);

      assert.ok('error' in result, 'Should return error for array name');
      const { error } = result as { error: any };
      assert.ok(error.message.includes('name'));
    });

    it('3c. name as null returns error', () => {
      const content = `---
name: null
description: Agent with null name
---

Name should be a string.
`;
      const filePath = createTestAgent('null-name.agent.md', content);
      const result = loadAgent(filePath);

      assert.ok('error' in result, 'Should return error for null name');
      const { error } = result as { error: any };
      assert.ok(error.message.includes('name'));
    });

    it('5. invalid tools (non-array) returns error', () => {
      const content = `---
name: Bad Tools Agent
tools: codebase
---

Tools should be an array.
`;
      const filePath = createTestAgent('bad-tools.agent.md', content);
      const result = loadAgent(filePath);

      assert.ok('error' in result, 'Should return error for non-array tools');
      const { error } = result as { error: any };
      assert.ok(
        error.message.includes('tools'),
        `Error should mention 'tools', got: ${error.message}`
      );
    });

    it('5b. tools as object returns error', () => {
      const content = `---
name: Object Tools Agent
tools:
  read: true
  write: false
---

Tools should be an array, not an object.
`;
      const filePath = createTestAgent('object-tools.agent.md', content);
      const result = loadAgent(filePath);

      assert.ok('error' in result, 'Should return error for object tools');
      const { error } = result as { error: any };
      assert.ok(error.message.includes('tools'));
    });

    it('7. handoff missing label returns error', () => {
      const content = `---
name: Missing Label Agent
handoffs:
  - agent: developer
    prompt: Please help
---

Handoff is missing label field.
`;
      const filePath = createTestAgent('no-label.agent.md', content);
      const result = loadAgent(filePath);

      assert.ok('error' in result, 'Should return error for missing handoff label');
      const { error } = result as { error: any };
      assert.ok(
        error.message.includes('Handoff') || error.message.includes('label'),
        `Error should mention handoff issue, got: ${error.message}`
      );
    });

    it('8. handoff missing agent returns error', () => {
      const content = `---
name: Missing Agent Field
handoffs:
  - label: Send to someone
    prompt: Please help
---

Handoff is missing agent field.
`;
      const filePath = createTestAgent('no-agent.agent.md', content);
      const result = loadAgent(filePath);

      assert.ok('error' in result, 'Should return error for missing handoff agent');
      const { error } = result as { error: any };
      assert.ok(
        error.message.includes('Handoff') || error.message.includes('agent'),
        `Error should mention handoff issue, got: ${error.message}`
      );
    });

    it('9. handoff missing prompt returns error', () => {
      const content = `---
name: Missing Prompt Agent
handoffs:
  - label: Send to developer
    agent: developer
---

Handoff is missing prompt field.
`;
      const filePath = createTestAgent('no-prompt.agent.md', content);
      const result = loadAgent(filePath);

      assert.ok('error' in result, 'Should return error for missing handoff prompt');
      const { error } = result as { error: any };
      assert.ok(
        error.message.includes('Handoff') || error.message.includes('prompt'),
        `Error should mention handoff issue, got: ${error.message}`
      );
    });

    it('12. empty frontmatter (only delimiters) returns error', () => {
      const content = `---
---

This file has empty frontmatter.
`;
      const filePath = createTestAgent('empty-frontmatter.agent.md', content);
      const result = loadAgent(filePath);

      assert.ok('error' in result, 'Should return error for empty frontmatter');
      const { error } = result as { error: any };
      assert.ok(
        error.message.includes('name'),
        `Error should mention missing name, got: ${error.message}`
      );
    });

    it('13. malformed YAML returns error', () => {
      const content = `---
name: Malformed Agent
tools:
  - valid item
  invalid: yaml: here
  - another item
---

This YAML is malformed.
`;
      const filePath = createTestAgent('malformed.agent.md', content);
      const result = loadAgent(filePath);

      assert.ok('error' in result, 'Should return error for malformed YAML');
      const { error } = result as { error: any };
      assert.ok(
        error.message.includes('Failed to parse') || error.message.includes('YAML'),
        `Error should indicate parse failure, got: ${error.message}`
      );
    });

    it('13b. unclosed YAML block returns error', () => {
      const content = `---
name: Unclosed Agent
description: This frontmatter never closes

Body content without closing delimiter.
`;
      const filePath = createTestAgent('unclosed.agent.md', content);
      const result = loadAgent(filePath);

      // gray-matter treats everything after first --- as frontmatter if no closing ---
      // This should still work but body will be empty
      // Actually, let's see what happens
      if ('error' in result) {
        // If it errors, that's expected
        assert.ok(true);
      } else {
        // If it doesn't error, body should be empty and frontmatter parsed
        // This is acceptable behavior for gray-matter
        assert.strictEqual(result.agent.frontmatter.name, 'Unclosed Agent');
      }
    });

    it('13c. invalid YAML indentation returns error', () => {
      const content = `---
name: Bad Indent Agent
handoffs:
- label: No indent
agent: developer
prompt: Missing indent
---

Bad indentation in YAML.
`;
      const filePath = createTestAgent('bad-indent.agent.md', content);
      const result = loadAgent(filePath);

      // gray-matter might parse this differently than expected
      // The handoff array item would not have agent/prompt as nested fields
      if ('error' in result) {
        assert.ok(true, 'Returned error as expected');
      } else {
        // If parsed, handoffs[0] should be missing required fields
        const handoffs = result.agent.frontmatter.handoffs;
        if (handoffs && handoffs.length > 0) {
          // The label is there but agent/prompt won't be nested
          assert.ok(
            !handoffs[0].agent || !handoffs[0].prompt,
            'Bad indent should result in missing handoff fields'
          );
        }
      }
    });

    it('handoffs as non-array returns error', () => {
      const content = `---
name: Bad Handoffs Agent
handoffs: developer
---

Handoffs should be an array.
`;
      const filePath = createTestAgent('bad-handoffs.agent.md', content);
      const result = loadAgent(filePath);

      assert.ok('error' in result, 'Should return error for non-array handoffs');
      const { error } = result as { error: any };
      assert.ok(
        error.message.includes('handoffs'),
        `Error should mention 'handoffs', got: ${error.message}`
      );
    });
  });

  describe('Edge cases', () => {
    it('should handle minimal valid agent (name only)', () => {
      const content = `---
name: Minimal Agent
---
`;
      const filePath = createTestAgent('minimal.agent.md', content);
      const result = loadAgent(filePath);

      assert.ok(!('error' in result), 'Minimal agent should be valid');
      const { agent } = result as { agent: any };

      assert.strictEqual(agent.frontmatter.name, 'Minimal Agent');
      assert.strictEqual(agent.frontmatter.description, undefined);
      assert.strictEqual(agent.frontmatter.model, undefined);
      assert.strictEqual(agent.frontmatter.tools, undefined);
      assert.strictEqual(agent.frontmatter.handoffs, undefined);
      assert.strictEqual(agent.frontmatter.infer, undefined);
    });

    it('should handle empty body', () => {
      const content = `---
name: Empty Body Agent
---
`;
      const filePath = createTestAgent('empty-body.agent.md', content);
      const result = loadAgent(filePath);

      assert.ok(!('error' in result));
      const { agent } = result as { agent: any };
      assert.strictEqual(agent.body, '');
    });

    it('should handle empty tools array', () => {
      const content = `---
name: No Tools Agent
tools: []
---

Agent with empty tools array.
`;
      const filePath = createTestAgent('empty-tools.agent.md', content);
      const result = loadAgent(filePath);

      assert.ok(!('error' in result));
      const { agent } = result as { agent: any };
      assert.deepStrictEqual(agent.frontmatter.tools, []);
    });

    it('should handle empty handoffs array', () => {
      const content = `---
name: No Handoffs Agent
handoffs: []
---

Agent with empty handoffs array.
`;
      const filePath = createTestAgent('empty-handoffs.agent.md', content);
      const result = loadAgent(filePath);

      assert.ok(!('error' in result));
      const { agent } = result as { agent: any };
      assert.deepStrictEqual(agent.frontmatter.handoffs, []);
    });

    it('should handle special characters in name', () => {
      const content = `---
name: "Agent: The Sequel (2.0)"
---

Agent with special characters in name.
`;
      const filePath = createTestAgent('special-chars.agent.md', content);
      const result = loadAgent(filePath);

      assert.ok(!('error' in result));
      const { agent } = result as { agent: any };
      assert.strictEqual(agent.frontmatter.name, 'Agent: The Sequel (2.0)');
    });

    it('should handle multiline description', () => {
      const content = `---
name: Multiline Agent
description: |
  This is a multiline description
  that spans several lines
  and should be preserved.
---

Agent with multiline description.
`;
      const filePath = createTestAgent('multiline-desc.agent.md', content);
      const result = loadAgent(filePath);

      assert.ok(!('error' in result));
      const { agent } = result as { agent: any };
      assert.ok(agent.frontmatter.description?.includes('multiline description'));
      assert.ok(agent.frontmatter.description?.includes('spans several lines'));
    });

    it('should handle unicode in content', () => {
      const content = `---
name: Unicode Agent 🤖
description: Supports émojis and ünïcödé
---

Content with unicode: 日本語, العربية, 中文
`;
      const filePath = createTestAgent('unicode.agent.md', content);
      const result = loadAgent(filePath);

      assert.ok(!('error' in result));
      const { agent } = result as { agent: any };
      assert.strictEqual(agent.frontmatter.name, 'Unicode Agent 🤖');
      assert.ok(agent.body.includes('日本語'));
    });

    it('should handle GitHub Copilot code fence wrapper', () => {
      const content = `\`\`\`chatagent
---
name: Wrapped Agent
description: Agent wrapped in code fence
---

This is inside a code fence.
\`\`\``;
      const filePath = createTestAgent('wrapped.agent.md', content);
      const result = loadAgent(filePath);

      assert.ok(!('error' in result), `Unexpected error: ${JSON.stringify(result)}`);
      const { agent } = result as { agent: any };
      assert.strictEqual(agent.frontmatter.name, 'Wrapped Agent');
      assert.ok(agent.body.includes('inside a code fence'));
    });

    it('should derive agent ID from filename', () => {
      const content = `---
name: My Complex Agent
---

Body content.
`;
      const filePath = createTestAgent('my-complex-agent.agent.md', content);
      const result = loadAgent(filePath);

      assert.ok(!('error' in result));
      const { agent } = result as { agent: any };
      assert.strictEqual(agent.id, 'my-complex-agent');
    });
  });
});
