/**
 * ReadFile Tool Tests
 *
 * Tests for the readFile tool implementation.
 * Uses node:test and node:assert with real file I/O via tmpdir.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readFileTool } from './readFile.js';
import type { ToolContext } from '../types.js';
import { ToolError } from '../types.js';

/** Create a ToolContext with sensible defaults */
function createContext(overrides?: Partial<ToolContext>): ToolContext {
  return {
    workingDir: overrides?.workingDir ?? '/tmp',
    permissions: overrides?.permissions ?? {
      allowFileRead: true,
      allowFileWrite: false,
      allowTerminal: false,
      allowNetwork: false,
    },
    signal: overrides?.signal,
  };
}

describe('readFile tool', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'beth-readfile-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('metadata', () => {
    it('should have name "readFile"', () => {
      assert.strictEqual(readFileTool.name, 'readFile');
    });

    it('should have a description', () => {
      assert.ok(readFileTool.description.length > 0);
    });

    it('should have an inputSchema with filePath required', () => {
      assert.strictEqual(readFileTool.inputSchema.type, 'object');
      assert.ok(Array.isArray(readFileTool.inputSchema.required));
      assert.ok((readFileTool.inputSchema.required as string[]).includes('filePath'));
    });
  });

  describe('successful reads', () => {
    it('should read a file successfully', async () => {
      const filePath = join(tempDir, 'test.txt');
      writeFileSync(filePath, 'hello world');

      const result = await readFileTool.execute({ filePath }, createContext());

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.output, 'hello world');
    });

    it('should read a multi-line file', async () => {
      const filePath = join(tempDir, 'multi.txt');
      const content = 'line 1\nline 2\nline 3\nline 4\nline 5';
      writeFileSync(filePath, content);

      const result = await readFileTool.execute({ filePath }, createContext());

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.output, content);
      assert.strictEqual(result.metadata?.totalLines, 5);
    });

    it('should handle empty files', async () => {
      const filePath = join(tempDir, 'empty.txt');
      writeFileSync(filePath, '');

      const result = await readFileTool.execute({ filePath }, createContext());

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.output, '');
    });

    it('should return filePath in metadata', async () => {
      const filePath = join(tempDir, 'meta.txt');
      writeFileSync(filePath, 'content');

      const result = await readFileTool.execute({ filePath }, createContext());

      assert.strictEqual(result.metadata?.filePath, filePath);
    });
  });

  describe('offset and limit', () => {
    it('should read from offset (1-based)', async () => {
      const filePath = join(tempDir, 'offset.txt');
      writeFileSync(filePath, 'line 1\nline 2\nline 3\nline 4\nline 5');

      const result = await readFileTool.execute({ filePath, offset: 3 }, createContext());

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.output, 'line 3\nline 4\nline 5');
    });

    it('should read with limit', async () => {
      const filePath = join(tempDir, 'limit.txt');
      writeFileSync(filePath, 'line 1\nline 2\nline 3\nline 4\nline 5');

      const result = await readFileTool.execute({ filePath, limit: 2 }, createContext());

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.output, 'line 1\nline 2');
    });

    it('should read with both offset and limit', async () => {
      const filePath = join(tempDir, 'range.txt');
      writeFileSync(filePath, 'line 1\nline 2\nline 3\nline 4\nline 5');

      const result = await readFileTool.execute({ filePath, offset: 2, limit: 2 }, createContext());

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.output, 'line 2\nline 3');
    });

    it('should handle offset beyond file length', async () => {
      const filePath = join(tempDir, 'short.txt');
      writeFileSync(filePath, 'line 1\nline 2');

      const result = await readFileTool.execute({ filePath, offset: 100 }, createContext());

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.output, '');
    });

    it('should include offset and limit in metadata', async () => {
      const filePath = join(tempDir, 'meta2.txt');
      writeFileSync(filePath, 'line 1\nline 2\nline 3');

      const result = await readFileTool.execute({ filePath, offset: 2, limit: 1 }, createContext());

      assert.strictEqual(result.metadata?.offset, 2);
      assert.strictEqual(result.metadata?.limit, 1);
    });
  });

  describe('path validation', () => {
    it('should reject path traversal attempts', async () => {
      await assert.rejects(
        () => readFileTool.execute({ filePath: '/tmp/../../../etc/passwd' }, createContext()),
        (err: unknown) => {
          assert.ok(err instanceof ToolError);
          assert.strictEqual(err.code, 'INVALID_INPUT');
          assert.ok(err.message.includes('traversal'));
          return true;
        }
      );
    });

    it('should reject shell injection in paths', async () => {
      await assert.rejects(
        () => readFileTool.execute({ filePath: '/tmp/file; rm -rf /' }, createContext()),
        (err: unknown) => {
          assert.ok(err instanceof ToolError);
          assert.strictEqual(err.code, 'INVALID_INPUT');
          assert.ok(err.message.includes('dangerous'));
          return true;
        }
      );
    });

    it('should reject relative paths', async () => {
      await assert.rejects(
        () => readFileTool.execute({ filePath: 'relative/path.txt' }, createContext()),
        (err: unknown) => {
          assert.ok(err instanceof ToolError);
          assert.strictEqual(err.code, 'INVALID_INPUT');
          assert.ok(err.message.includes('absolute'));
          return true;
        }
      );
    });

    it('should reject empty filePath', async () => {
      await assert.rejects(
        () => readFileTool.execute({ filePath: '' }, createContext()),
        (err: unknown) => {
          assert.ok(err instanceof ToolError);
          assert.strictEqual(err.code, 'INVALID_INPUT');
          return true;
        }
      );
    });

    it('should reject null byte in path', async () => {
      await assert.rejects(
        () => readFileTool.execute({ filePath: '/tmp/file\0evil' }, createContext()),
        (err: unknown) => {
          assert.ok(err instanceof ToolError);
          assert.strictEqual(err.code, 'INVALID_INPUT');
          assert.ok(err.message.includes('null'));
          return true;
        }
      );
    });
  });

  describe('error handling', () => {
    it('should return NOT_FOUND for missing files', async () => {
      await assert.rejects(
        () => readFileTool.execute({ filePath: join(tempDir, 'nonexistent.txt') }, createContext()),
        (err: unknown) => {
          assert.ok(err instanceof ToolError);
          assert.strictEqual(err.code, 'NOT_FOUND');
          return true;
        }
      );
    });

    it('should return PERMISSION_DENIED when allowFileRead is false', async () => {
      const filePath = join(tempDir, 'test.txt');
      writeFileSync(filePath, 'content');

      const ctx = createContext({
        permissions: {
          allowFileRead: false,
          allowFileWrite: false,
          allowTerminal: false,
          allowNetwork: false,
        },
      });

      await assert.rejects(
        () => readFileTool.execute({ filePath }, ctx),
        (err: unknown) => {
          assert.ok(err instanceof ToolError);
          assert.strictEqual(err.code, 'PERMISSION_DENIED');
          return true;
        }
      );
    });
  });

  describe('binary file handling', () => {
    it('should not crash on binary content', async () => {
      const filePath = join(tempDir, 'binary.bin');
      const buf = Buffer.from([0x00, 0x01, 0x02, 0xFF, 0xFE, 0xFD]);
      writeFileSync(filePath, buf);

      // Should not throw — reads as utf-8 (may produce replacement chars)
      const result = await readFileTool.execute({ filePath }, createContext());
      assert.strictEqual(result.success, true);
    });
  });
});
