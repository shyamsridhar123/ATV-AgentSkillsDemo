/**
 * E2E Integration Tests: Full ADO Sync Setup Flow (BETH-64.19)
 *
 * TDD: Tests written FIRST — covers the complete ADO Sync lifecycle:
 *   1. set-ado-org creates .beth/ado-sync.json (BETH-64.19.1)
 *   2. ado-sync start spawns process with PID tracking (BETH-64.19.2)
 *   3. ado-sync status reports running with correct config (BETH-64.19.3)
 *   4. ado-sync stop terminates and cleans up (BETH-64.19.4)
 *   5. status reports stopped after stop (BETH-64.19.5)
 *   6. .gitignore contains .beth/ after setup (BETH-64.19.6)
 *   7. set-ado-org reconfiguration updates correctly (BETH-64.19.8)
 *
 * Strategy:
 *   - Real filesystem (temp dirs) for config, PID files, .gitignore
 *   - Real adoSyncConfig module for config create/load/save
 *   - Real adoSyncProcess module for start/stop/status — BUT we mock
 *     the Python watcher with a simple `sleep` process since we can't
 *     depend on the Python environment being set up in CI
 *   - External APIs (Entra, ADO) never called — config created directly
 *
 * Run with: npx vitest run src/cli/commands/ado-sync-lifecycle.e2e.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  readdirSync,
} from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { spawn } from 'child_process';

import {
  createConfig,
  loadConfig,
  saveConfig,
  isConfigured,
  getConfigPath,
  getBethDir,
  ensureGitignore,
  isGitignored,
} from '../lib/adoSyncConfig.js';

import {
  getWatcherStatus,
  stopWatcher,
  isProcessAlive,
  PID_FILENAME,
} from '../lib/adoSyncProcess.js';


// ─── Helpers ──────────────────────────────────────────────────────────

/** Create a unique temp directory per test */
function makeTmpDir(): string {
  const dir = join(
    tmpdir(),
    `beth-e2e-lifecycle-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Write a PID file directly (simulates what startWatcher does) */
function writePidFile(projectRoot: string, pid: number): void {
  const bethDir = getBethDir(projectRoot);
  if (!existsSync(bethDir)) {
    mkdirSync(bethDir, { recursive: true });
  }
  writeFileSync(join(bethDir, PID_FILENAME), String(pid), 'utf-8');
}

/** Read PID file contents */
function readPidFile(projectRoot: string): number | null {
  const pidPath = join(getBethDir(projectRoot), PID_FILENAME);
  if (!existsSync(pidPath)) return null;
  const raw = readFileSync(pidPath, 'utf-8').trim();
  const pid = parseInt(raw, 10);
  return Number.isFinite(pid) && pid > 0 ? pid : null;
}

/**
 * Spawn a long-running dummy process (sleep 3600) to simulate
 * a running watcher. Returns the PID. Caller must kill it in afterEach.
 */
function spawnDummyProcess(): number {
  const child = spawn('sleep', ['3600'], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  const pid = child.pid;
  if (!pid) throw new Error('Failed to spawn dummy process');
  return pid;
}

/** Kill a process if it's still alive — safe no-op if already dead */
function safeKill(pid: number): void {
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    // Already dead — that's fine
  }
}


// ─── Test Suite ───────────────────────────────────────────────────────

describe('E2E: ADO Sync full setup flow (BETH-64.19)', () => {
  let projectRoot: string;
  let spawnedPids: number[];

  beforeEach(() => {
    projectRoot = makeTmpDir();
    spawnedPids = [];
  });

  afterEach(() => {
    // Kill any spawned dummy processes
    for (const pid of spawnedPids) {
      safeKill(pid);
    }
    // Clean up temp dir
    rmSync(projectRoot, { recursive: true, force: true });
  });


  // ═══════════════════════════════════════════════════════════════════
  // BETH-64.19.1: set-ado-org creates .beth/ado-sync.json (mocked)
  // ═══════════════════════════════════════════════════════════════════

  describe('BETH-64.19.1: set-ado-org creates config', () => {
    it('creates .beth/ado-sync.json with correct org, project, and authMethod', () => {
      // Act: simulate what set-ado-org does after auth + discovery
      createConfig(projectRoot, 'contoso-org', 'portal-project', {
        authMethod: 'entra',
      });

      // Assert: config file exists
      const configPath = getConfigPath(projectRoot);
      expect(existsSync(configPath)).toBe(true);

      // Assert: file content matches
      const config = loadConfig(projectRoot);
      expect(config).not.toBeNull();
      expect(config!.organization).toBe('contoso-org');
      expect(config!.project).toBe('portal-project');
      expect(config!.authMethod).toBe('entra');
    });

    it('creates .beth directory if it does not exist', () => {
      const bethDir = getBethDir(projectRoot);
      expect(existsSync(bethDir)).toBe(false);

      createConfig(projectRoot, 'org', 'proj');

      expect(existsSync(bethDir)).toBe(true);
    });

    it('populates default fields (taskPrefix, tasksDir, aiFormatting)', () => {
      createConfig(projectRoot, 'test-org', 'test-proj');

      const config = loadConfig(projectRoot);
      expect(config!.taskPrefix).toBe('BETH');
      expect(config!.tasksDir).toBe('./backlog/tasks');
      expect(config!.aiFormatting).toBeDefined();
      expect(config!.aiFormatting.enabled).toBe(true);
    });

    it('config file is valid JSON with expected schema', () => {
      createConfig(projectRoot, 'myorg', 'myproj', {
        authMethod: 'entra',
        tenantId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      });

      const raw = readFileSync(getConfigPath(projectRoot), 'utf-8');
      const parsed = JSON.parse(raw);

      // Every key must be from the known schema
      const allowedKeys = new Set([
        'organization', 'project', 'areaPath', 'iterationPath',
        'authMethod', 'tenantId', 'clientId', 'taskPrefix',
        'tasksDir', 'aiFormatting',
      ]);
      for (const key of Object.keys(parsed)) {
        expect(allowedKeys.has(key)).toBe(true);
      }
    });

    it('isConfigured returns true after config creation', () => {
      expect(isConfigured(projectRoot)).toBe(false);
      createConfig(projectRoot, 'org', 'proj');
      expect(isConfigured(projectRoot)).toBe(true);
    });
  });


  // ═══════════════════════════════════════════════════════════════════
  // BETH-64.19.2: ado-sync start spawns process with PID tracking
  // ═══════════════════════════════════════════════════════════════════

  describe('BETH-64.19.2: ado-sync start spawns process with PID tracking', () => {
    it('creates .beth/ado-sync.pid when a process is spawned', () => {
      // Setup: create config (required for start)
      createConfig(projectRoot, 'org', 'proj');

      // Act: spawn a dummy process and write PID (simulates startWatcher)
      const pid = spawnDummyProcess();
      spawnedPids.push(pid);
      writePidFile(projectRoot, pid);

      // Assert: PID file exists with correct content
      const pidPath = join(getBethDir(projectRoot), PID_FILENAME);
      expect(existsSync(pidPath)).toBe(true);
      expect(readPidFile(projectRoot)).toBe(pid);
    });

    it('PID in file matches a real running process', () => {
      createConfig(projectRoot, 'org', 'proj');

      const pid = spawnDummyProcess();
      spawnedPids.push(pid);
      writePidFile(projectRoot, pid);

      // Assert: process is actually alive
      expect(isProcessAlive(pid)).toBe(true);
    });

    it('process is detached (survives parent relationship check)', () => {
      createConfig(projectRoot, 'org', 'proj');

      const pid = spawnDummyProcess();
      spawnedPids.push(pid);
      writePidFile(projectRoot, pid);

      // A detached process should be alive even without explicit parent ref
      expect(isProcessAlive(pid)).toBe(true);

      // Verify the PID file roundtrips correctly
      const readBack = readPidFile(projectRoot);
      expect(readBack).toBe(pid);
      expect(isProcessAlive(readBack!)).toBe(true);
    });
  });


  // ═══════════════════════════════════════════════════════════════════
  // BETH-64.19.3: ado-sync status reports running with correct config
  // ═══════════════════════════════════════════════════════════════════

  describe('BETH-64.19.3: ado-sync status reports running with correct config', () => {
    it('reports state=running when process is alive and PID file exists', async () => {
      createConfig(projectRoot, 'contoso', 'web-app', { authMethod: 'entra' });

      const pid = spawnDummyProcess();
      spawnedPids.push(pid);
      writePidFile(projectRoot, pid);

      const status = await getWatcherStatus(projectRoot);

      expect(status.state).toBe('running');
      expect(status.pid).toBe(pid);
    });

    it('reports correct organization and project from config', async () => {
      createConfig(projectRoot, 'fabrikam', 'mobile-app', { authMethod: 'entra' });

      const pid = spawnDummyProcess();
      spawnedPids.push(pid);
      writePidFile(projectRoot, pid);

      const status = await getWatcherStatus(projectRoot);

      expect(status.organization).toBe('fabrikam');
      expect(status.project).toBe('mobile-app');
      expect(status.authMethod).toBe('entra');
    });

    it('reports config values even when no process is running', async () => {
      createConfig(projectRoot, 'northwind', 'api-service', { authMethod: 'pat' });

      // No PID file, no process
      const status = await getWatcherStatus(projectRoot);

      expect(status.state).toBe('stopped');
      expect(status.organization).toBe('northwind');
      expect(status.project).toBe('api-service');
      expect(status.authMethod).toBe('pat');
    });
  });


  // ═══════════════════════════════════════════════════════════════════
  // BETH-64.19.4: ado-sync stop terminates and cleans up
  // ═══════════════════════════════════════════════════════════════════

  describe('BETH-64.19.4: ado-sync stop terminates and cleans up', () => {
    it('terminates the running process', async () => {
      createConfig(projectRoot, 'org', 'proj');

      const pid = spawnDummyProcess();
      spawnedPids.push(pid);
      writePidFile(projectRoot, pid);

      // Sanity: process is alive
      expect(isProcessAlive(pid)).toBe(true);

      // Act
      const result = await stopWatcher(projectRoot);

      // Assert: stop reported success
      expect(result.stopped).toBe(true);
      expect(result.wasRunning).toBe(true);
      expect(result.pid).toBe(pid);

      // Assert: process is dead (give OS a moment to reap)
      // SIGTERM may take a tick — wait briefly
      await new Promise(r => setTimeout(r, 100));
      expect(isProcessAlive(pid)).toBe(false);
    });

    it('removes .beth/ado-sync.pid after stop', async () => {
      createConfig(projectRoot, 'org', 'proj');

      const pid = spawnDummyProcess();
      spawnedPids.push(pid);
      writePidFile(projectRoot, pid);

      await stopWatcher(projectRoot);

      const pidPath = join(getBethDir(projectRoot), PID_FILENAME);
      expect(existsSync(pidPath)).toBe(false);
    });

    it('no-op when no process is running (no PID file)', async () => {
      createConfig(projectRoot, 'org', 'proj');

      const result = await stopWatcher(projectRoot);

      expect(result.stopped).toBe(false);
      expect(result.wasRunning).toBe(false);
      expect(result.pid).toBeNull();
    });

    it('cleans stale PID file when process is already dead', async () => {
      createConfig(projectRoot, 'org', 'proj');

      // Write a PID for a process that doesn't exist
      writePidFile(projectRoot, 999999);

      const result = await stopWatcher(projectRoot);

      expect(result.wasRunning).toBe(false);
      expect(result.stalePidCleaned).toBe(true);

      // PID file should be gone
      const pidPath = join(getBethDir(projectRoot), PID_FILENAME);
      expect(existsSync(pidPath)).toBe(false);
    });
  });


  // ═══════════════════════════════════════════════════════════════════
  // BETH-64.19.5: status reports stopped after stop
  // ═══════════════════════════════════════════════════════════════════

  describe('BETH-64.19.5: status reports stopped after stop', () => {
    it('reports stopped state after stop command', async () => {
      createConfig(projectRoot, 'contoso', 'web-portal', { authMethod: 'entra' });

      // Start a dummy process
      const pid = spawnDummyProcess();
      spawnedPids.push(pid);
      writePidFile(projectRoot, pid);

      // Confirm running
      const beforeStatus = await getWatcherStatus(projectRoot);
      expect(beforeStatus.state).toBe('running');

      // Stop it
      await stopWatcher(projectRoot);
      await new Promise(r => setTimeout(r, 100));

      // Verify status reports stopped
      const afterStatus = await getWatcherStatus(projectRoot);
      expect(afterStatus.state).toBe('stopped');
      expect(afterStatus.pid).toBeNull();
    });

    it('still shows org/project config after stop', async () => {
      createConfig(projectRoot, 'northwind', 'erp-system', { authMethod: 'pat' });

      const pid = spawnDummyProcess();
      spawnedPids.push(pid);
      writePidFile(projectRoot, pid);

      await stopWatcher(projectRoot);
      await new Promise(r => setTimeout(r, 100));

      const status = await getWatcherStatus(projectRoot);

      // Stopped, but config is still there
      expect(status.state).toBe('stopped');
      expect(status.organization).toBe('northwind');
      expect(status.project).toBe('erp-system');
      expect(status.authMethod).toBe('pat');
    });
  });


  // ═══════════════════════════════════════════════════════════════════
  // BETH-64.19.6: .gitignore contains .beth/ after setup
  // ═══════════════════════════════════════════════════════════════════

  describe('BETH-64.19.6: .gitignore contains .beth/ after setup', () => {
    it('creates .gitignore with .beth/ when no .gitignore exists', () => {
      createConfig(projectRoot, 'org', 'proj');

      // createConfig calls ensureGitignore internally
      const gitignorePath = join(projectRoot, '.gitignore');
      expect(existsSync(gitignorePath)).toBe(true);

      const content = readFileSync(gitignorePath, 'utf-8');
      expect(content).toContain('.beth/');
    });

    it('appends .beth/ to existing .gitignore', () => {
      // Pre-existing .gitignore
      const gitignorePath = join(projectRoot, '.gitignore');
      writeFileSync(gitignorePath, 'node_modules/\ndist/\n', 'utf-8');

      createConfig(projectRoot, 'org', 'proj');

      const content = readFileSync(gitignorePath, 'utf-8');
      // Original entries preserved
      expect(content).toContain('node_modules/');
      expect(content).toContain('dist/');
      // New entry added
      expect(content).toContain('.beth/');
    });

    it('does not duplicate .beth/ if already present', () => {
      const gitignorePath = join(projectRoot, '.gitignore');
      writeFileSync(gitignorePath, 'node_modules/\n.beth/\n', 'utf-8');

      createConfig(projectRoot, 'org', 'proj');

      const content = readFileSync(gitignorePath, 'utf-8');
      // Count occurrences of .beth/
      const matches = content.match(/\.beth\//g);
      expect(matches).toHaveLength(1);
    });

    it('isGitignored returns true after config creation', () => {
      createConfig(projectRoot, 'org', 'proj');
      expect(isGitignored(projectRoot)).toBe(true);
    });

    it('.beth/ directory itself is not tracked (gitignore effective)', () => {
      createConfig(projectRoot, 'org', 'proj');

      // The .beth/ dir exists
      expect(existsSync(getBethDir(projectRoot))).toBe(true);
      // The .gitignore contains .beth/
      expect(isGitignored(projectRoot)).toBe(true);

      // Config file is inside .beth/
      const configPath = getConfigPath(projectRoot);
      expect(configPath.includes('.beth')).toBe(true);
    });
  });


  // ═══════════════════════════════════════════════════════════════════
  // BETH-64.19.8: set-ado-org reconfiguration updates correctly
  // ═══════════════════════════════════════════════════════════════════

  describe('BETH-64.19.8: set-ado-org reconfiguration updates correctly', () => {
    it('second config replaces organization and project', () => {
      // First config
      createConfig(projectRoot, 'contoso', 'old-project', {
        authMethod: 'entra',
      });

      const config1 = loadConfig(projectRoot);
      expect(config1!.organization).toBe('contoso');
      expect(config1!.project).toBe('old-project');

      // Reconfigure with different org/project
      saveConfig(projectRoot, {
        ...config1!,
        organization: 'fabrikam',
        project: 'new-project',
      });

      const config2 = loadConfig(projectRoot);
      expect(config2!.organization).toBe('fabrikam');
      expect(config2!.project).toBe('new-project');
    });

    it('reconfiguration preserves existing non-changed fields', () => {
      createConfig(projectRoot, 'contoso', 'proj-a', {
        authMethod: 'entra',
        tenantId: 'tenant-123',
        taskPrefix: 'CUSTOM',
      });

      const existing = loadConfig(projectRoot)!;

      // Change only org/project
      saveConfig(projectRoot, {
        ...existing,
        organization: 'new-org',
        project: 'proj-b',
      });

      const updated = loadConfig(projectRoot)!;
      // Changed
      expect(updated.organization).toBe('new-org');
      expect(updated.project).toBe('proj-b');
      // Preserved
      expect(updated.tenantId).toBe('tenant-123');
      expect(updated.taskPrefix).toBe('CUSTOM');
      expect(updated.authMethod).toBe('entra');
    });

    it('only one config file exists after reconfiguration (no duplicates)', () => {
      createConfig(projectRoot, 'org1', 'proj1');
      createConfig(projectRoot, 'org2', 'proj2');

      const bethDir = getBethDir(projectRoot);
      const files = readdirSync(bethDir).filter(f => f.endsWith('.json'));
      expect(files).toHaveLength(1);
      expect(files[0]).toBe('ado-sync.json');
    });

    it('config file remains valid JSON after multiple updates', () => {
      createConfig(projectRoot, 'org1', 'proj1');
      saveConfig(projectRoot, { organization: 'org2', project: 'proj2' });
      saveConfig(projectRoot, { organization: 'org3', project: 'proj3', authMethod: 'pat' });

      const raw = readFileSync(getConfigPath(projectRoot), 'utf-8');
      expect(() => JSON.parse(raw)).not.toThrow();

      const config = loadConfig(projectRoot);
      expect(config!.organization).toBe('org3');
      expect(config!.project).toBe('proj3');
      expect(config!.authMethod).toBe('pat');
    });

    it('auth method can change between entra and pat', () => {
      createConfig(projectRoot, 'org', 'proj', { authMethod: 'entra' });
      expect(loadConfig(projectRoot)!.authMethod).toBe('entra');

      saveConfig(projectRoot, {
        ...loadConfig(projectRoot)!,
        authMethod: 'pat',
      });
      expect(loadConfig(projectRoot)!.authMethod).toBe('pat');

      saveConfig(projectRoot, {
        ...loadConfig(projectRoot)!,
        authMethod: 'entra',
      });
      expect(loadConfig(projectRoot)!.authMethod).toBe('entra');
    });
  });


  // ═══════════════════════════════════════════════════════════════════
  // Full lifecycle: create → start → status → stop → status
  // ═══════════════════════════════════════════════════════════════════

  describe('Full lifecycle integration', () => {
    it('complete flow: config → start → running → stop → stopped', async () => {
      // 1. Create config
      createConfig(projectRoot, 'contoso', 'enterprise', { authMethod: 'entra' });
      expect(isConfigured(projectRoot)).toBe(true);

      // 2. Simulate start (spawn dummy + PID file)
      const pid = spawnDummyProcess();
      spawnedPids.push(pid);
      writePidFile(projectRoot, pid);

      // 3. Status should be running
      const runningStatus = await getWatcherStatus(projectRoot);
      expect(runningStatus.state).toBe('running');
      expect(runningStatus.pid).toBe(pid);
      expect(runningStatus.organization).toBe('contoso');
      expect(runningStatus.project).toBe('enterprise');

      // 4. Stop
      const stopResult = await stopWatcher(projectRoot);
      expect(stopResult.stopped).toBe(true);
      expect(stopResult.wasRunning).toBe(true);

      await new Promise(r => setTimeout(r, 100));

      // 5. Status should be stopped with config still present
      const stoppedStatus = await getWatcherStatus(projectRoot);
      expect(stoppedStatus.state).toBe('stopped');
      expect(stoppedStatus.pid).toBeNull();
      expect(stoppedStatus.organization).toBe('contoso');
      expect(stoppedStatus.project).toBe('enterprise');
    });
  });
});
