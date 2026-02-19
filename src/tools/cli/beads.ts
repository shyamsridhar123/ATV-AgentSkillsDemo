/**
 * Beads Tool
 *
 * Wraps the `bd` CLI for issue tracking via the beads system.
 * Supports creating, closing, listing, and inspecting issues
 * and their dependency trees.
 *
 * @see https://github.com/steveyegge/beads
 */

import { execFile as nodeExecFile } from 'node:child_process';
import type { Tool } from '../interface.js';
import type { ToolContext, ToolInputSchema, ToolResult } from '../types.js';
import { ToolError } from '../types.js';

/** Valid beads commands */
const BEADS_COMMANDS = ['create', 'close', 'list', 'ready', 'show', 'dep-tree'] as const;
type BeadsCommand = typeof BEADS_COMMANDS[number];

/** Type for the execFile callback-style function, used for dependency injection in tests */
type ExecFileFn = typeof nodeExecFile;

/** Input schema for the beads tool */
const inputSchema: ToolInputSchema = {
  type: 'object',
  properties: {
    command: {
      type: 'string',
      enum: [...BEADS_COMMANDS],
      description: 'Beads command to execute',
    },
    args: {
      type: 'object',
      description: 'Command-specific arguments',
      properties: {
        title: { type: 'string', description: 'Issue title (for create)' },
        description: { type: 'string', description: 'Issue description (for create)' },
        type: { type: 'string', enum: ['task', 'epic'], description: 'Issue type (for create)' },
        priority: { type: 'number', description: 'Priority level (for create)' },
        parent: { type: 'string', description: 'Parent issue ID (for create)' },
        deps: { type: 'string', description: 'Comma-separated dependency IDs (for create)' },
        label: { type: 'string', description: 'Label to apply (for create)' },
        id: { type: 'string', description: 'Issue ID (for close, show, dep-tree)' },
      },
    },
  },
  required: ['command'],
};

/**
 * Build the `bd` CLI argument array for a given command and args.
 *
 * @param command - The beads command to run
 * @param args - Command-specific arguments
 * @param toolName - Tool name for error reporting
 * @returns Array of string arguments to pass to `bd`
 */
function buildArgs(
  command: BeadsCommand,
  args: Record<string, unknown> | undefined,
  toolName: string,
): string[] {
  switch (command) {
    case 'create': {
      const title = args?.title;
      if (typeof title !== 'string' || title.trim().length === 0) {
        throw new ToolError('title is required for create command', 'INVALID_INPUT', toolName);
      }
      const result: string[] = ['create', title];
      if (typeof args?.description === 'string' && args.description.length > 0) {
        result.push(`--description=${args.description}`);
      }
      if (args?.type === 'epic') {
        result.push('--type', 'epic');
      }
      if (typeof args?.priority === 'number') {
        result.push('-p', String(args.priority));
      }
      if (typeof args?.parent === 'string' && args.parent.length > 0) {
        result.push('--parent', args.parent);
      }
      if (typeof args?.deps === 'string' && args.deps.length > 0) {
        result.push('--deps', args.deps);
      }
      if (typeof args?.label === 'string' && args.label.length > 0) {
        result.push('-l', args.label);
      }
      return result;
    }

    case 'close': {
      const id = args?.id;
      if (typeof id !== 'string' || id.trim().length === 0) {
        throw new ToolError('id is required for close command', 'INVALID_INPUT', toolName);
      }
      return ['close', id];
    }

    case 'list':
      return ['list'];

    case 'ready':
      return ['ready'];

    case 'show': {
      const id = args?.id;
      if (typeof id !== 'string' || id.trim().length === 0) {
        throw new ToolError('id is required for show command', 'INVALID_INPUT', toolName);
      }
      return ['show', id];
    }

    case 'dep-tree': {
      const id = args?.id;
      if (typeof id !== 'string' || id.trim().length === 0) {
        throw new ToolError('id is required for dep-tree command', 'INVALID_INPUT', toolName);
      }
      return ['dep', 'tree', id];
    }
  }
}

/**
 * Create a beads tool instance.
 *
 * Accepts an optional `execFn` for dependency injection in tests.
 * When omitted, uses `node:child_process.execFile`.
 *
 * @param execFn - Optional execFile function for testing
 * @returns A Tool implementation for beads
 */
export function createBeadsTool(execFn?: ExecFileFn): Tool {
  const exec = execFn ?? nodeExecFile;

  return {
    name: 'beads',
    description: 'Manage issues and work tracking via the beads (bd) CLI',
    inputSchema,

    async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
      // Check permission — beads runs as a CLI command
      if (!context.permissions.allowTerminal) {
        throw new ToolError('Terminal permission denied', 'PERMISSION_DENIED', 'beads');
      }

      // Validate command
      const command = input.command;
      if (typeof command !== 'string' || !BEADS_COMMANDS.includes(command as BeadsCommand)) {
        throw new ToolError(
          `command must be one of: ${BEADS_COMMANDS.join(', ')}`,
          'INVALID_INPUT',
          'beads',
        );
      }

      const args = (input.args ?? undefined) as Record<string, unknown> | undefined;
      const bdArgs = buildArgs(command as BeadsCommand, args, 'beads');

      // Verify bd is available
      await new Promise<void>((resolve, reject) => {
        exec('bd', ['--version'], { timeout: 5000 }, (error) => {
          if (error) {
            reject(new ToolError(
              'beads (bd) CLI not found. Install from https://github.com/steveyegge/beads',
              'NOT_FOUND',
              'beads',
              { cause: error },
            ));
          } else {
            resolve();
          }
        });
      });

      // Execute the bd command
      return new Promise<ToolResult>((resolve, reject) => {
        exec('bd', bdArgs, { cwd: context.workingDir, timeout: 30_000 }, (error, stdout, stderr) => {
          let output = '';
          if (stdout) output += stdout;
          if (stderr) {
            if (output.length > 0 && !output.endsWith('\n')) output += '\n';
            if (stderr.length > 0) output += stderr;
          }

          if (error) {
            reject(new ToolError(
              `bd ${command} failed: ${output || error.message}`,
              'EXECUTION_FAILED',
              'beads',
              { cause: error },
            ));
            return;
          }

          resolve({
            success: true,
            output: output.trim(),
            metadata: {
              command,
              args: bdArgs,
            },
          });
        });
      });
    },
  };
}

/** Default beads tool instance using real execFile */
export const beadsTool: Tool = createBeadsTool();
