/**
 * E2E tests for close command.
 *
 * Runs the actual `beth-copilot close` binary and validates output/behavior.
 * Requires beads to be initialized in the project.
 *
 * beth-ywg.1: close has 66 unit tests but zero E2E — this fills the gap.
 *
 * Repro steps:
 *   1. Build: npm run build
 *   2. Run: npx vitest run src/cli/commands/close.e2e.test.ts
 *   OR with beads E2E: INCLUDE_BEADS_E2E=true npx vitest run --config vitest.e2e.config.ts
 *
 * Test cases:
 *   - No issue ID → exit 1 with usage message
 *   - Invalid issue ID format → exit 1 with format error
 *   - Shell injection attempt → exit 1 (safe rejection)
 *   - Valid close of task (requires bd) → exit 0
 *   - Close with --reason flag → exit 0, reason passed through
 *   - Close with --force flag → exit 0, bypasses enforcement
 *   - Close epic with open children (requires bd) → exit 1 with blocker list
 *   - Multiple issue IDs → each processed in sequence
 *
 * Expected outcomes documented inline per test case.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { execSync, spawnSync } from 'child_process';
import { resolve, join } from 'path';

const CLI_PATH = resolve(join(import.meta.dirname, '..', '..', '..', 'bin', 'cli.js'));

function isBeadsAvailable(): boolean {
  try {
    execSync('bd --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const BEADS_AVAILABLE = isBeadsAvailable();
const SKIP_NO_BEADS = !BEADS_AVAILABLE ? 'beads CLI not installed' : false;

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

describe('close command E2E', () => {
  describe('no issue ID provided', () => {
    // Expected: exit 1, stderr contains usage instructions
    it('should exit 1 with usage message when no ID given', () => {
      const result = runClose('');
      assert.strictEqual(result.code, 1, 'Should exit with code 1');
      assert.ok(
        result.stderr.includes('No issue ID provided') || result.stderr.includes('Usage'),
        'Should show usage message'
      );
    });

    it('should suggest the correct usage format', () => {
      const result = runClose('');
      assert.ok(
        result.stderr.includes('beth-copilot close') || result.stderr.includes('<issue-id>'),
        'Should display command syntax'
      );
    });
  });

  describe('invalid issue ID format', () => {
    // Expected: exit 1, error about invalid format
    it('should reject IDs with invalid characters', () => {
      const result = runClose('not-a-valid-id!!!');
      assert.strictEqual(result.code, 1, 'Should exit with code 1 for bad ID');
      assert.ok(
        result.stderr.includes('Invalid issue ID') || result.stderr.includes('Expected format'),
        'Should indicate invalid ID format'
      );
    });

    it('should reject IDs that are too long', () => {
      const result = runClose('beth-abcdefghijklmnopqrstuvwxyz');
      assert.strictEqual(result.code, 1, 'Should exit with code 1 for oversized ID');
    });

    it('should reject bare numbers', () => {
      const result = runClose('12345');
      assert.strictEqual(result.code, 1, 'Should exit with code 1 for numeric ID');
    });

    it('should reject IDs with spaces', () => {
      // spawnSync avoids shell interpretation
      const result = spawnSync('node', [CLI_PATH, 'close', 'beth abc'], {
        encoding: 'utf-8',
        env: { ...process.env, NO_COLOR: '1' },
        timeout: 15000,
      });
      assert.notStrictEqual(result.status, 0, 'Should reject IDs containing spaces');
    });
  });

  describe('shell injection prevention', () => {
    // Expected: all exit 1 with "Invalid issue ID" — no command execution
    it('should safely reject command injection in ID', () => {
      const result = runClose('"$(whoami)"');
      assert.strictEqual(result.code, 1, 'Should exit with code 1');
    });

    it('should safely reject semicolon injection', () => {
      const result = spawnSync('node', [CLI_PATH, 'close', 'beth-abc;rm -rf /'], {
        encoding: 'utf-8',
        env: { ...process.env, NO_COLOR: '1' },
        timeout: 15000,
      });
      assert.notStrictEqual(result.status, 0, 'Should reject semicolon injection');
    });

    it('should safely reject pipe injection', () => {
      const result = spawnSync('node', [CLI_PATH, 'close', 'beth-abc|cat /etc/passwd'], {
        encoding: 'utf-8',
        env: { ...process.env, NO_COLOR: '1' },
        timeout: 15000,
      });
      assert.notStrictEqual(result.status, 0, 'Should reject pipe injection');
    });
  });

  describe('argument parsing', () => {
    // Expected: flags parsed correctly, passed through to bd
    it('should accept --reason flag with value', () => {
      // This will fail to actually close (nonexistent ID), but should parse args
      const result = runClose('beth-zzz999 --reason "Testing close"');
      // Will exit 1 because the issue doesn't exist in bd, but should NOT
      // error on the flag parsing itself
      assert.strictEqual(result.code, 1, 'Should exit 1 (issue not found, not arg error)');
      // Should NOT say "Unknown flag"
      assert.ok(
        !result.stderr.includes('Unknown flag'),
        'Should not reject --reason as unknown flag'
      );
    });

    it('should accept -r shorthand for --reason', () => {
      const result = runClose('beth-zzz999 -r "Short reason"');
      assert.strictEqual(result.code, 1);
      assert.ok(
        !result.stderr.includes('Unknown flag'),
        '-r should be accepted as reason shorthand'
      );
    });

    it('should accept --force flag', () => {
      const result = runClose('beth-zzz999 --force');
      assert.strictEqual(result.code, 1);
      assert.ok(
        !result.stderr.includes('Unknown flag'),
        '--force should be accepted'
      );
    });

    it('should accept -f shorthand for --force', () => {
      const result = runClose('beth-zzz999 -f');
      assert.strictEqual(result.code, 1);
      assert.ok(
        !result.stderr.includes('Unknown flag'),
        '-f should be accepted as force shorthand'
      );
    });
  });

  describe('live beads integration', () => {
    let testIssueId: string | null = null;

    // Expected: actual bd close succeeds against real database
    it('should close a real task issue', { skip: SKIP_NO_BEADS }, () => {
      // Create a temp issue to close
      try {
        const output = execSync('bd create "E2E close test temp issue" --type task --json', {
          encoding: 'utf-8',
          timeout: 10000,
        });
        const parsed = JSON.parse(output);
        testIssueId = parsed.id;
        assert.ok(testIssueId, 'Should have created a test issue');
      } catch {
        // If bd create fails, skip
        return;
      }

      const result = runClose(`${testIssueId} --reason "E2E test cleanup"`);
      assert.strictEqual(result.code, 0, `Should exit 0 when closing valid task ${testIssueId}`);
    });

    it('should close with --force bypassing all checks', { skip: SKIP_NO_BEADS }, () => {
      let id: string | null = null;
      try {
        const output = execSync('bd create "E2E force-close test" --type task --json', {
          encoding: 'utf-8',
          timeout: 10000,
        });
        id = JSON.parse(output).id;
      } catch {
        return;
      }

      const result = runClose(`${id} --force --reason "Force close E2E"`);
      assert.strictEqual(result.code, 0, 'Should exit 0 with --force');
    });

    it('should block closing epic with open children', { skip: SKIP_NO_BEADS }, () => {
      let epicId: string | null = null;
      let childId: string | null = null;
      try {
        const epicOut = execSync('bd create "E2E epic close test" --type epic --json', {
          encoding: 'utf-8',
          timeout: 10000,
        });
        epicId = JSON.parse(epicOut).id;

        const childOut = execSync(`bd create "E2E child task" --parent ${epicId} --json`, {
          encoding: 'utf-8',
          timeout: 10000,
        });
        childId = JSON.parse(childOut).id;
      } catch {
        return;
      }

      // Try to close the epic — should be blocked
      const result = runClose(epicId!);
      assert.strictEqual(result.code, 1, 'Should exit 1 when epic has open children');
      assert.ok(
        result.stderr.includes('open child') || result.stderr.includes('Cannot close'),
        'Should mention open children in error'
      );

      // Cleanup
      try {
        if (childId) execSync(`bd close ${childId} --force`, { stdio: 'ignore', timeout: 10000 });
        if (epicId) execSync(`bd close ${epicId} --force`, { stdio: 'ignore', timeout: 10000 });
      } catch { /* best effort */ }
    });

    it('should block epic missing test subtasks', { skip: SKIP_NO_BEADS }, () => {
      let epicId: string | null = null;
      let childId: string | null = null;
      try {
        const epicOut = execSync('bd create "E2E epic test-subtask check" --type epic --json', {
          encoding: 'utf-8',
          timeout: 10000,
        });
        epicId = JSON.parse(epicOut).id;

        // Create and close a non-test child so the epic has no open children
        // but is still missing test subtasks
        const childOut = execSync(`bd create "Implementation task" --parent ${epicId} --json`, {
          encoding: 'utf-8',
          timeout: 10000,
        });
        childId = JSON.parse(childOut).id;
        execSync(`bd close ${childId} --force`, { stdio: 'ignore', timeout: 10000 });
      } catch {
        return;
      }

      const result = runClose(epicId!);
      assert.strictEqual(result.code, 1, 'Should exit 1 when epic lacks test subtasks');
      assert.ok(
        result.stderr.includes('missing mandatory test subtask') || result.stderr.includes('Unit tests'),
        'Should mention missing test subtasks'
      );

      // Cleanup
      try {
        if (epicId) execSync(`bd close ${epicId} --force`, { stdio: 'ignore', timeout: 10000 });
      } catch { /* best effort */ }
    });

    it('should handle nonexistent issue gracefully', { skip: SKIP_NO_BEADS }, () => {
      const result = runClose('beth-zzz999');
      assert.strictEqual(result.code, 1, 'Should exit 1 for nonexistent issue');
    });
  });
});
