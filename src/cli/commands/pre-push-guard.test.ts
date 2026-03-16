/**
 * Pre-Push Guard Tests
 *
 * Tests branch discipline enforcement:
 * - Push ref parsing from Git stdin
 * - Branch name extraction from refs
 * - Protected branch detection
 * - Epic branch convention validation
 * - Release branch recognition
 * - Guard logic: errors vs warnings
 * - Hook script generation
 */

import { describe, it, expect, beforeEach } from 'vitest';

import {
  parsePushRefs,
  extractBranchName,
  isProtectedBranch,
  isEpicBranch,
  isReleaseBranch,
  isRecognizedBranch,
  runGuard,
  generateHookScript,
  BETH_GUARD_BEGIN,
  BETH_GUARD_END,
} from './pre-push-guard.js';

beforeEach(() => {
});

// ─── parsePushRefs ─────────────────────────────────────────────────────────────

describe('parsePushRefs', () => {
  it('parses a single push ref line', () => {
    const stdin =
      'refs/heads/epic/beth-abc 1234567 refs/heads/epic/beth-abc 0000000';
    const refs = parsePushRefs(stdin);
    expect(refs).toHaveLength(1);
    expect(refs[0]).toEqual({
      localRef: 'refs/heads/epic/beth-abc',
      localSha: '1234567',
      remoteRef: 'refs/heads/epic/beth-abc',
      remoteSha: '0000000',
    });
  });

  it('parses multiple push ref lines', () => {
    const stdin = [
      'refs/heads/epic/beth-abc 1111111 refs/heads/epic/beth-abc 0000000',
      'refs/heads/epic/beth-def 2222222 refs/heads/epic/beth-def 0000000',
    ].join('\n');
    const refs = parsePushRefs(stdin);
    expect(refs).toHaveLength(2);
    expect(refs[0].localRef).toBe('refs/heads/epic/beth-abc');
    expect(refs[1].localRef).toBe('refs/heads/epic/beth-def');
  });

  it('handles empty stdin', () => {
    expect(parsePushRefs('')).toHaveLength(0);
    expect(parsePushRefs('  ')).toHaveLength(0);
    expect(parsePushRefs('\n')).toHaveLength(0);
  });

  it('handles trailing newlines', () => {
    const stdin =
      'refs/heads/epic/beth-abc 1234567 refs/heads/epic/beth-abc 0000000\n\n';
    const refs = parsePushRefs(stdin);
    expect(refs).toHaveLength(1);
  });

  it('handles partial lines gracefully', () => {
    const stdin = 'refs/heads/main';
    const refs = parsePushRefs(stdin);
    expect(refs).toHaveLength(1);
    expect(refs[0].localRef).toBe('refs/heads/main');
    expect(refs[0].localSha).toBe('');
  });
});

// ─── extractBranchName ─────────────────────────────────────────────────────────

describe('extractBranchName', () => {
  it('strips refs/heads/ prefix', () => {
    expect(extractBranchName('refs/heads/main')).toBe('main');
    expect(extractBranchName('refs/heads/epic/beth-abc')).toBe(
      'epic/beth-abc',
    );
  });

  it('returns ref as-is when no prefix', () => {
    expect(extractBranchName('main')).toBe('main');
    expect(extractBranchName('epic/beth-abc')).toBe('epic/beth-abc');
  });

  it('handles refs/tags (not stripped)', () => {
    expect(extractBranchName('refs/tags/v1.0.0')).toBe('refs/tags/v1.0.0');
  });

  it('handles empty string', () => {
    expect(extractBranchName('')).toBe('');
  });
});

// ─── isProtectedBranch ─────────────────────────────────────────────────────────

describe('isProtectedBranch', () => {
  it('identifies main as protected', () => {
    expect(isProtectedBranch('main')).toBe(true);
  });

  it('identifies master as protected', () => {
    expect(isProtectedBranch('master')).toBe(true);
  });

  it('rejects epic branches', () => {
    expect(isProtectedBranch('epic/beth-abc')).toBe(false);
  });

  it('rejects release branches', () => {
    expect(isProtectedBranch('release/v1.0.0')).toBe(false);
  });

  it('rejects random branches', () => {
    expect(isProtectedBranch('feature/foo')).toBe(false);
    expect(isProtectedBranch('')).toBe(false);
  });
});

