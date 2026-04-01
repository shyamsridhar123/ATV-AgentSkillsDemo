/**
 * Unit tests for MCP auto-configuration (BETH-64.16)
 *
 * TDD: Tests written first, implementation follows.
 *
 * Covers:
 * - BETH-64.16.1: Adds ado-sync entry to existing mcp.json
 * - BETH-64.16.2: Creates mcp.json when missing
 * - BETH-64.16.3: Updates existing entry, no duplicates
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import {
  ensureAdoSyncMcpEntry,
  buildAdoSyncMcpEntry,
  ADO_SYNC_SERVER_KEY,
} from './mcpConfig.js';

/** Create a unique temp directory for each test */
function makeTmpDir(): string {
  const dir = join(
    tmpdir(),
    `beth-mcp-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Read and parse .vscode/mcp.json from a project root */
function readMcpJson(projectRoot: string): Record<string, unknown> {
  const content = readFileSync(join(projectRoot, '.vscode', 'mcp.json'), 'utf-8');
  return JSON.parse(content);
}

/** Write a .vscode/mcp.json in a project root */
function writeMcpJson(projectRoot: string, config: Record<string, unknown>): void {
  const vsDir = join(projectRoot, '.vscode');
  if (!existsSync(vsDir)) mkdirSync(vsDir, { recursive: true });
  writeFileSync(join(vsDir, 'mcp.json'), JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

describe('mcpConfig', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // ─── buildAdoSyncMcpEntry ─────────────────────────────

  describe('buildAdoSyncMcpEntry', () => {
    it('builds entry with given python path and project root cwd', () => {
      const entry = buildAdoSyncMcpEntry('/usr/bin/python3', '/home/user/project');
      expect(entry).toEqual({
        command: '/usr/bin/python3',
        args: ['-m', 'app.mcp_server'],
        cwd: '/home/user/project/ado-sync',
      });
    });

    it('builds entry with venv python path', () => {
      const entry = buildAdoSyncMcpEntry(
        '/home/user/project/.beth/ado-sync/.venv/bin/python',
        '/home/user/project'
      );
      expect(entry.command).toBe('/home/user/project/.beth/ado-sync/.venv/bin/python');
      expect(entry.args).toEqual(['-m', 'app.mcp_server']);
      expect(entry.cwd).toBe('/home/user/project/ado-sync');
    });
  });

  // ─── BETH-64.16.1: Adds ado-sync entry to existing mcp.json ───

  describe('adds ado-sync entry to existing mcp.json (BETH-64.16.1)', () => {
    it('adds ado-sync to existing servers while preserving them', () => {
      const existingConfig = {
        $schema: 'https://code.visualstudio.com/docs/copilot/chat/mcp-servers',
        servers: {
          playwright: { command: 'npx', args: ['@playwright/mcp@0.0.68'] },
          backlog: { command: 'backlog', args: ['mcp', 'start'] },
        },
      };
      writeMcpJson(tmpDir, existingConfig);

      const pythonPath = join(tmpDir, '.beth/ado-sync/.venv/bin/python');
      const result = ensureAdoSyncMcpEntry(tmpDir, pythonPath);

      expect(result.action).toBe('added');

      const config = readMcpJson(tmpDir);
      const servers = config.servers as Record<string, unknown>;

      // ado-sync added
      expect(servers[ADO_SYNC_SERVER_KEY]).toBeDefined();
      const adoEntry = servers[ADO_SYNC_SERVER_KEY] as Record<string, unknown>;
      expect(adoEntry.command).toBe(pythonPath);
      expect(adoEntry.args).toEqual(['-m', 'app.mcp_server']);
      expect(adoEntry.cwd).toBe(join(tmpDir, 'ado-sync'));

      // Existing entries preserved
      expect(servers.playwright).toEqual(existingConfig.servers.playwright);
      expect(servers.backlog).toEqual(existingConfig.servers.backlog);
    });

    it('preserves $schema and other top-level keys', () => {
      const existingConfig = {
        $schema: 'https://code.visualstudio.com/docs/copilot/chat/mcp-servers',
        _security_notice: 'Review each server before enabling.',
        servers: {
          backlog: { command: 'backlog', args: ['mcp', 'start'] },
        },
      };
      writeMcpJson(tmpDir, existingConfig);

      ensureAdoSyncMcpEntry(tmpDir, '/usr/bin/python3');

      const config = readMcpJson(tmpDir);
      expect(config.$schema).toBe('https://code.visualstudio.com/docs/copilot/chat/mcp-servers');
      expect(config._security_notice).toBe('Review each server before enabling.');
    });

    it('writes valid JSON with normalized 2-space indentation', () => {
      writeMcpJson(tmpDir, { servers: {} });

      ensureAdoSyncMcpEntry(tmpDir, '/usr/bin/python3');

      const raw = readFileSync(join(tmpDir, '.vscode', 'mcp.json'), 'utf-8');
      // Should parse without error
      expect(() => JSON.parse(raw)).not.toThrow();
      // Should use 2-space indent
      expect(raw).toContain('  "servers"');
      // Should end with newline
      expect(raw.endsWith('\n')).toBe(true);
    });
  });

  // ─── BETH-64.16.2: Creates mcp.json when missing ───

  describe('creates mcp.json when missing (BETH-64.16.2)', () => {
    it('creates .vscode/ directory if it does not exist', () => {
      expect(existsSync(join(tmpDir, '.vscode'))).toBe(false);

      const pythonPath = '/usr/bin/python3';
      const result = ensureAdoSyncMcpEntry(tmpDir, pythonPath);

      expect(result.action).toBe('created');
      expect(existsSync(join(tmpDir, '.vscode'))).toBe(true);
      expect(existsSync(join(tmpDir, '.vscode', 'mcp.json'))).toBe(true);
    });

    it('creates valid mcp.json with ado-sync entry and required defaults', () => {
      const pythonPath = '/usr/bin/python3';
      ensureAdoSyncMcpEntry(tmpDir, pythonPath);

      const config = readMcpJson(tmpDir);
      expect(config.servers).toBeDefined();

      const servers = config.servers as Record<string, unknown>;
      const adoEntry = servers[ADO_SYNC_SERVER_KEY] as Record<string, unknown>;
      expect(adoEntry).toBeDefined();
      expect(adoEntry.command).toBe(pythonPath);
      expect(adoEntry.args).toEqual(['-m', 'app.mcp_server']);
      expect(adoEntry.cwd).toBe(join(tmpDir, 'ado-sync'));

      // Required default servers must be present (doctor depends on these)
      expect(servers.playwright).toBeDefined();
      expect(servers.backlog).toBeDefined();
    });

    it('output has $schema field', () => {
      ensureAdoSyncMcpEntry(tmpDir, '/usr/bin/python3');

      const config = readMcpJson(tmpDir);
      expect(config.$schema).toBe('https://code.visualstudio.com/docs/copilot/chat/mcp-servers');
    });

    it('creates .vscode/mcp.json when .vscode/ exists but mcp.json does not', () => {
      mkdirSync(join(tmpDir, '.vscode'), { recursive: true });
      expect(existsSync(join(tmpDir, '.vscode', 'mcp.json'))).toBe(false);

      ensureAdoSyncMcpEntry(tmpDir, '/usr/bin/python3');

      expect(existsSync(join(tmpDir, '.vscode', 'mcp.json'))).toBe(true);
      const config = readMcpJson(tmpDir);
      const servers = config.servers as Record<string, unknown>;
      expect(servers[ADO_SYNC_SERVER_KEY]).toBeDefined();
    });
  });

  // ─── BETH-64.16.3: Updates existing entry, no duplicates ───

  describe('updates existing ado-sync entry, no duplicates (BETH-64.16.3)', () => {
    it('updates ado-sync entry with new python path', () => {
      const oldPython = '/old/path/python3';
      const newPython = '/new/venv/bin/python';
      const existingConfig = {
        servers: {
          backlog: { command: 'backlog', args: ['mcp', 'start'] },
          [ADO_SYNC_SERVER_KEY]: {
            command: oldPython,
            args: ['-m', 'app.mcp_server'],
            cwd: join(tmpDir, 'ado-sync'),
          },
        },
      };
      writeMcpJson(tmpDir, existingConfig);

      const result = ensureAdoSyncMcpEntry(tmpDir, newPython);

      expect(result.action).toBe('updated');

      const config = readMcpJson(tmpDir);
      const servers = config.servers as Record<string, unknown>;
      const adoEntry = servers[ADO_SYNC_SERVER_KEY] as Record<string, unknown>;
      expect(adoEntry.command).toBe(newPython);
    });

    it('does not create duplicate ado-sync entries', () => {
      const existingConfig = {
        servers: {
          [ADO_SYNC_SERVER_KEY]: {
            command: '/old/python',
            args: ['-m', 'app.mcp_server'],
            cwd: '/old/cwd',
          },
        },
      };
      writeMcpJson(tmpDir, existingConfig);

      ensureAdoSyncMcpEntry(tmpDir, '/new/python');

      const config = readMcpJson(tmpDir);
      const servers = config.servers as Record<string, unknown>;
      const serverKeys = Object.keys(servers);
      const adoSyncCount = serverKeys.filter(k => k === ADO_SYNC_SERVER_KEY).length;
      expect(adoSyncCount).toBe(1);
    });

    it('does not modify other server entries when updating ado-sync', () => {
      const existingConfig = {
        servers: {
          playwright: { command: 'npx', args: ['@playwright/mcp@0.0.68'] },
          shadcn: { command: 'npx', args: ['shadcn@3.7.0', 'mcp'] },
          [ADO_SYNC_SERVER_KEY]: {
            command: '/old/python',
            args: ['-m', 'app.mcp_server'],
            cwd: '/old/cwd',
          },
        },
      };
      writeMcpJson(tmpDir, existingConfig);

      ensureAdoSyncMcpEntry(tmpDir, '/new/python');

      const config = readMcpJson(tmpDir);
      const servers = config.servers as Record<string, unknown>;
      expect(servers.playwright).toEqual(existingConfig.servers.playwright);
      expect(servers.shadcn).toEqual(existingConfig.servers.shadcn);
    });

    it('returns unchanged when entry already matches', () => {
      const pythonPath = '/current/python';
      const existingConfig = {
        servers: {
          [ADO_SYNC_SERVER_KEY]: {
            command: pythonPath,
            args: ['-m', 'app.mcp_server'],
            cwd: join(tmpDir, 'ado-sync'),
          },
        },
      };
      writeMcpJson(tmpDir, existingConfig);

      const result = ensureAdoSyncMcpEntry(tmpDir, pythonPath);
      expect(result.action).toBe('unchanged');
    });
  });

  // ─── Edge cases ───

  describe('edge cases', () => {
    it('handles corrupted mcp.json by creating fresh config with defaults', () => {
      const vsDir = join(tmpDir, '.vscode');
      mkdirSync(vsDir, { recursive: true });
      writeFileSync(join(vsDir, 'mcp.json'), '{{{{not valid json!!!!', 'utf-8');

      const result = ensureAdoSyncMcpEntry(tmpDir, '/usr/bin/python3');

      expect(result.action).toBe('created');
      // Should now be valid with required defaults
      const config = readMcpJson(tmpDir);
      const servers = config.servers as Record<string, unknown>;
      expect(servers[ADO_SYNC_SERVER_KEY]).toBeDefined();
      expect(servers.playwright).toBeDefined();
      expect(servers.backlog).toBeDefined();
    });

    it('handles mcp.json with no servers key', () => {
      writeMcpJson(tmpDir, { $schema: 'test' });

      ensureAdoSyncMcpEntry(tmpDir, '/usr/bin/python3');

      const config = readMcpJson(tmpDir);
      expect(config.servers).toBeDefined();
      const servers = config.servers as Record<string, unknown>;
      expect(servers[ADO_SYNC_SERVER_KEY]).toBeDefined();
    });

    it('handles mcp.json where servers is not an object', () => {
      const vsDir = join(tmpDir, '.vscode');
      mkdirSync(vsDir, { recursive: true });
      writeFileSync(
        join(vsDir, 'mcp.json'),
        JSON.stringify({ servers: 'not-an-object' }, null, 2) + '\n',
        'utf-8'
      );

      ensureAdoSyncMcpEntry(tmpDir, '/usr/bin/python3');

      const config = readMcpJson(tmpDir);
      const servers = config.servers as Record<string, unknown>;
      expect(servers[ADO_SYNC_SERVER_KEY]).toBeDefined();
    });
  });
});
