/**
 * Unit tests for .github/hooks/scripts/verify-tasks.mjs
 *
 * Tests the SubagentStop hook that challenges agents to confirm task
 * tracking updates on first stop, and lets them through on retry
 * (stop_hook_active=true).
 */

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const SCRIPT_PATH = join(process.cwd(), '.github/hooks/scripts/verify-tasks.mjs');

/** Helper: pipe JSON input to verify-tasks.mjs and parse JSON output */
function runHook(input: Record<string, unknown>): Record<string, unknown> {
  const result = execFileSync('node', [SCRIPT_PATH], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    timeout: 10000,
  });
  return JSON.parse(result);
}

// ─── Core behavior ─────────────────────────────────────────────────────────

describe('verify-tasks.mjs: first stop attempt (challenge)', () => {
  it('should block the first stop and request task tracking confirmation', () => {
    const output = runHook({}) as any;
    expect(output.hookSpecificOutput).toBeDefined();
    expect(output.hookSpecificOutput.decision).toBe('block');
    expect(output.hookSpecificOutput.hookEventName).toBe('Stop');
  });

  it('should include a reason mentioning backlog task edit', () => {
    const output = runHook({}) as any;
    expect(output.hookSpecificOutput.reason).toContain('backlog task edit');
  });

  it('should include a reason mentioning task status', () => {
    const output = runHook({}) as any;
    expect(output.hookSpecificOutput.reason).toContain('task status');
  });

  it('should NOT set continue: true on first attempt', () => {
    const output = runHook({});
    expect(output.continue).toBeUndefined();
  });
});

describe('verify-tasks.mjs: retry with stop_hook_active (pass-through)', () => {
  it('should pass through when stop_hook_active is true', () => {
    const output = runHook({ stop_hook_active: true });
    expect(output.continue).toBe(true);
  });

  it('should NOT include hookSpecificOutput on retry', () => {
    const output = runHook({ stop_hook_active: true });
    expect(output).not.toHaveProperty('hookSpecificOutput');
  });
});

// ─── Edge cases ────────────────────────────────────────────────────────────

describe('verify-tasks.mjs: edge cases', () => {
  it('should handle malformed JSON input gracefully', () => {
    const result = execFileSync('node', [SCRIPT_PATH], {
      input: 'this is not json',
      encoding: 'utf8',
      timeout: 10000,
    });
    const output = JSON.parse(result);
    expect(output.continue).toBe(true);
  });

  it('should handle empty input gracefully', () => {
    const result = execFileSync('node', [SCRIPT_PATH], {
      input: '',
      encoding: 'utf8',
      timeout: 10000,
    });
    const output = JSON.parse(result);
    expect(output.continue).toBe(true);
  });

  it('should treat stop_hook_active=false as first attempt (block)', () => {
    const output = runHook({ stop_hook_active: false }) as any;
    expect(output.hookSpecificOutput?.decision).toBe('block');
  });
});
