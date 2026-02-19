/**
 * Tool Interface
 *
 * Abstract interface for all tool implementations.
 * Tools are the bridge between LLM function calling and actual
 * operations (file I/O, terminal commands, search, etc.).
 */

import type { ToolDefinition } from '../providers/types.js';
import type { ToolContext, ToolInputSchema, ToolResult } from './types.js';

// =============================================================================
// Tool Interface
// =============================================================================

/**
 * Interface that all tool implementations must satisfy.
 *
 * Each tool has a unique name, a description for the LLM, a JSON Schema
 * describing its expected input, and an execute method that performs the
 * actual operation.
 *
 * @example
 * ```typescript
 * const readFileTool: Tool = {
 *   name: 'readFile',
 *   description: 'Read the contents of a file',
 *   inputSchema: {
 *     type: 'object',
 *     properties: {
 *       path: { type: 'string', description: 'File path to read' }
 *     },
 *     required: ['path'],
 *   },
 *   async execute(input, context) {
 *     const filePath = input.path as string;
 *     // ... read file logic
 *     return { success: true, output: contents };
 *   },
 * };
 * ```
 */
export interface Tool {
  /** Unique name for this tool (e.g., 'readFile', 'editFile', 'search') */
  readonly name: string;

  /** Human-readable description of what this tool does */
  readonly description: string;

  /** JSON Schema describing the expected input */
  readonly inputSchema: ToolInputSchema;

  /** Execute the tool with given input and context */
  execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult>;
}

// =============================================================================
// Conversion Helpers
// =============================================================================

/**
 * Convert a Tool to an OpenAI-compatible ToolDefinition.
 *
 * This bridges the tool abstraction layer into the LLM provider layer,
 * allowing registered tools to be passed as function definitions in
 * chat completion requests.
 *
 * @param tool - The tool to convert
 * @returns An OpenAI-compatible tool definition for function calling
 *
 * @example
 * ```typescript
 * const definition = toToolDefinition(readFileTool);
 * // { type: 'function', function: { name: 'readFile', description: '...', parameters: {...} } }
 * ```
 */
export function toToolDefinition(tool: Tool): ToolDefinition {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  };
}
