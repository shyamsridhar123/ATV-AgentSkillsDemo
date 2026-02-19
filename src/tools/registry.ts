/**
 * Tool Registry
 *
 * Maps tool names to their implementations.
 * Provides lookup, enumeration, and conversion to
 * OpenAI-compatible tool definitions for function calling.
 */

import type { ToolDefinition } from '../providers/types.js';
import type { Tool } from './interface.js';
import { toToolDefinition } from './interface.js';
import { ToolError } from './types.js';

/**
 * Registry that maps tool names to implementations.
 *
 * Use this to register tools at startup and then retrieve them
 * when the LLM requests a function call. The `getDefinitions()`
 * method converts all registered tools into the format expected
 * by the LLM provider layer.
 *
 * @example
 * ```typescript
 * const registry = new ToolRegistry();
 * registry.register(readFileTool);
 * registry.register(editFileTool);
 *
 * // Pass definitions to LLM
 * const definitions = registry.getDefinitions();
 *
 * // Look up tool when LLM calls it
 * const tool = registry.get('readFile');
 * ```
 */
export class ToolRegistry {
  /** Internal map of tool name → tool implementation */
  private readonly tools: Map<string, Tool> = new Map();

  /**
   * Register a tool in the registry.
   *
   * @param tool - The tool to register
   * @throws {ToolError} If a tool with the same name is already registered
   */
  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      throw new ToolError(
        `Tool "${tool.name}" is already registered`,
        'INVALID_INPUT',
        tool.name
      );
    }
    this.tools.set(tool.name, tool);
  }

  /**
   * Get a tool by name.
   *
   * @param name - The name of the tool to retrieve
   * @returns The tool, or undefined if not found
   */
  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /**
   * Check if a tool is registered.
   *
   * @param name - The name of the tool to check
   * @returns True if the tool is registered
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * List all registered tools.
   *
   * @returns Array of all registered tools
   */
  list(): Tool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get OpenAI-compatible tool definitions for all registered tools.
   *
   * Use this to pass tool definitions to the LLM provider's
   * chat completion request.
   *
   * @returns Array of tool definitions for function calling
   */
  getDefinitions(): ToolDefinition[] {
    return this.list().map(toToolDefinition);
  }

  /**
   * Remove a tool from the registry.
   *
   * @param name - The name of the tool to remove
   * @returns True if the tool was removed, false if it was not found
   */
  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  /**
   * Remove all tools from the registry.
   */
  clear(): void {
    this.tools.clear();
  }
}
