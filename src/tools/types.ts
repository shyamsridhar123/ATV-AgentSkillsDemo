/**
 * Tool Abstraction Types
 *
 * Type definitions for the tool abstraction layer.
 * Tools provide a uniform interface for agent capabilities
 * regardless of runtime environment (CLI, Copilot, MCP).
 */

import type { JSONSchema } from '../providers/types.js';

// =============================================================================
// Error Types
// =============================================================================

/**
 * Error codes for tool execution errors.
 * Used to categorize failures and provide actionable error messages.
 */
export type ToolErrorCode =
  | 'INVALID_INPUT'      // Input does not match the tool's schema
  | 'PERMISSION_DENIED'  // Tool lacks required permissions in the context
  | 'EXECUTION_FAILED'   // Tool ran but encountered an error
  | 'NOT_FOUND'          // Requested resource (file, tool, etc.) not found
  | 'TIMEOUT';           // Tool execution exceeded time limit

/**
 * Custom error class for tool execution errors.
 * Includes an error code for programmatic handling and
 * an optional cause for error chaining.
 */
export class ToolError extends Error {
  /** Categorized error code for programmatic handling */
  readonly code: ToolErrorCode;

  /** Name of the tool that generated this error */
  readonly toolName: string;

  /** Original error that caused this error */
  readonly cause?: Error;

  constructor(
    message: string,
    code: ToolErrorCode,
    toolName: string,
    options?: {
      cause?: Error;
    }
  ) {
    super(message);
    this.name = 'ToolError';
    this.code = code;
    this.toolName = toolName;

    if (options?.cause) {
      this.cause = options.cause;
    }
  }
}

// =============================================================================
// Permission Types
// =============================================================================

/**
 * Permissions governing what a tool is allowed to do.
 * Enforced by tool implementations before performing operations.
 */
export interface ToolPermissions {
  /** Whether the tool can read files from the filesystem */
  allowFileRead: boolean;

  /** Whether the tool can write or modify files on the filesystem */
  allowFileWrite: boolean;

  /** Whether the tool can execute terminal commands */
  allowTerminal: boolean;

  /** Whether the tool can make network requests */
  allowNetwork: boolean;
}

// =============================================================================
// Context Types
// =============================================================================

/**
 * Execution context provided to a tool when it runs.
 * Contains the working directory, permissions, and an optional abort signal.
 */
export interface ToolContext {
  /** Absolute path to the working directory for file operations */
  workingDir: string;

  /** Permissions governing what the tool is allowed to do */
  permissions: ToolPermissions;

  /** Optional signal for cancelling tool execution */
  signal?: AbortSignal;
}

// =============================================================================
// Result Types
// =============================================================================

/**
 * Result returned by a tool after execution.
 * Includes a success flag, output text, and optional error/metadata.
 */
export interface ToolResult {
  /** Whether the tool executed successfully */
  success: boolean;

  /** Human-readable output from the tool */
  output: string;

  /** Error message if the tool failed */
  error?: string;

  /** Additional structured metadata from the tool execution */
  metadata?: Record<string, unknown>;
}

// =============================================================================
// Schema Types
// =============================================================================

/**
 * JSON Schema type for tool input validation.
 * Re-exports the JSONSchema type from the providers layer for consistency.
 */
export type ToolInputSchema = JSONSchema;
