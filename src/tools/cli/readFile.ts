/**
 * ReadFile Tool
 *
 * Reads the contents of a file with optional line-range selection.
 * Validates paths against traversal and injection attacks using
 * the shared path validation utilities.
 */

import { readFile } from 'node:fs/promises';
import { resolve, isAbsolute } from 'node:path';
import { containsTraversal, containsShellInjection } from '../../lib/pathValidation.js';
import type { Tool } from '../interface.js';
import type { ToolContext, ToolInputSchema, ToolResult } from '../types.js';
import { ToolError } from '../types.js';

/** Input schema for the readFile tool */
const inputSchema: ToolInputSchema = {
  type: 'object',
  properties: {
    filePath: {
      type: 'string',
      description: 'Absolute path to the file to read',
    },
    offset: {
      type: 'number',
      description: '1-based starting line number',
    },
    limit: {
      type: 'number',
      description: 'Maximum number of lines to read',
    },
  },
  required: ['filePath'],
};

/**
 * Validate a file path for read/write operations.
 * Checks for empty paths, null bytes, traversal sequences, and shell injection.
 *
 * @param filePath - The file path to validate
 * @param toolName - Name of the calling tool (for error reporting)
 * @throws {ToolError} If the path is invalid
 */
export function validateFilePath(filePath: unknown, toolName: string): string {
  if (typeof filePath !== 'string' || filePath.trim().length === 0) {
    throw new ToolError('filePath is required and must be a non-empty string', 'INVALID_INPUT', toolName);
  }

  const trimmed = filePath.trim();

  if (trimmed.length > 4096) {
    throw new ToolError('filePath exceeds maximum length (4096 characters)', 'INVALID_INPUT', toolName);
  }

  if (trimmed.includes('\0')) {
    throw new ToolError('filePath contains invalid characters (null byte)', 'INVALID_INPUT', toolName);
  }

  if (containsTraversal(trimmed)) {
    throw new ToolError('filePath contains directory traversal sequences', 'INVALID_INPUT', toolName);
  }

  if (containsShellInjection(trimmed)) {
    throw new ToolError('filePath contains potentially dangerous characters', 'INVALID_INPUT', toolName);
  }

  if (!isAbsolute(trimmed)) {
    throw new ToolError('filePath must be an absolute path', 'INVALID_INPUT', toolName);
  }

  return resolve(trimmed);
}

/**
 * ReadFile tool implementation.
 *
 * Reads file contents with optional line-range selection (offset/limit).
 * Validates paths and checks permissions before reading.
 */
export const readFileTool: Tool = {
  name: 'readFile',
  description: 'Read the contents of a file, optionally selecting a range of lines',
  inputSchema,

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    // Check permission
    if (!context.permissions.allowFileRead) {
      throw new ToolError('File read permission denied', 'PERMISSION_DENIED', 'readFile');
    }

    // Validate path
    const resolvedPath = validateFilePath(input.filePath, 'readFile');

    // Read file
    let contents: string;
    try {
      contents = await readFile(resolvedPath, 'utf-8');
    } catch (err: unknown) {
      const nodeErr = err as NodeJS.ErrnoException;
      if (nodeErr.code === 'ENOENT') {
        throw new ToolError(`File not found: ${resolvedPath}`, 'NOT_FOUND', 'readFile', { cause: nodeErr });
      }
      if (nodeErr.code === 'EACCES') {
        throw new ToolError(`Permission denied: ${resolvedPath}`, 'PERMISSION_DENIED', 'readFile', { cause: nodeErr });
      }
      throw new ToolError(
        `Failed to read file: ${nodeErr.message}`,
        'EXECUTION_FAILED',
        'readFile',
        { cause: nodeErr }
      );
    }

    // Apply offset/limit for line-range reading
    const offset = typeof input.offset === 'number' ? input.offset : undefined;
    const limit = typeof input.limit === 'number' ? input.limit : undefined;

    let output = contents;
    let totalLines = contents.split('\n').length;

    if (offset !== undefined || limit !== undefined) {
      const lines = contents.split('\n');
      totalLines = lines.length;

      // offset is 1-based
      const startIndex = offset !== undefined ? Math.max(0, offset - 1) : 0;
      const endIndex = limit !== undefined ? startIndex + limit : lines.length;

      output = lines.slice(startIndex, endIndex).join('\n');
    }

    return {
      success: true,
      output,
      metadata: {
        filePath: resolvedPath,
        totalLines,
        ...(offset !== undefined && { offset }),
        ...(limit !== undefined && { limit }),
      },
    };
  },
};
