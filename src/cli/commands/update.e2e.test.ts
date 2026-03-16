/**
 * E2E tests for the update command.
 * Run with: npx vitest run src/cli/commands/update.e2e.test.ts
 *
 * beth-r08.6: Validates `npx beth-copilot update` behavior end-to-end.
 *
 * Test scenarios:
 *   1. Command is recognized (not rejected as unknown)
 *   2. Listed in help output
 *   3. --check-only reports version status without modifying files
 *   4. Reports "already up to date" when templates match
 *   5. Shows update summary with --verbose
 *   6. --force overwrites existing files
 *   7. Does not overwrite user-modified files without --force
 *   8. Handles network errors gracefully (npm registry unreachable)
 *   9. Exits with code 0 on success, non-zero on failure
 *  10. Installs new agent/skill files that did not exist before
 *
 * These tests exercise the real CLI binary in temp directories.
 * They do NOT hit the npm registry — network calls are tested
 * separately or mocked via env vars.
 */

import { describe, it, beforeEach, afterEach } from 'vitest';
import assert from 'node:assert';
import { execSync } from 'child_process';
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
  readdirSync,
} from 'fs';
import { join, resolve } from 'path';
import { tmpdir } from 'os';

const CLI_PATH = resolve(join(import.meta.dirname, '..', '..', '..', 'bin', 'cli.js'));

/**
 * Run a CLI command and capture output.
 */
function runCli(
  args: string,
  options: { cwd?: string; env?: Record<string, string> } = {}
): { stdout: string; stderr: string; code: number } {
  try {
    const stdout = execSync(`node "${CLI_PATH}" ${args}`, {
      cwd: options.cwd,
      encoding: 'utf-8',
      env: { ...process.env, NO_COLOR: '1', ...options.env },
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 30000,
    });
    return { stdout, stderr: '', code: 0 };
  } catch (error: unknown) {
    const e = error as { stdout?: string; stderr?: string; status?: number };
    return { stdout: e.stdout || '', stderr: e.stderr || '', code: e.status || 1 };
  }
}

/**
 * Initialize a temp directory with a minimal beth installation
 * (simulates a project that previously ran `init`).
 */
function setupInstalledProject(dir: string): void {
  // Create .github/agents with a sample agent
  const agentsDir = join(dir, '.github', 'agents');
  mkdirSync(agentsDir, { recursive: true });
  writeFileSync(
    join(agentsDir, 'beth.agent.md'),
    `---
name: Beth
description: Orchestrator
model: Claude Opus 4.6
tools:
  - runSubagent
---

# Beth
`
  );

  // Create .github/skills with a sample skill
  const skillDir = join(dir, '.github', 'skills', 'prd');
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, 'SKILL.md'), '# PRD Skill\n');

  // Create AGENTS.md
  writeFileSync(join(dir, 'AGENTS.md'), '# Agent Instructions\n');

  // Create package.json (needed for version detection)
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'test-project', version: '1.0.0' }, null, 2)
  );
}

// ─────────────────────────────────────────────────────────
// Test suites
// ─────────────────────────────────────────────────────────

