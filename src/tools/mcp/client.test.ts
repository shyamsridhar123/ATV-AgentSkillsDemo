/**
 * MCP Client Tests
 *
 * Tests for the MCP protocol client including JSON-RPC message
 * formatting, request lifecycle, and timeout handling.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { MCPClient, type SpawnFn } from './client.js';

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Captured messages written to the mock process stdin.
 */
interface MockProcess extends EventEmitter {
  stdin: PassThrough;
  stdout: PassThrough;
  stderr: PassThrough;
  kill: () => void;
  killed: boolean;
}

/**
 * Create a mock child process with controllable stdin/stdout.
 */
function createMockProcess(): MockProcess {
  const proc = new EventEmitter() as MockProcess;
  proc.stdin = new PassThrough();
  proc.stdout = new PassThrough();
  proc.stderr = new PassThrough();
  proc.killed = false;
  proc.kill = () => { proc.killed = true; };
  return proc;
}

/**
 * Collect all messages written to a PassThrough stream as parsed JSON-RPC.
 */
function collectMessages(stream: PassThrough): unknown[] {
  const messages: unknown[] = [];
  let buffer = '';
  stream.on('data', (chunk: Buffer) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    // Keep the last incomplete line in the buffer
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line.trim()) {
        messages.push(JSON.parse(line));
      }
    }
  });
  return messages;
}

/**
 * Create a spawn function that returns the given mock process.
 */
function createMockSpawn(proc: MockProcess): SpawnFn {
  return (() => proc) as unknown as SpawnFn;
}

/**
 * Respond to pending requests on a mock process's stdout.
 * Reads from stdin, auto-responds with matching id.
 */
function autoRespond(
  proc: MockProcess,
  handler: (msg: { id: number; method: string; params?: Record<string, unknown> }) => unknown
): void {
  let buffer = '';
  proc.stdin.on('data', (chunk: Buffer) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      const msg = JSON.parse(line) as { id?: number; method: string; params?: Record<string, unknown> };
      // Only respond to requests (those with an id), not notifications
      if (msg.id !== undefined) {
        const result = handler(msg as { id: number; method: string; params?: Record<string, unknown> });
        const response = JSON.stringify({ jsonrpc: '2.0', id: msg.id, result });
        proc.stdout.push(response + '\n');
      }
    }
  });
}

// =============================================================================
// Tests
// =============================================================================

