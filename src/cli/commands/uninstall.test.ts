/**
 * Tests for uninstall command.
 */

import { describe, it, beforeEach, afterEach } from 'vitest';
import assert from 'node:assert';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const CLI_PATH = join(process.cwd(), 'bin', 'cli.js');

/**
 * Run init in a directory to set up a Beth installation.
 */
function runInit(cwd: string, flags: string[] = []): string {
  const command = `node "${CLI_PATH}" init ${flags.join(' ')}`;
  try {
    return execSync(command, {
      cwd,
      encoding: 'utf-8',
      env: { ...process.env, NO_COLOR: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (error: unknown) {
    const execError = error as { stdout?: string };
    return execError.stdout || '';
  }
}

/**
 * Run the uninstall command.
 */
function runUninstall(cwd: string, flags: string[] = []): { stdout: string; stderr: string; exitCode: number } {
  const command = `node "${CLI_PATH}" uninstall ${flags.join(' ')}`;
  try {
    const stdout = execSync(command, {
      cwd,
      encoding: 'utf-8',
      env: { ...process.env, NO_COLOR: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (error: unknown) {
    const execError = error as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: execError.stdout || '',
      stderr: execError.stderr || '',
      exitCode: execError.status || 1,
    };
  }
}

describe('uninstall command', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `beth-uninstall-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('removes Beth-installed files', () => {
    it('should remove .github/agents directory', () => {
      runInit(testDir, ['--skip-backlog', '--skip-mcp']);
      assert.strictEqual(existsSync(join(testDir, '.github', 'agents')), true, 'agents dir should exist after init');

      runUninstall(testDir, ['--force']);
      assert.strictEqual(existsSync(join(testDir, '.github', 'agents')), false, 'agents dir should be removed');
    });

    it('should remove .github/skills directory', () => {
      runInit(testDir, ['--skip-backlog', '--skip-mcp']);
      assert.strictEqual(existsSync(join(testDir, '.github', 'skills')), true, 'skills dir should exist after init');

      runUninstall(testDir, ['--force']);
      assert.strictEqual(existsSync(join(testDir, '.github', 'skills')), false, 'skills dir should be removed');
    });

    it('should remove .github/hooks directory', () => {
      runInit(testDir, ['--skip-backlog', '--skip-mcp']);
      assert.strictEqual(existsSync(join(testDir, '.github', 'hooks')), true, 'hooks dir should exist after init');

      runUninstall(testDir, ['--force']);
      assert.strictEqual(existsSync(join(testDir, '.github', 'hooks')), false, 'hooks dir should be removed');
    });

    it('should remove AGENTS.md', () => {
      runInit(testDir, ['--skip-backlog', '--skip-mcp']);
      assert.strictEqual(existsSync(join(testDir, 'AGENTS.md')), true, 'AGENTS.md should exist after init');

      runUninstall(testDir, ['--force']);
      assert.strictEqual(existsSync(join(testDir, 'AGENTS.md')), false, 'AGENTS.md should be removed');
    });

    it('should remove Backlog.md', () => {
      // Create a Backlog.md manually (since --skip-backlog skips backlog init)
      writeFileSync(join(testDir, 'Backlog.md'), '# Backlog');
      runInit(testDir, ['--skip-backlog', '--skip-mcp']);

      // Manually ensure Backlog.md exists for the test
      writeFileSync(join(testDir, 'Backlog.md'), '# Backlog');

      runUninstall(testDir, ['--force']);
      assert.strictEqual(existsSync(join(testDir, 'Backlog.md')), false, 'Backlog.md should be removed');
    });

    it('should remove .github/copilot-instructions.md', () => {
      runInit(testDir, ['--skip-backlog', '--skip-mcp']);
      assert.strictEqual(
        existsSync(join(testDir, '.github', 'copilot-instructions.md')),
        true,
        'copilot-instructions.md should exist after init'
      );

      runUninstall(testDir, ['--force']);
      assert.strictEqual(
        existsSync(join(testDir, '.github', 'copilot-instructions.md')),
        false,
        'copilot-instructions.md should be removed'
      );
    });

    it('should remove .vscode/settings.json', () => {
      runInit(testDir, ['--skip-backlog', '--skip-mcp']);
      assert.strictEqual(existsSync(join(testDir, '.vscode', 'settings.json')), true, 'settings.json should exist after init');

      runUninstall(testDir, ['--force']);
      assert.strictEqual(existsSync(join(testDir, '.vscode', 'settings.json')), false, 'settings.json should be removed');
    });

    it('should remove mcp.json.example', () => {
      runInit(testDir);
      assert.strictEqual(existsSync(join(testDir, 'mcp.json.example')), true, 'mcp.json.example should exist after init');

      runUninstall(testDir, ['--force']);
      assert.strictEqual(existsSync(join(testDir, 'mcp.json.example')), false, 'mcp.json.example should be removed');
    });
  });

  describe('removes backlog directory', () => {
    it('should remove backlog/ directory if it exists', () => {
      // Simulate what `backlog init` creates
      const backlogDir = join(testDir, 'backlog');
      mkdirSync(join(backlogDir, 'tasks'), { recursive: true });
      writeFileSync(join(backlogDir, 'config.yml'), 'prefix: TEST');

      // Also need agents dir so uninstall detects an installation
      runInit(testDir, ['--skip-backlog', '--skip-mcp']);

      runUninstall(testDir, ['--force']);
      assert.strictEqual(existsSync(backlogDir), false, 'backlog/ should be removed');
    });
  });

  describe('cleans up empty parent directories', () => {
    it('should remove .github/ if empty after cleanup', () => {
      runInit(testDir, ['--skip-backlog', '--skip-mcp']);
      assert.strictEqual(existsSync(join(testDir, '.github')), true, '.github should exist after init');

      runUninstall(testDir, ['--force']);
      assert.strictEqual(existsSync(join(testDir, '.github')), false, '.github should be removed when empty');
    });

    it('should remove .vscode/ if empty after cleanup', () => {
      runInit(testDir, ['--skip-backlog', '--skip-mcp']);
      assert.strictEqual(existsSync(join(testDir, '.vscode')), true, '.vscode should exist after init');

      runUninstall(testDir, ['--force']);
      assert.strictEqual(existsSync(join(testDir, '.vscode')), false, '.vscode should be removed when empty');
    });

    it('should preserve .github/ if it has non-Beth files', () => {
      runInit(testDir, ['--skip-backlog', '--skip-mcp']);
      // Add a non-Beth file to .github
      mkdirSync(join(testDir, '.github', 'workflows'), { recursive: true });
      writeFileSync(join(testDir, '.github', 'workflows', 'ci.yml'), 'name: CI');

      runUninstall(testDir, ['--force']);
      assert.strictEqual(existsSync(join(testDir, '.github')), true, '.github should be preserved');
      assert.strictEqual(existsSync(join(testDir, '.github', 'workflows', 'ci.yml')), true, 'non-Beth files preserved');
      assert.strictEqual(existsSync(join(testDir, '.github', 'agents')), false, 'Beth dirs still removed');
    });

    it('should preserve .vscode/ if it has non-Beth files', () => {
      runInit(testDir, ['--skip-backlog', '--skip-mcp']);
      // Add a non-Beth file to .vscode
      writeFileSync(join(testDir, '.vscode', 'extensions.json'), '{}');

      runUninstall(testDir, ['--force']);
      assert.strictEqual(existsSync(join(testDir, '.vscode')), true, '.vscode should be preserved');
      assert.strictEqual(existsSync(join(testDir, '.vscode', 'extensions.json')), true, 'non-Beth files preserved');
      assert.strictEqual(existsSync(join(testDir, '.vscode', 'settings.json')), false, 'Beth files still removed');
    });
  });

  describe('pre-push hook cleanup', () => {
    it('should remove Beth guard block from pre-push hook', () => {
      // Create a .git/hooks directory and a pre-push hook with Beth guard
      const hooksDir = join(testDir, '.git', 'hooks');
      mkdirSync(hooksDir, { recursive: true });

      const guardContent = `#!/bin/sh
# User's custom hook
echo "custom check"

# --- BEGIN BETH GUARD ---
# Branch discipline enforcement — installed by beth-copilot
echo "beth guard"
# --- END BETH GUARD ---
`;
      writeFileSync(join(hooksDir, 'pre-push'), guardContent);

      // Need agents dir so uninstall detects installation
      runInit(testDir, ['--skip-backlog', '--skip-mcp']);

      runUninstall(testDir, ['--force']);

      const hookPath = join(hooksDir, 'pre-push');
      assert.strictEqual(existsSync(hookPath), true, 'hook should still exist (has user content)');

      const remaining = readFileSync(hookPath, 'utf-8');
      assert.ok(!remaining.includes('BEGIN BETH GUARD'), 'guard block should be removed');
      assert.ok(remaining.includes('custom check'), 'user content should be preserved');
    });

    it('should remove entire pre-push file if only Beth guard remains', () => {
      const hooksDir = join(testDir, '.git', 'hooks');
      mkdirSync(hooksDir, { recursive: true });

      const guardOnlyContent = `#!/bin/sh
# --- BEGIN BETH GUARD ---
# Branch discipline enforcement — installed by beth-copilot
echo "beth guard"
# --- END BETH GUARD ---
`;
      writeFileSync(join(hooksDir, 'pre-push'), guardOnlyContent);

      runInit(testDir, ['--skip-backlog', '--skip-mcp']);

      runUninstall(testDir, ['--force']);

      assert.strictEqual(existsSync(join(hooksDir, 'pre-push')), false, 'hook should be removed when Beth-only');
    });
  });

  describe('no installation detected', () => {
    it('should exit gracefully when no Beth installation exists', () => {
      const result = runUninstall(testDir, ['--force']);
      assert.ok(
        result.stdout.includes('No Beth installation') || result.exitCode === 0,
        'Should handle missing installation gracefully'
      );
    });
  });

  describe('full round-trip', () => {
    it('init then uninstall should leave directory clean', () => {
      // Record initial state (empty dir)
      const before = readdirSync(testDir);

      // Install Beth
      runInit(testDir, ['--skip-backlog', '--skip-mcp']);

      // Verify something was installed
      assert.strictEqual(existsSync(join(testDir, '.github', 'agents')), true, 'init should install agents');
      assert.strictEqual(existsSync(join(testDir, 'AGENTS.md')), true, 'init should install AGENTS.md');

      // Uninstall Beth
      runUninstall(testDir, ['--force']);

      // Directory should be back to empty (or have only files that existed before)
      const after = readdirSync(testDir);
      assert.deepStrictEqual(after.sort(), before.sort(), 'directory should be clean after uninstall');
    });
  });
});
