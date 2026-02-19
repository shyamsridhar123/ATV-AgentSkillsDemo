/**
 * Tool Abstraction Module
 *
 * Barrel exports for the tool abstraction layer.
 * Provides a uniform interface for agent tools regardless of
 * runtime environment (CLI, Copilot, MCP).
 */

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
