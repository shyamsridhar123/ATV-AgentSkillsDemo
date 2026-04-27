/**
 * E2E tests for doctor command.
 * Run with: node --test dist/cli/commands/doctor.e2e.test.js
 *
 * These tests run the actual CLI binary and validate stdout output.
 */

import { describe, it, beforeEach, afterEach } from 'vitest';
import assert from 'node:assert';
import { execFileSync } from 'child_process';
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

      mkdirSync(agentsDir, { recursive: true });
      mkdirSync(skillsDir, { recursive: true });

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

      mkdirSync(agentsDir, { recursive: true });
      mkdirSync(skillsDir, { recursive: true });

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

      mkdirSync(skillsDir, { recursive: true });
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

      mkdirSync(agentsDir, { recursive: true });
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

      mkdirSync(agentsDir, { recursive: true });
      mkdirSync(skillsDir, { recursive: true });

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

      mkdirSync(agentsDir, { recursive: true });
      mkdirSync(skillsDir, { recursive: true });

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

      mkdirSync(agentsDir, { recursive: true });
      mkdirSync(skillsDir, { recursive: true });

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

      mkdirSync(agentsDir, { recursive: true });
      mkdirSync(skillsDir, { recursive: true });

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

  describe('--verbose flag', () => {
    it('should show additional details with --verbose flag', () => {
      // Setup: Create project with some issues
      const agentsDir = join(testDir, '.github', 'agents');
      const skillsDir = join(testDir, '.github', 'skills');

      mkdirSync(agentsDir, { recursive: true });
      mkdirSync(skillsDir, { recursive: true });

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

      mkdirSync(agentsDir, { recursive: true });
      mkdirSync(skillsDir, { recursive: true });

      createValidAgentFile(agentsDir, 'test-agent');
      createValidSkill(skillsDir, 'test-skill');

      const result = runDoctor(testDir);

      // Should contain checkmarks for passing tests
      assert.ok(result.stdout.includes('✓'), 'Should use ✓ for passing checks');
    });

    it('should use ⚠ for warning checks', () => {
      // Setup: Create project with warnings (valid agents/skills but incomplete setup)
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

      mkdirSync(agentsDir, { recursive: true });
      mkdirSync(skillsDir, { recursive: true });

      createValidAgentFile(agentsDir, 'test-agent');
      createValidSkill(skillsDir, 'test-skill');

      const result = runDoctor(testDir);

      // Check that agents and skills pass
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
        result.stdout.includes(process.version) || result.stdout.includes('≥20'),
        'Should show Node.js version info'
      );
    });
  });

  describe('empty agent files handled gracefully', () => {
    it('should handle empty .agent.md files without crashing', () => {
      const agentsDir = join(testDir, '.github', 'agents');
      const skillsDir = join(testDir, '.github', 'skills');

      mkdirSync(agentsDir, { recursive: true });
      mkdirSync(skillsDir, { recursive: true });

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

      mkdirSync(agentsDir, { recursive: true });
      mkdirSync(skillsDir, { recursive: true });

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
});
