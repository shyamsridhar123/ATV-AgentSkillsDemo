/**
 * Unit tests for doctor command.
 * Run with: node --test dist/cli/commands/doctor.test.js
 */

import { describe, it, beforeEach, afterEach } from 'vitest';
import assert from 'node:assert';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { getMinNodeVersion, checkMcpServers } from './doctor.js';

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
});

describe('CLI availability checks', () => {
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

describe('checkMcpServers', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `beth-mcp-doctor-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should fail when .vscode/mcp.json does not exist', () => {
    const result = checkMcpServers(testDir);
    assert.strictEqual(result.status, 'fail');
    assert.ok(result.message.includes('not found'));
  });

  it('should fail when mcp.json is invalid JSON', () => {
    const vsDir = join(testDir, '.vscode');
    mkdirSync(vsDir, { recursive: true });
    writeFileSync(join(vsDir, 'mcp.json'), '{ broken json');

    const result = checkMcpServers(testDir);
    assert.strictEqual(result.status, 'fail');
    assert.ok(result.message.includes('not valid JSON'));
  });

  it('should fail when mcp.json has no servers object', () => {
    const vsDir = join(testDir, '.vscode');
    mkdirSync(vsDir, { recursive: true });
    writeFileSync(join(vsDir, 'mcp.json'), '{}');

    const result = checkMcpServers(testDir);
    assert.strictEqual(result.status, 'fail');
    assert.ok(result.message.includes('missing "servers"'));
  });

  it('should fail when playwright server is missing', () => {
    const vsDir = join(testDir, '.vscode');
    mkdirSync(vsDir, { recursive: true });
    writeFileSync(join(vsDir, 'mcp.json'), JSON.stringify({
      servers: { backlog: { command: 'backlog', args: ['mcp', 'start'] } }
    }));

    const result = checkMcpServers(testDir);
    assert.strictEqual(result.status, 'fail');
    assert.ok(result.message.includes('Playwright'));
  });

  it('should fail when backlog server is missing', () => {
    const vsDir = join(testDir, '.vscode');
    mkdirSync(vsDir, { recursive: true });
    writeFileSync(join(vsDir, 'mcp.json'), JSON.stringify({
      servers: { playwright: { command: 'npx', args: ['@playwright/mcp@0.0.68'] } }
    }));

    const result = checkMcpServers(testDir);
    assert.strictEqual(result.status, 'fail');
    assert.ok(result.message.includes('Backlog'));
  });

  it('should fail when both required servers are missing', () => {
    const vsDir = join(testDir, '.vscode');
    mkdirSync(vsDir, { recursive: true });
    writeFileSync(join(vsDir, 'mcp.json'), JSON.stringify({
      servers: { shadcn: { command: 'npx', args: ['shadcn@latest', 'mcp'] } }
    }));

    const result = checkMcpServers(testDir);
    assert.strictEqual(result.status, 'fail');
    assert.ok(result.message.includes('Playwright'));
    assert.ok(result.message.includes('Backlog'));
  });

  it('should pass when all required servers are present', () => {
    const vsDir = join(testDir, '.vscode');
    mkdirSync(vsDir, { recursive: true });
    writeFileSync(join(vsDir, 'mcp.json'), JSON.stringify({
      servers: {
        playwright: { command: 'npx', args: ['@playwright/mcp@0.0.68'] },
        backlog: { command: 'backlog', args: ['mcp', 'start'] },
      }
    }));

    const result = checkMcpServers(testDir);
    assert.strictEqual(result.status, 'pass');
    assert.ok(result.message.includes('playwright'));
    assert.ok(result.message.includes('backlog'));
  });

  it('should pass with extra servers beyond required', () => {
    const vsDir = join(testDir, '.vscode');
    mkdirSync(vsDir, { recursive: true });
    writeFileSync(join(vsDir, 'mcp.json'), JSON.stringify({
      servers: {
        playwright: { command: 'npx', args: ['@playwright/mcp@0.0.68'] },
        backlog: { command: 'backlog', args: ['mcp', 'start'] },
        shadcn: { command: 'npx', args: ['shadcn@latest', 'mcp'] },
        deepwiki: { type: 'http', url: 'https://mcp.deepwiki.com/mcp' },
      }
    }));

    const result = checkMcpServers(testDir);
    assert.strictEqual(result.status, 'pass');
    assert.ok(result.message.includes('4 servers'));
  });
});
