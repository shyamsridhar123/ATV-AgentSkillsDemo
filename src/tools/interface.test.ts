/**
 * Tool Interface Tests
 *
 * Tests for the Tool interface and toToolDefinition helper.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { toToolDefinition } from './interface.js';
import type { Tool } from './interface.js';
import type { ToolContext } from './types.js';

/**
 * Create a minimal mock tool for testing.
 */
function createMockTool(overrides?: Partial<Tool>): Tool {
  return {
    name: overrides?.name ?? 'mockTool',
    description: overrides?.description ?? 'A mock tool for testing',
    inputSchema: overrides?.inputSchema ?? {
      type: 'object',
      properties: {
        input: { type: 'string', description: 'Test input' },
      },
      required: ['input'],
    },
    execute: overrides?.execute ?? (async () => ({ success: true, output: 'ok' })),
  };
}

/**
 * Create a minimal ToolContext for testing.
 */
function createMockContext(overrides?: Partial<ToolContext>): ToolContext {
  return {
    workingDir: overrides?.workingDir ?? '/test',
    permissions: overrides?.permissions ?? {
      allowFileRead: true,
      allowFileWrite: false,
      allowTerminal: false,
      allowNetwork: false,
    },
    signal: overrides?.signal,
  };
}

describe('Tool interface', () => {
  describe('mock tool implementing interface', () => {
    it('should have a name', () => {
      const tool = createMockTool({ name: 'readFile' });

      assert.strictEqual(tool.name, 'readFile');
    });

    it('should have a description', () => {
      const tool = createMockTool({ description: 'Reads a file' });

      assert.strictEqual(tool.description, 'Reads a file');
    });

    it('should have an inputSchema', () => {
      const schema = {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
      };
      const tool = createMockTool({ inputSchema: schema });

      assert.deepStrictEqual(tool.inputSchema, schema);
    });

    it('should execute and return a ToolResult', async () => {
      const tool = createMockTool({
        execute: async () => ({ success: true, output: 'file contents' }),
      });

      const result = await tool.execute({}, createMockContext());

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.output, 'file contents');
    });

    it('should receive input in execute', async () => {
      let receivedInput: Record<string, unknown> = {};
      const tool = createMockTool({
        execute: async (input) => {
          receivedInput = input;
          return { success: true, output: 'ok' };
        },
      });

      await tool.execute({ path: '/test.txt' }, createMockContext());

      assert.strictEqual(receivedInput.path, '/test.txt');
    });

    it('should receive context in execute', async () => {
      let receivedContext: ToolContext | undefined;
      const tool = createMockTool({
        execute: async (_input, context) => {
          receivedContext = context;
          return { success: true, output: 'ok' };
        },
      });

      const ctx = createMockContext({ workingDir: '/my/project' });
      await tool.execute({}, ctx);

      assert.strictEqual(receivedContext?.workingDir, '/my/project');
    });

    it('should return a failed result', async () => {
      const tool = createMockTool({
        execute: async () => ({
          success: false,
          output: '',
          error: 'Permission denied',
        }),
      });

      const result = await tool.execute({}, createMockContext());

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.error, 'Permission denied');
    });

    it('should return a result with metadata', async () => {
      const tool = createMockTool({
        execute: async () => ({
          success: true,
          output: 'Done',
          metadata: { linesRead: 42 },
        }),
      });

      const result = await tool.execute({}, createMockContext());

      assert.deepStrictEqual(result.metadata, { linesRead: 42 });
    });
  });
});

describe('toToolDefinition', () => {
  it('should return type "function"', () => {
    const tool = createMockTool();
    const def = toToolDefinition(tool);

    assert.strictEqual(def.type, 'function');
  });

  it('should map tool name to function name', () => {
    const tool = createMockTool({ name: 'readFile' });
    const def = toToolDefinition(tool);

    assert.strictEqual(def.function.name, 'readFile');
  });

  it('should map tool description to function description', () => {
    const tool = createMockTool({ description: 'Read a file from disk' });
    const def = toToolDefinition(tool);

    assert.strictEqual(def.function.description, 'Read a file from disk');
  });

  it('should map inputSchema to function parameters', () => {
    const schema = {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path' },
        encoding: { type: 'string', description: 'File encoding' },
      },
      required: ['path'],
    };
    const tool = createMockTool({ inputSchema: schema });
    const def = toToolDefinition(tool);

    assert.deepStrictEqual(def.function.parameters, schema);
  });

  it('should produce a valid ToolDefinition structure', () => {
    const tool = createMockTool({
      name: 'search',
      description: 'Search the codebase',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
        },
        required: ['query'],
      },
    });

    const def = toToolDefinition(tool);

    assert.deepStrictEqual(def, {
      type: 'function',
      function: {
        name: 'search',
        description: 'Search the codebase',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string' },
          },
          required: ['query'],
        },
      },
    });
  });

  it('should handle an empty inputSchema', () => {
    const tool = createMockTool({ inputSchema: {} });
    const def = toToolDefinition(tool);

    assert.deepStrictEqual(def.function.parameters, {});
  });
});
