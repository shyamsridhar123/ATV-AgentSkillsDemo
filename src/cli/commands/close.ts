/**
 * Close Command — Enforced bd close
 *
 * Wraps `bd close` with dependency enforcement:
 * - Refuses to close issues that have open children
 * - Refuses to close issues that have open blockers (unresolved dependencies)
 * - Refuses to close epics that lack mandatory test subtasks
 * - Validates issue ID format to prevent injection
 * - Passes through to `bd close` when all checks pass
 * - --force bypasses enforcement checks
 */

import { execFileSync } from 'child_process';

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

// Beads issue ID: <rig>-<hash> or <rig>-<hash>.<N>
// e.g. beth-cip, beth-cip.1, beth-abc123, hq-xyz.42
const ISSUE_ID_PATTERN = /^[a-z]+-[a-z0-9]{2,10}(\.\d+)?$/;

// Test subtask title patterns — at least one of each category required for epics
const TEST_PATTERNS = {
  unit: /\bunit\s+test/i,
  e2e: /\b(e2e|end.to.end|integration)\s+test/i,
  security: /\bsecurity\s+test/i,
};

/**
 * Validate a beads issue ID format.
 * Strict pattern prevents injection via execFileSync args.
 */
export function validateIssueId(id: string): boolean {
  return ISSUE_ID_PATTERN.test(id);
}

/**
 * Get issue metadata (id, title, status, issue_type) via `bd show --json`.
 * Returns null if issue not found or bd unavailable.
 */
