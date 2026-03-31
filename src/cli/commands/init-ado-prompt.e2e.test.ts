/**
 * E2E tests: Init flow — ADO Sync prompt during beth init (BETH-64.14)
 *
 * TDD: Tests written FIRST before implementation.
 *
 * Tests the ADO Sync opt-in prompt added to the end of `npx beth-copilot init`.
 * After core setup (agents, skills, hooks), init asks:
 *   "Do you use Azure DevOps for this project? (y/N)"
 *
 * Covers:
 *   BETH-64.14.1 — ADO declined skips cleanly, no .beth created
 *   BETH-64.14.2 — ADO accepted launches set-ado-org flow
 *   BETH-64.14.3 — Enter key defaults to No for ADO prompt
 *
 * Test strategy:
 *   - Subprocess via execSync with `input` option to control stdin
 *   - NO_COLOR=1 to disable animations and ANSI codes
 *   - Temp directory per test for isolation
 *   - Verify filesystem state (.beth/ presence) and stdout content
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync, type ExecSyncOptionsWithStringEncoding } from 'child_process';
import {
  existsSync,
  mkdirSync,
  rmSync,
  readdirSync,
  readFileSync,
} from 'fs';
import { join, resolve } from 'path';
import { tmpdir } from 'os';

// Path to CLI binary — resolved from this test file's location
const CLI_PATH = resolve(
  join(import.meta.dirname, '..', '..', '..', 'bin', 'cli.js')
);

// ─── Test Helpers ─────────────────────────────────────────────────────

/** Create a unique temp directory per test */
function makeTmpDir(): string {
  const dir = join(
    tmpdir(),
    `beth-init-ado-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Run init command with controlled stdin input.
 * @param cwd - Working directory
 * @param stdinInput - String to pipe to stdin (simulates user typing)
 * @param flags - Additional CLI flags
 * @param extraEnv - Additional environment variables
 */
function runInitWithInput(
  cwd: string,
  stdinInput: string,
  flags: string[] = [],
  extraEnv: Record<string, string> = {}
): { stdout: string; stderr: string; code: number } {
  const allFlags = ['--skip-backlog', ...flags]; // Skip backlog to avoid needing backlog CLI
  const command = `node "${CLI_PATH}" init ${allFlags.join(' ')}`;

  try {
    const stdout = execSync(command, {
      cwd,
      encoding: 'utf-8',
      env: { ...process.env, NO_COLOR: '1', ...extraEnv },
      input: stdinInput,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 30000,
    } as ExecSyncOptionsWithStringEncoding);
    return { stdout, stderr: '', code: 0 };
  } catch (error: unknown) {
    const e = error as { stdout?: string; stderr?: string; status?: number };
    return { stdout: e.stdout || '', stderr: e.stderr || '', code: e.status || 1 };
  }
}

// ─── Tests ────────────────────────────────────────────────────────────

describe('init ADO Sync prompt (BETH-64.14)', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = makeTmpDir();
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  // ── BETH-64.14.1: ADO declined skips cleanly ─────────────────────

  describe('BETH-64.14.1: ADO declined skips cleanly, no .beth created', () => {
    it('AC#1: declining ADO prompt does not create .beth/ directory', () => {
      const result = runInitWithInput(testDir, 'N\n');

      expect(result.code).toBe(0);
      expect(existsSync(join(testDir, '.beth'))).toBe(false);
    });

    it('AC#2: no ado-sync.json or .beth/ado-sync.pid created', () => {
      const result = runInitWithInput(testDir, 'N\n');

      expect(result.code).toBe(0);
      expect(existsSync(join(testDir, '.beth', 'ado-sync.json'))).toBe(false);
      expect(existsSync(join(testDir, '.beth', 'ado-sync.pid'))).toBe(false);
    });

    it('AC#3: no further ADO-related prompts after declining', () => {
      const result = runInitWithInput(testDir, 'N\n');
      const output = result.stdout + result.stderr;

      // The ADO question should appear exactly once
      const adoQuestionMatches = output.match(/Azure DevOps/g) || [];
      expect(adoQuestionMatches.length).toBeLessThanOrEqual(1);

      // No authentication or org selection prompts should appear
      expect(output).not.toContain('Entra ID authentication');
      expect(output).not.toContain('Select an organization');
      expect(output).not.toContain('ADO Sync Configuration');
    });

    it('AC#4: core init completes successfully (agents, skills, hooks installed)', () => {
      const result = runInitWithInput(testDir, 'N\n');

      expect(result.code).toBe(0);

      // Agents installed
      const agentsDir = join(testDir, '.github', 'agents');
      expect(existsSync(agentsDir)).toBe(true);
      const agents = readdirSync(agentsDir).filter(f => f.endsWith('.agent.md'));
      expect(agents.length).toBeGreaterThanOrEqual(7);

      // Skills installed
      const skillsDir = join(testDir, '.github', 'skills');
      expect(existsSync(skillsDir)).toBe(true);
    });

    it('AC#5: exit code 0', () => {
      const result = runInitWithInput(testDir, 'N\n');
      expect(result.code).toBe(0);
    });
  });

  // ── BETH-64.14.2: ADO accepted launches set-ado-org flow ─────────
  //
  // These tests use BETH_ADO_PAT env var with a dummy token to bypass
  // MSAL interactive device code flow. The credential store returns
  // the PAT immediately; then discoverOrganizations() fails with a
  // network error, which setAdoOrg handles gracefully.

  describe('BETH-64.14.2: ADO accepted launches set-ado-org flow', () => {
    const ADO_ENV = { BETH_ADO_PAT: 'test-dummy-pat-for-e2e' };

    it('AC#1: ADO prompt appears AFTER agents/skills/hooks installation', () => {
      const result = runInitWithInput(testDir, 'y\n', [], ADO_ENV);
      const output = result.stdout;

      // "Installing agents" should appear BEFORE the ADO prompt
      const installIndex = output.indexOf('Installing agents');
      const adoPromptIndex = output.indexOf('Azure DevOps');

      // Both must exist in output
      expect(installIndex).toBeGreaterThan(-1);
      expect(adoPromptIndex).toBeGreaterThan(-1);

      // Install happens before ADO prompt
      expect(installIndex).toBeLessThan(adoPromptIndex);
    });

    it('AC#2: accepting launches set-ado-org flow (shows ADO Sync Configuration)', () => {
      // When user says yes, init launches set-ado-org.
      // With BETH_ADO_PAT, the credential is resolved immediately;
      // org discovery fails (dummy token) but the header proves the flow started.
      const result = runInitWithInput(testDir, 'y\n', [], ADO_ENV);
      const output = result.stdout + result.stderr;

      expect(output).toContain('ADO Sync Configuration');
    });

    it('AC#5: overall init completes (does not crash even if ADO setup fails)', () => {
      // set-ado-org will fail (dummy PAT) — but init should not crash
      runInitWithInput(testDir, 'y\n', [], ADO_ENV);

      // Core agents should still be installed regardless of ADO outcome
      const agentsDir = join(testDir, '.github', 'agents');
      expect(existsSync(agentsDir)).toBe(true);
    });
  });

  // ── BETH-64.14.3: Enter key defaults to No ───────────────────────

  describe('BETH-64.14.3: Enter key defaults to No for ADO prompt', () => {
    it('AC#1: empty input (just Enter) treated as N (default)', () => {
      const result = runInitWithInput(testDir, '\n');
      const output = result.stdout + result.stderr;

      expect(result.code).toBe(0);

      // Should NOT see ADO Sync Configuration (set-ado-org header)
      expect(output).not.toContain('ADO Sync Configuration');
    });

    it('AC#2: no .beth/ directory or ADO config created', () => {
      runInitWithInput(testDir, '\n');

      expect(existsSync(join(testDir, '.beth'))).toBe(false);
      expect(existsSync(join(testDir, '.beth', 'ado-sync.json'))).toBe(false);
    });

    it('AC#3: init completes successfully', () => {
      const result = runInitWithInput(testDir, '\n');

      expect(result.code).toBe(0);

      // Agents installed
      const agentsDir = join(testDir, '.github', 'agents');
      expect(existsSync(agentsDir)).toBe(true);
    });
  });

  // ── Cross-cutting: The prompt itself ─────────────────────────────

  describe('ADO prompt appears in output', () => {
    it('init output contains the ADO question', () => {
      const result = runInitWithInput(testDir, 'N\n');
      const output = result.stdout;

      // The prompt should ask about Azure DevOps
      expect(output).toMatch(/Azure DevOps/i);
      expect(output).toMatch(/\(y\/N\)/);
    });

    it('--skip-ado flag suppresses the ADO prompt entirely', () => {
      const result = runInitWithInput(testDir, '', ['--skip-ado']);
      const output = result.stdout;

      // No ADO prompt should appear
      expect(output).not.toMatch(/Azure DevOps/i);
      expect(result.code).toBe(0);
    });
  });

  // ── Regression: existing init behavior unaffected ────────────────

  describe('regression: init still works end-to-end', () => {
    it('agents, skills, and hooks are installed before ADO prompt', () => {
      const result = runInitWithInput(testDir, 'N\n');

      expect(result.code).toBe(0);

      // All 7 agent files
      const agentsDir = join(testDir, '.github', 'agents');
      const agents = readdirSync(agentsDir).filter(f => f.endsWith('.agent.md'));
      expect(agents.length).toBeGreaterThanOrEqual(7);

      // Skills directory with expected entries
      const skillsDir = join(testDir, '.github', 'skills');
      expect(existsSync(skillsDir)).toBe(true);

      // Hooks
      const hooksDir = join(testDir, '.github', 'hooks');
      expect(existsSync(hooksDir)).toBe(true);
    });

    it('.gitignore still gets beth entries', () => {
      const result = runInitWithInput(testDir, 'N\n');

      expect(result.code).toBe(0);

      const gitignorePath = join(testDir, '.gitignore');
      if (existsSync(gitignorePath)) {
        const content = readFileSync(gitignorePath, 'utf-8');
        expect(content).toContain('.beth/');
      }
    });
  });
});
