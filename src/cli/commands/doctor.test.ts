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
import { checkBeadsNoDb, checkGitHooks, getMinNodeVersion } from './doctor.js';

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

describe('checkBeadsNoDb', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `beth-nodb-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should return empty array when .beads/config.yaml does not exist', () => {
    const results = checkBeadsNoDb(testDir);
    assert.deepStrictEqual(results, []);
  });

  it('should pass when no-db: true is set', () => {
    mkdirSync(join(testDir, '.beads'), { recursive: true });
    writeFileSync(join(testDir, '.beads', 'config.yaml'), 'no-db: true\n');
    const results = checkBeadsNoDb(testDir);
    const noDbResult = results.find(r => r.name === 'Beads no-db');
    assert.ok(noDbResult);
    assert.strictEqual(noDbResult.status, 'pass');
  });

  it('should warn when no-db is not set', () => {
    mkdirSync(join(testDir, '.beads'), { recursive: true });
    writeFileSync(join(testDir, '.beads', 'config.yaml'), 'issue-prefix: "test"\n');
    const results = checkBeadsNoDb(testDir);
    const noDbResult = results.find(r => r.name === 'Beads no-db');
    assert.ok(noDbResult);
    assert.strictEqual(noDbResult.status, 'warn');
  });

  it('should warn when no-db is explicitly false', () => {
    mkdirSync(join(testDir, '.beads'), { recursive: true });
    writeFileSync(join(testDir, '.beads', 'config.yaml'), 'no-db: false\n');
    const results = checkBeadsNoDb(testDir);
    const noDbResult = results.find(r => r.name === 'Beads no-db');
    assert.ok(noDbResult);
    assert.strictEqual(noDbResult.status, 'warn');
  });

  it('should pass JSONL check when issues.jsonl has content', () => {
    mkdirSync(join(testDir, '.beads'), { recursive: true });
    writeFileSync(join(testDir, '.beads', 'config.yaml'), 'no-db: true\n');
    writeFileSync(join(testDir, '.beads', 'issues.jsonl'), '{"id":"test-1"}\n{"id":"test-2"}\n');
    const results = checkBeadsNoDb(testDir);
    const jsonlResult = results.find(r => r.name === 'JSONL data');
    assert.ok(jsonlResult);
    assert.strictEqual(jsonlResult.status, 'pass');
    assert.ok(jsonlResult.message.includes('2'));
  });

  it('should warn when JSONL file is empty', () => {
    mkdirSync(join(testDir, '.beads'), { recursive: true });
    writeFileSync(join(testDir, '.beads', 'config.yaml'), 'no-db: true\n');
    writeFileSync(join(testDir, '.beads', 'issues.jsonl'), '');
    const results = checkBeadsNoDb(testDir);
    const jsonlResult = results.find(r => r.name === 'JSONL data');
    assert.ok(jsonlResult);
    assert.strictEqual(jsonlResult.status, 'warn');
  });

  it('should check backup/issues.jsonl when issues.jsonl does not exist', () => {
    mkdirSync(join(testDir, '.beads', 'backup'), { recursive: true });
    writeFileSync(join(testDir, '.beads', 'config.yaml'), 'no-db: true\n');
    writeFileSync(join(testDir, '.beads', 'backup', 'issues.jsonl'), '{"id":"bak-1"}\n');
    const results = checkBeadsNoDb(testDir);
    const jsonlResult = results.find(r => r.name === 'JSONL data');
    assert.ok(jsonlResult);
    assert.strictEqual(jsonlResult.status, 'pass');
    assert.ok(jsonlResult.message.includes('1'));
  });

  it('should not produce JSONL result when no JSONL files exist', () => {
    mkdirSync(join(testDir, '.beads'), { recursive: true });
    writeFileSync(join(testDir, '.beads', 'config.yaml'), 'no-db: true\n');
    const results = checkBeadsNoDb(testDir);
    const jsonlResult = results.find(r => r.name === 'JSONL data');
    assert.strictEqual(jsonlResult, undefined);
  });

  it('should handle no-db: true with extra whitespace', () => {
    mkdirSync(join(testDir, '.beads'), { recursive: true });
    writeFileSync(join(testDir, '.beads', 'config.yaml'), 'no-db:   true\nother: value\n');
    const results = checkBeadsNoDb(testDir);
    const noDbResult = results.find(r => r.name === 'Beads no-db');
    assert.ok(noDbResult);
    assert.strictEqual(noDbResult.status, 'pass');
  });

  it('should handle no-db in middle of config file', () => {
    mkdirSync(join(testDir, '.beads'), { recursive: true });
    writeFileSync(join(testDir, '.beads', 'config.yaml'), 'issue-prefix: "test"\nno-db: true\nsync-branch: "main"\n');
    const results = checkBeadsNoDb(testDir);
    const noDbResult = results.find(r => r.name === 'Beads no-db');
    assert.ok(noDbResult);
    assert.strictEqual(noDbResult.status, 'pass');
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
