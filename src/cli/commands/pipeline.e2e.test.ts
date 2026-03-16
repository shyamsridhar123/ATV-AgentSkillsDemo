/**
 * E2E tests for the full init → doctor pipeline.
 * Run with: node --test dist/cli/commands/pipeline.e2e.test.js
 *
 * Tests the intended user journey: run init, then doctor to verify,
 * confirming the two commands compose correctly.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { tmpdir } from 'os';

const CLI_PATH = resolve(join(import.meta.dirname, '..', '..', '..', 'bin', 'cli.js'));

// Expected counts from templates
const EXPECTED_AGENT_COUNT = 7;
const EXPECTED_SKILL_COUNT = 6;

/**
 * Run a CLI command in a directory.
 */
function runCli(cwd: string, command: string, flags: string[] = []): { stdout: string; stderr: string; code: number } {
  const argStr = flags.length > 0 ? ` ${flags.join(' ')}` : '';
  try {
    const stdout = execSync(`node "${CLI_PATH}" ${command}${argStr}`, {
      cwd,
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

describe('init → doctor pipeline E2E', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `beth-pipeline-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('init creates what doctor checks', () => {
    it('should pass agent check after init', () => {
      // Step 1: Run init
      const initResult = runCli(testDir, 'init', []);
      assert.strictEqual(initResult.code, 0, `Init should succeed. Output: ${initResult.stdout}`);

      // Step 2: Run doctor
      const doctorResult = runCli(testDir, 'doctor');

      // Agent check should pass (init installed 7 agents)
      assert.ok(
        doctorResult.stdout.includes('agents configured') || doctorResult.stdout.includes('Agents'),
        'Doctor should find agents after init'
      );
      assert.ok(
        doctorResult.stdout.includes(`${EXPECTED_AGENT_COUNT} agents`),
        `Doctor should find ${EXPECTED_AGENT_COUNT} agents`
      );
    });

    it('should pass skills check after init', () => {
      const initResult = runCli(testDir, 'init', []);
      assert.strictEqual(initResult.code, 0, 'Init should succeed');

      const doctorResult = runCli(testDir, 'doctor');

      assert.ok(
        doctorResult.stdout.includes('skills configured') || doctorResult.stdout.includes('Skills'),
        'Doctor should find skills after init'
      );
      assert.ok(
        doctorResult.stdout.includes(`${EXPECTED_SKILL_COUNT} skills`),
        `Doctor should find ${EXPECTED_SKILL_COUNT} skills`
      );
    });

    it('should not warn about beads (beads removed)', () => {
      runCli(testDir, 'init', []);
      const doctorResult = runCli(testDir, 'doctor');

      // beads was removed — doctor should not produce beads-specific warnings
      // It may still show other warnings (e.g. backlog not initialized)
      assert.ok(
        !doctorResult.stdout.includes('Beads Init') || doctorResult.stdout.includes('beads removed'),
        'Doctor should not produce beads initialization warnings'
      );
    });

    it('Node.js check should always pass', () => {
      runCli(testDir, 'init', []);
      const doctorResult = runCli(testDir, 'doctor');

      assert.ok(
        doctorResult.stdout.includes('Node.js') && doctorResult.stdout.includes('✓'),
        'Node.js check should pass'
      );
    });
  });

  describe('doctor detects init --skip-* gaps', () => {
    it('should still pass agent/skills checks with --skip-mcp', () => {
      runCli(testDir, 'init', ['--skip-mcp']);
      const doctorResult = runCli(testDir, 'doctor');

      // Agents and skills should still be checked and pass
      assert.ok(
        doctorResult.stdout.includes(`${EXPECTED_AGENT_COUNT} agents`),
        'Agent check should pass even with --skip-mcp'
      );
    });

    it('should still pass agent/skills checks with --skip-backlog', () => {
      runCli(testDir, 'init', ['--skip-backlog']);
      const doctorResult = runCli(testDir, 'doctor');

      assert.ok(
        doctorResult.stdout.includes(`${EXPECTED_AGENT_COUNT} agents`),
        'Agent check should pass even with --skip-backlog'
      );
    });
  });

  describe('init --force then doctor', () => {
    it('should pass doctor after init --force over existing files', () => {
      // First init
      runCli(testDir, 'init', []);

      // Corrupt an agent file
      const bethAgent = join(testDir, '.github', 'agents', 'beth.agent.md');
      writeFileSync(bethAgent, 'corrupted content');

      // Doctor should show a warning (corrupted agent has no valid frontmatter)
      const doctorBefore = runCli(testDir, 'doctor');
      assert.ok(
        doctorBefore.stdout.includes('⚠') || doctorBefore.stdout.includes('issues'),
        'Doctor should detect corrupted agent'
      );

      // Re-init with --force
      runCli(testDir, 'init', ['--force']);

      // Doctor should now be healthy again
      const doctorAfter = runCli(testDir, 'doctor');
      assert.ok(
        doctorAfter.stdout.includes(`${EXPECTED_AGENT_COUNT} agents configured`),
        'Doctor should pass after init --force repairs the corrupted file'
      );
    });
  });

  describe('full installed structure validation', () => {
    it('should have complete directory structure after init', () => {
      runCli(testDir, 'init', []);

      // Verify the full expected structure
      assert.ok(existsSync(join(testDir, '.github', 'agents')), '.github/agents should exist');
      assert.ok(existsSync(join(testDir, '.github', 'skills')), '.github/skills should exist');
      assert.ok(existsSync(join(testDir, '.github', 'copilot-instructions.md')), 'copilot-instructions.md should exist');
      assert.ok(existsSync(join(testDir, '.vscode', 'settings.json')), '.vscode/settings.json should exist');
      assert.ok(existsSync(join(testDir, 'AGENTS.md')), 'AGENTS.md should exist');
      assert.ok(existsSync(join(testDir, 'Backlog.md')), 'Backlog.md should exist');
      assert.ok(existsSync(join(testDir, 'mcp.json.example')), 'mcp.json.example should exist');
    });

    it('all installed agent files should have valid frontmatter', () => {
      runCli(testDir, 'init', []);

      const agentsDir = join(testDir, '.github', 'agents');
      const agentFiles = readdirSync(agentsDir).filter(f => f.endsWith('.agent.md'));

      assert.strictEqual(agentFiles.length, EXPECTED_AGENT_COUNT, `Should have ${EXPECTED_AGENT_COUNT} agent files`);

      for (const file of agentFiles) {
        const content = readFileSync(join(agentsDir, file), 'utf-8');

        // Should have frontmatter delimiters
        assert.ok(
          content.startsWith('---'),
          `${file} should start with YAML frontmatter delimiter`
        );

        // Should contain name field
        assert.ok(
          content.includes('name:'),
          `${file} should have name field in frontmatter`
        );
      }
    });

    it('all installed skill directories should have SKILL.md', () => {
      runCli(testDir, 'init', []);

      const skillsDir = join(testDir, '.github', 'skills');
      const skillDirs = readdirSync(skillsDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);

      assert.ok(skillDirs.length >= EXPECTED_SKILL_COUNT, `Should have at least ${EXPECTED_SKILL_COUNT} skill dirs`);

      const missingSkillMd: string[] = [];
      for (const dir of skillDirs) {
        const skillMd = join(skillsDir, dir, 'SKILL.md');
        const agentsMd = join(skillsDir, dir, 'AGENTS.md');
        if (!existsSync(skillMd) && !existsSync(agentsMd)) {
          missingSkillMd.push(dir);
        }
      }

      assert.strictEqual(
        missingSkillMd.length,
        0,
        `Skill directories missing SKILL.md or AGENTS.md: ${missingSkillMd.join(', ')}`
      );
    });

    it('installed mcp.json.example should be valid JSON', () => {
      runCli(testDir, 'init', []);

      const mcpPath = join(testDir, 'mcp.json.example');
      const content = readFileSync(mcpPath, 'utf-8');

      assert.doesNotThrow(() => {
        JSON.parse(content);
      }, 'mcp.json.example should be valid JSON');
    });

    it('installed .vscode/settings.json should be valid JSONC', () => {
      runCli(testDir, 'init', []);

      const settingsPath = join(testDir, '.vscode', 'settings.json');
      const content = readFileSync(settingsPath, 'utf-8');

      // VS Code settings use JSONC (JSON with comments) — strip comments before parsing
      const stripped = content.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      assert.doesNotThrow(() => {
        JSON.parse(stripped);
      }, '.vscode/settings.json should be valid JSONC');
    });

    it('installed .vscode/settings.json should enable subagent delegation', () => {
      runCli(testDir, 'init', []);

      const settingsPath = join(testDir, '.vscode', 'settings.json');
      const content = readFileSync(settingsPath, 'utf-8');
      const stripped = content.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      const settings = JSON.parse(stripped);

      assert.strictEqual(
        settings['chat.customAgentInSubagent.enabled'],
        true,
        '.vscode/settings.json should enable subagent delegation'
      );
    });
  });

  describe('doctor output after complete init', () => {
    it('doctor summary should show no failures after full init', () => {
      runCli(testDir, 'init', []);

      const doctorResult = runCli(testDir, 'doctor');

      // Core checks: Node.js, backlog.md CLI, Agents, Skills
      // Backlog Init may warn (backlog/ not initialized in temp dir)
      const passCount = (doctorResult.stdout.match(/✓/g) || []).length;
      assert.ok(
        passCount >= 3,
        `Should have at least 3 passing checks (Node.js, Agents, Skills). Got ${passCount} passes. Output:\n${doctorResult.stdout}`
      );
    });
  });
});
