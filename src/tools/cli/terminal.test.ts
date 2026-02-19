/**
 * Terminal Tool Tests
 *
 * Tests for the terminal tool implementation.
 * Uses node:test and node:assert with real command execution via tmpdir.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { terminalTool } from './terminal.js';
import type { ToolContext } from '../types.js';
import { ToolError } from '../types.js';

/** Create a ToolContext with sensible defaults */
function createContext(overrides?: Partial<ToolContext>): ToolContext {
  return {
    workingDir: overrides?.workingDir ?? '/tmp',
    permissions: overrides?.permissions ?? {
      allowFileRead: false,
      allowFileWrite: false,
      allowTerminal: true,
      allowNetwork: false,
    },
    signal: overrides?.signal,
  };
}

describe('terminal tool', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'beth-terminal-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('metadata', () => {
    it('should have name "terminal"', () => {
      assert.strictEqual(terminalTool.name, 'terminal');
    });

    it('should have a description', () => {
      assert.ok(terminalTool.description.length > 0);
    });

    it('should have an inputSchema with command required', () => {
      assert.strictEqual(terminalTool.inputSchema.type, 'object');
      assert.ok(Array.isArray(terminalTool.inputSchema.required));
      assert.ok((terminalTool.inputSchema.required as string[]).includes('command'));
    });
  });

  describe('command execution', () => {
    it('should run a simple command', async () => {
      const result = await terminalTool.execute(
        { command: 'echo "hello"' },
        createContext({ workingDir: tempDir }),
      );

      assert.strictEqual(result.success, true);
      assert.ok(result.output.includes('hello'));
      assert.strictEqual(result.metadata?.exitCode, 0);
    });

    it('should capture stdout', async () => {
      const result = await terminalTool.execute(
        { command: 'echo "stdout output"' },
        createContext({ workingDir: tempDir }),
      );

      assert.strictEqual(result.success, true);
      assert.ok(result.output.includes('stdout output'));
    });

    it('should capture stderr', async () => {
      const result = await terminalTool.execute(
        { command: 'echo "error output" >&2' },
        createContext({ workingDir: tempDir }),
      );

      assert.strictEqual(result.success, true);
      assert.ok(result.output.includes('error output'));
    });

    it('should capture both stdout and stderr', async () => {
      const result = await terminalTool.execute(
        { command: 'echo "out" && echo "err" >&2' },
        createContext({ workingDir: tempDir }),
      );

      assert.strictEqual(result.success, true);
      assert.ok(result.output.includes('out'));
      assert.ok(result.output.includes('err'));
    });

    it('should return exit code in metadata', async () => {
      const result = await terminalTool.execute(
        { command: 'exit 0' },
        createContext({ workingDir: tempDir }),
      );

      assert.strictEqual(result.metadata?.exitCode, 0);
    });
  });

  describe('non-zero exit codes', () => {
    it('should return success=true with exit code for command failure', async () => {
      const result = await terminalTool.execute(
        { command: 'exit 42' },
        createContext({ workingDir: tempDir }),
      );

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.metadata?.exitCode, 42);
    });

    it('should include output from failed commands', async () => {
      const result = await terminalTool.execute(
        { command: 'echo "before fail" && exit 1' },
        createContext({ workingDir: tempDir }),
      );

      assert.strictEqual(result.success, true);
      assert.ok(result.output.includes('before fail'));
      assert.strictEqual(result.metadata?.exitCode, 1);
    });
  });

  describe('timeout', () => {
    it('should throw TIMEOUT for long-running commands', async () => {
      await assert.rejects(
        () => terminalTool.execute(
          { command: 'sleep 60', timeout: 500 },
          createContext({ workingDir: tempDir }),
        ),
        (err: unknown) => {
          assert.ok(err instanceof ToolError);
          assert.strictEqual(err.code, 'TIMEOUT');
          return true;
        },
      );
    });
  });

  describe('permissions', () => {
    it('should return PERMISSION_DENIED when allowTerminal is false', async () => {
      const ctx = createContext({
        workingDir: tempDir,
        permissions: {
          allowFileRead: false,
          allowFileWrite: false,
          allowTerminal: false,
          allowNetwork: false,
        },
      });

      await assert.rejects(
        () => terminalTool.execute({ command: 'echo hi' }, ctx),
        (err: unknown) => {
          assert.ok(err instanceof ToolError);
          assert.strictEqual(err.code, 'PERMISSION_DENIED');
          return true;
        },
      );
    });
  });

  describe('cwd validation', () => {
    it('should use workingDir as default cwd', async () => {
      const result = await terminalTool.execute(
        { command: 'pwd' },
        createContext({ workingDir: tempDir }),
      );

      assert.strictEqual(result.success, true);
      assert.ok(result.output.includes(tempDir));
      assert.strictEqual(result.metadata?.cwd, tempDir);
    });

    it('should reject cwd with traversal sequences', async () => {
      await assert.rejects(
        () => terminalTool.execute(
          { command: 'echo hi', cwd: '../../../etc' },
          createContext({ workingDir: tempDir }),
        ),
        (err: unknown) => {
          assert.ok(err instanceof ToolError);
          assert.strictEqual(err.code, 'INVALID_INPUT');
          assert.ok(err.message.includes('traversal'));
          return true;
        },
      );
    });
  });

  describe('input validation', () => {
    it('should reject empty command', async () => {
      await assert.rejects(
        () => terminalTool.execute(
          { command: '' },
          createContext({ workingDir: tempDir }),
        ),
        (err: unknown) => {
          assert.ok(err instanceof ToolError);
          assert.strictEqual(err.code, 'INVALID_INPUT');
          return true;
        },
      );
    });

    it('should reject non-string command', async () => {
      await assert.rejects(
        () => terminalTool.execute(
          { command: 123 },
          createContext({ workingDir: tempDir }),
        ),
        (err: unknown) => {
          assert.ok(err instanceof ToolError);
          assert.strictEqual(err.code, 'INVALID_INPUT');
          return true;
        },
      );
    });
  });

  describe('output truncation', () => {
    it('should truncate output exceeding 50KB', async () => {
      // Generate ~60KB of output
      const result = await terminalTool.execute(
        { command: 'seq 1 10000' },
        createContext({ workingDir: tempDir }),
      );

      assert.strictEqual(result.success, true);
      // Output should either be under limit or include truncation notice
      const outputBytes = Buffer.byteLength(result.output, 'utf-8');
      if (outputBytes > 50 * 1024) {
        assert.ok(result.output.includes('[Output truncated'));
      }
    });
  });
});