// Skipped: update command not yet implemented in bin/cli.js (beth-r08).
// Unskip once `case 'update'` is wired into the CLI entrypoint.
describe.skip('update command E2E', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `beth-update-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  // ── 1. Command recognition ──────────────────────────────

  describe('command recognition', () => {
    it('should accept "update" as a valid command (not rejected as unknown)', () => {
      // When update is implemented, this should NOT return the
      // "Unknown command" error that unrecognized commands get.
      const result = runCli('update --check-only', { cwd: testDir });

      // The command should either succeed or fail for a reason
      // OTHER than "unknown command" or "unknown flag". Without this
      // dual check, the test passes vacuously when the CLI rejects
      // --check-only as an unknown flag before it ever dispatches.
      const combined = result.stdout + result.stderr;
      const isRejected =
        /unknown (command|flag)/i.test(combined);
      assert.strictEqual(
        isRejected,
        false,
        '"update --check-only" should be recognized — not rejected as unknown command or unknown flag'
      );
    });
  });

  // ── 2. Help integration ─────────────────────────────────

  describe('help integration', () => {
    it('should list the update command in help output', () => {
      const result = runCli('help');
      assert.ok(
        result.stdout.includes('update'),
        'Help output should mention the update command'
      );
    });
  });

  // ── 3. --check-only flag ────────────────────────────────

  describe('--check-only flag', () => {
    it('should report version status without modifying any files', () => {
      setupInstalledProject(testDir);

      // Snapshot file state before
      const agentBefore = readFileSync(
        join(testDir, '.github', 'agents', 'beth.agent.md'),
        'utf-8'
      );

      const result = runCli('update --check-only', { cwd: testDir });

      // File should be unchanged
      const agentAfter = readFileSync(
        join(testDir, '.github', 'agents', 'beth.agent.md'),
        'utf-8'
      );
      assert.strictEqual(
        agentBefore,
        agentAfter,
        '--check-only should not modify any files'
      );

      // Should output version information
      assert.ok(
        result.stdout.includes('version') ||
          result.stdout.includes('up to date') ||
          result.stdout.includes('available'),
        '--check-only should report version status'
      );
    });

    it('should exit with code 0 when check succeeds', () => {
      setupInstalledProject(testDir);
      const result = runCli('update --check-only', { cwd: testDir });
      assert.strictEqual(result.code, 0, '--check-only should exit 0 on success');
    });
  });

  // ── 4. Already up to date ───────────────────────────────

  describe('already up to date', () => {
    it('should report when no update is available', () => {
      setupInstalledProject(testDir);

      // Run update (templates should match since they came from the same version)
      const result = runCli('update', { cwd: testDir });

      // Should indicate that things are current or that update completed
      const indicatesStatus =
        result.stdout.includes('up to date') ||
        result.stdout.includes('already') ||
        result.stdout.includes('Updated') ||
        result.stdout.includes('installed');
      assert.ok(indicatesStatus, 'Should report update status');
    });
  });

  // ── 5. --verbose flag ──────────────────────────────────

  describe('--verbose flag', () => {
    it('should show additional detail with --verbose', () => {
      setupInstalledProject(testDir);

      const normal = runCli('update --check-only', { cwd: testDir });
      const verbose = runCli('update --check-only --verbose', { cwd: testDir });

      // Verbose output should be equal or longer than normal output
      assert.ok(
        verbose.stdout.length >= normal.stdout.length,
        '--verbose should produce equal or more output than default'
      );
    });
  });

  // ── 6. --force flag ────────────────────────────────────

  describe('--force flag', () => {
    it('should overwrite existing files when --force is used', () => {
      setupInstalledProject(testDir);

      // Modify a file to simulate user customization
      const agentPath = join(testDir, '.github', 'agents', 'beth.agent.md');
      writeFileSync(agentPath, 'USER CUSTOMIZED CONTENT');

      runCli('update --force', { cwd: testDir });

      // With --force, the file should be overwritten with the template version
      const afterContent = readFileSync(agentPath, 'utf-8');
      assert.notStrictEqual(
        afterContent,
        'USER CUSTOMIZED CONTENT',
        '--force should overwrite user-modified files with template versions'
      );
    });
  });

  // ── 7. Preserve user modifications ──────────────────────

  describe('preserve user modifications', () => {
    it('should not overwrite user-modified files without --force', () => {
      setupInstalledProject(testDir);

      // Modify a file to simulate user customization
      const agentPath = join(testDir, '.github', 'agents', 'beth.agent.md');
      writeFileSync(agentPath, 'USER CUSTOMIZED CONTENT');

      const result = runCli('update', { cwd: testDir });

      // Without --force, the user's customization should be preserved
      const afterContent = readFileSync(agentPath, 'utf-8');
      assert.strictEqual(
        afterContent,
        'USER CUSTOMIZED CONTENT',
        'Should preserve user-modified files without --force'
      );

      // Should warn the user that files were skipped
      const mentionsSkipped =
        result.stdout.includes('skip') ||
        result.stdout.includes('Skip') ||
        result.stdout.includes('modified') ||
        result.stdout.includes('preserved');
      assert.ok(
        mentionsSkipped,
        'Should mention that user-modified files were skipped'
      );
    });
  });

  // ── 8. Network error handling ───────────────────────────

  describe('network error handling', () => {
    it('should handle npm registry being unreachable gracefully', () => {
      setupInstalledProject(testDir);

      // Use a bogus registry URL to simulate network failure
      const result = runCli('update --check-only', {
        cwd: testDir,
        env: { npm_config_registry: 'http://localhost:1' },
      });

      // Should not crash — either succeeds with cached data or
      // reports the error cleanly
      const crashed = result.stderr.includes('Unhandled') ||
        result.stderr.includes('FATAL');
      assert.strictEqual(
        crashed,
        false,
        'Should handle network errors without crashing'
      );
    });
  });

  // ── 9. Exit codes ──────────────────────────────────────

  describe('exit codes', () => {
    it('should exit with code 0 on successful update', () => {
      setupInstalledProject(testDir);
      const result = runCli('update', { cwd: testDir });
      assert.strictEqual(result.code, 0, 'Successful update should exit with code 0');
    });
  });

  // ── 10. New files added by update ───────────────────────

  describe('new template files', () => {
    it('should install new agent files that did not exist before', () => {
      setupInstalledProject(testDir);

      // Setup creates only beth.agent.md — update should add more
      const agentsDir = join(testDir, '.github', 'agents');
      const beforeCount = readdirSync(agentsDir).filter(f => f.endsWith('.agent.md')).length;

      runCli('update', { cwd: testDir });

      const afterCount = readdirSync(agentsDir).filter(f => f.endsWith('.agent.md')).length;

      assert.ok(
        afterCount > beforeCount,
        `Update should install new agent files. Before: ${beforeCount}, after: ${afterCount}`
      );
    });

    it('should install new skill directories that did not exist before', () => {
      setupInstalledProject(testDir);

      // Setup creates only prd/ — update should add more
      const skillsDir = join(testDir, '.github', 'skills');
      const beforeCount = readdirSync(skillsDir, { withFileTypes: true })
        .filter(d => d.isDirectory()).length;

      runCli('update', { cwd: testDir });

      assert.ok(
        existsSync(skillsDir),
        'Skills directory should exist after update'
      );

      const afterCount = readdirSync(skillsDir, { withFileTypes: true })
        .filter(d => d.isDirectory()).length;

      assert.ok(
        afterCount > beforeCount,
        `Update should install new skill dirs. Before: ${beforeCount}, after: ${afterCount}`
      );
    });
  });
});
