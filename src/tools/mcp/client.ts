/**
 * MCP Client
 *
 * Minimal Model Context Protocol client that communicates with
 * MCP servers over stdio transport using JSON-RPC 2.0.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface, type Interface as ReadlineInterface } from 'node:readline';

// =============================================================================
// Types
// =============================================================================

/**
 * Configuration for connecting to an MCP server.
 */
export interface MCPServerConfig {
  /** Command to launch the server (e.g., "npx") */
  command: string;

  /** Arguments to pass to the command (e.g., ["-y", "@anthropic/mcp-server"]) */
  args: string[];

  /** Optional environment variables for the server process */
  env?: Record<string, string>;
}

/**
 * Tool information returned by an MCP server.
 */
export interface MCPToolInfo {
  /** Tool name */
  name: string;

  /** Human-readable description */
  description: string;

  /** JSON Schema for the tool's input */
  inputSchema: Record<string, unknown>;
}

/**
 * A JSON-RPC 2.0 request message.
 */
interface JSONRPCRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

/**
 * A JSON-RPC 2.0 notification (no id).
 */
interface JSONRPCNotification {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
}

/**
 * A JSON-RPC 2.0 response message.
 */
interface JSONRPCResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/** Default timeout for MCP requests in milliseconds */
const DEFAULT_TIMEOUT_MS = 10_000;

/** MCP protocol version */
const PROTOCOL_VERSION = '2024-11-05';

/** Client info sent during initialization */
const CLIENT_INFO = { name: 'beth-cli', version: '1.0.15' };

// =============================================================================
// Spawn Factory (for test injection)
// =============================================================================

/**
 * Function signature for spawning a child process.
 * Defaults to `child_process.spawn` but can be replaced in tests.
 */
export type SpawnFn = typeof spawn;

// =============================================================================
// MCP Client
// =============================================================================

/**
 * MCP protocol client for stdio-based MCP servers.
 *
 * Handles the JSON-RPC 2.0 transport, initialization handshake,
 * tool listing, and tool invocation.
 *
 * @example
 * ```typescript
 * const client = new MCPClient('shadcn', {
 *   command: 'npx',
 *   args: ['shadcn@3.7.0', 'mcp'],
 * });
 * await client.connect();
 * const tools = await client.listTools();
 * const result = await client.callTool('search', { query: 'button' });
 * await client.disconnect();
 * ```
 */
export class MCPClient {
  /** Server name (for logging/namespacing) */
  readonly name: string;

  /** Server configuration */
  private readonly config: MCPServerConfig;

  /** Spawn function (injectable for testing) */
  private readonly spawnFn: SpawnFn;

  /** Request timeout in milliseconds */
  private readonly timeoutMs: number;

  /** The spawned server process */
  private process: ChildProcess | null = null;

  /** Readline interface for reading stdout line by line */
  private reader: ReadlineInterface | null = null;

  /** Incrementing request ID counter */
  private nextId = 1;

  /** Whether the initialization handshake has completed */
  private initialized = false;

  /** Pending request resolvers keyed by request ID */
  private readonly pending = new Map<number, {
    resolve: (value: unknown) => void;
    reject: (reason: Error) => void;
  }>();

  constructor(
    name: string,
    config: MCPServerConfig,
    options?: {
      spawnFn?: SpawnFn;
      timeoutMs?: number;
    }
  ) {
    this.name = name;
    this.config = config;
    this.spawnFn = options?.spawnFn ?? spawn;
    this.timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /**
   * Whether the client is connected and initialized.
   */
  get connected(): boolean {
    return this.initialized && this.process !== null;
  }

  /**
   * Start the MCP server process and perform the initialization handshake.
   *
   * @throws Error if the process fails to start or initialization times out
   */
  async connect(): Promise<void> {
    if (this.process) {
      throw new Error(`MCP client "${this.name}" is already connected`);
    }

    const env = this.config.env
      ? { ...process.env, ...this.config.env }
      : process.env;

    this.process = this.spawnFn(this.config.command, this.config.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env,
    });

    // Handle unexpected process exit
    this.process.on('error', (err) => {
      this.rejectAllPending(new Error(`MCP server "${this.name}" process error: ${err.message}`));
      this.cleanup();
    });

    this.process.on('close', () => {
      this.rejectAllPending(new Error(`MCP server "${this.name}" process exited unexpectedly`));
      this.cleanup();
    });

    // Set up line-delimited JSON reader on stdout
    if (!this.process.stdout) {
      throw new Error(`MCP server "${this.name}" has no stdout`);
    }

    this.reader = createInterface({ input: this.process.stdout });
    this.reader.on('line', (line) => this.handleLine(line));

    // Perform initialization handshake
    await this.sendRequest('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: CLIENT_INFO,
    });

