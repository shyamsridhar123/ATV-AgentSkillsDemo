/**
 * E2E tests for beads (bd) CLI commands that Beth depends on.
 *
 * Tests the full lifecycle of bd commands: create, show, list, update,
 * close, ready, dep, children, and epic workflows.
 *
 * These tests run against the REAL beads database. All test issues are
 * cleaned up in afterAll via batch deletion. A beforeAll safety net also
 * removes stale "E2E test:" issues from previous failed runs to prevent
 * pollution of `bd list` and `bd ready` output.
 *
 * Run with: npx tsx --test src/cli/commands/beads.e2e.test.ts
 */

import { describe, it, beforeAll, afterAll } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';

const PROJECT_ROOT = process.cwd();

/** Track all issue IDs created during tests for cleanup */
const createdIssueIds: string[] = [];

/**
 * Find and delete stale E2E test issues from previous failed runs.
 * This is the safety net — if afterAll didn't run (crash, timeout, kill),
 * these orphans get cleaned up on the next run.
 */
function cleanupStaleTestIssues(): void {
  try {
    const output = execSync('bd list -n 500 --json --sandbox', {
      cwd: PROJECT_ROOT,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 15000,
    });
    const issues = JSON.parse(output) as Array<{ id: string; title: string }>;
    const staleIds = issues
      .filter((i) => i.title.startsWith('E2E test:'))
      .map((i) => i.id);

    if (staleIds.length > 0) {
      // Batch delete via --from-file for speed
      const tmpFile = join(PROJECT_ROOT, '.beads-e2e-cleanup.tmp');
      writeFileSync(tmpFile, staleIds.join('\n'));
      try {
        execSync(`bd delete --from-file "${tmpFile}" --force --sandbox`, {
          cwd: PROJECT_ROOT,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
          timeout: 30000,
        });
      } catch {
        // Best effort — some may already be deleted
      }
      try { unlinkSync(tmpFile); } catch { /* ignore */ }
    }
  } catch {
    // If bd list fails, skip cleanup — tests will still create fresh issues
  }
}

/**
 * Batch-delete all tracked test issues. Uses --from-file for efficiency.
 */
function batchDeleteTestIssues(ids: string[]): void {
  if (ids.length === 0) return;

  // Close all first (reverse order for children-before-parents)
  for (const id of [...ids].reverse()) {
    try {
      execSync(`bd close ${id} --force --reason "test cleanup" --sandbox`, {
        cwd: PROJECT_ROOT,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 10000,
      });
    } catch { /* already closed or doesn't exist */ }
  }

  // Then batch delete via temp file
  const tmpFile = join(PROJECT_ROOT, '.beads-e2e-cleanup.tmp');
  writeFileSync(tmpFile, [...ids].reverse().join('\n'));
  try {
    execSync(`bd delete --from-file "${tmpFile}" --force --sandbox`, {
      cwd: PROJECT_ROOT,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 30000,
    });
  } catch { /* best effort */ }
  try { unlinkSync(tmpFile); } catch { /* ignore */ }
}

/**
 * Run a bd command and return stdout. Uses --sandbox to prevent auto-sync.
 * Throws on non-zero exit unless expectFailure is true.
 */
function bd(args: string, opts?: { expectFailure?: boolean }): string {
  const cmd = `bd ${args} --sandbox`;
  try {
    return execSync(cmd, {
      cwd: PROJECT_ROOT,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NO_COLOR: '1' },
      timeout: 15000,
    }).trim();
  } catch (error: unknown) {
    if (opts?.expectFailure) {
      const execError = error as { stdout?: string; stderr?: string; status?: number };
      return (execError.stdout || '') + (execError.stderr || '');
    }
    throw error;
  }
}

/**
 * Run a bd command with --json and parse the result.
 */
function bdJson(args: string): unknown {
  const output = bd(`${args} --json`);
  return JSON.parse(output);
}

/**
 * Create a test issue and track it for cleanup.
 * Returns the issue ID extracted from bd create output.
 */
function createTestIssue(args: string): string {
  const output = bd(`create ${args}`);
  const match = output.match(/Created issue:\s+([\w.-]+)/);
  assert.ok(match, `Expected issue ID in create output: ${output}`);
  const id = match[1];
  createdIssueIds.push(id);
  return id;
}

// ============================================================================
// Preflight: verify bd is available
// ============================================================================

