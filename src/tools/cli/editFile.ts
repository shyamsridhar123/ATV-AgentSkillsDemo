/**
 * EditFile Tool
 *
 * Replaces an exact string occurrence in a file.
 * Uses atomic write (write to temp file, then rename) to prevent
 * data loss on failure. Validates paths against traversal and
 * injection attacks using the shared path validation utilities.
 */

import { readFile, writeFile, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { validateFilePath } from './readFile.js';
import type { Tool } from '../interface.js';
import type { ToolContext, ToolInputSchema, ToolResult } from '../types.js';
import { ToolError } from '../types.js';

/** Input schema for the editFile tool */
const inputSchema: ToolInputSchema = {
  type: 'object',
  properties: {
    filePath: {
      type: 'string',
      description: 'Absolute path to the file to edit',
    },
    oldString: {
      type: 'string',
      description: 'Exact string to find and replace (must match exactly once)',
    },
    newString: {
      type: 'string',
      description: 'Replacement string',
    },
  },
  required: ['filePath', 'oldString', 'newString'],
};

/**
 * EditFile tool implementation.
 *
 * Reads a file, replaces exactly one occurrence of oldString with newString,
 * and writes the result back atomically (write temp + rename).
 */
export const editFileTool: Tool = {
  name: 'editFile',
  description: 'Replace an exact string in a file. The oldString must match exactly once.',
  inputSchema,

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    // Check permission
    if (!context.permissions.allowFileWrite) {
      throw new ToolError('File write permission denied', 'PERMISSION_DENIED', 'editFile');
    }

    // Validate path
    const resolvedPath = validateFilePath(input.filePath, 'editFile');

    // Validate oldString / newString
    const oldString = input.oldString;
    const newString = input.newString;

    if (typeof oldString !== 'string') {
      throw new ToolError('oldString is required and must be a string', 'INVALID_INPUT', 'editFile');
    }
    if (typeof newString !== 'string') {
      throw new ToolError('newString is required and must be a string', 'INVALID_INPUT', 'editFile');
    }
    if (oldString.length === 0) {
      throw new ToolError('oldString cannot be empty', 'INVALID_INPUT', 'editFile');
    }

    // Read file
    let contents: string;
    try {
      contents = await readFile(resolvedPath, 'utf-8');
    } catch (err: unknown) {
      const nodeErr = err as NodeJS.ErrnoException;
      if (nodeErr.code === 'ENOENT') {
        throw new ToolError(`File not found: ${resolvedPath}`, 'NOT_FOUND', 'editFile', { cause: nodeErr });
      }
      if (nodeErr.code === 'EACCES') {
        throw new ToolError(`Permission denied: ${resolvedPath}`, 'PERMISSION_DENIED', 'editFile', { cause: nodeErr });
      }
      throw new ToolError(
        `Failed to read file: ${nodeErr.message}`,
        'EXECUTION_FAILED',
        'editFile',
        { cause: nodeErr }
      );
    }

    // Count occurrences of oldString
    let count = 0;
    let searchStart = 0;
    while (true) {
      const idx = contents.indexOf(oldString, searchStart);
      if (idx === -1) break;
      count++;
      searchStart = idx + oldString.length;
    }

    if (count === 0) {
      throw new ToolError(
        'oldString not found in file. Ensure the string matches exactly, including whitespace and indentation.',
        'EXECUTION_FAILED',
        'editFile'
      );
    }
    if (count > 1) {
      throw new ToolError(
        `oldString found ${count} times — ambiguous match, include more context to match exactly once`,
        'EXECUTION_FAILED',
        'editFile'
      );
    }

    // Replace (exactly one occurrence)
    const updated = contents.replace(oldString, newString);

    // Atomic write: write to temp file, then rename
    const dir = dirname(resolvedPath);
    const tempSuffix = randomBytes(8).toString('hex');
    const tempPath = join(dir, `.beth-edit-${tempSuffix}.tmp`);

    try {
      await writeFile(tempPath, updated, 'utf-8');
      await rename(tempPath, resolvedPath);
    } catch (err: unknown) {
      // Best-effort cleanup of temp file on failure
      try {
        const { unlink } = await import('node:fs/promises');
        await unlink(tempPath);
      } catch {
        // Ignore cleanup errors
      }
      const nodeErr = err as NodeJS.ErrnoException;
      throw new ToolError(
        `Failed to write file: ${nodeErr.message}`,
        'EXECUTION_FAILED',
        'editFile',
        { cause: nodeErr }
      );
    }

    return {
      success: true,
      output: `Successfully replaced string in ${resolvedPath}`,
      metadata: {
        filePath: resolvedPath,
        replacements: 1,
      },
    };
  },
};
