/**
 * E2E tests for close command (DEPRECATED).
 *
 * The close command was deprecated when beads was removed.
 * It now prints a deprecation message and exits 1 for all inputs.
 *
 * Repro steps:
 *   1. Run: npx vitest run src/cli/commands/close.e2e.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'child_process';
import { resolve, join } from 'path';

const CLI_PATH = resolve(join(import.meta.dirname, '..', '..', '..', 'bin', 'cli.js'));

/**
 * Run the close command via the CLI binary.
 */
function runClose(args: string): { stdout: string; stderr: string; code: number } {
  try {
    const stdout = execSync(`node "${CLI_PATH}" close ${args}`, {
      encoding: 'utf-8',
      env: { ...process.env, NO_COLOR: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 15000,
    });
    return { stdout, stderr: '', code: 0 };
  } catch (error: unknown) {
    const e = error as { stdout?: string; stderr?: string; status?: number };
    return { stdout: e.stdout || '', stderr: e.stderr || '', code: e.status || 1 };
  }
}

describe('close command E2E (deprecated)', () => {
  describe('deprecation behavior', () => {
    it('should exit 1 with deprecation message when no ID given', () => {
      const result = runClose('');
      assert.strictEqual(result.code, 1, 'Deprecated close should exit 1');
      assert.ok(
        result.stdout.includes('deprecated') || result.stdout.includes('Backlog.md'),
        'Should show deprecation message'
      );
    });

    it('should exit 1 with deprecation message when ID given', () => {
      const result = runClose('beth-abc123');
      assert.strictEqual(result.code, 1, 'Deprecated close should exit 1 with ID');
      assert.ok(
        result.stdout.includes('deprecated') || result.stdout.includes('Backlog.md'),
        'Should show deprecation message'
      );
    });

    it('should mention Backlog.md as replacement', () => {
      const result = runClose('');
      assert.ok(
        result.stdout.includes('Backlog.md'),
        'Should mention Backlog.md as the replacement'
      );
    });

    it('should accept --reason flag without error', () => {
      const result = runClose('beth-zzz999 --reason "Testing close"');
      assert.strictEqual(result.code, 1, 'Should accept --reason');
      assert.ok(
        !result.stderr.includes('Unknown flag'),
        'Should not reject --reason as unknown flag'
      );
    });

    it('should accept -r shorthand for --reason', () => {
      const result = runClose('beth-zzz999 -r "Short reason"');
      assert.strictEqual(result.code, 1, 'Should accept -r');
      assert.ok(
        !result.stderr.includes('Unknown flag'),
        '-r should be accepted as reason shorthand'
      );
    });

    it('should accept --force flag without error', () => {
      const result = runClose('beth-zzz999 --force');
      assert.strictEqual(result.code, 1, 'Should accept --force');
      assert.ok(
        !result.stderr.includes('Unknown flag'),
        '--force should be accepted'
      );
    });

    it('should accept -f shorthand for --force', () => {
      const result = runClose('beth-zzz999 -f');
      assert.strictEqual(result.code, 1, 'Should accept -f');
      assert.ok(
        !result.stderr.includes('Unknown flag'),
        '-f should be accepted as force shorthand'
      );
    });
  });
});
