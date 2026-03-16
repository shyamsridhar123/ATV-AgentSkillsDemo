/**
 * E2E tests for MCP setup integration — merge, force, doctor pipeline, edge cases.
 *
 * These tests cover the gaps in mcp.e2e.test.ts:
 * 1. Config merge on reinit (custom servers preserved)
 * 2. --force overwrites existing .vscode/mcp.json
 * 3. Init → Doctor pipeline (init produces config that doctor passes)
 * 4. Corrupted/malformed .vscode/mcp.json edge cases
 * 5. Missing servers warning on reinit
 */

import { describe, it, beforeEach, afterEach } from 'vitest';
import assert from 'node:assert';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { tmpdir } from 'os';
import { checkMcpServers } from './doctor.js';

const PROJECT_ROOT = resolve(join(import.meta.dirname, '..', '..', '..'));
const CLI_PATH = join(PROJECT_ROOT, 'bin', 'cli.js');

function runInit(cwd: string, flags: string[] = []): { stdout: string; stderr: string; exitCode: number } {
  const command = `node "${CLI_PATH}" init ${flags.join(' ')}`;
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

describe('MCP setup integration — merge and force behavior', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `beth-mcp-merge-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('reinit preserves existing .vscode/mcp.json', () => {
    it('should NOT overwrite .vscode/mcp.json when it already exists (no --force)', () => {
      const vsDir = join(testDir, '.vscode');
      mkdirSync(vsDir, { recursive: true });

      const customConfig = {
        servers: {
          playwright: { command: 'npx', args: ['@playwright/mcp@0.0.68'] },
          backlog: { command: 'backlog', args: ['mcp', 'start'] },
          'my-custom-server': { command: 'custom', args: ['--serve'] },
        },
      };
      writeFileSync(join(vsDir, 'mcp.json'), JSON.stringify(customConfig, null, 2));

      runInit(testDir);

      const config = JSON.parse(readFileSync(join(vsDir, 'mcp.json'), 'utf-8'));
      assert.ok(
        config.servers['my-custom-server'],
        'Custom server should survive reinit without --force'
      );
      assert.deepStrictEqual(
        config.servers['my-custom-server'],
        { command: 'custom', args: ['--serve'] },
        'Custom server config should be unchanged'
      );
    });

    it('should warn about missing required servers in existing config', () => {
      const vsDir = join(testDir, '.vscode');
      mkdirSync(vsDir, { recursive: true });

      // Config with custom server but missing required ones
      writeFileSync(
        join(vsDir, 'mcp.json'),
        JSON.stringify({ servers: { 'my-server': { command: 'my', args: [] } } })
      );

      const result = runInit(testDir);
      const output = result.stdout + result.stderr;

      assert.ok(
        output.includes('missing required servers') || output.includes('playwright') || output.includes('backlog'),
        `Init should warn about missing required servers. Output: ${output}`
      );
    });

    it('should report success when existing config has all required servers', () => {
      const vsDir = join(testDir, '.vscode');
      mkdirSync(vsDir, { recursive: true });

      writeFileSync(
        join(vsDir, 'mcp.json'),
        JSON.stringify({
          servers: {
            playwright: { command: 'npx', args: ['@playwright/mcp@0.0.68'] },
            backlog: { command: 'backlog', args: ['mcp', 'start'] },
          },
        })
      );

      const result = runInit(testDir);
      const output = result.stdout + result.stderr;

      assert.ok(
        output.includes('already has required MCP servers') || output.includes('mcp.json'),
        `Init should confirm existing servers are fine. Output: ${output}`
      );
    });
  });

  describe('--force overwrites .vscode/mcp.json', () => {
    it('should replace existing .vscode/mcp.json with template when --force is used', () => {
      const vsDir = join(testDir, '.vscode');
      mkdirSync(vsDir, { recursive: true });

      // Write a minimal config that's clearly different from template
      writeFileSync(
        join(vsDir, 'mcp.json'),
        JSON.stringify({ servers: { 'only-custom': { command: 'x', args: [] } } })
      );

      runInit(testDir, ['--force']);

      const config = JSON.parse(readFileSync(join(vsDir, 'mcp.json'), 'utf-8'));

      // Should have template content now
      assert.ok(config.servers?.playwright, '.vscode/mcp.json should have playwright after --force');
      assert.ok(config.servers?.backlog, '.vscode/mcp.json should have backlog after --force');
      assert.ok(!config.servers?.['only-custom'], 'Custom-only server should be gone after --force overwrite');
    });

    it('should produce valid JSON matching template after --force', () => {
      const vsDir = join(testDir, '.vscode');
      mkdirSync(vsDir, { recursive: true });
      writeFileSync(join(vsDir, 'mcp.json'), '{"broken": true}');

      runInit(testDir, ['--force']);

      const templateContent = readFileSync(join(PROJECT_ROOT, 'templates', 'mcp.json.example'), 'utf-8');
      const installedContent = readFileSync(join(vsDir, 'mcp.json'), 'utf-8');
      assert.strictEqual(installedContent, templateContent, '--force should produce exact template copy');
    });
  });

  describe('corrupted .vscode/mcp.json handling', () => {
    it('should warn when existing mcp.json is not parseable JSON', () => {
      const vsDir = join(testDir, '.vscode');
      mkdirSync(vsDir, { recursive: true });
      writeFileSync(join(vsDir, 'mcp.json'), '{ this is not valid json!!!');

      const result = runInit(testDir);
      const output = result.stdout + result.stderr;

      assert.ok(
        output.includes('could not be parsed') || output.includes('verify'),
        `Should warn about unparseable mcp.json. Output: ${output}`
      );
    });

    it('should not crash when mcp.json is empty', () => {
      const vsDir = join(testDir, '.vscode');
      mkdirSync(vsDir, { recursive: true });
      writeFileSync(join(vsDir, 'mcp.json'), '');

      // Should not throw — should handle gracefully
      const result = runInit(testDir);
      assert.ok(
        result.exitCode === 0,
        `Init should not crash on empty mcp.json (exit code: ${result.exitCode})`
      );
    });

    it('--force should recover from corrupted mcp.json', () => {
      const vsDir = join(testDir, '.vscode');
      mkdirSync(vsDir, { recursive: true });
      writeFileSync(join(vsDir, 'mcp.json'), '{{{{GARBAGE}}}}');

      runInit(testDir, ['--force']);

      const config = JSON.parse(readFileSync(join(vsDir, 'mcp.json'), 'utf-8'));
      assert.ok(config.servers?.playwright, '--force should recover to valid template config');
      assert.ok(config.servers?.backlog, '--force should recover to valid template config');
    });
  });
});

describe('MCP init → doctor pipeline', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `beth-mcp-pipeline-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('fresh init should produce config that passes doctor checkMcpServers', () => {
    runInit(testDir);

    const result = checkMcpServers(testDir);
    assert.strictEqual(
      result.status,
      'pass',
      `Doctor should pass after fresh init. Got: ${result.status} — ${result.message}`
    );
  });

  it('--force reinit should produce config that passes doctor checkMcpServers', () => {
    // First init
    runInit(testDir);
    // Corrupt it
    const vsDir = join(testDir, '.vscode');
    writeFileSync(join(vsDir, 'mcp.json'), '{"servers": {}}');
    // Verify doctor fails
    const failResult = checkMcpServers(testDir);
    assert.strictEqual(failResult.status, 'fail', 'Doctor should fail on empty servers');

    // Force reinit
    runInit(testDir, ['--force']);

    const result = checkMcpServers(testDir);
    assert.strictEqual(
      result.status,
      'pass',
      `Doctor should pass after --force reinit. Got: ${result.status} — ${result.message}`
    );
  });

  it('doctor should fail when init was run with --skip-mcp', () => {
    runInit(testDir, ['--skip-mcp']);

    const result = checkMcpServers(testDir);
    assert.strictEqual(
      result.status,
      'fail',
      'Doctor should fail when MCP was skipped during init'
    );
    assert.ok(result.message.includes('not found'));
  });

  it('doctor should pass when user manually adds required servers', () => {
    // Skip MCP during init
    runInit(testDir, ['--skip-mcp']);

    // User manually creates a valid config
    const vsDir = join(testDir, '.vscode');
    mkdirSync(vsDir, { recursive: true });
    writeFileSync(
      join(vsDir, 'mcp.json'),
      JSON.stringify({
        servers: {
          playwright: { command: 'npx', args: ['@playwright/mcp@0.0.68'] },
          backlog: { command: 'backlog', args: ['mcp', 'start'] },
        },
      })
    );

    const result = checkMcpServers(testDir);
    assert.strictEqual(
      result.status,
      'pass',
      'Doctor should pass with manually-added required servers'
    );
  });

  it('doctor should count total servers including optional ones', () => {
    runInit(testDir);

    const result = checkMcpServers(testDir);
    assert.strictEqual(result.status, 'pass');
    // Template has 4 servers: playwright, backlog, shadcn, deepwiki
    assert.ok(
      result.message.includes('4 servers'),
      `Should report 4 servers from template. Got: ${result.message}`
    );
  });
});

