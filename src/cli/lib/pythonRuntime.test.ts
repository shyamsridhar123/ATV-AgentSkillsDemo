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
const mockExecSync = vi.fn();
vi.mock('child_process', () => ({
  execSync: (...args: unknown[]) => mockExecSync(...args),
}));

// Import after mock declaration (vitest hoists vi.mock)
import {
  discoverPython,
  createVenv,
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

  beforeEach(() => {
    projectRoot = makeTmpDir();
    mockExecSync.mockReset();
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
        const venvBin = join(projectRoot, '.beth', 'ado-sync', '.venv', 'bin');
        mkdirSync(venvBin, { recursive: true });
        writeFileSync(join(venvBin, 'python'), '#!/bin/sh\necho "Python 3.12.0"', { mode: 0o755 });

        // Mock version check for the venv python
        mockExecSync.mockReturnValue(Buffer.from('Python 3.12.0\n'));

        // Act
        const result = await discoverPython(projectRoot);

        // Assert
        expect(result.pythonPath).toBe(join(venvBin, 'python'));
        expect(result.source).toBe('venv');
      });

      it('does NOT search PATH when venv python found', async () => {
        // Arrange: venv exists
        const venvBin = join(projectRoot, '.beth', 'ado-sync', '.venv', 'bin');
        mkdirSync(venvBin, { recursive: true });
        writeFileSync(join(venvBin, 'python'), '#!/bin/sh\necho "Python 3.12.0"', { mode: 0o755 });

        mockExecSync.mockReturnValue(Buffer.from('Python 3.12.0\n'));

        // Act
        await discoverPython(projectRoot);

        // Assert — execSync should only be called for version check, not for which/where
        const whichCalls = mockExecSync.mock.calls.filter(
          (call: unknown[]) => String(call[0]).includes('which') || String(call[0]).includes('where')
        );
        expect(whichCalls).toHaveLength(0);
      });
    });

    // BETH-64.11.2: falls back to python3 on PATH
    describe('python3 fallback (BETH-64.11.2)', () => {
      it('returns python3 when venv missing but python3 is on PATH', async () => {
        // Arrange: no venv, python3 available
        mockExecSync.mockImplementation((cmd: string) => {
          const cmdStr = String(cmd);
          if (cmdStr.includes('python3') && cmdStr.includes('--version')) {
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
        mockExecSync.mockImplementation((cmd: string) => {
          const cmdStr = String(cmd);
          if (cmdStr.includes('python3') && cmdStr.includes('--version')) {
            return Buffer.from('Python 3.11.5\n');
          }
          if (cmdStr.includes('python') && !cmdStr.includes('python3') && cmdStr.includes('--version')) {
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
        mockExecSync.mockImplementation((cmd: string) => {
          const cmdStr = String(cmd);
          // python3 not found
          if (cmdStr.includes('python3')) {
            throw new Error('not found');
          }
          // python found with valid version
          if (cmdStr.includes('python') && cmdStr.includes('--version')) {
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
        mockExecSync.mockImplementation((cmd: string) => {
          const cmdStr = String(cmd);
          triedCommands.push(cmdStr);
          if (cmdStr.includes('python') && !cmdStr.includes('python3') && cmdStr.includes('--version')) {
            return Buffer.from('Python 3.10.0\n');
          }
          throw new Error('not found');
        });

        await discoverPython(projectRoot);

        // Should have tried python3 before python
        const python3Idx = triedCommands.findIndex((c) => c.includes('python3'));
        const pythonIdx = triedCommands.findIndex(
          (c) => c.includes('python') && !c.includes('python3')
        );
        expect(python3Idx).toBeLessThan(pythonIdx);
      });
    });

    // BETH-64.11.4: rejects Python < 3.10
    describe('version validation (BETH-64.11.4)', () => {
      it('rejects Python 3.9.x with clear error', async () => {
        mockExecSync.mockImplementation((cmd: string) => {
          const cmdStr = String(cmd);
          if (cmdStr.includes('python3') && cmdStr.includes('--version')) {
            return Buffer.from('Python 3.9.7\n');
          }
          if (cmdStr.includes('python') && !cmdStr.includes('python3') && cmdStr.includes('--version')) {
            return Buffer.from('Python 3.9.7\n');
          }
          throw new Error('not found');
        });

        await expect(discoverPython(projectRoot)).rejects.toThrow(/3\.10/);
      });

      it('accepts Python 3.10.0 (boundary)', async () => {
        mockExecSync.mockImplementation((cmd: string) => {
          const cmdStr = String(cmd);
          if (cmdStr.includes('python3') && cmdStr.includes('--version')) {
            return Buffer.from('Python 3.10.0\n');
          }
          throw new Error('not found');
        });

        const result = await discoverPython(projectRoot);
        expect(result.version).toMatch(/3\.10\.0/);
      });

      it('accepts Python 3.12.x and higher', async () => {
        mockExecSync.mockImplementation((cmd: string) => {
          const cmdStr = String(cmd);
          if (cmdStr.includes('python3') && cmdStr.includes('--version')) {
            return Buffer.from('Python 3.12.2\n');
          }
          throw new Error('not found');
        });

        const result = await discoverPython(projectRoot);
        expect(result.version).toMatch(/3\.12\.2/);
      });

      it('handles version strings with rc/beta suffixes', async () => {
        mockExecSync.mockImplementation((cmd: string) => {
          const cmdStr = String(cmd);
          if (cmdStr.includes('python3') && cmdStr.includes('--version')) {
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
        mockExecSync.mockImplementation(() => {
          throw new Error('not found');
        });

        await expect(discoverPython(projectRoot)).rejects.toThrow(/Python 3\.10\+ required/);
      });

      it('error message contains install URL', async () => {
        mockExecSync.mockImplementation(() => {
          throw new Error('not found');
        });

        await expect(discoverPython(projectRoot)).rejects.toThrow(
          /https:\/\/python\.org/
        );
      });

      it('error is a proper Error object (not a stack trace dump)', async () => {
        mockExecSync.mockImplementation(() => {
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
        mockExecSync.mockReturnValue(Buffer.from(''));

        const adoSyncSourceDir = join(projectRoot, 'ado-sync-src');
        mkdirSync(adoSyncSourceDir, { recursive: true });
        writeFileSync(join(adoSyncSourceDir, 'requirements.txt'), 'fastapi\n');

        const result = await createVenv(projectRoot, '/usr/bin/python3', adoSyncSourceDir);

        const venvCmd = mockExecSync.mock.calls.find(
          (call: unknown[]) => String(call[0]).includes('-m venv')
        );
        expect(venvCmd).toBeDefined();
        expect(String(venvCmd![0])).toContain(join('.beth', 'ado-sync', '.venv'));
        expect(result.created).toBe(true);
      });

      it('calls pip install -r requirements.txt after venv creation', async () => {
        const callOrder: string[] = [];
        mockExecSync.mockImplementation((cmd: string) => {
          callOrder.push(String(cmd));
          return Buffer.from('');
        });

        const adoSyncSourceDir = join(projectRoot, 'ado-sync-src');
        mkdirSync(adoSyncSourceDir, { recursive: true });
        writeFileSync(join(adoSyncSourceDir, 'requirements.txt'), 'fastapi\n');

        await createVenv(projectRoot, '/usr/bin/python3', adoSyncSourceDir);

        // pip install should come after venv creation
        const venvIdx = callOrder.findIndex((c) => c.includes('-m venv'));
        const pipIdx = callOrder.findIndex((c) => c.includes('pip install'));
        expect(venvIdx).toBeGreaterThanOrEqual(0);
        expect(pipIdx).toBeGreaterThan(venvIdx);
      });

      it('uses the venv pip, not system pip', async () => {
        mockExecSync.mockReturnValue(Buffer.from(''));

        const adoSyncSourceDir = join(projectRoot, 'ado-sync-src');
        mkdirSync(adoSyncSourceDir, { recursive: true });
        writeFileSync(join(adoSyncSourceDir, 'requirements.txt'), 'fastapi\n');

        await createVenv(projectRoot, '/usr/bin/python3', adoSyncSourceDir);

        const pipCmd = mockExecSync.mock.calls.find(
          (call: unknown[]) => String(call[0]).includes('pip install')
        );
        expect(pipCmd).toBeDefined();
        // Should use the venv's pip (path includes .venv)
        expect(String(pipCmd![0])).toMatch(/\.venv.*pip/);
      });

      it('returns success on clean creation + install', async () => {
        mockExecSync.mockReturnValue(Buffer.from(''));

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
      it('skips venv creation when .venv/bin/python already exists', async () => {
        // Arrange: create fake existing venv
        const venvBin = join(projectRoot, '.beth', 'ado-sync', '.venv', 'bin');
        mkdirSync(venvBin, { recursive: true });
        writeFileSync(join(venvBin, 'python'), '#!/bin/sh\necho "Python 3.12.0"', { mode: 0o755 });
        writeFileSync(join(venvBin, 'pip'), '#!/bin/sh\necho "pip"', { mode: 0o755 });

        mockExecSync.mockReturnValue(Buffer.from(''));

        const adoSyncSourceDir = join(projectRoot, 'ado-sync-src');
        mkdirSync(adoSyncSourceDir, { recursive: true });
        writeFileSync(join(adoSyncSourceDir, 'requirements.txt'), 'fastapi\n');

        const result = await createVenv(projectRoot, '/usr/bin/python3', adoSyncSourceDir);

        // Assert — should NOT have called python -m venv
        const venvCmds = mockExecSync.mock.calls.filter(
          (call: unknown[]) => String(call[0]).includes('-m venv')
        );
        expect(venvCmds).toHaveLength(0);
        expect(result.created).toBe(false);
      });

      it('still installs/updates deps via pip even when venv exists', async () => {
        // Arrange: existing venv
        const venvBin = join(projectRoot, '.beth', 'ado-sync', '.venv', 'bin');
        mkdirSync(venvBin, { recursive: true });
        writeFileSync(join(venvBin, 'python'), '#!/bin/sh', { mode: 0o755 });
        writeFileSync(join(venvBin, 'pip'), '#!/bin/sh', { mode: 0o755 });

        mockExecSync.mockReturnValue(Buffer.from(''));

        const adoSyncSourceDir = join(projectRoot, 'ado-sync-src');
        mkdirSync(adoSyncSourceDir, { recursive: true });
        writeFileSync(join(adoSyncSourceDir, 'requirements.txt'), 'fastapi\n');

        const result = await createVenv(projectRoot, '/usr/bin/python3', adoSyncSourceDir);

        // Assert — pip install SHOULD still happen
        const pipCmds = mockExecSync.mock.calls.filter(
          (call: unknown[]) => String(call[0]).includes('pip install')
        );
        expect(pipCmds.length).toBeGreaterThan(0);
        expect(result.depsInstalled).toBe(true);
      });
    });

    // BETH-64.11.8: handles failures gracefully
    describe('error handling (BETH-64.11.8)', () => {
      it('throws meaningful error when venv creation fails', async () => {
        mockExecSync.mockImplementation((cmd: string) => {
          const cmdStr = String(cmd);
          if (cmdStr.includes('-m venv')) {
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
        mockExecSync.mockImplementation((cmd: string) => {
          const cmdStr = String(cmd);
          if (cmdStr.includes('pip install')) {
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
        mockExecSync.mockImplementation((cmd: string) => {
          const cmdStr = String(cmd);
          if (cmdStr.includes('-m venv')) {
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
