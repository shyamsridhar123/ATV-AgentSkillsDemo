/**
 * Land Command Tests
 *
 * Tests the automated session completion ("landing the plane"):
 * - Argument parsing (--skip-tests, --message, --force, --dry-run)
 * - Branch detection and epic ID extraction
 * - Protected branch blocking
 * - Git state checks (uncommitted, staged, unpushed)
 * - Test execution pass/fail handling
 * - Beads backup
 * - Git operations (add, commit, pull rebase, push)
 * - Full landing sequence orchestration
 * - Dry-run mode
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as child_process from 'child_process';

// Mock child_process before importing the module under test
vi.mock('child_process', () => ({
  execFileSync: vi.fn(),
}));

// Import after mocking
import {
  parseLandArgs,
  getCurrentBranch,
  extractEpicId,
  isProtectedBranch,
  hasUncommittedChanges,
  hasStagedChanges,
  hasUnpushedCommits,
  runTests,
  runBeadsBackup,
  gitAddAll,
  gitCommit,
  gitPullRebase,
  gitPush,
  isUpToDateWithOrigin,
  executeLanding,
} from './land.js';

const mockedExecFileSync = vi.mocked(child_process.execFileSync);

beforeEach(() => {
  vi.clearAllMocks();
  // Suppress console output in tests
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

// ─── parseLandArgs ──────────────────────────────────────────────────────────

describe('parseLandArgs', () => {
  it('returns empty options for no args', () => {
    expect(parseLandArgs([])).toEqual({});
  });

  it('parses --skip-tests', () => {
    const opts = parseLandArgs(['--skip-tests']);
    expect(opts.skipTests).toBe(true);
  });

  it('parses --skip-backup', () => {
    const opts = parseLandArgs(['--skip-backup']);
    expect(opts.skipBackup).toBe(true);
  });

  it('parses --force and -f', () => {
    expect(parseLandArgs(['--force']).force).toBe(true);
    expect(parseLandArgs(['-f']).force).toBe(true);
  });

  it('parses --dry-run', () => {
    expect(parseLandArgs(['--dry-run']).dryRun).toBe(true);
  });

  it('parses --message with separate value', () => {
    const opts = parseLandArgs(['--message', 'my commit msg']);
    expect(opts.message).toBe('my commit msg');
  });

  it('parses -m with separate value', () => {
    const opts = parseLandArgs(['-m', 'short msg']);
    expect(opts.message).toBe('short msg');
  });

  it('parses --message=value', () => {
    const opts = parseLandArgs(['--message=inline msg']);
    expect(opts.message).toBe('inline msg');
  });

  it('combines multiple flags', () => {
    const opts = parseLandArgs(['--skip-tests', '--force', '-m', 'combo']);
    expect(opts.skipTests).toBe(true);
    expect(opts.force).toBe(true);
    expect(opts.message).toBe('combo');
  });
});

// ─── extractEpicId ──────────────────────────────────────────────────────────

describe('extractEpicId', () => {
  it('extracts epic ID from epic branch', () => {
    expect(extractEpicId('epic/beth-z9n')).toBe('beth-z9n');
    expect(extractEpicId('epic/beth-abc123')).toBe('beth-abc123');
    expect(extractEpicId('epic/hq-xyz')).toBe('hq-xyz');
  });

  it('returns null for non-epic branches', () => {
    expect(extractEpicId('main')).toBeNull();
    expect(extractEpicId('master')).toBeNull();
    expect(extractEpicId('feature/something')).toBeNull();
    expect(extractEpicId('release/v1.0.0')).toBeNull();
  });

  it('returns null for malformed epic branches', () => {
    expect(extractEpicId('epic/')).toBeNull();
    expect(extractEpicId('epic/BETH-Z9N')).toBeNull();
    expect(extractEpicId('epic/beth-z9n.1')).toBeNull(); // dotted IDs are children, not epics
  });
});

// ─── isProtectedBranch ──────────────────────────────────────────────────────

describe('isProtectedBranch', () => {
  it('identifies main as protected', () => {
    expect(isProtectedBranch('main')).toBe(true);
  });

  it('identifies master as protected', () => {
    expect(isProtectedBranch('master')).toBe(true);
  });

  it('allows epic branches', () => {
    expect(isProtectedBranch('epic/beth-z9n')).toBe(false);
  });

  it('allows feature branches', () => {
    expect(isProtectedBranch('feature/something')).toBe(false);
  });
});

// ─── getCurrentBranch ───────────────────────────────────────────────────────

describe('getCurrentBranch', () => {
  it('returns branch name from git output', () => {
    mockedExecFileSync.mockReturnValue('epic/beth-z9n\n');
    expect(getCurrentBranch()).toBe('epic/beth-z9n');
  });

  it('returns null for empty output (detached HEAD)', () => {
    mockedExecFileSync.mockReturnValue('\n');
    expect(getCurrentBranch()).toBeNull();
  });

  it('returns null when git fails', () => {
    mockedExecFileSync.mockImplementation(() => {
      throw new Error('not a git repo');
    });
    expect(getCurrentBranch()).toBeNull();
  });
});

// ─── hasUncommittedChanges ──────────────────────────────────────────────────

describe('hasUncommittedChanges', () => {
  it('returns true when there are uncommitted changes', () => {
    mockedExecFileSync.mockReturnValue(' M src/foo.ts\n');
    expect(hasUncommittedChanges()).toBe(true);
  });

  it('returns false when working tree is clean', () => {
    mockedExecFileSync.mockReturnValue('');
    expect(hasUncommittedChanges()).toBe(false);
  });

  it('returns false on git error', () => {
    mockedExecFileSync.mockImplementation(() => {
      throw new Error('fail');
    });
    expect(hasUncommittedChanges()).toBe(false);
  });
});

// ─── hasStagedChanges ───────────────────────────────────────────────────────

describe('hasStagedChanges', () => {
  it('returns false when no staged changes (exit 0)', () => {
    mockedExecFileSync.mockReturnValue('');
    expect(hasStagedChanges()).toBe(false);
  });

  it('returns true when there are staged changes (exit 1)', () => {
    mockedExecFileSync.mockImplementation(() => {
      throw new Error('diff found');
    });
    expect(hasStagedChanges()).toBe(true);
  });
});

// ─── hasUnpushedCommits ─────────────────────────────────────────────────────

describe('hasUnpushedCommits', () => {
  it('returns true when there are unpushed commits', () => {
    // First call: show-ref succeeds (remote exists)
    // Second call: git log returns commits
    mockedExecFileSync
      .mockReturnValueOnce('') // show-ref
      .mockReturnValueOnce('abc1234 some commit\ndef5678 another\n'); // git log
    expect(hasUnpushedCommits('epic/beth-z9n')).toBe(true);
  });

  it('returns false when all commits are pushed', () => {
    mockedExecFileSync
      .mockReturnValueOnce('') // show-ref
      .mockReturnValueOnce(''); // git log (no unpushed)
    expect(hasUnpushedCommits('epic/beth-z9n')).toBe(false);
  });

  it('returns true when remote branch does not exist', () => {
    mockedExecFileSync.mockImplementation(() => {
      throw new Error('not found');
    });
    expect(hasUnpushedCommits('epic/beth-new')).toBe(true);
  });
});

// ─── runTests ───────────────────────────────────────────────────────────────

describe('runTests', () => {
  it('returns passed=true on success', () => {
    mockedExecFileSync.mockReturnValue('Tests: 361 passed, 1 skipped\n');
    const result = runTests();
    expect(result.passed).toBe(true);
    expect(result.output).toContain('361 passed');
  });

  it('returns passed=false on test failure', () => {
    const error = new Error('test failure') as Error & { stdout: string; stderr: string };
    error.stdout = 'FAIL src/foo.test.ts';
    error.stderr = 'AssertionError: expected true to be false';
    mockedExecFileSync.mockImplementation(() => {
      throw error;
    });
    const result = runTests();
    expect(result.passed).toBe(false);
    expect(result.output).toContain('FAIL');
  });

  it('calls npm test with correct args', () => {
    mockedExecFileSync.mockReturnValue('ok');
    runTests();
    expect(mockedExecFileSync).toHaveBeenCalledWith(
      'npm',
      ['test'],
      expect.objectContaining({ encoding: 'utf-8' }),
    );
  });
});

// ─── runBeadsBackup ─────────────────────────────────────────────────────────

describe('runBeadsBackup', () => {
  it('returns success=true when bd backup works', () => {
    mockedExecFileSync.mockReturnValue('Backup complete\n');
    const result = runBeadsBackup();
    expect(result.success).toBe(true);
  });

  it('returns success=false when bd is not available', () => {
    mockedExecFileSync.mockImplementation(() => {
      throw new Error('command not found');
    });
    const result = runBeadsBackup();
    expect(result.success).toBe(false);
  });
});

// ─── gitAddAll ──────────────────────────────────────────────────────────────

describe('gitAddAll', () => {
  it('returns true on success', () => {
    mockedExecFileSync.mockReturnValue('');
    expect(gitAddAll()).toBe(true);
  });

  it('returns false on failure', () => {
    mockedExecFileSync.mockImplementation(() => {
      throw new Error('fail');
    });
    expect(gitAddAll()).toBe(false);
  });
});

// ─── gitCommit ──────────────────────────────────────────────────────────────

describe('gitCommit', () => {
  it('returns true on success', () => {
    mockedExecFileSync.mockReturnValue('');
    expect(gitCommit('test msg')).toBe(true);
    expect(mockedExecFileSync).toHaveBeenCalledWith(
      'git',
      ['commit', '-m', 'test msg'],
      expect.any(Object),
    );
  });

  it('returns false on failure', () => {
    mockedExecFileSync.mockImplementation(() => {
      throw new Error('nothing to commit');
    });
    expect(gitCommit('test msg')).toBe(false);
  });
});

// ─── gitPullRebase ──────────────────────────────────────────────────────────

describe('gitPullRebase', () => {
  it('returns success=true when rebase works', () => {
    mockedExecFileSync.mockReturnValue('Already up to date.\n');
    const result = gitPullRebase('epic/beth-z9n');
    expect(result.success).toBe(true);
    expect(mockedExecFileSync).toHaveBeenCalledWith(
      'git',
      ['pull', 'origin', 'epic/beth-z9n', '--rebase'],
      expect.any(Object),
    );
  });

  it('returns success=false on conflict', () => {
    const error = new Error('conflict') as Error & { stderr: string };
    error.stderr = 'CONFLICT (content): Merge conflict in foo.ts';
    mockedExecFileSync.mockImplementation(() => {
      throw error;
    });
    const result = gitPullRebase('epic/beth-z9n');
    expect(result.success).toBe(false);
  });
});

// ─── gitPush ────────────────────────────────────────────────────────────────

describe('gitPush', () => {
  it('returns success=true on push success', () => {
    mockedExecFileSync.mockReturnValue('');
    const result = gitPush('epic/beth-z9n');
    expect(result.success).toBe(true);
    expect(mockedExecFileSync).toHaveBeenCalledWith(
      'git',
      ['push', 'origin', 'epic/beth-z9n'],
      expect.any(Object),
    );
  });

  it('returns success=false on push failure', () => {
    const error = new Error('rejected') as Error & { stderr: string };
    error.stderr = 'rejected (non-fast-forward)';
    mockedExecFileSync.mockImplementation(() => {
      throw error;
    });
    const result = gitPush('epic/beth-z9n');
    expect(result.success).toBe(false);
  });
});

// ─── isUpToDateWithOrigin ───────────────────────────────────────────────────

describe('isUpToDateWithOrigin', () => {
  it('returns true when branch is in sync', () => {
    mockedExecFileSync
      .mockReturnValueOnce('') // fetch
      .mockReturnValueOnce('## epic/beth-z9n...origin/epic/beth-z9n\n'); // status
    expect(isUpToDateWithOrigin('epic/beth-z9n')).toBe(true);
  });

  it('returns false when branch is ahead', () => {
    mockedExecFileSync
      .mockReturnValueOnce('') // fetch
      .mockReturnValueOnce('## epic/beth-z9n...origin/epic/beth-z9n [ahead 2]\n');
    expect(isUpToDateWithOrigin('epic/beth-z9n')).toBe(false);
  });

  it('returns false when branch is behind', () => {
    mockedExecFileSync
      .mockReturnValueOnce('') // fetch
      .mockReturnValueOnce('## epic/beth-z9n...origin/epic/beth-z9n [behind 1]\n');
    expect(isUpToDateWithOrigin('epic/beth-z9n')).toBe(false);
  });

  it('returns false on fetch error', () => {
    mockedExecFileSync.mockImplementation(() => {
      throw new Error('network error');
    });
    expect(isUpToDateWithOrigin('epic/beth-z9n')).toBe(false);
  });
});

// ─── executeLanding ─────────────────────────────────────────────────────────

describe('executeLanding', () => {
  it('fails when not in git repo', () => {
    // getCurrentBranch returns null
    mockedExecFileSync.mockImplementation(() => {
      throw new Error('not a git repo');
    });
    const result = executeLanding();
    expect(result.success).toBe(false);
    expect(result.steps[0].status).toBe('fail');
    expect(result.steps[0].message).toContain('Not in a git repository');
  });

  it('fails on protected branch (main)', () => {
    mockedExecFileSync.mockReturnValueOnce('main\n');
    const result = executeLanding();
    expect(result.success).toBe(false);
    expect(result.steps[0].status).toBe('fail');
    expect(result.steps[0].message).toContain('protected branch');
  });

  it('fails on protected branch (master)', () => {
    mockedExecFileSync.mockReturnValueOnce('master\n');
    const result = executeLanding();
    expect(result.success).toBe(false);
    expect(result.steps[0].status).toBe('fail');
    expect(result.steps[0].message).toContain('protected branch');
  });

  it('warns on non-epic branch but continues', () => {
    // Setup: on feature branch, no changes, no unpushed
    mockedExecFileSync
      .mockReturnValueOnce('feature/something\n') // getCurrentBranch
      .mockReturnValueOnce('Tests passed\n') // npm test
      .mockReturnValueOnce('Backup ok\n') // bd backup
      .mockReturnValueOnce('') // hasUncommittedChanges (git status --porcelain)
      .mockImplementation(() => { throw new Error('no remote'); }); // hasUnpushedCommits
    const result = executeLanding();
    expect(result.steps[0].status).toBe('warn');
    expect(result.steps[0].message).toContain("doesn't follow epic");
  });

  it('extracts epic ID from branch', () => {
    // Setup: on epic branch, no changes, no unpushed
    mockedExecFileSync
      .mockReturnValueOnce('epic/beth-z9n\n') // getCurrentBranch
      .mockReturnValueOnce('Tests: 361 passed\n') // npm test
      .mockReturnValueOnce('Backup ok\n') // bd backup
      .mockReturnValueOnce('') // hasUncommittedChanges
      .mockImplementation(() => {
        throw new Error('no remote');
      });
    const result = executeLanding();
    expect(result.epicId).toBe('beth-z9n');
    expect(result.branch).toBe('epic/beth-z9n');
  });

  it('stops on test failure without --force', () => {
    const testError = new Error('test fail') as Error & { stdout: string; stderr: string };
    testError.stdout = 'FAIL src/foo.test.ts';
    testError.stderr = '';
    mockedExecFileSync
      .mockReturnValueOnce('epic/beth-z9n\n') // getCurrentBranch
      .mockImplementationOnce(() => { throw testError; }); // npm test fails
    const result = executeLanding();
    expect(result.success).toBe(false);
    const testStep = result.steps.find((s) => s.step === 'Tests');
    expect(testStep?.status).toBe('fail');
  });

  it('continues on test failure with --force', () => {
    const testError = new Error('test fail') as Error & { stdout: string; stderr: string };
    testError.stdout = 'FAIL src/foo.test.ts';
    testError.stderr = '';
    mockedExecFileSync
      .mockReturnValueOnce('epic/beth-z9n\n') // getCurrentBranch
      .mockImplementationOnce(() => { throw testError; }) // npm test fails
      .mockReturnValueOnce('Backup ok\n') // bd backup
      .mockReturnValueOnce('') // hasUncommittedChanges (clean)
      .mockImplementation(() => { throw new Error('no remote'); }); // hasUnpushedCommits
    const landResult = executeLanding({ force: true });
    // Should continue past test failure
    const testStep = landResult.steps.find((s) => s.step === 'Tests');
    expect(testStep?.status).toBe('fail');
    // But should still have executed further steps
    expect(landResult.steps.length).toBeGreaterThan(2);
  });

  it('skips tests with --skip-tests', () => {
    mockedExecFileSync
      .mockReturnValueOnce('epic/beth-z9n\n') // getCurrentBranch
      .mockReturnValueOnce('Backup ok\n') // bd backup
      .mockReturnValueOnce('') // hasUncommittedChanges
      .mockImplementation(() => { throw new Error('no remote'); }); // hasUnpushedCommits
    const result = executeLanding({ skipTests: true });
    const testStep = result.steps.find((s) => s.step === 'Tests');
    expect(testStep?.status).toBe('skip');
  });

  it('skips backup with --skip-backup', () => {
    mockedExecFileSync
      .mockReturnValueOnce('epic/beth-z9n\n') // getCurrentBranch
      .mockReturnValueOnce('Tests passed\n') // npm test
      .mockReturnValueOnce('') // hasUncommittedChanges
      .mockImplementation(() => { throw new Error('no remote'); }); // hasUnpushedCommits
    const result = executeLanding({ skipBackup: true });
    const backupStep = result.steps.find((s) => s.step === 'Beads backup');
    expect(backupStep?.status).toBe('skip');
  });

  it('reports clean tree as success', () => {
    mockedExecFileSync
      .mockReturnValueOnce('epic/beth-z9n\n') // getCurrentBranch
      .mockReturnValueOnce('Tests passed\n') // npm test
      .mockReturnValueOnce('Backup ok\n') // bd backup
      .mockReturnValueOnce('') // hasUncommittedChanges (clean)
      .mockReturnValueOnce('') // hasUnpushedCommits: show-ref
      .mockReturnValueOnce(''); // hasUnpushedCommits: git log (nothing)
    const result = executeLanding();
    expect(result.success).toBe(true);
    const gitStatus = result.steps.find((s) => s.step === 'Git status');
    expect(gitStatus?.status).toBe('pass');
  });

  it('dry run does not execute git operations', () => {
    mockedExecFileSync
      .mockReturnValueOnce('epic/beth-z9n\n') // getCurrentBranch (always runs)
      .mockReturnValueOnce(' M foo.ts\n') // hasUncommittedChanges
      .mockImplementation(() => { throw new Error('no remote'); }); // hasUnpushedCommits
    executeLanding({ dryRun: true, skipTests: true, skipBackup: true });
    // Should not have called git add, commit, push
    const addCall = mockedExecFileSync.mock.calls.find(
      (c) => c[0] === 'git' && (c[1] as string[])[0] === 'add',
    );
    expect(addCall).toBeUndefined();
    const pushCall = mockedExecFileSync.mock.calls.find(
      (c) => c[0] === 'git' && (c[1] as string[])[0] === 'push',
    );
    expect(pushCall).toBeUndefined();
  });

  it('uses custom commit message', () => {
    mockedExecFileSync
      .mockReturnValueOnce('epic/beth-z9n\n') // getCurrentBranch
      .mockReturnValueOnce('Tests passed\n') // npm test
      .mockReturnValueOnce('Backup ok\n') // bd backup
      .mockReturnValueOnce(' M foo.ts\n') // hasUncommittedChanges
      .mockImplementationOnce(() => { throw new Error('no remote'); }) // hasUnpushedCommits: show-ref fails
      .mockReturnValueOnce('') // git add -A
      .mockReturnValueOnce('') // git commit
      .mockReturnValueOnce('') // git pull rebase (may fail for new branch)
      .mockReturnValueOnce('') // git push
      .mockReturnValueOnce('') // isUpToDateWithOrigin: fetch
      .mockReturnValueOnce('## epic/beth-z9n...origin/epic/beth-z9n\n'); // isUpToDateWithOrigin: status
    executeLanding({ message: 'custom: my changes' });
    const commitCall = mockedExecFileSync.mock.calls.find(
      (c) => c[0] === 'git' && (c[1] as string[])[0] === 'commit',
    );
    expect(commitCall).toBeDefined();
    expect((commitCall![1] as string[])[2]).toBe('custom: my changes');
  });

  it('defaults commit message to epic ID prefix', () => {
    mockedExecFileSync
      .mockReturnValueOnce('epic/beth-z9n\n') // getCurrentBranch
      .mockReturnValueOnce('Tests passed\n') // npm test
      .mockReturnValueOnce('Backup ok\n') // bd backup
      .mockReturnValueOnce(' M foo.ts\n') // hasUncommittedChanges
      .mockImplementationOnce(() => { throw new Error('no remote'); }) // hasUnpushedCommits
      .mockReturnValueOnce('') // git add -A
      .mockReturnValueOnce('') // git commit
      .mockReturnValueOnce('') // git pull rebase
      .mockReturnValueOnce('') // git push
      .mockReturnValueOnce('') // fetch
      .mockReturnValueOnce('## epic/beth-z9n...origin/epic/beth-z9n\n'); // status
    executeLanding();
    const commitCall = mockedExecFileSync.mock.calls.find(
      (c) => c[0] === 'git' && (c[1] as string[])[0] === 'commit',
    );
    expect(commitCall).toBeDefined();
    expect((commitCall![1] as string[])[2]).toBe('beth-z9n: session work');
  });

  it('full successful landing sequence', () => {
    mockedExecFileSync
      .mockReturnValueOnce('epic/beth-z9n\n') // getCurrentBranch
      .mockReturnValueOnce('Tests: 361 passed, 1 skipped\n') // npm test
      .mockReturnValueOnce('Backup complete\n') // bd backup
      .mockReturnValueOnce(' M src/land.ts\n') // hasUncommittedChanges
      .mockImplementationOnce(() => { throw new Error('no remote'); }) // hasUnpushedCommits
      .mockReturnValueOnce('') // git add -A
      .mockReturnValueOnce('') // git commit
      .mockReturnValueOnce('Already up to date.\n') // git pull rebase
      .mockReturnValueOnce('') // git push
      .mockReturnValueOnce('') // fetch
      .mockReturnValueOnce('## epic/beth-z9n...origin/epic/beth-z9n\n'); // status
    const result = executeLanding({ message: 'beth-z9n: land command' });
    expect(result.success).toBe(true);
    expect(result.branch).toBe('epic/beth-z9n');
    expect(result.epicId).toBe('beth-z9n');

    // Verify step sequence
    const stepNames = result.steps.map((s) => s.step);
    expect(stepNames).toContain('Branch check');
    expect(stepNames).toContain('Tests');
    expect(stepNames).toContain('Beads backup');
    expect(stepNames).toContain('Stage changes');
    expect(stepNames).toContain('Commit');
    expect(stepNames).toContain('Pull rebase');
    expect(stepNames).toContain('Push');
    expect(stepNames).toContain('Verify');

    // All steps should pass (or warn for non-critical)
    const failures = result.steps.filter((s) => s.status === 'fail');
    expect(failures).toHaveLength(0);
  });

  it('beads backup failure is non-blocking', () => {
    mockedExecFileSync
      .mockReturnValueOnce('epic/beth-z9n\n') // getCurrentBranch
      .mockReturnValueOnce('Tests passed\n') // npm test
      .mockImplementationOnce(() => { throw new Error('bd not found'); }) // bd backup fails
      .mockReturnValueOnce('') // hasUncommittedChanges (clean)
      .mockReturnValueOnce('') // show-ref
      .mockReturnValueOnce(''); // git log (no unpushed)
    const result = executeLanding();
    expect(result.success).toBe(true);
    const backupStep = result.steps.find((s) => s.step === 'Beads backup');
    expect(backupStep?.status).toBe('warn');
  });

  it('push failure marks landing as failed', () => {
    const pushError = new Error('rejected') as Error & { stderr: string };
    pushError.stderr = 'rejected (non-fast-forward)';
    mockedExecFileSync
      .mockReturnValueOnce('epic/beth-z9n\n') // getCurrentBranch
      .mockReturnValueOnce('Tests passed\n') // npm test
      .mockReturnValueOnce('Backup ok\n') // bd backup
      .mockReturnValueOnce(' M foo.ts\n') // hasUncommittedChanges
      .mockImplementationOnce(() => { throw new Error('no remote'); }) // hasUnpushedCommits
      .mockReturnValueOnce('') // git add
      .mockReturnValueOnce('') // git commit
      .mockReturnValueOnce('') // git pull rebase
      .mockImplementationOnce(() => { throw pushError; }); // git push fails
    const result = executeLanding({ message: 'test' });
    expect(result.success).toBe(false);
    const pushStep = result.steps.find((s) => s.step === 'Push');
    expect(pushStep?.status).toBe('fail');
  });
});
