/**
 * Close Command Tests
 *
 * The close command is deprecated — beads has been removed.
 * Tests verify:
 * - Issue ID validation (still has real logic)
 * - Stub functions return expected values (null / empty arrays)
 * - getMissingTestSubtasks (still has real logic)
 * - Arg parsing (still has real logic)
 * - closeIssue prints deprecation and returns success
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  validateIssueId,
  getOpenChildren,
  getOpenBlockers,
  getIssueInfo,
  getAllChildren,
  getMissingTestSubtasks,
  parseCloseArgs,
  closeIssue,
} from './close.js';

beforeEach(() => {
  vi.clearAllMocks();
  // Suppress console output in tests
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

// ─── validateIssueId ───────────────────────────────────────────────────────────

describe('validateIssueId', () => {
  it('accepts standard beads IDs', () => {
    expect(validateIssueId('beth-abc')).toBe(true);
    expect(validateIssueId('beth-cip')).toBe(true);
    expect(validateIssueId('beth-abc123')).toBe(true);
    expect(validateIssueId('hq-xyz')).toBe(true);
  });

  it('accepts dotted child IDs', () => {
    expect(validateIssueId('beth-cip.1')).toBe(true);
    expect(validateIssueId('beth-abc123.42')).toBe(true);
    expect(validateIssueId('hq-xyz.9')).toBe(true);
  });

  it('rejects empty string', () => {
    expect(validateIssueId('')).toBe(false);
  });

  it('rejects IDs without rig prefix', () => {
    expect(validateIssueId('abc123')).toBe(false);
    expect(validateIssueId('-abc123')).toBe(false);
  });

  it('rejects IDs with uppercase', () => {
    expect(validateIssueId('BETH-abc')).toBe(false);
    expect(validateIssueId('Beth-abc')).toBe(false);
  });

  it('rejects IDs with special characters', () => {
    expect(validateIssueId('beth-abc; rm -rf /')).toBe(false);
    expect(validateIssueId('beth-abc$(whoami)')).toBe(false);
    expect(validateIssueId('beth-abc`cmd`')).toBe(false);
    expect(validateIssueId('beth-abc|cat /etc/passwd')).toBe(false);
  });

  it('rejects overly long hashes', () => {
    expect(validateIssueId('beth-abcdefghijk')).toBe(false); // 11 chars
  });

  it('rejects double dots', () => {
    expect(validateIssueId('beth-abc.1.2')).toBe(false);
  });

  it('rejects dot without number', () => {
    expect(validateIssueId('beth-abc.')).toBe(false);
    expect(validateIssueId('beth-abc.x')).toBe(false);
  });
});

// ─── getOpenChildren (stub) ─────────────────────────────────────────────────

describe('getOpenChildren', () => {
  it('always returns empty array (beads removed)', () => {
    expect(getOpenChildren('beth-abc')).toEqual([]);
    expect(getOpenChildren('beth-abc.1')).toEqual([]);
    expect(getOpenChildren('anything')).toEqual([]);
  });
});

// ─── getOpenBlockers (stub) ──────────────────────────────────────────────────

describe('getOpenBlockers', () => {
  it('always returns empty array (beads removed)', () => {
    expect(getOpenBlockers('beth-abc.1')).toEqual([]);
    expect(getOpenBlockers('beth-abc')).toEqual([]);
    expect(getOpenBlockers('anything')).toEqual([]);
  });
});

// ─── getIssueInfo (stub) ─────────────────────────────────────────────────────

describe('getIssueInfo', () => {
  it('always returns null (beads removed)', () => {
    expect(getIssueInfo('beth-abc')).toBeNull();
    expect(getIssueInfo('beth-abc.1')).toBeNull();
    expect(getIssueInfo('anything')).toBeNull();
  });
});

// ─── getAllChildren (stub) ────────────────────────────────────────────────────

describe('getAllChildren', () => {
  it('always returns empty array (beads removed)', () => {
    expect(getAllChildren('beth-abc')).toEqual([]);
    expect(getAllChildren('beth-abc.1')).toEqual([]);
    expect(getAllChildren('anything')).toEqual([]);
  });
});

// ─── getMissingTestSubtasks ────────────────────────────────────────────────────

describe('getMissingTestSubtasks', () => {
  it('returns all three when no test subtasks exist', () => {
    const children = [
      { id: 'beth-abc.1', title: 'Implement feature', status: 'closed' },
    ];

    const missing = getMissingTestSubtasks(children);
    expect(missing).toHaveLength(3);
    expect(missing).toContain('Unit tests');
    expect(missing).toContain('E2E/Integration tests');
    expect(missing).toContain('Security tests');
  });

  it('returns empty when all test subtasks present', () => {
    const children = [
      { id: 'beth-abc.1', title: 'Implement feature', status: 'closed' },
      { id: 'beth-abc.2', title: 'Unit tests for feature', status: 'closed' },
      { id: 'beth-abc.3', title: 'E2E tests for feature', status: 'closed' },
      { id: 'beth-abc.4', title: 'Security tests for feature', status: 'closed' },
    ];

    const missing = getMissingTestSubtasks(children);
    expect(missing).toHaveLength(0);
  });

  it('detects missing unit tests', () => {
    const children = [
      { id: 'beth-abc.1', title: 'E2E tests for auth', status: 'closed' },
      { id: 'beth-abc.2', title: 'Security tests for auth', status: 'closed' },
    ];

    const missing = getMissingTestSubtasks(children);
    expect(missing).toEqual(['Unit tests']);
  });

  it('detects missing e2e tests', () => {
    const children = [
      { id: 'beth-abc.1', title: 'Unit tests for auth', status: 'closed' },
      { id: 'beth-abc.2', title: 'Security tests for auth', status: 'closed' },
    ];

    const missing = getMissingTestSubtasks(children);
    expect(missing).toEqual(['E2E/Integration tests']);
  });

  it('detects missing security tests', () => {
    const children = [
      { id: 'beth-abc.1', title: 'Unit tests for auth', status: 'closed' },
      { id: 'beth-abc.2', title: 'E2E tests for auth', status: 'closed' },
    ];

    const missing = getMissingTestSubtasks(children);
    expect(missing).toEqual(['Security tests']);
  });

  it('matches "integration tests" as e2e', () => {
    const children = [
      { id: 'beth-abc.1', title: 'Integration tests for API', status: 'closed' },
    ];

    const missing = getMissingTestSubtasks(children);
    expect(missing).not.toContain('E2E/Integration tests');
  });

  it('matches "end-to-end tests" as e2e', () => {
    const children = [
      { id: 'beth-abc.1', title: 'End-to-end tests for auth', status: 'closed' },
    ];

    const missing = getMissingTestSubtasks(children);
    expect(missing).not.toContain('E2E/Integration tests');
  });

  it('is case-insensitive', () => {
    const children = [
      { id: 'beth-abc.1', title: 'UNIT TESTS for feature', status: 'closed' },
      { id: 'beth-abc.2', title: 'e2e Tests for feature', status: 'closed' },
      { id: 'beth-abc.3', title: 'Security Tests for feature', status: 'closed' },
    ];

    const missing = getMissingTestSubtasks(children);
    expect(missing).toHaveLength(0);
  });

  it('returns all three for empty children array', () => {
    const missing = getMissingTestSubtasks([]);
    expect(missing).toHaveLength(3);
  });
});

// ─── parseCloseArgs ─────────────────────────────────────────────────────────────

describe('parseCloseArgs', () => {
  it('extracts a single issue ID', () => {
    const { issueIds, reason, force } = parseCloseArgs(['beth-abc']);
    expect(issueIds).toEqual(['beth-abc']);
    expect(reason).toBeUndefined();
    expect(force).toBe(false);
  });

  it('extracts multiple issue IDs', () => {
    const { issueIds } = parseCloseArgs(['beth-abc.1', 'beth-abc.2']);
    expect(issueIds).toEqual(['beth-abc.1', 'beth-abc.2']);
  });

  it('extracts --reason with separate arg', () => {
    const { issueIds, reason } = parseCloseArgs([
      'beth-abc',
      '--reason',
      'Task completed',
    ]);
    expect(issueIds).toEqual(['beth-abc']);
    expect(reason).toBe('Task completed');
  });

  it('extracts -r shorthand', () => {
    const { reason } = parseCloseArgs(['beth-abc', '-r', 'Done']);
    expect(reason).toBe('Done');
  });

  it('extracts --reason=value format', () => {
    const { reason } = parseCloseArgs(['beth-abc', '--reason=Completed']);
    expect(reason).toBe('Completed');
  });

  it('extracts --force flag', () => {
    const { force } = parseCloseArgs(['beth-abc', '--force']);
    expect(force).toBe(true);
  });

  it('extracts -f shorthand', () => {
    const { force } = parseCloseArgs(['beth-abc', '-f']);
    expect(force).toBe(true);
  });

  it('handles combination of all args', () => {
    const { issueIds, reason, force } = parseCloseArgs([
      'beth-abc.1',
      'beth-abc.2',
      '--reason',
      'Both done',
      '--force',
    ]);
    expect(issueIds).toEqual(['beth-abc.1', 'beth-abc.2']);
    expect(reason).toBe('Both done');
    expect(force).toBe(true);
  });

  it('returns empty issueIds when no args', () => {
    const { issueIds } = parseCloseArgs([]);
    expect(issueIds).toEqual([]);
  });

  it('skips unknown flags', () => {
    const { issueIds } = parseCloseArgs(['beth-abc', '--json', '--verbose']);
    expect(issueIds).toEqual(['beth-abc']);
  });
});

// ─── closeIssue (deprecated — always returns success) ───────────────────────

describe('closeIssue', () => {
  it('returns success for any issue ID', () => {
    const result = closeIssue('beth-abc', {});
    expect(result.success).toBe(true);
  });

  it('returns success even for invalid-looking IDs (deprecated, no validation)', () => {
    const result = closeIssue('INVALID; rm -rf /', {});
    expect(result.success).toBe(true);
  });

  it('returns success with force option', () => {
    const result = closeIssue('beth-abc', { force: true });
    expect(result.success).toBe(true);
  });

  it('returns success with reason option', () => {
    const result = closeIssue('beth-abc', { reason: 'All done' });
    expect(result.success).toBe(true);
  });

  it('prints deprecation message', () => {
    closeIssue('beth-abc', {});
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('deprecated'),
    );
  });

  it('does not return blocked, blockers, or missingTests', () => {
    const result = closeIssue('beth-abc', {});
    expect(result.blocked).toBeUndefined();
    expect(result.blockers).toBeUndefined();
    expect(result.missingTests).toBeUndefined();
  });
});