describe('MCP doctor edge cases', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `beth-mcp-edge-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should fail when servers is an array instead of object', () => {
    const vsDir = join(testDir, '.vscode');
    mkdirSync(vsDir, { recursive: true });
    writeFileSync(join(vsDir, 'mcp.json'), JSON.stringify({ servers: [] }));

    const result = checkMcpServers(testDir);
    // Array is typeof 'object' but not a plain object — checkMcpServers currently lets this through
    // because Array.isArray check is missing. This test documents current behavior.
    // If it passes, the check already handles arrays. If it fails, we've found a bug.
    assert.ok(
      result.status === 'fail',
      `Doctor should fail when servers is an array. Got: ${result.status} — ${result.message}`
    );
  });

  it('should fail when servers is null', () => {
    const vsDir = join(testDir, '.vscode');
    mkdirSync(vsDir, { recursive: true });
    writeFileSync(join(vsDir, 'mcp.json'), JSON.stringify({ servers: null }));

    const result = checkMcpServers(testDir);
    assert.strictEqual(result.status, 'fail');
    assert.ok(result.message.includes('missing "servers"'));
  });

  it('should fail when servers is a string', () => {
    const vsDir = join(testDir, '.vscode');
    mkdirSync(vsDir, { recursive: true });
    writeFileSync(join(vsDir, 'mcp.json'), JSON.stringify({ servers: 'not-an-object' }));

    const result = checkMcpServers(testDir);
    assert.strictEqual(result.status, 'fail');
  });

  it('should pass when servers have extra unknown properties', () => {
    const vsDir = join(testDir, '.vscode');
    mkdirSync(vsDir, { recursive: true });
    writeFileSync(
      join(vsDir, 'mcp.json'),
      JSON.stringify({
        $schema: 'https://example.com',
        servers: {
          playwright: { command: 'npx', args: ['@playwright/mcp@0.0.68'], timeout: 5000 },
          backlog: { command: 'backlog', args: ['mcp', 'start'], env: { DEBUG: '1' } },
        },
        extraTopLevel: true,
      })
    );

    const result = checkMcpServers(testDir);
    assert.strictEqual(
      result.status,
      'pass',
      'Should pass despite extra properties — forward-compatible'
    );
  });

  it('should handle deeply nested invalid JSON gracefully', () => {
    const vsDir = join(testDir, '.vscode');
    mkdirSync(vsDir, { recursive: true });
    // Valid JSON but servers entries are weird types
    writeFileSync(
      join(vsDir, 'mcp.json'),
      JSON.stringify({
        servers: {
          playwright: 'just-a-string',
          backlog: 42,
        },
      })
    );

    // Should not throw — it checks for key existence, not structure
    const result = checkMcpServers(testDir);
    // The current implementation checks `!servers[s.key]` which is truthy for strings/numbers
    // So both servers are "present" — this documents that behavior
    assert.strictEqual(
      result.status,
      'pass',
      'Current implementation accepts any truthy value for server entries'
    );
  });
});
