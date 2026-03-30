/**
 * Unit tests for ADO Sync process lifecycle (BETH-64.13)
 *
 * TDD: These tests were written BEFORE the implementation.
 * Each describe block maps to a backlog task (BETH-64.13.1 through BETH-64.13.7).
 *
 * Architecture:
 *   - adoSyncProcess.ts handles PID file management, process spawning, and status queries
 *   - All child_process / fs / process operations are mockable
 *   - Cross-platform: SIGTERM on Unix, taskkill on Windows
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// ─── Mocks ────────────────────────────────────────────────────────────

const mockSpawn = vi.fn();
const mockExecFileSync = vi.fn();
vi.mock('child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
  execFileSync: (...args: unknown[]) => mockExecFileSync(...args),
}));

const mockLoadConfig = vi.fn();
vi.mock('./adoSyncConfig.js', () => ({
  loadConfig: (...args: unknown[]) => mockLoadConfig(...args),
  getBethDir: (root: string) => `${root}/.beth`,
  getConfigPath: (root: string) => `${root}/.beth/ado-sync.json`,
}));

const mockDiscoverPython = vi.fn();
const mockCreateVenv = vi.fn();
vi.mock('./pythonRuntime.js', () => ({
  discoverPython: (...args: unknown[]) => mockDiscoverPython(...args),
  createVenv: (...args: unknown[]) => mockCreateVenv(...args),
}));

import {
  startWatcher,
  stopWatcher,
  getWatcherStatus,
  PID_FILENAME,
  isProcessAlive,
} from './adoSyncProcess.js';

// ─── Helpers ──────────────────────────────────────────────────────────

function makeTmpDir(): string {
  const dir = join(
    tmpdir(),
    `beth-adosync-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

function createBethDir(projectRoot: string): string {
  const bethDir = join(projectRoot, '.beth');
  mkdirSync(bethDir, { recursive: true });
  return bethDir;
}

function writePidFile(projectRoot: string, pid: number): string {
  const bethDir = createBethDir(projectRoot);
  const pidPath = join(bethDir, PID_FILENAME);
  writeFileSync(pidPath, String(pid), 'utf-8');
  return pidPath;
}

function readPidFile(projectRoot: string): string | null {
  const pidPath = join(projectRoot, '.beth', PID_FILENAME);
  if (!existsSync(pidPath)) return null;
  return readFileSync(pidPath, 'utf-8').trim();
}

/** Minimal mock config for tests that need ADO config */
const MOCK_CONFIG = {
  organization: 'contoso',
  project: 'Project Alpha',
  authMethod: 'entra' as const,
  tenantId: 'tenant-123',
  clientId: 'client-456',
  taskPrefix: 'BETH',
  tasksDir: './backlog/tasks',
  areaPath: '',
  iterationPath: '',
  aiFormatting: { enabled: true, endpoint: '', deployment: 'gpt-4o' },
};

// ─── Tests ────────────────────────────────────────────────────────────

