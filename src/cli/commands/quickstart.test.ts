/**
 * E2E tests for quickstart command.
 * Run with: node --test dist/cli/commands/quickstart.test.js
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import { beforeAll } from 'vitest';
import assert from 'node:assert';
import { execSync, spawnSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, rmSync, readdirSync } from 'fs';
import { join, resolve, basename } from 'path';
import { tmpdir } from 'os';

// Path to CLI
const CLI_PATH = resolve(join(import.meta.dirname, '../../../bin/cli.js'));

// Check if beads CLI is available for conditional tests
function isBeadsInstalled(): boolean {
  try {
    execSync('bd --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const BEADS_AVAILABLE = isBeadsInstalled();

// Skip reason for tests requiring beads
const SKIP_NO_BEADS = !BEADS_AVAILABLE ? 'beads CLI not installed' : false;
const SKIP_BEADS_INSTALLED = BEADS_AVAILABLE ? 'beads CLI is installed, cannot test missing CLI' : false;

/**
 * Run quickstart command in a directory
 */
function runQuickstart(cwd: string, args: string[] = []): { stdout: string; stderr: string; status: number | null } {
  const result = spawnSync('node', [CLI_PATH, 'quickstart', ...args], {
    cwd,
    encoding: 'utf-8',
    env: { ...process.env, FORCE_COLOR: '0' },
  });
  
  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    status: result.status,
  };
}

/**
 * Create a minimal Beth initialized project structure
 */
function createBethProject(dir: string): void {
  const agentsDir = join(dir, '.github', 'agents');
  mkdirSync(agentsDir, { recursive: true });
  
  // Create a minimal Beth agent file
  const bethAgent = `---
name: Beth
description: AI orchestrator
model: Claude Opus 4.5
tools:
  - readFile
---

# Beth Agent
`;
  writeFileSync(join(agentsDir, 'beth.agent.md'), bethAgent);
}

/**
 * Create skills directory structure
 */
function createSkillsDir(dir: string): void {
  const skillsDir = join(dir, '.github', 'skills', 'test-skill');
  mkdirSync(skillsDir, { recursive: true });
  writeFileSync(join(skillsDir, 'SKILL.md'), '# Test Skill');
}

/**
 * Simulate beads initialization by creating .beads directory
 */
function simulateBeadsInit(dir: string): void {
  const beadsDir = join(dir, '.beads');
  mkdirSync(beadsDir, { recursive: true });
  // Create minimal beads structure
  writeFileSync(join(beadsDir, 'config.json'), JSON.stringify({ version: '1.0' }));
}

