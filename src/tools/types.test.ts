/**
 * Tool Types Tests
 *
 * Tests for ToolError class and type shapes.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ToolError } from './types.js';
import type { ToolErrorCode, ToolResult, ToolPermissions, ToolContext } from './types.js';

describe('ToolError', () => {
  describe('constructor', () => {
    it('should set message correctly', () => {
      const error = new ToolError('Bad input', 'INVALID_INPUT', 'readFile');

      assert.strictEqual(error.message, 'Bad input');
    });

    it('should set code correctly', () => {
      const error = new ToolError('Denied', 'PERMISSION_DENIED', 'editFile');

      assert.strictEqual(error.code, 'PERMISSION_DENIED');
    });

    it('should set toolName correctly', () => {
      const error = new ToolError('Failed', 'EXECUTION_FAILED', 'terminal');

      assert.strictEqual(error.toolName, 'terminal');
    });

    it('should set cause from options', () => {
      const original = new Error('Root cause');
      const error = new ToolError('Wrapped', 'EXECUTION_FAILED', 'search', {
        cause: original,
      });

      assert.strictEqual(error.cause, original);
    });

    it('should leave cause undefined when not provided', () => {
      const error = new ToolError('Test', 'NOT_FOUND', 'readFile');

      assert.strictEqual(error.cause, undefined);
    });

    it('should set all fields together', () => {
      const cause = new Error('Underlying issue');
      const error = new ToolError('Complete error', 'TIMEOUT', 'terminal', {
        cause,
      });

      assert.strictEqual(error.message, 'Complete error');
      assert.strictEqual(error.code, 'TIMEOUT');
      assert.strictEqual(error.toolName, 'terminal');
      assert.strictEqual(error.cause, cause);
    });
  });

  describe('name property', () => {
    it('should be "ToolError"', () => {
      const error = new ToolError('Test', 'INVALID_INPUT', 'test');

      assert.strictEqual(error.name, 'ToolError');
    });
  });

  describe('inheritance', () => {
    it('should be an instance of Error', () => {
      const error = new ToolError('Test', 'INVALID_INPUT', 'test');

      assert.ok(error instanceof Error);
    });

    it('should be an instance of ToolError', () => {
      const error = new ToolError('Test', 'INVALID_INPUT', 'test');

      assert.ok(error instanceof ToolError);
    });

    it('should have a stack trace', () => {
      const error = new ToolError('Test', 'INVALID_INPUT', 'test');

      assert.ok(typeof error.stack === 'string');
      assert.ok(error.stack.length > 0);
    });
  });

  describe('error codes', () => {
    const allCodes: ToolErrorCode[] = [
      'INVALID_INPUT',
      'PERMISSION_DENIED',
      'EXECUTION_FAILED',
      'NOT_FOUND',
      'TIMEOUT',
    ];

    for (const code of allCodes) {
      it(`should accept error code "${code}"`, () => {
        const error = new ToolError('Test', code, 'test-tool');

        assert.strictEqual(error.code, code);
      });
    }
  });

  describe('readonly properties', () => {
    it('should have readonly code', () => {
      const error = new ToolError('Test', 'INVALID_INPUT', 'test');

      assert.strictEqual(error.code, 'INVALID_INPUT');
    });

    it('should have readonly toolName', () => {
      const error = new ToolError('Test', 'INVALID_INPUT', 'readFile');

      assert.strictEqual(error.toolName, 'readFile');
    });
  });
});

describe('ToolResult shape', () => {
  it('should accept a successful result', () => {
    const result: ToolResult = {
      success: true,
      output: 'File contents here',
    };

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.output, 'File contents here');
    assert.strictEqual(result.error, undefined);
    assert.strictEqual(result.metadata, undefined);
  });

  it('should accept a failed result with error', () => {
    const result: ToolResult = {
      success: false,
      output: '',
      error: 'File not found',
    };

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error, 'File not found');
  });

  it('should accept a result with metadata', () => {
    const result: ToolResult = {
      success: true,
      output: 'Done',
      metadata: { bytesRead: 1024, encoding: 'utf-8' },
    };

    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.metadata, { bytesRead: 1024, encoding: 'utf-8' });
  });
});

describe('ToolPermissions shape', () => {
  it('should accept fully permissive permissions', () => {
    const perms: ToolPermissions = {
      allowFileRead: true,
      allowFileWrite: true,
      allowTerminal: true,
      allowNetwork: true,
    };

    assert.strictEqual(perms.allowFileRead, true);
    assert.strictEqual(perms.allowFileWrite, true);
    assert.strictEqual(perms.allowTerminal, true);
    assert.strictEqual(perms.allowNetwork, true);
  });

  it('should accept fully restrictive permissions', () => {
    const perms: ToolPermissions = {
      allowFileRead: false,
      allowFileWrite: false,
      allowTerminal: false,
      allowNetwork: false,
    };

    assert.strictEqual(perms.allowFileRead, false);
    assert.strictEqual(perms.allowFileWrite, false);
    assert.strictEqual(perms.allowTerminal, false);
    assert.strictEqual(perms.allowNetwork, false);
  });
});

describe('ToolContext shape', () => {
  it('should accept a context with required fields', () => {
    const ctx: ToolContext = {
      workingDir: '/home/user/project',
      permissions: {
        allowFileRead: true,
        allowFileWrite: false,
        allowTerminal: false,
        allowNetwork: false,
      },
    };

    assert.strictEqual(ctx.workingDir, '/home/user/project');
    assert.strictEqual(ctx.permissions.allowFileRead, true);
    assert.strictEqual(ctx.signal, undefined);
  });

  it('should accept a context with an AbortSignal', () => {
    const controller = new AbortController();
    const ctx: ToolContext = {
      workingDir: '/tmp',
      permissions: {
        allowFileRead: true,
        allowFileWrite: true,
        allowTerminal: true,
        allowNetwork: true,
      },
      signal: controller.signal,
    };

    assert.ok(ctx.signal instanceof AbortSignal);
  });
});
