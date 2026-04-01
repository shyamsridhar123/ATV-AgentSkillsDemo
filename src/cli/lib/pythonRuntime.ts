/**
 * Python runtime discovery + virtual environment management (BETH-64.11)
 *
 * Discovers a suitable Python 3.10+ runtime and manages the
 * .beth/ado-sync/.venv virtual environment for the ADO Sync watcher.
 *
 * Discovery order:
 *   1. .beth/ado-sync/.venv/bin/python (existing venv)
 *   2. python3 on PATH
 *   3. python on PATH
 */

import { execFileSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

export const VENV_DIR = '.beth/ado-sync/.venv';

const MIN_MAJOR = 3;
const MIN_MINOR = 10;

export interface PythonDiscoveryResult {
  /** Absolute or command path to the python binary */
  pythonPath: string;
  /** Where was it found: 'venv' or 'path' */
  source: 'venv' | 'path';
  /** Version string, e.g. "3.12.0" */
  version: string;
}

export interface VenvResult {
  /** Whether a new venv was created (false = reused existing) */
  created: boolean;
  /** Whether pip install ran successfully */
  depsInstalled: boolean;
  /** Path to the venv directory */
  venvPath: string;
}

/**
 * Parse a "Python X.Y.Z..." version string into [major, minor, patch].
 * Handles suffixes like rc1, beta2, etc.
 */
function parseVersion(output: string): { major: number; minor: number; patch: number; raw: string } | null {
  const match = output.match(/Python\s+(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    raw: `${match[1]}.${match[2]}.${match[3]}`,
  };
}

/**
 * Check if a python binary at the given command/path meets version requirements.
 * Returns version string or null if version is insufficient or command fails.
 */
function checkPythonVersion(pythonCmd: string): string | null {
  try {
    const output = execFileSync(pythonCmd, ['--version'], {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 10000,
    });
    const parsed = parseVersion(String(output));
    if (!parsed) return null;
    if (parsed.major > MIN_MAJOR) return parsed.raw;
    if (parsed.major === MIN_MAJOR && parsed.minor >= MIN_MINOR) return parsed.raw;
    return null;
  } catch {
    return null;
  }
}

const IS_WIN = process.platform === 'win32';

/** Get the platform-appropriate venv bin directory name */
export function venvBinDir(): string {
  return IS_WIN ? 'Scripts' : 'bin';
}

/** Get the platform-appropriate executable name (appends .exe on Windows) */
export function pythonExeName(): string {
  return IS_WIN ? 'python.exe' : 'python';
}

/** Get the platform-appropriate pip name (appends .exe on Windows) */
export function pipExeName(): string {
  return IS_WIN ? 'pip.exe' : 'pip';
}

/**
 * Discover a Python 3.10+ runtime.
 * Checks venv first, then python3, then python on PATH.
 * Throws if no suitable Python is found.
 */
export async function discoverPython(
  projectRoot: string
): Promise<PythonDiscoveryResult> {
  // 1. Check existing venv
  const venvPython = join(projectRoot, VENV_DIR, venvBinDir(), pythonExeName());
  if (existsSync(venvPython)) {
    const version = checkPythonVersion(venvPython);
    if (version) {
      return { pythonPath: venvPython, source: 'venv', version };
    }
  }

  // 2. Check python3 on PATH
  const python3Version = checkPythonVersion('python3');
  if (python3Version) {
    return { pythonPath: 'python3', source: 'path', version: python3Version };
  }

  // 3. Check python on PATH
  const pythonVersion = checkPythonVersion('python');
  if (pythonVersion) {
    return { pythonPath: 'python', source: 'path', version: pythonVersion };
  }

  // Nothing found
  throw new Error(
    'Python 3.10+ required. Install from https://python.org'
  );
}

/**
 * Create (or reuse) a virtual environment and install dependencies.
 */
export async function createVenv(
  projectRoot: string,
  pythonPath: string,
  adoSyncSourceDir: string
): Promise<VenvResult> {
  const venvPath = join(projectRoot, VENV_DIR);
  const venvPython = join(venvPath, venvBinDir(), pythonExeName());
  const venvPip = join(venvPath, venvBinDir(), pipExeName());
  const requirementsPath = join(adoSyncSourceDir, 'requirements.txt');
  let created = false;

  // Create venv if it doesn't exist
  if (!existsSync(venvPython)) {
    try {
      mkdirSync(join(projectRoot, '.beth', 'ado-sync'), { recursive: true });
      execFileSync(pythonPath, ['-m', 'venv', venvPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 120000,
      });
      created = true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to create venv at ${venvPath}: ${msg}`);
    }
  }

  // Install/update dependencies
  try {
    execFileSync(venvPip, ['install', '-r', requirementsPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 300000,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to install dependencies via pip: ${msg}`);
  }

  return { created, depsInstalled: true, venvPath };
}

