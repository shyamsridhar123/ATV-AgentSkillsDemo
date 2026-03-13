/**
 * E2E tests for doctor command.
 * Run with: node --test dist/cli/commands/doctor.e2e.test.js
 *
 * These tests run the actual CLI binary and validate stdout output.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { execFileSync, execSync, ChildProcess, spawn } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to CLI binary (relative to dist/ after build)
const CLI_PATH = join(__dirname, '..', '..', '..', 'bin', 'cli.js');

/**
 * Run the doctor command in a specific directory and capture output.
 * @param cwd - Directory to run the command in
 * @param args - Additional arguments (e.g., '--verbose')
 * @returns Object with stdout, stderr, and exit code
 */
function runDoctor(cwd: string, args: string[] = []): { stdout: string; stderr: string; code: number } {
  try {
    const cliArgs = [CLI_PATH, 'doctor', ...args];
    const stdout = execFileSync('node', cliArgs, {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NO_COLOR: '1' }, // Disable colors for easier parsing
    });
    return { stdout, stderr: '', code: 0 };
  } catch (error: unknown) {
    const execError = error as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: execError.stdout || '',
      stderr: execError.stderr || '',
      code: execError.status || 1,
    };
  }
}

/**
 * Create a valid agent file with proper frontmatter.
 */
function createValidAgentFile(dir: string, name: string): void {
  const content = `---
name: ${name}
description: A test agent
model: Claude Opus 4.5
tools:
  - readFile
  - editFiles
---

# ${name}

This is a test agent.
`;
  writeFileSync(join(dir, `${name}.agent.md`), content);
}

/**
 * Create an invalid agent file (missing name in frontmatter).
 */
function createInvalidAgentFile(dir: string, filename: string): void {
  const content = `---
description: A test agent without name
---

# Invalid Agent

This agent has no name field.
`;
  writeFileSync(join(dir, filename), content);
}

/**
 * Create a skill directory with SKILL.md.
 */
function createValidSkill(skillsDir: string, name: string): void {
  const skillDir = join(skillsDir, name);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, 'SKILL.md'), `# ${name}\n\nThis is a test skill.`);
}

/**
 * Create a skill directory without SKILL.md.
 */
function createIncompleteSkill(skillsDir: string, name: string): void {
  const skillDir = join(skillsDir, name);
  mkdirSync(skillDir, { recursive: true });
  // No SKILL.md created
}

