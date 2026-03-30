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
import { loadConfig, getBethDir } from './adoSyncConfig.js';
import { discoverPython } from './pythonRuntime.js';

export const PID_FILENAME = 'ado-sync.pid';

const IS_WIN = process.platform === 'win32';

/** Where the ado-sync Python package lives, relative to the beth package root */
const ADO_SYNC_PKG_DIR = join(dirname(dirname(dirname(__dirname))), 'ado-sync');

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

  // Discover Python
  const python = await discoverPython(projectRoot);

  // Build the config path
  const configPath = join(projectRoot, '.beth', 'ado-sync.json');

  // Spawn the watcher as a detached background process
  const child = spawn(
    python.pythonPath,
    ['-m', 'app.watcher_main', '--config', configPath],
    {
      cwd: ADO_SYNC_PKG_DIR,
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        PROJECT_ROOT: projectRoot,
      },
    }
  );

  const pid = child.pid ?? null;
  if (pid) {
    writePid(projectRoot, pid);
  }

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
  if (IS_WIN) {
    const { execFileSync } = await import('child_process');
    try {
      execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
        stdio: 'ignore',
      });
    } catch {
      // taskkill may fail if process already exited — that's OK
    }
  } else {
    process.kill(pid, 'SIGTERM');
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