export function getIssueInfo(issueId: string): BeadsIssue | null {
  try {
    const output = execFileSync('bd', ['show', issueId, '--json'], {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const parsed: unknown = JSON.parse(output);

    // bd show --json returns an array with one item
    if (Array.isArray(parsed) && parsed.length > 0) {
      const item = parsed[0];
      if (
        typeof item === 'object' &&
        item !== null &&
        'id' in item &&
        'issue_type' in item
      ) {
        return item as BeadsIssue;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Get open children for an issue via `bd children --json`.
 * Returns empty array if issue has no children or bd is unavailable.
 */
export function getOpenChildren(issueId: string): BeadsChild[] {
  try {
    const output = execFileSync('bd', ['children', issueId, '--json'], {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const parsed: unknown = JSON.parse(output);

    // bd children --json returns an array (only open children by default)
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter(
        (item: unknown): item is BeadsChild =>
          typeof item === 'object' &&
          item !== null &&
          'id' in item &&
          'title' in item &&
          'status' in item,
      )
      .filter((child) => child.status !== 'closed');
  } catch {
    // bd not available, no children, or parse error — allow close
    return [];
  }
}

/**
 * Get ALL children (including closed) for test subtask validation.
 * Uses bd show --json which includes dependents.
 */
export function getAllChildren(issueId: string): BeadsChild[] {
  try {
    // bd show returns dependents array with all children
    const output = execFileSync('bd', ['show', issueId, '--json'], {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const parsed: unknown = JSON.parse(output);

    if (!Array.isArray(parsed) || parsed.length === 0) {
      return [];
    }

    const issue = parsed[0];
    if (
      typeof issue !== 'object' ||
      issue === null ||
      !('dependents' in issue)
    ) {
      return [];
    }

    const dependents = (issue as Record<string, unknown>).dependents;
    if (!Array.isArray(dependents)) {
      return [];
    }

    return dependents.filter(
      (item: unknown): item is BeadsChild =>
        typeof item === 'object' &&
        item !== null &&
        'id' in item &&
        'title' in item &&
        'status' in item,
    );
  } catch {
    return [];
  }
}

/**
 * Get open blockers for an issue via `bd dep list --json`.
 * Returns only non-parent-child dependencies that are still open.
 */
export function getOpenBlockers(issueId: string): BeadsDep[] {
  try {
    const output = execFileSync(
      'bd',
      ['dep', 'list', issueId, '--json'],
      {
        encoding: 'utf-8',
        timeout: 10000,
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );

    const parsed: unknown = JSON.parse(output);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter(
        (item: unknown): item is BeadsDep =>
          typeof item === 'object' &&
          item !== null &&
          'id' in item &&
          'title' in item &&
          'status' in item &&
          'dependency_type' in item,
      )
      .filter(
        (dep) =>
          dep.dependency_type !== 'parent-child' && dep.status !== 'closed',
      );
  } catch {
    return [];
  }
}

/**
 * Check if an epic has the mandatory test subtasks.
 * Returns list of missing test categories.
 */
export function getMissingTestSubtasks(children: BeadsChild[]): string[] {
  const found = {
    unit: false,
    e2e: false,
    security: false,
  };

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

/**
 * Parse close command arguments.
 * Returns issue IDs, reason, and flags.
 */
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
      // Next arg is the reason text
      reason = rawArgs[++i];
    } else if (arg.startsWith('--reason=')) {
      reason = arg.slice('--reason='.length);
    } else if (!arg.startsWith('-')) {
      issueIds.push(arg);
    }
    // Skip other flags (--json, --verbose, etc.)
  }

  return { issueIds, reason, force };
}

/**
 * Execute enforced close for a single issue.
 * Checks: ID format → open blockers → open children → test subtasks (epics) → bd close
 */
export function closeIssue(
  issueId: string,
  options: { reason?: string; force?: boolean },
): { success: boolean; blocked?: BeadsChild[]; blockers?: BeadsDep[]; missingTests?: string[] } {
  // Validate issue ID format
  if (!validateIssueId(issueId)) {
    console.error(
      `${COLORS.red}✗ Invalid issue ID: "${issueId}"${COLORS.reset}`,
    );
    console.error(
      `  Expected format: <rig>-<hash>[.<number>] (e.g. beth-abc123, beth-abc123.1)`,
    );
    return { success: false };
  }

  if (!options.force) {
    // 1. Check for open blockers (non-parent dependencies)
    const openBlockers = getOpenBlockers(issueId);
    if (openBlockers.length > 0) {
      console.error(
        `\n${COLORS.red}✗ Cannot close ${COLORS.bright}${issueId}${COLORS.reset}${COLORS.red} — ${openBlockers.length} unresolved blocker${openBlockers.length === 1 ? '' : 's'}:${COLORS.reset}\n`,
      );
      for (const blocker of openBlockers) {
        console.error(
          `   ● ${COLORS.cyan}${blocker.id}${COLORS.reset}: ${blocker.title} [${blocker.status}] (${blocker.dependency_type})`,
        );
      }
      console.error(
        `\n${COLORS.yellow}Resolve blockers first, or use --force to override.${COLORS.reset}\n`,
      );
      return { success: false, blockers: openBlockers };
    }

    // 2. Check for open children
    const openChildren = getOpenChildren(issueId);
    if (openChildren.length > 0) {
      console.error(
        `\n${COLORS.red}✗ Cannot close ${COLORS.bright}${issueId}${COLORS.reset}${COLORS.red} — ${openChildren.length} open child${openChildren.length === 1 ? '' : 'ren'}:${COLORS.reset}\n`,
      );
      for (const child of openChildren) {
        console.error(
          `   ○ ${COLORS.cyan}${child.id}${COLORS.reset}: ${child.title} [${child.status}]`,
        );
      }
      console.error(
        `\n${COLORS.yellow}Close all children first, or use --force to override.${COLORS.reset}\n`,
      );
      return { success: false, blocked: openChildren };
    }

    // 3. For epics: verify mandatory test subtasks exist
    const issueInfo = getIssueInfo(issueId);
    if (issueInfo && issueInfo.issue_type === 'epic') {
      // Prefer children/dependents from the existing bd show response for this epic,
      // falling back to getAllChildren(issueId) only if necessary.
      const allChildren =
        (Array.isArray((issueInfo as any).dependents) &&
          (issueInfo as any).dependents.length > 0
          ? (issueInfo as any).dependents
          : getAllChildren(issueId));
      const missingTests = getMissingTestSubtasks(allChildren);
      if (missingTests.length > 0) {
        console.error(
          `\n${COLORS.red}✗ Cannot close epic ${COLORS.bright}${issueId}${COLORS.reset}${COLORS.red} — missing mandatory test subtasks:${COLORS.reset}\n`,
        );
        for (const missing of missingTests) {
          console.error(
            `   ✗ ${COLORS.yellow}${missing}${COLORS.reset}`,
          );
        }
        console.error(
          `\n${COLORS.yellow}Create test subtasks with: bd create "<type> tests for <feature>" --parent ${issueId}${COLORS.reset}`,
        );
        console.error(
          `${COLORS.yellow}Or use --force to override.${COLORS.reset}\n`,
        );
        return { success: false, missingTests };
      }
    }
  }

  // Build bd close args
  const bdArgs = ['close', issueId];
  if (options.reason) {
    bdArgs.push('--reason', options.reason);
  }
  if (options.force) {
    bdArgs.push('--force');
  }

  // Execute bd close (no shell — execFileSync is injection-safe)
  try {
    execFileSync('bd', bdArgs, {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: 'inherit',
    });
    return { success: true };
  } catch {
    return { success: false };
  }
}

/**
 * Main close command entry point.
 * Called from CLI routing with raw args after 'close'.
 */
export async function close(rawArgs: string[]): Promise<void> {
  const { issueIds, reason, force } = parseCloseArgs(rawArgs);

  if (issueIds.length === 0) {
    console.error(
      `${COLORS.red}✗ No issue ID provided${COLORS.reset}`,
    );
    console.error(
      `\n  Usage: npx beth-copilot close <issue-id> [--reason "text"] [--force]`,
    );
    console.error(`  Example: npx beth-copilot close beth-abc123.1 --reason "Done"`);
    process.exit(1);
  }

  let allSucceeded = true;

  for (const id of issueIds) {
    const result = closeIssue(id, { reason, force });
    if (!result.success) {
      allSucceeded = false;
    }
  }

  if (!allSucceeded) {
    process.exit(1);
  }
}
