/**
 * Tool Abstraction Module
 *
 * Barrel exports for the tool abstraction layer.
 * Provides a uniform interface for agent tools regardless of
 * runtime environment (CLI, Copilot, MCP).
 */

import { readFileTool } from './cli/readFile.js';
import { editFileTool } from './cli/editFile.js';
import { searchTool } from './cli/search.js';
import { terminalTool } from './cli/terminal.js';
import { beadsTool } from './cli/beads.js';
import { subagentTool } from './cli/subagent.js';
import { ToolRegistry } from './registry.js';

// Types
export type {
  ToolErrorCode,
  ToolPermissions,
  ToolContext,
  ToolResult,
  ToolInputSchema,
} from './types.js';

export { ToolError } from './types.js';

// Interface
export type { Tool } from './interface.js';

export { toToolDefinition } from './interface.js';

// Registry
export { ToolRegistry } from './registry.js';

// CLI tool implementations
export { readFileTool } from './cli/readFile.js';
export { editFileTool } from './cli/editFile.js';
export { searchTool } from './cli/search.js';
export { terminalTool } from './cli/terminal.js';
export { beadsTool } from './cli/beads.js';
export { subagentTool, isSubagentRequest } from './cli/subagent.js';

// MCP client and bridge
export { MCPClient } from './mcp/client.js';
export type { MCPServerConfig, MCPToolInfo } from './mcp/client.js';
export { parseMCPConfig, createMCPTools, loadAllMCPTools } from './mcp/bridge.js';

// Convenience factory

/** Create a ToolRegistry pre-loaded with all built-in CLI tools */
export function createDefaultRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(readFileTool);
  registry.register(editFileTool);
  registry.register(searchTool);
  registry.register(terminalTool);
  registry.register(beadsTool);
  registry.register(subagentTool);
  return registry;
}