// ─── isEpicBranch ──────────────────────────────────────────────────────────────

describe('isEpicBranch', () => {
  it('accepts valid epic branches', () => {
    expect(isEpicBranch('epic/beth-abc')).toBe(true);
    expect(isEpicBranch('epic/beth-abc123')).toBe(true);
    expect(isEpicBranch('epic/hq-xyz')).toBe(true);
    expect(isEpicBranch('epic/beth-bdh')).toBe(true);
  });

  it('rejects branches without epic/ prefix', () => {
    expect(isEpicBranch('beth-abc')).toBe(false);
    expect(isEpicBranch('feature/beth-abc')).toBe(false);
  });

  it('rejects branches with uppercase', () => {
    expect(isEpicBranch('epic/BETH-abc')).toBe(false);
    expect(isEpicBranch('epic/Beth-Abc')).toBe(false);
  });

  it('rejects branches without rig-hash format', () => {
    expect(isEpicBranch('epic/justwords')).toBe(false);
    expect(isEpicBranch('epic/')).toBe(false);
    expect(isEpicBranch('epic/a-')).toBe(false);
  });

  it('rejects branches with special characters', () => {
    expect(isEpicBranch('epic/beth-abc; rm -rf /')).toBe(false);
    expect(isEpicBranch('epic/beth-abc$(whoami)')).toBe(false);
  });
});

// ─── isReleaseBranch ───────────────────────────────────────────────────────────

describe('isReleaseBranch', () => {
  it('accepts release branches with v prefix', () => {
    expect(isReleaseBranch('release/v1.0.0')).toBe(true);
    expect(isReleaseBranch('release/v2')).toBe(true);
    expect(isReleaseBranch('release/v1.0.15')).toBe(true);
  });

  it('accepts release branches without v prefix', () => {
    expect(isReleaseBranch('release/1.0.0')).toBe(true);
    expect(isReleaseBranch('release/2')).toBe(true);
  });

  it('rejects non-release branches', () => {
    expect(isReleaseBranch('main')).toBe(false);
    expect(isReleaseBranch('epic/beth-abc')).toBe(false);
    expect(isReleaseBranch('release/')).toBe(false);
    expect(isReleaseBranch('release/abc')).toBe(false);
  });
});

// ─── isRecognizedBranch ────────────────────────────────────────────────────────

describe('isRecognizedBranch', () => {
  it('recognizes epic branches', () => {
    expect(isRecognizedBranch('epic/beth-abc')).toBe(true);
  });

  it('recognizes release branches', () => {
    expect(isRecognizedBranch('release/v1.0.0')).toBe(true);
  });

  it('recognizes protected branches', () => {
    expect(isRecognizedBranch('main')).toBe(true);
    expect(isRecognizedBranch('master')).toBe(true);
  });

  it('rejects unrecognized branches', () => {
    expect(isRecognizedBranch('feature/foo')).toBe(false);
    expect(isRecognizedBranch('bugfix/bar')).toBe(false);
    expect(isRecognizedBranch('dev')).toBe(false);
    expect(isRecognizedBranch('')).toBe(false);
  });
});

// ─── runGuard ──────────────────────────────────────────────────────────────────

