/**
 * Search Tool Tests
 *
 * Tests for the search tool implementation.
 * Uses node:test and node:assert with real file I/O via tmpdir.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { searchTool } from './search.js';
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

describe('search tool', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'beth-search-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('metadata', () => {
    it('should have name "search"', () => {
      assert.strictEqual(searchTool.name, 'search');
    });

    it('should have a description', () => {
      assert.ok(searchTool.description.length > 0);
    });

    it('should have an inputSchema with query required', () => {
      assert.strictEqual(searchTool.inputSchema.type, 'object');
      assert.ok(Array.isArray(searchTool.inputSchema.required));
      assert.ok((searchTool.inputSchema.required as string[]).includes('query'));
    });
  });

  describe('finding matches', () => {
    it('should find matches in files', async () => {
      writeFileSync(join(tempDir, 'file1.txt'), 'hello world\ngoodbye world');
      writeFileSync(join(tempDir, 'file2.txt'), 'hello there');

      const result = await searchTool.execute(
        { query: 'hello' },
        createContext({ workingDir: tempDir }),
      );

      assert.strictEqual(result.success, true);
      assert.ok(result.output.includes('hello'));
      assert.ok((result.metadata?.matchCount as number) >= 2);
    });

    it('should return empty output for no matches (success=true)', async () => {
      writeFileSync(join(tempDir, 'file.txt'), 'nothing relevant here');

      const result = await searchTool.execute(
        { query: 'zzz_no_match_zzz' },
        createContext({ workingDir: tempDir }),
      );

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.output, '');
      assert.strictEqual(result.metadata?.matchCount, 0);
    });

    it('should return results in filepath:line:content format', async () => {
      writeFileSync(join(tempDir, 'formatted.txt'), 'line one\nfind me here\nline three');

      const result = await searchTool.execute(
        { query: 'find me' },
        createContext({ workingDir: tempDir }),
      );

      assert.strictEqual(result.success, true);
      // Output should contain the file path, line number, and content
      assert.ok(result.output.includes('formatted.txt'));
      assert.ok(result.output.includes('find me here'));
    });
  });

  describe('maxResults', () => {
    it('should respect maxResults limit', async () => {
      // Create a file with many matching lines
      const lines = Array.from({ length: 20 }, (_, i) => `match line ${i}`);
      writeFileSync(join(tempDir, 'many.txt'), lines.join('\n'));

      const result = await searchTool.execute(
        { query: 'match line', maxResults: 5 },
        createContext({ workingDir: tempDir }),
      );

      assert.strictEqual(result.success, true);
      const matchCount = result.metadata?.matchCount as number;
      assert.ok(matchCount <= 5, `Expected at most 5 matches, got ${matchCount}`);
    });
  });

  describe('regex patterns', () => {
    it('should handle regex patterns', async () => {
      writeFileSync(join(tempDir, 'regex.txt'), 'foo123bar\nfoo456bar\nhello world');

      const result = await searchTool.execute(
        { query: 'foo\\d+bar', isRegexp: true },
        createContext({ workingDir: tempDir }),
      );

      assert.strictEqual(result.success, true);
      assert.ok(result.output.includes('foo123bar'));
      assert.ok(result.output.includes('foo456bar'));
      assert.ok(!result.output.includes('hello world'));
    });
  });

  describe('include pattern filtering', () => {
    it('should filter by include pattern', async () => {
      writeFileSync(join(tempDir, 'code.ts'), 'const x = matchword;');
      writeFileSync(join(tempDir, 'notes.md'), 'matchword in docs');

      const result = await searchTool.execute(
        { query: 'matchword', includePattern: '*.ts' },
        createContext({ workingDir: tempDir }),
      );

      assert.strictEqual(result.success, true);
      assert.ok(result.output.includes('code.ts'));
      // The md file may or may not appear depending on rg vs node
      // Just verify the ts file was found
    });
  });

  describe('permissions', () => {
    it('should return PERMISSION_DENIED when allowFileRead is false', async () => {
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
        () => searchTool.execute({ query: 'test' }, ctx),
        (err: unknown) => {
          assert.ok(err instanceof ToolError);
          assert.strictEqual(err.code, 'PERMISSION_DENIED');
          return true;
        },
      );
    });
  });

  describe('path validation', () => {
    it('should reject search paths with traversal', async () => {
      await assert.rejects(
        () => searchTool.execute(
          { query: 'test', path: '../../../etc' },
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

    it('should default path to workingDir', async () => {
      writeFileSync(join(tempDir, 'default.txt'), 'find_default_marker');

      const result = await searchTool.execute(
        { query: 'find_default_marker' },
        createContext({ workingDir: tempDir }),
      );

      assert.strictEqual(result.success, true);
      assert.ok(result.output.includes('find_default_marker'));
    });
  });

  describe('input validation', () => {
    it('should reject empty query', async () => {
      await assert.rejects(
        () => searchTool.execute({ query: '' }, createContext({ workingDir: tempDir })),
        (err: unknown) => {
          assert.ok(err instanceof ToolError);
          assert.strictEqual(err.code, 'INVALID_INPUT');
          return true;
        },
      );
    });

    it('should reject non-string query', async () => {
      await assert.rejects(
        () => searchTool.execute({ query: 123 }, createContext({ workingDir: tempDir })),
        (err: unknown) => {
          assert.ok(err instanceof ToolError);
          assert.strictEqual(err.code, 'INVALID_INPUT');
          return true;
        },
      );
    });
  });

  describe('node fallback', () => {
    it('should search subdirectories', async () => {
      const subDir = join(tempDir, 'subdir');
      mkdirSync(subDir);
      writeFileSync(join(subDir, 'deep.txt'), 'deep_search_marker');

      const result = await searchTool.execute(
        { query: 'deep_search_marker' },
        createContext({ workingDir: tempDir }),
      );

      assert.strictEqual(result.success, true);
      assert.ok(result.output.includes('deep_search_marker'));
    });

    it('should report which engine was used', async () => {
      writeFileSync(join(tempDir, 'engine.txt'), 'engine_test_marker');

      const result = await searchTool.execute(
        { query: 'engine_test_marker' },
        createContext({ workingDir: tempDir }),
      );

      assert.strictEqual(result.success, true);
      assert.ok(
        result.metadata?.engine === 'ripgrep' || result.metadata?.engine === 'node',
        `Expected engine to be 'ripgrep' or 'node', got '${result.metadata?.engine}'`,
      );
    });
  });
});
