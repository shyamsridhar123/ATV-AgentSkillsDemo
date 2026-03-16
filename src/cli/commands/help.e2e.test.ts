/**
 * E2E tests for the help command.
 * Run with: node --test dist/cli/commands/help.e2e.test.js
 *
 * Validates that `npx beth-copilot help` shows all available commands,
 * options, and what gets installed.
 */

import { describe, it } from 'vitest';
import assert from 'node:assert';
import { execSync } from 'child_process';
import { join, resolve } from 'path';

const CLI_PATH = resolve(join(import.meta.dirname, '..', '..', '..', 'bin', 'cli.js'));

/**
 * Run a CLI command and capture output.
 */
function runCli(args: string): { stdout: string; stderr: string; code: number } {
  try {
    const stdout = execSync(`node "${CLI_PATH}" ${args}`, {
      encoding: 'utf-8',
      env: { ...process.env, NO_COLOR: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { stdout, stderr: '', code: 0 };
  } catch (error: unknown) {
    const e = error as { stdout?: string; stderr?: string; status?: number };
    return { stdout: e.stdout || '', stderr: e.stderr || '', code: e.status || 1 };
  }
}

describe('help command E2E', () => {
  describe('invocation methods', () => {
    it('should show help with "help" command', () => {
      const result = runCli('help');
      assert.strictEqual(result.code, 0, 'help should exit with code 0');
      assert.ok(result.stdout.includes('Beth'), 'Should mention Beth');
    });

    it('should show help with "--help" flag', () => {
      const result = runCli('--help');
      assert.strictEqual(result.code, 0, '--help should exit with code 0');
      assert.ok(result.stdout.includes('Beth'), 'Should mention Beth');
    });

    it('should show help with "-h" flag', () => {
      const result = runCli('-h');
      assert.strictEqual(result.code, 0, '-h should exit with code 0');
      assert.ok(result.stdout.includes('Beth'), 'Should mention Beth');
    });

    it('should show help when run with no command', () => {
      const result = runCli('');
      assert.strictEqual(result.code, 0, 'No command should show help and exit 0');
      assert.ok(result.stdout.includes('Beth'), 'Should mention Beth');
    });
  });

  describe('all CLI commands listed', () => {
    it('should list the init command', () => {
      const result = runCli('help');
      assert.ok(
        result.stdout.includes('init'),
        'Help should list the init command'
      );
    });

    it('should list the doctor command', () => {
      const result = runCli('help');
      assert.ok(
        result.stdout.includes('doctor'),
        'Help should list the doctor command'
      );
    });

    it('should list the quickstart command', () => {
      const result = runCli('help');
      assert.ok(
        result.stdout.includes('quickstart'),
        'Help should list the quickstart command'
      );
    });

    it('should list the help command', () => {
      const result = runCli('help');
      assert.ok(
        result.stdout.includes('help'),
        'Help should list the help command'
      );
    });
  });

  describe('CLI options listed', () => {
    it('should list --force option', () => {
      const result = runCli('help');
      assert.ok(
        result.stdout.includes('--force'),
        'Help should list --force option'
      );
    });

    it('should list --skip-backlog option', () => {
      const result = runCli('help');
      assert.ok(
        result.stdout.includes('--skip-backlog'),
        'Help should list --skip-backlog option'
      );
    });

    it('should list --skip-mcp option', () => {
      const result = runCli('help');
      assert.ok(
        result.stdout.includes('--skip-mcp'),
        'Help should list --skip-mcp option'
      );
    });

    it('should list --verbose option', () => {
      const result = runCli('help');
      assert.ok(
        result.stdout.includes('--verbose'),
        'Help should list --verbose option'
      );
    });
  });

  describe('installation contents documented', () => {
    it('should mention agents directory', () => {
      const result = runCli('help');
      assert.ok(
        result.stdout.includes('.github/agents') || result.stdout.includes('agents'),
        'Help should document that agents get installed'
      );
    });

    it('should mention skills directory', () => {
      const result = runCli('help');
      assert.ok(
        result.stdout.includes('.github/skills') || result.stdout.includes('skills'),
        'Help should document that skills get installed'
      );
    });

    it('should mention MCP config', () => {
      const result = runCli('help');
      assert.ok(
        result.stdout.includes('mcp.json') || result.stdout.includes('MCP'),
        'Help should document MCP server config'
      );
    });

    it('should mention AGENTS.md', () => {
      const result = runCli('help');
      assert.ok(
        result.stdout.includes('AGENTS.md'),
        'Help should document AGENTS.md'
      );
    });

    it('should mention copilot-instructions.md', () => {
      const result = runCli('help');
      assert.ok(
        result.stdout.includes('copilot-instructions'),
        'Help should document copilot-instructions.md'
      );
    });

    it('should mention VS Code settings', () => {
      const result = runCli('help');
      assert.ok(
        result.stdout.includes('settings.json') || result.stdout.includes('.vscode'),
        'Help should document VS Code settings'
      );
    });
  });

  describe('post-install guidance', () => {
    it('should mention VS Code as the target editor', () => {
      const result = runCli('help');
      assert.ok(
        result.stdout.includes('VS Code'),
        'Help should mention VS Code'
      );
    });

    it('should mention Copilot Chat', () => {
      const result = runCli('help');
      assert.ok(
        result.stdout.includes('Copilot Chat'),
        'Help should mention Copilot Chat'
      );
    });

    it('should mention @Beth as the entry point', () => {
      const result = runCli('help');
      assert.ok(
        result.stdout.includes('@Beth'),
        'Help should mention @Beth as the entry point to the agent system'
      );
    });
  });

  describe('unknown command handling', () => {
    it('should show error for unknown command', () => {
      const result = runCli('foobar');
      assert.strictEqual(result.code, 1, 'Unknown command should exit with code 1');
      assert.ok(
        result.stdout.includes('Unknown command') || result.stderr.includes('Unknown command'),
        'Should indicate unknown command'
      );
    });

    it('should suggest help for unknown command', () => {
      const result = runCli('foobar');
      assert.ok(
        result.stdout.includes('help') || result.stderr.includes('help'),
        'Should suggest running help'
      );
    });

    it('should reject unknown flags', () => {
      const result = runCli('init --nonexistent');
      assert.strictEqual(result.code, 1, 'Unknown flag should exit with code 1');
      assert.ok(
        result.stdout.includes('Unknown flag') || result.stderr.includes('Unknown flag'),
        'Should indicate unknown flag'
      );
    });
  });
});
