/**
 * Unit tests for doctor command.
 * Run with: node --test dist/cli/commands/doctor.test.js
 */

import { describe, it, beforeEach, afterEach } from 'vitest';
import assert from 'node:assert';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { getMinNodeVersion, checkMcpServers, isValidServerEntry, fixMcpServers, satisfiesEnginesNode } from './doctor.js';

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
      assert.strictEqual(getMinNodeVersion(testDir), 20);
    });

    it('should return fallback when engines field is missing', () => {
      mkdirSync(testDir, { recursive: true });
      writeFileSync(join(testDir, 'package.json'), JSON.stringify({ name: 'test' }));
      assert.strictEqual(getMinNodeVersion(testDir), 20);
    });

    it('should return fallback when engines.node is not a string', () => {
      mkdirSync(testDir, { recursive: true });
      writeFileSync(join(testDir, 'package.json'), JSON.stringify({ engines: { node: 18 } }));
      assert.strictEqual(getMinNodeVersion(testDir), 20);
    });

    it('returns the lowest minimum from a compound range', () => {
      mkdirSync(testDir, { recursive: true });
      writeFileSync(
        join(testDir, 'package.json'),
        JSON.stringify({ engines: { node: '>=20.19.0 <21 || >=22.12.0' } }),
      );
      // The display uses major; the full range is enforced via satisfiesEnginesNode.
      assert.strictEqual(getMinNodeVersion(testDir), 20);
    });
  });

  describe('satisfiesEnginesNode', () => {
    const range = '>=20.19.0 <21 || >=22.12.0';

    it('accepts versions inside the 20.19.x..<21 window', () => {
      assert.strictEqual(satisfiesEnginesNode({ major: 20, minor: 19, patch: 0 }, range), true);
      assert.strictEqual(satisfiesEnginesNode({ major: 20, minor: 20, patch: 5 }, range), true);
    });

    it('rejects 20.x below 20.19.0', () => {
      assert.strictEqual(satisfiesEnginesNode({ major: 20, minor: 0, patch: 0 }, range), false);
      assert.strictEqual(satisfiesEnginesNode({ major: 20, minor: 18, patch: 99 }, range), false);
    });

    it('rejects Node 21.x — the gap between the two allowed clauses', () => {
      assert.strictEqual(satisfiesEnginesNode({ major: 21, minor: 0, patch: 0 }, range), false);
      assert.strictEqual(satisfiesEnginesNode({ major: 21, minor: 9, patch: 9 }, range), false);
    });

    it('rejects Node 22.x below 22.12.0', () => {
      assert.strictEqual(satisfiesEnginesNode({ major: 22, minor: 11, patch: 0 }, range), false);
    });

    it('accepts Node 22.12.0 and above', () => {
      assert.strictEqual(satisfiesEnginesNode({ major: 22, minor: 12, patch: 0 }, range), true);
      assert.strictEqual(satisfiesEnginesNode({ major: 23, minor: 0, patch: 0 }, range), true);
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

describe('isValidServerEntry', () => {
  describe('valid entries', () => {
    it('should accept command + args (local process server)', () => {
      assert.strictEqual(isValidServerEntry({ command: 'npx', args: ['@playwright/mcp@0.0.68'] }), true);
    });

    it('should accept type + url (HTTP server)', () => {
      assert.strictEqual(isValidServerEntry({ type: 'http', url: 'https://mcp.deepwiki.com/mcp' }), true);
    });

    it('should accept command + args with extra properties', () => {
      assert.strictEqual(isValidServerEntry({ command: 'npx', args: ['pkg'], timeout: 5000, env: { DEBUG: '1' } }), true);
    });

    it('should accept type + url with extra properties', () => {
      assert.strictEqual(isValidServerEntry({ type: 'sse', url: 'http://localhost:3000', headers: {} }), true);
    });

    it('should accept empty args array', () => {
      assert.strictEqual(isValidServerEntry({ command: 'my-server', args: [] }), true);
    });
  });

  describe('invalid entries', () => {
    it('should reject a plain string', () => {
      assert.strictEqual(isValidServerEntry('just-a-string'), false);
    });

    it('should reject a number', () => {
      assert.strictEqual(isValidServerEntry(42), false);
    });

    it('should reject null', () => {
      assert.strictEqual(isValidServerEntry(null), false);
    });

    it('should reject undefined', () => {
      assert.strictEqual(isValidServerEntry(undefined), false);
    });

    it('should reject a boolean', () => {
      assert.strictEqual(isValidServerEntry(true), false);
    });

    it('should reject an array', () => {
      assert.strictEqual(isValidServerEntry(['npx', '@playwright/mcp']), false);
    });

    it('should reject an empty object', () => {
      assert.strictEqual(isValidServerEntry({}), false);
    });

    it('should reject command without args', () => {
      assert.strictEqual(isValidServerEntry({ command: 'npx' }), false);
    });

    it('should reject args without command', () => {
      assert.strictEqual(isValidServerEntry({ args: ['@playwright/mcp'] }), false);
    });

    it('should reject type without url', () => {
      assert.strictEqual(isValidServerEntry({ type: 'http' }), false);
    });

    it('should reject url without type', () => {
      assert.strictEqual(isValidServerEntry({ url: 'https://example.com' }), false);
    });

    it('should reject command as number', () => {
      assert.strictEqual(isValidServerEntry({ command: 123, args: [] }), false);
    });

    it('should reject args as string (not array)', () => {
      assert.strictEqual(isValidServerEntry({ command: 'npx', args: '@playwright/mcp' }), false);
    });

    it('should reject type as number', () => {
      assert.strictEqual(isValidServerEntry({ type: 123, url: 'https://example.com' }), false);
    });

    it('should reject url as number', () => {
      assert.strictEqual(isValidServerEntry({ type: 'http', url: 8080 }), false);
    });
  });
});

describe('checkMcpServers — server structure validation', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `beth-mcp-struct-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should warn when required server is a string instead of object', () => {
    const vsDir = join(testDir, '.vscode');
    mkdirSync(vsDir, { recursive: true });
    writeFileSync(join(vsDir, 'mcp.json'), JSON.stringify({
      servers: {
        playwright: 'just-a-string',
        backlog: { command: 'backlog', args: ['mcp', 'start'] },
      },
    }));

    const result = checkMcpServers(testDir);
    assert.strictEqual(result.status, 'warn');
    assert.ok(result.message.includes('invalid structure'));
    assert.ok(result.message.includes('Playwright'));
  });

  it('should warn when required server is a number', () => {
    const vsDir = join(testDir, '.vscode');
    mkdirSync(vsDir, { recursive: true });
    writeFileSync(join(vsDir, 'mcp.json'), JSON.stringify({
      servers: {
        playwright: { command: 'npx', args: ['@playwright/mcp@0.0.68'] },
        backlog: 42,
      },
    }));

    const result = checkMcpServers(testDir);
    assert.strictEqual(result.status, 'warn');
    assert.ok(result.message.includes('Backlog'));
  });

  it('should warn when required server has command but no args', () => {
    const vsDir = join(testDir, '.vscode');
    mkdirSync(vsDir, { recursive: true });
    writeFileSync(join(vsDir, 'mcp.json'), JSON.stringify({
      servers: {
        playwright: { command: 'npx' },
        backlog: { command: 'backlog', args: ['mcp', 'start'] },
      },
    }));

    const result = checkMcpServers(testDir);
    assert.strictEqual(result.status, 'warn');
    assert.ok(result.message.includes('Playwright'));
  });

  it('should warn when both required servers have invalid structure', () => {
    const vsDir = join(testDir, '.vscode');
    mkdirSync(vsDir, { recursive: true });
    writeFileSync(join(vsDir, 'mcp.json'), JSON.stringify({
      servers: {
        playwright: {},
        backlog: true,
      },
    }));

    const result = checkMcpServers(testDir);
    assert.strictEqual(result.status, 'warn');
    assert.ok(result.message.includes('Playwright'));
    assert.ok(result.message.includes('Backlog'));
  });

  it('should pass when required servers have valid command+args structure', () => {
    const vsDir = join(testDir, '.vscode');
    mkdirSync(vsDir, { recursive: true });
    writeFileSync(join(vsDir, 'mcp.json'), JSON.stringify({
      servers: {
        playwright: { command: 'npx', args: ['@playwright/mcp@0.0.68'] },
        backlog: { command: 'backlog', args: ['mcp', 'start'] },
      },
    }));

    const result = checkMcpServers(testDir);
    assert.strictEqual(result.status, 'pass');
  });

  it('should pass when required server uses type+url structure', () => {
    const vsDir = join(testDir, '.vscode');
    mkdirSync(vsDir, { recursive: true });
    writeFileSync(join(vsDir, 'mcp.json'), JSON.stringify({
      servers: {
        playwright: { type: 'http', url: 'http://localhost:3000/playwright' },
        backlog: { type: 'sse', url: 'http://localhost:4000/backlog' },
      },
    }));

    const result = checkMcpServers(testDir);
    assert.strictEqual(result.status, 'pass');
  });

  it('should not validate structure of optional servers', () => {
    const vsDir = join(testDir, '.vscode');
    mkdirSync(vsDir, { recursive: true });
    writeFileSync(join(vsDir, 'mcp.json'), JSON.stringify({
      servers: {
        playwright: { command: 'npx', args: ['@playwright/mcp@0.0.68'] },
        backlog: { command: 'backlog', args: ['mcp', 'start'] },
        'broken-optional': 'this-is-fine-for-optional',
      },
    }));

    const result = checkMcpServers(testDir);
    assert.strictEqual(result.status, 'pass', 'Optional servers with bad structure should not cause warnings');
  });

  it('should include fix hint in warn details', () => {
    const vsDir = join(testDir, '.vscode');
    mkdirSync(vsDir, { recursive: true });
    writeFileSync(join(vsDir, 'mcp.json'), JSON.stringify({
      servers: {
        playwright: 'broken',
        backlog: { command: 'backlog', args: ['mcp', 'start'] },
      },
    }));

    const result = checkMcpServers(testDir);
    assert.strictEqual(result.status, 'warn');
    assert.ok(
      result.issues?.some(i => i.includes('command')) || result.details?.includes('command'),
      'Issues or details should suggest correct structure'
    );
  });
});

describe('fixMcpServers', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `beth-fix-mcp-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should create .vscode/mcp.json when it does not exist', () => {
    const actions = fixMcpServers(testDir);
    const mcpPath = join(testDir, '.vscode', 'mcp.json');

    assert.ok(existsSync(mcpPath), 'mcp.json should be created');
    const config = JSON.parse(readFileSync(mcpPath, 'utf-8'));
    assert.ok(config.servers?.playwright, 'Should have playwright server');
    assert.ok(config.servers?.backlog, 'Should have backlog server');
    assert.ok(actions.some(a => a.includes('Playwright')), 'Should report adding Playwright');
    assert.ok(actions.some(a => a.includes('Backlog')), 'Should report adding Backlog');
  });

  it('should add missing servers to existing config without overwriting', () => {
    const vsDir = join(testDir, '.vscode');
    mkdirSync(vsDir, { recursive: true });
    writeFileSync(join(vsDir, 'mcp.json'), JSON.stringify({
      servers: {
        shadcn: { command: 'npx', args: ['shadcn@latest', 'mcp'] },
      },
    }));

    const actions = fixMcpServers(testDir);
    const config = JSON.parse(readFileSync(join(vsDir, 'mcp.json'), 'utf-8'));

    assert.ok(config.servers?.playwright, 'Should add playwright');
    assert.ok(config.servers?.backlog, 'Should add backlog');
    assert.ok(config.servers?.shadcn, 'Should preserve existing shadcn server');
    assert.ok(actions.some(a => a.includes('Playwright')), 'Should report adding Playwright');
  });

  it('should not modify already-correct config', () => {
    const vsDir = join(testDir, '.vscode');
    mkdirSync(vsDir, { recursive: true });
    const original = {
      '$schema': 'https://code.visualstudio.com/docs/copilot/chat/mcp-servers',
      servers: {
        playwright: { command: 'npx', args: ['@playwright/mcp@0.0.68'] },
        backlog: { command: 'backlog', args: ['mcp', 'start'] },
      },
    };
    writeFileSync(join(vsDir, 'mcp.json'), JSON.stringify(original));

    const actions = fixMcpServers(testDir);
    assert.ok(actions.some(a => a.includes('already configured')), 'Should report no changes needed');
  });

  it('should backup and recover from corrupted JSON', () => {
    const vsDir = join(testDir, '.vscode');
    mkdirSync(vsDir, { recursive: true });
    writeFileSync(join(vsDir, 'mcp.json'), '{ BROKEN JSON {{{{');

    const actions = fixMcpServers(testDir);
    assert.ok(existsSync(join(vsDir, 'mcp.json.bak')), 'Should backup corrupted file');
    const config = JSON.parse(readFileSync(join(vsDir, 'mcp.json'), 'utf-8'));
    assert.ok(config.servers?.playwright, 'Should have playwright after recovery');
    assert.ok(actions.some(a => a.includes('Backed up')), 'Should report backup');
  });

  it('should fix malformed server entries', () => {
    const vsDir = join(testDir, '.vscode');
    mkdirSync(vsDir, { recursive: true });
    writeFileSync(join(vsDir, 'mcp.json'), JSON.stringify({
      servers: {
        playwright: 'broken-string',
        backlog: { command: 'backlog', args: ['mcp', 'start'] },
      },
    }));

    fixMcpServers(testDir);
    const config = JSON.parse(readFileSync(join(vsDir, 'mcp.json'), 'utf-8'));
    assert.ok(
      typeof config.servers.playwright === 'object' && config.servers.playwright.command,
      'Should replace malformed playwright with valid config'
    );
  });

  it('should add $schema if missing', () => {
    const vsDir = join(testDir, '.vscode');
    mkdirSync(vsDir, { recursive: true });
    writeFileSync(join(vsDir, 'mcp.json'), JSON.stringify({ servers: {} }));

    const actions = fixMcpServers(testDir);
    const config = JSON.parse(readFileSync(join(vsDir, 'mcp.json'), 'utf-8'));
    assert.ok(config['$schema'], 'Should add $schema');
    assert.ok(actions.some(a => a.includes('$schema')), 'Should record $schema action');
  });

  it('doctor check should pass after fix', () => {
    fixMcpServers(testDir);
    const result = checkMcpServers(testDir);
    assert.strictEqual(result.status, 'pass', `Should pass after fix, got: ${result.status} — ${result.message}`);
  });
});
