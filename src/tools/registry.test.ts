/**
 * Tool Registry Tests
 *
 * Tests for tool registration, lookup, enumeration, and conversion.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { ToolRegistry } from './registry.js';
import { ToolError } from './types.js';
import type { Tool } from './interface.js';

/**
 * Create a minimal mock tool for testing.
 */
function createMockTool(name: string, description?: string): Tool {
  return {
    name,
    description: description ?? `Mock ${name} tool`,
    inputSchema: {
      type: 'object',
      properties: {
        input: { type: 'string' },
      },
      required: ['input'],
    },
    execute: async () => ({ success: true, output: 'ok' }),
  };
}

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  describe('register', () => {
    it('should register a tool', () => {
      const tool = createMockTool('readFile');

      registry.register(tool);

      assert.strictEqual(registry.has('readFile'), true);
    });

    it('should register multiple tools', () => {
      registry.register(createMockTool('readFile'));
      registry.register(createMockTool('editFile'));
      registry.register(createMockTool('search'));

      assert.strictEqual(registry.has('readFile'), true);
      assert.strictEqual(registry.has('editFile'), true);
      assert.strictEqual(registry.has('search'), true);
    });

    it('should throw ToolError on duplicate name', () => {
      registry.register(createMockTool('readFile'));

      assert.throws(
        () => registry.register(createMockTool('readFile')),
        (err: unknown) => {
          assert.ok(err instanceof ToolError);
          assert.strictEqual(err.code, 'INVALID_INPUT');
          assert.strictEqual(err.toolName, 'readFile');
          assert.ok(err.message.includes('readFile'));
          return true;
        }
      );
    });

    it('should allow registering after unregistering the same name', () => {
      registry.register(createMockTool('readFile', 'Version 1'));
      registry.unregister('readFile');
      registry.register(createMockTool('readFile', 'Version 2'));

      const tool = registry.get('readFile');
      assert.strictEqual(tool?.description, 'Version 2');
    });
  });

  describe('get', () => {
    it('should return the registered tool', () => {
      const tool = createMockTool('readFile');
      registry.register(tool);

      const result = registry.get('readFile');

      assert.strictEqual(result, tool);
    });

    it('should return undefined for unregistered name', () => {
      const result = registry.get('nonexistent');

      assert.strictEqual(result, undefined);
    });

    it('should return undefined after unregistering', () => {
      registry.register(createMockTool('readFile'));
      registry.unregister('readFile');

      assert.strictEqual(registry.get('readFile'), undefined);
    });
  });

  describe('has', () => {
    it('should return true for registered tool', () => {
      registry.register(createMockTool('readFile'));

      assert.strictEqual(registry.has('readFile'), true);
    });

    it('should return false for unregistered name', () => {
      assert.strictEqual(registry.has('nonexistent'), false);
    });

    it('should return false after clear', () => {
      registry.register(createMockTool('readFile'));
      registry.clear();

      assert.strictEqual(registry.has('readFile'), false);
    });
  });

  describe('list', () => {
    it('should return empty array when no tools registered', () => {
      const tools = registry.list();

      assert.deepStrictEqual(tools, []);
    });

    it('should return all registered tools', () => {
      const tool1 = createMockTool('readFile');
      const tool2 = createMockTool('editFile');
      registry.register(tool1);
      registry.register(tool2);

      const tools = registry.list();

      assert.strictEqual(tools.length, 2);
      assert.ok(tools.includes(tool1));
      assert.ok(tools.includes(tool2));
    });

    it('should not include unregistered tools', () => {
      registry.register(createMockTool('readFile'));
      registry.register(createMockTool('editFile'));
      registry.unregister('readFile');

      const tools = registry.list();

      assert.strictEqual(tools.length, 1);
      assert.strictEqual(tools[0].name, 'editFile');
    });
  });

  describe('getDefinitions', () => {
    it('should return empty array when no tools registered', () => {
      const defs = registry.getDefinitions();

      assert.deepStrictEqual(defs, []);
    });

    it('should return OpenAI-compatible definitions for all tools', () => {
      registry.register(createMockTool('readFile', 'Read a file'));
      registry.register(createMockTool('search', 'Search the codebase'));

      const defs = registry.getDefinitions();

      assert.strictEqual(defs.length, 2);

      for (const def of defs) {
        assert.strictEqual(def.type, 'function');
        assert.ok(typeof def.function.name === 'string');
        assert.ok(typeof def.function.description === 'string');
        assert.ok(typeof def.function.parameters === 'object');
      }
    });

    it('should map tool names to function names', () => {
      registry.register(createMockTool('readFile'));

      const defs = registry.getDefinitions();

      assert.strictEqual(defs[0].function.name, 'readFile');
    });

    it('should map tool descriptions to function descriptions', () => {
      registry.register(createMockTool('readFile', 'Read a file from disk'));

      const defs = registry.getDefinitions();

      assert.strictEqual(defs[0].function.description, 'Read a file from disk');
    });

    it('should map tool inputSchema to function parameters', () => {
      const tool = createMockTool('readFile');
      registry.register(tool);

      const defs = registry.getDefinitions();

      assert.deepStrictEqual(defs[0].function.parameters, tool.inputSchema);
    });
  });

  describe('unregister', () => {
    it('should return true when tool is removed', () => {
      registry.register(createMockTool('readFile'));

      const result = registry.unregister('readFile');

      assert.strictEqual(result, true);
    });

    it('should return false when tool is not found', () => {
      const result = registry.unregister('nonexistent');

      assert.strictEqual(result, false);
    });

    it('should actually remove the tool', () => {
      registry.register(createMockTool('readFile'));
      registry.unregister('readFile');

      assert.strictEqual(registry.has('readFile'), false);
      assert.strictEqual(registry.get('readFile'), undefined);
    });

    it('should not affect other registered tools', () => {
      registry.register(createMockTool('readFile'));
      registry.register(createMockTool('editFile'));
      registry.unregister('readFile');

      assert.strictEqual(registry.has('editFile'), true);
    });
  });

  describe('clear', () => {
    it('should remove all tools', () => {
      registry.register(createMockTool('readFile'));
      registry.register(createMockTool('editFile'));
      registry.register(createMockTool('search'));

      registry.clear();

      assert.deepStrictEqual(registry.list(), []);
      assert.strictEqual(registry.has('readFile'), false);
      assert.strictEqual(registry.has('editFile'), false);
      assert.strictEqual(registry.has('search'), false);
    });

    it('should allow re-registering after clear', () => {
      registry.register(createMockTool('readFile'));
      registry.clear();
      registry.register(createMockTool('readFile'));

      assert.strictEqual(registry.has('readFile'), true);
    });

    it('should be safe to call on empty registry', () => {
      registry.clear();

      assert.deepStrictEqual(registry.list(), []);
    });
  });
});