describe('MCPClient', () => {
  describe('construction', () => {
    it('should create a client with name and config', () => {
      const client = new MCPClient('test-server', {
        command: 'npx',
        args: ['-y', 'some-server'],
      });

      assert.strictEqual(client.name, 'test-server');
      assert.strictEqual(client.connected, false);
    });

    it('should accept custom timeout', () => {
      const client = new MCPClient('test', { command: 'node', args: [] }, {
        timeoutMs: 5000,
      });
      assert.strictEqual(client.name, 'test');
    });
  });

  describe('connect', () => {
    it('should spawn the server process and perform handshake', async () => {
      const proc = createMockProcess();
      let spawnCalled = false;
      let spawnCmd = '';
      let spawnArgs: string[] = [];

      const mockSpawn: SpawnFn = ((cmd: string, args: string[]) => {
        spawnCalled = true;
        spawnCmd = cmd;
        spawnArgs = args;
        return proc;
      }) as unknown as SpawnFn;

      autoRespond(proc, (msg) => {
        if (msg.method === 'initialize') {
          return { protocolVersion: '2024-11-05', capabilities: {} };
        }
        return {};
      });

      const client = new MCPClient('test', {
        command: 'npx',
        args: ['-y', 'test-server'],
      }, { spawnFn: mockSpawn });

      await client.connect();

      assert.strictEqual(spawnCalled, true);
      assert.strictEqual(spawnCmd, 'npx');
      assert.deepStrictEqual(spawnArgs, ['-y', 'test-server']);
      assert.strictEqual(client.connected, true);

      await client.disconnect();
    });

    it('should throw if already connected', async () => {
      const proc = createMockProcess();
      autoRespond(proc, () => ({ protocolVersion: '2024-11-05', capabilities: {} }));

      const client = new MCPClient('test', { command: 'node', args: [] }, {
        spawnFn: createMockSpawn(proc),
      });

      await client.connect();

      await assert.rejects(
        () => client.connect(),
        (err: Error) => {
          assert.ok(err.message.includes('already connected'));
          return true;
        }
      );

      await client.disconnect();
    });

    it('should send initialize request with correct params', async () => {
      const proc = createMockProcess();
      const messages = collectMessages(proc.stdin);

      autoRespond(proc, () => ({ protocolVersion: '2024-11-05', capabilities: {} }));

      const client = new MCPClient('test', { command: 'node', args: [] }, {
        spawnFn: createMockSpawn(proc),
      });

      await client.connect();

      // First message should be the initialize request
      const initMsg = messages[0] as Record<string, unknown>;
      assert.strictEqual(initMsg.jsonrpc, '2.0');
      assert.strictEqual(initMsg.method, 'initialize');
      assert.strictEqual(initMsg.id, 1);

      const params = initMsg.params as Record<string, unknown>;
      assert.strictEqual(params.protocolVersion, '2024-11-05');
      assert.deepStrictEqual(params.clientInfo, { name: 'beth-cli', version: '1.0.15' });

      await client.disconnect();
    });

    it('should send initialized notification after handshake', async () => {
      const proc = createMockProcess();
      const messages = collectMessages(proc.stdin);

      autoRespond(proc, () => ({ protocolVersion: '2024-11-05', capabilities: {} }));

      const client = new MCPClient('test', { command: 'node', args: [] }, {
        spawnFn: createMockSpawn(proc),
      });

      await client.connect();

      // Second message should be the initialized notification (no id)
      const notifMsg = messages[1] as Record<string, unknown>;
      assert.strictEqual(notifMsg.jsonrpc, '2.0');
      assert.strictEqual(notifMsg.method, 'notifications/initialized');
      assert.strictEqual(notifMsg.id, undefined);

      await client.disconnect();
    });
  });

  describe('request IDs', () => {
    it('should increment request IDs', async () => {
      const proc = createMockProcess();
      const messages = collectMessages(proc.stdin);

      autoRespond(proc, () => ({ protocolVersion: '2024-11-05', capabilities: {}, tools: [] }));

      const client = new MCPClient('test', { command: 'node', args: [] }, {
        spawnFn: createMockSpawn(proc),
      });

      await client.connect();       // id: 1 (initialize)
      await client.listTools();     // id: 2 (tools/list)

      const initMsg = messages[0] as Record<string, unknown>;
      assert.strictEqual(initMsg.id, 1);

      // messages[1] is the notification (no id), messages[2] is tools/list
      const listMsg = messages[2] as Record<string, unknown>;
      assert.strictEqual(listMsg.id, 2);

      await client.disconnect();
    });
  });

  describe('listTools', () => {
    it('should return tool info from server', async () => {
      const proc = createMockProcess();
      autoRespond(proc, (msg) => {
        if (msg.method === 'initialize') {
          return { protocolVersion: '2024-11-05', capabilities: {} };
        }
        if (msg.method === 'tools/list') {
          return {
            tools: [
              {
                name: 'search',
                description: 'Search for components',
                inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
              },
              {
                name: 'install',
                description: 'Install a component',
                inputSchema: { type: 'object', properties: { name: { type: 'string' } } },
              },
            ],
          };
        }
        return {};
      });

      const client = new MCPClient('test', { command: 'node', args: [] }, {
        spawnFn: createMockSpawn(proc),
      });

      await client.connect();
      const tools = await client.listTools();

      assert.strictEqual(tools.length, 2);
      assert.strictEqual(tools[0].name, 'search');
      assert.strictEqual(tools[0].description, 'Search for components');
      assert.deepStrictEqual(tools[0].inputSchema, {
        type: 'object',
        properties: { query: { type: 'string' } },
      });
      assert.strictEqual(tools[1].name, 'install');

      await client.disconnect();
    });

    it('should return empty array when server returns no tools', async () => {
      const proc = createMockProcess();
      autoRespond(proc, (msg) => {
        if (msg.method === 'initialize') {
          return { protocolVersion: '2024-11-05', capabilities: {} };
        }
        return { tools: [] };
      });

      const client = new MCPClient('test', { command: 'node', args: [] }, {
        spawnFn: createMockSpawn(proc),
      });

      await client.connect();
      const tools = await client.listTools();

      assert.deepStrictEqual(tools, []);

      await client.disconnect();
    });

    it('should throw if not connected', async () => {
      const client = new MCPClient('test', { command: 'node', args: [] });

      await assert.rejects(
        () => client.listTools(),
        (err: Error) => {
          assert.ok(err.message.includes('not connected'));
          return true;
        }
      );
    });
  });

  describe('callTool', () => {
    it('should send tools/call request with name and arguments', async () => {
      const proc = createMockProcess();
      const messages = collectMessages(proc.stdin);

      autoRespond(proc, (msg) => {
        if (msg.method === 'initialize') {
          return { protocolVersion: '2024-11-05', capabilities: {} };
        }
        if (msg.method === 'tools/call') {
          return { content: [{ type: 'text', text: 'result data' }] };
        }
        return {};
      });

      const client = new MCPClient('test', { command: 'node', args: [] }, {
        spawnFn: createMockSpawn(proc),
      });

      await client.connect();
      const result = await client.callTool('search', { query: 'button' });

      // Verify the request format (messages[2] is the callTool request)
      const callMsg = messages[2] as Record<string, unknown>;
      assert.strictEqual(callMsg.method, 'tools/call');
      const params = callMsg.params as Record<string, unknown>;
      assert.strictEqual(params.name, 'search');
      assert.deepStrictEqual(params.arguments, { query: 'button' });

      // Verify the result
      assert.deepStrictEqual(result, { content: [{ type: 'text', text: 'result data' }] });

      await client.disconnect();
    });

    it('should throw if not connected', async () => {
      const client = new MCPClient('test', { command: 'node', args: [] });

      await assert.rejects(
        () => client.callTool('search', {}),
        (err: Error) => {
          assert.ok(err.message.includes('not connected'));
          return true;
        }
      );
    });
  });

  describe('disconnect', () => {
    it('should set connected to false', async () => {
      const proc = createMockProcess();
      autoRespond(proc, () => ({ protocolVersion: '2024-11-05', capabilities: {} }));

      const client = new MCPClient('test', { command: 'node', args: [] }, {
        spawnFn: createMockSpawn(proc),
      });

      await client.connect();
      assert.strictEqual(client.connected, true);

      await client.disconnect();
      assert.strictEqual(client.connected, false);
    });

    it('should be safe to call when not connected', async () => {
      const client = new MCPClient('test', { command: 'node', args: [] });

      // Should not throw
      await client.disconnect();
      assert.strictEqual(client.connected, false);
    });
  });

  describe('timeout handling', () => {
    it('should reject request on timeout', async () => {
      const proc = createMockProcess();

      // Don't auto-respond to anything — let it time out
      const client = new MCPClient('test', { command: 'node', args: [] }, {
        spawnFn: createMockSpawn(proc),
        timeoutMs: 50, // Very short timeout for test
      });

      await assert.rejects(
        () => client.connect(), // initialize will time out
        (err: Error) => {
          assert.ok(err.message.includes('timed out'));
          return true;
        }
      );

      await client.disconnect();
    });
  });

  describe('error responses', () => {
    it('should reject on JSON-RPC error response', async () => {
      const proc = createMockProcess();
      let initDone = false;

      // Custom handler: respond to initialize, error on tools/list
      let buffer = '';
      proc.stdin.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          const msg = JSON.parse(line) as { id?: number; method: string };
          if (msg.id === undefined) continue;

          if (msg.method === 'initialize') {
            const resp = JSON.stringify({
              jsonrpc: '2.0',
              id: msg.id,
              result: { protocolVersion: '2024-11-05', capabilities: {} },
            });
            proc.stdout.push(resp + '\n');
            initDone = true;
          } else if (msg.method === 'tools/list' && initDone) {
            const resp = JSON.stringify({
              jsonrpc: '2.0',
              id: msg.id,
              error: { code: -32600, message: 'Not supported' },
            });
            proc.stdout.push(resp + '\n');
          }
        }
      });

      const client = new MCPClient('test', { command: 'node', args: [] }, {
        spawnFn: createMockSpawn(proc),
      });

      await client.connect();

      await assert.rejects(
        () => client.listTools(),
        (err: Error) => {
          assert.ok(err.message.includes('Not supported'));
          return true;
        }
      );

      await client.disconnect();
    });
  });

  describe('malformed responses', () => {
    it('should ignore non-JSON lines from server', async () => {
      const proc = createMockProcess();

      // Send garbage before the real response
      autoRespond(proc, (msg) => {
        if (msg.method === 'initialize') {
          // Push garbage first
          proc.stdout.push('This is not JSON\n');
          proc.stdout.push('DEBUG: server starting\n');
          return { protocolVersion: '2024-11-05', capabilities: {} };
        }
        return {};
      });

      const client = new MCPClient('test', { command: 'node', args: [] }, {
        spawnFn: createMockSpawn(proc),
      });

      // Should not throw despite garbage lines
      await client.connect();
      assert.strictEqual(client.connected, true);

      await client.disconnect();
    });
  });
});
