/**
 * Close Command — Enforced bd close
 *
 * Wraps `bd close` with dependency enforcement:
 * - Refuses to close issues that have open children
 * - Validates issue ID format to prevent injection
 * - Passes through to `bd close` when checks pass
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

// Beads issue ID: <rig>-<hash> or <rig>-<hash>.<N>
// e.g. beth-cip, beth-cip.1, beth-abc123, hq-xyz.42
const ISSUE_ID_PATTERN = /^[a-z]+-[a-z0-9]{2,10}(\.\d+)?$/;

/**
 * Validate a beads issue ID format.
 * Strict pattern prevents injection via execFileSync args.
 */
export function validateIssueId(id: string): boolean {
  return ISSUE_ID_PATTERN.test(id);
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

    // bd children --json returns an array (only open children)
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
 * Returns true if close succeeded, false if blocked.
 */
export function closeIssue(
  issueId: string,
  options: { reason?: string; force?: boolean },
): { success: boolean; blocked?: BeadsChild[] } {
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

  // Check for open children (unless --force)
  if (!options.force) {
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
