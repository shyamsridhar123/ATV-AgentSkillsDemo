/**
 * Unit tests for ADO Sync per-project configuration (BETH-64.6)
 *
 * Tests: config schema validation, read/write, .gitignore management,
 * .beth/ directory creation, and secret detection.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  loadConfig,
  saveConfig,
  createConfig,
  validateConfig,
  ensureBethDir,
  ensureGitignore,
  isGitignored,
  isConfigured,
  getBethDir,
  getConfigPath,
  type AdoSyncConfig,
} from '../lib/adoSyncConfig.js';

/** Create a temporary project directory for each test */
function makeTmpDir(): string {
  const dir = join(tmpdir(), `beth-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('adoSyncConfig', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = makeTmpDir();
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  // ─── Path helpers ────────────────────────────────────────────────

  describe('getBethDir / getConfigPath', () => {
    it('returns correct .beth directory path', () => {
      expect(getBethDir(projectRoot)).toBe(join(projectRoot, '.beth'));
    });

    it('returns correct config file path', () => {
      expect(getConfigPath(projectRoot)).toBe(join(projectRoot, '.beth', 'ado-sync.json'));
    });
  });

  // ─── ensureBethDir ───────────────────────────────────────────────

  describe('ensureBethDir', () => {
    it('creates .beth/ directory if missing', () => {
      const bethDir = ensureBethDir(projectRoot);
      expect(existsSync(bethDir)).toBe(true);
      expect(bethDir).toBe(join(projectRoot, '.beth'));
    });

    it('is idempotent - does not error if .beth/ already exists', () => {
      ensureBethDir(projectRoot);
      const bethDir = ensureBethDir(projectRoot);
      expect(existsSync(bethDir)).toBe(true);
    });
  });

  // ─── .gitignore management ──────────────────────────────────────

  describe('ensureGitignore', () => {
    it('creates .gitignore with .beth/ if file does not exist', () => {
      const modified = ensureGitignore(projectRoot);
      expect(modified).toBe(true);

      const content = readFileSync(join(projectRoot, '.gitignore'), 'utf-8');
      expect(content).toContain('.beth/');
      expect(content).toContain('# Beth runtime state');
    });

    it('appends .beth/ to existing .gitignore', () => {
      writeFileSync(join(projectRoot, '.gitignore'), 'node_modules/\n', 'utf-8');

      const modified = ensureGitignore(projectRoot);
      expect(modified).toBe(true);

      const content = readFileSync(join(projectRoot, '.gitignore'), 'utf-8');
      expect(content).toContain('node_modules/');
      expect(content).toContain('.beth/');
    });

    it('does not duplicate .beth/ if already listed', () => {
      writeFileSync(join(projectRoot, '.gitignore'), 'node_modules/\n.beth/\n', 'utf-8');

      const modified = ensureGitignore(projectRoot);
      expect(modified).toBe(false);

      const content = readFileSync(join(projectRoot, '.gitignore'), 'utf-8');
      const count = content.split('.beth/').length - 1;
      expect(count).toBe(1);
    });

    it('handles .gitignore without trailing newline', () => {
      writeFileSync(join(projectRoot, '.gitignore'), 'node_modules/', 'utf-8');

      ensureGitignore(projectRoot);

      const content = readFileSync(join(projectRoot, '.gitignore'), 'utf-8');
      expect(content).toContain('node_modules/');
      expect(content).toContain('.beth/');
      // Should not have .beth/ smashed onto node_modules/ line
      expect(content).not.toContain('node_modules/.beth/');
    });

    it('recognizes various .beth gitignore formats', () => {
      for (const entry of ['.beth/', '.beth', '/.beth/', '/.beth']) {
        const dir = makeTmpDir();
        writeFileSync(join(dir, '.gitignore'), `${entry}\n`, 'utf-8');
        expect(isGitignored(dir)).toBe(true);
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  // ─── validateConfig ─────────────────────────────────────────────

  describe('validateConfig', () => {
    const validConfig: AdoSyncConfig = {
      organization: 'my-org',
      project: 'MyProject',
      areaPath: '',
      iterationPath: '',
      authMethod: 'entra',
      tenantId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      clientId: 'ffffffff-gggg-hhhh-iiii-jjjjjjjjjjjj',
      taskPrefix: 'BETH',
      tasksDir: './backlog/tasks',
      aiFormatting: {
        enabled: true,
        endpoint: '',
        deployment: 'gpt-4o',
      },
    };

    it('accepts a valid config', () => {
      expect(validateConfig(validConfig)).toEqual([]);
    });

    it('rejects null', () => {
      expect(validateConfig(null)).toEqual(['Config must be a JSON object']);
    });

    it('rejects non-object', () => {
      expect(validateConfig('string')).toEqual(['Config must be a JSON object']);
    });

    it('rejects missing required fields', () => {
      const errors = validateConfig({});
      expect(errors).toContain('"organization" must be a string');
      expect(errors).toContain('"project" must be a string');
      expect(errors).toContain('"authMethod" must be a string');
      expect(errors).toContain('"taskPrefix" must be a string');
      expect(errors).toContain('"tasksDir" must be a string');
    });

    it('rejects invalid authMethod', () => {
      const errors = validateConfig({ ...validConfig, authMethod: 'oauth' });
      expect(errors).toContain('"authMethod" must be "entra" or "pat"');
    });

    it('accepts authMethod "pat"', () => {
      expect(validateConfig({ ...validConfig, authMethod: 'pat' })).toEqual([]);
    });

    it('rejects non-boolean aiFormatting.enabled', () => {
      const bad = { ...validConfig, aiFormatting: { ...validConfig.aiFormatting, enabled: 'yes' } };
      const errors = validateConfig(bad);
      expect(errors).toContain('"aiFormatting.enabled" must be a boolean');
    });

    it('rejects non-object aiFormatting', () => {
      const errors = validateConfig({ ...validConfig, aiFormatting: 'bad' });
      expect(errors).toContain('"aiFormatting" must be an object');
    });

    it('flags suspicious secret-like fields', () => {
      const suspicious = { ...validConfig, apiToken: 'ghp_abc123' };
      const errors = validateConfig(suspicious);
      expect(errors.some(e => e.includes('secret'))).toBe(true);
    });

    it('does not flag known safe fields', () => {
      // taskPrefix and authMethod should not trigger secret detection
      expect(validateConfig(validConfig)).toEqual([]);
    });

    it('allows empty string for optional string fields', () => {
      const config = { ...validConfig, tenantId: '', clientId: '' };
      expect(validateConfig(config)).toEqual([]);
    });
  });

  // ─── saveConfig / loadConfig ────────────────────────────────────

  describe('saveConfig / loadConfig', () => {
    it('saves config with defaults and reads it back', () => {
      const saved = saveConfig(projectRoot, {
        organization: 'contoso',
        project: 'MyApp',
      });

      expect(saved.organization).toBe('contoso');
      expect(saved.project).toBe('MyApp');
      expect(saved.authMethod).toBe('entra'); // default
      expect(saved.taskPrefix).toBe('BETH'); // default

      const loaded = loadConfig(projectRoot);
      expect(loaded).toEqual(saved);
    });

    it('creates .beth/ directory', () => {
      saveConfig(projectRoot, { organization: 'org', project: 'proj' });
      expect(existsSync(join(projectRoot, '.beth'))).toBe(true);
    });

    it('updates .gitignore', () => {
      saveConfig(projectRoot, { organization: 'org', project: 'proj' });
      expect(isGitignored(projectRoot)).toBe(true);
    });

    it('writes valid JSON', () => {
      saveConfig(projectRoot, { organization: 'org', project: 'proj' });
      const raw = readFileSync(getConfigPath(projectRoot), 'utf-8');
      expect(() => JSON.parse(raw)).not.toThrow();
    });

    it('overwrites existing config on re-save', () => {
      saveConfig(projectRoot, { organization: 'org1', project: 'proj1' });
      saveConfig(projectRoot, { organization: 'org2', project: 'proj2' });

      const loaded = loadConfig(projectRoot);
      expect(loaded?.organization).toBe('org2');
      expect(loaded?.project).toBe('proj2');
    });

    it('returns null when config does not exist', () => {
      expect(loadConfig(projectRoot)).toBeNull();
    });

    it('throws on invalid JSON', () => {
      ensureBethDir(projectRoot);
      writeFileSync(getConfigPath(projectRoot), '{bad json', 'utf-8');
      expect(() => loadConfig(projectRoot)).toThrow('Invalid JSON');
    });

    it('throws on invalid config shape', () => {
      ensureBethDir(projectRoot);
      writeFileSync(getConfigPath(projectRoot), '{"not": "valid"}', 'utf-8');
      expect(() => loadConfig(projectRoot)).toThrow('Invalid ADO Sync config');
    });

    it('config file contains no secret-like values', () => {
      saveConfig(projectRoot, {
        organization: 'org',
        project: 'proj',
        tenantId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      });
      const raw = readFileSync(getConfigPath(projectRoot), 'utf-8');
      // Should not contain common secret patterns
      expect(raw).not.toMatch(/token|secret|password|credential/i);
    });
  });

  // ─── createConfig ───────────────────────────────────────────────

  describe('createConfig', () => {
    it('creates config with org and project', () => {
      const config = createConfig(projectRoot, 'my-org', 'my-project');
      expect(config.organization).toBe('my-org');
      expect(config.project).toBe('my-project');
      expect(config.authMethod).toBe('entra');
    });

    it('accepts additional options', () => {
      const config = createConfig(projectRoot, 'org', 'proj', {
        authMethod: 'pat',
        tenantId: 'some-tenant',
      });
      expect(config.authMethod).toBe('pat');
      expect(config.tenantId).toBe('some-tenant');
    });
  });

  // ─── isConfigured ──────────────────────────────────────────────

  describe('isConfigured', () => {
    it('returns false when no config exists', () => {
      expect(isConfigured(projectRoot)).toBe(false);
    });

    it('returns true after saving config', () => {
      saveConfig(projectRoot, { organization: 'org', project: 'proj' });
      expect(isConfigured(projectRoot)).toBe(true);
    });
  });
});
