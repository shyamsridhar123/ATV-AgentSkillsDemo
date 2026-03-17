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

    // Should not throw — it checks for key existence, then validates structure
    const result = checkMcpServers(testDir);
    // The implementation now validates server structure and warns on invalid entries
    assert.strictEqual(
      result.status,
      'warn',
      'Doctor should warn when server entries have invalid structure'
    );
    assert.ok(result.message.includes('invalid structure'));
  });
});

describe('MCP lifecycle — init → doctor → break → reinit → doctor', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `beth-mcp-lifecycle-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('full lifecycle: init installs both → doctor passes → remove playwright → doctor fails → --force restores → doctor passes', () => {
    // Step 1: Fresh init — should create .vscode/mcp.json with all servers
    runInit(testDir);
    const mcpPath = join(testDir, '.vscode', 'mcp.json');
    assert.ok(existsSync(mcpPath), 'init should create .vscode/mcp.json');

    const initialConfig = JSON.parse(readFileSync(mcpPath, 'utf-8'));
    assert.ok(initialConfig.servers?.playwright, 'Init should install playwright server');
    assert.ok(initialConfig.servers?.backlog, 'Init should install backlog server');

    // Step 2: Doctor should pass with both required servers present
    const passResult = checkMcpServers(testDir);
    assert.strictEqual(
      passResult.status,
      'pass',
      `Doctor should pass after fresh init. Got: ${passResult.status} — ${passResult.message}`
    );

    // Step 3: Remove playwright — simulates user accidentally deleting a required server
    const broken = { ...initialConfig, servers: { ...initialConfig.servers } };
    delete broken.servers.playwright;
    writeFileSync(mcpPath, JSON.stringify(broken, null, 2));

    // Step 4: Doctor should fail with playwright missing
    const failResult = checkMcpServers(testDir);
    assert.strictEqual(
      failResult.status,
      'fail',
      `Doctor should fail after removing playwright. Got: ${failResult.status} — ${failResult.message}`
    );
    assert.ok(
      failResult.message.toLowerCase().includes('playwright'),
      `Failure message should mention playwright. Got: ${failResult.message}`
    );

    // Step 5: Reinit with --force should restore the full template
    runInit(testDir, ['--force']);

    const restoredConfig = JSON.parse(readFileSync(mcpPath, 'utf-8'));
    assert.ok(restoredConfig.servers?.playwright, '--force should restore playwright server');
    assert.ok(restoredConfig.servers?.backlog, '--force should restore backlog server');

    // Step 6: Doctor should pass again
    const recoveredResult = checkMcpServers(testDir);
    assert.strictEqual(
      recoveredResult.status,
      'pass',
      `Doctor should pass after --force reinit. Got: ${recoveredResult.status} — ${recoveredResult.message}`
    );
  });

  it('full lifecycle: init installs both → doctor passes → remove backlog → doctor fails → --force restores → doctor passes', () => {
    // Same cycle but removing backlog instead of playwright
    runInit(testDir);
    const mcpPath = join(testDir, '.vscode', 'mcp.json');

    const passResult = checkMcpServers(testDir);
    assert.strictEqual(passResult.status, 'pass');

    // Remove backlog server
    const config = JSON.parse(readFileSync(mcpPath, 'utf-8'));
    delete config.servers.backlog;
    writeFileSync(mcpPath, JSON.stringify(config, null, 2));

    const failResult = checkMcpServers(testDir);
    assert.strictEqual(
      failResult.status,
      'fail',
      `Doctor should fail after removing backlog. Got: ${failResult.status} — ${failResult.message}`
    );
    assert.ok(
      failResult.message.toLowerCase().includes('backlog'),
      `Failure message should mention backlog. Got: ${failResult.message}`
    );

    // Force restore
    runInit(testDir, ['--force']);

    const recoveredResult = checkMcpServers(testDir);
    assert.strictEqual(
      recoveredResult.status,
      'pass',
      `Doctor should pass after --force. Got: ${recoveredResult.status} — ${recoveredResult.message}`
    );
  });

  it('full lifecycle: init installs both → remove BOTH required → doctor fails → --force restores → doctor passes', () => {
    runInit(testDir);
    const mcpPath = join(testDir, '.vscode', 'mcp.json');

    // Verify starting state is healthy
    assert.strictEqual(checkMcpServers(testDir).status, 'pass');

    // Nuke both required servers, keep only optional ones
    const config = JSON.parse(readFileSync(mcpPath, 'utf-8'));
    delete config.servers.playwright;
    delete config.servers.backlog;
    writeFileSync(mcpPath, JSON.stringify(config, null, 2));

    const failResult = checkMcpServers(testDir);
    assert.strictEqual(failResult.status, 'fail');

    // Force restore
    runInit(testDir, ['--force']);

    const restoredConfig = JSON.parse(readFileSync(mcpPath, 'utf-8'));
    assert.ok(restoredConfig.servers?.playwright, 'playwright restored');
    assert.ok(restoredConfig.servers?.backlog, 'backlog restored');
    assert.strictEqual(checkMcpServers(testDir).status, 'pass', 'Doctor passes after full restore');
  });

  it('lifecycle: corrupt entire mcp.json → doctor fails → --force restores → doctor passes', () => {
    runInit(testDir);
    assert.strictEqual(checkMcpServers(testDir).status, 'pass');

    // Corrupt the file completely
    writeFileSync(join(testDir, '.vscode', 'mcp.json'), '<<<NOT JSON>>>');

    const failResult = checkMcpServers(testDir);
    assert.strictEqual(
      failResult.status,
      'fail',
      `Doctor should fail on corrupted JSON. Got: ${failResult.status}`
    );

    // Force restore
    runInit(testDir, ['--force']);

    assert.strictEqual(
      checkMcpServers(testDir).status,
      'pass',
      'Doctor should pass after --force recovers from corruption'
    );
  });

  it('lifecycle: delete mcp.json entirely → doctor fails → init restores → doctor passes', () => {
    runInit(testDir);
    assert.strictEqual(checkMcpServers(testDir).status, 'pass');

    // Delete the file entirely
    rmSync(join(testDir, '.vscode', 'mcp.json'));

    const failResult = checkMcpServers(testDir);
    assert.strictEqual(failResult.status, 'fail', 'Doctor should fail when mcp.json is deleted');

    // Regular init (not --force) should recreate it since the file doesn't exist
    runInit(testDir);

    assert.strictEqual(
      checkMcpServers(testDir).status,
      'pass',
      'Doctor should pass after init recreates deleted mcp.json'
    );
  });
});
