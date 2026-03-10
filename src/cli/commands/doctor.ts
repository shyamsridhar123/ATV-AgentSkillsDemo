/**
 * Doctor Command
 *
 * Checks system health and verifies Beth installation requirements:
 * - Node.js version (≥18)
 * - beads CLI available
 * - backlog.md CLI available
 * - .github/agents/ exists with valid frontmatter
 * - .github/skills/ exists
 * - Dolt database hygiene (orphaned test databases, database count)
 */

import { execSync } from 'child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import matter from 'gray-matter';

// Colors for terminal output
const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

interface DoctorOptions {
  verbose?: boolean;
}

interface CheckResult {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
  details?: string;
}

function log(message: string, color = ''): void {
  console.log(`${color}${message}${COLORS.reset}`);
}

function logResult(result: CheckResult, verbose: boolean): void {
  const icon = result.status === 'pass' ? '✓' : result.status === 'warn' ? '⚠' : '✗';
  const color = result.status === 'pass' ? COLORS.green : result.status === 'warn' ? COLORS.yellow : COLORS.red;
  
  log(`${icon} ${result.name}: ${result.message}`, color);
  
  if (verbose && result.details) {
    log(`    ${result.details}`, COLORS.dim);
  }
}

/**
 * Parse the minimum major Node.js version from package.json engines.node.
 * Supports formats like ">=18", "^18", ">=18.0.0", etc.
 * Returns the parsed major version, or a fallback if parsing fails.
 */
