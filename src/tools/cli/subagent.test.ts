/**
 * Subagent Tool Tests
 *
 * Tests for the subagent tool (Phase 3 stub).
 * Uses node:test and node:assert.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { subagentTool, isSubagentRequest } from './subagent.js';
import type { ToolContext } from '../types.js';
import { ToolError } from '../types.js';

/** Create a ToolContext with sensible defaults */
function createContext(overrides?: Partial<ToolContext>): ToolContext {
  return {
    workingDir: '/tmp/test',
    permissions: overrides?.permissions ?? {
      allowFileRead: false,
      allowFileWrite: false,
      allowTerminal: false,
      allowNetwork: true,
    },
    signal: overrides?.signal,
  };
}

describe('subagent tool', () => {
  describe('metadata', () => {
    it('should have name "subagent"', () => {
      assert.strictEqual(subagentTool.name, 'subagent');
    });

    it('should have a description', () => {
      assert.ok(subagentTool.description.length > 0);
    });

    it('should have an inputSchema with agentName and prompt required', () => {
      assert.strictEqual(subagentTool.inputSchema.type, 'object');
      assert.ok(Array.isArray(subagentTool.inputSchema.required));
      const required = subagentTool.inputSchema.required as string[];
      assert.ok(required.includes('agentName'));
      assert.ok(required.includes('prompt'));
    });
  });

  describe('successful invocation', () => {
    it('should return pending result with correct metadata', async () => {
      const result = await subagentTool.execute(
        { agentName: 'developer', prompt: 'Implement login page', description: 'Login UI' },
        createContext(),
      );

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.metadata?.agentName, 'developer');
      assert.strictEqual(result.metadata?.prompt, 'Implement login page');
      assert.strictEqual(result.metadata?.description, 'Login UI');
      assert.strictEqual(result.metadata?.status, 'pending');
    });

    it('should handle missing description', async () => {
      const result = await subagentTool.execute(
        { agentName: 'tester', prompt: 'Write tests for auth' },
        createContext(),
      );

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.metadata?.agentName, 'tester');
      assert.strictEqual(result.metadata?.description, undefined);
      assert.strictEqual(result.metadata?.status, 'pending');
    });

    it('should trim agentName and prompt', async () => {
      const result = await subagentTool.execute(
        { agentName: '  developer  ', prompt: '  Build it  ' },
        createContext(),
      );

      assert.strictEqual(result.metadata?.agentName, 'developer');
      assert.strictEqual(result.metadata?.prompt, 'Build it');
    });

    it('should include agentName in output message', async () => {
      const result = await subagentTool.execute(
        { agentName: 'developer', prompt: 'Do stuff' },
        createContext(),
      );

      assert.ok(result.output.includes('developer'));
    });
  });

  describe('input validation', () => {
    it('should reject empty agentName', async () => {
      await assert.rejects(
        () => subagentTool.execute(
          { agentName: '', prompt: 'Do stuff' },
          createContext(),
        ),
        (err: unknown) => {
          assert.ok(err instanceof ToolError);
          assert.strictEqual(err.code, 'INVALID_INPUT');
          assert.ok(err.message.includes('agentName'));
          return true;
        },
      );
    });

    it('should reject whitespace-only agentName', async () => {
      await assert.rejects(
        () => subagentTool.execute(
          { agentName: '   ', prompt: 'Do stuff' },
          createContext(),
        ),
        (err: unknown) => {
          assert.ok(err instanceof ToolError);
          assert.strictEqual(err.code, 'INVALID_INPUT');
          return true;
        },
      );
    });

    it('should reject non-string agentName', async () => {
      await assert.rejects(
        () => subagentTool.execute(
          { agentName: 42, prompt: 'Do stuff' },
          createContext(),
        ),
        (err: unknown) => {
          assert.ok(err instanceof ToolError);
          assert.strictEqual(err.code, 'INVALID_INPUT');
          return true;
        },
      );
    });

    it('should reject empty prompt', async () => {
      await assert.rejects(
        () => subagentTool.execute(
          { agentName: 'developer', prompt: '' },
          createContext(),
        ),
        (err: unknown) => {
          assert.ok(err instanceof ToolError);
          assert.strictEqual(err.code, 'INVALID_INPUT');
          assert.ok(err.message.includes('prompt'));
          return true;
        },
      );
    });

    it('should reject non-string prompt', async () => {
      await assert.rejects(
        () => subagentTool.execute(
          { agentName: 'developer', prompt: 123 },
          createContext(),
        ),
        (err: unknown) => {
          assert.ok(err instanceof ToolError);
          assert.strictEqual(err.code, 'INVALID_INPUT');
          return true;
        },
      );
    });
  });

  describe('permissions', () => {
    it('should throw PERMISSION_DENIED when allowNetwork is false', async () => {
      const ctx = createContext({
        permissions: {
          allowFileRead: false,
          allowFileWrite: false,
          allowTerminal: false,
          allowNetwork: false,
        },
      });

      await assert.rejects(
        () => subagentTool.execute(
          { agentName: 'developer', prompt: 'Do stuff' },
          ctx,
        ),
        (err: unknown) => {
          assert.ok(err instanceof ToolError);
          assert.strictEqual(err.code, 'PERMISSION_DENIED');
          return true;
        },
      );
    });
  });
});

describe('isSubagentRequest', () => {
  it('should return true for valid pending subagent result', () => {
    const result = {
      success: true,
      output: 'queued',
      metadata: {
        agentName: 'developer',
        prompt: 'Build it',
        status: 'pending',
      },
    };
    assert.strictEqual(isSubagentRequest(result), true);
  });

  it('should return false when success is false', () => {
    const result = {
      success: false,
      output: 'failed',
      metadata: {
        agentName: 'developer',
        prompt: 'Build it',
        status: 'pending',
      },
    };
    assert.strictEqual(isSubagentRequest(result), false);
  });

  it('should return false when metadata is missing', () => {
    const result = {
      success: true,
      output: 'ok',
    };
    assert.strictEqual(isSubagentRequest(result), false);
  });

  it('should return false when status is not pending', () => {
    const result = {
      success: true,
      output: 'ok',
      metadata: {
        agentName: 'developer',
        prompt: 'Build it',
        status: 'completed',
      },
    };
    assert.strictEqual(isSubagentRequest(result), false);
  });

  it('should return false when agentName is missing', () => {
    const result = {
      success: true,
      output: 'ok',
      metadata: {
        prompt: 'Build it',
        status: 'pending',
      },
    };
    assert.strictEqual(isSubagentRequest(result), false);
  });

  it('should return false when prompt is missing', () => {
    const result = {
      success: true,
      output: 'ok',
      metadata: {
        agentName: 'developer',
        status: 'pending',
      },
    };
    assert.strictEqual(isSubagentRequest(result), false);
  });
});