describe('beads CLI E2E tests', () => {
  beforeAll(() => {
    try {
      const version = execSync('bd --version', { encoding: 'utf-8', timeout: 5000 });
      assert.ok(version.includes('version'), 'bd CLI must be installed');
    } catch {
      throw new Error('bd CLI is not installed. These tests require beads. Run: curl -fsSL https://raw.githubusercontent.com/steveyegge/beads/main/scripts/install.sh | bash');
    }

    // Clean up stale test issues from previous failed runs
    cleanupStaleTestIssues();
  });

  afterAll(() => {
    batchDeleteTestIssues(createdIssueIds);
  });

  // ==========================================================================
  // bd create
  // ==========================================================================

  describe('bd create', () => {
    it('creates a basic task with title', () => {
      const id = createTestIssue('"E2E test: basic task"');
      assert.ok(id.startsWith('beth-'), `Issue ID should start with project prefix: ${id}`);
    });

    it('creates with priority flag', () => {
      const id = createTestIssue('"E2E test: priority task" -p 0');
      const issues = bdJson(`show ${id}`) as Array<{ priority: number }>;
      assert.strictEqual(issues[0].priority, 0, 'Priority should be 0 (critical)');
    });

    it('creates with description', () => {
      const id = createTestIssue('"E2E test: described task" -d "This is a test description"');
      const issues = bdJson(`show ${id}`) as Array<{ description: string }>;
      assert.ok(issues[0].description.includes('test description'), 'Description should be set');
    });

    it('creates with type flag', () => {
      const id = createTestIssue('"E2E test: bug type" --type bug');
      const issues = bdJson(`show ${id}`) as Array<{ issue_type: string }>;
      assert.strictEqual(issues[0].issue_type, 'bug', 'Type should be bug');
    });

    it('creates an epic', () => {
      const id = createTestIssue('"E2E test: epic" --type epic -p 1');
      const issues = bdJson(`show ${id}`) as Array<{ issue_type: string; priority: number }>;
      assert.strictEqual(issues[0].issue_type, 'epic', 'Type should be epic');
      assert.strictEqual(issues[0].priority, 1, 'Priority should be P1');
    });

    it('creates a child task with --parent', () => {
      const epicId = createTestIssue('"E2E test: parent epic" --type epic');
      const childId = createTestIssue(`"E2E test: child task" --parent ${epicId}`);
      assert.ok(childId.includes('.'), `Child ID should be hierarchical (contain dot): ${childId}`);
    });

    it('creates with labels', () => {
      const id = createTestIssue('"E2E test: labeled task" -l test-label,e2e');
      const issues = bdJson(`show ${id}`) as Array<{ labels?: string[] }>;
      const labels = issues[0].labels || [];
      assert.ok(labels.includes('test-label'), 'Should have test-label');
      assert.ok(labels.includes('e2e'), 'Should have e2e label');
    });

    it('creates with dependency', () => {
      const blockerId = createTestIssue('"E2E test: blocker"');
      const blockedId = createTestIssue(`"E2E test: blocked" --deps "${blockerId}"`);
      const issues = bdJson(`show ${blockedId}`) as Array<{ dependencies?: Array<{ id: string; dependency_type: string }> }>;
      const deps = issues[0].dependencies || [];
      const hasBlocker = deps.some(d => d.id === blockerId);
      assert.ok(hasBlocker, `Should depend on ${blockerId}`);
    });
  });

  // ==========================================================================
  // bd show
  // ==========================================================================

  describe('bd show', () => {
    it('shows issue details in JSON', () => {
      const id = createTestIssue('"E2E test: show me" -d "Show test description"');
      const issues = bdJson(`show ${id}`) as Array<{
        id: string;
        title: string;
        status: string;
        description: string;
      }>;
      assert.strictEqual(issues.length, 1, 'Should return exactly one issue');
      assert.strictEqual(issues[0].id, id);
      assert.strictEqual(issues[0].title, 'E2E test: show me');
      assert.strictEqual(issues[0].status, 'open');
      assert.ok(issues[0].description.includes('Show test description'));
    });

    it('shows children with --children flag', () => {
      const epicId = createTestIssue('"E2E test: parent for show" --type epic');
      const child1 = createTestIssue(`"E2E test: child 1" --parent ${epicId}`);
      const child2 = createTestIssue(`"E2E test: child 2" --parent ${epicId}`);
      // bd children returns a JSON array; show --children returns { id: [...] }
      const children = bdJson(`children ${epicId}`) as Array<{ id: string }>;
      const childIds = children.map(c => c.id);
      assert.ok(childIds.includes(child1), `Should include ${child1}`);
      assert.ok(childIds.includes(child2), `Should include ${child2}`);
    });

    it('shows multiple issues at once', () => {
      const id1 = createTestIssue('"E2E test: multi-show 1"');
      const id2 = createTestIssue('"E2E test: multi-show 2"');
      const issues = bdJson(`show ${id1} ${id2}`) as Array<{ id: string }>;
      assert.strictEqual(issues.length, 2, 'Should return two issues');
    });
  });

  // ==========================================================================
  // bd list
  // ==========================================================================

  describe('bd list', () => {
    it('lists open issues as JSON array', () => {
      const issues = bdJson('list') as Array<{ id: string; status: string }>;
      assert.ok(Array.isArray(issues), 'Should return an array');
      // All listed issues should be open (default filter)
      for (const issue of issues) {
        assert.strictEqual(issue.status, 'open', `Listed issue ${issue.id} should be open`);
      }
    });

    it('respects --limit flag', () => {
      const issues = bdJson('list --limit 2') as Array<{ id: string }>;
      assert.ok(issues.length <= 2, `Should return at most 2 issues, got ${issues.length}`);
    });

    it('filters by type', () => {
      createTestIssue('"E2E test: list-by-type epic" --type epic');
      const issues = bdJson('list --type epic') as Array<{ issue_type: string }>;
      for (const issue of issues) {
        assert.strictEqual(issue.issue_type, 'epic', `All listed should be epics`);
      }
    });

    it('filters by priority', () => {
      createTestIssue('"E2E test: list-by-priority" -p 0');
      const issues = bdJson('list --priority 0') as Array<{ priority: number }>;
      for (const issue of issues) {
        assert.strictEqual(issue.priority, 0, `All listed should be P0`);
      }
    });

    it('shows all including closed with --all', () => {
      const id = createTestIssue('"E2E test: will close for list"');
      bd(`close ${id} --reason "testing list --all"`);
      const allIssues = bdJson('list --all --limit 50') as Array<{ id: string; status: string }>;
      const closedOnes = allIssues.filter(i => i.status === 'closed');
      assert.ok(closedOnes.length > 0, 'Should include closed issues');
    });
  });

  // ==========================================================================
  // bd update
  // ==========================================================================

  describe('bd update', () => {
    it('updates title', () => {
      const id = createTestIssue('"E2E test: original title"');
      bd(`update ${id} --title "E2E test: updated title"`);
      const issues = bdJson(`show ${id}`) as Array<{ title: string }>;
      assert.strictEqual(issues[0].title, 'E2E test: updated title');
    });

    it('updates priority', () => {
      const id = createTestIssue('"E2E test: update priority" -p 3');
      bd(`update ${id} -p 0`);
      const issues = bdJson(`show ${id}`) as Array<{ priority: number }>;
      assert.strictEqual(issues[0].priority, 0);
    });

    it('updates status', () => {
      const id = createTestIssue('"E2E test: update status"');
      bd(`update ${id} -s in_progress`);
      const issues = bdJson(`show ${id}`) as Array<{ status: string }>;
      assert.strictEqual(issues[0].status, 'in_progress');
    });

    it('claims an issue atomically', () => {
      const id = createTestIssue('"E2E test: claimable"');
      bd(`update ${id} --claim`);
      const issues = bdJson(`show ${id}`) as Array<{ status: string; owner: string }>;
      assert.strictEqual(issues[0].status, 'in_progress', 'Claimed issue should be in_progress');
      assert.ok(issues[0].owner, 'Claimed issue should have an owner');
    });

    it('adds and removes labels', () => {
      const id = createTestIssue('"E2E test: label management"');
      bd(`update ${id} --add-label foo,bar`);
      let issues = bdJson(`show ${id}`) as Array<{ labels?: string[] }>;
      assert.ok((issues[0].labels || []).includes('foo'), 'Should have foo label');

      bd(`update ${id} --remove-label foo`);
      issues = bdJson(`show ${id}`) as Array<{ labels?: string[] }>;
      assert.ok(!(issues[0].labels || []).includes('foo'), 'foo label should be removed');
      assert.ok((issues[0].labels || []).includes('bar'), 'bar label should remain');
    });

    it('updates description', () => {
      const id = createTestIssue('"E2E test: update desc"');
      bd(`update ${id} -d "New description content"`);
      const issues = bdJson(`show ${id}`) as Array<{ description: string }>;
      assert.ok(issues[0].description.includes('New description content'));
    });
  });

  // ==========================================================================
  // bd close
  // ==========================================================================

  describe('bd close', () => {
    it('closes an issue', () => {
      const id = createTestIssue('"E2E test: close me"');
      bd(`close ${id}`);
      const issues = bdJson(`show ${id}`) as Array<{ status: string }>;
      assert.strictEqual(issues[0].status, 'closed');
    });

    it('closes with a reason', () => {
      const id = createTestIssue('"E2E test: close with reason"');
      bd(`close ${id} --reason "Work completed successfully"`);
      const issues = bdJson(`show ${id}`) as Array<{ status: string }>;
      assert.strictEqual(issues[0].status, 'closed');
    });

    it('closed issues disappear from default list', () => {
      const id = createTestIssue('"E2E test: vanish from list"');
      bd(`close ${id}`);
      const openIssues = bdJson('list') as Array<{ id: string }>;
      const found = openIssues.find(i => i.id === id);
      assert.strictEqual(found, undefined, 'Closed issue should not appear in default list');
    });
  });

  // ==========================================================================
  // bd ready
  // ==========================================================================

  describe('bd ready', () => {
    it('returns only unblocked open issues', () => {
      const issues = bdJson('ready') as Array<{ id: string; status: string }>;
      assert.ok(Array.isArray(issues), 'Should return an array');
      for (const issue of issues) {
        assert.strictEqual(issue.status, 'open', `Ready issue ${issue.id} should be open`);
      }
    });

    it('excludes blocked issues', () => {
      const blockerId = createTestIssue('"E2E test: ready-blocker"');
      const blockedId = createTestIssue(`"E2E test: ready-blocked" --deps "${blockerId}"`);
      const readyIssues = bdJson('ready --limit 500') as Array<{ id: string }>;
      const readyIds = readyIssues.map(i => i.id);
      assert.ok(!readyIds.includes(blockedId), `Blocked issue ${blockedId} should not be ready`);
      assert.ok(readyIds.includes(blockerId), `Blocker ${blockerId} should be ready`);
    });

    it('unblocks issues after closing blocker', () => {
      const blockerId = createTestIssue('"E2E test: unblock-blocker"');
      const blockedId = createTestIssue(`"E2E test: unblock-blocked" --deps "${blockerId}"`);

      // Before: blocked issue NOT ready
      let readyIssues = bdJson('ready --limit 500') as Array<{ id: string }>;
      assert.ok(!readyIssues.map(i => i.id).includes(blockedId), 'Should be blocked initially');

      // Close the blocker
      bd(`close ${blockerId}`);

      // After: previously blocked issue IS now ready
      readyIssues = bdJson('ready --limit 500') as Array<{ id: string }>;
      assert.ok(readyIssues.map(i => i.id).includes(blockedId), 'Should become ready after blocker closes');
    });

    it('excludes in_progress issues', () => {
      const id = createTestIssue('"E2E test: ready-in-progress"');
      bd(`update ${id} --claim`);
      const readyIssues = bdJson('ready --limit 500') as Array<{ id: string }>;
      const readyIds = readyIssues.map(i => i.id);
      assert.ok(!readyIds.includes(id), 'In-progress issue should not appear in ready');
    });
  });

  // ==========================================================================
  // bd dep (dependencies)
  // ==========================================================================

  describe('bd dep', () => {
    it('adds a blocking dependency', () => {
      const blockerId = createTestIssue('"E2E test: dep-blocker"');
      const blockedId = createTestIssue('"E2E test: dep-blocked"');
      bd(`dep ${blockerId} --blocks ${blockedId}`);

      const issues = bdJson(`show ${blockedId}`) as Array<{ dependencies?: Array<{ id: string; dependency_type: string }> }>;
      const deps = issues[0].dependencies || [];
      const hasBlocker = deps.some(d => d.id === blockerId);
      assert.ok(hasBlocker, `${blockedId} should depend on ${blockerId}`);
    });

    it('shows dependency tree', () => {
      const epicId = createTestIssue('"E2E test: dep-tree epic" --type epic');
      const task1 = createTestIssue(`"E2E test: dep-tree t1" --parent ${epicId}`);
      const task2 = createTestIssue(`"E2E test: dep-tree t2" --parent ${epicId} --deps "${task1}"`);

      // dep tree for task2 shows task2 and its blocker task1
      const tree = bd(`dep tree ${task2}`);
      assert.ok(tree.includes(task2), 'Tree should include task 2');
      assert.ok(tree.includes(task1) || tree.includes('dep-tree t1'), 'Tree should include blocker task 1');
    });

    it('detects dependency cycles', () => {
      // bd dep cycles returns output about any cycles in the entire database
      // This just verifies the command runs without crashing
      const output = bd('dep cycles');
      assert.ok(typeof output === 'string', 'dep cycles should return output');
    });

    it('removes a dependency', () => {
      const blockerId = createTestIssue('"E2E test: dep-remove-blocker"');
      const blockedId = createTestIssue(`"E2E test: dep-remove-blocked" --deps "${blockerId}"`);

      // Verify dep exists
      let issues = bdJson(`show ${blockedId}`) as Array<{ dependencies?: Array<{ id: string }> }>;
      assert.ok((issues[0].dependencies || []).some(d => d.id === blockerId), 'Dep should exist');

      // Remove it
      bd(`dep remove ${blockedId} ${blockerId}`);

      // Verify dep is gone
      issues = bdJson(`show ${blockedId}`) as Array<{ dependencies?: Array<{ id: string }> }>;
      const remaining = (issues[0].dependencies || []).filter(d => d.id === blockerId);
      assert.strictEqual(remaining.length, 0, 'Dependency should be removed');
    });
  });

  // ==========================================================================
  // bd children
  // ==========================================================================

  describe('bd children', () => {
    it('lists children of an epic', () => {
      const epicId = createTestIssue('"E2E test: children-epic" --type epic');
      const child1 = createTestIssue(`"E2E test: children-c1" --parent ${epicId}`);
      const child2 = createTestIssue(`"E2E test: children-c2" --parent ${epicId}`);

      const children = bdJson(`children ${epicId}`) as Array<{ id: string }>;
      const childIds = children.map(c => c.id);
      assert.ok(childIds.includes(child1), `Should include ${child1}`);
      assert.ok(childIds.includes(child2), `Should include ${child2}`);
    });

    it('returns empty array for issue with no children', () => {
      const id = createTestIssue('"E2E test: no-children"');
      const children = bdJson(`children ${id}`) as Array<{ id: string }>;
      assert.strictEqual(children.length, 0, 'Should have no children');
    });
  });

  // ==========================================================================
  // Epic lifecycle (full workflow)
  // ==========================================================================

  describe('epic lifecycle', () => {
    it('runs the full Beth orchestration workflow', { timeout: 120000 }, () => {
      // 1. Create an epic
      const epicId = createTestIssue('"E2E test: lifecycle epic" --type epic -p 1');

      // 2. Create subtasks with dependencies (sequential chain)
      const task1 = createTestIssue(`"E2E test: lifecycle requirements" --parent ${epicId}`);
      const task2 = createTestIssue(`"E2E test: lifecycle design" --parent ${epicId} --deps "${task1}"`);
      const task3 = createTestIssue(`"E2E test: lifecycle implement" --parent ${epicId} --deps "${task2}"`);

      // 3. Verify dependency chain — only task1 should be ready
      let ready = bdJson('ready --limit 500') as Array<{ id: string }>;
      let readyIds = ready.map(r => r.id);
      assert.ok(readyIds.includes(task1), 'Task 1 should be ready (no blockers)');
      assert.ok(!readyIds.includes(task2), 'Task 2 should be blocked by task 1');
      assert.ok(!readyIds.includes(task3), 'Task 3 should be blocked by task 2');

      // 4. Close task1 → task2 becomes ready
      bd(`close ${task1} --reason "Requirements done"`);
      ready = bdJson('ready --limit 500') as Array<{ id: string }>;
      readyIds = ready.map(r => r.id);
      assert.ok(readyIds.includes(task2), 'Task 2 should be ready after task 1 closed');
      assert.ok(!readyIds.includes(task3), 'Task 3 should still be blocked');

      // 5. Close task2 → task3 becomes ready
      bd(`close ${task2} --reason "Design done"`);
      ready = bdJson('ready --limit 500') as Array<{ id: string }>;
      readyIds = ready.map(r => r.id);
      assert.ok(readyIds.includes(task3), 'Task 3 should be ready after task 2 closed');

      // 6. Close task3 → all children done
      bd(`close ${task3} --reason "Implementation done"`);

      // 7. Verify all children are closed
      const children = bdJson(`children ${epicId}`) as Array<{ id: string; status: string }>;
      for (const child of children) {
        assert.strictEqual(child.status, 'closed', `Child ${child.id} should be closed`);
      }

      // 8. Close the epic
      bd(`close ${epicId} --reason "All work complete"`);
      const epicData = bdJson(`show ${epicId}`) as Array<{ status: string }>;
      assert.strictEqual(epicData[0].status, 'closed', 'Epic should be closed');
    });

    it('supports parallel subtask pattern', () => {
      // Create epic with tasks that can run in parallel
      const epicId = createTestIssue('"E2E test: parallel epic" --type epic');
      const implTask = createTestIssue(`"E2E test: parallel impl" --parent ${epicId}`);
      // Security and test tasks depend on impl but NOT on each other
      const secTask = createTestIssue(`"E2E test: parallel security" --parent ${epicId} --deps "${implTask}"`);
      const testTask = createTestIssue(`"E2E test: parallel testing" --parent ${epicId} --deps "${implTask}"`);

      // Only impl should be ready
      let ready = bdJson('ready --limit 500') as Array<{ id: string }>;
      let readyIds = ready.map(r => r.id);
      assert.ok(readyIds.includes(implTask), 'Impl should be ready');
      assert.ok(!readyIds.includes(secTask), 'Security should be blocked');
      assert.ok(!readyIds.includes(testTask), 'Testing should be blocked');

      // Close impl → BOTH security and testing become ready (parallel)
      bd(`close ${implTask}`);
      ready = bdJson('ready --limit 500') as Array<{ id: string }>;
      readyIds = ready.map(r => r.id);
      assert.ok(readyIds.includes(secTask), 'Security should be ready after impl closes');
      assert.ok(readyIds.includes(testTask), 'Testing should be ready after impl closes (parallel)');
    });
  });

  // ==========================================================================
  // Error handling
  // ==========================================================================

  describe('error handling', () => {
    it('fails gracefully on invalid issue ID', () => {
      const output = bd('show nonexistent-999', { expectFailure: true });
      assert.ok(output.length > 0, 'Should produce error output');
    });

    it('bd close on already-closed issue fails or is idempotent', () => {
      const id = createTestIssue('"E2E test: double close"');
      bd(`close ${id}`);
      // Second close should either fail gracefully or be idempotent
      const output = bd(`close ${id}`, { expectFailure: true });
      assert.ok(typeof output === 'string', 'Should handle double-close');
    });

    it('bd create requires a title', () => {
      const output = bd('create', { expectFailure: true });
      assert.ok(output.length > 0, 'Should produce error when no title given');
    });
  });

  // ==========================================================================
  // bd reopen
  // ==========================================================================

  describe('bd reopen', () => {
    it('reopens a closed issue', () => {
      const id = createTestIssue('"E2E test: reopen me"');
      bd(`close ${id}`);
      let issues = bdJson(`show ${id}`) as Array<{ status: string }>;
      assert.strictEqual(issues[0].status, 'closed');

      bd(`reopen ${id}`);
      issues = bdJson(`show ${id}`) as Array<{ status: string }>;
      assert.strictEqual(issues[0].status, 'open', 'Reopened issue should be open');
    });
  });

  // ==========================================================================
  // bd blocked
  // ==========================================================================

  describe('bd blocked', () => {
    it('shows blocked issues', () => {
      const blockerId = createTestIssue('"E2E test: blocked-view-blocker"');
      const blockedId = createTestIssue(`"E2E test: blocked-view-target" --deps "${blockerId}"`);

      const output = bd('blocked');
      assert.ok(
        output.includes(blockedId) || output.includes('blocked-view-target'),
        'Blocked command should show the blocked issue',
      );
    });
  });

  // ==========================================================================
  // bd search
  // ==========================================================================

  describe('bd search', () => {
    it('finds issues by text query', () => {
      const uniqueMarker = `e2e-search-${Date.now()}`;
      createTestIssue(`"E2E test: ${uniqueMarker}"`);

      const output = bd(`search "${uniqueMarker}"`);
      assert.ok(output.includes(uniqueMarker), 'Search should find the issue by title text');
    });
  });

  // ==========================================================================
  // bd count
  // ==========================================================================

  describe('bd count', () => {
    it('counts open issues', () => {
      const output = bd('count');
      // count outputs a number (possibly with label text)
      assert.ok(/\d+/.test(output), 'Count should include a number');
    });
  });

  // ==========================================================================
  // bd status (database overview)
  // ==========================================================================

  describe('bd status', () => {
    it('shows database overview', () => {
      const output = bd('status');
      assert.ok(output.length > 0, 'Status should produce output');
    });
  });
});
