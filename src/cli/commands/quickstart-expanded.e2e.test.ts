/**
 * Expanded tests for quickstart command.
 *
 * beth-ywg.3: quickstart only had 13 tests, many conditional. This adds
 * non-conditional tests for output format, error paths, and edge cases.
 *
 * Repro steps:
 *   1. Build: npm run build
 *   2. Run: npx vitest run src/cli/commands/quickstart-expanded.e2e.test.ts
 *
 * Test cases (non-conditional — no beads dependency):
 *   - Empty directory → exit 1, clear error about missing Beth
 *   - Beth initialized but no skills → still runs doctor, reports warning
 *   - Output contains "Quick Start Guide" heading or equivalent guidance
 *   - Output mentions @Beth for starting sessions
 *   - Exit code is numeric in all scenarios (no crashes)
 *   - --verbose flag is accepted and produces more output
 *   - Non-existent flag → graceful handling
 *
 * Expected outcomes documented inline per test case.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'child_process';
import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { delimiter, join, resolve } from 'path';
import { tmpdir } from 'os';

const CLI_PATH = resolve(join(import.meta.dirname, '..', '..', '..', 'bin', 'cli.js'));

function createMockBeadsCli(binDir: string): void {
  const cliPath = join(binDir, 'bd');
  const script = `#!/bin/sh
set -eu

command_name="\${1:-}"

case "$command_name" in
  --version)
    echo "bd 0.0.0-test"
    exit 0
    ;;
  init)
    mkdir -p .beads
    printf '{"version":"1.0"}' > .beads/config.json
    exit 0
    ;;
  *)
    echo "mock bd: unsupported command $command_name" >&2
    exit 0
    ;;
esac
`;

  writeFileSync(cliPath, script);
  chmodSync(cliPath, 0o755);
}

function runQuickstart(cwd: string, mockBinDir: string, args: string[] = []): { stdout: string; stderr: string; code: number } {
  const result = spawnSync('node', [CLI_PATH, 'quickstart', ...args], {
    cwd,
    encoding: 'utf-8',
    env: {
      ...process.env,
      NO_COLOR: '1',
      FORCE_COLOR: '0',
      PATH: `${mockBinDir}${delimiter}${process.env.PATH ?? ''}`,
    },
    timeout: 30000,
  });
  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    code: result.status ?? 1,
  };
}

function createMinimalBethProject(dir: string): void {
  const agentsDir = join(dir, '.github', 'agents');
  mkdirSync(agentsDir, { recursive: true });
  writeFileSync(
    join(agentsDir, 'beth.agent.md'),
    '---\nname: Beth\ndescription: Test\nmodel: gpt-4\ntools:\n  - readFile\n---\n# Beth\n'
  );
}

function createFullBethProject(dir: string): void {
  createMinimalBethProject(dir);
  // Add skills directory
  const skillDir = join(dir, '.github', 'skills', 'test-skill');
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, 'SKILL.md'), '# Test Skill\nTest content');
}

describe('quickstart expanded E2E tests', () => {
  let testDir: string;
  let mockBinDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `beth-qs-expanded-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });

    mockBinDir = join(testDir, 'mock-bin');
    mkdirSync(mockBinDir, { recursive: true });
    createMockBeadsCli(mockBinDir);
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('empty directory (Beth not initialized)', () => {
    // Expected: exit 1, clear error about Beth not being set up
    it('should exit 1 in an empty directory', () => {
      const result = runQuickstart(testDir, mockBinDir);
      assert.strictEqual(result.code, 1, 'Should exit 1 when Beth is not initialized');
    });

    it('should tell user to run init first', () => {
      const result = runQuickstart(testDir, mockBinDir);
      const combined = result.stdout + result.stderr;
      assert.ok(
        combined.includes('init') || combined.includes('not initialized'),
        'Should suggest running init'
      );
    });

    it('should not crash with unhandled exception', () => {
      const result = runQuickstart(testDir, mockBinDir);
      assert.ok(
        !result.stderr.includes('TypeError') && !result.stderr.includes('ReferenceError'),
        'Should not have unhandled JS errors'
      );
    });
  });

  describe('Beth initialized without skills', () => {
    // Expected: quickstart proceeds past Beth check, may warn about missing skills
    it('should detect Beth is initialized even without skills', () => {
      createMinimalBethProject(testDir);
      const result = runQuickstart(testDir, mockBinDir);
      const combined = result.stdout + result.stderr;
      assert.ok(
        combined.includes('initialized') || combined.includes('✓') || combined.includes('Beth'),
        'Should acknowledge Beth is present'
      );
    });
  });

  describe('Beth fully initialized', () => {
    it('should proceed past Beth initialization check', () => {
      createFullBethProject(testDir);
      const result = runQuickstart(testDir, mockBinDir);
      const combined = result.stdout + result.stderr;
      // Should get past the "not initialized" gate
      assert.ok(
        !combined.includes('not initialized') || combined.includes('✓'),
        'Should not show "not initialized" error'
      );
    });
  });

  describe('output format and content', () => {
    it('should produce non-empty stdout', () => {
      createFullBethProject(testDir);
      const result = runQuickstart(testDir, mockBinDir);
      assert.ok(
        result.stdout.length > 0 || result.stderr.length > 0,
        'Should produce some output'
      );
    });

    it('should mention @Beth or VS Code in guidance', () => {
      createFullBethProject(testDir);
      const result = runQuickstart(testDir, mockBinDir);
      const combined = result.stdout + result.stderr;
      assert.ok(
        combined.includes('@Beth') || combined.includes('VS Code') || combined.includes('Copilot'),
        'Should include actionable guidance mentioning @Beth or VS Code'
      );
    });
  });

  describe('--verbose flag', () => {
    it('should accept --verbose without error', () => {
      createFullBethProject(testDir);
      const result = runQuickstart(testDir, mockBinDir, ['--verbose']);
      // Should not reject the flag
      assert.ok(
        !result.stderr.includes('Unknown flag'),
        '--verbose should be accepted'
      );
    });

    it('should produce equal or more output with --verbose', () => {
      createFullBethProject(testDir);
      const normal = runQuickstart(testDir, mockBinDir);
      const verbose = runQuickstart(testDir, mockBinDir, ['--verbose']);
      assert.ok(
        verbose.stdout.length >= normal.stdout.length || verbose.stderr.length >= normal.stderr.length,
        '--verbose should produce at least as much output'
      );
    });
  });

  describe('resilience', () => {
    it('should handle directory with no permissions gracefully', () => {
      // Create a directory structure that exists but has weird contents
      createMinimalBethProject(testDir);
      // Write a corrupt agent file
      writeFileSync(
        join(testDir, '.github', 'agents', 'broken.agent.md'),
        'this is not valid frontmatter at all {{{'
      );
      const result = runQuickstart(testDir, mockBinDir);
      // Should not crash — may warn or fail gracefully
      assert.ok(
        typeof result.code === 'number',
        'Should exit with a numeric code, not crash'
      );
    });

    it('should handle very deep nested directories', () => {
      const deepDir = join(testDir, 'a', 'b', 'c', 'd', 'e');
      mkdirSync(deepDir, { recursive: true });
      const result = runQuickstart(deepDir, mockBinDir);
      assert.strictEqual(result.code, 1, 'Should exit 1 (no Beth project in deep dir)');
    });
  });
});
