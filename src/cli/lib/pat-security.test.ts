/**
 * PAT Security Tests (BETH-64.17.3)
 *
 * TDD: Tests written FIRST — PAT must NEVER appear in config, logs, or errors.
 *
 * Acceptance Criteria:
 *   AC#1: PAT value not present in .beth/ado-sync.json after storage
 *   AC#2: PAT value not present in any console.log or console.error output
 *   AC#3: PAT value not present in error messages or stack traces on failure
 *   AC#4: authMethod set to 'pat' in config (not the actual PAT value)
 *   AC#5: PAT input uses masked/no-echo readline
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  existsSync,
  rmSync,
} from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';

/** ESM-safe __dirname */
const __dirname = dirname(fileURLToPath(import.meta.url));

import {
  saveConfig,
  createConfig,
  loadConfig,
  validateConfig,
  getConfigPath,
  getBethDir,
} from './adoSyncConfig.js';

/** Create a unique temp directory per test */
function makeTmpDir(): string {
  const dir = join(
    tmpdir(),
    `beth-pat-sec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Realistic PAT values for testing — covers all known ADO PAT formats.
 * These simulate what a user might paste in.
 */
const TEST_PATS = [
  'nzp2dw4x7lqzp3ydjgbz3hs4xqjyj3h6rfgtmqe5yzpfm7ycvuq',  // Classic ADO PAT (52 chars)
  'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.fakesig',  // JWT-like token
  'AAAAABBBBBCCCCCDDDDDEEEEEFFFFFGGGGGHHHHHIIIIIJJJJJKKKKK',  // 52-char alphanumeric
  '52charpadding000000000000000000000000000000000000000000',   // Exactly 52 chars
];

describe('BETH-64.17.3: PAT security — never in config, logs, or error messages', () => {
  let projectRoot: string;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    projectRoot = makeTmpDir();
    delete process.env['BETH_ADO_PAT'];
    delete process.env['BETH_ADO_TOKEN'];
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
    process.env = { ...originalEnv };
  });

  // ═══════════════════════════════════════════════════════════════════
  // AC#1: PAT value not present in .beth/ado-sync.json after storage
  // ═══════════════════════════════════════════════════════════════════

  describe('AC#1: PAT never in config file', () => {
    it('PAT env var does not leak into config when authMethod is "pat"', () => {
      for (const pat of TEST_PATS) {
        process.env['BETH_ADO_PAT'] = pat;

        const tmpDir = makeTmpDir();
        createConfig(tmpDir, 'my-org', 'my-proj', { authMethod: 'pat' });

        const raw = readFileSync(getConfigPath(tmpDir), 'utf-8');
        expect(raw).not.toContain(pat);

        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('BETH_ADO_TOKEN env var does not leak into config', () => {
      const tokenValue = 'token-that-must-never-persist-to-disk';
      process.env['BETH_ADO_TOKEN'] = tokenValue;

      createConfig(projectRoot, 'org', 'proj', { authMethod: 'pat' });

      const raw = readFileSync(getConfigPath(projectRoot), 'utf-8');
      expect(raw).not.toContain(tokenValue);
      expect(raw).not.toContain('BETH_ADO_TOKEN');
    });

    it('no PAT values anywhere in .beth/ directory after config save', () => {
      const pat = 'unique-pat-value-that-must-not-exist-on-disk';
      process.env['BETH_ADO_PAT'] = pat;

      createConfig(projectRoot, 'org', 'proj', { authMethod: 'pat' });

      const bethDir = getBethDir(projectRoot);
      if (existsSync(bethDir)) {
        const files = readdirSync(bethDir);
        for (const file of files) {
          const content = readFileSync(join(bethDir, file), 'utf-8');
          expect(content).not.toContain(pat);
        }
      }
    });

    it('PAT field injected directly into config is rejected by saveConfig', () => {
      expect(() =>
        saveConfig(projectRoot, {
          organization: 'org',
          project: 'proj',
          authMethod: 'pat',
          taskPrefix: 'BETH',
          tasksDir: './backlog/tasks',
          // @ts-expect-error — intentional injection attempt
          pat: 'stolen-pat-value',
        })
      ).toThrow();

      // Config file should not exist (rejected before write)
      expect(existsSync(getConfigPath(projectRoot))).toBe(false);
    });

    it('accessToken field injection is blocked by validateConfig', () => {
      const errors = validateConfig({
        organization: 'org',
        project: 'proj',
        authMethod: 'pat',
        taskPrefix: 'BETH',
        tasksDir: '.',
        accessToken: 'test-fake-token-for-validation-check',
      });

      expect(errors.length).toBeGreaterThan(0);
      // Error message must NOT contain the actual token value
      for (const err of errors) {
        expect(err).not.toContain('nzp2dw4x7lqzp3ydjgbz3hs4xqjyj3h6rfgtmqe5yzpfm7ycvuq');
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // AC#2: PAT value not present in any console.log or console.error output
  // ═══════════════════════════════════════════════════════════════════

  describe('AC#2: PAT never in console output', () => {
    afterEach(() => vi.restoreAllMocks());

    it('console.log never receives PAT during config creation', () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const pat = 'console-test-pat-value-must-not-appear';
      process.env['BETH_ADO_PAT'] = pat;

      createConfig(projectRoot, 'org', 'proj', { authMethod: 'pat' });

      for (const call of logSpy.mock.calls) {
        const output = call.map(String).join(' ');
        expect(output).not.toContain(pat);
      }
      for (const call of errorSpy.mock.calls) {
        const output = call.map(String).join(' ');
        expect(output).not.toContain(pat);
      }
    });

    it('console.error never receives PAT during config validation failure', () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});

      const pat = 'validation-error-pat-leak-check';

      try {
        saveConfig(projectRoot, {
          organization: 'org',
          project: 'proj',
          authMethod: 'pat',
          taskPrefix: 'BETH',
          tasksDir: '.',
          // @ts-expect-error — deliberate injection
          accessToken: pat,
        });
      } catch {
        // Expected to throw — we're checking console output
      }

      for (const call of vi.mocked(console.error).mock.calls) {
        const output = call.map(String).join(' ');
        expect(output).not.toContain(pat);
      }
    });

    it('set-ado-org source code never logs credential values', () => {
      const source = readFileSync(
        join(__dirname, '..', 'commands', 'set-ado-org.ts'),
        'utf-8'
      );

      // Extract all log() and logError() calls
      const logCalls = source.split('\n').filter(
        (line) => line.includes('log(') || line.includes('logError(') || line.includes('console.')
      );

      for (const line of logCalls) {
        expect(line).not.toContain('accessToken');
        expect(line).not.toContain('credential.accessToken');
        expect(line).not.toMatch(/\.pat\b/);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // AC#3: PAT value not present in error messages or stack traces
  // ═══════════════════════════════════════════════════════════════════

  describe('AC#3: PAT never in error messages or stack traces', () => {
    it('loadConfig error on malformed JSON does not leak PAT from file contents', () => {
      mkdirSync(join(projectRoot, '.beth'), { recursive: true });
      const fakePat = 'leaked-pat-in-json-error-12345';
      writeFileSync(
        getConfigPath(projectRoot),
        `{"accessToken": "${fakePat}", bad json here}`,
        'utf-8'
      );

      try {
        loadConfig(projectRoot);
        expect.unreachable('Should have thrown');
      } catch (e: unknown) {
        const msg = (e as Error).message;
        expect(msg).not.toContain(fakePat);
        // Stack trace too
        const stack = (e as Error).stack ?? '';
        expect(stack).not.toContain(fakePat);
      }
    });

    it('validateConfig error messages never include the actual secret value', () => {
      for (const pat of TEST_PATS) {
        const errors = validateConfig({
          organization: 'org',
          project: 'proj',
          authMethod: 'entra',
          taskPrefix: 'X',
          tasksDir: '.',
          accessToken: pat,
        });

        for (const err of errors) {
          expect(err).not.toContain(pat);
        }
      }
    });

    it('saveConfig thrown error does not include PAT value', () => {
      const injectedPat = 'pat-in-thrown-error-must-not-appear';
      try {
        saveConfig(projectRoot, {
          organization: 'org',
          project: 'proj',
          authMethod: 'pat',
          taskPrefix: 'BETH',
          tasksDir: '.',
          // @ts-expect-error — injection test
          secretKey: injectedPat,
        });
        expect.unreachable('Should have thrown');
      } catch (e: unknown) {
        const msg = (e as Error).message;
        expect(msg).not.toContain(injectedPat);
        const stack = (e as Error).stack ?? '';
        expect(stack).not.toContain(injectedPat);
      }
    });

    it('credentialStore error paths in source code never interpolate tokens', () => {
      const credSource = readFileSync(
        join(__dirname, 'credentialStore.ts'),
        'utf-8'
      );

      const throwLines = credSource.split('\n').filter(
        (line) => line.includes('throw') || line.includes('console.error')
      );

      for (const line of throwLines) {
        expect(line).not.toContain('accessToken');
        expect(line).not.toMatch(/\.pat\b/);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // AC#4: authMethod set to 'pat' in config (not the actual PAT value)
  // ═══════════════════════════════════════════════════════════════════

  describe('AC#4: authMethod correctly set', () => {
    it('config stores authMethod: "pat" without the PAT value itself', () => {
      process.env['BETH_ADO_PAT'] = 'the-actual-secret-pat';

      createConfig(projectRoot, 'org', 'proj', { authMethod: 'pat' });

      const raw = readFileSync(getConfigPath(projectRoot), 'utf-8');
      const parsed = JSON.parse(raw);

      expect(parsed.authMethod).toBe('pat');
      // The PAT itself must NOT be stored
      expect(raw).not.toContain('the-actual-secret-pat');
      // No field should have the PAT as its value
      for (const [, value] of Object.entries(parsed)) {
        if (typeof value === 'string') {
          expect(value).not.toBe('the-actual-secret-pat');
        }
      }
    });

    it('config stores authMethod: "entra" for Entra flow', () => {
      createConfig(projectRoot, 'org', 'proj', { authMethod: 'entra' });

      const raw = readFileSync(getConfigPath(projectRoot), 'utf-8');
      const parsed = JSON.parse(raw);

      expect(parsed.authMethod).toBe('entra');
    });

    it('authMethod is the only credential-related field in config', () => {
      createConfig(projectRoot, 'org', 'proj', { authMethod: 'pat' });

      const raw = readFileSync(getConfigPath(projectRoot), 'utf-8');
      const parsed = JSON.parse(raw);
      const keys = Object.keys(parsed);

      // None of these should be present as top-level keys
      const forbiddenKeys = [
        'pat', 'token', 'accessToken', 'refreshToken',
        'password', 'secret', 'credential', 'apiKey',
      ];
      for (const key of keys) {
        expect(forbiddenKeys).not.toContain(key);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // AC#5: PAT input uses masked/no-echo readline
  // ═══════════════════════════════════════════════════════════════════

  describe('AC#5: PAT input masking', () => {
    it('set-ado-org PAT flow uses promptForPat (masked input), not raw prompt', () => {
      // The set-ado-org command must use promptForPat for PAT input,
      // which uses raw mode (TTY) or non-echo readline (non-TTY).
      // It must NEVER use the regular `prompt()` helper for PAT values.
      const source = readFileSync(
        join(__dirname, '..', 'commands', 'set-ado-org.ts'),
        'utf-8'
      );

      // PAT flow exists and uses promptForPat
      expect(source).toContain('promptForPat');
      // The import comes from patAuth.js
      expect(source).toContain("from '../lib/patAuth.js'");
    });

    it('credentialStore retrieve reads PAT from env var or stored file (no stdin)', () => {
      const credSource = readFileSync(
        join(__dirname, 'credentialStore.ts'),
        'utf-8'
      );

      // PAT should come from env var or stored file, never from interactive readline
      expect(credSource).toContain("process.env['BETH_ADO_PAT']");
      expect(credSource).toContain('retrievePat');
      // Must NOT have readline for PAT input
      expect(credSource).not.toContain('createInterface');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Bonus: Full scan — PAT value doesn't appear ANYWHERE in output
  // ═══════════════════════════════════════════════════════════════════

  describe('Full output scan: PAT must not appear in any form', () => {
    it('entire .beth/ directory is PAT-free after full config lifecycle', () => {
      const pat = 'full-lifecycle-pat-scan-test-value';
      process.env['BETH_ADO_PAT'] = pat;

      // Create config
      createConfig(projectRoot, 'org', 'proj', { authMethod: 'pat' });

      // Update config (reconfigure)
      saveConfig(projectRoot, {
        organization: 'new-org',
        project: 'new-proj',
        authMethod: 'pat',
        taskPrefix: 'BETH',
        tasksDir: './backlog/tasks',
      });

      // Scan everything in .beth/
      const bethDir = getBethDir(projectRoot);
      const files = readdirSync(bethDir);
      for (const file of files) {
        const content = readFileSync(join(bethDir, file), 'utf-8');
        expect(content).not.toContain(pat);
      }
    });

    it('JSON.stringify of config object does not contain PAT', () => {
      const pat = 'stringify-safety-check-pat';
      process.env['BETH_ADO_PAT'] = pat;

      const config = createConfig(projectRoot, 'org', 'proj', { authMethod: 'pat' });
      const serialized = JSON.stringify(config);

      expect(serialized).not.toContain(pat);
    });
  });
});
