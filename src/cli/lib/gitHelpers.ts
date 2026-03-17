/**
 * Shared Git Helpers
 *
 * Common git utility functions used across CLI commands.
 * Extracted from pre-push-guard.ts and land.ts to eliminate duplication.
 */

import { execFileSync } from 'child_process';

/** Protected branch names that cannot receive direct pushes. */
export const PROTECTED_BRANCHES = ['main', 'master'];

/** Epic branch naming convention: epic/<prefix>-<hash> */
export const EPIC_BRANCH_PATTERN = /^epic\/([a-z]+-[a-z0-9]+)$/;

/** Release branches are also valid push targets. */
export const RELEASE_BRANCH_PATTERN = /^release\/v?\d+/;

/**
 * Get the current Git branch name.
 * Returns null if not in a git repo or in detached HEAD state.
 */
export function getCurrentBranch(): string | null {
  try {
    const result = execFileSync('git', ['branch', '--show-current'], {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return result || null;
  } catch {
    return null;
  }
}

/**
 * Check if a branch name is protected (main, master).
 */
export function isProtectedBranch(branch: string): boolean {
  return PROTECTED_BRANCHES.includes(branch);
}

/**
 * Extract branch name from a Git ref.
 * refs/heads/main → main
 * refs/heads/epic/beth-abc123 → epic/beth-abc123
 */
export function extractBranchName(ref: string): string {
  const prefix = 'refs/heads/';
  if (ref.startsWith(prefix)) {
    return ref.slice(prefix.length);
  }
  return ref;
}

/**
 * Extract the epic ID from a branch name.
 * e.g. "epic/beth-z9n" → "beth-z9n"
 * Returns null if branch doesn't follow epic convention.
 */
export function extractEpicId(branch: string): string | null {
  const match = EPIC_BRANCH_PATTERN.exec(branch);
  return match ? match[1] : null;
}

/**
 * Check if the branch follows the epic/<id> convention.
 */
export function isEpicBranch(branch: string): boolean {
  return EPIC_BRANCH_PATTERN.test(branch);
}

/**
 * Check if the branch is a release branch.
 */
export function isReleaseBranch(branch: string): boolean {
  return RELEASE_BRANCH_PATTERN.test(branch);
}

/**
 * Check if the branch follows any recognized naming convention.
 */
export function isRecognizedBranch(branch: string): boolean {
  return isEpicBranch(branch) || isReleaseBranch(branch) || isProtectedBranch(branch);
}

/**
 * Check if there are uncommitted changes in the working tree.
 */
export function hasUncommittedChanges(): boolean {
  try {
    const output = execFileSync('git', ['status', '--porcelain'], {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return output.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Check if there are staged changes ready to commit.
 */
export function hasStagedChanges(): boolean {
  try {
    execFileSync('git', ['diff', '--cached', '--quiet'], {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return false; // exit 0 means no diff
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 1) {
      return true;
    }
    return false;
  }
}

/**
 * Check if there are unpushed commits on the current branch.
 */
export function hasUnpushedCommits(branch: string): boolean {
  try {
    execFileSync('git', ['show-ref', '--verify', '--quiet', `refs/remotes/origin/${branch}`], {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const output = execFileSync('git', ['log', `origin/${branch}..HEAD`, '--oneline'], {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return output.trim().length > 0;
  } catch {
    return true;
  }
}

/**
 * Check if a remote tracking branch exists for the given branch.
 */
export function remoteBranchExists(branch: string): boolean {
  try {
    execFileSync('git', ['show-ref', '--verify', '--quiet', `refs/remotes/origin/${branch}`], {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Run npm test and return pass/fail with output.
 */
export function runTests(): { passed: boolean; output: string } {
  try {
    const output = execFileSync('npm', ['test'], {
      encoding: 'utf-8',
      timeout: 300000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { passed: true, output };
  } catch (error: unknown) {
    const output =
      (error && typeof error === 'object' && 'stdout' in error ? String((error as { stdout: unknown }).stdout) : '') +
      (error && typeof error === 'object' && 'stderr' in error ? String((error as { stderr: unknown }).stderr) : '');
    return { passed: false, output };
  }
}

/**
 * Stage all changes (git add -A).
 */
export function gitAddAll(): boolean {
  try {
    execFileSync('git', ['add', '-A'], {
      encoding: 'utf-8',
      timeout: 30000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Commit staged changes.
 */
export function gitCommit(message: string): boolean {
  try {
    execFileSync('git', ['commit', '-m', message], {
      encoding: 'utf-8',
      timeout: 30000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Abort an in-progress rebase.
 */
export function gitRebaseAbort(): void {
  try {
    execFileSync('git', ['rebase', '--abort'], {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch {
    // Best-effort — if there's no rebase in progress, this will fail harmlessly
  }
}

/**
 * Pull with rebase from origin.
 */
export function gitPullRebase(branch: string): { success: boolean; output: string } {
  try {
    const output = execFileSync('git', ['pull', 'origin', branch, '--rebase'], {
      encoding: 'utf-8',
      timeout: 60000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { success: true, output };
  } catch (error: unknown) {
    const output =
      (error && typeof error === 'object' && 'stderr' in error ? String((error as { stderr: unknown }).stderr) : '');
    return { success: false, output };
  }
}

/**
 * Push to origin.
 */
export function gitPush(branch: string): { success: boolean; output: string } {
  try {
    const output = execFileSync('git', ['push', 'origin', branch], {
      encoding: 'utf-8',
      timeout: 60000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { success: true, output };
  } catch (error: unknown) {
    const output =
      (error && typeof error === 'object' && 'stderr' in error ? String((error as { stderr: unknown }).stderr) : '');
    return { success: false, output };
  }
}

/**
 * Verify the current branch is up to date with origin.
 */
export function isUpToDateWithOrigin(branch: string): boolean {
  try {
    execFileSync('git', ['fetch', 'origin', branch], {
      encoding: 'utf-8',
      timeout: 30000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const localSha = execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    const remoteSha = execFileSync('git', ['rev-parse', `origin/${branch}`], {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return localSha === remoteSha;
  } catch {
    return false;
  }
}