describe('runGuard', () => {
  describe('protected branch blocking', () => {
    it('blocks push when current branch is main', () => {
      const result = runGuard('main');
      expect(result.allowed).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('main');
      expect(result.errors[0]).toContain('blocked');
    });

    it('blocks push when current branch is master', () => {
      const result = runGuard('master');
      expect(result.allowed).toBe(false);
      expect(result.errors[0]).toContain('master');
    });

    it('blocks push when remote ref targets main', () => {
      const refs = [
        {
          localRef: 'refs/heads/feature/x',
          localSha: '111',
          remoteRef: 'refs/heads/main',
          remoteSha: '000',
        },
      ];
      const result = runGuard('feature/x', refs);
      expect(result.allowed).toBe(false);
      expect(result.errors[0]).toContain("'main'");
    });

    it('blocks push when remote ref targets master', () => {
      const refs = [
        {
          localRef: 'refs/heads/feature/x',
          localSha: '111',
          remoteRef: 'refs/heads/master',
          remoteSha: '000',
        },
      ];
      const result = runGuard('feature/x', refs);
      expect(result.allowed).toBe(false);
    });

    it('deduplicates error when both current branch and ref target main', () => {
      const refs = [
        {
          localRef: 'refs/heads/main',
          localSha: '111',
          remoteRef: 'refs/heads/main',
          remoteSha: '000',
        },
      ];
      const result = runGuard('main', refs);
      expect(result.allowed).toBe(false);
      // Should have error about remote ref + error about pushing from main
      // The current-branch check deduplicates if the branch name is already in errors
      expect(result.errors.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('branch convention warnings', () => {
    it('does not warn on epic branches', () => {
      const result = runGuard('epic/beth-abc');
      expect(result.allowed).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it('does not warn on release branches', () => {
      const result = runGuard('release/v1.0.0');
      expect(result.allowed).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it('warns on unrecognized branch names', () => {
      const result = runGuard('feature/random');
      expect(result.allowed).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('feature/random');
      expect(result.warnings[0]).toContain('epic/<id>');
    });

    it('warns on branches like dev or staging', () => {
      const result = runGuard('dev');
      expect(result.allowed).toBe(true);
      expect(result.warnings[0]).toContain('dev');
    });

    it('handles null currentBranch (detached HEAD)', () => {
      const result = runGuard(null);
      expect(result.allowed).toBe(true);
      expect(result.warnings).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('happy path', () => {
    it('allows push from epic branch to epic remote', () => {
      const refs = [
        {
          localRef: 'refs/heads/epic/beth-abc',
          localSha: '111',
          remoteRef: 'refs/heads/epic/beth-abc',
          remoteSha: '000',
        },
      ];
      const result = runGuard('epic/beth-abc', refs);
      expect(result.allowed).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('allows push from release branch', () => {
      const refs = [
        {
          localRef: 'refs/heads/release/v1.0.15',
          localSha: '111',
          remoteRef: 'refs/heads/release/v1.0.15',
          remoteSha: '000',
        },
      ];
      const result = runGuard('release/v1.0.15', refs);
      expect(result.allowed).toBe(true);
    });

    it('allows push with no refs (branch deletion)', () => {
      const result = runGuard('epic/beth-abc', []);
      expect(result.allowed).toBe(true);
    });
  });
});

// ─── generateHookScript ────────────────────────────────────────────────────────

describe('generateHookScript', () => {
  it('contains begin and end markers', () => {
    const script = generateHookScript();
    expect(script).toContain(BETH_GUARD_BEGIN);
    expect(script).toContain(BETH_GUARD_END);
  });

  it('contains bypass check', () => {
    const script = generateHookScript();
    expect(script).toContain('BETH_SKIP_PUSH_GUARD');
  });

  it('blocks main and master', () => {
    const script = generateHookScript();
    expect(script).toContain('main|master');
  });

  it('checks for epic branch pattern', () => {
    const script = generateHookScript();
    expect(script).toContain('epic/*');
  });

  it('checks for release branch pattern', () => {
    const script = generateHookScript();
    expect(script).toContain('release/*');
  });

  it('outputs to stderr', () => {
    const script = generateHookScript();
    // All echo statements should go to stderr (>&2)
    const echoLines = script
      .split('\n')
      .filter((line) => line.trim().startsWith('echo '));
    for (const line of echoLines) {
      expect(line).toContain('>&2');
    }
  });

  it('exits 1 when blocked', () => {
    const script = generateHookScript();
    expect(script).toContain('exit 1');
  });
});
