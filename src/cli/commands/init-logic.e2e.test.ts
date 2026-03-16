/**
 * Init logic unit-style E2E tests — exercises internal init behaviors.
 *
 * beth-ywg.7: bin/cli.js init logic is ~1200 lines inline with zero unit tests.
 * Since the functions aren't exportable (inline CJS), these tests exercise
 * specific behaviors through CLI invocations with controlled filesystem state.
 *
 * Repro steps:
 *   1. Run: npx vitest run src/cli/commands/init-logic.e2e.test.ts
 *
 * Test cases — copyDirRecursive behavior:
 *   - Fresh directory → all files created
 *   - Existing files without --force → skipped (not overwritten)
 *   - Existing files with --force → overwritten
 *   - File exists where directory expected → UserError without --force
 *   - File exists where directory expected + --force → converted to directory
 *
 * Test cases — validateArgs behavior:
 *   - Arguments > 50 chars → exit 1, "input too long"
 *   - Arguments with special chars → exit 1, "unexpected characters"
 *   - Normal arguments → accepted
 *
 * Test cases — Template integrity:
 *   - All 7 agent files copied from templates/
 *   - All 6 skill directories copied
 *   - AGENTS.md copied
 *   - copilot-instructions.md generated/copied
 *   - .vscode/settings.json created
 *
 * Test cases — UserError display:
 *   - Path conflict shows problem/fix/command
 *   - --verbose adds stack trace
 *
 * Expected outcomes documented inline per test case.
 */

import { describe, it, beforeEach, afterEach } from 'vitest';
import assert from 'node:assert';
import { execSync } from 'child_process';
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'fs';
import { join, resolve } from 'path';
import { tmpdir } from 'os';

const CLI_PATH = resolve(join(import.meta.dirname, '..', '..', '..', 'bin', 'cli.js'));

// Expected files that init should create
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

function runInit(
  cwd: string,
  flags: string[] = []
): { stdout: string; stderr: string; code: number } {
  const allFlags = [...flags];
  try {
    const stdout = execSync(
      `node "${CLI_PATH}" init ${allFlags.join(' ')}`,
      {
        cwd,
        encoding: 'utf-8',
        env: { ...process.env, NO_COLOR: '1' },
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 30000,
      }
    );
    return { stdout, stderr: '', code: 0 };
  } catch (error: unknown) {
    const e = error as { stdout?: string; stderr?: string; status?: number };
    return { stdout: e.stdout || '', stderr: e.stderr || '', code: e.status || 1 };
  }
}

