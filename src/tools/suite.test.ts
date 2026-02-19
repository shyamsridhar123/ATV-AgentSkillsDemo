/**
 * Tool Suite Integration Tests
 *
 * Verifies the full tool abstraction layer works together:
 * - All CLI tools conform to the Tool interface
 * - All tools register without conflicts
 * - createDefaultRegistry() wires everything correctly
 * - Tool definitions produce valid OpenAI function calling schemas
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { readFileTool } from './cli/readFile.js';
import { editFileTool } from './cli/editFile.js';
import { searchTool } from './cli/search.js';
import { terminalTool } from './cli/terminal.js';
import { beadsTool } from './cli/beads.js';
import { subagentTool } from './cli/subagent.js';
import { ToolRegistry } from './registry.js';
import { toToolDefinition } from './interface.js';
import { createDefaultRegistry } from './index.js';

const ALL_TOOLS = [readFileTool, editFileTool, searchTool, terminalTool, beadsTool, subagentTool];
const EXPECTED_NAMES = ['readFile', 'editFile', 'search', 'terminal', 'beads', 'subagent'];

describe('Tool suite integration', () => {
  describe('Tool interface conformance', () => {
    for (const tool of ALL_TOOLS) {
      it(`${tool.name} has a string name`, () => {
        assert.equal(typeof tool.name, 'string');
        assert.ok(tool.name.length > 0);
      });

      it(`${tool.name} has a string description`, () => {
        assert.equal(typeof tool.description, 'string');
        assert.ok(tool.description.length > 0);
      });

      it(`${tool.name} has an inputSchema with type "object"`, () => {
        assert.ok(tool.inputSchema);
        assert.equal(tool.inputSchema.type, 'object');
      });

      it(`${tool.name} has an execute function`, () => {
        assert.equal(typeof tool.execute, 'function');
      });
    }
  });

  describe('ToolRegistry — no conflicts', () => {
    it('should register all 6 CLI tools without error', () => {
      const registry = new ToolRegistry();
      for (const tool of ALL_TOOLS) {
        registry.register(tool);
      }
      assert.equal(registry.list().length, 6);
    });

    it('should have unique names across all tools', () => {
      const names = ALL_TOOLS.map((t) => t.name);
      const unique = new Set(names);
      assert.equal(unique.size, names.length, `Duplicate names found: ${names}`);
    });

    it('should contain all expected tool names', () => {
      const names = ALL_TOOLS.map((t) => t.name);
      for (const expected of EXPECTED_NAMES) {
        assert.ok(names.includes(expected), `Missing tool: ${expected}`);
      }
    });
  });

  describe('createDefaultRegistry()', () => {
    it('should return a ToolRegistry', () => {
      const registry = createDefaultRegistry();
      assert.ok(registry instanceof ToolRegistry);
    });

    it('should contain all 6 built-in tools', () => {
      const registry = createDefaultRegistry();
      assert.equal(registry.list().length, 6);
    });

    it('should contain each expected tool by name', () => {
      const registry = createDefaultRegistry();
      for (const name of EXPECTED_NAMES) {
        assert.ok(registry.has(name), `Registry missing tool: ${name}`);
      }
    });
  });

  describe('getDefinitions() — OpenAI function calling schemas', () => {
    it('should return 6 definitions', () => {
      const registry = createDefaultRegistry();
      const defs = registry.getDefinitions();
      assert.equal(defs.length, 6);
    });

    it('should produce valid function definitions for each tool', () => {
      const registry = createDefaultRegistry();
      const defs = registry.getDefinitions();

      for (const def of defs) {
        assert.equal(def.type, 'function');
        assert.ok(def.function, 'Missing function property');
        assert.equal(typeof def.function.name, 'string');
        assert.ok(def.function.name.length > 0, 'Empty function name');
        assert.equal(typeof def.function.description, 'string');
        assert.ok(def.function.description.length > 0, 'Empty function description');
        assert.ok(def.function.parameters, 'Missing parameters');
        assert.equal(def.function.parameters.type, 'object', 'Parameters must be type "object"');
      }
    });

    it('should match tool names in definitions', () => {
      const registry = createDefaultRegistry();
      const defs = registry.getDefinitions();
      const defNames = defs.map((d) => d.function.name).sort();
      const expected = [...EXPECTED_NAMES].sort();
      assert.deepEqual(defNames, expected);
    });
  });

  describe('toToolDefinition() — individual tools', () => {
    for (const tool of ALL_TOOLS) {
      it(`toToolDefinition(${tool.name}) produces valid definition`, () => {
        const def = toToolDefinition(tool);
        assert.equal(def.type, 'function');
        assert.equal(def.function.name, tool.name);
        assert.equal(def.function.description, tool.description);
        assert.deepEqual(def.function.parameters, tool.inputSchema);
      });
    }
  });
});