export function getMinNodeVersion(cwd: string): number {
  const fallback = 18;
  try {
    const pkg = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf-8'));
    const constraint = pkg?.engines?.node;
    if (typeof constraint !== 'string') return fallback;
    const match = constraint.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Check Node.js version against the minimum from package.json engines.node
 */
function checkNodeVersion(cwd: string): CheckResult {
  const version = process.version;
  const major = parseInt(version.slice(1).split('.')[0], 10);
  const minMajor = getMinNodeVersion(cwd);
  
  if (major >= minMajor) {
    return {
      name: 'Node.js',
      status: 'pass',
      message: `${version} (≥${minMajor} required)`,
    };
  }
  
  return {
    name: 'Node.js',
    status: 'fail',
    message: `${version} (≥${minMajor} required)`,
    details: 'Upgrade Node.js: https://nodejs.org/',
  };
}

/**
 * Check if a CLI tool is available
 */
function checkCli(name: string, command: string, installHint: string): CheckResult {
  try {
    const output = execSync(`${command} --version`, { 
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    
    return {
      name,
      status: 'pass',
      message: `installed (${output.split('\n')[0]})`,
    };
  } catch {
    return {
      name,
      status: 'fail',
      message: 'not found',
      details: `Install: ${installHint}`,
    };
  }
}

/**
 * Check .github/agents/ directory and validate frontmatter
 */
function checkAgents(cwd: string): CheckResult {
  const agentsDir = join(cwd, '.github', 'agents');
  
  if (!existsSync(agentsDir)) {
    return {
      name: 'Agents',
      status: 'fail',
      message: '.github/agents/ not found',
      details: 'Run: npx beth-copilot init',
    };
  }
  
  const agentFiles = readdirSync(agentsDir).filter(f => f.endsWith('.agent.md'));
  
  if (agentFiles.length === 0) {
    return {
      name: 'Agents',
      status: 'fail',
      message: 'no .agent.md files found',
      details: 'Run: npx beth-copilot init --force',
    };
  }
  
  // Validate frontmatter for each agent
  const errors: string[] = [];
  
  for (const file of agentFiles) {
    try {
      const content = readFileSync(join(agentsDir, file), 'utf-8');
      const { data } = matter(content);
      
      if (!data.name) {
        errors.push(`${file}: missing 'name' in frontmatter`);
      }
    } catch (e) {
      errors.push(`${file}: failed to parse - ${e instanceof Error ? e.message : 'unknown error'}`);
    }
  }
  
  if (errors.length > 0) {
    return {
      name: 'Agents',
      status: 'warn',
      message: `${agentFiles.length} agents, ${errors.length} with issues`,
      details: errors.join('; '),
    };
  }
  
  return {
    name: 'Agents',
    status: 'pass',
    message: `${agentFiles.length} agents configured`,
  };
}

/**
 * Check .github/skills/ directory
 */
function checkSkills(cwd: string): CheckResult {
  const skillsDir = join(cwd, '.github', 'skills');
  
  if (!existsSync(skillsDir)) {
    return {
      name: 'Skills',
      status: 'fail',
      message: '.github/skills/ not found',
      details: 'Run: npx beth-copilot init',
    };
  }
  
  const skillDirs = readdirSync(skillsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);
  
  if (skillDirs.length === 0) {
    return {
      name: 'Skills',
      status: 'warn',
      message: 'no skill directories found',
    };
  }
  
  // Check each skill has a SKILL.md
  const missingSkillMd: string[] = [];
  
  for (const dir of skillDirs) {
    const skillMd = join(skillsDir, dir, 'SKILL.md');
    if (!existsSync(skillMd)) {
      missingSkillMd.push(dir);
    }
  }
  
  if (missingSkillMd.length > 0) {
    return {
      name: 'Skills',
      status: 'warn',
      message: `${skillDirs.length} skills, ${missingSkillMd.length} missing SKILL.md`,
      details: `Missing: ${missingSkillMd.join(', ')}`,
    };
  }
  
  return {
    name: 'Skills',
    status: 'pass',
    message: `${skillDirs.length} skills configured`,
  };
}

/**
 * Check if beads is initialized in the project
 */
function checkBeadsInit(cwd: string): CheckResult {
  const beadsDir = join(cwd, '.beads');
  
  if (existsSync(beadsDir)) {
    return {
      name: 'Beads Init',
      status: 'pass',
      message: '.beads/ directory present',
    };
  }
  
  return {
    name: 'Beads Init',
    status: 'warn',
    message: '.beads/ not initialized',
    details: 'Run: bd init',
  };
}

/** System databases that should be excluded from user database counts */
export const SYSTEM_DBS = new Set(['information_schema', 'mysql', 'dolt']);

/** Maximum number of user databases before we warn */
export const DB_COUNT_THRESHOLD = 5;

/**
 * Parse user database names from Dolt SHOW DATABASES output.
 *
 * Dolt outputs a table like:
 * ```
 * +--------------------+
 * | Database           |
 * +--------------------+
 * | information_schema |
 * | mysql              |
 * | beth               |
 * +--------------------+
 * ```
 *
 * This function strips separator lines (`+---+`), the header row (`Database`),
 * pipe characters, and system database names — returning only user databases.
 */
export function parseDoltDatabases(output: string): string[] {
  return output
    .split('\n')
    .map(line => line.replace(/^\|\s*|\s*\|$/g, '').trim())
    .filter(line => line && !line.startsWith('+') && !line.startsWith('-') && line !== 'Database')
    .filter(name => !SYSTEM_DBS.has(name));
}

/**
 * Check Dolt for orphaned test databases and excessive database count.
 * E2E tests can leave behind *_test_* databases if cleanup doesn't run.
 * More than 5 databases usually indicates test pollution or forgotten experiments.
 */
function checkDoltDatabases(cwd: string): CheckResult[] {
  const results: CheckResult[] = [];
  const doltDir = join(cwd, '.beads', 'dolt');
  
  if (!existsSync(doltDir)) {
    return [];
  }
  
  try {
    const output = execSync('dolt sql -q "SHOW DATABASES;"', {
      encoding: 'utf-8',
      cwd: doltDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    
    const databases = parseDoltDatabases(output);
    
    // Check for orphaned test databases
    const testDbs = databases.filter(name => /test/i.test(name));
    if (testDbs.length > 0) {
      results.push({
        name: 'Dolt Test DBs',
        status: 'warn',
        message: `${testDbs.length} orphaned test database(s) found`,
        details: `Orphaned: ${testDbs.join(', ')}. Clean up with: dolt sql -q "DROP DATABASE <name>;" from .beads/dolt/`,
      });
    } else {
      results.push({
        name: 'Dolt Test DBs',
        status: 'pass',
        message: 'no orphaned test databases',
      });
    }
    
    // Check total database count (user databases only)
    if (databases.length > DB_COUNT_THRESHOLD) {
      results.push({
        name: 'Dolt DB Count',
        status: 'warn',
        message: `${databases.length} user databases (expected ≤${DB_COUNT_THRESHOLD})`,
        details: `Databases: ${databases.join(', ')}. Investigate and drop unused databases.`,
      });
    } else {
      results.push({
        name: 'Dolt DB Count',
        status: 'pass',
        message: `${databases.length} user database(s) (≤${DB_COUNT_THRESHOLD})`,
      });
    }
  } catch {
    // Dolt not running or not accessible — skip these checks silently
    results.push({
      name: 'Dolt Hygiene',
      status: 'warn',
      message: 'could not query Dolt databases',
      details: 'Dolt server may not be running. Start with: cd .beads/dolt && dolt sql-server &',
    });
  }
  
  return results;
}

/**
 * Check that git core.hooksPath is set and hooks are executable.
 * Git only runs hooks from the configured hooksPath. beads installs hooks
 * to .beads/hooks/, so core.hooksPath must point there and scripts must be +x.
 */
export function checkGitHooks(cwd: string): CheckResult[] {
  const results: CheckResult[] = [];
  const hooksDir = join(cwd, '.beads', 'hooks');

  if (!existsSync(hooksDir)) {
    // No hooks dir at all — nothing to check
    return [];
  }

  // Check core.hooksPath
  try {
    const hooksPath = execSync('git config core.hooksPath', {
      encoding: 'utf-8',
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    if (hooksPath === '.beads/hooks') {
      results.push({
        name: 'Git hooksPath',
        status: 'pass',
        message: 'core.hooksPath → .beads/hooks',
      });
    } else {
      results.push({
        name: 'Git hooksPath',
        status: 'warn',
        message: `core.hooksPath is "${hooksPath}" (expected ".beads/hooks")`,
        details: 'Fix: git config core.hooksPath .beads/hooks',
      });
    }
  } catch {
    results.push({
      name: 'Git hooksPath',
      status: 'fail',
      message: 'core.hooksPath not set — git hooks will not run',
      details: 'Fix: git config core.hooksPath .beads/hooks',
    });
  }

  // Check hooks are executable
  const expectedHooks = ['pre-push', 'pre-commit', 'post-checkout', 'post-merge', 'prepare-commit-msg'];
  const nonExecutable: string[] = [];
  const missing: string[] = [];

  for (const hook of expectedHooks) {
    const hookPath = join(hooksDir, hook);
    if (!existsSync(hookPath)) {
      missing.push(hook);
      continue;
    }
    try {
      const stats = statSync(hookPath);
      // Check if owner-executable bit is set (0o100)
      if ((stats.mode & 0o111) === 0) {
        nonExecutable.push(hook);
      }
    } catch {
      nonExecutable.push(hook);
    }
  }

  if (nonExecutable.length > 0) {
    results.push({
      name: 'Hook permissions',
      status: 'fail',
      message: `${nonExecutable.length} hook(s) not executable: ${nonExecutable.join(', ')}`,
      details: `Fix: chmod +x ${nonExecutable.map(h => `.beads/hooks/${h}`).join(' ')}`,
    });
  } else {
    const presentHooks = expectedHooks.filter(h => !missing.includes(h));
    results.push({
      name: 'Hook permissions',
      status: 'pass',
      message: `${presentHooks.length} hook(s) executable`,
    });
  }

  return results;
}

/**
 * Main doctor command
 * @param options - Command options
 * @param exitOnFailure - If false, returns result instead of calling process.exit
 */
export async function doctor(options: DoctorOptions = {}, exitOnFailure = true): Promise<{ passed: number; warned: number; failed: number }> {
  const { verbose = false } = options;
  const cwd = process.cwd();
  
  console.log('');
  log('Beth Doctor - System Health Check', COLORS.bright);
  log('─'.repeat(40), COLORS.dim);
  console.log('');
  
  const results: CheckResult[] = [
    checkNodeVersion(cwd),
    checkCli('beads', 'bd', 'curl -fsSL https://raw.githubusercontent.com/steveyegge/beads/main/scripts/install.sh | bash'),
    checkAgents(cwd),
    checkSkills(cwd),
    checkBeadsInit(cwd),
    ...checkGitHooks(cwd),
    ...checkDoltDatabases(cwd),
  ];
  
  // Display results
  for (const result of results) {
    logResult(result, verbose);
  }
  
  console.log('');
  log('─'.repeat(40), COLORS.dim);
  
  // Summary
  const passed = results.filter(r => r.status === 'pass').length;
  const warned = results.filter(r => r.status === 'warn').length;
  const failed = results.filter(r => r.status === 'fail').length;
  
  if (failed > 0) {
    log(`\n${failed} check(s) failed. Fix issues above and run doctor again.`, COLORS.red);
    if (exitOnFailure) {
      process.exit(1);
    }
  } else if (warned > 0) {
    log(`\n${passed}/${results.length} passed, ${warned} warning(s)`, COLORS.yellow);
  } else {
    log(`\nAll ${results.length} checks passed! Beth is ready.`, COLORS.green);
  }
  
  console.log('');
  
  return { passed, warned, failed };
}
