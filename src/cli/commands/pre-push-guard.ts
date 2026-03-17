/**
 * Pre-Push Guard — Branch discipline enforcement
 *
 * Validates before push:
 * - No direct pushes to main/master (BLOCKS)
 * - Current branch follows epic/<id> convention (WARNING)
 * - Bypassed with BETH_SKIP_PUSH_GUARD=1 environment variable
 */

import {
  getCurrentBranch,
  extractBranchName,
  isProtectedBranch,
  isEpicBranch,
  isReleaseBranch,
  isRecognizedBranch,
} from '../lib/gitHelpers.js';

// Re-export shared helpers so existing consumers don't break
export {
  getCurrentBranch,
  extractBranchName,
  isProtectedBranch,
  isEpicBranch,
  isReleaseBranch,
  isRecognizedBranch,
};

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

export interface PushRef {
  localRef: string;
  localSha: string;
  remoteRef: string;
  remoteSha: string;
}

export interface GuardResult {
  allowed: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Parse pre-push stdin input into structured refs.
 * Git sends: <local ref> <local SHA> <remote ref> <remote SHA>
 * One line per ref being pushed.
 */
export function parsePushRefs(stdin: string): PushRef[] {
  return stdin
    .trim()
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const parts = line.trim().split(/\s+/);
      return {
        localRef: parts[0] || '',
        localSha: parts[1] || '',
        remoteRef: parts[2] || '',
        remoteSha: parts[3] || '',
      };
    });
}

/**
 * Run all pre-push guard checks.
 *
 * @param currentBranch - Current Git branch name
 * @param refs - Optional parsed push refs from Git stdin (for remote ref validation)
 * @returns GuardResult with allowed status and diagnostics
 */
export function runGuard(
  currentBranch: string | null,
  refs?: PushRef[],
): GuardResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check 1: No pushing to protected branches via remote refs
  if (refs && refs.length > 0) {
    for (const ref of refs) {
      const targetBranch = extractBranchName(ref.remoteRef);
      if (isProtectedBranch(targetBranch)) {
        errors.push(
          `Direct push to '${targetBranch}' is blocked. Use a PR from your epic branch.`,
        );
      }
    }
  }

  // Check 1b: Also block if current branch IS a protected branch
  // (catches the common case without needing stdin refs)
  if (currentBranch && isProtectedBranch(currentBranch)) {
    const msg = `Pushing from '${currentBranch}' is blocked. Work on an epic branch.`;
    if (!errors.some((e) => e.includes(currentBranch))) {
      errors.push(msg);
    }
  }

  // Check 2: Current branch should follow epic convention
  if (currentBranch && !isRecognizedBranch(currentBranch)) {
    warnings.push(
      `Branch '${currentBranch}' doesn't follow the epic/<id> convention. Consider renaming.`,
    );
  }

  return {
    allowed: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Main entry point for the pre-push guard command.
 * Reads refs from stdin (if available) and runs all checks.
 */
export async function prePushGuard(stdinInput?: string): Promise<void> {
  // Check bypass
  if (process.env.BETH_SKIP_PUSH_GUARD === '1') {
    console.error(
      `${COLORS.yellow}⚠ Pre-push guard bypassed (BETH_SKIP_PUSH_GUARD=1)${COLORS.reset}`,
    );
    return;
  }

  // Read stdin if not provided (Git pre-push pipes refs via stdin)
  let stdin = stdinInput;
  if (stdin === undefined) {
    const fs = await import('fs');
    try {
      stdin = fs.readFileSync(0, 'utf-8');
    } catch {
      stdin = '';
    }
  }

  const refs = stdin.trim() ? parsePushRefs(stdin) : undefined;
  const currentBranch = getCurrentBranch();
  const result = runGuard(currentBranch, refs);

  // Print warnings
  for (const warning of result.warnings) {
    console.error(`${COLORS.yellow}⚠ ${warning}${COLORS.reset}`);
  }

  // Print errors and exit non-zero to block push
  if (!result.allowed) {
    console.error('');
    for (const error of result.errors) {
      console.error(`${COLORS.red}✗ ${error}${COLORS.reset}`);
    }
    console.error(
      `\n${COLORS.yellow}Set BETH_SKIP_PUSH_GUARD=1 to bypass.${COLORS.reset}`,
    );
    process.exit(1);
  }
}

/**
 * Generate the shell script content for the pre-push hook.
 * Pure shell — no Node dependency at hook time for speed.
 */
export function generateHookScript(): string {
  return `
# --- BEGIN BETH GUARD ---
# Branch discipline enforcement — installed by beth-copilot
# Bypass: BETH_SKIP_PUSH_GUARD=1 git push
if [ "\$BETH_SKIP_PUSH_GUARD" = "1" ]; then
  echo "⚠ Pre-push guard bypassed (BETH_SKIP_PUSH_GUARD=1)" >&2
else
  _beth_branch=\$(git branch --show-current 2>/dev/null)

  # Block pushes from protected branches
  case "\$_beth_branch" in
    main|master)
      echo "✗ Pushing from '\$_beth_branch' is blocked. Work on an epic branch." >&2
      echo "  Set BETH_SKIP_PUSH_GUARD=1 to bypass." >&2
      exit 1
      ;;
  esac

  # Warn if not on an epic or release branch
  case "\$_beth_branch" in
    epic/*) ;;
    release/*) ;;
    "")
      echo "⚠ Detached HEAD — no branch name. Proceeding anyway." >&2
      ;;
    *)
      echo "⚠ Branch '\$_beth_branch' doesn't follow the epic/<id> convention." >&2
      ;;
  esac
fi
# --- END BETH GUARD ---
`;
}

/** Marker used to detect if bethguard is already installed in a hook file. */
export const BETH_GUARD_BEGIN = '# --- BEGIN BETH GUARD ---';
export const BETH_GUARD_END = '# --- END BETH GUARD ---';
