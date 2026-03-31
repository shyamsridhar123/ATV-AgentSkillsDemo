/**
 * Unit tests for ensureBethGitignore() function in bin/cli.js.
 *
 * Since bin/cli.js doesn't export functions (it's a CLI entry point),
 * these tests exercise the same contract by running `node bin/cli.js init`
 * in temp directories and verifying .gitignore state.
 *
 * BETH-65.4
 */

import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'fs';
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

describe('ensureBethGitignore (BETH-65.4)', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `beth-gitignore-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('creates .gitignore with beth section when no .gitignore exists', () => {
    runInit(testDir);

    const gitignorePath = join(testDir, '.gitignore');
    expect(existsSync(gitignorePath)).toBe(true);

    const content = readFileSync(gitignorePath, 'utf-8');
    expect(content).toContain(MARKER_BEGIN);
    expect(content).toContain(MARKER_END);
    expect(content).toContain('.beth/');
  });

  it('appends beth section to existing .gitignore without beth marker', () => {
    const gitignorePath = join(testDir, '.gitignore');
    const existingContent = 'node_modules/\ndist/\n';
    writeFileSync(gitignorePath, existingContent, 'utf-8');

    runInit(testDir);

    const content = readFileSync(gitignorePath, 'utf-8');
    // Existing content preserved
    expect(content).toContain('node_modules/');
    expect(content).toContain('dist/');
    // Beth section appended
    expect(content).toContain(MARKER_BEGIN);
    expect(content).toContain('.beth/');
    expect(content).toContain(MARKER_END);
  });

  it('is idempotent — skips when beth marker already present', () => {
    const gitignorePath = join(testDir, '.gitignore');
    const contentWithBeth = `node_modules/\n\n${MARKER_BEGIN}\n.beth/\n${MARKER_END}\n`;
    writeFileSync(gitignorePath, contentWithBeth, 'utf-8');

    runInit(testDir);

    const content = readFileSync(gitignorePath, 'utf-8');
    // Count occurrences of marker — should be exactly 1
    const beginCount = content.split(MARKER_BEGIN).length - 1;
    expect(beginCount).toBe(1);
  });

  it('preserves existing .gitignore content exactly (no reordering/trimming)', () => {
    const gitignorePath = join(testDir, '.gitignore');
    const existingContent = '# My project\nnode_modules/\n\n# Build\ndist/\nbuild/\n';
    writeFileSync(gitignorePath, existingContent, 'utf-8');

    runInit(testDir);

    const content = readFileSync(gitignorePath, 'utf-8');
    // All original lines preserved in order
    expect(content.startsWith('# My project\nnode_modules/\n\n# Build\ndist/\nbuild/\n')).toBe(true);
  });

  it('adds blank line separator when existing .gitignore has no trailing newline', () => {
    const gitignorePath = join(testDir, '.gitignore');
    writeFileSync(gitignorePath, 'node_modules/', 'utf-8'); // no trailing newline

    runInit(testDir);

    const content = readFileSync(gitignorePath, 'utf-8');
    // Should have newline separation between existing and beth section
    const markerIdx = content.indexOf(MARKER_BEGIN);
    expect(markerIdx).toBeGreaterThan(0);
    // Check there's a newline before the marker
    const beforeMarker = content.slice(0, markerIdx);
    expect(beforeMarker.endsWith('\n')).toBe(true);
  });

  it('does not create double blank lines when .gitignore already has trailing newline', () => {
    const gitignorePath = join(testDir, '.gitignore');
    writeFileSync(gitignorePath, 'node_modules/\n', 'utf-8'); // has trailing newline

    runInit(testDir);

    const content = readFileSync(gitignorePath, 'utf-8');
    // Should NOT have triple+ newlines
    expect(content).not.toMatch(/\n{4,}/);
  });

  it('--force replaces existing beth section with fresh entries', () => {
    const gitignorePath = join(testDir, '.gitignore');
    // Simulate an old/stale beth section
    const staleContent = `node_modules/\n\n${MARKER_BEGIN}\n.beth/old-entry/\nstale-stuff/\n${MARKER_END}\n`;
    writeFileSync(gitignorePath, staleContent, 'utf-8');

    runInit(testDir, ['--force']);

    const content = readFileSync(gitignorePath, 'utf-8');
    // Old entries should be gone
    expect(content).not.toContain('.beth/old-entry/');
    expect(content).not.toContain('stale-stuff/');
    // Fresh entries should be there
    expect(content).toContain(MARKER_BEGIN);
    expect(content).toContain('.beth/');
    expect(content).toContain(MARKER_END);
    // Existing content preserved
    expect(content).toContain('node_modules/');
    // Still only one marker block
    const beginCount = content.split(MARKER_BEGIN).length - 1;
    expect(beginCount).toBe(1);
  });
});