describe('init logic: copyDirRecursive behavior', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `beth-init-logic-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('fresh directory (first install)', () => {
    // Expected: all files created, exit 0
    it('should create all agent files', () => {
      const result = runInit(testDir);
      assert.strictEqual(result.code, 0, 'Init should succeed in fresh directory');

      const agentsDir = join(testDir, '.github', 'agents');
      assert.ok(existsSync(agentsDir), '.github/agents should exist');

      for (const agent of EXPECTED_AGENTS) {
        assert.ok(
          existsSync(join(agentsDir, agent)),
          `Agent file ${agent} should be created`
        );
      }
    });

    it('should create all skill directories', () => {
      runInit(testDir);

      const skillsDir = join(testDir, '.github', 'skills');
      assert.ok(existsSync(skillsDir), '.github/skills should exist');

      for (const skill of EXPECTED_SKILLS) {
        const skillPath = join(skillsDir, skill);
        assert.ok(existsSync(skillPath), `Skill directory ${skill} should exist`);
        assert.ok(
          existsSync(join(skillPath, 'SKILL.md')),
          `${skill}/SKILL.md should exist`
        );
      }
    });

    it('should create AGENTS.md at root', () => {
      runInit(testDir);
      assert.ok(
        existsSync(join(testDir, 'AGENTS.md')),
        'AGENTS.md should be created at project root'
      );
    });

    it('should create copilot-instructions.md', () => {
      runInit(testDir);
      const instrPath = join(testDir, '.github', 'copilot-instructions.md');
      assert.ok(existsSync(instrPath), 'copilot-instructions.md should be created');
      const content = readFileSync(instrPath, 'utf-8');
      assert.ok(
        content.includes('Beth') || content.includes('beth'),
        'copilot-instructions.md should reference Beth'
      );
    });

    it('should create hooks directory with skill enforcement', () => {
      runInit(testDir);
      const hooksDir = join(testDir, '.github', 'hooks');
      assert.ok(existsSync(hooksDir), '.github/hooks should exist');
      assert.ok(
        existsSync(join(hooksDir, 'skill-enforcement.json')),
        'skill-enforcement.json should be created'
      );
      const scriptsDir = join(hooksDir, 'scripts');
      assert.ok(existsSync(scriptsDir), '.github/hooks/scripts should exist');
      assert.ok(
        existsSync(join(scriptsDir, 'inject-skills.mjs')),
        'inject-skills.mjs should be created'
      );
      assert.ok(
        existsSync(join(scriptsDir, 'verify-skills.mjs')),
        'verify-skills.mjs should be created'
      );
    });
  });

  describe('overwrite protection (no --force)', () => {
    // Expected: existing files preserved, new files created
    it('should not overwrite existing agent files', () => {
      // First init
      runInit(testDir);

      // Modify an agent file
      const bethPath = join(testDir, '.github', 'agents', 'beth.agent.md');
      writeFileSync(bethPath, 'CUSTOM CONTENT');

      // Second init without --force
      const result = runInit(testDir);
      assert.strictEqual(result.code, 0, 'Second init should succeed');

      // Verify custom content preserved
      const content = readFileSync(bethPath, 'utf-8');
      assert.strictEqual(
        content,
        'CUSTOM CONTENT',
        'Existing agent file should not be overwritten'
      );
    });

    it('should report skipped files', () => {
      runInit(testDir);
      const result = runInit(testDir);
      const combined = result.stdout + result.stderr;
      assert.ok(
        combined.includes('Skipped') || combined.includes('exists') || combined.includes('skip'),
        'Should report that files were skipped'
      );
    });
  });

  describe('--force overwrite', () => {
    // Expected: all files overwritten with template versions
    it('should overwrite existing files with --force', () => {
      // First init
      runInit(testDir);

      // Modify an agent file
      const bethPath = join(testDir, '.github', 'agents', 'beth.agent.md');
      writeFileSync(bethPath, 'CUSTOM CONTENT');

      // Second init with --force
      const result = runInit(testDir, ['--force']);
      assert.strictEqual(result.code, 0, 'Force init should succeed');

      // Verify content was replaced
      const content = readFileSync(bethPath, 'utf-8');
      assert.notStrictEqual(
        content,
        'CUSTOM CONTENT',
        'File should be overwritten with --force'
      );
      assert.ok(
        content.includes('Beth') || content.includes('name:'),
        'Overwritten content should be the template'
      );
    });
  });

  describe('path conflict: file exists where directory expected', () => {
    // Expected: UserError without --force, handled with --force
    it('should error when .github is a file not a directory', () => {
      // Create .github as a file
      writeFileSync(join(testDir, '.github'), 'not a directory');

      const result = runInit(testDir);
      assert.strictEqual(result.code, 1, 'Should exit 1 for path conflict');
      const combined = result.stdout + result.stderr;
      assert.ok(
        combined.includes('conflict') || combined.includes('exists as a file') || combined.includes('Error'),
        'Should indicate path conflict'
      );
    });

    it('should handle path conflict with --force', () => {
      // Create .github as a file
      writeFileSync(join(testDir, '.github'), 'not a directory');

      const result = runInit(testDir, ['--force']);
      assert.strictEqual(result.code, 0, 'Should succeed with --force converting file to directory');
      assert.ok(
        statSync(join(testDir, '.github')).isDirectory(),
        '.github should be a directory after --force'
      );
    });
  });

  describe('--skip-backlog flag', () => {
    // Expected: Backlog.md not created
    it('should skip Backlog.md creation', () => {
      const result = runInit(testDir, ['--skip-backlog']);
      assert.strictEqual(result.code, 0 );
      assert.ok(
        !existsSync(join(testDir, 'Backlog.md')),
        'Backlog.md should not be created with --skip-backlog'
      );
    });
  });

  describe('--skip-mcp flag', () => {
    // Expected: mcp.json.example not created
    it('should skip MCP config creation', () => {
      const result = runInit(testDir, ['--skip-mcp']);
      assert.strictEqual(result.code, 0);
      assert.ok(
        !existsSync(join(testDir, 'mcp.json.example')),
        'mcp.json.example should not be created with --skip-mcp'
      );
    });
  });
});

describe('init logic: validateArgs behavior', () => {
  // These test the input validation that runs before command dispatch

  it('should reject arguments over 50 characters', () => {
    const longArg = 'a'.repeat(51);
    try {
      execSync(`node "${CLI_PATH}" ${longArg}`, {
        encoding: 'utf-8',
        env: { ...process.env, NO_COLOR: '1' },
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 15000,
      });
      assert.fail('Should have exited non-zero');
    } catch (error: unknown) {
      const e = error as { status?: number; stdout?: string; stderr?: string };
      assert.strictEqual(e.status, 1, 'Should exit 1 for oversized argument');
      // logError uses console.log (stdout), not console.error
      const combined = (e.stdout || '') + (e.stderr || '');
      assert.ok(
        combined.includes('too long') || combined.includes('Invalid'),
        'Should indicate input too long'
      );
    }
  });

  it('should reject arguments with special characters', () => {
    try {
      execSync(`node "${CLI_PATH}" "init;whoami"`, {
        encoding: 'utf-8',
        env: { ...process.env, NO_COLOR: '1' },
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 15000,
      });
      assert.fail('Should have exited non-zero');
    } catch (error: unknown) {
      const e = error as { status?: number; stderr?: string };
      assert.strictEqual(e.status, 1, 'Should exit 1 for special characters');
    }
  });

  it('should accept normal alphanumeric arguments', () => {
    // 'help' is clean — should pass validation
    const stdout = execSync(`node "${CLI_PATH}" help`, {
      encoding: 'utf-8',
      env: { ...process.env, NO_COLOR: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 15000,
    });
    assert.ok(stdout.length > 0, 'help should produce output');
  });
});

describe('init logic: template integrity', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `beth-init-integrity-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should install exactly 7 agent files', () => {
    runInit(testDir);
    const agentsDir = join(testDir, '.github', 'agents');
    if (!existsSync(agentsDir)) {
      assert.fail('.github/agents directory should exist');
      return;
    }
    const agents = readdirSync(agentsDir).filter((f) => f.endsWith('.agent.md'));
    assert.strictEqual(agents.length, 7, `Expected 7 agents, got ${agents.length}: ${agents.join(', ')}`);
  });

  it('should install exactly 6 skill directories', () => {
    runInit(testDir);
    const skillsDir = join(testDir, '.github', 'skills');
    if (!existsSync(skillsDir)) {
      assert.fail('.github/skills directory should exist');
      return;
    }
    const skills = readdirSync(skillsDir).filter((f) =>
      statSync(join(skillsDir, f)).isDirectory()
    );
    assert.strictEqual(skills.length, 6, `Expected 6 skills, got ${skills.length}: ${skills.join(', ')}`);
  });

  it('should create .vscode/settings.json', () => {
    runInit(testDir);
    const settingsPath = join(testDir, '.vscode', 'settings.json');
    assert.ok(existsSync(settingsPath), '.vscode/settings.json should be created');
    // settings.json is JSONC (has comments) — verify it exists and has content
    const content = readFileSync(settingsPath, 'utf-8');
    assert.ok(content.length > 10, 'settings.json should have meaningful content');
    assert.ok(content.includes('{'), 'settings.json should contain JSON structure');
  });

  it('should create agent files with valid YAML frontmatter', () => {
    runInit(testDir);
    const agentsDir = join(testDir, '.github', 'agents');
    for (const agent of EXPECTED_AGENTS) {
      const content = readFileSync(join(agentsDir, agent), 'utf-8');
      assert.ok(
        content.startsWith('---'),
        `${agent} should start with YAML frontmatter delimiter`
      );
      // Should have closing delimiter
      const secondDelimiter = content.indexOf('---', 3);
      assert.ok(
        secondDelimiter > 3,
        `${agent} should have closing YAML frontmatter delimiter`
      );
    }
  });

  it('should create skill SKILL.md files with content', () => {
    runInit(testDir);
    const skillsDir = join(testDir, '.github', 'skills');
    for (const skill of EXPECTED_SKILLS) {
      const skillMd = join(skillsDir, skill, 'SKILL.md');
      assert.ok(existsSync(skillMd), `${skill}/SKILL.md should exist`);
      const content = readFileSync(skillMd, 'utf-8');
      assert.ok(content.length > 10, `${skill}/SKILL.md should have meaningful content`);
    }
  });
});