describe('adoSyncProcess', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = makeTmpDir();
    vi.clearAllMocks();

    // Default: Python available
    mockDiscoverPython.mockResolvedValue({
      pythonPath: '/usr/bin/python3',
      source: 'path',
      version: '3.12.0',
    });

    // Default: venv creation succeeds
    mockCreateVenv.mockResolvedValue({
      created: true,
      depsInstalled: true,
      venvPath: join(projectRoot, '.beth', 'ado-sync', '.venv'),
    });

    // Default: config exists
    mockLoadConfig.mockReturnValue(MOCK_CONFIG);
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  // ─── BETH-64.13.1: start — spawns process and creates PID file ───

  describe('startWatcher (BETH-64.13.1)', () => {
    it('spawns python watcher and writes PID file', async () => {
      // Arrange: mock spawn returns a child with a pid
      const mockChild = {
        pid: 12345,
        unref: vi.fn(),
        on: vi.fn(),
        stderr: { on: vi.fn() },
      };
      mockSpawn.mockReturnValue(mockChild);

      // Act
      const result = await startWatcher(projectRoot);

      // Assert: PID file created
      expect(result.started).toBe(true);
      expect(result.pid).toBe(12345);
      const pidContent = readPidFile(projectRoot);
      expect(pidContent).toBe('12345');

      // Assert: spawn called with correct args
      expect(mockSpawn).toHaveBeenCalledOnce();
      const [cmd, args, opts] = mockSpawn.mock.calls[0];
      expect(cmd).toBe('/usr/bin/python3');
      expect(args).toContain('-m');
      expect(args).toContain('app.watcher_main');
      expect(opts.detached).toBe(true);
      expect(opts.stdio).toBe('ignore');
    });

    it('passes --config flag pointing to .beth/ado-sync.json', async () => {
      const mockChild = {
        pid: 99999,
        unref: vi.fn(),
        on: vi.fn(),
        stderr: { on: vi.fn() },
      };
      mockSpawn.mockReturnValue(mockChild);

      await startWatcher(projectRoot);

      const [, args] = mockSpawn.mock.calls[0];
      expect(args).toContain('--config');
      const configIdx = (args as string[]).indexOf('--config');
      expect((args as string[])[configIdx + 1]).toContain('.beth/ado-sync.json');
    });

    it('calls unref() to detach the child process', async () => {
      const mockChild = {
        pid: 55555,
        unref: vi.fn(),
        on: vi.fn(),
        stderr: { on: vi.fn() },
      };
      mockSpawn.mockReturnValue(mockChild);

      await startWatcher(projectRoot);

      expect(mockChild.unref).toHaveBeenCalledOnce();
    });

    it('creates .beth directory if it does not exist', async () => {
      const mockChild = {
        pid: 11111,
        unref: vi.fn(),
        on: vi.fn(),
        stderr: { on: vi.fn() },
      };
      mockSpawn.mockReturnValue(mockChild);

      // projectRoot has no .beth yet
      expect(existsSync(join(projectRoot, '.beth'))).toBe(false);

      await startWatcher(projectRoot);

      expect(existsSync(join(projectRoot, '.beth'))).toBe(true);
    });

    it('throws when no config is found', async () => {
      mockLoadConfig.mockReturnValue(null);

      await expect(startWatcher(projectRoot)).rejects.toThrow(/not configured/i);
      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it('throws when Python is not available', async () => {
      mockDiscoverPython.mockRejectedValue(new Error('Python 3.10+ required'));

      await expect(startWatcher(projectRoot)).rejects.toThrow(/python/i);
      expect(mockSpawn).not.toHaveBeenCalled();
    });
  });

  // ─── BETH-64.13.2: stop — terminates process and cleans PID ──────

  describe('stopWatcher (BETH-64.13.2)', () => {
    it('sends kill signal and removes PID file', async () => {
      // Arrange: PID file exists with a "live" process
      writePidFile(projectRoot, 54321);
      // Mock process.kill to succeed (process alive, then killed)
      const originalKill = process.kill;
      let killCallCount = 0;
      process.kill = vi.fn(((_pid: number, signal?: string | number) => {
        if (signal === 0 || signal === undefined) {
          // Process alive check
          killCallCount++;
          if (killCallCount <= 1) return true; // alive on first check
          throw Object.assign(new Error('ESRCH'), { code: 'ESRCH' }); // dead after kill
        }
        // Actual SIGTERM — do nothing (mock kill)
        return true;
      }) as typeof process.kill);

      try {
        // Act
        const result = await stopWatcher(projectRoot);

        // Assert
        expect(result.stopped).toBe(true);
        expect(result.pid).toBe(54321);
        expect(readPidFile(projectRoot)).toBeNull();
      } finally {
        process.kill = originalKill;
      }
    });

    it('uses SIGTERM signal on Unix', async () => {
      writePidFile(projectRoot, 54321);
      const killCalls: Array<{ pid: number; signal: string | number | undefined }> = [];
      const originalKill = process.kill;
      process.kill = vi.fn(((_pid: number, signal?: string | number) => {
        killCalls.push({ pid: _pid, signal });
        if (signal === 0) return true; // alive check
        // After SIGTERM, process is dead
        if (signal === 'SIGTERM') return true;
        throw Object.assign(new Error('ESRCH'), { code: 'ESRCH' });
      }) as typeof process.kill);

      try {
        await stopWatcher(projectRoot);

        const termCall = killCalls.find(c => c.signal === 'SIGTERM');
        expect(termCall).toBeDefined();
        expect(termCall!.pid).toBe(54321);
      } finally {
        process.kill = originalKill;
      }
    });

    it('removes PID file after successful stop', async () => {
      writePidFile(projectRoot, 54321);
      const originalKill = process.kill;
      process.kill = vi.fn((() => true) as unknown as typeof process.kill);

      try {
        await stopWatcher(projectRoot);
        expect(readPidFile(projectRoot)).toBeNull();
      } finally {
        process.kill = originalKill;
      }
    });
  });

  // ─── BETH-64.13.3: status — reports running state ────────────────

  describe('getWatcherStatus — running (BETH-64.13.3)', () => {
    it('returns running state with config details when process alive', async () => {
      writePidFile(projectRoot, 42000);
      const originalKill = process.kill;
      process.kill = vi.fn(((_pid: number, signal?: string | number) => {
        if (signal === 0) return true; // process is alive
        return true;
      }) as typeof process.kill);

      try {
        const status = await getWatcherStatus(projectRoot);

        expect(status.state).toBe('running');
        expect(status.pid).toBe(42000);
        expect(status.organization).toBe('contoso');
        expect(status.project).toBe('Project Alpha');
        expect(status.authMethod).toBe('entra');
      } finally {
        process.kill = originalKill;
      }
    });

    it('includes organization and project from config', async () => {
      writePidFile(projectRoot, 42000);
      const originalKill = process.kill;
      process.kill = vi.fn((() => true) as unknown as typeof process.kill);

      try {
        const status = await getWatcherStatus(projectRoot);
        expect(status.organization).toBe('contoso');
        expect(status.project).toBe('Project Alpha');
      } finally {
        process.kill = originalKill;
      }
    });
  });

  // ─── BETH-64.13.4: status — reports stopped state ────────────────

  describe('getWatcherStatus — stopped (BETH-64.13.4)', () => {
    it('returns stopped when no PID file exists', async () => {
      // No PID file at all
      const status = await getWatcherStatus(projectRoot);
      expect(status.state).toBe('stopped');
      expect(status.pid).toBeNull();
    });

    it('returns stopped when PID file exists but process is dead (stale)', async () => {
      writePidFile(projectRoot, 99999);
      const originalKill = process.kill;
      process.kill = vi.fn(((_pid: number, signal?: string | number) => {
        if (signal === 0) {
          throw Object.assign(new Error('ESRCH'), { code: 'ESRCH' });
        }
        return true;
      }) as typeof process.kill);

      try {
        const status = await getWatcherStatus(projectRoot);
        expect(status.state).toBe('stopped');
        // Stale PID file should be cleaned up
        expect(readPidFile(projectRoot)).toBeNull();
      } finally {
        process.kill = originalKill;
      }
    });

    it('shows org/project from config when configured but stopped', async () => {
      // No PID file, but config exists
      const status = await getWatcherStatus(projectRoot);
      expect(status.state).toBe('stopped');
      expect(status.organization).toBe('contoso');
      expect(status.project).toBe('Project Alpha');
    });

    it('shows not-configured when no config exists', async () => {
      mockLoadConfig.mockReturnValue(null);

      const status = await getWatcherStatus(projectRoot);
      expect(status.state).toBe('stopped');
      expect(status.organization).toBeNull();
      expect(status.project).toBeNull();
    });
  });

  // ─── BETH-64.13.5: start — no-op when already running ────────────

  describe('startWatcher — already running (BETH-64.13.5)', () => {
    it('returns already-running without spawning a new process', async () => {
      writePidFile(projectRoot, 42000);
      const originalKill = process.kill;
      process.kill = vi.fn(((_pid: number, signal?: string | number) => {
        if (signal === 0) return true; // process is alive
        return true;
      }) as typeof process.kill);

      try {
        const result = await startWatcher(projectRoot);

        expect(result.started).toBe(false);
        expect(result.alreadyRunning).toBe(true);
        expect(result.pid).toBe(42000);
        expect(mockSpawn).not.toHaveBeenCalled();
      } finally {
        process.kill = originalKill;
      }
    });

    it('does not overwrite PID file', async () => {
      writePidFile(projectRoot, 42000);
      const originalKill = process.kill;
      process.kill = vi.fn((() => true) as unknown as typeof process.kill);

      try {
        await startWatcher(projectRoot);
        expect(readPidFile(projectRoot)).toBe('42000');
      } finally {
        process.kill = originalKill;
      }
    });

    it('starts fresh if PID file exists but process is dead (stale)', async () => {
      writePidFile(projectRoot, 99999);
      const originalKill = process.kill;
      process.kill = vi.fn(((_pid: number, signal?: string | number) => {
        if (signal === 0) {
          throw Object.assign(new Error('ESRCH'), { code: 'ESRCH' });
        }
        return true;
      }) as typeof process.kill);

      const mockChild = {
        pid: 77777,
        unref: vi.fn(),
        on: vi.fn(),
        stderr: { on: vi.fn() },
      };
      mockSpawn.mockReturnValue(mockChild);

      try {
        const result = await startWatcher(projectRoot);

        // Should have cleaned up stale PID and started fresh
        expect(result.started).toBe(true);
        expect(result.pid).toBe(77777);
        expect(readPidFile(projectRoot)).toBe('77777');
      } finally {
        process.kill = originalKill;
      }
    });
  });

  // ─── BETH-64.13.6: stop — no-op when not running ─────────────────

  describe('stopWatcher — not running (BETH-64.13.6)', () => {
    it('returns not-running when no PID file exists', async () => {
      const result = await stopWatcher(projectRoot);

      expect(result.stopped).toBe(false);
      expect(result.wasRunning).toBe(false);
    });

    it('cleans up stale PID file when process is dead', async () => {
      writePidFile(projectRoot, 99999);
      const originalKill = process.kill;
      process.kill = vi.fn(((_pid: number, signal?: string | number) => {
        if (signal === 0) {
          throw Object.assign(new Error('ESRCH'), { code: 'ESRCH' });
        }
        return true;
      }) as typeof process.kill);

      try {
        const result = await stopWatcher(projectRoot);

        expect(result.stopped).toBe(false);
        expect(result.wasRunning).toBe(false);
        expect(result.stalePidCleaned).toBe(true);
        // PID file should be removed
        expect(readPidFile(projectRoot)).toBeNull();
      } finally {
        process.kill = originalKill;
      }
    });
  });

  // ─── BETH-64.13.7: lifecycle — full start/status/stop cycle ───────

  describe('lifecycle — start/status/stop (BETH-64.13.7)', () => {
    it('completes the full start → status → stop → status cycle', async () => {
      // Phase 1: Start
      const mockChild = {
        pid: 33333,
        unref: vi.fn(),
        on: vi.fn(),
        stderr: { on: vi.fn() },
      };
      mockSpawn.mockReturnValue(mockChild);

      const startResult = await startWatcher(projectRoot);
      expect(startResult.started).toBe(true);
      expect(startResult.pid).toBe(33333);

      // Phase 2: Status (process running)
      const originalKill = process.kill;
      let processAlive = true;
      process.kill = vi.fn(((_pid: number, signal?: string | number) => {
        if (signal === 0) {
          if (processAlive) return true;
          throw Object.assign(new Error('ESRCH'), { code: 'ESRCH' });
        }
        if (signal === 'SIGTERM') {
          processAlive = false;
          return true;
        }
        return true;
      }) as typeof process.kill);

      try {
        const runningStatus = await getWatcherStatus(projectRoot);
        expect(runningStatus.state).toBe('running');
        expect(runningStatus.pid).toBe(33333);
        expect(runningStatus.organization).toBe('contoso');

        // Phase 3: Stop
        const stopResult = await stopWatcher(projectRoot);
        expect(stopResult.stopped).toBe(true);
        expect(stopResult.pid).toBe(33333);

        // Phase 4: Status (process stopped)
        const stoppedStatus = await getWatcherStatus(projectRoot);
        expect(stoppedStatus.state).toBe('stopped');
        expect(stoppedStatus.pid).toBeNull();
      } finally {
        process.kill = originalKill;
      }
    });

    it('PID file exists after start, gone after stop', async () => {
      const mockChild = {
        pid: 44444,
        unref: vi.fn(),
        on: vi.fn(),
        stderr: { on: vi.fn() },
      };
      mockSpawn.mockReturnValue(mockChild);

      // Before start: no PID file
      expect(readPidFile(projectRoot)).toBeNull();

      // Start: PID file exists
      await startWatcher(projectRoot);
      expect(readPidFile(projectRoot)).toBe('44444');

      // Stop: PID file gone
      const originalKill = process.kill;
      process.kill = vi.fn((() => true) as unknown as typeof process.kill);
      try {
        await stopWatcher(projectRoot);
        expect(readPidFile(projectRoot)).toBeNull();
      } finally {
        process.kill = originalKill;
      }
    });
  });

  // ─── isProcessAlive ───────────────────────────────────────────────

  describe('isProcessAlive', () => {
    it('returns true when process.kill(pid, 0) succeeds', () => {
      const originalKill = process.kill;
      process.kill = vi.fn((() => true) as unknown as typeof process.kill);
      try {
        expect(isProcessAlive(12345)).toBe(true);
      } finally {
        process.kill = originalKill;
      }
    });

    it('returns false when process is ESRCH (not found)', () => {
      const originalKill = process.kill;
      process.kill = vi.fn((() => {
        throw Object.assign(new Error('ESRCH'), { code: 'ESRCH' });
      }) as unknown as typeof process.kill);
      try {
        expect(isProcessAlive(12345)).toBe(false);
      } finally {
        process.kill = originalKill;
      }
    });

    it('returns true on EPERM (process exists but no permission)', () => {
      const originalKill = process.kill;
      process.kill = vi.fn((() => {
        throw Object.assign(new Error('EPERM'), { code: 'EPERM' });
      }) as unknown as typeof process.kill);
      try {
        // EPERM means the process exists but we don't have permission
        // isProcessAlive should treat this as "alive"
        expect(isProcessAlive(12345)).toBe(true);
      } finally {
        process.kill = originalKill;
      }
    });
  });
});
