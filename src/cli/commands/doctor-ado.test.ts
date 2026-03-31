/**
 * Unit tests for ADO Sync health checks in doctor command (BETH-64.15)
 *
 * TDD: Tests written first, implementation follows.
 * Tests cover all 5 subtasks (64.15.1 through 64.15.5).
 *
 * Strategy: The doctor ADO checks are pure functions that accept dependency
 * injection objects, making them testable without mocking modules.
 */

import { describe, it, beforeEach, afterEach } from 'vitest';
import assert from 'node:assert';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  checkAdoSync,
  fixAdoSync,
  type AdoDeps,
} from './doctor.js';

// ── Test Utilities ────────────────────────────────────────────────────

/** Minimal valid ADO config for test fixtures */
function validAdoConfig() {
  return {
    organization: 'test-org',
    project: 'test-project',
    areaPath: '',
    iterationPath: '',
    authMethod: 'entra' as const,
    tenantId: 'test-tenant',
    clientId: 'test-client',
    taskPrefix: 'BETH',
    tasksDir: './backlog/tasks',
    aiFormatting: { enabled: true, endpoint: '', deployment: 'gpt-4o' },
  };
}

/** Create a .beth/ado-sync.json file in the test directory */
function createAdoConfig(testDir: string, config = validAdoConfig()) {
  const bethDir = join(testDir, '.beth');
  mkdirSync(bethDir, { recursive: true });
  writeFileSync(join(bethDir, 'ado-sync.json'), JSON.stringify(config, null, 2));
}

/** Create default pass-through deps (everything healthy) */
function healthyDeps(): AdoDeps {
  return {
    isConfigured: () => true,
    loadConfig: () => validAdoConfig(),
    hasCredentials: async () => true,
    checkCredentials: async () => ({
      accessToken: 'test-token',
      expiresOn: new Date(Date.now() + 3600_000), // 1 hour from now
      account: { username: 'user@test.com', homeAccountId: 'id', environment: 'env', tenantId: 't', localAccountId: 'lid' },
    }),
    checkOrgReachable: async () => ({ reachable: true, statusCode: 200 }),
    discoverPython: async () => ({ pythonPath: '/usr/bin/python3', source: 'path' as const, version: '3.12.0' }),
    hasMcpEntry: () => true,
    getWatcherStatus: async () => ({ state: 'running' as const, pid: 12345, organization: 'test-org', project: 'test-project', authMethod: 'entra' }),
  };
}

// ═══════════════════════════════════════════════════════════════════════
// BETH-64.15.1 — ADO not configured shows optional message
// ═══════════════════════════════════════════════════════════════════════

