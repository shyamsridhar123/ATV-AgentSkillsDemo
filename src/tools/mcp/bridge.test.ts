/**
 * MCP Bridge Tests
 *
 * Tests for config parsing, tool wrapping, and the MCP-to-Beth
 * tool bridge. Uses mock MCPClient rather than real servers.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseMCPConfig, createMCPTools } from './bridge.js';
import type { MCPClient, MCPToolInfo } from './client.js';
import type { ToolContext } from '../types.js';

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Create a temporary directory with an mcp.json file.
 * Returns the path to the config file and a cleanup function.
 */
function writeTempConfig(content: string): { configPath: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'beth-mcp-test-'));
  const configPath = join(dir, 'mcp.json');
  writeFileSync(configPath, content, 'utf-8');
  return {
    configPath,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

/**
 * Create a mock MCPClient for bridge testing.
 */
function createMockClient(
  name: string,
  tools: MCPToolInfo[],
  callToolResult?: unknown,
  callToolError?: Error
): MCPClient {
  return {
    name,
    connected: true,
    listTools: async () => tools,
    callTool: async () => {
      if (callToolError) throw callToolError;
      return callToolResult ?? { content: [{ type: 'text', text: 'ok' }] };
    },
    connect: async () => {},
    disconnect: async () => {},
  } as unknown as MCPClient;
}

/**
 * Create a minimal ToolContext for testing.
 */
function createMockContext(): ToolContext {
  return {
    workingDir: '/test',
    permissions: {
      allowFileRead: true,
      allowFileWrite: false,
      allowTerminal: false,
      allowNetwork: true,
    },
  };
}

// =============================================================================
// parseMCPConfig Tests
// =============================================================================

describe('parseMCPConfig', () => {
  it('should parse stdio server configs', () => {
    const { configPath, cleanup } = writeTempConfig(JSON.stringify({
      servers: {
        shadcn: {
          command: 'npx',
          args: ['shadcn@3.7.0', 'mcp'],
        },
      },
    }));

    try {
      const configs = parseMCPConfig(configPath);

      assert.strictEqual(configs.size, 1);
      assert.ok(configs.has('shadcn'));

      const shadcn = configs.get('shadcn')!;
      assert.strictEqual(shadcn.command, 'npx');
      assert.deepStrictEqual(shadcn.args, ['shadcn@3.7.0', 'mcp']);
    } finally {
      cleanup();
    }
  });

  it('should parse server env variables', () => {
    const { configPath, cleanup } = writeTempConfig(JSON.stringify({
      servers: {
        myserver: {
          command: 'node',
          args: ['server.js'],
          env: { API_KEY: 'test-key', DEBUG: 'true' },
        },
      },
    }));

    try {
      const configs = parseMCPConfig(configPath);
      const server = configs.get('myserver')!;

      assert.deepStrictEqual(server.env, { API_KEY: 'test-key', DEBUG: 'true' });
    } finally {
      cleanup();
    }
  });

  it('should skip HTTP-based servers (no command)', () => {
    const { configPath, cleanup } = writeTempConfig(JSON.stringify({
      servers: {
        deepwiki: {
          type: 'http',
          url: 'https://mcp.deepwiki.com/mcp',
        },
        shadcn: {
          command: 'npx',
          args: ['shadcn@3.7.0', 'mcp'],
        },
      },
    }));

    try {
      const configs = parseMCPConfig(configPath);

      assert.strictEqual(configs.size, 1);
      assert.ok(!configs.has('deepwiki'));
      assert.ok(configs.has('shadcn'));
    } finally {
      cleanup();
    }
  });

  it('should handle JSONC with line comments', () => {
    const { configPath, cleanup } = writeTempConfig(`{
      // This is a comment
      "servers": {
        // Another comment
        "test": {
          "command": "node", // Inline comment
          "args": ["server.js"]
        }
      }
    }`);

    try {
      const configs = parseMCPConfig(configPath);

      assert.strictEqual(configs.size, 1);
      assert.ok(configs.has('test'));
    } finally {
      cleanup();
    }
  });

  it('should handle JSONC with block comments', () => {
    const { configPath, cleanup } = writeTempConfig(`{
      /* Block comment */
      "servers": {
        "test": {
          "command": "node",
          "args": [/* inline block */ "server.js"]
        }
      }
    }`);

    try {
      const configs = parseMCPConfig(configPath);

      assert.strictEqual(configs.size, 1);
    } finally {
      cleanup();
    }
  });

  it('should return empty map when no servers defined', () => {
    const { configPath, cleanup } = writeTempConfig(JSON.stringify({
      "$schema": "https://example.com/schema",
    }));

    try {
      const configs = parseMCPConfig(configPath);

      assert.strictEqual(configs.size, 0);
    } finally {
      cleanup();
    }
  });

  it('should parse multiple servers', () => {
    const { configPath, cleanup } = writeTempConfig(JSON.stringify({
      servers: {
        server1: { command: 'cmd1', args: ['a'] },
        server2: { command: 'cmd2', args: ['b', 'c'] },
        server3: { command: 'cmd3', args: [] },
      },
    }));

    try {
      const configs = parseMCPConfig(configPath);

      assert.strictEqual(configs.size, 3);
      assert.strictEqual(configs.get('server1')!.command, 'cmd1');
      assert.strictEqual(configs.get('server2')!.command, 'cmd2');
      assert.strictEqual(configs.get('server3')!.command, 'cmd3');
    } finally {
      cleanup();
    }
  });

  it('should handle missing args gracefully', () => {
    const { configPath, cleanup } = writeTempConfig(JSON.stringify({
      servers: {
        test: { command: 'node' },
      },
    }));

    try {
      const configs = parseMCPConfig(configPath);
      const server = configs.get('test')!;

      assert.deepStrictEqual(server.args, []);
    } finally {
      cleanup();
    }
  });
});

// =============================================================================
// createMCPTools Tests
// =============================================================================

describe('createMCPTools', () => {
  it('should wrap MCP tools with namespaced names', async () => {
    const client = createMockClient('shadcn', [
      {
        name: 'search',
        description: 'Search for components',
        inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
      },
    ]);

    const tools = await createMCPTools(client);

    assert.strictEqual(tools.length, 1);
    assert.strictEqual(tools[0].name, 'mcp_shadcn_search');
  });

  it('should preserve tool description', async () => {
    const client = createMockClient('myserver', [
      {
        name: 'list',
        description: 'List available items',
        inputSchema: {},
      },
    ]);

    const tools = await createMCPTools(client);

    assert.strictEqual(tools[0].description, 'List available items');
  });

  it('should preserve tool inputSchema', async () => {
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Component name' },
      },
      required: ['name'],
    };

    const client = createMockClient('test', [
      { name: 'install', description: 'Install', inputSchema: schema },
    ]);

    const tools = await createMCPTools(client);

    assert.deepStrictEqual(tools[0].inputSchema, schema);
  });

  it('should create tools that delegate to client.callTool', async () => {
    const expectedResult = { content: [{ type: 'text', text: 'found 3 results' }] };
    const client = createMockClient('shadcn', [
      { name: 'search', description: 'Search', inputSchema: {} },
    ], expectedResult);

    const tools = await createMCPTools(client);
    const result = await tools[0].execute({ query: 'button' }, createMockContext());

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.output, JSON.stringify(expectedResult));
    assert.strictEqual(result.metadata?.mcpServer, 'shadcn');
    assert.strictEqual(result.metadata?.mcpTool, 'search');
  });

  it('should return string output directly', async () => {
    const client = createMockClient('test', [
      { name: 'echo', description: 'Echo', inputSchema: {} },
    ], 'hello world');

    const tools = await createMCPTools(client);
    const result = await tools[0].execute({}, createMockContext());

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.output, 'hello world');
  });

  it('should handle tool execution errors gracefully', async () => {
    const client = createMockClient(
      'test',
      [{ name: 'fail', description: 'Fails', inputSchema: {} }],
      undefined,
      new Error('Server crashed')
    );

    const tools = await createMCPTools(client);
    const result = await tools[0].execute({}, createMockContext());

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error, 'Server crashed');
    assert.strictEqual(result.output, '');
  });

  it('should handle multiple tools from one server', async () => {
    const client = createMockClient('shadcn', [
      { name: 'search', description: 'Search', inputSchema: {} },
      { name: 'install', description: 'Install', inputSchema: {} },
      { name: 'list', description: 'List', inputSchema: {} },
    ]);

    const tools = await createMCPTools(client);

    assert.strictEqual(tools.length, 3);
    assert.strictEqual(tools[0].name, 'mcp_shadcn_search');
    assert.strictEqual(tools[1].name, 'mcp_shadcn_install');
    assert.strictEqual(tools[2].name, 'mcp_shadcn_list');
  });

  it('should return empty array when server has no tools', async () => {
    const client = createMockClient('empty', []);

    const tools = await createMCPTools(client);

    assert.deepStrictEqual(tools, []);
  });
});
