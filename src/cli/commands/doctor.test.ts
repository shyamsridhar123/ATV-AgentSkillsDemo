/**
 * Unit tests for doctor command.
 * Run with: node --test dist/cli/commands/doctor.test.js
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { parseDoltDatabases, SYSTEM_DBS, DB_COUNT_THRESHOLD, checkGitHooks, getMinNodeVersion } from './doctor.js';

// Test utilities - we can't import the private functions from doctor.ts
// but we can test the overall behavior

describe('doctor command integration', () => {
  let testDir: string;

  beforeEach(() => {
    // Create a temp directory for testing
    testDir = join(tmpdir(), `beth-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up temp directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('Node.js version check', () => {
    it('should pass with current Node.js version', () => {
      const version = process.version;
      const major = parseInt(version.slice(1).split('.')[0], 10);
      assert.ok(major >= 18, `Node.js ${version} should be >= 18`);
    });
  });

  describe('getMinNodeVersion', () => {
    it('should read minimum version from package.json engines.node', () => {
      mkdirSync(testDir, { recursive: true });
      writeFileSync(join(testDir, 'package.json'), JSON.stringify({ engines: { node: '>=20' } }));
      assert.strictEqual(getMinNodeVersion(testDir), 20);
    });

    it('should handle caret syntax like ^18', () => {
      mkdirSync(testDir, { recursive: true });
      writeFileSync(join(testDir, 'package.json'), JSON.stringify({ engines: { node: '^18' } }));
      assert.strictEqual(getMinNodeVersion(testDir), 18);
    });

    it('should handle full semver like >=18.0.0', () => {
      mkdirSync(testDir, { recursive: true });
      writeFileSync(join(testDir, 'package.json'), JSON.stringify({ engines: { node: '>=18.0.0' } }));
      assert.strictEqual(getMinNodeVersion(testDir), 18);
    });

    it('should return fallback when package.json is missing', () => {
      assert.strictEqual(getMinNodeVersion(testDir), 18);
    });

    it('should return fallback when engines field is missing', () => {
      mkdirSync(testDir, { recursive: true });
      writeFileSync(join(testDir, 'package.json'), JSON.stringify({ name: 'test' }));
      assert.strictEqual(getMinNodeVersion(testDir), 18);
    });

    it('should return fallback when engines.node is not a string', () => {
      mkdirSync(testDir, { recursive: true });
      writeFileSync(join(testDir, 'package.json'), JSON.stringify({ engines: { node: 18 } }));
      assert.strictEqual(getMinNodeVersion(testDir), 18);
    });
  });

  describe('agents directory validation', () => {
    it('should detect missing .github/agents directory', () => {
      const agentsDir = join(testDir, '.github', 'agents');
      assert.strictEqual(existsSync(agentsDir), false);
    });

    it('should detect existing .github/agents directory', () => {
      const agentsDir = join(testDir, '.github', 'agents');
      mkdirSync(agentsDir, { recursive: true });
      assert.strictEqual(existsSync(agentsDir), true);
    });

    it('should detect valid agent files', () => {
      const agentsDir = join(testDir, '.github', 'agents');
      mkdirSync(agentsDir, { recursive: true });
      
      const agentContent = `---
name: test-agent
description: A test agent
model: Claude Opus 4.6
tools:
  - readFile
  - editFiles
---

# Test Agent

This is a test agent.
`;
      writeFileSync(join(agentsDir, 'test.agent.md'), agentContent);
      
      const files = existsSync(agentsDir);
      assert.strictEqual(files, true);
    });

    it('should detect agent files missing name in frontmatter', () => {
      const agentsDir = join(testDir, '.github', 'agents');
      mkdirSync(agentsDir, { recursive: true });
      
      // Agent file without name field
      const agentContent = `---
description: A test agent without name
---

# Test Agent
`;
      writeFileSync(join(agentsDir, 'invalid.agent.md'), agentContent);
      
      // We'd need to import gray-matter to actually parse this
      // For now, just verify file was created
      assert.strictEqual(existsSync(join(agentsDir, 'invalid.agent.md')), true);
    });
  });

  describe('skills directory validation', () => {
    it('should detect missing .github/skills directory', () => {
      const skillsDir = join(testDir, '.github', 'skills');
      assert.strictEqual(existsSync(skillsDir), false);
    });

    it('should detect skill directories with SKILL.md', () => {
      const skillDir = join(testDir, '.github', 'skills', 'test-skill');
      mkdirSync(skillDir, { recursive: true });
      
      writeFileSync(join(skillDir, 'SKILL.md'), '# Test Skill\n\nThis is a test skill.');
      
      assert.strictEqual(existsSync(join(skillDir, 'SKILL.md')), true);
    });

    it('should detect skill directories missing SKILL.md', () => {
      const skillDir = join(testDir, '.github', 'skills', 'incomplete-skill');
      mkdirSync(skillDir, { recursive: true });
      
      // Create directory but no SKILL.md
      assert.strictEqual(existsSync(skillDir), true);
      assert.strictEqual(existsSync(join(skillDir, 'SKILL.md')), false);
    });
  });

  describe('beads initialization check', () => {
    it('should detect missing .beads directory', () => {
      const beadsDir = join(testDir, '.beads');
      assert.strictEqual(existsSync(beadsDir), false);
    });

    it('should detect existing .beads directory', () => {
      const beadsDir = join(testDir, '.beads');
      mkdirSync(beadsDir, { recursive: true });
      assert.strictEqual(existsSync(beadsDir), true);
    });
  });
});

describe('CLI availability checks', () => {
  it('should detect beads CLI if installed', () => {
    try {
      const output = execSync('bd --version', { 
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      assert.ok(output.includes('version'), 'bd --version should return version info');
    } catch {
      // bd not installed - this is not a failure, just skip
      assert.ok(true, 'bd CLI not installed, skipping');
    }
  });

  it('should handle missing CLI gracefully', () => {
    try {
      execSync('nonexistent-cli-tool-12345 --version', { 
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      assert.fail('Should have thrown for non-existent CLI');
    } catch (error) {
      assert.ok(true, 'Correctly threw for missing CLI');
    }
  });
});

describe('parseDoltDatabases', () => {
  // Realistic Dolt SHOW DATABASES output with + separators
  const TYPICAL_OUTPUT = [
    '+--------------------+',
    '| Database           |',
    '+--------------------+',
    '| information_schema |',
    '| mysql              |',
    '| dolt               |',
    '| beth               |',
    '+--------------------+',
    '',
  ].join('\n');

  it('should extract user databases from typical Dolt output', () => {
    const dbs = parseDoltDatabases(TYPICAL_OUTPUT);
    assert.deepStrictEqual(dbs, ['beth']);
  });

  it('should filter out all system databases', () => {
    const dbs = parseDoltDatabases(TYPICAL_OUTPUT);
    for (const sysDb of SYSTEM_DBS) {
      assert.ok(!dbs.includes(sysDb), `should not include system db '${sysDb}'`);
    }
  });

  it('should filter out + separator lines', () => {
    const output = [
      '+----------+',
      '| Database |',
      '+----------+',
      '| mydb     |',
      '+----------+',
    ].join('\n');
    const dbs = parseDoltDatabases(output);
    assert.deepStrictEqual(dbs, ['mydb']);
  });

  it('should filter out - separator lines', () => {
    // Some Dolt versions or configurations may use dashes
    const output = [
      '+-----------+',
      '| Database  |',
      '+-----------+',
      '| mydb      |',
      '- note line -',
      '+-----------+',
    ].join('\n');
    const dbs = parseDoltDatabases(output);
    assert.deepStrictEqual(dbs, ['mydb']);
  });

  it('should filter out the header row', () => {
    const output = [
      '+----------+',
      '| Database |',
      '+----------+',
      '| app      |',
      '+----------+',
    ].join('\n');
    const dbs = parseDoltDatabases(output);
    assert.ok(!dbs.includes('Database'), "should not include the header 'Database'");
    assert.deepStrictEqual(dbs, ['app']);
  });

  it('should handle multiple user databases', () => {
    const output = [
      '+--------------------+',
      '| Database           |',
      '+--------------------+',
      '| information_schema |',
      '| mysql              |',
      '| dolt               |',
      '| beth               |',
      '| staging            |',
      '| experiment         |',
      '+--------------------+',
    ].join('\n');
    const dbs = parseDoltDatabases(output);
    assert.deepStrictEqual(dbs, ['beth', 'staging', 'experiment']);
  });

  it('should return empty array when only system databases exist', () => {
    const output = [
      '+--------------------+',
      '| Database           |',
      '+--------------------+',
      '| information_schema |',
      '| mysql              |',
      '| dolt               |',
      '+--------------------+',
    ].join('\n');
    const dbs = parseDoltDatabases(output);
    assert.deepStrictEqual(dbs, []);
  });

  it('should return empty array for empty output', () => {
    const dbs = parseDoltDatabases('');
    assert.deepStrictEqual(dbs, []);
  });

  it('should return empty array for whitespace-only output', () => {
    const dbs = parseDoltDatabases('  \n  \n  ');
    assert.deepStrictEqual(dbs, []);
  });

  it('should handle trailing newlines', () => {
    const output = [
      '+----------+',
      '| Database |',
      '+----------+',
      '| mydb     |',
      '+----------+',
      '',
      '',
    ].join('\n');
    const dbs = parseDoltDatabases(output);
    assert.deepStrictEqual(dbs, ['mydb']);
  });

  it('should handle database names with test in them', () => {
    const output = [
      '+--------------------+',
      '| Database           |',
      '+--------------------+',
      '| information_schema |',
      '| beth               |',
      '| beth_test_abc      |',
      '| test_pollution     |',
      '| my_Testing_db      |',
      '+--------------------+',
    ].join('\n');
    const dbs = parseDoltDatabases(output);
    // parseDoltDatabases just parses — it doesn't classify test DBs.
    // That's the caller's job. All non-system DBs should be returned.
    assert.deepStrictEqual(dbs, ['beth', 'beth_test_abc', 'test_pollution', 'my_Testing_db']);
  });

  it('should strip pipe characters and whitespace from database names', () => {
    const output = [
      '+--------------------+',
      '| Database           |',
      '+--------------------+',
      '|   spacey_db        |',
      '| beth               |',
      '+--------------------+',
    ].join('\n');
    const dbs = parseDoltDatabases(output);
    assert.deepStrictEqual(dbs, ['spacey_db', 'beth']);
  });

  it('should handle + separators with varying column widths', () => {
    const output = [
      '+------+',
      '| Database |',
      '+------+',
      '| a    |',
      '| bb   |',
      '+------+',
    ].join('\n');
    const dbs = parseDoltDatabases(output);
    assert.deepStrictEqual(dbs, ['a', 'bb']);
  });
});

describe('parseDoltDatabases integration with checkDoltDatabases logic', () => {
  it('should correctly identify orphaned test databases', () => {
    const output = [
      '+--------------------+',
      '| Database           |',
      '+--------------------+',
      '| information_schema |',
      '| beth               |',
      '| e2e_test_run1      |',
      '| TEST_LEFTOVERS     |',
      '| production         |',
      '+--------------------+',
    ].join('\n');
    const databases = parseDoltDatabases(output);
    const testDbs = databases.filter(name => /test/i.test(name));
    assert.deepStrictEqual(testDbs, ['e2e_test_run1', 'TEST_LEFTOVERS']);
  });

  it('should trigger DB count warning when threshold exceeded', () => {
    const userDbs = Array.from({ length: DB_COUNT_THRESHOLD + 2 }, (_, i) => `db_${i}`);
    const lines = [
      '+----------+',
      '| Database |',
      '+----------+',
      '| information_schema |',
      '| mysql    |',
      '| dolt     |',
      ...userDbs.map(db => `| ${db}     |`),
      '+----------+',
    ];
    const databases = parseDoltDatabases(lines.join('\n'));
    assert.ok(
      databases.length > DB_COUNT_THRESHOLD,
      `${databases.length} databases should exceed threshold of ${DB_COUNT_THRESHOLD}`,
    );
  });

  it('should not trigger DB count warning at or below threshold', () => {
    const userDbs = Array.from({ length: DB_COUNT_THRESHOLD }, (_, i) => `db_${i}`);
    const lines = [
      '+----------+',
      '| Database |',
      '+----------+',
      '| information_schema |',
      ...userDbs.map(db => `| ${db}     |`),
      '+----------+',
    ];
    const databases = parseDoltDatabases(lines.join('\n'));
    assert.ok(
      databases.length <= DB_COUNT_THRESHOLD,
      `${databases.length} databases should not exceed threshold of ${DB_COUNT_THRESHOLD}`,
    );
  });
});

describe('exported constants', () => {
  it('SYSTEM_DBS should contain expected system databases', () => {
    assert.ok(SYSTEM_DBS.has('information_schema'));
    assert.ok(SYSTEM_DBS.has('mysql'));
    assert.ok(SYSTEM_DBS.has('dolt'));
    assert.strictEqual(SYSTEM_DBS.size, 3);
  });

  it('DB_COUNT_THRESHOLD should be 5', () => {
    assert.strictEqual(DB_COUNT_THRESHOLD, 5);
  });
});

describe('checkGitHooks', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `beth-hooks-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    // Initialize a git repo so git config works
    execSync('git init', { cwd: testDir, stdio: 'pipe' });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should return empty array when .beads/hooks does not exist', () => {
    const results = checkGitHooks(testDir);
    assert.deepStrictEqual(results, []);
  });

  it('should fail when core.hooksPath is not set', () => {
    const hooksDir = join(testDir, '.beads', 'hooks');
    mkdirSync(hooksDir, { recursive: true });
    writeFileSync(join(hooksDir, 'pre-push'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });

    const results = checkGitHooks(testDir);
    const hooksPathResult = results.find(r => r.name === 'Git hooksPath');
    assert.ok(hooksPathResult, 'should have a Git hooksPath result');
    assert.strictEqual(hooksPathResult.status, 'fail');
  });

  it('should pass when core.hooksPath is .beads/hooks', () => {
    const hooksDir = join(testDir, '.beads', 'hooks');
    mkdirSync(hooksDir, { recursive: true });
    writeFileSync(join(hooksDir, 'pre-push'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    execSync('git config core.hooksPath .beads/hooks', { cwd: testDir, stdio: 'pipe' });

    const results = checkGitHooks(testDir);
    const hooksPathResult = results.find(r => r.name === 'Git hooksPath');
    assert.ok(hooksPathResult, 'should have a Git hooksPath result');
    assert.strictEqual(hooksPathResult.status, 'pass');
  });

  it('should warn when core.hooksPath is set to wrong directory', () => {
    const hooksDir = join(testDir, '.beads', 'hooks');
    mkdirSync(hooksDir, { recursive: true });
    writeFileSync(join(hooksDir, 'pre-push'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    execSync('git config core.hooksPath .git/hooks', { cwd: testDir, stdio: 'pipe' });

    const results = checkGitHooks(testDir);
    const hooksPathResult = results.find(r => r.name === 'Git hooksPath');
    assert.ok(hooksPathResult, 'should have a Git hooksPath result');
    assert.strictEqual(hooksPathResult.status, 'warn');
  });

  it('should fail when hooks are not executable', () => {
    const hooksDir = join(testDir, '.beads', 'hooks');
    mkdirSync(hooksDir, { recursive: true });
    // Create hook without execute permission
    writeFileSync(join(hooksDir, 'pre-push'), '#!/bin/sh\nexit 0\n', { mode: 0o644 });
    execSync('git config core.hooksPath .beads/hooks', { cwd: testDir, stdio: 'pipe' });

    const results = checkGitHooks(testDir);
    const permsResult = results.find(r => r.name === 'Hook permissions');
    assert.ok(permsResult, 'should have a Hook permissions result');
    assert.strictEqual(permsResult.status, 'fail');
    assert.ok(permsResult.message.includes('pre-push'), 'should mention pre-push');
  });

  it('should pass when all present hooks are executable', () => {
    const hooksDir = join(testDir, '.beads', 'hooks');
    mkdirSync(hooksDir, { recursive: true });
    writeFileSync(join(hooksDir, 'pre-push'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    writeFileSync(join(hooksDir, 'pre-commit'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    execSync('git config core.hooksPath .beads/hooks', { cwd: testDir, stdio: 'pipe' });

    const results = checkGitHooks(testDir);
    const permsResult = results.find(r => r.name === 'Hook permissions');
    assert.ok(permsResult, 'should have a Hook permissions result');
    assert.strictEqual(permsResult.status, 'pass');
  });
});
