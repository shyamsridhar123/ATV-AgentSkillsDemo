/**
 * MCP Tool Bridge
 *
 * Bridges MCP server tools into the Beth Tool interface.
 * Parses mcp.json configuration, connects to MCP servers,
 * and wraps their tools as Beth Tool implementations.
 */

import { readFileSync } from 'node:fs';
import { MCPClient, type MCPServerConfig, type MCPToolInfo } from './client.js';
import type { Tool } from '../interface.js';
import type { ToolContext, ToolResult } from '../types.js';

// =============================================================================
// Config Parsing
// =============================================================================

/**
 * Shape of the mcp.json configuration file.
 */
interface MCPConfigFile {
  servers?: Record<string, MCPServerConfigEntry>;
}

/**
 * A single server entry in mcp.json.
 * Only stdio-based servers (those with `command`) are supported.
 */
interface MCPServerConfigEntry {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  /** HTTP-based servers have a type/url but no command — we skip these */
  type?: string;
  url?: string;
}

/**
 * Parse an mcp.json file and create MCPServerConfig entries for all
 * stdio-based servers.
 *
 * Handles JSONC (JSON with comments) by stripping single-line and
 * multi-line comments before parsing.
 *
 * @param configPath - Absolute path to the mcp.json file
 * @returns Map of server name → MCPServerConfig (only stdio servers)
 */
export function parseMCPConfig(configPath: string): Map<string, MCPServerConfig> {
  const raw = readFileSync(configPath, 'utf-8');

  // Strip JSONC comments while preserving strings.
  // Matches strings (to skip), block comments, and line comments.
  const stripped = raw.replace(
    /"(?:[^"\\]|\\.)*"|\/\*[\s\S]*?\*\/|\/\/.*$/gm,
    (match) => (match.startsWith('/') ? '' : match)
  );

  const config = JSON.parse(stripped) as MCPConfigFile;
  const result = new Map<string, MCPServerConfig>();

  if (!config.servers || typeof config.servers !== 'object') {
    return result;
  }

  for (const [name, entry] of Object.entries(config.servers)) {
    // Only support stdio-based servers (those with a command)
    if (!entry.command || typeof entry.command !== 'string') {
      continue;
    }

    result.set(name, {
      command: entry.command,
      args: Array.isArray(entry.args) ? entry.args.map(String) : [],
      ...(entry.env && typeof entry.env === 'object' ? { env: entry.env } : {}),
    });
  }

  return result;
}

// =============================================================================
// Tool Creation
// =============================================================================

/**
 * Create Beth Tool implementations from an MCP client's tools.
 *
 * Each MCP tool is wrapped as a Tool with namespaced name
 * (`mcp_<serverName>_<toolName>`) to avoid collisions.
 *
 * @param client - A connected MCPClient
 * @returns Array of Tool implementations wrapping MCP tools
 */
export async function createMCPTools(client: MCPClient): Promise<Tool[]> {
  const mcpTools: MCPToolInfo[] = await client.listTools();

  return mcpTools.map((info) => createToolWrapper(client, info));
}

/**
 * Create a single Tool wrapper for an MCP tool.
 */
function createToolWrapper(client: MCPClient, info: MCPToolInfo): Tool {
  const namespacedName = `mcp_${client.name}_${info.name}`;

  return {
    name: namespacedName,
    description: info.description,
    inputSchema: info.inputSchema,

    async execute(input: Record<string, unknown>, _context: ToolContext): Promise<ToolResult> {
      try {
        const result = await client.callTool(info.name, input);

        // MCP tool results can be structured; serialize for ToolResult output
        const output = typeof result === 'string'
          ? result
          : JSON.stringify(result);

        return {
          success: true,
          output,
          metadata: { mcpServer: client.name, mcpTool: info.name },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          output: '',
          error: message,
          metadata: { mcpServer: client.name, mcpTool: info.name },
        };
      }
    },
  };
}

// =============================================================================
// Full Loader
// =============================================================================

/**
 * Load all MCP tools from a config file.
 *
 * Connects to all stdio-based MCP servers defined in the config,
 * collects their tools, and returns them along with the client
 * references (for cleanup via `disconnect()`).
 *
 * Servers that fail to connect are skipped with a warning rather
 * than failing the entire load.
 *
 * @param configPath - Absolute path to the mcp.json file
 * @returns Object with all bridged tools and client references
 */
export async function loadAllMCPTools(configPath: string): Promise<{
  tools: Tool[];
  clients: MCPClient[];
}> {
  const configs = parseMCPConfig(configPath);
  const tools: Tool[] = [];
  const clients: MCPClient[] = [];

  for (const [name, config] of configs) {
    const client = new MCPClient(name, config);

    try {
      await client.connect();
      const serverTools = await createMCPTools(client);
      tools.push(...serverTools);
      clients.push(client);
    } catch {
      // Server not available — skip gracefully
      await client.disconnect().catch(() => { /* ignore cleanup errors */ });
    }
  }

  return { tools, clients };
}
