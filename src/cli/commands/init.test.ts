/**
 * E2E tests for init command.
 * Run with: node --test dist/cli/commands/init.test.js
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Expected files and directories from templates
const EXPECTED_AGENTS = [
  'beth.agent.md',
  'developer.agent.md',
  'product-manager.agent.md',
  'researcher.agent.md',
  'security-reviewer.agent.md',
  'tester.agent.md',
  'ux-designer.agent.md',
];

const EXPECTED_SKILLS = [
  'framer-components',
  'prd',
  'security-analysis',
  'shadcn-ui',
  'vercel-react-best-practices',
  'web-design-guidelines',
];

// Path to CLI binary
const CLI_PATH = join(process.cwd(), 'bin', 'cli.js');

/**
 * Run the init command in a specified directory.
 * Uses --skip-beads to avoid interactive prompts during testing.
 */
function runInit(cwd: string, flags: string[] = []): { stdout: string; stderr: string; exitCode: number } {
  // Always include --skip-beads to avoid interactive prompts
  const allFlags = ['--skip-beads', ...flags];
  const command = `node "${CLI_PATH}" init ${allFlags.join(' ')}`;
  
  try {
    const stdout = execSync(command, {
      cwd,
      encoding: 'utf-8',
      env: { ...process.env, NO_COLOR: '1' }, // Disable colors and animations
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

describe('init command E2E', () => {
  let testDir: string;

  beforeEach(() => {
    // Create a temp directory for each test
    testDir = join(tmpdir(), `beth-init-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up temp directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('directory structure creation', () => {
    it('should create .github/agents directory with all 7 agent files', () => {
      runInit(testDir);

      const agentsDir = join(testDir, '.github', 'agents');
      assert.strictEqual(existsSync(agentsDir), true, '.github/agents directory should exist');

      const files = readdirSync(agentsDir).filter(f => f.endsWith('.agent.md')).sort();
      assert.deepStrictEqual(files, EXPECTED_AGENTS, 'All 7 agent files should be created');
    });

    it('should create .github/skills directory with all skill directories', () => {
      runInit(testDir);

      const skillsDir = join(testDir, '.github', 'skills');
      assert.strictEqual(existsSync(skillsDir), true, '.github/skills directory should exist');

      const dirs = readdirSync(skillsDir).filter(f => {
        return existsSync(join(skillsDir, f, 'SKILL.md')) ||
               existsSync(join(skillsDir, f, 'AGENTS.md'));
      }).sort();
      
      assert.deepStrictEqual(dirs, EXPECTED_SKILLS, 'All skill directories should be created');
    });

    it('should create AGENTS.md in project root', () => {
      runInit(testDir);

      const agentsMd = join(testDir, 'AGENTS.md');
      assert.strictEqual(existsSync(agentsMd), true, 'AGENTS.md should exist');

      const content = readFileSync(agentsMd, 'utf-8');
      assert.ok(content.includes('beads'), 'AGENTS.md should mention beads');
    });

    it('should create Backlog.md in project root', () => {
      runInit(testDir);

      const backlogMd = join(testDir, 'Backlog.md');
      assert.strictEqual(existsSync(backlogMd), true, 'Backlog.md should exist');
    });

    it('should create mcp.json.example in project root', () => {
      runInit(testDir);

      const mcpJson = join(testDir, 'mcp.json.example');
      assert.strictEqual(existsSync(mcpJson), true, 'mcp.json.example should exist');
    });

    it('should create .vscode/settings.json', () => {
      runInit(testDir);

      const settingsJson = join(testDir, '.vscode', 'settings.json');
      assert.strictEqual(existsSync(settingsJson), true, '.vscode/settings.json should exist');
    });

    it('should create copilot-instructions.md in .github', () => {
      runInit(testDir);

      const copilotInstructions = join(testDir, '.github', 'copilot-instructions.md');
      assert.strictEqual(existsSync(copilotInstructions), true, '.github/copilot-instructions.md should exist');
    });
  });

  describe('--force flag', () => {
    it('should overwrite existing files when --force is used', () => {
      // Create existing AGENTS.md with different content
      const agentsMd = join(testDir, 'AGENTS.md');
      writeFileSync(agentsMd, 'ORIGINAL CONTENT');

      // Run init without --force
      runInit(testDir);
      let content = readFileSync(agentsMd, 'utf-8');
      assert.strictEqual(content, 'ORIGINAL CONTENT', 'Should not overwrite without --force');

      // Run init with --force
      runInit(testDir, ['--force']);
      content = readFileSync(agentsMd, 'utf-8');
      assert.notStrictEqual(content, 'ORIGINAL CONTENT', 'Should overwrite with --force');
      assert.ok(content.includes('beads'), 'Content should be from template');
    });

    it('should overwrite existing agent files with --force', () => {
      // Create existing .github/agents directory with modified file
      const agentsDir = join(testDir, '.github', 'agents');
      mkdirSync(agentsDir, { recursive: true });
      const bethAgent = join(agentsDir, 'beth.agent.md');
      writeFileSync(bethAgent, 'MODIFIED BETH');

      // Run init without --force
      runInit(testDir);
      let content = readFileSync(bethAgent, 'utf-8');
      assert.strictEqual(content, 'MODIFIED BETH', 'Should not overwrite without --force');

      // Run init with --force
      runInit(testDir, ['--force']);
      content = readFileSync(bethAgent, 'utf-8');
      assert.notStrictEqual(content, 'MODIFIED BETH', 'Should overwrite with --force');
    });
  });

  describe('--skip-backlog flag', () => {
    it('should not create Backlog.md when --skip-backlog is used', () => {
      runInit(testDir, ['--skip-backlog']);

      const backlogMd = join(testDir, 'Backlog.md');
      assert.strictEqual(existsSync(backlogMd), false, 'Backlog.md should not exist');
    });

    it('should still create other files when --skip-backlog is used', () => {
      runInit(testDir, ['--skip-backlog']);

      assert.strictEqual(existsSync(join(testDir, 'AGENTS.md')), true, 'AGENTS.md should exist');
      assert.strictEqual(existsSync(join(testDir, 'mcp.json.example')), true, 'mcp.json.example should exist');
      assert.strictEqual(existsSync(join(testDir, '.github', 'agents')), true, '.github/agents should exist');
    });
  });

  describe('--skip-mcp flag', () => {
    it('should not create mcp.json.example when --skip-mcp is used', () => {
      runInit(testDir, ['--skip-mcp']);

      const mcpJson = join(testDir, 'mcp.json.example');
      assert.strictEqual(existsSync(mcpJson), false, 'mcp.json.example should not exist');
    });

    it('should still create other files when --skip-mcp is used', () => {
      runInit(testDir, ['--skip-mcp']);

      assert.strictEqual(existsSync(join(testDir, 'AGENTS.md')), true, 'AGENTS.md should exist');
      assert.strictEqual(existsSync(join(testDir, 'Backlog.md')), true, 'Backlog.md should exist');
      assert.strictEqual(existsSync(join(testDir, '.github', 'agents')), true, '.github/agents should exist');
    });
  });

  describe('--skip-beads flag', () => {
    it('should complete without beads check when --skip-beads is used', () => {
      const result = runInit(testDir);
      
      // Should complete successfully (exit 0)
      assert.strictEqual(result.exitCode, 0, 'Should exit with code 0');
      
      // Should have created files
      assert.strictEqual(existsSync(join(testDir, '.github', 'agents')), true, 'Should create agents');
    });

    it('should show warning about skipping beads', () => {
      const result = runInit(testDir);
      
      // Output should mention skipping beads
      assert.ok(
        result.stdout.includes('Skipped beads check') || result.stdout.includes('skip-beads'),
        'Should warn about skipping beads'
      );
    });
  });

  describe('existing files handling', () => {
    it('should warn about existing files without --force', () => {
      // Create existing file
      writeFileSync(join(testDir, 'AGENTS.md'), 'EXISTING');

      const result = runInit(testDir);

      assert.ok(
        result.stdout.includes('Skipped') || result.stdout.includes('exists'),
        'Should mention that file was skipped'
      );
    });

    it('should not overwrite existing files without --force', () => {
      const agentsMd = join(testDir, 'AGENTS.md');
      writeFileSync(agentsMd, 'ORIGINAL');

      runInit(testDir);

      const content = readFileSync(agentsMd, 'utf-8');
      assert.strictEqual(content, 'ORIGINAL', 'Should preserve original content');
    });

    it('should count files correctly when some are skipped', () => {
      // Create some existing files
      writeFileSync(join(testDir, 'AGENTS.md'), 'EXISTING');
      writeFileSync(join(testDir, 'Backlog.md'), 'EXISTING');

      const result = runInit(testDir);

      // Should have installed some files but not all
      assert.ok(result.stdout.includes('Installed'), 'Should report installed files');
    });
  });

  describe('empty directory behavior', () => {
    it('should work correctly in an empty directory', () => {
      const result = runInit(testDir);

      assert.strictEqual(result.exitCode, 0, 'Should exit with code 0');
      assert.strictEqual(existsSync(join(testDir, '.github', 'agents')), true, '.github/agents should exist');
      assert.strictEqual(existsSync(join(testDir, '.github', 'skills')), true, '.github/skills should exist');
      assert.strictEqual(existsSync(join(testDir, 'AGENTS.md')), true, 'AGENTS.md should exist');
    });

    it('should install all expected files in empty directory', () => {
      runInit(testDir);

      // Check all expected files exist
      const agentsDir = join(testDir, '.github', 'agents');
      const agentFiles = readdirSync(agentsDir).filter(f => f.endsWith('.agent.md'));
      assert.strictEqual(agentFiles.length, 7, 'Should create 7 agent files');

      const skillsDir = join(testDir, '.github', 'skills');
      const skillDirs = readdirSync(skillsDir);
      assert.strictEqual(skillDirs.length, 6, 'Should create 6 skill directories');
    });
  });

  describe('existing .github folder behavior', () => {
    it('should work in directory with existing .github folder', () => {
      // Create existing .github folder with some content
      const existingGithub = join(testDir, '.github', 'workflows');
      mkdirSync(existingGithub, { recursive: true });
      writeFileSync(join(existingGithub, 'ci.yml'), 'name: CI');

      const result = runInit(testDir);

      assert.strictEqual(result.exitCode, 0, 'Should exit with code 0');
      
      // Should preserve existing content
      assert.strictEqual(
        existsSync(join(existingGithub, 'ci.yml')),
        true,
        'Should preserve existing .github/workflows/ci.yml'
      );

      // Should add new content
      assert.strictEqual(
        existsSync(join(testDir, '.github', 'agents')),
        true,
        'Should create .github/agents'
      );
    });

    it('should merge with existing .github/agents folder', () => {
      // Create existing agents folder with custom agent
      const agentsDir = join(testDir, '.github', 'agents');
      mkdirSync(agentsDir, { recursive: true });
      writeFileSync(join(agentsDir, 'custom.agent.md'), 'CUSTOM AGENT');

      runInit(testDir);

      // Should preserve custom agent
      assert.strictEqual(
        existsSync(join(agentsDir, 'custom.agent.md')),
        true,
        'Should preserve custom.agent.md'
      );
      
      // Custom agent content should be unchanged
      const customContent = readFileSync(join(agentsDir, 'custom.agent.md'), 'utf-8');
      assert.strictEqual(customContent, 'CUSTOM AGENT', 'Custom agent content preserved');

      // Should have added Beth agents (they don't exist yet)
      assert.strictEqual(
        existsSync(join(agentsDir, 'beth.agent.md')),
        true,
        'Should create beth.agent.md'
      );
    });
  });

  describe('multiple flag combinations', () => {
    it('should handle --skip-backlog and --skip-mcp together', () => {
      runInit(testDir, ['--skip-backlog', '--skip-mcp']);

      assert.strictEqual(existsSync(join(testDir, 'Backlog.md')), false, 'Backlog.md should not exist');
      assert.strictEqual(existsSync(join(testDir, 'mcp.json.example')), false, 'mcp.json.example should not exist');
      assert.strictEqual(existsSync(join(testDir, 'AGENTS.md')), true, 'AGENTS.md should exist');
      assert.strictEqual(existsSync(join(testDir, '.github', 'agents')), true, '.github/agents should exist');
    });

    it('should handle --force with skip flags', () => {
      // Create existing file
      writeFileSync(join(testDir, 'AGENTS.md'), 'ORIGINAL');

      runInit(testDir, ['--force', '--skip-backlog', '--skip-mcp']);

      // Force should overwrite
      const content = readFileSync(join(testDir, 'AGENTS.md'), 'utf-8');
      assert.notStrictEqual(content, 'ORIGINAL', 'Should overwrite with --force');

      // Skip flags should still work
      assert.strictEqual(existsSync(join(testDir, 'Backlog.md')), false, 'Backlog.md should not exist');
      assert.strictEqual(existsSync(join(testDir, 'mcp.json.example')), false, 'mcp.json.example should not exist');
    });
  });

  describe('output messages', () => {
    it('should report number of installed files', () => {
      const result = runInit(testDir);

      assert.ok(result.stdout.includes('Installed'), 'Should mention installed files');
      assert.ok(/Installed \d+ files/.test(result.stdout), 'Should report file count');
    });

    it('should show next steps after installation', () => {
      const result = runInit(testDir);

      assert.ok(
        result.stdout.includes('Next steps') || result.stdout.includes('VS Code'),
        'Should show next steps'
      );
    });
  });
});
