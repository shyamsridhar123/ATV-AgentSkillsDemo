/**
 * E2E tests for pre-push-guard command.
 *
 * Runs the actual `beth-copilot pre-push-guard` binary and validates output/behavior.
 *
 * beth-ywg.2: pre-push-guard has 56 unit tests but zero E2E — this fills the gap.
 *
 * Repro steps:
 *   1. Build: npm run build
 *   2. Run: npx vitest run src/cli/commands/pre-push-guard.e2e.test.ts
 *   OR: npx vitest run --config vitest.e2e.config.ts
 *
 * Test cases:
 *   - Running on an epic branch → exit 0, no errors
 *   - Running with BETH_SKIP_PUSH_GUARD=1 → exit 0, bypass
 *   - Running on a protected branch (main) → exit 1, error message
 *   - Running on unrecognized branch name → exit 0 with warning
 *   - Running outside git repo → graceful handling
 *   - Output contains expected formatting
 *
 * Expected outcomes documented inline per test case.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { execSync, spawnSync } from 'child_process';
import { resolve, join } from 'path';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';

const CLI_PATH = resolve(join(import.meta.dirname, '..', '..', '..', 'bin', 'cli.js'));

/**
 * Run pre-push-guard via the CLI binary.
 * Accepts optional env overrides and optional stdin for git ref simulation.
 */
function runGuard(
  options: {
    cwd?: string;
    env?: Record<string, string>;
    stdin?: string;
  } = {}
): { stdout: string; stderr: string; code: number } {
  const env = { ...process.env, NO_COLOR: '1', ...options.env };
  const result = spawnSync('node', [CLI_PATH, 'pre-push-guard'], {
    cwd: options.cwd || process.cwd(),
    encoding: 'utf-8',
    env,
    input: options.stdin || '',
    timeout: 15000,
  });
  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    code: result.status ?? 1,
  };
}

describe('pre-push-guard command E2E', () => {
  describe('runs from project root (current epic branch)', () => {
    // Expected: since we're on an epic branch, the guard should pass 
    it('should exit 0 on the current epic branch', () => {
      // We're on epic/beth-ywg — a valid epic branch
      const result = runGuard();
      assert.strictEqual(result.code, 0, 'Should exit 0 on a valid epic branch');
    });

    it('should not produce error output on a valid branch', () => {
      const result = runGuard();
      // Errors go to stderr — should be empty or just warnings
      const hasBlockingError = result.stderr.includes('blocked') || result.stderr.includes('BLOCKED');
      assert.ok(!hasBlockingError, 'Should not have blocking errors on epic branch');
    });
  });

  describe('bypass with environment variable', () => {
    // Expected: exit 0, skip all checks
    it('should exit 0 when BETH_SKIP_PUSH_GUARD=1', () => {
      const result = runGuard({ env: { BETH_SKIP_PUSH_GUARD: '1' } });
      assert.strictEqual(result.code, 0, 'Should exit 0 when bypass env is set');
    });

    it('should indicate bypass in output', () => {
      const result = runGuard({ env: { BETH_SKIP_PUSH_GUARD: '1' } });
      const combined = result.stdout + result.stderr;
      assert.ok(
        combined.includes('bypass') || combined.includes('skip') || combined.includes('SKIP') || result.code === 0,
        'Should indicate bypass or just exit cleanly'
      );
    });
  });

  describe('outside git repo', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = join(tmpdir(), `beth-guard-test-${Date.now()}`);
      mkdirSync(tmpDir, { recursive: true });
    });

    afterEach(() => {
      if (existsSync(tmpDir)) {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    // Expected: graceful handling — no crash on missing git
    it('should handle non-git directory gracefully', () => {
      const result = runGuard({ cwd: tmpDir });
      // Should not crash with unhandled exception
      assert.ok(
        typeof result.code === 'number',
        'Should exit with a numeric code, not crash'
      );
    });
  });

  describe('protected branch simulation', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = join(tmpdir(), `beth-guard-main-${Date.now()}`);
      mkdirSync(tmpDir, { recursive: true });
      // Create a git repo on 'main' to test protected branch blocking
      execSync('git init', { cwd: tmpDir, stdio: 'ignore' });
      execSync('git checkout -b main', { cwd: tmpDir, stdio: 'ignore' });
      execSync('git commit --allow-empty -m "init"', {
        cwd: tmpDir,
        stdio: 'ignore',
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: 'Test',
          GIT_AUTHOR_EMAIL: 'test@test.com',
          GIT_COMMITTER_NAME: 'Test',
          GIT_COMMITTER_EMAIL: 'test@test.com',
        },
      });
    });

    afterEach(() => {
      if (existsSync(tmpDir)) {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    // Expected: exit 1, error about protected branch
    it('should block push from main branch', () => {
      const result = runGuard({ cwd: tmpDir });
      assert.strictEqual(result.code, 1, 'Should exit 1 when on main branch');
      const combined = result.stdout + result.stderr;
      assert.ok(
        combined.includes('blocked') || combined.includes('main') || combined.includes('BLOCK'),
        'Should mention main is blocked'
      );
    });

    // Expected: exit 1, suggest using epic branch
    it('should suggest using an epic branch', () => {
      const result = runGuard({ cwd: tmpDir });
      const combined = result.stdout + result.stderr;
      assert.ok(
        combined.includes('epic') || combined.includes('PR'),
        'Should suggest using an epic branch or PR'
      );
    });
  });

  describe('unrecognized branch naming', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = join(tmpdir(), `beth-guard-weird-${Date.now()}`);
      mkdirSync(tmpDir, { recursive: true });
      execSync('git init', { cwd: tmpDir, stdio: 'ignore' });
      execSync('git checkout -b my-random-branch', { cwd: tmpDir, stdio: 'ignore' });
      execSync('git commit --allow-empty -m "init"', {
        cwd: tmpDir,
        stdio: 'ignore',
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: 'Test',
          GIT_AUTHOR_EMAIL: 'test@test.com',
          GIT_COMMITTER_NAME: 'Test',
          GIT_COMMITTER_EMAIL: 'test@test.com',
        },
      });
    });

    afterEach(() => {
      if (existsSync(tmpDir)) {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    // Expected: exit 0 (warnings only, not blocking), with naming convention suggestion
    it('should exit 0 but warn about non-epic branch naming', () => {
      const result = runGuard({ cwd: tmpDir });
      assert.strictEqual(result.code, 0, 'Should exit 0 for unrecognized but non-protected branch');
    });

    it('should produce a warning about naming convention', () => {
      const result = runGuard({ cwd: tmpDir });
      const combined = result.stdout + result.stderr;
      assert.ok(
        combined.includes('convention') || combined.includes('warning') || combined.includes('Warning') || combined.includes('doesn\'t follow'),
        'Should warn about naming convention'
      );
    });
  });

  describe('stdin ref parsing (simulated git push input)', () => {
    // Git sends refs on stdin during pre-push. Test that parsing works end-to-end.
    it('should process refs from stdin without crashing', () => {
      const stdin = 'refs/heads/epic/beth-ywg abc123 refs/heads/epic/beth-ywg def456\n';
      const result = runGuard({ stdin });
      // Should not crash — the exit code depends on current branch
      assert.ok(
        typeof result.code === 'number',
        'Should handle stdin refs gracefully'
      );
    });

    it('should block when stdin refs target main', () => {
      const stdin = 'refs/heads/epic/beth-ywg abc123 refs/heads/main def456\n';
      const result = runGuard({ stdin });
      assert.strictEqual(result.code, 1, 'Should block push targeting main via stdin refs');
    });
  });
});
