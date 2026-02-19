/**
 * Terminal Tool
 *
 * Executes shell commands in a controlled environment.
 * Uses execFile with /bin/sh to maintain a single controlled shell entry point.
 * Validates working directory and enforces timeouts and output limits.
 */

import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { containsTraversal } from '../../lib/pathValidation.js';
import type { Tool } from '../interface.js';
import type { ToolContext, ToolInputSchema, ToolResult } from '../types.js';
import { ToolError } from '../types.js';

/** Default timeout in milliseconds (30 seconds) */
const DEFAULT_TIMEOUT = 30_000;

/** Maximum output size in bytes (50KB) */
const MAX_OUTPUT_BYTES = 50 * 1024;

/** Input schema for the terminal tool */
const inputSchema: ToolInputSchema = {
  type: 'object',
  properties: {
    command: {
      type: 'string',
      description: 'Shell command to execute',
    },
    cwd: {
      type: 'string',
      description: 'Working directory for the command (defaults to context workingDir)',
    },
    timeout: {
      type: 'number',
      description: 'Timeout in milliseconds (default: 30000)',
    },
  },
  required: ['command'],
};

/**
 * Validate and resolve the working directory, ensuring it stays within workingDir.
 *
 * @param cwd - User-provided working directory
 * @param workingDir - The allowed root directory
 * @param toolName - Name of the calling tool (for error reporting)
 * @returns The resolved absolute path
 * @throws {ToolError} If the path escapes workingDir or contains traversal
 */
function validateCwd(cwd: string, workingDir: string, toolName: string): string {
  if (containsTraversal(cwd)) {
    throw new ToolError('Working directory contains directory traversal sequences', 'INVALID_INPUT', toolName);
  }

  const resolved = resolve(workingDir, cwd);
  const normalizedWorking = resolve(workingDir);

  if (!resolved.startsWith(normalizedWorking)) {
    throw new ToolError('Working directory is outside the allowed directory', 'INVALID_INPUT', toolName);
  }

  return resolved;
}

/**
 * Truncate output to the maximum allowed size, appending a notice if truncated.
 */
function truncateOutput(output: string): string {
  const bytes = Buffer.byteLength(output, 'utf-8');
  if (bytes <= MAX_OUTPUT_BYTES) {
    return output;
  }

  // Truncate by bytes, then trim to last complete character
  const truncated = Buffer.from(output, 'utf-8').subarray(0, MAX_OUTPUT_BYTES).toString('utf-8');
  return truncated + '\n\n[Output truncated — exceeded 50KB limit]';
}

/**
 * Terminal tool implementation.
 *
 * Executes shell commands using execFile with /bin/sh for a controlled
 * shell entry point. Captures stdout/stderr, enforces timeouts, and
 * truncates large output.
 *
 * SECURITY: Uses execFile('/bin/sh', ['-c', command]) — never exec with shell:true.
 */
export const terminalTool: Tool = {
  name: 'terminal',
  description: 'Execute a shell command and return its output',
  inputSchema,

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    // Check permission
    if (!context.permissions.allowTerminal) {
      throw new ToolError('Terminal permission denied', 'PERMISSION_DENIED', 'terminal');
    }

    // Validate command
    const command = input.command;
    if (typeof command !== 'string' || command.trim().length === 0) {
      throw new ToolError('command is required and must be a non-empty string', 'INVALID_INPUT', 'terminal');
    }

    // Resolve and validate cwd
    const rawCwd = typeof input.cwd === 'string' ? input.cwd : context.workingDir;
    const cwd = validateCwd(rawCwd, context.workingDir, 'terminal');

    // Resolve timeout
    const timeout = typeof input.timeout === 'number' && input.timeout > 0
      ? input.timeout
      : DEFAULT_TIMEOUT;

    return new Promise<ToolResult>((resolvePromise, rejectPromise) => {
      const child = execFile(
        '/bin/sh',
        ['-c', command],
        {
          cwd,
          timeout,
          maxBuffer: MAX_OUTPUT_BYTES * 2, // Allow extra buffer, we truncate ourselves
          signal: context.signal,
        },
        (error, stdout, stderr) => {
          // Combine stdout and stderr
          let combined = '';
          if (stdout) combined += stdout;
          if (stderr) {
            if (combined.length > 0 && !combined.endsWith('\n')) combined += '\n';
            if (stderr.length > 0) combined += stderr;
          }

          const output = truncateOutput(combined);

          if (error) {
            // Timeout: killed is true when the timeout fires
            if (error.killed) {
              rejectPromise(new ToolError(
                `Command timed out after ${timeout}ms`,
                'TIMEOUT',
                'terminal',
                { cause: error },
              ));
              return;
            }

            const nodeErr = error as NodeJS.ErrnoException;

            // Spawn/exec failure (not a non-zero exit code)
            if (nodeErr.code === 'ENOENT' || nodeErr.code === 'EACCES') {
              rejectPromise(new ToolError(
                `Failed to execute command: ${nodeErr.message}`,
                'EXECUTION_FAILED',
                'terminal',
                { cause: error },
              ));
              return;
            }

            // Abort signal
            if (nodeErr.code === 'ABORT_ERR' || nodeErr.name === 'AbortError') {
              rejectPromise(new ToolError(
                'Command was aborted',
                'EXECUTION_FAILED',
                'terminal',
                { cause: error },
              ));
              return;
            }

            // Non-zero exit code: still success=true, include exit code in metadata
            const exitCode = typeof (error as { code?: unknown }).code === 'number'
              ? (error as { code: number }).code
              : 1;

            resolvePromise({
              success: true,
              output,
              metadata: {
                exitCode,
                cwd,
              },
            });
            return;
          }

          resolvePromise({
            success: true,
            output,
            metadata: {
              exitCode: 0,
              cwd,
            },
          });
        },
      );

      // Ensure child process is cleaned up on abort
      if (context.signal) {
        context.signal.addEventListener('abort', () => {
          child.kill();
        }, { once: true });
      }
    });
  },
};
