/**
 * Close Command — DEPRECATED
 *
 * Previously wrapped `bd close` with dependency enforcement.
 * Beads has been removed — use Backlog.md for task tracking.
 *
 * This command is retained as a no-op with a helpful message
 * to guide users who have muscle memory from the old workflow.
 */

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

export interface CloseOptions {
  force?: boolean;
}

export interface BeadsChild {
  id: string;
  title: string;
  status: string;
}

export interface BeadsDep {
  id: string;
  title: string;
  status: string;
  dependency_type: string;
}

export interface BeadsIssue {
  id: string;
  title: string;
  status: string;
  issue_type: string;
}

// Kept for test compatibility
const ISSUE_ID_PATTERN = /^[a-z]+-[a-z0-9]{2,10}(\.\d+)?$/;

const TEST_PATTERNS = {
  unit: /\bunit\s+test/i,
  e2e: /\b(e2e|end.to.end|integration)\s+test/i,
  security: /\bsecurity\s+test/i,
};

export function validateIssueId(id: string): boolean {
  return ISSUE_ID_PATTERN.test(id);
}

// Stubs — beads removed
export function getIssueInfo(_issueId: string): BeadsIssue | null { return null; }
export function getOpenChildren(_issueId: string): BeadsChild[] { return []; }
export function getAllChildren(_issueId: string): BeadsChild[] { return []; }
export function getOpenBlockers(_issueId: string): BeadsDep[] { return []; }

export function getMissingTestSubtasks(children: BeadsChild[]): string[] {
  const found = { unit: false, e2e: false, security: false };
  for (const child of children) {
    if (TEST_PATTERNS.unit.test(child.title)) found.unit = true;
    if (TEST_PATTERNS.e2e.test(child.title)) found.e2e = true;
    if (TEST_PATTERNS.security.test(child.title)) found.security = true;
  }
  const missing: string[] = [];
  if (!found.unit) missing.push('Unit tests');
  if (!found.e2e) missing.push('E2E/Integration tests');
  if (!found.security) missing.push('Security tests');
  return missing;
}

export function parseCloseArgs(rawArgs: string[]): {
  issueIds: string[];
  reason: string | undefined;
  force: boolean;
} {
  const issueIds: string[] = [];
  let reason: string | undefined;
  let force = false;

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg === '--force' || arg === '-f') {
      force = true;
    } else if (arg === '--reason' || arg === '-r') {
      reason = rawArgs[++i];
    } else if (arg.startsWith('--reason=')) {
      reason = arg.slice('--reason='.length);
    } else if (!arg.startsWith('-')) {
      issueIds.push(arg);
    }
  }

  return { issueIds, reason, force };
}

export function closeIssue(
  _issueId: string,
  _options: { reason?: string; force?: boolean },
): { success: boolean; blocked?: BeadsChild[]; blockers?: BeadsDep[]; missingTests?: string[] } {
  console.log(
    `${COLORS.yellow}⚠ The 'close' command has been deprecated.${COLORS.reset}`,
  );
  console.log(
    `  Beads has been removed. Use Backlog.md for task tracking.`,
  );
  console.log(
    `  Example: backlog task edit <task-id> -s "Done"`,
  );
  return { success: false };
}

/**
 * Main close command entry point.
 */
export async function close(rawArgs: string[]): Promise<void> {
  const { issueIds } = parseCloseArgs(rawArgs);

  if (issueIds.length === 0) {
    console.log(
      `${COLORS.yellow}⚠ The 'close' command has been deprecated.${COLORS.reset}`,
    );
    console.log(
      `  Beads has been removed. Use Backlog.md for task tracking.`,
    );
    process.exitCode = 1;
    return;
  }

  for (const _id of issueIds) {
    closeIssue(_id, {});
  }
  process.exitCode = 1;
}
