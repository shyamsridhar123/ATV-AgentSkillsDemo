/**
 * Unit tests for Python runtime discovery + venv creation (BETH-64.11)
 *
 * TDD: These tests were written BEFORE the implementation.
 * Each test maps to a backlog task (BETH-64.11.1 through BETH-64.11.8).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Mock child_process at module level (ESM-compatible)
const mockExecFileSync = vi.fn();
vi.mock('child_process', () => ({
  execFileSync: (...args: unknown[]) => mockExecFileSync(...args),
}));

// Import after mock declaration (vitest hoists vi.mock)
import {
  discoverPython,
  createVenv,
  pythonExeName,
  pipExeName,
} from './pythonRuntime.js';

/** Create a temporary project directory for each test */
function makeTmpDir(): string {
  const dir = join(
    tmpdir(),
    `beth-pyrt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('pythonRuntime', () => {
  let projectRoot: string;

  const PYTHON_EXE = pythonExeName();
  const PIP_EXE = pipExeName();
  const BIN_DIR = process.platform === 'win32' ? 'Scripts' : 'bin';

  beforeEach(() => {
    projectRoot = makeTmpDir();
    mockExecFileSync.mockReset();
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  // ─── discoverPython ──────────────────────────────────────────────

  describe('discoverPython', () => {
    // BETH-64.11.1: finds venv Python first
    describe('venv Python (BETH-64.11.1)', () => {
      it('returns venv python path when venv exists', async () => {
        // Arrange: create a fake venv with a python binary
        const venvBin = join(projectRoot, '.beth', 'ado-sync', '.venv', BIN_DIR);
        mkdirSync(venvBin, { recursive: true });
        writeFileSync(join(venvBin, PYTHON_EXE), '#!/bin/sh\necho "Python 3.12.0"', { mode: 0o755 });

        // Mock version check for the venv python
        mockExecFileSync.mockReturnValue(Buffer.from('Python 3.12.0\n'));

        // Act
        const result = await discoverPython(projectRoot);

        // Assert
        expect(result.pythonPath).toBe(join(venvBin, PYTHON_EXE));
        expect(result.source).toBe('venv');
      });

      it('does NOT search PATH when venv python found', async () => {
        // Arrange: venv exists
        const venvBin = join(projectRoot, '.beth', 'ado-sync', '.venv', BIN_DIR);
        mkdirSync(venvBin, { recursive: true });
        writeFileSync(join(venvBin, PYTHON_EXE), '#!/bin/sh\necho "Python 3.12.0"', { mode: 0o755 });

        mockExecFileSync.mockReturnValue(Buffer.from('Python 3.12.0\n'));

        // Act
        await discoverPython(projectRoot);

        // Assert — should only be called once (version check for venv python)
        expect(mockExecFileSync).toHaveBeenCalledTimes(1);
        // The single call should be for the venv python, not python3/python on PATH
        expect(String(mockExecFileSync.mock.calls[0][0])).toContain('.venv');
      });
    });

    // BETH-64.11.2: falls back to python3 on PATH
    describe('python3 fallback (BETH-64.11.2)', () => {
      it('returns python3 when venv missing but python3 is on PATH', async () => {
        // Arrange: no venv, python3 available
        mockExecFileSync.mockImplementation((cmd: string) => {
          const cmdStr = String(cmd);
          if (cmdStr.includes('python3')) {
            return Buffer.from('Python 3.11.5\n');
          }
          throw new Error('not found');
        });

        // Act
        const result = await discoverPython(projectRoot);

        // Assert
        expect(result.pythonPath).toBe('python3');
        expect(result.source).toBe('path');
        expect(result.version).toMatch(/3\.11/);
      });

      it('prefers python3 over python', async () => {
        // Both python3 and python exist — python3 should win
        mockExecFileSync.mockImplementation((cmd: string) => {
          const cmdStr = String(cmd);
          if (cmdStr.includes('python3')) {
            return Buffer.from('Python 3.11.5\n');
          }
          if (cmdStr === 'python') {
            return Buffer.from('Python 3.10.0\n');
          }
          throw new Error('not found');
        });

        const result = await discoverPython(projectRoot);

        expect(result.pythonPath).toBe('python3');
      });
    });

    // BETH-64.11.3: falls back to python on PATH
    describe('python fallback (BETH-64.11.3)', () => {
      it('returns python when venv and python3 are both missing', async () => {
        mockExecFileSync.mockImplementation((cmd: string) => {
          const cmdStr = String(cmd);
          // python3 not found
          if (cmdStr.includes('python3')) {
            throw new Error('not found');
          }
          // python found with valid version
          if (cmdStr === 'python') {
            return Buffer.from('Python 3.10.4\n');
          }
          throw new Error('not found');
        });

        const result = await discoverPython(projectRoot);

        expect(result.pythonPath).toBe('python');
        expect(result.source).toBe('path');
      });

      it('python is the last resort before failure', async () => {
        const triedCommands: string[] = [];
        mockExecFileSync.mockImplementation((cmd: string) => {
          const cmdStr = String(cmd);
          triedCommands.push(cmdStr);
          if (cmdStr === 'python') {
            return Buffer.from('Python 3.10.0\n');
          }
          throw new Error('not found');
        });

        await discoverPython(projectRoot);

        // Should have tried python3 before python
        const python3Idx = triedCommands.findIndex((c) => c.includes('python3'));
        const pythonIdx = triedCommands.findIndex(
          (c) => c === 'python'
        );
        expect(python3Idx).toBeLessThan(pythonIdx);
      });
    });

    // BETH-64.11.4: rejects Python < 3.10
    describe('version validation (BETH-64.11.4)', () => {
      it('rejects Python 3.9.x with clear error', async () => {
        mockExecFileSync.mockImplementation((cmd: string) => {
          const cmdStr = String(cmd);
          if (cmdStr.includes('python3')) {
            return Buffer.from('Python 3.9.7\n');
          }
          if (cmdStr === 'python') {
            return Buffer.from('Python 3.9.7\n');
          }
          throw new Error('not found');
        });

        await expect(discoverPython(projectRoot)).rejects.toThrow(/3\.10/);
      });

      it('accepts Python 3.10.0 (boundary)', async () => {
        mockExecFileSync.mockImplementation((cmd: string) => {
          const cmdStr = String(cmd);
          if (cmdStr.includes('python3')) {
            return Buffer.from('Python 3.10.0\n');
          }
          throw new Error('not found');
        });

        const result = await discoverPython(projectRoot);
        expect(result.version).toMatch(/3\.10\.0/);
      });

      it('accepts Python 3.12.x and higher', async () => {
        mockExecFileSync.mockImplementation((cmd: string) => {
          const cmdStr = String(cmd);
          if (cmdStr.includes('python3')) {
            return Buffer.from('Python 3.12.2\n');
          }
          throw new Error('not found');
        });

        const result = await discoverPython(projectRoot);
        expect(result.version).toMatch(/3\.12\.2/);
      });

      it('handles version strings with rc/beta suffixes', async () => {
        mockExecFileSync.mockImplementation((cmd: string) => {
          const cmdStr = String(cmd);
          if (cmdStr.includes('python3')) {
            return Buffer.from('Python 3.12.0rc1\n');
          }
          throw new Error('not found');
        });

        const result = await discoverPython(projectRoot);
        expect(result.version).toMatch(/3\.12\.0/);
      });
    });

    // BETH-64.11.5: error when no Python found
    describe('no Python found (BETH-64.11.5)', () => {
      it('throws when no venv, no python3, no python on PATH', async () => {
        mockExecFileSync.mockImplementation(() => {
          throw new Error('not found');
        });

        await expect(discoverPython(projectRoot)).rejects.toThrow(/Python 3\.10\+ required/);
      });

      it('error message contains install URL', async () => {
        mockExecFileSync.mockImplementation(() => {
          throw new Error('not found');
        });

        await expect(discoverPython(projectRoot)).rejects.toThrow(
          /https:\/\/python\.org/
        );
      });

      it('error is a proper Error object (not a stack trace dump)', async () => {
        mockExecFileSync.mockImplementation(() => {
          throw new Error('not found');
        });

        try {
          await discoverPython(projectRoot);
          expect.fail('should have thrown');
        } catch (err) {
          expect(err).toBeInstanceOf(Error);
          expect((err as Error).message).toContain('Python 3.10+ required');
        }
      });
    });
  });

  // ─── createVenv ──────────────────────────────────────────────────

  describe('createVenv', () => {
    // BETH-64.11.6: creates new venv and installs deps
    describe('new venv creation (BETH-64.11.6)', () => {
      it('calls python -m venv with correct target path', async () => {
        mockExecFileSync.mockReturnValue(Buffer.from(''));

        const adoSyncSourceDir = join(projectRoot, 'ado-sync-src');
        mkdirSync(adoSyncSourceDir, { recursive: true });
        writeFileSync(join(adoSyncSourceDir, 'requirements.txt'), 'fastapi\n');

        const result = await createVenv(projectRoot, '/usr/bin/python3', adoSyncSourceDir);

        // execFileSync called with [pythonPath, ['-m', 'venv', venvPath]]
        const venvCmd = mockExecFileSync.mock.calls.find(
          (call: unknown[]) => Array.isArray(call[1]) && (call[1] as string[]).includes('venv')
        );
        expect(venvCmd).toBeDefined();
        expect(String(venvCmd![0])).toBe('/usr/bin/python3');
        expect((venvCmd![1] as string[]).join(' ')).toContain('-m venv');
        expect(result.created).toBe(true);
      });

      it('calls pip install -r requirements.txt after venv creation', async () => {
        const callOrder: string[] = [];
        mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
          callOrder.push(`${cmd} ${(args || []).join(' ')}`);
          return Buffer.from('');
        });

        const adoSyncSourceDir = join(projectRoot, 'ado-sync-src');
        mkdirSync(adoSyncSourceDir, { recursive: true });
        writeFileSync(join(adoSyncSourceDir, 'requirements.txt'), 'fastapi\n');

        await createVenv(projectRoot, '/usr/bin/python3', adoSyncSourceDir);

        // pip install should come after venv creation
        const venvIdx = callOrder.findIndex((c) => c.includes('-m venv'));
        const pipIdx = callOrder.findIndex((c) => c.includes('install'));
        expect(venvIdx).toBeGreaterThanOrEqual(0);
        expect(pipIdx).toBeGreaterThan(venvIdx);
      });

      it('uses the venv pip, not system pip', async () => {
        mockExecFileSync.mockReturnValue(Buffer.from(''));

        const adoSyncSourceDir = join(projectRoot, 'ado-sync-src');
        mkdirSync(adoSyncSourceDir, { recursive: true });
        writeFileSync(join(adoSyncSourceDir, 'requirements.txt'), 'fastapi\n');

        await createVenv(projectRoot, '/usr/bin/python3', adoSyncSourceDir);

        const pipCmd = mockExecFileSync.mock.calls.find(
          (call: unknown[]) => Array.isArray(call[1]) && (call[1] as string[]).includes('install')
        );
        expect(pipCmd).toBeDefined();
        // First arg (the executable) should be the venv's pip
        expect(String(pipCmd![0])).toMatch(/\.venv.*pip/);
      });

      it('returns success on clean creation + install', async () => {
        mockExecFileSync.mockReturnValue(Buffer.from(''));

        const adoSyncSourceDir = join(projectRoot, 'ado-sync-src');
        mkdirSync(adoSyncSourceDir, { recursive: true });
        writeFileSync(join(adoSyncSourceDir, 'requirements.txt'), 'fastapi\n');

        const result = await createVenv(projectRoot, '/usr/bin/python3', adoSyncSourceDir);

        expect(result.created).toBe(true);
        expect(result.depsInstalled).toBe(true);
      });
    });

    // BETH-64.11.7: skips when venv already exists
    describe('existing venv (BETH-64.11.7)', () => {
      it('skips venv creation when .venv python already exists', async () => {
        // Arrange: create fake existing venv
        const venvBin = join(projectRoot, '.beth', 'ado-sync', '.venv', BIN_DIR);
        mkdirSync(venvBin, { recursive: true });
        writeFileSync(join(venvBin, PYTHON_EXE), '#!/bin/sh\necho "Python 3.12.0"', { mode: 0o755 });
        writeFileSync(join(venvBin, PIP_EXE), '#!/bin/sh\necho "pip"', { mode: 0o755 });

        mockExecFileSync.mockReturnValue(Buffer.from(''));

        const adoSyncSourceDir = join(projectRoot, 'ado-sync-src');
        mkdirSync(adoSyncSourceDir, { recursive: true });
        writeFileSync(join(adoSyncSourceDir, 'requirements.txt'), 'fastapi\n');

        const result = await createVenv(projectRoot, '/usr/bin/python3', adoSyncSourceDir);

        // Assert — should NOT have called python -m venv
        const venvCmds = mockExecFileSync.mock.calls.filter(
          (call: unknown[]) => Array.isArray(call[1]) && (call[1] as string[]).includes('venv')
        );
        expect(venvCmds).toHaveLength(0);
        expect(result.created).toBe(false);
      });

      it('still installs/updates deps via pip even when venv exists', async () => {
        // Arrange: existing venv
        const venvBin = join(projectRoot, '.beth', 'ado-sync', '.venv', BIN_DIR);
        mkdirSync(venvBin, { recursive: true });
        writeFileSync(join(venvBin, PYTHON_EXE), '#!/bin/sh', { mode: 0o755 });
        writeFileSync(join(venvBin, PIP_EXE), '#!/bin/sh', { mode: 0o755 });

        mockExecFileSync.mockReturnValue(Buffer.from(''));

        const adoSyncSourceDir = join(projectRoot, 'ado-sync-src');
        mkdirSync(adoSyncSourceDir, { recursive: true });
        writeFileSync(join(adoSyncSourceDir, 'requirements.txt'), 'fastapi\n');

        const result = await createVenv(projectRoot, '/usr/bin/python3', adoSyncSourceDir);

        // Assert — pip install SHOULD still happen
        const pipCmds = mockExecFileSync.mock.calls.filter(
          (call: unknown[]) => Array.isArray(call[1]) && (call[1] as string[]).includes('install')
        );
        expect(pipCmds.length).toBeGreaterThan(0);
        expect(result.depsInstalled).toBe(true);
      });
    });

    // BETH-64.11.8: handles failures gracefully
    describe('error handling (BETH-64.11.8)', () => {
      it('throws meaningful error when venv creation fails', async () => {
        mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
          if (Array.isArray(args) && args.includes('venv')) {
            throw new Error('Error: Command returned non-zero exit status 1');
          }
          return Buffer.from('');
        });

        const adoSyncSourceDir = join(projectRoot, 'ado-sync-src');
        mkdirSync(adoSyncSourceDir, { recursive: true });
        writeFileSync(join(adoSyncSourceDir, 'requirements.txt'), 'fastapi\n');

        await expect(
          createVenv(projectRoot, '/usr/bin/python3', adoSyncSourceDir)
        ).rejects.toThrow(/venv.*creat|create.*venv/i);
      });

      it('throws meaningful error when pip install fails', async () => {
        mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
          if (Array.isArray(args) && args.includes('install')) {
            throw new Error('ERROR: Could not install packages');
          }
          return Buffer.from('');
        });

        const adoSyncSourceDir = join(projectRoot, 'ado-sync-src');
        mkdirSync(adoSyncSourceDir, { recursive: true });
        writeFileSync(join(adoSyncSourceDir, 'requirements.txt'), 'fastapi\n');

        await expect(
          createVenv(projectRoot, '/usr/bin/python3', adoSyncSourceDir)
        ).rejects.toThrow(/pip|install|dependenc/i);
      });

      it('error messages are user-friendly (not raw stack traces)', async () => {
        mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
          if (Array.isArray(args) && args.includes('venv')) {
            throw new Error('ENOSPC: no space left on device');
          }
          return Buffer.from('');
        });

        const adoSyncSourceDir = join(projectRoot, 'ado-sync-src');
        mkdirSync(adoSyncSourceDir, { recursive: true });
        writeFileSync(join(adoSyncSourceDir, 'requirements.txt'), 'fastapi\n');

        try {
          await createVenv(projectRoot, '/usr/bin/python3', adoSyncSourceDir);
          expect.fail('should have thrown');
        } catch (err) {
          expect(err).toBeInstanceOf(Error);
          // Should wrap the error with a user-friendly message
          expect((err as Error).message).not.toBe('ENOSPC: no space left on device');
        }
      });
    });
  });
});
