/**
 * Land Command — Automated session completion
 *
 * `npx beth-copilot land` orchestrates the "landing the plane" checklist:
 * 1. Verify we're on an epic branch (not main/master)
 * 2. Run quality gates (npm test)
 * 3. Backup beads data (bd backup)
 * 4. Stage, commit, and push to origin
 * 5. Report final status
 *
 * Options:
 *   --skip-tests    Skip test execution (not recommended)
 *   --skip-backup   Skip beads backup
 *   --message, -m   Custom commit message (default: "<epic-id>: session work")
 *   --force         Push even if tests fail (DANGEROUS)
 *   --dry-run       Show what would happen without executing
 */

import { execFileSync } from 'child_process';

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

export interface LandOptions {
  skipTests?: boolean;
  skipBackup?: boolean;
  message?: string;
  force?: boolean;
  dryRun?: boolean;
}

export interface LandStepResult {
  step: string;
  status: 'pass' | 'fail' | 'skip' | 'warn';
  message: string;
  details?: string;
}

export interface LandResult {
  success: boolean;
  steps: LandStepResult[];
  branch?: string;
  epicId?: string;
}

// Protected branches — cannot land from these
const PROTECTED_BRANCHES = ['main', 'master'];

// Epic branch pattern: epic/<rig>-<hash>
const EPIC_BRANCH_PATTERN = /^epic\/([a-z]+-[a-z0-9]+)$/;

/**
 * Parse land command arguments.
 */
export function parseLandArgs(rawArgs: string[]): LandOptions {
  const opts: LandOptions = {};

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];

    if (arg === '--skip-tests') {
      opts.skipTests = true;
    } else if (arg === '--skip-backup') {
      opts.skipBackup = true;
    } else if (arg === '--force' || arg === '-f') {
      opts.force = true;
    } else if (arg === '--dry-run') {
      opts.dryRun = true;
    } else if (arg === '--message' || arg === '-m') {
      opts.message = rawArgs[++i];
    } else if (arg.startsWith('--message=')) {
      opts.message = arg.slice('--message='.length);
    }
  }

  return opts;
}

/**
 * Get the current git branch name.
 * Returns null if not in a git repo or detached HEAD.
 */
