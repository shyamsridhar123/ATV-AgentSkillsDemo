/**
 * ADO Sync process lifecycle management (BETH-64.13)
 *
 * Handles starting/stopping the Python watcher as a detached background process,
 * PID file management, and status queries.
 *
 * PID file: .beth/ado-sync.pid
 * Config:   .beth/ado-sync.json (via adoSyncConfig)
 */

import { spawn } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadConfig, getBethDir, getConfigPath } from './adoSyncConfig.js';
import { discoverPython, createVenv } from './pythonRuntime.js';

export const PID_FILENAME = 'ado-sync.pid';

const IS_WIN = process.platform === 'win32';

/** Derive package root from import.meta.url (ESM-safe, no __dirname) */
const __thisDir = dirname(fileURLToPath(import.meta.url));

/** Where the ado-sync Python package lives, relative to the beth package root */
function getAdoSyncPkgDir(): string {
  // From dist/cli/lib/ → ../../.. → repo root → ado-sync/
  const candidate = join(__thisDir, '..', '..', '..', 'ado-sync');
  if (!existsSync(candidate)) {
    throw new Error(
      `ado-sync Python package not found at ${candidate}. ` +
      'Ensure the package is installed correctly.'
    );
  }
  return candidate;
}

// ─── Types ────────────────────────────────────────────────────────────

export interface StartResult {
  started: boolean;
  alreadyRunning?: boolean;
  pid: number | null;
}

export interface StopResult {
  stopped: boolean;
  wasRunning: boolean;
  pid: number | null;
  stalePidCleaned?: boolean;
}

export interface WatcherStatus {
  state: 'running' | 'stopped';
  pid: number | null;
  organization: string | null;
  project: string | null;
  authMethod: string | null;
}

// ─── PID file helpers ─────────────────────────────────────────────────

function pidFilePath(projectRoot: string): string {
  return join(getBethDir(projectRoot), PID_FILENAME);
}

function readPid(projectRoot: string): number | null {
  const p = pidFilePath(projectRoot);
  if (!existsSync(p)) return null;
  const raw = readFileSync(p, 'utf-8').trim();
  const pid = parseInt(raw, 10);
  return Number.isFinite(pid) && pid > 0 ? pid : null;
}

function writePid(projectRoot: string, pid: number): void {
  const dir = getBethDir(projectRoot);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(pidFilePath(projectRoot), String(pid), 'utf-8');
}

function removePidFile(projectRoot: string): void {
  const p = pidFilePath(projectRoot);
  if (existsSync(p)) {
    unlinkSync(p);
  }
}

// ─── Process helpers ──────────────────────────────────────────────────

/**
 * Check if a process with the given PID is alive.
 * Uses kill(pid, 0) which checks existence without sending a signal.
 */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ESRCH') return false;   // No such process
    if (code === 'EPERM') return true;    // Process exists but no permission
    return false;
  }
}

// ─── Public API ───────────────────────────────────────────────────────

/**
 * Start the ADO Sync watcher as a detached background process.
 *
 * - Checks for existing running process (no-op if already running)
 * - Cleans stale PID files
 * - Discovers Python runtime
 * - Spawns the watcher detached with PID tracking
 */
export async function startWatcher(projectRoot: string): Promise<StartResult> {
  // Check config exists
  const config = loadConfig(projectRoot);
  if (!config) {
    throw new Error(
      'ADO Sync is not configured. Run "npx beth-copilot set-ado-org" first.'
    );
  }

  // Check for existing process
  const existingPid = readPid(projectRoot);
  if (existingPid !== null) {
    if (isProcessAlive(existingPid)) {
      return { started: false, alreadyRunning: true, pid: existingPid };
    }
    // Stale PID — clean up and continue
    removePidFile(projectRoot);
  }

  // Discover Python and ensure venv + deps are ready
  const python = await discoverPython(projectRoot);
  const adoSyncDir = getAdoSyncPkgDir();
  const venv = await createVenv(projectRoot, python.pythonPath, adoSyncDir);

  // Use venv python for the watcher (deps are installed there)
  const venvPython = join(
    venv.venvPath,
    IS_WIN ? 'Scripts' : 'bin',
    IS_WIN ? 'python.exe' : 'python'
  );
  const pythonCmd = existsSync(venvPython) ? venvPython : python.pythonPath;

  // Use centralized config path
  const configPath = getConfigPath(projectRoot);

  // Spawn the watcher as a detached background process
  const child = spawn(
    pythonCmd,
    ['-m', 'app.watcher_main', '--config', configPath],
    {
      cwd: adoSyncDir,
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        PROJECT_ROOT: projectRoot,
      },
    }
  );

  const pid = child.pid ?? null;
  if (!pid) {
    throw new Error(
      'Failed to start ADO Sync watcher: spawn returned no PID. ' +
      'Check that Python is installed and the ado-sync package exists.'
    );
  }

  // Listen for early spawn errors (e.g. ENOENT, bad cwd)
  child.on('error', (err: Error) => {
    removePidFile(projectRoot);
    // Error is async — by the time it fires we've already returned.
    // PID cleanup is the best we can do for a detached child.
    console.error(`ADO Sync watcher spawn error: ${err.message}`);
  });

  writePid(projectRoot, pid);

  // Detach — parent should not wait for this child
  child.unref();

  return { started: true, pid };
}

/**
 * Stop the ADO Sync watcher by reading PID and sending SIGTERM.
 *
 * - No-op if no PID file or process already dead
 * - Cleans stale PID files
 * - Removes PID file after successful stop
 */
export async function stopWatcher(projectRoot: string): Promise<StopResult> {
  const pid = readPid(projectRoot);

  // No PID file at all
  if (pid === null) {
    return { stopped: false, wasRunning: false, pid: null };
  }

  // Check if process is actually alive
  if (!isProcessAlive(pid)) {
    // Stale PID file — clean up
    removePidFile(projectRoot);
    return { stopped: false, wasRunning: false, pid, stalePidCleaned: true };
  }

  // Send SIGTERM (or taskkill on Windows)
  try {
    if (IS_WIN) {
      const { execFileSync } = await import('child_process');
      execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
        stdio: 'ignore',
      });
    } else {
      process.kill(pid, 'SIGTERM');
    }
  } catch (error: unknown) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ESRCH') {
      // ESRCH = already exited (race condition) — treat as success.
      // Anything else is unexpected — still clean up PID but re-throw.
      removePidFile(projectRoot);
      throw error;
    }
  }

  // Remove PID file
  removePidFile(projectRoot);

  return { stopped: true, wasRunning: true, pid };
}

/**
 * Get the current status of the ADO Sync watcher.
 *
 * Checks PID file + process liveness, reads config for org/project info.
 * Cleans stale PID files automatically.
 */
export async function getWatcherStatus(projectRoot: string): Promise<WatcherStatus> {
  const config = loadConfig(projectRoot);
  const org = config?.organization ?? null;
  const project = config?.project ?? null;
  const authMethod = config?.authMethod ?? null;

  const pid = readPid(projectRoot);

  // No PID file
  if (pid === null) {
    return { state: 'stopped', pid: null, organization: org, project, authMethod };
  }

  // Check if process is alive
  if (isProcessAlive(pid)) {
    return { state: 'running', pid, organization: org, project, authMethod };
  }

  // Stale PID — clean up
  removePidFile(projectRoot);
  return { state: 'stopped', pid: null, organization: org, project, authMethod };
}
