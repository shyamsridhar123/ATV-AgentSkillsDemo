/**
 * Land Command — Partial session completion automation
 *
 * `npx beth-copilot land` automates the **git-mechanical** portion of the
 * "Landing the Plane" checklist defined in AGENTS.md. It does NOT replace
 * the full checklist — several steps require agent judgment and are left
 * to the caller.
 *
 * What this command handles:
 *   1. Verify we're on an epic branch (not main/master)
 *   2. Run quality gates (npm test)
 *   3. Stage, commit, and push to origin
 *   4. Report final status
 *
 * What this command does NOT handle (manual / agent responsibility):
 *   - Updating Backlog.md           (task tracking)
 *   - Generating test gate report   (`npm run test:gate`)
 *   - Creating a PR to main         (`gh pr create` or GitHub MCP)
 *
 * See AGENTS.md → "Landing the Plane (Session Completion)" for the full
 * checklist. Agents should complete the manual steps before or after
 * invoking this command.
 *
 * Options:
 *   --skip-tests    Skip test execution (not recommended)
 *   --message, -m   Custom commit message (default: "<epic-id>: session work")
 *   --force         Push even if tests fail (DANGEROUS)
 *   --dry-run       Show what would happen without executing
 */

import {
  getCurrentBranch,
  extractEpicId,
  isProtectedBranch,
  hasUncommittedChanges,
  hasStagedChanges,
  hasUnpushedCommits,
  runTests,
  gitAddAll,
  gitCommit,
  remoteBranchExists,
  gitRebaseAbort,
  gitPullRebase,
  gitPush,
  isUpToDateWithOrigin,
} from '../lib/gitHelpers.js';

// Re-export shared helpers so existing consumers (tests) don't break
export {
  getCurrentBranch,
  extractEpicId,
  isProtectedBranch,
  hasUncommittedChanges,
  hasStagedChanges,
  hasUnpushedCommits,
  runTests,
  gitAddAll,
  gitCommit,
  remoteBranchExists,
  gitRebaseAbort,
  gitPullRebase,
  gitPush,
  isUpToDateWithOrigin,
};

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

/**
 * Parse land command arguments.
 */
export function parseLandArgs(rawArgs: string[]): LandOptions {
  const opts: LandOptions = {};

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];

    if (arg === '--skip-tests') {
      opts.skipTests = true;
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
  const { skipTests, message, force, dryRun } = options;

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

  // Step 3: Check for changes to commit
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

  // Step 4: Stage changes
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

  // Step 5: Commit
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

  // Step 6: Pull with rebase
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

  // Step 7: Push
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

  // Step 8: Verify
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
    console.log(`\n${COLORS.bright}Remaining manual steps (see AGENTS.md):${COLORS.reset}`);
    console.log(`${COLORS.dim}  1. Update Backlog.md               backlog task edit <id> -s "Done"${COLORS.reset}`);
    console.log(`${COLORS.dim}  2. Generate test gate report        npm run test:gate${COLORS.reset}`);
    if (epicId) {
      console.log(`${COLORS.dim}  3. Create a PR to main             gh pr create --base main --head ${branch}${COLORS.reset}`);
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
