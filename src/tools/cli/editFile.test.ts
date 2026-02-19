/**
 * EditFile Tool Tests
 *
 * Tests for the editFile tool implementation.
 * Uses node:test and node:assert with real file I/O via tmpdir.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { editFileTool } from './editFile.js';
import type { ToolContext } from '../types.js';
import { ToolError } from '../types.js';

/** Create a ToolContext with sensible defaults */
function createContext(overrides?: Partial<ToolContext>): ToolContext {
  return {
    workingDir: overrides?.workingDir ?? '/tmp',
    permissions: overrides?.permissions ?? {
      allowFileRead: true,
      allowFileWrite: true,
      allowTerminal: false,
      allowNetwork: false,
    },
    signal: overrides?.signal,
  };
}

describe('editFile tool', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'beth-editfile-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('metadata', () => {
    it('should have name "editFile"', () => {
      assert.strictEqual(editFileTool.name, 'editFile');
    });

    it('should have a description', () => {
      assert.ok(editFileTool.description.length > 0);
    });

    it('should have an inputSchema with required fields', () => {
      assert.strictEqual(editFileTool.inputSchema.type, 'object');
      const required = editFileTool.inputSchema.required as string[];
      assert.ok(required.includes('filePath'));
      assert.ok(required.includes('oldString'));
      assert.ok(required.includes('newString'));
    });
  });

  describe('successful edits', () => {
    it('should replace a string successfully', async () => {
      const filePath = join(tempDir, 'test.txt');
      writeFileSync(filePath, 'hello world');

      const result = await editFileTool.execute(
        { filePath, oldString: 'hello', newString: 'goodbye' },
        createContext()
      );

      assert.strictEqual(result.success, true);
      assert.strictEqual(readFileSync(filePath, 'utf-8'), 'goodbye world');
    });

    it('should handle multi-line replacements', async () => {
      const filePath = join(tempDir, 'multi.txt');
      writeFileSync(filePath, 'line 1\nline 2\nline 3');

      const result = await editFileTool.execute(
        { filePath, oldString: 'line 2', newString: 'replaced line' },
        createContext()
      );

      assert.strictEqual(result.success, true);
      assert.strictEqual(readFileSync(filePath, 'utf-8'), 'line 1\nreplaced line\nline 3');
    });

    it('should handle empty newString (deletion)', async () => {
      const filePath = join(tempDir, 'delete.txt');
      writeFileSync(filePath, 'keep this remove this keep that');

      const result = await editFileTool.execute(
        { filePath, oldString: 'remove this ', newString: '' },
        createContext()
      );

      assert.strictEqual(result.success, true);
      assert.strictEqual(readFileSync(filePath, 'utf-8'), 'keep this keep that');
    });

    it('should return filePath and replacement count in metadata', async () => {
      const filePath = join(tempDir, 'meta.txt');
      writeFileSync(filePath, 'content');

      const result = await editFileTool.execute(
        { filePath, oldString: 'content', newString: 'new content' },
        createContext()
      );

      assert.strictEqual(result.metadata?.filePath, filePath);
      assert.strictEqual(result.metadata?.replacements, 1);
    });

    it('should preserve file encoding (UTF-8 with special chars)', async () => {
      const filePath = join(tempDir, 'unicode.txt');
      const content = 'Hello 世界 🌍 café naïve';
      writeFileSync(filePath, content, 'utf-8');

      const result = await editFileTool.execute(
        { filePath, oldString: '世界', newString: 'World' },
        createContext()
      );

      assert.strictEqual(result.success, true);
      assert.strictEqual(readFileSync(filePath, 'utf-8'), 'Hello World 🌍 café naïve');
    });
  });

  describe('match validation', () => {
    it('should reject when oldString not found', async () => {
      const filePath = join(tempDir, 'notfound.txt');
      writeFileSync(filePath, 'hello world');

      await assert.rejects(
        () => editFileTool.execute(
          { filePath, oldString: 'goodbye', newString: 'hi' },
          createContext()
        ),
        (err: unknown) => {
          assert.ok(err instanceof ToolError);
          assert.strictEqual(err.code, 'EXECUTION_FAILED');
          assert.ok(err.message.includes('not found'));
          return true;
        }
      );

      // File should be unchanged
      assert.strictEqual(readFileSync(filePath, 'utf-8'), 'hello world');
    });

    it('should reject when oldString matches multiple times', async () => {
      const filePath = join(tempDir, 'ambiguous.txt');
      writeFileSync(filePath, 'foo bar foo baz foo');

      await assert.rejects(
        () => editFileTool.execute(
          { filePath, oldString: 'foo', newString: 'qux' },
          createContext()
        ),
        (err: unknown) => {
          assert.ok(err instanceof ToolError);
          assert.strictEqual(err.code, 'EXECUTION_FAILED');
          assert.ok(err.message.includes('ambiguous'));
          return true;
        }
      );

      // File should be unchanged
      assert.strictEqual(readFileSync(filePath, 'utf-8'), 'foo bar foo baz foo');
    });

    it('should reject empty oldString', async () => {
      const filePath = join(tempDir, 'empty.txt');
      writeFileSync(filePath, 'content');

      await assert.rejects(
        () => editFileTool.execute(
          { filePath, oldString: '', newString: 'x' },
          createContext()
        ),
        (err: unknown) => {
          assert.ok(err instanceof ToolError);
          assert.strictEqual(err.code, 'INVALID_INPUT');
          return true;
        }
      );
    });
  });

  describe('path validation', () => {
    it('should reject path traversal attempts', async () => {
      await assert.rejects(
        () => editFileTool.execute(
          { filePath: '/tmp/../../../etc/passwd', oldString: 'a', newString: 'b' },
          createContext()
        ),
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
        () => editFileTool.execute(
          { filePath: '/tmp/file; rm -rf /', oldString: 'a', newString: 'b' },
          createContext()
        ),
        (err: unknown) => {
          assert.ok(err instanceof ToolError);
          assert.strictEqual(err.code, 'INVALID_INPUT');
          return true;
        }
      );
    });

    it('should reject relative paths', async () => {
      await assert.rejects(
        () => editFileTool.execute(
          { filePath: 'relative/path.txt', oldString: 'a', newString: 'b' },
          createContext()
        ),
        (err: unknown) => {
          assert.ok(err instanceof ToolError);
          assert.strictEqual(err.code, 'INVALID_INPUT');
          assert.ok(err.message.includes('absolute'));
          return true;
        }
      );
    });
  });

  describe('error handling', () => {
    it('should return NOT_FOUND for missing files', async () => {
      await assert.rejects(
        () => editFileTool.execute(
          { filePath: join(tempDir, 'nonexistent.txt'), oldString: 'a', newString: 'b' },
          createContext()
        ),
        (err: unknown) => {
          assert.ok(err instanceof ToolError);
          assert.strictEqual(err.code, 'NOT_FOUND');
          return true;
        }
      );
    });

    it('should return PERMISSION_DENIED when allowFileWrite is false', async () => {
      const filePath = join(tempDir, 'readonly.txt');
      writeFileSync(filePath, 'content');

      const ctx = createContext({
        permissions: {
          allowFileRead: true,
          allowFileWrite: false,
          allowTerminal: false,
          allowNetwork: false,
        },
      });

      await assert.rejects(
        () => editFileTool.execute(
          { filePath, oldString: 'content', newString: 'new' },
          ctx
        ),
        (err: unknown) => {
          assert.ok(err instanceof ToolError);
          assert.strictEqual(err.code, 'PERMISSION_DENIED');
          return true;
        }
      );

      // File should be unchanged
      assert.strictEqual(readFileSync(filePath, 'utf-8'), 'content');
    });
  });
});