    this.sendNotification('notifications/initialized');
    this.initialized = true;
  }

  /**
   * List available tools from the MCP server.
   *
   * @returns Array of tool information
   * @throws Error if not connected
   */
  async listTools(): Promise<MCPToolInfo[]> {
    this.ensureConnected();

    const result = await this.sendRequest('tools/list', {}) as { tools?: MCPToolInfo[] };
    const tools = result.tools;

    if (!Array.isArray(tools)) {
      return [];
    }

    return tools.map((t) => ({
      name: String(t.name ?? ''),
      description: String(t.description ?? ''),
      inputSchema: (t.inputSchema as Record<string, unknown>) ?? {},
    }));
  }

  /**
   * Call a tool on the MCP server.
   *
   * @param toolName - Name of the tool to call
   * @param args - Arguments to pass to the tool
   * @returns Tool execution result
   * @throws Error if not connected or the tool call fails
   */
  async callTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    this.ensureConnected();

    return this.sendRequest('tools/call', {
      name: toolName,
      arguments: args,
    });
  }

  /**
   * Shut down the MCP server process.
   */
  async disconnect(): Promise<void> {
    this.rejectAllPending(new Error(`MCP client "${this.name}" disconnecting`));
    this.cleanup();
  }

  // ===========================================================================
  // Internal: JSON-RPC transport
  // ===========================================================================

  /**
   * Send a JSON-RPC request and wait for the matching response.
   */
  private sendRequest(method: string, params: Record<string, unknown>): Promise<unknown> {
    const id = this.nextId++;

    const message: JSONRPCRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return new Promise<unknown>((resolve, reject) => {
      // Set up timeout
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP request "${method}" timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);

      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (reason) => {
          clearTimeout(timer);
          reject(reason);
        },
      });

      this.writeMessage(JSON.stringify(message));
    });
  }

  /**
   * Send a JSON-RPC notification (no response expected).
   */
  private sendNotification(method: string, params?: Record<string, unknown>): void {
    const message: JSONRPCNotification = {
      jsonrpc: '2.0',
      method,
      ...(params !== undefined ? { params } : {}),
    };

    this.writeMessage(JSON.stringify(message));
  }

  /**
   * Write a line-delimited JSON message to the process stdin.
   */
  private writeMessage(json: string): void {
    if (!this.process?.stdin?.writable) {
      throw new Error(`MCP server "${this.name}" stdin is not writable`);
    }
    this.process.stdin.write(json + '\n');
  }

  /**
   * Handle a line of JSON from the server's stdout.
   */
  private handleLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;

    let parsed: JSONRPCResponse;
    try {
      parsed = JSON.parse(trimmed) as JSONRPCResponse;
    } catch {
      // Ignore malformed lines (e.g., server logging to stdout)
      return;
    }

    // Only handle responses with an id that we're waiting for
    if (parsed.id === undefined || parsed.id === null) return;

    const pending = this.pending.get(parsed.id);
    if (!pending) return;

    this.pending.delete(parsed.id);

    if (parsed.error) {
      pending.reject(new Error(
        `MCP error (${parsed.error.code}): ${parsed.error.message}`
      ));
    } else {
      pending.resolve(parsed.result);
    }
  }

  /**
   * Assert that the client is connected.
   */
  private ensureConnected(): void {
    if (!this.connected) {
      throw new Error(`MCP client "${this.name}" is not connected`);
    }
  }

  /**
   * Reject all pending requests.
   */
  private rejectAllPending(error: Error): void {
    for (const [id, pending] of this.pending) {
      pending.reject(error);
      this.pending.delete(id);
    }
  }

  /**
   * Clean up the process and reader.
   */
  private cleanup(): void {
    this.initialized = false;

    if (this.reader) {
      this.reader.close();
      this.reader = null;
    }

    if (this.process) {
      this.process.stdin?.end();
      this.process.kill();
      this.process = null;
    }
  }
}
