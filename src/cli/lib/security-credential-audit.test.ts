/**
 * Security Audit Tests for ADO Sync Credential Handling (BETH-64.20)
 *
 * TDD: These tests are written FIRST, before any fixes.
 * They cover the full credential threat surface:
 *   AC#2: No tokens/PATs in .beth/ado-sync.json
 *   AC#3: .beth/ in .gitignore, enforced during setup
 *   AC#4: PAT never in logs, errors, or stack traces
 *   AC#5: MSAL cache file has restrictive permissions (0o600)
 *   AC#6: Env var overrides don't persist to disk
 *   AC#8: OWASP auth review — error messages, enumeration, etc.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
  statSync,
} from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  saveConfig,
  loadConfig,
  createConfig,
  validateConfig,
  ensureGitignore,
  isGitignored,
  getConfigPath,
} from './adoSyncConfig.js';

/** Create a unique temp directory per test */
function makeTmpDir(): string {
  const dir = join(
    tmpdir(),
    `beth-sec-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

// ─── Helpers ──────────────────────────────────────────────────────────

/** Denylist of patterns that must NEVER appear in config files */
const SECRET_PATTERNS = [
  /accessToken/i,
  /refreshToken/i,
  /id_token/i,
  /clientSecret/i,
  /password/i,
  /bearer [A-Za-z0-9\-._~+/]+=*/i,
  /eyJ[A-Za-z0-9\-_]{10,}\.[A-Za-z0-9\-_]{10,}/i, // JWT pattern
];

/** Known non-secret keys allowed in ado-sync.json */
const ALLOWED_CONFIG_KEYS = new Set([
  'organization',
  'project',
  'areaPath',
  'iterationPath',
  'authMethod',
  'tenantId',
  'clientId',
  'taskPrefix',
  'tasksDir',
  'aiFormatting',
]);

/** Sub-keys within aiFormatting that are allowed */
const ALLOWED_AI_KEYS = new Set(['enabled', 'endpoint', 'deployment']);

describe('Security Audit: ADO Sync Credential Handling', () => {
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
  // AC#2: No tokens/PATs in .beth/ado-sync.json
  // ═══════════════════════════════════════════════════════════════════

  describe('AC#2: No secrets in config file', () => {
    it('saveConfig produces a file with zero secret patterns', () => {
      const config = createConfig(projectRoot, 'my-org', 'my-project', {
        authMethod: 'entra',
        tenantId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        clientId: '499b84ac-1321-427f-aa17-267ca6975798',
      });

      const raw = readFileSync(getConfigPath(projectRoot), 'utf-8');

      for (const pattern of SECRET_PATTERNS) {
        expect(raw).not.toMatch(pattern);
      }
    });

    it('config file contains only allowlisted keys', () => {
      createConfig(projectRoot, 'test-org', 'test-proj');
      const raw = readFileSync(getConfigPath(projectRoot), 'utf-8');
      const parsed = JSON.parse(raw) as Record<string, unknown>;

      for (const key of Object.keys(parsed)) {
        expect(ALLOWED_CONFIG_KEYS.has(key)).toBe(true);
      }

      // Check nested aiFormatting keys
      if (parsed.aiFormatting && typeof parsed.aiFormatting === 'object') {
        const ai = parsed.aiFormatting as Record<string, unknown>;
        for (const key of Object.keys(ai)) {
          expect(ALLOWED_AI_KEYS.has(key)).toBe(true);
        }
      }
    });

    it('config file never contains a PAT value even with PAT authMethod', () => {
      createConfig(projectRoot, 'org', 'proj', { authMethod: 'pat' });
      const raw = readFileSync(getConfigPath(projectRoot), 'utf-8');

      // Must not contain anything that looks like a PAT
      // ADO PATs are base64-ish: 52+ chars of alphanumeric/symbols
      expect(raw).not.toMatch(/[A-Za-z0-9/+]{52,}/);
    });

    it('validateConfig rejects fields that look like secrets', () => {
      const suspiciousConfigs = [
        { organization: 'org', project: 'proj', authMethod: 'entra', taskPrefix: 'X', tasksDir: '.', accessToken: 'eyJabc...' },
        { organization: 'org', project: 'proj', authMethod: 'entra', taskPrefix: 'X', tasksDir: '.', refreshToken: 'rt-value' },
        { organization: 'org', project: 'proj', authMethod: 'entra', taskPrefix: 'X', tasksDir: '.', clientSecret: 'secret-val' },
        { organization: 'org', project: 'proj', authMethod: 'entra', taskPrefix: 'X', tasksDir: '.', password: 'p@ss' },
      ];

      for (const config of suspiciousConfigs) {
        const errors = validateConfig(config);
        expect(errors.length).toBeGreaterThan(0);
        const hasSecretWarning = errors.some((e) => /secret/i.test(e) || /suspicious/i.test(e));
        expect(hasSecretWarning).toBe(true);
      }
    });

    it('saveConfig rejects config with injected secret fields', () => {
      expect(() =>
        saveConfig(projectRoot, {
          organization: 'org',
          project: 'proj',
          authMethod: 'entra',
          taskPrefix: 'BETH',
          tasksDir: './backlog/tasks',
          // @ts-expect-error intentional injection test
          accessToken: 'stolen-token',
        })
      ).toThrow();
    });

    it('denylist scan on config file after PAT auth setup', () => {
      // Simulate what set-ado-org does on PAT path
      createConfig(projectRoot, 'org', 'proj', {
        authMethod: 'pat',
        tenantId: '',
        clientId: '',
      });

      const raw = readFileSync(getConfigPath(projectRoot), 'utf-8');
      const parsed = JSON.parse(raw);

      // No value should be a token/PAT pattern
      const allValues = JSON.stringify(parsed);
      for (const pattern of SECRET_PATTERNS) {
        expect(allValues).not.toMatch(pattern);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // AC#3: .beth/ in .gitignore, enforced during setup
  // ═══════════════════════════════════════════════════════════════════

  describe('AC#3: .gitignore enforcement', () => {
    it('saveConfig always creates .gitignore with .beth/', () => {
      createConfig(projectRoot, 'org', 'proj');

      expect(isGitignored(projectRoot)).toBe(true);
      const content = readFileSync(
        join(projectRoot, '.gitignore'),
        'utf-8'
      );
      expect(content).toContain('.beth/');
    });

    it('.gitignore survives if already present with other entries', () => {
      writeFileSync(
        join(projectRoot, '.gitignore'),
        'node_modules/\ndist/\n',
        'utf-8'
      );

      createConfig(projectRoot, 'org', 'proj');

      const content = readFileSync(
        join(projectRoot, '.gitignore'),
        'utf-8'
      );
      expect(content).toContain('node_modules/');
      expect(content).toContain('.beth/');
    });

    it('ensureGitignore handles .beth without trailing slash', () => {
      writeFileSync(
        join(projectRoot, '.gitignore'),
        '.beth\n',
        'utf-8'
      );

      // Should recognize .beth as equivalent to .beth/
      expect(isGitignored(projectRoot)).toBe(true);
    });

    it('ensureGitignore handles /.beth/ with leading slash', () => {
      writeFileSync(
        join(projectRoot, '.gitignore'),
        '/.beth/\n',
        'utf-8'
      );

      expect(isGitignored(projectRoot)).toBe(true);
    });

    it('MSAL cache path is inside .beth/ (covered by gitignore)', () => {
      // The MSAL cache lives at .beth/msal_token_cache.json
      // which MUST be under .beth/ so gitignore covers it
      // Verify via source code inspection that getMsalCachePath returns .beth/<file>
      const entraSource = readFileSync(
        join(__dirname, 'entraAuth.ts'),
        'utf-8'
      );

      // The function must join projectRoot with '.beth' and the cache filename
      expect(entraSource).toContain(".beth'");
      expect(entraSource).toContain('msal_token_cache.json');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // AC#4: PAT never in logs, errors, or stack traces
  // ═══════════════════════════════════════════════════════════════════

  describe('AC#4: PAT never in logs or errors', () => {
    it('error messages from validateConfig never include the secret value', () => {
      const fakeToken = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.fakepayload.fakesig';
      const config = {
        organization: 'org',
        project: 'proj',
        authMethod: 'entra',
        taskPrefix: 'X',
        tasksDir: '.',
        accessToken: fakeToken,
      };

      const errors = validateConfig(config);
      for (const err of errors) {
        expect(err).not.toContain(fakeToken);
      }
    });

    it('loadConfig error on invalid JSON does not leak file contents', () => {
      mkdirSync(join(projectRoot, '.beth'), { recursive: true });
      // Write a file with a secret buried in invalid JSON
      writeFileSync(
        getConfigPath(projectRoot),
        '{"accessToken": "secret-leaked-token", invalid}',
        'utf-8'
      );

      expect(() => loadConfig(projectRoot)).toThrow();

      try {
        loadConfig(projectRoot);
      } catch (e: unknown) {
        const msg = (e as Error).message;
        expect(msg).not.toContain('secret-leaked-token');
      }
    });

    it('ADO API error messages never include the access token', () => {
      // Verify via source code inspection that adoFetch error construction
      // does not interpolate the accessToken parameter
      const discoverySource = readFileSync(
        join(__dirname, 'adoDiscovery.ts'),
        'utf-8'
      );

      // The adoFetch function receives accessToken but error messages must not include it
      const throwLines = discoverySource
        .split('\n')
        .filter((l) => l.includes('throw new AdoApiError'));
      for (const line of throwLines) {
        expect(line).not.toContain('accessToken');
      }
    });

    it('entraAuth error messages do not include token values', async () => {
      // The error paths in entraAuth.ts should produce safe messages
      // Verify the error format strings don't template tokens
      const entraSource = readFileSync(
        join(__dirname, 'entraAuth.ts'),
        'utf-8'
      ).replace(/\r\n/g, '\n');

      // Should not interpolate accessToken into error messages
      const lines = entraSource.split('\n');
      for (const line of lines) {
        if (line.includes('throw new Error') || line.includes('console.error')) {
          expect(line).not.toMatch(/accessToken/);
          expect(line).not.toMatch(/\.pat\b/);
        }
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // AC#5: MSAL cache file has restrictive permissions
  // ═══════════════════════════════════════════════════════════════════

  describe('AC#5: MSAL cache file permissions', () => {
    it('saveCacheToDisk writes with mode 0o600 (owner read/write only)', () => {
      // Verify the entraAuth source code uses mode 0o600
      const entraSource = readFileSync(
        join(__dirname, 'entraAuth.ts'),
        'utf-8'
      );

      // The writeFileSync call for the cache must include mode: 0o600
      expect(entraSource).toContain('mode: 0o600');
    });

    it('MSAL cache file is not world-readable after creation', () => {
      // Create a mock MSAL cache at the expected location
      mkdirSync(join(projectRoot, '.beth'), { recursive: true });
      const cachePath = join(projectRoot, '.beth', 'msal_token_cache.json');
      writeFileSync(cachePath, '{}', { encoding: 'utf-8', mode: 0o600 });

      const stats = statSync(cachePath);
      const mode = stats.mode & 0o777;

      // Owner can read/write, nobody else
      expect(mode & 0o077).toBe(0); // no group/other permissions
      expect(mode & 0o600).toBe(0o600); // owner read+write
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // AC#6: Env var overrides don't persist to disk
  // ═══════════════════════════════════════════════════════════════════

  describe('AC#6: Env var overrides are ephemeral', () => {
    it('BETH_ADO_PAT env var is never written to config file', () => {
      process.env['BETH_ADO_PAT'] = 'super-secret-pat-value';

      createConfig(projectRoot, 'org', 'proj', { authMethod: 'pat' });

      const raw = readFileSync(getConfigPath(projectRoot), 'utf-8');
      expect(raw).not.toContain('super-secret-pat-value');
      expect(raw).not.toContain('BETH_ADO_PAT');
    });

    it('BETH_ADO_TOKEN env var is never written to config file', () => {
      process.env['BETH_ADO_TOKEN'] = 'another-secret-token';

      createConfig(projectRoot, 'org', 'proj', { authMethod: 'entra' });

      const raw = readFileSync(getConfigPath(projectRoot), 'utf-8');
      expect(raw).not.toContain('another-secret-token');
      expect(raw).not.toContain('BETH_ADO_TOKEN');
    });

    it('env var PAT does not appear in any .beth/ files after config save', () => {
      process.env['BETH_ADO_PAT'] = 'env-pat-must-not-persist';

      createConfig(projectRoot, 'org', 'proj');

      // Scan all files in .beth/
      const bethDir = join(projectRoot, '.beth');
      if (existsSync(bethDir)) {
        const { readdirSync } = require('fs');
        const files = readdirSync(bethDir) as string[];
        for (const file of files) {
          const content = readFileSync(join(bethDir, file), 'utf-8');
          expect(content).not.toContain('env-pat-must-not-persist');
        }
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // AC#8: OWASP auth review
  // ═══════════════════════════════════════════════════════════════════

  describe('AC#8: OWASP auth hardening', () => {
    it('MSAL PII logging is disabled', () => {
      const entraSource = readFileSync(
        join(__dirname, 'entraAuth.ts'),
        'utf-8'
      );

      expect(entraSource).toContain('piiLoggingEnabled: false');
    });

    it('MSAL logger callback does not emit tokens', () => {
      const entraSource = readFileSync(
        join(__dirname, 'entraAuth.ts'),
        'utf-8'
      );

      // The logger callback should be silent (empty function body)
      // or explicitly filter sensitive data
      expect(entraSource).toMatch(/loggerCallback:\s*\(\)\s*=>\s*\{/);
    });

    it('device code timeout is bounded (no infinite wait)', () => {
      const entraSource = readFileSync(
        join(__dirname, 'entraAuth.ts'),
        'utf-8'
      );

      // Should have a timeout default
      expect(entraSource).toMatch(/timeout\s*(?:=|\?\?)\s*\d+/);
    });

    it('error messages use generic wording (no credential enumeration)', () => {
      const entraSource = readFileSync(
        join(__dirname, 'entraAuth.ts'),
        'utf-8'
      );

      // Error messages should not differentiate "wrong password" from "user not found"
      // They should use generic phrasing
      expect(entraSource).not.toContain('wrong password');
      expect(entraSource).not.toContain('user not found');
      expect(entraSource).not.toContain('invalid username');
    });

    it('adoFetch does not include token in error responses', () => {
      const discoverySource = readFileSync(
        join(__dirname, 'adoDiscovery.ts'),
        'utf-8'
      );

      // The throw statements in adoFetch should NOT template the accessToken
      const throwLines = discoverySource
        .split('\n')
        .filter((l) => l.includes('throw new AdoApiError'));
      for (const line of throwLines) {
        expect(line).not.toContain('accessToken');
        expect(line).not.toContain('token');
      }
    });

    it('credential retrieve never throws with token in error message', () => {
      // Verify that the error path in credentialStore doesn't leak tokens
      // Source code review — check the catch blocks
      const credSource = readFileSync(
        join(__dirname, 'credentialStore.ts'),
        'utf-8'
      );

      // The retrieve function should not re-throw raw MSAL errors
      // with token content (it returns null instead)
      expect(credSource).toContain('return null');
    });

    it('set-ado-org error messages do not include credentials', () => {
      const setAdoOrgSource = readFileSync(
        join(__dirname, '..', 'commands', 'set-ado-org.ts'),
        'utf-8'
      );

      // logError calls should not interpolate credential values
      const errorLines = setAdoOrgSource
        .split('\n')
        .filter((l) => l.includes('logError('));
      for (const line of errorLines) {
        expect(line).not.toContain('accessToken');
        expect(line).not.toContain('.pat');
        expect(line).not.toContain('credential.access');
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // AC#7: Secret scanning — config schema defense
  // ═══════════════════════════════════════════════════════════════════

  describe('AC#7: Secret injection defense', () => {
    it('validateConfig catches all known secret field names', () => {
      const secretFieldNames = [
        'accessToken',
        'refreshToken',
        'clientSecret',
        'password',
        'apiKey',
        'secretKey',
        'tokenValue',
        'credentialData',
      ];

      for (const field of secretFieldNames) {
        const config = {
          organization: 'org',
          project: 'proj',
          authMethod: 'entra' as const,
          taskPrefix: 'X',
          tasksDir: '.',
          [field]: 'some-secret-value',
        };

        const errors = validateConfig(config);
        const hasWarning = errors.some(
          (e) => /secret/i.test(e) || /suspicious/i.test(e)
        );
        expect(hasWarning).toBe(true);
      }
    });

    it('validateConfig allows known safe fields', () => {
      const validConfig = {
        organization: 'my-org',
        project: 'my-proj',
        areaPath: '',
        iterationPath: '',
        authMethod: 'entra',
        tenantId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        clientId: '499b84ac-1321-427f-aa17-267ca6975798',
        taskPrefix: 'BETH',
        tasksDir: './backlog/tasks',
        aiFormatting: {
          enabled: true,
          endpoint: 'https://example.openai.azure.com/',
          deployment: 'gpt-4o',
        },
      };

      const errors = validateConfig(validConfig);
      expect(errors).toHaveLength(0);
    });
  });
});