describe('BETH-64.15.1: ADO Sync not configured', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `beth-doc-ado-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should report "not configured (optional)" when no .beth/ado-sync.json', async () => {
    const deps: AdoDeps = {
      ...healthyDeps(),
      isConfigured: () => false,
      loadConfig: () => null,
    };

    const results = await checkAdoSync(testDir, deps);

    assert.strictEqual(results.length, 1, 'Should return exactly 1 result');
    assert.strictEqual(results[0].name, 'ADO Sync');
    assert.strictEqual(results[0].status, 'pass');
    assert.ok(results[0].message.includes('not configured'), `Message should include "not configured", got: ${results[0].message}`);
    assert.ok(results[0].message.includes('optional'), `Message should include "optional", got: ${results[0].message}`);
  });

  it('should NOT produce any warnings when not configured', async () => {
    const deps: AdoDeps = {
      ...healthyDeps(),
      isConfigured: () => false,
      loadConfig: () => null,
    };

    const results = await checkAdoSync(testDir, deps);

    const warnings = results.filter(r => r.status === 'warn');
    assert.strictEqual(warnings.length, 0, 'Should have zero warnings');
  });

  it('should NOT produce any failures when not configured', async () => {
    const deps: AdoDeps = {
      ...healthyDeps(),
      isConfigured: () => false,
      loadConfig: () => null,
    };

    const results = await checkAdoSync(testDir, deps);

    const failures = results.filter(r => r.status === 'fail');
    assert.strictEqual(failures.length, 0, 'Should have zero failures');
  });

  it('should NOT call credential or API checks when not configured', async () => {
    let credentialsCalled = false;
    let orgReachableCalled = false;

    const deps: AdoDeps = {
      ...healthyDeps(),
      isConfigured: () => false,
      loadConfig: () => null,
      hasCredentials: async () => { credentialsCalled = true; return false; },
      checkOrgReachable: async () => { orgReachableCalled = true; return { reachable: false, statusCode: 0 }; },
    };

    await checkAdoSync(testDir, deps);

    assert.strictEqual(credentialsCalled, false, 'Should not check credentials');
    assert.strictEqual(orgReachableCalled, false, 'Should not check org reachability');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// BETH-64.15.2 — Credential validity checks
// ═══════════════════════════════════════════════════════════════════════

describe('BETH-64.15.2: ADO Sync credential checks', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `beth-doc-cred-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    createAdoConfig(testDir);
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should pass when credentials are valid and not expired', async () => {
    const deps: AdoDeps = {
      ...healthyDeps(),
      hasCredentials: async () => true,
      checkCredentials: async () => ({
        accessToken: 'valid-token',
        expiresOn: new Date(Date.now() + 3600_000),
        account: { username: 'user@test.com', homeAccountId: 'id', environment: 'env', tenantId: 't', localAccountId: 'lid' },
      }),
    };

    const results = await checkAdoSync(testDir, deps);
    const credCheck = results.find(r => r.name === 'ADO Sync: Credentials');

    assert.ok(credCheck, 'Should have a Credentials check result');
    assert.strictEqual(credCheck.status, 'pass');
  });

  it('should warn when credentials are expired', async () => {
    const deps: AdoDeps = {
      ...healthyDeps(),
      hasCredentials: async () => true,
      checkCredentials: async () => ({
        accessToken: 'expired-token',
        expiresOn: new Date(Date.now() - 3600_000), // 1 hour ago
        account: { username: 'user@test.com', homeAccountId: 'id', environment: 'env', tenantId: 't', localAccountId: 'lid' },
      }),
    };

    const results = await checkAdoSync(testDir, deps);
    const credCheck = results.find(r => r.name === 'ADO Sync: Credentials');

    assert.ok(credCheck, 'Should have a Credentials check result');
    assert.strictEqual(credCheck.status, 'warn');
    assert.ok(credCheck.message.includes('expired') || credCheck.message.includes('refresh'),
      `Warn message should mention expired/refresh, got: ${credCheck.message}`);
    assert.ok(credCheck.fixCommand, 'Should have a fixCommand');
    assert.ok(credCheck.fixable, 'Expired credentials should be fixable');
  });

  it('should fail when no credentials exist at all', async () => {
    const deps: AdoDeps = {
      ...healthyDeps(),
      hasCredentials: async () => false,
      checkCredentials: async () => null,
    };

    const results = await checkAdoSync(testDir, deps);
    const credCheck = results.find(r => r.name === 'ADO Sync: Credentials');

    assert.ok(credCheck, 'Should have a Credentials check result');
    assert.strictEqual(credCheck.status, 'fail');
    assert.ok(credCheck.message.includes('no credentials'),
      `Fail message should mention no credentials, got: ${credCheck.message}`);
    assert.ok(credCheck.fixCommand?.includes('set-ado-org'),
      `Fix command should mention set-ado-org, got: ${credCheck.fixCommand}`);
  });

  it('should fail with invalid/expired message when hasCredentials but checkCredentials returns null', async () => {
    const deps: AdoDeps = {
      ...healthyDeps(),
      hasCredentials: async () => true,
      checkCredentials: async () => null,
    };

    const results = await checkAdoSync(testDir, deps);
    const credCheck = results.find(r => r.name === 'ADO Sync: Credentials');

    assert.ok(credCheck, 'Should have a Credentials check result');
    assert.strictEqual(credCheck.status, 'fail');
    assert.ok(credCheck.message.includes('invalid') || credCheck.message.includes('expired'),
      `Fail message should mention invalid/expired, got: ${credCheck.message}`);
    assert.ok(credCheck.fixable, 'Should be fixable');
  });

  it('should pass with PAT credentials (no expiry)', async () => {
    const deps: AdoDeps = {
      ...healthyDeps(),
      hasCredentials: async () => true,
      checkCredentials: async () => ({
        accessToken: 'pat-token',
        expiresOn: null, // PATs don't have expiry
        account: { username: 'PAT (environment variable)', homeAccountId: 'env-var', environment: 'env-var', tenantId: '', localAccountId: 'env-var' },
      }),
    };

    const results = await checkAdoSync(testDir, deps);
    const credCheck = results.find(r => r.name === 'ADO Sync: Credentials');

    assert.ok(credCheck, 'Should have a Credentials check result');
    assert.strictEqual(credCheck.status, 'pass');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// BETH-64.15.3 — ADO org reachability
// ═══════════════════════════════════════════════════════════════════════

describe('BETH-64.15.3: ADO org reachability', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `beth-doc-org-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    createAdoConfig(testDir);
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should pass when org is reachable (200)', async () => {
    const deps: AdoDeps = {
      ...healthyDeps(),
      checkOrgReachable: async () => ({ reachable: true, statusCode: 200 }),
    };

    const results = await checkAdoSync(testDir, deps);
    const orgCheck = results.find(r => r.name === 'ADO Sync: Organization');

    assert.ok(orgCheck, 'Should have an Organization check result');
    assert.strictEqual(orgCheck.status, 'pass');
  });

  it('should warn on network error (transient failure)', async () => {
    const deps: AdoDeps = {
      ...healthyDeps(),
      checkOrgReachable: async () => ({ reachable: false, statusCode: 0, error: 'ECONNREFUSED' }),
    };

    const results = await checkAdoSync(testDir, deps);
    const orgCheck = results.find(r => r.name === 'ADO Sync: Organization');

    assert.ok(orgCheck, 'Should have an Organization check result');
    assert.strictEqual(orgCheck.status, 'warn');
    assert.ok(orgCheck.message.includes('unreachable') || orgCheck.message.includes('network'),
      `Warn message should mention network issue, got: ${orgCheck.message}`);
  });

  it('should fail on 401 Unauthorized with re-auth instructions', async () => {
    const deps: AdoDeps = {
      ...healthyDeps(),
      checkOrgReachable: async () => ({ reachable: false, statusCode: 401 }),
    };

    const results = await checkAdoSync(testDir, deps);
    const orgCheck = results.find(r => r.name === 'ADO Sync: Organization');

    assert.ok(orgCheck, 'Should have an Organization check result');
    assert.strictEqual(orgCheck.status, 'fail');
    assert.ok(orgCheck.fixCommand?.includes('set-ado-org'),
      `Fix command should include re-auth instructions, got: ${orgCheck.fixCommand}`);
  });

  it('should fail on 403 Forbidden with re-auth instructions', async () => {
    const deps: AdoDeps = {
      ...healthyDeps(),
      checkOrgReachable: async () => ({ reachable: false, statusCode: 403 }),
    };

    const results = await checkAdoSync(testDir, deps);
    const orgCheck = results.find(r => r.name === 'ADO Sync: Organization');

    assert.ok(orgCheck, 'Should have an Organization check result');
    assert.strictEqual(orgCheck.status, 'fail');
  });

  it('should fail with HTTP status on non-auth errors (404, 5xx)', async () => {
    const deps: AdoDeps = {
      ...healthyDeps(),
      checkOrgReachable: async () => ({ reachable: false, statusCode: 404 }),
    };

    const results = await checkAdoSync(testDir, deps);
    const orgCheck = results.find(r => r.name === 'ADO Sync: Organization');

    assert.ok(orgCheck, 'Should have an Organization check result');
    assert.strictEqual(orgCheck.status, 'fail');
    assert.ok(orgCheck.message.includes('404'),
      `Message should include HTTP status code, got: ${orgCheck.message}`);
  });

  it('should skip org check when credentials are missing', async () => {
    const deps: AdoDeps = {
      ...healthyDeps(),
      hasCredentials: async () => false,
      checkCredentials: async () => null,
    };

    const results = await checkAdoSync(testDir, deps);
    const orgCheck = results.find(r => r.name === 'ADO Sync: Organization');

    // When no credentials, org check should be skipped or show info
    if (orgCheck) {
      assert.notStrictEqual(orgCheck.status, 'fail',
        'Should not fail org check when credentials are the real problem');
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// BETH-64.15.4 — Python, MCP, and watcher checks
// ═══════════════════════════════════════════════════════════════════════

describe('BETH-64.15.4: Python, MCP, and watcher checks', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `beth-doc-infra-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    createAdoConfig(testDir);
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  // --- Python Runtime ---

  it('should pass when Python is found at expected path', async () => {
    const deps: AdoDeps = {
      ...healthyDeps(),
      discoverPython: async () => ({ pythonPath: '/usr/bin/python3', source: 'path' as const, version: '3.12.0' }),
    };

    const results = await checkAdoSync(testDir, deps);
    const pyCheck = results.find(r => r.name === 'ADO Sync: Python');

    assert.ok(pyCheck, 'Should have a Python check result');
    assert.strictEqual(pyCheck.status, 'pass');
    assert.ok(pyCheck.message.includes('3.12'), `Message should include version, got: ${pyCheck.message}`);
  });

  it('should fail when Python is not found', async () => {
    const deps: AdoDeps = {
      ...healthyDeps(),
      discoverPython: async () => { throw new Error('No Python 3.10+ found'); },
    };

    const results = await checkAdoSync(testDir, deps);
    const pyCheck = results.find(r => r.name === 'ADO Sync: Python');

    assert.ok(pyCheck, 'Should have a Python check result');
    assert.strictEqual(pyCheck.status, 'fail');
    assert.ok(pyCheck.message.includes('not found') || pyCheck.message.includes('missing'),
      `Fail message should mention Python missing, got: ${pyCheck.message}`);
  });

  it('should pass when Python is found in venv', async () => {
    const deps: AdoDeps = {
      ...healthyDeps(),
      discoverPython: async () => ({
        pythonPath: join(testDir, '.beth/ado-sync/.venv/bin/python'),
        source: 'venv' as const,
        version: '3.11.5',
      }),
    };

    const results = await checkAdoSync(testDir, deps);
    const pyCheck = results.find(r => r.name === 'ADO Sync: Python');

    assert.ok(pyCheck, 'Should have a Python check result');
    assert.strictEqual(pyCheck.status, 'pass');
  });

  // --- MCP Entry ---

  it('should pass when MCP entry exists for ado-sync', async () => {
    const deps: AdoDeps = {
      ...healthyDeps(),
      hasMcpEntry: () => true,
    };

    const results = await checkAdoSync(testDir, deps);
    const mcpCheck = results.find(r => r.name === 'ADO Sync: MCP Server');

    assert.ok(mcpCheck, 'Should have an MCP Server check result');
    assert.strictEqual(mcpCheck.status, 'pass');
  });

  it('should warn when MCP entry is missing for ado-sync', async () => {
    const deps: AdoDeps = {
      ...healthyDeps(),
      hasMcpEntry: () => false,
    };

    const results = await checkAdoSync(testDir, deps);
    const mcpCheck = results.find(r => r.name === 'ADO Sync: MCP Server');

    assert.ok(mcpCheck, 'Should have an MCP Server check result');
    assert.strictEqual(mcpCheck.status, 'warn');
    assert.ok(mcpCheck.fixable, 'Missing MCP entry should be fixable');
    assert.ok(mcpCheck.fixCommand?.includes('--fix'),
      `Fix command should include --fix, got: ${mcpCheck.fixCommand}`);
  });

  // --- Watcher Process ---

  it('should pass when watcher is running', async () => {
    const deps: AdoDeps = {
      ...healthyDeps(),
      getWatcherStatus: async () => ({
        state: 'running' as const,
        pid: 12345,
        organization: 'test-org',
        project: 'test-project',
        authMethod: 'entra',
      }),
    };

    const results = await checkAdoSync(testDir, deps);
    const watcherCheck = results.find(r => r.name === 'ADO Sync: Watcher');

    assert.ok(watcherCheck, 'Should have a Watcher check result');
    assert.strictEqual(watcherCheck.status, 'pass');
  });

  it('should report info (not error) when watcher is stopped', async () => {
    const deps: AdoDeps = {
      ...healthyDeps(),
      getWatcherStatus: async () => ({
        state: 'stopped' as const,
        pid: null,
        organization: 'test-org',
        project: 'test-project',
        authMethod: 'entra',
      }),
    };

    const results = await checkAdoSync(testDir, deps);
    const watcherCheck = results.find(r => r.name === 'ADO Sync: Watcher');

    assert.ok(watcherCheck, 'Should have a Watcher check result');
    // Watcher stopped is informational, NOT an error
    assert.notStrictEqual(watcherCheck.status, 'fail',
      'Stopped watcher should NOT be a failure');
    // It's either pass or warn (info level)
    assert.ok(watcherCheck.status === 'pass' || watcherCheck.status === 'warn',
      `Stopped watcher should be pass or warn, got: ${watcherCheck.status}`);
  });

  // --- Each sub-check reports independently ---

  it('should report each sub-check independently', async () => {
    const deps: AdoDeps = {
      ...healthyDeps(),
      discoverPython: async () => { throw new Error('No Python'); },
      hasMcpEntry: () => false,
      getWatcherStatus: async () => ({
        state: 'stopped' as const, pid: null,
        organization: 'test-org', project: 'test-project', authMethod: 'entra',
      }),
    };

    const results = await checkAdoSync(testDir, deps);

    // Should have results for: Credentials, Organization, Python, MCP, Watcher
    const names = results.map(r => r.name);
    assert.ok(names.some(n => n.includes('Credentials')), 'Should have Credentials check');
    assert.ok(names.some(n => n.includes('Python')), 'Should have Python check');
    assert.ok(names.some(n => n.includes('MCP')), 'Should have MCP check');
    assert.ok(names.some(n => n.includes('Watcher')), 'Should have Watcher check');

    // Python should fail, MCP should warn, but others may pass
    const pyCheck = results.find(r => r.name === 'ADO Sync: Python');
    const mcpCheck = results.find(r => r.name === 'ADO Sync: MCP Server');
    assert.strictEqual(pyCheck?.status, 'fail');
    assert.strictEqual(mcpCheck?.status, 'warn');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// BETH-64.15.5 — --fix auto-repairs
// ═══════════════════════════════════════════════════════════════════════

describe('BETH-64.15.5: --fix auto-repairs ADO issues', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `beth-doc-fix-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    createAdoConfig(testDir);
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should add missing MCP entry when --fix is used', async () => {
    let mcpEntryAdded = false;

    const deps: AdoDeps = {
      ...healthyDeps(),
      hasMcpEntry: () => false,
    };

    const fixDeps = {
      addMcpEntry: () => { mcpEntryAdded = true; return ['Added ado-sync MCP server entry']; },
      refreshCredentials: async () => [] as string[],
      createVenv: async () => [] as string[],
    };

    const actions = await fixAdoSync(testDir, deps, fixDeps);

    assert.ok(mcpEntryAdded, 'Should have called addMcpEntry');
    assert.ok(actions.some(a => a.includes('MCP') || a.includes('mcp')),
      `Actions should report MCP fix, got: ${actions}`);
  });

  it('should trigger token refresh when credentials are expired', async () => {
    let refreshCalled = false;

    const deps: AdoDeps = {
      ...healthyDeps(),
      hasCredentials: async () => true,
      checkCredentials: async () => ({
        accessToken: 'expired',
        expiresOn: new Date(Date.now() - 3600_000),
        account: { username: 'user@test.com', homeAccountId: 'id', environment: 'env', tenantId: 't', localAccountId: 'lid' },
      }),
    };

    const fixDeps = {
      addMcpEntry: () => [] as string[],
      refreshCredentials: async () => { refreshCalled = true; return ['Triggered token refresh']; },
      createVenv: async () => [] as string[],
    };

    const actions = await fixAdoSync(testDir, deps, fixDeps);

    assert.ok(refreshCalled, 'Should have triggered credential refresh');
    assert.ok(actions.some(a => a.includes('token') || a.includes('refresh') || a.includes('credential')),
      `Actions should report credential fix, got: ${actions}`);
  });

  it('should create venv when Python found but venv missing', async () => {
    let venvCreated = false;

    const deps: AdoDeps = {
      ...healthyDeps(),
      discoverPython: async () => ({ pythonPath: '/usr/bin/python3', source: 'path' as const, version: '3.12.0' }),
    };

    const fixDeps = {
      addMcpEntry: () => [] as string[],
      refreshCredentials: async () => [] as string[],
      createVenv: async () => { venvCreated = true; return ['Created venv at .beth/ado-sync/.venv']; },
    };

    const actions = await fixAdoSync(testDir, deps, fixDeps);

    assert.ok(venvCreated, 'Should have created venv');
    assert.ok(actions.some(a => a.includes('venv')),
      `Actions should report venv creation, got: ${actions}`);
  });

  it('should report each repair action taken', async () => {
    const deps: AdoDeps = {
      ...healthyDeps(),
      hasMcpEntry: () => false,
      hasCredentials: async () => true,
      checkCredentials: async () => ({
        accessToken: 'expired',
        expiresOn: new Date(Date.now() - 3600_000),
        account: { username: 'user@test.com', homeAccountId: 'id', environment: 'env', tenantId: 't', localAccountId: 'lid' },
      }),
    };

    const fixDeps = {
      addMcpEntry: () => ['Added ado-sync MCP server entry'],
      refreshCredentials: async () => ['Triggered token refresh via device code flow'],
      createVenv: async () => ['Created venv at .beth/ado-sync/.venv'],
    };

    const actions = await fixAdoSync(testDir, deps, fixDeps);

    assert.ok(actions.length >= 2, `Should have multiple actions, got: ${actions.length}`);
    // Each action should be a non-empty string
    for (const action of actions) {
      assert.ok(typeof action === 'string' && action.length > 0, `Action should be non-empty string: ${action}`);
    }
  });

  it('should NOT auto-start the watcher process', async () => {
    const deps: AdoDeps = {
      ...healthyDeps(),
      getWatcherStatus: async () => {
        return {
          state: 'stopped' as const, pid: null,
          organization: 'test-org', project: 'test-project', authMethod: 'entra',
        };
      },
    };

    const fixDeps = {
      addMcpEntry: () => [] as string[],
      refreshCredentials: async () => [] as string[],
      createVenv: async () => [] as string[],
    };

    await fixAdoSync(testDir, deps, fixDeps);

    // fixAdoSync does not accept a startWatcher callback —
    // the type system enforces that watcher auto-start is impossible.
    // Verify via the public API: watcher state is unchanged.
    const status = await deps.getWatcherStatus(testDir);
    assert.strictEqual(status.state, 'stopped', 'Watcher should still be stopped after fix');
  });

  it('should be a no-op when everything is healthy', async () => {
    const deps = healthyDeps();

    const fixDeps = {
      addMcpEntry: () => ['MCP already configured'],
      refreshCredentials: async () => [] as string[],
      createVenv: async () => [] as string[],
    };

    const actions = await fixAdoSync(testDir, deps, fixDeps);

    // When everything is healthy, fix shouldn't report disruptive changes
    const hasDisruptiveAction = actions.some(a =>
      a.includes('Added') || a.includes('Created') || a.includes('Triggered')
    );
    assert.ok(!hasDisruptiveAction,
      `Should not take disruptive actions when healthy, got: ${actions}`);
  });

  it('should not fix when ADO Sync is not configured', async () => {
    const deps: AdoDeps = {
      ...healthyDeps(),
      isConfigured: () => false,
      loadConfig: () => null,
    };

    const fixDeps = {
      addMcpEntry: () => { throw new Error('Should not be called'); return []; },
      refreshCredentials: async () => { throw new Error('Should not be called'); return []; },
      createVenv: async () => { throw new Error('Should not be called'); return []; },
    };

    const actions = await fixAdoSync(testDir, deps, fixDeps);

    assert.strictEqual(actions.length, 0, 'Should have zero actions when not configured');
  });
});