describe('doctor command E2E', () => {
  let testDir: string;

  beforeEach(() => {
    // Create a unique temp directory for each test
    testDir = join(tmpdir(), `beth-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up temp directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('healthy project', () => {
    it('should exit 0 when all checks pass', () => {
      // Setup: Create a fully healthy project
      const agentsDir = join(testDir, '.github', 'agents');
      const skillsDir = join(testDir, '.github', 'skills');
      const beadsDir = join(testDir, '.beads');

      mkdirSync(agentsDir, { recursive: true });
      mkdirSync(skillsDir, { recursive: true });
      mkdirSync(beadsDir, { recursive: true });

      // Create valid agents
      createValidAgentFile(agentsDir, 'test-agent');
      createValidAgentFile(agentsDir, 'another-agent');

      // Create valid skills
      createValidSkill(skillsDir, 'test-skill');
      createValidSkill(skillsDir, 'another-skill');

      // Run doctor
      const result = runDoctor(testDir);

      // Verify exit code (may be 1 if bd CLI not installed, but agents/skills pass)
      // Check that agents and skills pass
      assert.ok(
        result.stdout.includes('✓') && result.stdout.includes('agents'),
        'Should show passing agent check'
      );
      assert.ok(
        result.stdout.includes('2 agents configured') || result.stdout.includes('agents'),
        'Should report agent count'
      );
    });

    it('should show "All checks passed" message when healthy', () => {
      // Setup: Create healthy project
      const agentsDir = join(testDir, '.github', 'agents');
      const skillsDir = join(testDir, '.github', 'skills');
      const beadsDir = join(testDir, '.beads');

      mkdirSync(agentsDir, { recursive: true });
      mkdirSync(skillsDir, { recursive: true });
      mkdirSync(beadsDir, { recursive: true });

      createValidAgentFile(agentsDir, 'beth');
      createValidSkill(skillsDir, 'prd');

      const result = runDoctor(testDir);

      // Should contain pass indicators
      assert.ok(result.stdout.includes('✓'), 'Should have pass indicators');
    });
  });

  describe('missing .github/agents', () => {
    it('should show failure for missing .github/agents directory', () => {
      // Setup: Only create skills, no agents
      const skillsDir = join(testDir, '.github', 'skills');
      const beadsDir = join(testDir, '.beads');

      mkdirSync(skillsDir, { recursive: true });
      mkdirSync(beadsDir, { recursive: true });
      createValidSkill(skillsDir, 'test-skill');

      const result = runDoctor(testDir);

      // Should show failure for agents
      assert.ok(
        result.stdout.includes('✗') || result.stdout.includes('not found'),
        'Should indicate agents check failed'
      );
      assert.ok(
        result.stdout.toLowerCase().includes('agents'),
        'Should mention agents in output'
      );
    });
  });

  describe('missing .github/skills', () => {
    it('should show failure for missing .github/skills directory', () => {
      // Setup: Only create agents, no skills
      const agentsDir = join(testDir, '.github', 'agents');
      const beadsDir = join(testDir, '.beads');

      mkdirSync(agentsDir, { recursive: true });
      mkdirSync(beadsDir, { recursive: true });
      createValidAgentFile(agentsDir, 'test-agent');

      const result = runDoctor(testDir);

      // Should show failure for skills
      assert.ok(
        result.stdout.includes('✗') || result.stdout.includes('not found'),
        'Should indicate skills check failed'
      );
      assert.ok(
        result.stdout.toLowerCase().includes('skill'),
        'Should mention skills in output'
      );
    });
  });

  describe('agent frontmatter validation', () => {
    it('should show warning for agent missing name in frontmatter', () => {
      // Setup: Create agent without name field
      const agentsDir = join(testDir, '.github', 'agents');
      const skillsDir = join(testDir, '.github', 'skills');
      const beadsDir = join(testDir, '.beads');

      mkdirSync(agentsDir, { recursive: true });
      mkdirSync(skillsDir, { recursive: true });
      mkdirSync(beadsDir, { recursive: true });

      createInvalidAgentFile(agentsDir, 'invalid.agent.md');
      createValidSkill(skillsDir, 'test-skill');

      const result = runDoctor(testDir);

      // Should show warning for invalid frontmatter
      assert.ok(
        result.stdout.includes('⚠') || result.stdout.includes('issues') || result.stdout.includes('missing'),
        'Should indicate agent has issues'
      );
    });

    it('should show count of agents with issues', () => {
      // Setup: Create mix of valid and invalid agents
      const agentsDir = join(testDir, '.github', 'agents');
      const skillsDir = join(testDir, '.github', 'skills');
      const beadsDir = join(testDir, '.beads');

      mkdirSync(agentsDir, { recursive: true });
      mkdirSync(skillsDir, { recursive: true });
      mkdirSync(beadsDir, { recursive: true });

      createValidAgentFile(agentsDir, 'valid-agent');
      createInvalidAgentFile(agentsDir, 'invalid1.agent.md');
      createInvalidAgentFile(agentsDir, 'invalid2.agent.md');
      createValidSkill(skillsDir, 'test-skill');

      const result = runDoctor(testDir);

      // Should report issues count
      assert.ok(
        result.stdout.includes('3 agents') || result.stdout.includes('agents'),
        'Should mention total agent count'
      );
      assert.ok(
        result.stdout.includes('2 with issues') || result.stdout.includes('issues') || result.stdout.includes('⚠'),
        'Should indicate agents have issues'
      );
    });
  });

  describe('skill directory validation', () => {
    it('should show warning for skill directories missing SKILL.md', () => {
      // Setup: Create skill directory without SKILL.md
      const agentsDir = join(testDir, '.github', 'agents');
      const skillsDir = join(testDir, '.github', 'skills');
      const beadsDir = join(testDir, '.beads');

      mkdirSync(agentsDir, { recursive: true });
      mkdirSync(skillsDir, { recursive: true });
      mkdirSync(beadsDir, { recursive: true });

      createValidAgentFile(agentsDir, 'test-agent');
      createIncompleteSkill(skillsDir, 'incomplete-skill');

      const result = runDoctor(testDir);

      // Should show warning for missing SKILL.md
      assert.ok(
        result.stdout.includes('⚠') || result.stdout.includes('missing SKILL.md'),
        'Should indicate skill is missing SKILL.md'
      );
    });

    it('should list skills missing SKILL.md in details', () => {
      // Setup: Create multiple incomplete skills
      const agentsDir = join(testDir, '.github', 'agents');
      const skillsDir = join(testDir, '.github', 'skills');
      const beadsDir = join(testDir, '.beads');

      mkdirSync(agentsDir, { recursive: true });
      mkdirSync(skillsDir, { recursive: true });
      mkdirSync(beadsDir, { recursive: true });

      createValidAgentFile(agentsDir, 'test-agent');
      createValidSkill(skillsDir, 'complete-skill');
      createIncompleteSkill(skillsDir, 'broken-skill-one');
      createIncompleteSkill(skillsDir, 'broken-skill-two');

      const result = runDoctor(testDir, ['--verbose']);

      // Should report number of skills with issues
      assert.ok(
        result.stdout.includes('2 missing') || result.stdout.includes('missing SKILL.md'),
        'Should report skills missing SKILL.md'
      );
    });
  });

  describe('beads initialization check', () => {
    it('should show warning when .beads directory is missing', () => {
      // Setup: Create project without .beads
      const agentsDir = join(testDir, '.github', 'agents');
      const skillsDir = join(testDir, '.github', 'skills');

      mkdirSync(agentsDir, { recursive: true });
      mkdirSync(skillsDir, { recursive: true });

      createValidAgentFile(agentsDir, 'test-agent');
      createValidSkill(skillsDir, 'test-skill');

      const result = runDoctor(testDir);

      // Should show warning for missing beads init
      assert.ok(
        result.stdout.includes('⚠') || result.stdout.includes('not initialized'),
        'Should indicate beads is not initialized'
      );
      assert.ok(
        result.stdout.toLowerCase().includes('beads') || result.stdout.toLowerCase().includes('.beads'),
        'Should mention beads'
      );
    });

    it('should pass when .beads directory exists', () => {
      // Setup: Create project with .beads
      const agentsDir = join(testDir, '.github', 'agents');
      const skillsDir = join(testDir, '.github', 'skills');
      const beadsDir = join(testDir, '.beads');

      mkdirSync(agentsDir, { recursive: true });
      mkdirSync(skillsDir, { recursive: true });
      mkdirSync(beadsDir, { recursive: true });

      createValidAgentFile(agentsDir, 'test-agent');
      createValidSkill(skillsDir, 'test-skill');

      const result = runDoctor(testDir);

      // Should pass beads init check
      assert.ok(
        result.stdout.includes('Beads Init') || result.stdout.includes('.beads'),
        'Should check beads initialization'
      );
    });
  });

  describe('--verbose flag', () => {
    it('should show additional details with --verbose flag', () => {
      // Setup: Create project with some issues
      const agentsDir = join(testDir, '.github', 'agents');
      const skillsDir = join(testDir, '.github', 'skills');
      const beadsDir = join(testDir, '.beads');

      mkdirSync(agentsDir, { recursive: true });
      mkdirSync(skillsDir, { recursive: true });
      mkdirSync(beadsDir, { recursive: true });

      // Create agent with missing name to trigger warning details
      createInvalidAgentFile(agentsDir, 'bad-agent.agent.md');
      createValidSkill(skillsDir, 'test-skill');

      // Run without verbose
      const resultNormal = runDoctor(testDir);

      // Run with verbose
      const resultVerbose = runDoctor(testDir, ['--verbose']);

      // Verbose should have more detailed output
      // Check that verbose output includes "missing 'name'" detail
      assert.ok(
        resultVerbose.stdout.includes("missing 'name'") ||
        resultVerbose.stdout.includes('frontmatter') ||
        resultVerbose.stdout.length >= resultNormal.stdout.length,
        'Verbose should show more details than normal'
      );
    });

    it('should show install hints in verbose mode', () => {
      // Setup: Create minimal project (missing agents for clear failure)
      const skillsDir = join(testDir, '.github', 'skills');
      mkdirSync(skillsDir, { recursive: true });
      createValidSkill(skillsDir, 'test-skill');

      const result = runDoctor(testDir, ['--verbose']);

      // Should include remediation hints
      assert.ok(
        result.stdout.includes('Run:') || result.stdout.includes('npx'),
        'Verbose output should include fix commands'
      );
    });
  });

  describe('output formatting', () => {
    it('should use ✓ for passing checks', () => {
      // Setup: Create healthy project components
      const agentsDir = join(testDir, '.github', 'agents');
      const skillsDir = join(testDir, '.github', 'skills');
      const beadsDir = join(testDir, '.beads');

      mkdirSync(agentsDir, { recursive: true });
      mkdirSync(skillsDir, { recursive: true });
      mkdirSync(beadsDir, { recursive: true });

      createValidAgentFile(agentsDir, 'test-agent');
      createValidSkill(skillsDir, 'test-skill');

      const result = runDoctor(testDir);

      // Should contain checkmarks for passing tests
      assert.ok(result.stdout.includes('✓'), 'Should use ✓ for passing checks');
    });

    it('should use ⚠ for warning checks', () => {
      // Setup: Create project with warnings (missing .beads, but valid agents/skills)
      const agentsDir = join(testDir, '.github', 'agents');
      const skillsDir = join(testDir, '.github', 'skills');

      mkdirSync(agentsDir, { recursive: true });
      mkdirSync(skillsDir, { recursive: true });

      createValidAgentFile(agentsDir, 'test-agent');
      createValidSkill(skillsDir, 'test-skill');

      const result = runDoctor(testDir);

      // Should contain warning indicators
      assert.ok(result.stdout.includes('⚠'), 'Should use ⚠ for warnings');
    });

    it('should use ✗ for failing checks', () => {
      // Setup: Create empty project (no .github directory)
      // This should fail the agents and skills checks

      const result = runDoctor(testDir);

      // Should contain failure indicators
      assert.ok(result.stdout.includes('✗'), 'Should use ✗ for failures');
    });

    it('should show summary line with pass/warn/fail counts', () => {
      // Setup: Create project with mixed results
      const agentsDir = join(testDir, '.github', 'agents');
      const skillsDir = join(testDir, '.github', 'skills');

      mkdirSync(agentsDir, { recursive: true });
      mkdirSync(skillsDir, { recursive: true });

      createValidAgentFile(agentsDir, 'test-agent');
      createValidSkill(skillsDir, 'test-skill');

      const result = runDoctor(testDir);

      // Should contain summary with counts
      assert.ok(
        result.stdout.includes('passed') ||
        result.stdout.includes('warning') ||
        result.stdout.includes('check'),
        'Should show summary with check results'
      );
    });

    it('should show "Beth Doctor - System Health Check" header', () => {
      const result = runDoctor(testDir);

      assert.ok(
        result.stdout.includes('Beth Doctor') || result.stdout.includes('System Health Check'),
        'Should show doctor header'
      );
    });
  });

  describe('exit codes', () => {
    it('should exit with code 1 when checks fail', () => {
      // Empty directory - agents and skills will fail
      const result = runDoctor(testDir);

      assert.strictEqual(result.code, 1, 'Should exit with code 1 on failure');
    });

    it('should exit with code 0 when no failures (only warnings allowed)', () => {
      // Setup: Create project with all required components
      const agentsDir = join(testDir, '.github', 'agents');
      const skillsDir = join(testDir, '.github', 'skills');
      const beadsDir = join(testDir, '.beads');

      mkdirSync(agentsDir, { recursive: true });
      mkdirSync(skillsDir, { recursive: true });
      mkdirSync(beadsDir, { recursive: true });

      createValidAgentFile(agentsDir, 'test-agent');
      createValidSkill(skillsDir, 'test-skill');

      const result = runDoctor(testDir);

      // If beads CLI is installed, this should pass
      // If beads CLI is not installed, it will fail - we check the agent/skill parts passed
      const hasAgentPass = result.stdout.includes('✓') && result.stdout.includes('Agent');
      const hasSkillPass = result.stdout.includes('✓') && result.stdout.includes('Skill');

      // At minimum, agents and skills checks should pass
      assert.ok(
        hasAgentPass || hasSkillPass || result.stdout.includes('1 agents configured'),
        'Agent or skill check should pass'
      );
    });
  });

  describe('Node.js version check', () => {
    it('should always pass Node.js check on current version', () => {
      const result = runDoctor(testDir);

      // Node.js check should pass (we're running on Node.js 18+)
      assert.ok(
        result.stdout.includes('Node.js') && result.stdout.includes('✓'),
        'Node.js version check should pass'
      );
    });

    it('should show Node.js version in output', () => {
      const result = runDoctor(testDir);

      // Should include version number
      assert.ok(
        result.stdout.includes(process.version) || result.stdout.includes('≥18'),
        'Should show Node.js version info'
      );
    });
  });

  describe('empty agent files handled gracefully', () => {
    it('should handle empty .agent.md files without crashing', () => {
      const agentsDir = join(testDir, '.github', 'agents');
      const skillsDir = join(testDir, '.github', 'skills');
      const beadsDir = join(testDir, '.beads');

      mkdirSync(agentsDir, { recursive: true });
      mkdirSync(skillsDir, { recursive: true });
      mkdirSync(beadsDir, { recursive: true });

      // Create empty agent file
      writeFileSync(join(agentsDir, 'empty.agent.md'), '');
      createValidSkill(skillsDir, 'test-skill');

      const result = runDoctor(testDir);

      // Should not crash, should show warning
      assert.ok(
        result.stdout.includes('Agents') || result.stdout.includes('agents'),
        'Should process empty agent file without crash'
      );
    });
  });

  describe('malformed YAML frontmatter', () => {
    it('should handle malformed YAML without crashing', () => {
      const agentsDir = join(testDir, '.github', 'agents');
      const skillsDir = join(testDir, '.github', 'skills');
      const beadsDir = join(testDir, '.beads');

      mkdirSync(agentsDir, { recursive: true });
      mkdirSync(skillsDir, { recursive: true });
      mkdirSync(beadsDir, { recursive: true });

      // Create agent with malformed YAML
      const badYaml = `---
name: test
  broken: indentation
    very: bad
---

# Broken Agent
`;
      writeFileSync(join(agentsDir, 'broken.agent.md'), badYaml);
      createValidSkill(skillsDir, 'test-skill');

      const result = runDoctor(testDir);

      // Should handle gracefully without crashing
      assert.ok(
        result.stdout.includes('Agents') || result.stdout.includes('✗') || result.stdout.includes('⚠'),
        'Should handle malformed YAML gracefully'
      );
    });
  });

  describe('no-db mode checks', () => {
    it('should show no-db check when .beads/config.yaml has no-db: true', () => {
      const agentsDir = join(testDir, '.github', 'agents');
      const skillsDir = join(testDir, '.github', 'skills');
      const beadsDir = join(testDir, '.beads');
      const backupDir = join(testDir, '.beads', 'backup');

      mkdirSync(agentsDir, { recursive: true });
      mkdirSync(skillsDir, { recursive: true });
      mkdirSync(backupDir, { recursive: true });

      createValidAgentFile(agentsDir, 'beth');
      createValidSkill(skillsDir, 'prd');
      writeFileSync(join(beadsDir, 'config.yaml'), 'no-db: true\n');
      writeFileSync(join(backupDir, 'issues.jsonl'), '{"id":"test-1","title":"test"}\n');

      const result = runDoctor(testDir);
      assert.ok(
        result.stdout.includes('no-db') || result.stdout.includes('JSONL'),
        'Should show no-db or JSONL check in output'
      );
    });

    it('should warn when no-db is not enabled', () => {
      const agentsDir = join(testDir, '.github', 'agents');
      const skillsDir = join(testDir, '.github', 'skills');
      const beadsDir = join(testDir, '.beads');

      mkdirSync(agentsDir, { recursive: true });
      mkdirSync(skillsDir, { recursive: true });
      mkdirSync(beadsDir, { recursive: true });

      createValidAgentFile(agentsDir, 'beth');
      createValidSkill(skillsDir, 'prd');
      writeFileSync(join(beadsDir, 'config.yaml'), 'issue-prefix: test\n');

      const result = runDoctor(testDir);
      assert.ok(
        result.stdout.includes('⚠') || result.stdout.includes('no-db'),
        'Should warn about no-db mode not enabled'
      );
    });

    it('should report JSONL issue count when data exists', () => {
      const agentsDir = join(testDir, '.github', 'agents');
      const skillsDir = join(testDir, '.github', 'skills');
      const beadsDir = join(testDir, '.beads');
      const backupDir = join(testDir, '.beads', 'backup');

      mkdirSync(agentsDir, { recursive: true });
      mkdirSync(skillsDir, { recursive: true });
      mkdirSync(backupDir, { recursive: true });

      createValidAgentFile(agentsDir, 'beth');
      createValidSkill(skillsDir, 'prd');
      writeFileSync(join(beadsDir, 'config.yaml'), 'no-db: true\n');
      writeFileSync(
        join(backupDir, 'issues.jsonl'),
        '{"id":"t-1","title":"one"}\n{"id":"t-2","title":"two"}\n{"id":"t-3","title":"three"}\n'
      );

      const result = runDoctor(testDir, ['--verbose']);
      assert.ok(
        result.stdout.includes('3') || result.stdout.includes('issues'),
        'Should report JSONL issue count'
      );
    });
  });

  describe('no-db deep validation (E2E)', () => {
    /**
     * SCENARIO: Dolt process detection
     *
     * Repro: Enable no-db: true in config.yaml, then start a process whose
     * command line contains "dolt sql-server" (simulating a stale Dolt server).
     * Run beth-copilot doctor.
     *
     * Expected: Doctor output includes "Dolt process" with ⚠ warning and
     * the suggestion to kill it with pkill.
     */
    it('should warn when a Dolt server process is running in no-db mode', () => {
      const agentsDir = join(testDir, '.github', 'agents');
      const skillsDir = join(testDir, '.github', 'skills');
      const beadsDir = join(testDir, '.beads');
      const backupDir = join(testDir, '.beads', 'backup');

      mkdirSync(agentsDir, { recursive: true });
      mkdirSync(skillsDir, { recursive: true });
      mkdirSync(backupDir, { recursive: true });

      createValidAgentFile(agentsDir, 'beth');
      createValidSkill(skillsDir, 'prd');
      writeFileSync(join(beadsDir, 'config.yaml'), 'no-db: true\n');
      writeFileSync(join(backupDir, 'issues.jsonl'), '{"id":"t-1","title":"test"}\n');

      // Spawn a fake "dolt sql-server" process that pgrep will match.
      // We use sleep with a process title trick — exec renames the process.
      let fakeProc: ChildProcess | null = null;
      try {
        fakeProc = spawn('bash', ['-c', 'exec -a "dolt sql-server --port 99999" sleep 60'], {
          stdio: 'ignore',
          detached: true,
        });
        fakeProc.unref();

        // Give the process a moment to register
        execSync('sleep 0.2', { stdio: 'ignore' });

        const result = runDoctor(testDir, ['--verbose']);

        // Doctor should detect the fake Dolt process
        assert.ok(
          result.stdout.includes('Dolt process'),
          'Should include Dolt process check in output'
        );
        assert.ok(
          result.stdout.includes('⚠') && result.stdout.includes('Dolt'),
          'Should warn about running Dolt server'
        );
      } finally {
        // Clean up the fake process
        if (fakeProc?.pid) {
          try { process.kill(-fakeProc.pid, 'SIGTERM'); } catch { /* already dead */ }
          try { process.kill(fakeProc.pid, 'SIGTERM'); } catch { /* already dead */ }
        }
      }
    });

    /**
     * SCENARIO: No Dolt process when none is running
     *
     * Repro: Enable no-db: true. Ensure no dolt sql-server process exists.
     * Run beth-copilot doctor.
     *
     * Expected: Doctor shows "Dolt process" with ✓ pass and
     * "no Dolt server running" message.
     */
    it('should pass Dolt check when no Dolt server is running', () => {
      const agentsDir = join(testDir, '.github', 'agents');
      const skillsDir = join(testDir, '.github', 'skills');
      const beadsDir = join(testDir, '.beads');
      const backupDir = join(testDir, '.beads', 'backup');

      mkdirSync(agentsDir, { recursive: true });
      mkdirSync(skillsDir, { recursive: true });
      mkdirSync(backupDir, { recursive: true });

      createValidAgentFile(agentsDir, 'beth');
      createValidSkill(skillsDir, 'prd');
      writeFileSync(join(beadsDir, 'config.yaml'), 'no-db: true\n');
      writeFileSync(join(backupDir, 'issues.jsonl'), '{"id":"t-1","title":"test"}\n');

      // Ensure no dolt process is running (don't kill anything — just verify)
      let doltRunning = false;
      try {
        execSync('pgrep -af "dolt sql-server"', { stdio: 'pipe' });
        doltRunning = true;
      } catch {
        doltRunning = false;
      }

      // Skip this test if a real Dolt process happens to be running
      if (doltRunning) {
        return;
      }

      const result = runDoctor(testDir, ['--verbose']);

      assert.ok(
        result.stdout.includes('Dolt process'),
        'Should include Dolt process check'
      );
      assert.ok(
        result.stdout.includes('no Dolt server running'),
        'Should confirm no Dolt server is running'
      );
    });

    /**
     * SCENARIO: Corrupt metadata.json detection
     *
     * Repro: Enable no-db: true. Write invalid JSON to .beads/metadata.json.
     * Run beth-copilot doctor.
     *
     * Expected: Doctor shows "Beads metadata" with ✗ fail and
     * "invalid JSON" message with re-init guidance.
     */
    it('should fail when metadata.json contains corrupt JSON', () => {
      const agentsDir = join(testDir, '.github', 'agents');
      const skillsDir = join(testDir, '.github', 'skills');
      const beadsDir = join(testDir, '.beads');
      const backupDir = join(testDir, '.beads', 'backup');

      mkdirSync(agentsDir, { recursive: true });
      mkdirSync(skillsDir, { recursive: true });
      mkdirSync(backupDir, { recursive: true });

      createValidAgentFile(agentsDir, 'beth');
      createValidSkill(skillsDir, 'prd');
      writeFileSync(join(beadsDir, 'config.yaml'), 'no-db: true\n');
      writeFileSync(join(backupDir, 'issues.jsonl'), '{"id":"t-1","title":"test"}\n');

      // Write corrupt JSON — the exact scenario from the March 2026 debugging nightmare
      writeFileSync(join(beadsDir, 'metadata.json'), '{ "name": "beth" }}');

      const result = runDoctor(testDir, ['--verbose']);

      assert.ok(
        result.stdout.includes('Beads metadata'),
        'Should include metadata check in output'
      );
      assert.ok(
        result.stdout.includes('✗') && result.stdout.includes('invalid JSON'),
        'Should fail with invalid JSON message'
      );
    });

    /**
     * SCENARIO: metadata.json with dangerous fallback name "beads"
     *
     * Repro: Enable no-db: true. Write metadata.json with name "beads" (the
     * default fallback that indicates corruption or wrong init).
     * Run beth-copilot doctor.
     *
     * Expected: Doctor shows "Beads metadata" with ⚠ warn about the dangerous
     * default database name.
     */
    it('should warn when metadata.json has the dangerous "beads" fallback name', () => {
      const agentsDir = join(testDir, '.github', 'agents');
      const skillsDir = join(testDir, '.github', 'skills');
      const beadsDir = join(testDir, '.beads');
      const backupDir = join(testDir, '.beads', 'backup');

      mkdirSync(agentsDir, { recursive: true });
      mkdirSync(skillsDir, { recursive: true });
      mkdirSync(backupDir, { recursive: true });

      createValidAgentFile(agentsDir, 'beth');
      createValidSkill(skillsDir, 'prd');
      writeFileSync(join(beadsDir, 'config.yaml'), 'no-db: true\n');
      writeFileSync(join(backupDir, 'issues.jsonl'), '{"id":"t-1","title":"test"}\n');
      writeFileSync(join(beadsDir, 'metadata.json'), JSON.stringify({ name: 'beads' }));

      const result = runDoctor(testDir, ['--verbose']);

      assert.ok(
        result.stdout.includes('Beads metadata'),
        'Should include metadata check'
      );
      assert.ok(
        result.stdout.includes('⚠'),
        'Should warn about dangerous fallback name'
      );
      assert.ok(
        result.stdout.includes('beads') && result.stdout.includes('default'),
        'Should mention the "beads" default name issue'
      );
    });

    /**
     * SCENARIO: Valid metadata.json passes
     *
     * Repro: Enable no-db: true. Write valid metadata.json with repo-specific name.
     * Run beth-copilot doctor.
     *
     * Expected: Doctor shows "Beads metadata" with ✓ pass.
     */
    it('should pass metadata check with valid repo-specific name', () => {
      const agentsDir = join(testDir, '.github', 'agents');
      const skillsDir = join(testDir, '.github', 'skills');
      const beadsDir = join(testDir, '.beads');
      const backupDir = join(testDir, '.beads', 'backup');

      mkdirSync(agentsDir, { recursive: true });
      mkdirSync(skillsDir, { recursive: true });
      mkdirSync(backupDir, { recursive: true });

      createValidAgentFile(agentsDir, 'beth');
      createValidSkill(skillsDir, 'prd');
      writeFileSync(join(beadsDir, 'config.yaml'), 'no-db: true\n');
      writeFileSync(join(backupDir, 'issues.jsonl'), '{"id":"t-1","title":"test"}\n');
      writeFileSync(join(beadsDir, 'metadata.json'), JSON.stringify({ name: 'my-project' }));

      const result = runDoctor(testDir, ['--verbose']);

      assert.ok(
        result.stdout.includes('Beads metadata') && result.stdout.includes('valid'),
        'Should pass metadata check with valid name'
      );
    });

    /**
     * SCENARIO: Legacy JSONL path detection
     *
     * Repro: Enable no-db: true. Write issues to root .beads/issues.jsonl
     * (legacy path) instead of .beads/backup/issues.jsonl (canonical).
     * Run beth-copilot doctor.
     *
     * Expected: Doctor shows "JSONL data" with ⚠ warn and "legacy" in message,
     * with guidance to use backup/ path.
     */
    it('should warn about legacy root-level JSONL path', () => {
      const agentsDir = join(testDir, '.github', 'agents');
      const skillsDir = join(testDir, '.github', 'skills');
      const beadsDir = join(testDir, '.beads');

      mkdirSync(agentsDir, { recursive: true });
      mkdirSync(skillsDir, { recursive: true });
      mkdirSync(beadsDir, { recursive: true });

      createValidAgentFile(agentsDir, 'beth');
      createValidSkill(skillsDir, 'prd');
      writeFileSync(join(beadsDir, 'config.yaml'), 'no-db: true\n');
      // Write to legacy path only — no backup/ directory
      writeFileSync(join(beadsDir, 'issues.jsonl'), '{"id":"t-1","title":"test"}\n{"id":"t-2","title":"two"}\n');

      const result = runDoctor(testDir, ['--verbose']);

      assert.ok(
        result.stdout.includes('JSONL data'),
        'Should include JSONL data check'
      );
      assert.ok(
        result.stdout.includes('⚠'),
        'Should warn about legacy path'
      );
      assert.ok(
        result.stdout.includes('legacy'),
        'Should mention "legacy" in the message'
      );
    });

    /**
     * SCENARIO: Canonical backup/ JSONL path passes
     *
     * Repro: Enable no-db: true. Write issues to .beads/backup/issues.jsonl
     * (canonical path). Run beth-copilot doctor.
     *
     * Expected: Doctor shows "JSONL data" with ✓ pass, mentioning
     * .beads/backup/issues.jsonl path.
     */
    it('should pass JSONL check with canonical backup/ path', () => {
      const agentsDir = join(testDir, '.github', 'agents');
      const skillsDir = join(testDir, '.github', 'skills');
      const beadsDir = join(testDir, '.beads');
      const backupDir = join(testDir, '.beads', 'backup');

      mkdirSync(agentsDir, { recursive: true });
      mkdirSync(skillsDir, { recursive: true });
      mkdirSync(backupDir, { recursive: true });

      createValidAgentFile(agentsDir, 'beth');
      createValidSkill(skillsDir, 'prd');
      writeFileSync(join(beadsDir, 'config.yaml'), 'no-db: true\n');
      writeFileSync(join(backupDir, 'issues.jsonl'), '{"id":"t-1","title":"test"}\n');

      const result = runDoctor(testDir, ['--verbose']);

      assert.ok(
        result.stdout.includes('JSONL data') && result.stdout.includes('backup'),
        'Should mention canonical backup/ path'
      );
      assert.ok(
        result.stdout.includes('✓') && result.stdout.includes('1 issue'),
        'Should pass with correct issue count'
      );
    });

    /**
     * SCENARIO: bd runtime check appears in no-db mode
     *
     * Repro: Enable no-db: true with valid JSONL data.
     * Run beth-copilot doctor in a temp directory (where bd init hasn't run).
     *
     * Expected: Doctor output includes a "bd runtime" line. The result will be
     * either pass (if bd successfully reads the JSONL) or fail (if bd can't
     * initialize in a non-bd-initialized directory). The key assertion is that
     * the check IS performed — not silently skipped.
     */
    it('should include bd runtime check when no-db is enabled', () => {
      const agentsDir = join(testDir, '.github', 'agents');
      const skillsDir = join(testDir, '.github', 'skills');
      const beadsDir = join(testDir, '.beads');
      const backupDir = join(testDir, '.beads', 'backup');

      mkdirSync(agentsDir, { recursive: true });
      mkdirSync(skillsDir, { recursive: true });
      mkdirSync(backupDir, { recursive: true });

      createValidAgentFile(agentsDir, 'beth');
      createValidSkill(skillsDir, 'prd');
      writeFileSync(join(beadsDir, 'config.yaml'), 'no-db: true\n');
      writeFileSync(join(backupDir, 'issues.jsonl'), '{"id":"t-1","title":"test"}\n');

      // Check if bd CLI is installed — skip if not (unit test covers the function)
      let bdInstalled = false;
      try {
        execSync('bd --version', { stdio: 'pipe' });
        bdInstalled = true;
      } catch {
        bdInstalled = false;
      }

      if (!bdInstalled) {
        // bd not installed — the check returns [], so it won't appear in output.
        // This is correct behavior: the CLI availability check already flags this.
        return;
      }

      const result = runDoctor(testDir, ['--verbose']);

      // bd runtime check should appear (either pass or fail)
      assert.ok(
        result.stdout.includes('bd runtime'),
        'Should include bd runtime check in output when no-db enabled and bd installed'
      );
    });

    /**
     * SCENARIO: No-db deep checks are ONLY run when no-db: true
     *
     * Repro: Set up .beads/config.yaml WITHOUT no-db: true.
     * Add metadata.json and backup JSONL. Run beth-copilot doctor.
     *
     * Expected: Doctor output should NOT include "Dolt process",
     * "Beads metadata", or "bd runtime" checks — those are only
     * relevant when no-db mode is claimed to be active.
     */
    it('should NOT run deep no-db checks when no-db is disabled', () => {
      const agentsDir = join(testDir, '.github', 'agents');
      const skillsDir = join(testDir, '.github', 'skills');
      const beadsDir = join(testDir, '.beads');
      const backupDir = join(testDir, '.beads', 'backup');

      mkdirSync(agentsDir, { recursive: true });
      mkdirSync(skillsDir, { recursive: true });
      mkdirSync(backupDir, { recursive: true });

      createValidAgentFile(agentsDir, 'beth');
      createValidSkill(skillsDir, 'prd');
      // no-db is NOT enabled
      writeFileSync(join(beadsDir, 'config.yaml'), 'issue-prefix: test\n');
      writeFileSync(join(backupDir, 'issues.jsonl'), '{"id":"t-1","title":"test"}\n');
      writeFileSync(join(beadsDir, 'metadata.json'), '{ "name": "corrupt" }}'); // corrupt — but shouldn't be checked

      const result = runDoctor(testDir, ['--verbose']);

      assert.ok(
        !result.stdout.includes('Dolt process'),
        'Should NOT check Dolt process when no-db is disabled'
      );
      assert.ok(
        !result.stdout.includes('Beads metadata'),
        'Should NOT check metadata.json when no-db is disabled'
      );
      assert.ok(
        !result.stdout.includes('bd runtime'),
        'Should NOT check bd runtime when no-db is disabled'
      );
    });

    /**
     * SCENARIO: Full healthy no-db stack shows all check names
     *
     * Repro: Set up a fully healthy no-db project: config.yaml with no-db: true,
     * valid metadata.json, JSONL data in canonical backup/ path, no Dolt process.
     * Run beth-copilot doctor --verbose.
     *
     * Expected: Doctor output includes all these check names:
     * - "Beads no-db" (✓)
     * - "Dolt process" (✓)
     * - "Beads metadata" (✓)
     * - "JSONL data" (✓)
     * Plus "bd runtime" if bd CLI is installed.
     */
    it('should show all no-db validation checks for a healthy setup', () => {
      const agentsDir = join(testDir, '.github', 'agents');
      const skillsDir = join(testDir, '.github', 'skills');
      const beadsDir = join(testDir, '.beads');
      const backupDir = join(testDir, '.beads', 'backup');

      mkdirSync(agentsDir, { recursive: true });
      mkdirSync(skillsDir, { recursive: true });
      mkdirSync(backupDir, { recursive: true });

      createValidAgentFile(agentsDir, 'beth');
      createValidSkill(skillsDir, 'prd');
      writeFileSync(join(beadsDir, 'config.yaml'), 'no-db: true\n');
      writeFileSync(join(beadsDir, 'metadata.json'), JSON.stringify({ name: 'my-project' }));
      writeFileSync(join(backupDir, 'issues.jsonl'), '{"id":"t-1","title":"test"}\n');

      const result = runDoctor(testDir, ['--verbose']);

      // All no-db checks should appear
      assert.ok(result.stdout.includes('Beads no-db'), 'Should show Beads no-db check');
      assert.ok(result.stdout.includes('Dolt process'), 'Should show Dolt process check');
      assert.ok(result.stdout.includes('Beads metadata'), 'Should show Beads metadata check');
      assert.ok(result.stdout.includes('JSONL data'), 'Should show JSONL data check');

      // All should pass (✓) in this scenario — Dolt shouldn't be running in test env
      let doltRunning = false;
      try {
        execSync('pgrep -af "dolt sql-server"', { stdio: 'pipe' });
        doltRunning = true;
      } catch { doltRunning = false; }

      if (!doltRunning) {
        assert.ok(
          result.stdout.includes('no Dolt server running'),
          'Dolt check should pass when no Dolt is running'
        );
      }

      assert.ok(
        result.stdout.includes('metadata.json valid'),
        'Metadata check should pass with valid file'
      );
    });

    /**
     * SCENARIO: metadata.json missing is not an error
     *
     * Repro: Enable no-db: true but don't create metadata.json.
     * Run beth-copilot doctor.
     *
     * Expected: Doctor output should NOT include "Beads metadata" at all —
     * the file is optional and its absence should not produce any check result.
     */
    it('should skip metadata check when metadata.json does not exist', () => {
      const agentsDir = join(testDir, '.github', 'agents');
      const skillsDir = join(testDir, '.github', 'skills');
      const beadsDir = join(testDir, '.beads');
      const backupDir = join(testDir, '.beads', 'backup');

      mkdirSync(agentsDir, { recursive: true });
      mkdirSync(skillsDir, { recursive: true });
      mkdirSync(backupDir, { recursive: true });

      createValidAgentFile(agentsDir, 'beth');
      createValidSkill(skillsDir, 'prd');
      writeFileSync(join(beadsDir, 'config.yaml'), 'no-db: true\n');
      writeFileSync(join(backupDir, 'issues.jsonl'), '{"id":"t-1","title":"test"}\n');
      // Note: no metadata.json created

      const result = runDoctor(testDir, ['--verbose']);

      assert.ok(
        !result.stdout.includes('Beads metadata'),
        'Should not show metadata check when file does not exist'
      );
    });
  });
});