describe('init logic: backlog prefix derivation', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `beth-prefix-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    mkdirSync(testDir, { recursive: true });
    // backlog init requires a git repo
    execSync('git init', { cwd: testDir, stdio: 'pipe' });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  /**
   * Helper to check if backlog CLI is available.
   * Tests are skipped if backlog isn't installed.
   */
  function backlogAvailable(): boolean {
    try {
      execSync('backlog --version', { stdio: 'pipe', timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  it('should derive prefix from package.json name field', () => {
    if (!backlogAvailable()) return; // skip if backlog not installed

    // Create a package.json with a hyphenated name
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({ name: 'Claude-Opus-Model' })
    );

    const result = runInit(testDir);
    assert.strictEqual(result.code, 0, `Init should succeed. stdout: ${result.stdout}`);

    const configPath = join(testDir, 'backlog', 'config.yml');
    assert.ok(existsSync(configPath), 'backlog/config.yml should be created');
    const config = readFileSync(configPath, 'utf-8');
    assert.ok(
      config.includes('task_prefix: "CLAUDE"'),
      `Expected prefix CLAUDE, got config: ${config}`
    );
  });

  it('should truncate prefix to 6 characters', () => {
    if (!backlogAvailable()) return;

    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({ name: 'enterprise-application-server' })
    );

    const result = runInit(testDir);
    assert.strictEqual(result.code, 0);

    const config = readFileSync(join(testDir, 'backlog', 'config.yml'), 'utf-8');
    assert.ok(
      config.includes('task_prefix: "ENTERP"'),
      `Expected prefix ENTERP (6 chars), got config: ${config}`
    );
  });

  it('should use short prefix as-is when under 6 characters', () => {
    if (!backlogAvailable()) return;

    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({ name: 'api-gateway' })
    );

    const result = runInit(testDir);
    assert.strictEqual(result.code, 0);

    const config = readFileSync(join(testDir, 'backlog', 'config.yml'), 'utf-8');
    assert.ok(
      config.includes('task_prefix: "API"'),
      `Expected prefix API, got config: ${config}`
    );
  });

  it('should strip npm scope from package name', () => {
    if (!backlogAvailable()) return;

    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({ name: '@myorg/widget-factory' })
    );

    const result = runInit(testDir);
    assert.strictEqual(result.code, 0);

    const config = readFileSync(join(testDir, 'backlog', 'config.yml'), 'utf-8');
    assert.ok(
      config.includes('task_prefix: "WIDGET"'),
      `Expected prefix WIDGET (scope stripped), got config: ${config}`
    );
  });

  it('should fall back to directory name when no package.json', () => {
    if (!backlogAvailable()) return;

    // No package.json — should use directory name
    // Directory name is something like beth-prefix-<timestamp>-<random>
    // First segment before hyphen would be "beth"
    const result = runInit(testDir);
    assert.strictEqual(result.code, 0);

    const config = readFileSync(join(testDir, 'backlog', 'config.yml'), 'utf-8');
    // Directory starts with "beth-prefix-..." so prefix should be "BETH"
    assert.ok(
      config.includes('task_prefix: "BETH"'),
      `Expected prefix BETH from dir name, got config: ${config}`
    );
  });

  it('should skip backlog init when --skip-backlog is used', () => {
    if (!backlogAvailable()) return;

    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({ name: 'test-project' })
    );

    const result = runInit(testDir, ['--skip-backlog']);
    assert.strictEqual(result.code, 0);

    const configPath = join(testDir, 'backlog', 'config.yml');
    assert.ok(!existsSync(configPath), 'backlog/config.yml should NOT exist with --skip-backlog');
  });

  it('should not re-init if backlog/config.yml already exists', () => {
    if (!backlogAvailable()) return;

    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({ name: 'first-project' })
    );

    // First init
    runInit(testDir);
    const config1 = readFileSync(join(testDir, 'backlog', 'config.yml'), 'utf-8');
    assert.ok(config1.includes('task_prefix: "FIRST"'));

    // Change package.json name
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({ name: 'second-project' })
    );

    // Second init without --force should preserve existing config
    runInit(testDir);
    const config2 = readFileSync(join(testDir, 'backlog', 'config.yml'), 'utf-8');
    assert.ok(
      config2.includes('task_prefix: "FIRST"'),
      'Should preserve existing prefix without --force'
    );
  });
});
