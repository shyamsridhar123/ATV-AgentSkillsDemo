/**
 * Close Command Tests
 *
 * Tests dependency enforcement on bd close:
 * - Issue ID validation
 * - Open children detection
 * - Arg parsing
 * - Blocked close behavior
 * - Force bypass
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as child_process from 'child_process';

// Mock child_process before importing the module under test
vi.mock('child_process', () => ({
  execFileSync: vi.fn(),
}));

// Import after mocking
import {
  validateIssueId,
  getOpenChildren,
  parseCloseArgs,
  closeIssue,
} from './close.js';

const mockedExecFileSync = vi.mocked(child_process.execFileSync);

beforeEach(() => {
  vi.clearAllMocks();
  // Suppress console output in tests
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

// ─── getOpenChildren ────────────────────────────────────────────────────────────

describe('getOpenChildren', () => {
  it('returns open children from bd children --json', () => {
    const mockChildren = [
      { id: 'beth-abc.1', title: 'Child 1', status: 'open' },
      { id: 'beth-abc.2', title: 'Child 2', status: 'open' },
    ];
    mockedExecFileSync.mockReturnValue(JSON.stringify(mockChildren));

    const result = getOpenChildren('beth-abc');

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('beth-abc.1');
    expect(mockedExecFileSync).toHaveBeenCalledWith(
      'bd',
      ['children', 'beth-abc', '--json'],
      expect.objectContaining({ encoding: 'utf-8' }),
    );
  });

  it('filters out closed children', () => {
    const mockChildren = [
      { id: 'beth-abc.1', title: 'Done', status: 'closed' },
      { id: 'beth-abc.2', title: 'Still open', status: 'open' },
    ];
    mockedExecFileSync.mockReturnValue(JSON.stringify(mockChildren));

    const result = getOpenChildren('beth-abc');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('beth-abc.2');
  });

  it('returns empty array when no children', () => {
    mockedExecFileSync.mockReturnValue('[]');

    const result = getOpenChildren('beth-abc');
    expect(result).toHaveLength(0);
  });

  it('returns empty array when bd not available', () => {
    mockedExecFileSync.mockImplementation(() => {
      throw new Error('bd not found');
    });

    const result = getOpenChildren('beth-abc');
    expect(result).toHaveLength(0);
  });

  it('returns empty array on invalid JSON', () => {
    mockedExecFileSync.mockReturnValue('not json');

    const result = getOpenChildren('beth-abc');
    expect(result).toHaveLength(0);
  });

  it('returns empty array when response is not an array', () => {
    mockedExecFileSync.mockReturnValue('{"error": "not found"}');

    const result = getOpenChildren('beth-abc');
    expect(result).toHaveLength(0);
  });

  it('filters out malformed child entries', () => {
    const mockChildren = [
      { id: 'beth-abc.1', title: 'Valid', status: 'open' },
      { id: 'beth-abc.2' }, // missing title and status
      null,
      'garbage',
    ];
    mockedExecFileSync.mockReturnValue(JSON.stringify(mockChildren));

    const result = getOpenChildren('beth-abc');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('beth-abc.1');
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

// ─── closeIssue ─────────────────────────────────────────────────────────────────

describe('closeIssue', () => {
  it('rejects invalid issue IDs', () => {
    const result = closeIssue('INVALID; rm -rf /', {});
    expect(result.success).toBe(false);
    expect(mockedExecFileSync).not.toHaveBeenCalled();
  });

  it('blocks close when open children exist', () => {
    const mockChildren = [
      { id: 'beth-abc.1', title: 'Still open', status: 'open' },
    ];

    // First call: bd children check
    mockedExecFileSync.mockReturnValueOnce(JSON.stringify(mockChildren));

    const result = closeIssue('beth-abc', {});
    expect(result.success).toBe(false);
    expect(result.blocked).toHaveLength(1);
    expect(result.blocked![0].id).toBe('beth-abc.1');

    // Should NOT have called bd close
    expect(mockedExecFileSync).toHaveBeenCalledTimes(1);
    expect(mockedExecFileSync).toHaveBeenCalledWith(
      'bd',
      ['children', 'beth-abc', '--json'],
      expect.any(Object),
    );
  });

  it('allows close when no open children', () => {
    // No open children
    mockedExecFileSync.mockReturnValueOnce('[]');
    // bd close succeeds
    mockedExecFileSync.mockReturnValueOnce('');

    const result = closeIssue('beth-abc', {});
    expect(result.success).toBe(true);

    // Should have called bd close
    expect(mockedExecFileSync).toHaveBeenCalledTimes(2);
    expect(mockedExecFileSync).toHaveBeenNthCalledWith(
      2,
      'bd',
      ['close', 'beth-abc'],
      expect.objectContaining({ stdio: 'inherit' }),
    );
  });

  it('passes --reason to bd close', () => {
    mockedExecFileSync.mockReturnValueOnce('[]');
    mockedExecFileSync.mockReturnValueOnce('');

    closeIssue('beth-abc', { reason: 'All done' });

    expect(mockedExecFileSync).toHaveBeenNthCalledWith(
      2,
      'bd',
      ['close', 'beth-abc', '--reason', 'All done'],
      expect.any(Object),
    );
  });

  it('passes --force to bd close and skips children check', () => {
    mockedExecFileSync.mockReturnValueOnce('');

    const result = closeIssue('beth-abc', { force: true });
    expect(result.success).toBe(true);

    // Should have called bd close directly (no children check)
    expect(mockedExecFileSync).toHaveBeenCalledTimes(1);
    expect(mockedExecFileSync).toHaveBeenCalledWith(
      'bd',
      ['close', 'beth-abc', '--force'],
      expect.objectContaining({ stdio: 'inherit' }),
    );
  });

  it('allows close on leaf issues (no children)', () => {
    // bd children throws (no children exist)
    mockedExecFileSync.mockImplementationOnce(() => {
      throw new Error('no children');
    });
    // bd close succeeds
    mockedExecFileSync.mockReturnValueOnce('');

    const result = closeIssue('beth-abc.1', {});
    expect(result.success).toBe(true);
  });

  it('returns failure when bd close fails', () => {
    mockedExecFileSync.mockReturnValueOnce('[]');
    mockedExecFileSync.mockImplementationOnce(() => {
      throw new Error('bd close failed');
    });

    const result = closeIssue('beth-abc', {});
    expect(result.success).toBe(false);
  });

  it('blocks close with multiple open children', () => {
    const mockChildren = [
      { id: 'beth-abc.1', title: 'Task A', status: 'open' },
      { id: 'beth-abc.2', title: 'Task B', status: 'in_progress' },
      { id: 'beth-abc.3', title: 'Task C', status: 'open' },
    ];
    mockedExecFileSync.mockReturnValueOnce(JSON.stringify(mockChildren));

    const result = closeIssue('beth-abc', {});
    expect(result.success).toBe(false);
    expect(result.blocked).toHaveLength(3);
  });
});
