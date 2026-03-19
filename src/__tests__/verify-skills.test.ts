/**
 * Unit tests for .github/hooks/scripts/verify-skills.mjs
 *
 * Tests the SubagentStop compliance hook that challenges agents on first stop
 * to verify BOTH skill compliance AND task tracking, then lets them through
 * on retry (stop_hook_active=true).
 */

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import type { VerifyHookOutput } from './hook-test-types.js';

const SCRIPT_PATH = join(process.cwd(), '.github/hooks/scripts/verify-skills.mjs');

/** Helper: pipe JSON input to verify-skills.mjs and parse JSON output */
function runHook(input: Record<string, unknown>): VerifyHookOutput {
  const result = execFileSync('node', [SCRIPT_PATH], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    timeout: 10000,
  });
  return JSON.parse(result);
}

// ─── Core behavior ─────────────────────────────────────────────────────────

describe('verify-skills.mjs: first stop attempt (challenge)', () => {
  it('should block the first stop and request compliance verification', () => {
    const output = runHook({});
    expect(output.hookSpecificOutput).toBeDefined();
    expect(output.hookSpecificOutput!.decision).toBe('block');
    expect(output.hookSpecificOutput!.hookEventName).toBe('Stop');
  });

  it('should include a reason mentioning MANDATORY skills', () => {
    const output = runHook({});
    expect(output.hookSpecificOutput!.reason).toContain('MANDATORY');
  });

  it('should include a reason mentioning task tracking', () => {
    const output = runHook({});
    expect(output.hookSpecificOutput!.reason).toContain('backlog task edit');
    expect(output.hookSpecificOutput!.reason).toContain('task status');
  });

  it('should NOT set continue: true on first attempt', () => {
    const output = runHook({});
    expect(output.continue).toBeUndefined();
  });
});

describe('verify-skills.mjs: retry with stop_hook_active (pass-through)', () => {
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

describe('verify-skills.mjs: edge cases', () => {
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
    const output = runHook({ stop_hook_active: false });
    expect(output.hookSpecificOutput?.decision).toBe('block');
  });
});
