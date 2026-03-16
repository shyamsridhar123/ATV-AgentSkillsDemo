/**
 * E2E tests for MCP configuration validation.
 * Run with: node --test dist/cli/commands/mcp.e2e.test.js
 *
 * Validates that mcp.json.example is valid JSON, has expected structure,
 * and that init correctly copies it to target projects.
 */

import { describe, it, beforeEach, afterEach } from 'vitest';
import assert from 'node:assert';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { tmpdir } from 'os';

// Paths
const PROJECT_ROOT = resolve(join(import.meta.dirname, '..', '..', '..'));
const CLI_PATH = join(PROJECT_ROOT, 'bin', 'cli.js');
const TEMPLATE_MCP = join(PROJECT_ROOT, 'templates', 'mcp.json.example');

/**
 * Run init command in a directory.
 */
function runInit(cwd: string, flags: string[] = []): { stdout: string; stderr: string; exitCode: number } {
  const allFlags = [...flags];
  const command = `node "${CLI_PATH}" init ${allFlags.join(' ')}`;

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

describe('MCP configuration validation', () => {
  describe('template mcp.json.example', () => {
    it('should exist in templates directory', () => {
      assert.ok(
        existsSync(TEMPLATE_MCP),
        `mcp.json.example should exist at ${TEMPLATE_MCP}`
      );
    });

    it('should be valid JSON', () => {
      const content = readFileSync(TEMPLATE_MCP, 'utf-8');
      let parsed: unknown;

      assert.doesNotThrow(() => {
        parsed = JSON.parse(content);
      }, 'mcp.json.example must be valid JSON');

      assert.ok(parsed !== null && typeof parsed === 'object', 'Parsed JSON should be an object');
    });

    it('should have servers object at top level', () => {
      const config = JSON.parse(readFileSync(TEMPLATE_MCP, 'utf-8'));

      assert.ok(
        config.servers && typeof config.servers === 'object',
        'mcp.json.example must have a "servers" object'
      );
    });

    it('should have $schema field for VS Code validation', () => {
      const config = JSON.parse(readFileSync(TEMPLATE_MCP, 'utf-8'));

      assert.ok(
        config.$schema && typeof config.$schema === 'string',
        'mcp.json.example should have $schema for VS Code MCP validation'
      );
      assert.ok(
        config.$schema.includes('vscode') || config.$schema.includes('mcp'),
        '$schema should reference VS Code or MCP schema'
      );
    });

    it('should define at least one MCP server', () => {
      const config = JSON.parse(readFileSync(TEMPLATE_MCP, 'utf-8'));
      const serverNames = Object.keys(config.servers);

      assert.ok(
        serverNames.length >= 1,
        `Should have at least 1 MCP server configured, found ${serverNames.length}`
      );
    });

    it('each server should have command+args or type+url', () => {
      const config = JSON.parse(readFileSync(TEMPLATE_MCP, 'utf-8'));

      for (const [name, server] of Object.entries(config.servers)) {
        const s = server as Record<string, unknown>;
        const hasCommandArgs = typeof s.command === 'string' && Array.isArray(s.args);
        const hasTypeUrl = typeof s.type === 'string' && typeof s.url === 'string';

        assert.ok(
          hasCommandArgs || hasTypeUrl,
          `Server "${name}" must have either (command + args) or (type + url). Got: ${JSON.stringify(s)}`
        );
      }
    });

    it('should include shadcn server for component browsing', () => {
      const config = JSON.parse(readFileSync(TEMPLATE_MCP, 'utf-8'));

      assert.ok(
        config.servers.shadcn,
        'Should include shadcn MCP server (used by developer agent for component browsing)'
      );
    });

    it('should include playwright server (required for tester agent)', () => {
      const config = JSON.parse(readFileSync(TEMPLATE_MCP, 'utf-8'));

      assert.ok(
        config.servers.playwright,
        'Should include playwright MCP server (required for browser automation)'
      );
      assert.strictEqual(config.servers.playwright.command, 'npx');
      assert.ok(
        config.servers.playwright.args.some((a: string) => a.includes('@playwright/mcp')),
        'playwright server should use @playwright/mcp package'
      );
    });

    it('should include backlog server (required for task tracking)', () => {
      const config = JSON.parse(readFileSync(TEMPLATE_MCP, 'utf-8'));

      assert.ok(
        config.servers.backlog,
        'Should include backlog MCP server (required for task tracking)'
      );
      assert.strictEqual(config.servers.backlog.command, 'backlog');
      assert.deepStrictEqual(config.servers.backlog.args, ['mcp', 'start']);
    });
  });

  describe('MCP file installation via init', () => {
    let testDir: string;

    beforeEach(() => {
      testDir = join(tmpdir(), `beth-mcp-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      mkdirSync(testDir, { recursive: true });
    });

    afterEach(() => {
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    it('should copy mcp.json.example to target project', () => {
      runInit(testDir);

      const mcpDest = join(testDir, 'mcp.json.example');
      assert.ok(existsSync(mcpDest), 'mcp.json.example should be copied to project');
    });

    it('should install .vscode/mcp.json with required servers', () => {
      runInit(testDir);

      const mcpJsonDest = join(testDir, '.vscode', 'mcp.json');
      assert.ok(existsSync(mcpJsonDest), '.vscode/mcp.json should be created during init');

      const config = JSON.parse(readFileSync(mcpJsonDest, 'utf-8'));
      assert.ok(config.servers?.playwright, '.vscode/mcp.json must have playwright server');
      assert.ok(config.servers?.backlog, '.vscode/mcp.json must have backlog server');
    });

    it('copied mcp.json.example should be valid JSON', () => {
      runInit(testDir);

      const mcpDest = join(testDir, 'mcp.json.example');
      const content = readFileSync(mcpDest, 'utf-8');

      assert.doesNotThrow(() => {
        JSON.parse(content);
      }, 'Copied mcp.json.example must be valid JSON');
    });

    it('copied file should match template content exactly', () => {
      runInit(testDir);

      const templateContent = readFileSync(TEMPLATE_MCP, 'utf-8');
      const copiedContent = readFileSync(join(testDir, 'mcp.json.example'), 'utf-8');

      assert.strictEqual(copiedContent, templateContent, 'Copied file should match template exactly');
    });

    it('should NOT copy mcp.json.example when --skip-mcp is used', () => {
      runInit(testDir, ['--skip-mcp']);

      const mcpDest = join(testDir, 'mcp.json.example');
      assert.ok(!existsSync(mcpDest), 'mcp.json.example should NOT exist with --skip-mcp');
    });

    it('should NOT install .vscode/mcp.json when --skip-mcp is used', () => {
      runInit(testDir, ['--skip-mcp']);

      const mcpJsonDest = join(testDir, '.vscode', 'mcp.json');
      assert.ok(!existsSync(mcpJsonDest), '.vscode/mcp.json should NOT exist with --skip-mcp');
    });

    it('should preserve existing mcp.json.example without --force', () => {
      const mcpDest = join(testDir, 'mcp.json.example');
      const original = '{"custom": true}';
      writeFileSync(mcpDest, original);

      runInit(testDir);

      const content = readFileSync(mcpDest, 'utf-8');
      assert.strictEqual(content, original, 'Should not overwrite existing mcp.json.example without --force');
    });

    it('should overwrite mcp.json.example with --force', () => {
      const mcpDest = join(testDir, 'mcp.json.example');
      const original = '{"custom": true}';
      writeFileSync(mcpDest, original);

      runInit(testDir, ['--force']);

      const content = readFileSync(mcpDest, 'utf-8');
      assert.notStrictEqual(content, original, 'Should overwrite with --force');

      // Verify it's valid JSON from the template
      const parsed = JSON.parse(content);
      assert.ok(parsed.servers, 'Overwritten file should have servers from template');
    });
  });
});