export function getCurrentBranch(): string | null {
  try {
    const output = execFileSync('git', ['branch', '--show-current'], {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const branch = output.trim();
    return branch.length > 0 ? branch : null;
  } catch {
    return null;
  }
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
 * Check if a branch is a protected branch (main/master).
 */
export function isProtectedBranch(branch: string): boolean {
  return PROTECTED_BRANCHES.includes(branch);
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
    // exit 1 means there are diffs; any other error is unexpected
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
    // First check if origin/<branch> exists
    execFileSync('git', ['show-ref', '--verify', '--quiet', `refs/remotes/origin/${branch}`], {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    // If it exists, check for unpushed commits
    const output = execFileSync('git', ['log', `origin/${branch}..HEAD`, '--oneline'], {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return output.trim().length > 0;
  } catch {
    // If origin/<branch> doesn't exist, all local commits are unpushed
    return true;
  }
}

/**
 * Run npm test and return pass/fail with output.
 */
export function runTests(): { passed: boolean; output: string } {
  try {
    const output = execFileSync('npm', ['test'], {
      encoding: 'utf-8',
      timeout: 300000, // 5 minutes max
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
 * Run beads backup (bd backup).
 */
export function runBeadsBackup(): { success: boolean; output: string } {
  try {
    const output = execFileSync('bd', ['backup'], {
      encoding: 'utf-8',
      timeout: 30000,
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
    // Compare local HEAD with the fetched remote ref directly.
    // Using git status --branch is unreliable when no upstream tracking is set
    // (it omits ahead/behind, falsely appearing "up to date").
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

// ─── Step Execution ──────────────────────────────────────────────────────────

/**
 * Execute a single step with logging and dry-run support.
 */
function executeStep(
  stepName: string,
  dryRun: boolean,
  fn: () => LandStepResult,
): LandStepResult {
  if (dryRun) {
    const result: LandStepResult = {
      step: stepName,
      status: 'skip',
      message: `[DRY RUN] Would execute: ${stepName}`,
    };
    logStep(result);
    return result;
  }

  const result = fn();
  logStep(result);
  return result;
}

function logStep(result: LandStepResult): void {
  const icon = result.status === 'pass'
    ? `${COLORS.green}✓`
    : result.status === 'fail'
      ? `${COLORS.red}✗`
      : result.status === 'warn'
        ? `${COLORS.yellow}⚠`
        : `${COLORS.dim}○`;

  console.log(`${icon} ${COLORS.bright}${result.step}${COLORS.reset}: ${result.message}`);

  if (result.details) {
    console.log(`  ${COLORS.dim}${result.details}${COLORS.reset}`);
  }
}

// ─── Main Command ────────────────────────────────────────────────────────────

/**
 * Execute the full landing sequence.
 * Returns structured result for programmatic use.
 */
export function executeLanding(options: LandOptions = {}): LandResult {
  const steps: LandStepResult[] = [];
  const { skipTests, skipBackup, message, force, dryRun } = options;

  console.log(`\n${COLORS.bright}${COLORS.cyan}━━━ Landing the Plane ━━━${COLORS.reset}\n`);

  if (dryRun) {
    console.log(`${COLORS.yellow}[DRY RUN] No changes will be made.${COLORS.reset}\n`);
  }

  // Step 1: Verify branch
  const branch = getCurrentBranch();
  if (!branch) {
    steps.push({
      step: 'Branch check',
      status: 'fail',
      message: 'Not in a git repository or detached HEAD',
    });
    logStep(steps[0]);
    return { success: false, steps };
  }

  if (isProtectedBranch(branch)) {
    steps.push({
      step: 'Branch check',
      status: 'fail',
      message: `Cannot land from protected branch '${branch}'. Use an epic branch.`,
    });
    logStep(steps[0]);
    return { success: false, steps };
  }

  const epicId = extractEpicId(branch);
  if (!epicId) {
    steps.push({
      step: 'Branch check',
      status: 'warn',
      message: `Branch '${branch}' doesn't follow epic/<id> convention`,
      details: 'Continuing anyway, but commits won\'t have epic prefix',
    });
  } else {
    steps.push({
      step: 'Branch check',
      status: 'pass',
      message: `On epic branch: ${branch} (epic: ${epicId})`,
    });
  }
  logStep(steps[steps.length - 1]);

  // Step 2: Run tests
  if (skipTests) {
    const step: LandStepResult = {
      step: 'Tests',
      status: 'skip',
      message: 'Skipped (--skip-tests)',
    };
    steps.push(step);
    logStep(step);
  } else {
    const testStep = executeStep('Tests', !!dryRun, () => {
      console.log(`  ${COLORS.dim}Running npm test...${COLORS.reset}`);
      const { passed, output } = runTests();
      if (passed) {
        // Extract test count from output if possible
        const countMatch = output.match(/(\d+)\s+(?:tests?\s+)?pass/i);
        const count = countMatch ? ` (${countMatch[1]} passed)` : '';
        return {
          step: 'Tests',
          status: 'pass',
          message: `All tests passed${count}`,
        };
      }
      return {
        step: 'Tests',
        status: 'fail',
        message: 'Tests failed',
        details: output.split('\n').slice(-5).join('\n'),
      };
    });
    steps.push(testStep);

    if (testStep.status === 'fail' && !force) {
      console.log(`\n${COLORS.red}✗ Landing aborted — tests must pass before pushing.${COLORS.reset}`);
      console.log(`${COLORS.yellow}  Fix the failures, or use --force to push anyway (DANGEROUS).${COLORS.reset}\n`);
      return { success: false, steps, branch, epicId: epicId ?? undefined };
    }
    if (testStep.status === 'fail' && force) {
      console.log(`\n${COLORS.yellow}⚠ Tests failed but --force was specified. Continuing...${COLORS.reset}\n`);
    }
  }

  // Step 3: Beads backup
  if (skipBackup) {
    const step: LandStepResult = {
      step: 'Beads backup',
      status: 'skip',
      message: 'Skipped (--skip-backup)',
    };
    steps.push(step);
    logStep(step);
  } else {
    const backupStep = executeStep('Beads backup', !!dryRun, () => {
      const { success } = runBeadsBackup();
      if (success) {
        return {
          step: 'Beads backup',
          status: 'pass',
          message: 'Beads data backed up',
        };
      }
      return {
        step: 'Beads backup',
        status: 'warn',
        message: 'Beads backup failed (bd not available or no data)',
        details: 'Non-blocking — continuing with landing',
      };
    });
    steps.push(backupStep);
  }

  // Step 4: Check for changes to commit
  const hasChanges = hasUncommittedChanges();
  const unpushed = hasUnpushedCommits(branch);

  if (!hasChanges && !unpushed) {
    const step: LandStepResult = {
      step: 'Git status',
      status: 'pass',
      message: 'Working tree clean, nothing to push',
    };
    steps.push(step);
    logStep(step);
    console.log(`\n${COLORS.green}✓ Already up to date. Nothing to land.${COLORS.reset}\n`);
    return { success: true, steps, branch, epicId: epicId ?? undefined };
  }

  // Step 5: Stage changes
  if (hasChanges) {
    const stageStep = executeStep('Stage changes', !!dryRun, () => {
      if (gitAddAll()) {
        return {
          step: 'Stage changes',
          status: 'pass',
          message: 'All changes staged (git add -A)',
        };
      }
      return {
        step: 'Stage changes',
        status: 'fail',
        message: 'Failed to stage changes',
      };
    });
    steps.push(stageStep);

    if (stageStep.status === 'fail') {
      return { success: false, steps, branch, epicId: epicId ?? undefined };
    }
  }

  // Step 6: Commit
  if (hasChanges) {
    const commitMsg = message || `${epicId ? epicId + ': ' : ''}session work`;
    const commitStep = executeStep('Commit', !!dryRun, () => {
      if (gitCommit(commitMsg)) {
        return {
          step: 'Commit',
          status: 'pass',
          message: `Committed: "${commitMsg}"`,
        };
      }
      // Could fail if nothing to commit after staging
      return {
        step: 'Commit',
        status: 'warn',
        message: 'Nothing to commit (changes may already be committed)',
      };
    });
    steps.push(commitStep);
  }

  // Step 7: Pull with rebase
  const pullStep = executeStep('Pull rebase', !!dryRun, () => {
    if (!remoteBranchExists(branch)) {
      return {
        step: 'Pull rebase',
        status: 'warn',
        message: `No remote branch origin/${branch} yet (new branch, will be created on push)`,
      };
    }
    const { success, output } = gitPullRebase(branch);
    if (success) {
      return {
        step: 'Pull rebase',
        status: 'pass',
        message: `Rebased on origin/${branch}`,
      };
    }
    // Remote exists but rebase failed — likely a conflict. Abort the rebase to restore clean state.
    gitRebaseAbort();
    return {
      step: 'Pull rebase',
      status: 'fail',
      message: `Rebase conflict with origin/${branch} — landing aborted. Resolve conflicts manually.`,
      details: output.split('\n').slice(0, 5).join('\n'),
    };
  });
  steps.push(pullStep);

  if (pullStep.status === 'fail') {
    console.log(`\n${COLORS.red}✗ Rebase conflict detected. Resolve conflicts and retry: git pull origin ${branch} --rebase${COLORS.reset}\n`);
    return { success: false, steps, branch, epicId: epicId ?? undefined };
  }

  // Step 8: Push
  const pushStep = executeStep('Push', !!dryRun, () => {
    const { success, output } = gitPush(branch);
    if (success) {
      return {
        step: 'Push',
        status: 'pass',
        message: `Pushed to origin/${branch}`,
      };
    }
    return {
      step: 'Push',
      status: 'fail',
      message: `Push to origin/${branch} failed`,
      details: output,
    };
  });
  steps.push(pushStep);

  if (pushStep.status === 'fail') {
    console.log(`\n${COLORS.red}✗ Push failed. Resolve and retry: git push origin ${branch}${COLORS.reset}\n`);
    return { success: false, steps, branch, epicId: epicId ?? undefined };
  }

  // Step 9: Verify
  if (!dryRun) {
    const verifyStep: LandStepResult = (() => {
      if (isUpToDateWithOrigin(branch)) {
        return {
          step: 'Verify',
          status: 'pass' as const,
          message: `Branch is up to date with origin/${branch}`,
        };
      }
      return {
        step: 'Verify',
        status: 'warn' as const,
        message: 'Branch may not be fully synced — check manually',
      };
    })();
    steps.push(verifyStep);
    logStep(verifyStep);
  }

  // Summary
  const failed = steps.filter((s) => s.status === 'fail').length;
  const warnings = steps.filter((s) => s.status === 'warn').length;

  console.log(`\n${COLORS.bright}${COLORS.cyan}━━━ Landing Summary ━━━${COLORS.reset}`);
  if (failed === 0) {
    console.log(`${COLORS.green}✓ Landed successfully on ${branch}${COLORS.reset}`);
    if (epicId) {
      console.log(`${COLORS.dim}  Next: Create a PR to main via GitHub MCP${COLORS.reset}`);
    }
  } else {
    console.log(`${COLORS.red}✗ Landing incomplete — ${failed} step(s) failed${COLORS.reset}`);
  }
  if (warnings > 0) {
    console.log(`${COLORS.yellow}  ${warnings} warning(s)${COLORS.reset}`);
  }
  console.log('');

  return {
    success: failed === 0,
    steps,
    branch,
    epicId: epicId ?? undefined,
  };
}

/**
 * Main land command entry point.
 * Called from CLI routing with raw args after 'land'.
 */
export async function land(rawArgs: string[]): Promise<void> {
  const options = parseLandArgs(rawArgs);
  const result = executeLanding(options);

  if (!result.success) {
    process.exit(1);
  }
}
