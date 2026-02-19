/**
 * Beads Tool Tests
 *
 * Tests for the beads tool implementation.
 * Uses dependency injection (createBeadsTool) to mock execFile.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createBeadsTool } from './beads.js';
import type { ToolContext } from '../types.js';
import { ToolError } from '../types.js';

/** Create a ToolContext with sensible defaults */
function createContext(overrides?: Partial<ToolContext>): ToolContext {
  return {
    workingDir: '/tmp/test',
    permissions: overrides?.permissions ?? {
      allowFileRead: false,
      allowFileWrite: false,
      allowTerminal: true,
      allowNetwork: false,
    },
    signal: overrides?.signal,
  };
}

/**
 * Create a mock execFile function that records calls and returns configured output.
 *
 * @param responses - Map of first-arg command to { stdout, stderr, error }
 * @returns [mockFn, calls] — the mock function and an array of recorded call args
 */
function createMockExec(responses?: {
  version?: { stdout?: string; stderr?: string; error?: Error | null };
  command?: { stdout?: string; stderr?: string; error?: Error | null };
}) {
  const calls: Array<{ file: string; args: string[] }> = [];

  const mockFn = (
    file: string,
    args: readonly string[],
    _options: unknown,
    callback: (error: Error | null, stdout: string, stderr: string) => void,
  ) => {
    calls.push({ file, args: [...args] });

    // First call is --version check, subsequent calls are the actual command
    const isVersionCheck = args.includes('--version');
    const response = isVersionCheck
      ? (responses?.version ?? { stdout: 'beads 1.0.0', stderr: '', error: null })
      : (responses?.command ?? { stdout: 'ok', stderr: '', error: null });

    // Use setImmediate to keep callback async like real execFile
    setImmediate(() => {
      callback(response.error ?? null, response.stdout ?? '', response.stderr ?? '');
    });

    // Return a minimal ChildProcess-like object
    return { kill: () => {} };
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return [mockFn as any, calls] as const;
}

describe('beads tool', () => {
  describe('metadata', () => {
    it('should have name "beads"', () => {
      const [mockFn] = createMockExec();
      const tool = createBeadsTool(mockFn);
      assert.strictEqual(tool.name, 'beads');
    });

    it('should have a description', () => {
      const [mockFn] = createMockExec();
      const tool = createBeadsTool(mockFn);
      assert.ok(tool.description.length > 0);
    });

    it('should have an inputSchema with command required', () => {
      const [mockFn] = createMockExec();
      const tool = createBeadsTool(mockFn);
      assert.strictEqual(tool.inputSchema.type, 'object');
      assert.ok(Array.isArray(tool.inputSchema.required));
      assert.ok((tool.inputSchema.required as string[]).includes('command'));
    });
  });

  describe('command building — create', () => {
    it('should build args for create with title only', async () => {
      const [mockFn, calls] = createMockExec();
      const tool = createBeadsTool(mockFn);
      await tool.execute({ command: 'create', args: { title: 'Fix bug' } }, createContext());
      // Second call is the actual command (first is --version)
      assert.deepStrictEqual(calls[1].args, ['create', 'Fix bug']);
    });

    it('should build args for create with all optional args', async () => {
      const [mockFn, calls] = createMockExec();
      const tool = createBeadsTool(mockFn);
      await tool.execute({
        command: 'create',
        args: {
          title: 'Feature X',
          description: 'Build feature X',
          type: 'epic',
          priority: 1,
          parent: 'abc-123',
          deps: 'dep-1,dep-2',
          label: 'in_progress',
        },
      }, createContext());

      const cmdArgs = calls[1].args;
      assert.strictEqual(cmdArgs[0], 'create');
      assert.strictEqual(cmdArgs[1], 'Feature X');
      assert.ok(cmdArgs.includes('--description=Build feature X'));
      assert.ok(cmdArgs.includes('--type'));
      assert.ok(cmdArgs.includes('epic'));
      assert.ok(cmdArgs.includes('-p'));
      assert.ok(cmdArgs.includes('1'));
      assert.ok(cmdArgs.includes('--parent'));
      assert.ok(cmdArgs.includes('abc-123'));
      assert.ok(cmdArgs.includes('--deps'));
      assert.ok(cmdArgs.includes('dep-1,dep-2'));
      assert.ok(cmdArgs.includes('-l'));
      assert.ok(cmdArgs.includes('in_progress'));
    });

    it('should reject create without title', async () => {
      const [mockFn] = createMockExec();
      const tool = createBeadsTool(mockFn);
      await assert.rejects(
        () => tool.execute({ command: 'create', args: {} }, createContext()),
        (err: unknown) => {
          assert.ok(err instanceof ToolError);
          assert.strictEqual(err.code, 'INVALID_INPUT');
          assert.ok(err.message.includes('title'));
          return true;
        },
      );
    });
  });

  describe('command building — close', () => {
    it('should build args for close', async () => {
      const [mockFn, calls] = createMockExec();
      const tool = createBeadsTool(mockFn);
      await tool.execute({ command: 'close', args: { id: 'issue-1' } }, createContext());
      assert.deepStrictEqual(calls[1].args, ['close', 'issue-1']);
    });

    it('should reject close without id', async () => {
      const [mockFn] = createMockExec();
      const tool = createBeadsTool(mockFn);
      await assert.rejects(
        () => tool.execute({ command: 'close', args: {} }, createContext()),
        (err: unknown) => {
          assert.ok(err instanceof ToolError);
          assert.strictEqual(err.code, 'INVALID_INPUT');
          assert.ok(err.message.includes('id'));
          return true;
        },
      );
    });
  });

  describe('command building — list', () => {
    it('should build args for list', async () => {
      const [mockFn, calls] = createMockExec();
      const tool = createBeadsTool(mockFn);
      await tool.execute({ command: 'list' }, createContext());
      assert.deepStrictEqual(calls[1].args, ['list']);
    });
  });

  describe('command building — ready', () => {
    it('should build args for ready', async () => {
      const [mockFn, calls] = createMockExec();
      const tool = createBeadsTool(mockFn);
      await tool.execute({ command: 'ready' }, createContext());
      assert.deepStrictEqual(calls[1].args, ['ready']);
    });
  });

  describe('command building — show', () => {
    it('should build args for show', async () => {
      const [mockFn, calls] = createMockExec();
      const tool = createBeadsTool(mockFn);
      await tool.execute({ command: 'show', args: { id: 'issue-2' } }, createContext());
      assert.deepStrictEqual(calls[1].args, ['show', 'issue-2']);
    });

    it('should reject show without id', async () => {
      const [mockFn] = createMockExec();
      const tool = createBeadsTool(mockFn);
      await assert.rejects(
        () => tool.execute({ command: 'show', args: {} }, createContext()),
        (err: unknown) => {
          assert.ok(err instanceof ToolError);
          assert.strictEqual(err.code, 'INVALID_INPUT');
          assert.ok(err.message.includes('id'));
          return true;
        },
      );
    });
  });

  describe('command building — dep-tree', () => {
    it('should build args for dep-tree', async () => {
      const [mockFn, calls] = createMockExec();
      const tool = createBeadsTool(mockFn);
      await tool.execute({ command: 'dep-tree', args: { id: 'issue-3' } }, createContext());
      assert.deepStrictEqual(calls[1].args, ['dep', 'tree', 'issue-3']);
    });

    it('should reject dep-tree without id', async () => {
      const [mockFn] = createMockExec();
      const tool = createBeadsTool(mockFn);
      await assert.rejects(
        () => tool.execute({ command: 'dep-tree', args: {} }, createContext()),
        (err: unknown) => {
          assert.ok(err instanceof ToolError);
          assert.strictEqual(err.code, 'INVALID_INPUT');
          assert.ok(err.message.includes('id'));
          return true;
        },
      );
    });
  });

  describe('permissions', () => {
    it('should throw PERMISSION_DENIED when allowTerminal is false', async () => {
      const [mockFn] = createMockExec();
      const tool = createBeadsTool(mockFn);
      const ctx = createContext({
        permissions: {
          allowFileRead: false,
          allowFileWrite: false,
          allowTerminal: false,
          allowNetwork: false,
        },
      });
      await assert.rejects(
        () => tool.execute({ command: 'list' }, ctx),
        (err: unknown) => {
          assert.ok(err instanceof ToolError);
          assert.strictEqual(err.code, 'PERMISSION_DENIED');
          return true;
        },
      );
    });
  });

  describe('bd not installed', () => {
    it('should throw NOT_FOUND when bd --version fails', async () => {
      const [mockFn] = createMockExec({
        version: { error: new Error('command not found: bd'), stdout: '', stderr: '' },
      });
      const tool = createBeadsTool(mockFn);
      await assert.rejects(
        () => tool.execute({ command: 'list' }, createContext()),
        (err: unknown) => {
          assert.ok(err instanceof ToolError);
          assert.strictEqual(err.code, 'NOT_FOUND');
          assert.ok(err.message.includes('bd'));
          return true;
        },
      );
    });
  });

  describe('command execution failure', () => {
    it('should throw EXECUTION_FAILED on bd errors', async () => {
      const [mockFn] = createMockExec({
        command: { error: new Error('bd close failed'), stdout: '', stderr: 'no such issue' },
      });
      const tool = createBeadsTool(mockFn);
      await assert.rejects(
        () => tool.execute({ command: 'close', args: { id: 'bad-id' } }, createContext()),
        (err: unknown) => {
          assert.ok(err instanceof ToolError);
          assert.strictEqual(err.code, 'EXECUTION_FAILED');
          return true;
        },
      );
    });
  });

  describe('invalid command', () => {
    it('should throw INVALID_INPUT for unknown command', async () => {
      const [mockFn] = createMockExec();
      const tool = createBeadsTool(mockFn);
      await assert.rejects(
        () => tool.execute({ command: 'purge' }, createContext()),
        (err: unknown) => {
          assert.ok(err instanceof ToolError);
          assert.strictEqual(err.code, 'INVALID_INPUT');
          return true;
        },
      );
    });
  });

  describe('successful output', () => {
    it('should return success with trimmed output', async () => {
      const [mockFn] = createMockExec({
        command: { stdout: '  issue-1: Fix bug\n', stderr: '', error: null },
      });
      const tool = createBeadsTool(mockFn);
      const result = await tool.execute({ command: 'list' }, createContext());
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.output, 'issue-1: Fix bug');
    });

    it('should include command and args in metadata', async () => {
      const [mockFn] = createMockExec();
      const tool = createBeadsTool(mockFn);
      const result = await tool.execute({ command: 'ready' }, createContext());
      assert.strictEqual(result.metadata?.command, 'ready');
      assert.deepStrictEqual(result.metadata?.args, ['ready']);
    });
  });
});
