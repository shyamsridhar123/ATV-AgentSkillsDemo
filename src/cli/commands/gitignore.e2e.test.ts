/**
 * E2E test: init creates correct .gitignore in fresh project.
 *
 * Simulates a real user running `npx beth-copilot init` for the first time
 * in a fresh git-initialized project.
 *
 * BETH-65.5
 */

import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const CLI_PATH = join(process.cwd(), 'bin', 'cli.js');

const MARKER_BEGIN = '# >>> Beth — managed by beth-copilot init >>>';
const MARKER_END = '# <<< Beth <<<';

function runInit(cwd: string, flags: string[] = []): string {
  const command = `node "${CLI_PATH}" init --skip-backlog ${flags.join(' ')}`;
  try {
    return execSync(command, {
      cwd,
      encoding: 'utf-8',
      env: { ...process.env, NO_COLOR: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (error: unknown) {
    return (error as { stdout?: string }).stdout || '';
  }
}

describe('E2E: init .gitignore in fresh project (BETH-65.5)', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `beth-e2e-gitignore-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
    // Simulate a fresh project: git init + npm init
    execSync('git init', { cwd: testDir, stdio: 'pipe' });
    execSync('npm init -y', { cwd: testDir, stdio: 'pipe' });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('creates .gitignore with beth section in fresh project', () => {
    runInit(testDir);

    const gitignorePath = join(testDir, '.gitignore');
    expect(existsSync(gitignorePath)).toBe(true);

    const content = readFileSync(gitignorePath, 'utf-8');
    expect(content).toContain(MARKER_BEGIN);
    expect(content).toContain('.beth/');
    expect(content).toContain(MARKER_END);
  });

  it('running init twice does not duplicate entries', () => {
    runInit(testDir);
    runInit(testDir);

    const content = readFileSync(join(testDir, '.gitignore'), 'utf-8');
    const beginCount = content.split(MARKER_BEGIN).length - 1;
    expect(beginCount).toBe(1);
  });

  it('init output mentions .gitignore', () => {
    const output = runInit(testDir);
    expect(output).toMatch(/\.gitignore/i);
  });
});