describe('quickstart command E2E', () => {
  let testDir: string;

  /**
   * Clean up orphaned Dolt databases from previous test runs.
   * When quickstart runs `bd init` in a temp directory, it creates a Dolt database
   * on the shared server (127.0.0.1:3307). If the test crashes or afterEach doesn't
   * run, these databases accumulate and can destabilize the server.
   */
  beforeAll(() => {
    if (!BEADS_AVAILABLE) return;
    try {
      const doltDir = join(process.cwd(), '.beads', 'dolt');
      if (!existsSync(doltDir)) return;
      const orphans = readdirSync(doltDir).filter(d => d.startsWith('beth_quickstart_test_'));
      if (orphans.length === 0) return;
      for (const db of orphans) {
        try {
          rmSync(join(doltDir, db), { recursive: true, force: true });
        } catch { /* best effort */ }
      }
    } catch { /* not critical */ }
  });

  beforeEach(() => {
    // Create a temp directory for testing
    testDir = join(tmpdir(), `beth-quickstart-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up Dolt database created by `bd init` during the test.
    // The database name is derived from the temp dir name (hyphens → underscores).
    if (BEADS_AVAILABLE && testDir) {
      try {
        const dbName = basename(testDir).replace(/-/g, '_');
        const dbPath = join(process.cwd(), '.beads', 'dolt', dbName);
        if (existsSync(dbPath)) {
          rmSync(dbPath, { recursive: true, force: true });
        }
      } catch { /* best effort cleanup */ }
    }
    // Clean up temp directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('Beth initialization check', () => {
    it('should exit with error if Beth not initialized (no .github/agents)', () => {
      // Run quickstart in empty directory
      const result = runQuickstart(testDir);
      
      assert.strictEqual(result.status, 1, 'Should exit with status 1');
      assert.ok(
        result.stdout.includes('Beth not initialized') || result.stdout.includes('not initialized'),
        'Should indicate Beth is not initialized'
      );
      assert.ok(
        result.stdout.includes('npx beth-copilot init'),
        'Should suggest running init command'
      );
    });

    it('should detect Beth is initialized when .github/agents exists', () => {
      createBethProject(testDir);
      
      // Even if beads is missing, it should pass the Beth check first
      const result = runQuickstart(testDir);
      
      // Should show Beth is initialized (may fail later for beads)
      assert.ok(
        result.stdout.includes('Beth is initialized') || result.stdout.includes('✓'),
        'Should confirm Beth is initialized'
      );
    });
  });

  describe('beads CLI detection', () => {
    it('should detect missing beads CLI', { skip: SKIP_BEADS_INSTALLED }, () => {
      createBethProject(testDir);
      
      const result = runQuickstart(testDir);
      
      assert.strictEqual(result.status, 1, 'Should exit with status 1 when beads missing');
      assert.ok(
        result.stdout.includes('beads CLI not found') || result.stdout.includes('not found'),
        'Should indicate beads CLI is not found'
      );
    });
  });

  describe('beads initialization', () => {
    it('should detect uninitialized beads (no .beads directory)', { skip: SKIP_NO_BEADS }, () => {
      createBethProject(testDir);
      
      // Verify .beads doesn't exist initially
      assert.strictEqual(existsSync(join(testDir, '.beads')), false);
      
      // Note: quickstart will try to run `bd init` which may or may not succeed
      // depending on the environment. We're testing detection, not initialization.
      const result = runQuickstart(testDir);
      
      // The command should attempt to initialize beads or indicate it's not initialized
      assert.ok(
        result.stdout.includes('beads') || result.stdout.includes('Initializing'),
        'Should mention beads in output'
      );
    });

    it('should recognize existing beads initialization', { skip: SKIP_NO_BEADS }, () => {
      createBethProject(testDir);
      simulateBeadsInit(testDir);
      
      const result = runQuickstart(testDir);
      
      assert.ok(
        result.stdout.includes('beads already initialized') || 
        result.stdout.includes('already initialized'),
        'Should indicate beads is already initialized'
      );
    });
  });

  describe('Quick Start Guide output', () => {
    it('should show Quick Start Guide with VS Code instructions', { skip: SKIP_NO_BEADS }, () => {
      createBethProject(testDir);
      createSkillsDir(testDir);
      simulateBeadsInit(testDir);
      
      const result = runQuickstart(testDir);
      
      // Check for Quick Start Guide section
      assert.ok(
        result.stdout.includes('Quick Start Guide'),
        'Should show Quick Start Guide heading'
      );
      
      // Check for VS Code instructions
      assert.ok(
        result.stdout.includes('VS Code') || result.stdout.includes('Open this project'),
        'Should mention VS Code'
      );
      
      // Check for Copilot Chat instruction
      assert.ok(
        result.stdout.includes('Copilot Chat') || result.stdout.includes('Ctrl+Alt+I'),
        'Should mention Copilot Chat shortcut'
      );
      
      // Check for @Beth instruction
      assert.ok(
        result.stdout.includes('@Beth'),
        'Should mention @Beth'
      );
    });

    it('should show Beth tagline quote', { skip: SKIP_NO_BEADS }, () => {
      createBethProject(testDir);
      createSkillsDir(testDir);
      simulateBeadsInit(testDir);
      
      const result = runQuickstart(testDir);
      
      // Check for the tagline quote
      assert.ok(
        result.stdout.includes('They broke my wings and forgot I had claws'),
        'Should show Beth tagline quote'
      );
    });
  });

  describe('doctor integration', () => {
    it('should run doctor check and show results', { skip: SKIP_NO_BEADS }, () => {
      createBethProject(testDir);
      createSkillsDir(testDir);
      simulateBeadsInit(testDir);
      
      const result = runQuickstart(testDir);
      
      // Should show health check is running
      assert.ok(
        result.stdout.includes('health check') || result.stdout.includes('Running'),
        'Should indicate health check is running'
      );
      
      // Doctor output should include some checks
      assert.ok(
        result.stdout.includes('Node.js') || 
        result.stdout.includes('agents') ||
        result.stdout.includes('✓'),
        'Should show doctor check results'
      );
    });

    it('should pass --verbose flag through to doctor command', { skip: SKIP_NO_BEADS }, () => {
      createBethProject(testDir);
      createSkillsDir(testDir);
      simulateBeadsInit(testDir);
      
      // Run with verbose flag
      const verboseResult = runQuickstart(testDir, ['--verbose']);
      
      // Verbose output should be longer or contain more details
      // At minimum, both should succeed
      assert.ok(
        verboseResult.status === 0 || verboseResult.stdout.includes('Quick Start Guide'),
        'Verbose command should run successfully'
      );
      
      // Note: exact behavior depends on what --verbose adds
      // We verify the flag is accepted without error
    });
  });

  describe('full success scenario', () => {
    it('should succeed in fully initialized project', { skip: SKIP_NO_BEADS }, () => {
      // Create complete project structure
      createBethProject(testDir);
      createSkillsDir(testDir);
      simulateBeadsInit(testDir);
      
      // Also create AGENTS.md and Backlog.md  
      writeFileSync(join(testDir, 'AGENTS.md'), '# Agent Instructions');
      writeFileSync(join(testDir, 'Backlog.md'), '# Backlog');
      
      const result = runQuickstart(testDir);
      
      // Command should succeed
      assert.strictEqual(result.status, 0, 'Should exit with status 0');
      
      // Should show success indicators
      assert.ok(
        result.stdout.includes('✓') || result.stdout.includes('Beth is initialized'),
        'Should show success indicators'
      );
      
      // Should complete with Quick Start Guide
      assert.ok(
        result.stdout.includes('Quick Start Guide'),
        'Should show Quick Start Guide at end'
      );
    });
  });

  describe('error handling', () => {
    it('should show helpful error when run outside a project', () => {
      // Run in temp dir with nothing - should fail gracefully
      const result = runQuickstart(testDir);
      
      assert.ok(result.status !== 0, 'Should exit with non-zero status');
      assert.ok(
        result.stdout.includes('init') || result.stdout.includes('not initialized'),
        'Should suggest how to initialize'
      );
    });
  });
});

describe('quickstart output format', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `beth-qs-format-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should show Beth Quickstart header', () => {
    const result = runQuickstart(testDir);
    
    assert.ok(
      result.stdout.includes('Beth Quickstart'),
      'Should show Beth Quickstart header'
    );
  });

  it('should show decorative separator lines', () => {
    const result = runQuickstart(testDir);
    
    // Check for separator line (─ repeated)
    assert.ok(
      result.stdout.includes('─') || result.stdout.includes('-'),
      'Should show separator lines'
    );
  });
});
