/**
 * E2E Security Test: No secrets in .beth/ado-sync.json (BETH-64.19.7)
 *
 * TDD: Tests written FIRST — exercises the full config lifecycle and scans
 * for secrets using both denylist patterns and allowlisted key validation.
 *
 * Acceptance Criteria:
 *   AC#1: No access/refresh tokens (denylist)
 *   AC#2: No PAT values (denylist)
 *   AC#3: No client secrets or passwords (denylist)
 *   AC#4: All JSON keys from known non-sensitive schema
 *   AC#5: Scan covers both Entra and PAT auth paths
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  existsSync,
  rmSync,
} from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import {
  createConfig,
  saveConfig,
  loadConfig,
  getConfigPath,
  getBethDir,
} from '../lib/adoSyncConfig.js';

// ─── Helpers ──────────────────────────────────────────────────────────

/** Create a unique temp directory per test */
function makeTmpDir(): string {
  const dir = join(
    tmpdir(),
    `beth-e2e-sec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Denylist patterns that NEVER belong in config files */
const SECRET_VALUE_PATTERNS = [
  /eyJ[A-Za-z0-9\-_]{10,}\.[A-Za-z0-9\-_]{10,}/i, // JWT token
  /Bearer\s+[A-Za-z0-9\-._~+/]+=*/i,               // Bearer auth header
  /[A-Za-z0-9/+]{52,}/,                              // ADO PAT (52+ chars base64)
  /refresh_token/i,
  /id_token/i,
];

/** Denylist key names that must not appear as JSON keys */
const SECRET_KEY_PATTERNS = [
  /^accessToken$/i,
  /^refreshToken$/i,
  /^id_token$/i,
  /^clientSecret$/i,
  /^password$/i,
  /^secret$/i,
  /^pat$/i,
  /^apiKey$/i,
  /^secretKey$/i,
  /^tokenValue$/i,
  /^credential(?:Data)?$/i,
  /^privateKey$/i,
];

/** Allowlisted top-level keys in ado-sync.json */
const ALLOWED_TOP_KEYS = new Set([
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

/** Allowlisted keys within aiFormatting */
const ALLOWED_AI_KEYS = new Set(['enabled', 'endpoint', 'deployment']);

/**
 * Deep-scan a JSON value for secret patterns.
 * Returns array of violations found.
 */
function scanForSecrets(obj: unknown, path = ''): string[] {
  const violations: string[] = [];

  if (typeof obj === 'string') {
    for (const pattern of SECRET_VALUE_PATTERNS) {
      if (pattern.test(obj)) {
        violations.push(`Value at "${path}" matches secret pattern ${pattern}`);
      }
    }
  } else if (Array.isArray(obj)) {
    obj.forEach((item, i) => {
      violations.push(...scanForSecrets(item, `${path}[${i}]`));
    });
  } else if (obj !== null && typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      // Check key name against denylist
      for (const pattern of SECRET_KEY_PATTERNS) {
        if (pattern.test(key)) {
          violations.push(`Key "${key}" at "${path}" matches secret key pattern ${pattern}`);
        }
      }
      violations.push(...scanForSecrets(value, path ? `${path}.${key}` : key));
    }
  }

  return violations;
}

// ─── Tests ────────────────────────────────────────────────────────────

describe('E2E: No secrets in .beth/ado-sync.json (BETH-64.19.7)', () => {
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
  // AC#5 + AC#1-AC#3: Full lifecycle for Entra auth path
  // ═══════════════════════════════════════════════════════════════════

  describe('Entra auth path', () => {
    it('config file passes denylist scan after Entra setup', () => {
      createConfig(projectRoot, 'contoso-org', 'portal-project', {
        authMethod: 'entra',
        tenantId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        clientId: '499b84ac-1321-427f-aa17-267ca6975798',
      });

      const raw = readFileSync(getConfigPath(projectRoot), 'utf-8');
      const parsed = JSON.parse(raw);
      const violations = scanForSecrets(parsed);

      expect(violations).toEqual([]);
    });

    it('config file has only allowlisted keys after Entra setup', () => {
      createConfig(projectRoot, 'contoso-org', 'portal-project', {
        authMethod: 'entra',
        tenantId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        clientId: '499b84ac-1321-427f-aa17-267ca6975798',
      });

      const raw = readFileSync(getConfigPath(projectRoot), 'utf-8');
      const parsed = JSON.parse(raw) as Record<string, unknown>;

      for (const key of Object.keys(parsed)) {
        expect(ALLOWED_TOP_KEYS).toContain(key);
      }

      if (parsed.aiFormatting && typeof parsed.aiFormatting === 'object') {
        for (const key of Object.keys(parsed.aiFormatting as Record<string, unknown>)) {
          expect(ALLOWED_AI_KEYS).toContain(key);
        }
      }
    });

    it('no tokens leak into .beth/ even when BETH_ADO_TOKEN env is set', () => {
      process.env['BETH_ADO_TOKEN'] = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.fakesig';

      createConfig(projectRoot, 'org', 'proj', { authMethod: 'entra' });

      const bethDir = getBethDir(projectRoot);
      const files = readdirSync(bethDir);
      for (const file of files) {
        const content = readFileSync(join(bethDir, file), 'utf-8');
        const violations = scanForSecrets(content);
        expect(violations).toEqual([]);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // AC#5 + AC#1-AC#3: Full lifecycle for PAT auth path
  // ═══════════════════════════════════════════════════════════════════

  describe('PAT auth path', () => {
    it('config file passes denylist scan after PAT setup', () => {
      process.env['BETH_ADO_PAT'] = 'nzp2dw4x7lqzp3ydjgbz3hs4xqjyj3h6rfgtmqe5yzpfm7ycvuq';

      createConfig(projectRoot, 'my-org', 'my-proj', {
        authMethod: 'pat',
        tenantId: '',
        clientId: '',
      });

      const raw = readFileSync(getConfigPath(projectRoot), 'utf-8');
      const parsed = JSON.parse(raw);
      const violations = scanForSecrets(parsed);

      expect(violations).toEqual([]);
    });

    it('config file has only allowlisted keys after PAT setup', () => {
      process.env['BETH_ADO_PAT'] = 'AAAAABBBBBCCCCCDDDDDEEEEEFFFFFGGGGGHHHHHIIIIIJJJJJKKKKK';

      createConfig(projectRoot, 'org', 'proj', {
        authMethod: 'pat',
        tenantId: '',
        clientId: '',
      });

      const raw = readFileSync(getConfigPath(projectRoot), 'utf-8');
      const parsed = JSON.parse(raw) as Record<string, unknown>;

      for (const key of Object.keys(parsed)) {
        expect(ALLOWED_TOP_KEYS).toContain(key);
      }
    });

    it('PAT value never appears in any .beth/ file', () => {
      const pat = 'nzp2dw4x7lqzp3ydjgbz3hs4xqjyj3h6rfgtmqe5yzpfm7ycvuq';
      process.env['BETH_ADO_PAT'] = pat;

      createConfig(projectRoot, 'org', 'proj', { authMethod: 'pat' });

      const bethDir = getBethDir(projectRoot);
      const files = readdirSync(bethDir);
      for (const file of files) {
        const content = readFileSync(join(bethDir, file), 'utf-8');
        expect(content).not.toContain(pat);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Reconfiguration: secrets don't leak during config updates
  // ═══════════════════════════════════════════════════════════════════

  describe('Reconfiguration path', () => {
    it('secrets stay clean after Entra → PAT reconfiguration', () => {
      // Initial Entra setup
      createConfig(projectRoot, 'org-1', 'proj-1', {
        authMethod: 'entra',
        tenantId: 'tid-1',
        clientId: 'cid-1',
      });

      // Reconfigure to PAT
      process.env['BETH_ADO_PAT'] = 'reconfigure-pat-must-not-persist';
      saveConfig(projectRoot, {
        organization: 'org-2',
        project: 'proj-2',
        authMethod: 'pat',
        taskPrefix: 'BETH',
        tasksDir: './backlog/tasks',
        tenantId: '',
        clientId: '',
      });

      const raw = readFileSync(getConfigPath(projectRoot), 'utf-8');
      const parsed = JSON.parse(raw);

      expect(parsed.authMethod).toBe('pat');
      expect(parsed.organization).toBe('org-2');

      const violations = scanForSecrets(parsed);
      expect(violations).toEqual([]);
      expect(raw).not.toContain('reconfigure-pat-must-not-persist');
    });

    it('secrets stay clean after PAT → Entra reconfiguration', () => {
      // Initial PAT setup
      process.env['BETH_ADO_PAT'] = 'initial-pat-for-switch-test';
      createConfig(projectRoot, 'org', 'proj', { authMethod: 'pat' });

      // Reconfigure to Entra
      delete process.env['BETH_ADO_PAT'];
      saveConfig(projectRoot, {
        organization: 'org',
        project: 'proj',
        authMethod: 'entra',
        taskPrefix: 'BETH',
        tasksDir: './backlog/tasks',
        tenantId: 'new-tenant',
        clientId: 'new-client',
      });

      const raw = readFileSync(getConfigPath(projectRoot), 'utf-8');
      const parsed = JSON.parse(raw);

      expect(parsed.authMethod).toBe('entra');
      const violations = scanForSecrets(parsed);
      expect(violations).toEqual([]);
      expect(raw).not.toContain('initial-pat-for-switch-test');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Schema defense: config rejects injected secret fields
  // ═══════════════════════════════════════════════════════════════════

  describe('Schema defense against injection', () => {
    it('saveConfig rejects config with injected accessToken', () => {
      expect(() =>
        saveConfig(projectRoot, {
          organization: 'org',
          project: 'proj',
          authMethod: 'entra',
          taskPrefix: 'BETH',
          tasksDir: '.',
          // @ts-expect-error — injection test
          accessToken: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.fakepayload.fakesig',
        })
      ).toThrow();
    });

    it('saveConfig rejects config with injected clientSecret', () => {
      expect(() =>
        saveConfig(projectRoot, {
          organization: 'org',
          project: 'proj',
          authMethod: 'entra',
          taskPrefix: 'BETH',
          tasksDir: '.',
          // @ts-expect-error — injection test
          clientSecret: 'my-secret',
        })
      ).toThrow();
    });

    it('saveConfig rejects config with injected password', () => {
      expect(() =>
        saveConfig(projectRoot, {
          organization: 'org',
          project: 'proj',
          authMethod: 'entra',
          taskPrefix: 'BETH',
          tasksDir: '.',
          // @ts-expect-error — injection test
          password: 'p@ssw0rd',
        })
      ).toThrow();
    });

    it('no config file created when injection is rejected', () => {
      try {
        saveConfig(projectRoot, {
          organization: 'org',
          project: 'proj',
          authMethod: 'entra',
          taskPrefix: 'BETH',
          tasksDir: '.',
          // @ts-expect-error — injection test
          secretKey: 'injected-secret',
        });
      } catch {
        // Expected
      }

      // Config file should not exist (validation happens before write)
      expect(existsSync(getConfigPath(projectRoot))).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Full deep scan: loadConfig returns clean objects
  // ═══════════════════════════════════════════════════════════════════

  describe('loadConfig returns clean objects', () => {
    it('loaded Entra config has zero secret violations', () => {
      createConfig(projectRoot, 'org', 'proj', {
        authMethod: 'entra',
        tenantId: 'tid',
        clientId: 'cid',
      });

      const config = loadConfig(projectRoot);
      expect(config).not.toBeNull();

      const violations = scanForSecrets(config);
      expect(violations).toEqual([]);
    });

    it('loaded PAT config has zero secret violations', () => {
      process.env['BETH_ADO_PAT'] = 'load-test-pat-value-scan';
      createConfig(projectRoot, 'org', 'proj', { authMethod: 'pat' });

      const config = loadConfig(projectRoot);
      expect(config).not.toBeNull();

      const violations = scanForSecrets(config);
      expect(violations).toEqual([]);

      // Extra: the returned object must not contain the PAT either
      expect(JSON.stringify(config)).not.toContain('load-test-pat-value-scan');
    });
  });
});
