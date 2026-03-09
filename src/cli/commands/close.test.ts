/**
 * Close Command Tests
 *
 * Tests dependency enforcement on bd close:
 * - Issue ID validation
 * - Open children detection
 * - Open blocker detection
 * - Epic test subtask enforcement
 * - Issue type awareness
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
  getOpenBlockers,
  getIssueInfo,
  getAllChildren,
  getMissingTestSubtasks,
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

// ─── getOpenBlockers ────────────────────────────────────────────────────────────

describe('getOpenBlockers', () => {
  it('returns open non-parent-child blockers', () => {
    const mockDeps = [
      { id: 'beth-xyz', title: 'Blocker', status: 'open', dependency_type: 'blocks' },
      { id: 'beth-abc', title: 'Parent', status: 'open', dependency_type: 'parent-child' },
    ];
    mockedExecFileSync.mockReturnValue(JSON.stringify(mockDeps));

    const result = getOpenBlockers('beth-abc.1');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('beth-xyz');
    expect(result[0].dependency_type).toBe('blocks');
  });

  it('filters out closed blockers', () => {
    const mockDeps = [
      { id: 'beth-xyz', title: 'Resolved', status: 'closed', dependency_type: 'blocks' },
    ];
    mockedExecFileSync.mockReturnValue(JSON.stringify(mockDeps));

    const result = getOpenBlockers('beth-abc.1');
    expect(result).toHaveLength(0);
  });

  it('excludes parent-child dependencies', () => {
    const mockDeps = [
      { id: 'beth-abc', title: 'Parent', status: 'open', dependency_type: 'parent-child' },
    ];
    mockedExecFileSync.mockReturnValue(JSON.stringify(mockDeps));

    const result = getOpenBlockers('beth-abc.1');
    expect(result).toHaveLength(0);
  });

  it('returns empty array when bd not available', () => {
    mockedExecFileSync.mockImplementation(() => {
      throw new Error('bd not found');
    });

    const result = getOpenBlockers('beth-abc.1');
    expect(result).toHaveLength(0);
  });

  it('returns empty array on invalid JSON', () => {
    mockedExecFileSync.mockReturnValue('not json');

    const result = getOpenBlockers('beth-abc.1');
    expect(result).toHaveLength(0);
  });

  it('handles multiple open blockers', () => {
    const mockDeps = [
      { id: 'beth-aaa', title: 'Blocker A', status: 'open', dependency_type: 'blocks' },
      { id: 'beth-bbb', title: 'Blocker B', status: 'in_progress', dependency_type: 'blocks' },
    ];
    mockedExecFileSync.mockReturnValue(JSON.stringify(mockDeps));

    const result = getOpenBlockers('beth-abc.1');
    expect(result).toHaveLength(2);
  });

  it('calls bd dep list with correct args', () => {
    mockedExecFileSync.mockReturnValue('[]');

    getOpenBlockers('beth-abc.1');

    expect(mockedExecFileSync).toHaveBeenCalledWith(
      'bd',
      ['dep', 'list', 'beth-abc.1', '--json'],
      expect.objectContaining({ encoding: 'utf-8' }),
    );
  });
});

// ─── getIssueInfo ───────────────────────────────────────────────────────────────

describe('getIssueInfo', () => {
  it('returns issue metadata from bd show --json', () => {
    const mockIssue = [
      { id: 'beth-abc', title: 'Feature', status: 'open', issue_type: 'epic' },
    ];
    mockedExecFileSync.mockReturnValue(JSON.stringify(mockIssue));

    const result = getIssueInfo('beth-abc');
    expect(result).not.toBeNull();
    expect(result!.issue_type).toBe('epic');
    expect(result!.id).toBe('beth-abc');
  });

  it('returns null for non-epic tasks', () => {
    const mockIssue = [
      { id: 'beth-abc.1', title: 'Task', status: 'open', issue_type: 'task' },
    ];
    mockedExecFileSync.mockReturnValue(JSON.stringify(mockIssue));

    const result = getIssueInfo('beth-abc.1');
    expect(result).not.toBeNull();
    expect(result!.issue_type).toBe('task');
  });

  it('returns null when bd not available', () => {
    mockedExecFileSync.mockImplementation(() => {
      throw new Error('bd not found');
    });

    const result = getIssueInfo('beth-abc');
    expect(result).toBeNull();
  });

  it('returns null on empty array', () => {
    mockedExecFileSync.mockReturnValue('[]');

    const result = getIssueInfo('beth-abc');
    expect(result).toBeNull();
  });

  it('returns null when missing issue_type', () => {
    const mockIssue = [{ id: 'beth-abc', title: 'Incomplete' }];
    mockedExecFileSync.mockReturnValue(JSON.stringify(mockIssue));

    const result = getIssueInfo('beth-abc');
    expect(result).toBeNull();
  });
});

// ─── getAllChildren ──────────────────────────────────────────────────────────────

describe('getAllChildren', () => {
  it('returns all children including closed from dependents', () => {
    const mockShow = [
      {
        id: 'beth-abc',
        issue_type: 'epic',
        dependents: [
          { id: 'beth-abc.1', title: 'Impl', status: 'closed' },
          { id: 'beth-abc.2', title: 'Unit tests for impl', status: 'closed' },
          { id: 'beth-abc.3', title: 'E2E tests for impl', status: 'closed' },
        ],
      },
    ];
    mockedExecFileSync.mockReturnValue(JSON.stringify(mockShow));

    const result = getAllChildren('beth-abc');
    expect(result).toHaveLength(3);
  });

  it('returns empty array when no dependents', () => {
    const mockShow = [
      { id: 'beth-abc', issue_type: 'task' },
    ];
    mockedExecFileSync.mockReturnValue(JSON.stringify(mockShow));

    const result = getAllChildren('beth-abc');
    expect(result).toHaveLength(0);
  });

  it('returns empty array when bd not available', () => {
    mockedExecFileSync.mockImplementation(() => {
      throw new Error('bd not found');
    });

    const result = getAllChildren('beth-abc');
    expect(result).toHaveLength(0);
  });

  it('filters out malformed dependents', () => {
    const mockShow = [
      {
        id: 'beth-abc',
        dependents: [
          { id: 'beth-abc.1', title: 'Valid', status: 'open' },
          { id: 'beth-abc.2' }, // missing title/status
          null,
        ],
      },
    ];
    mockedExecFileSync.mockReturnValue(JSON.stringify(mockShow));

    const result = getAllChildren('beth-abc');
    expect(result).toHaveLength(1);
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

// ─── closeIssue ─────────────────────────────────────────────────────────────────
//
// Call order for non-force close:
//   1. bd dep list <id> --json  → getOpenBlockers
//   2. bd children <id> --json  → getOpenChildren
//   3. bd show <id> --json      → getIssueInfo (check if epic)
//   4. bd show <id> --json      → getAllChildren (if epic, for test subtask check)
//   5. bd close <id> [flags]    → actual close
//

describe('closeIssue', () => {
  /**
   * Helper: mock the standard "no blockers, no children, non-epic task" path.
   * Returns 4 calls: dep list → children → show (issue info) → close
   */
  function mockCleanLeafTask() {
    // 1. No open blockers
    mockedExecFileSync.mockReturnValueOnce('[]');
    // 2. No open children
    mockedExecFileSync.mockReturnValueOnce('[]');
    // 3. Issue info: task (not epic)
    mockedExecFileSync.mockReturnValueOnce(
      JSON.stringify([{ id: 'beth-abc', title: 'Task', status: 'open', issue_type: 'task' }]),
    );
    // 4. bd close succeeds
    mockedExecFileSync.mockReturnValueOnce('');
  }

  /**
   * Helper: mock a clean epic close path (no blockers, no open children, has test subtasks).
   */
  function mockCleanEpicWithTests() {
    // 1. No open blockers
    mockedExecFileSync.mockReturnValueOnce('[]');
    // 2. No open children
    mockedExecFileSync.mockReturnValueOnce('[]');
    // 3. Issue info: epic
    mockedExecFileSync.mockReturnValueOnce(
      JSON.stringify([{ id: 'beth-abc', title: 'Feature', status: 'open', issue_type: 'epic' }]),
    );
    // 4. All children (for test subtask check)
    mockedExecFileSync.mockReturnValueOnce(
      JSON.stringify([{
        id: 'beth-abc',
        dependents: [
          { id: 'beth-abc.1', title: 'Implement feature', status: 'closed' },
          { id: 'beth-abc.2', title: 'Unit tests for feature', status: 'closed' },
          { id: 'beth-abc.3', title: 'E2E tests for feature', status: 'closed' },
          { id: 'beth-abc.4', title: 'Security tests for feature', status: 'closed' },
        ],
      }]),
    );
    // 5. bd close succeeds
    mockedExecFileSync.mockReturnValueOnce('');
  }

  it('rejects invalid issue IDs', () => {
    const result = closeIssue('INVALID; rm -rf /', {});
    expect(result.success).toBe(false);
    expect(mockedExecFileSync).not.toHaveBeenCalled();
  });

  it('blocks close when open blockers exist', () => {
    const mockDeps = [
      { id: 'beth-xyz', title: 'Open blocker', status: 'open', dependency_type: 'blocks' },
    ];
    // 1. Open blockers returned
    mockedExecFileSync.mockReturnValueOnce(JSON.stringify(mockDeps));

    const result = closeIssue('beth-abc.1', {});
    expect(result.success).toBe(false);
    expect(result.blockers).toHaveLength(1);
    expect(result.blockers![0].id).toBe('beth-xyz');

    // Should NOT proceed to children check or close
    expect(mockedExecFileSync).toHaveBeenCalledTimes(1);
  });

  it('blocks close when open children exist', () => {
    const mockChildren = [
      { id: 'beth-abc.1', title: 'Still open', status: 'open' },
    ];

    // 1. No blockers
    mockedExecFileSync.mockReturnValueOnce('[]');
    // 2. Open children found
    mockedExecFileSync.mockReturnValueOnce(JSON.stringify(mockChildren));

    const result = closeIssue('beth-abc', {});
    expect(result.success).toBe(false);
    expect(result.blocked).toHaveLength(1);
    expect(result.blocked![0].id).toBe('beth-abc.1');

    // Should NOT proceed to close
    expect(mockedExecFileSync).toHaveBeenCalledTimes(2);
  });

  it('blocks epic close when missing test subtasks', () => {
    // 1. No blockers
    mockedExecFileSync.mockReturnValueOnce('[]');
    // 2. No open children
    mockedExecFileSync.mockReturnValueOnce('[]');
    // 3. Issue is an epic
    mockedExecFileSync.mockReturnValueOnce(
      JSON.stringify([{ id: 'beth-abc', title: 'Feature', status: 'open', issue_type: 'epic' }]),
    );
    // 4. Children have no test subtasks
    mockedExecFileSync.mockReturnValueOnce(
      JSON.stringify([{
        id: 'beth-abc',
        dependents: [
          { id: 'beth-abc.1', title: 'Implement feature', status: 'closed' },
        ],
      }]),
    );

    const result = closeIssue('beth-abc', {});
    expect(result.success).toBe(false);
    expect(result.missingTests).toHaveLength(3);
    expect(result.missingTests).toContain('Unit tests');
    expect(result.missingTests).toContain('E2E/Integration tests');
    expect(result.missingTests).toContain('Security tests');

    // Should NOT call bd close
    expect(mockedExecFileSync).toHaveBeenCalledTimes(4);
  });

  it('blocks epic close when partially missing test subtasks', () => {
    // 1. No blockers
    mockedExecFileSync.mockReturnValueOnce('[]');
    // 2. No open children
    mockedExecFileSync.mockReturnValueOnce('[]');
    // 3. Issue is an epic
    mockedExecFileSync.mockReturnValueOnce(
      JSON.stringify([{ id: 'beth-abc', title: 'Feature', status: 'open', issue_type: 'epic' }]),
    );
    // 4. Has unit tests but missing e2e and security
    mockedExecFileSync.mockReturnValueOnce(
      JSON.stringify([{
        id: 'beth-abc',
        dependents: [
          { id: 'beth-abc.1', title: 'Implement feature', status: 'closed' },
          { id: 'beth-abc.2', title: 'Unit tests for feature', status: 'closed' },
        ],
      }]),
    );

    const result = closeIssue('beth-abc', {});
    expect(result.success).toBe(false);
    expect(result.missingTests).toHaveLength(2);
    expect(result.missingTests).toContain('E2E/Integration tests');
    expect(result.missingTests).toContain('Security tests');
  });

  it('allows close when no blockers, no children (leaf task)', () => {
    mockCleanLeafTask();

    const result = closeIssue('beth-abc', {});
    expect(result.success).toBe(true);

    // Last call should be bd close
    const lastCall = mockedExecFileSync.mock.calls[mockedExecFileSync.mock.calls.length - 1];
    expect(lastCall[0]).toBe('bd');
    expect(lastCall[1]).toContain('close');
  });

  it('allows epic close when all test subtasks present', () => {
    mockCleanEpicWithTests();

    const result = closeIssue('beth-abc', {});
    expect(result.success).toBe(true);

    // 5 calls: dep list, children, show (info), show (all children), close
    expect(mockedExecFileSync).toHaveBeenCalledTimes(5);
  });

  it('skips test subtask check for non-epic issues', () => {
    mockCleanLeafTask();

    const result = closeIssue('beth-abc', {});
    expect(result.success).toBe(true);

    // 4 calls: dep list, children, show (info), close — no getAllChildren call
    expect(mockedExecFileSync).toHaveBeenCalledTimes(4);
  });

  it('passes --reason to bd close', () => {
    mockCleanLeafTask();

    closeIssue('beth-abc', { reason: 'All done' });

    const lastCall = mockedExecFileSync.mock.calls[mockedExecFileSync.mock.calls.length - 1];
    expect(lastCall[1]).toEqual(['close', 'beth-abc', '--reason', 'All done']);
  });

  it('passes --force to bd close and skips ALL enforcement', () => {
    mockedExecFileSync.mockReturnValueOnce('');

    const result = closeIssue('beth-abc', { force: true });
    expect(result.success).toBe(true);

    // Should have called ONLY bd close (no blocker, children, or epic checks)
    expect(mockedExecFileSync).toHaveBeenCalledTimes(1);
    expect(mockedExecFileSync).toHaveBeenCalledWith(
      'bd',
      ['close', 'beth-abc', '--force'],
      expect.objectContaining({ stdio: 'inherit' }),
    );
  });

  it('allows close on leaf issues when bd throws on children', () => {
    // 1. No blockers
    mockedExecFileSync.mockReturnValueOnce('[]');
    // 2. bd children throws (no children exist)
    mockedExecFileSync.mockImplementationOnce(() => {
      throw new Error('no children');
    });
    // 3. Issue info: task
    mockedExecFileSync.mockReturnValueOnce(
      JSON.stringify([{ id: 'beth-abc.1', title: 'Leaf', status: 'open', issue_type: 'task' }]),
    );
    // 4. bd close succeeds
    mockedExecFileSync.mockReturnValueOnce('');

    const result = closeIssue('beth-abc.1', {});
    expect(result.success).toBe(true);
  });

  it('returns failure when bd close fails', () => {
    // 1. No blockers
    mockedExecFileSync.mockReturnValueOnce('[]');
    // 2. No children
    mockedExecFileSync.mockReturnValueOnce('[]');
    // 3. Issue info: task
    mockedExecFileSync.mockReturnValueOnce(
      JSON.stringify([{ id: 'beth-abc', title: 'Task', status: 'open', issue_type: 'task' }]),
    );
    // 4. bd close fails
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
    // 1. No blockers
    mockedExecFileSync.mockReturnValueOnce('[]');
    // 2. Multiple open children
    mockedExecFileSync.mockReturnValueOnce(JSON.stringify(mockChildren));

    const result = closeIssue('beth-abc', {});
    expect(result.success).toBe(false);
    expect(result.blocked).toHaveLength(3);
  });

  it('gracefully handles bd show failure for issue info', () => {
    // 1. No blockers
    mockedExecFileSync.mockReturnValueOnce('[]');
    // 2. No children
    mockedExecFileSync.mockReturnValueOnce('[]');
    // 3. bd show fails — getIssueInfo returns null → skip epic check
    mockedExecFileSync.mockImplementationOnce(() => {
      throw new Error('bd show failed');
    });
    // 4. bd close succeeds
    mockedExecFileSync.mockReturnValueOnce('');

    const result = closeIssue('beth-abc', {});
    expect(result.success).toBe(true);
  });

  it('prioritizes blocker check over children check', () => {
    const mockDeps = [
      { id: 'beth-xyz', title: 'Blocker', status: 'open', dependency_type: 'blocks' },
    ];
    // 1. Blocker found → stops immediately
    mockedExecFileSync.mockReturnValueOnce(JSON.stringify(mockDeps));

    const result = closeIssue('beth-abc', {});
    expect(result.success).toBe(false);
    expect(result.blockers).toBeDefined();

    // Only 1 call — never checked children
    expect(mockedExecFileSync).toHaveBeenCalledTimes(1);
  });
});
