/**
 * Doctor Command
 *
 * Checks system health and verifies Beth installation requirements:
 * - Node.js version (≥18)
 * - beads CLI available
 * - backlog.md CLI available
 * - .github/agents/ exists with valid frontmatter
 * - .github/skills/ exists
 * - beads no-db mode (JSONL health)
 * - backlog.md initialization
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

/**
 * Check beads no-db mode: verify config has no-db: true and JSONL files are healthy.
 */
export function checkBeadsNoDb(cwd: string): CheckResult[] {
  const results: CheckResult[] = [];
  const configPath = join(cwd, '.beads', 'config.yaml');

  if (!existsSync(configPath)) {
    // No config — can't check no-db mode
    return [];
  }

  try {
    const config = readFileSync(configPath, 'utf-8');
    const hasNoDb = /^no-db:\s*true/m.test(config);

    if (hasNoDb) {
      results.push({
        name: 'Beads no-db',
        status: 'pass',
        message: 'no-db mode enabled',
      });
    } else {
      results.push({
        name: 'Beads no-db',
        status: 'warn',
        message: 'no-db mode not enabled — Dolt server may be required',
        details: 'Add "no-db: true" to .beads/config.yaml to use JSONL-native mode',
      });
    }
  } catch {
    results.push({
      name: 'Beads no-db',
      status: 'warn',
      message: 'could not read .beads/config.yaml',
    });
  }

  // Check JSONL health
  const issuesPath = join(cwd, '.beads', 'issues.jsonl');
  const backupIssuesPath = join(cwd, '.beads', 'backup', 'issues.jsonl');

  const jsonlPath = existsSync(issuesPath) ? issuesPath : existsSync(backupIssuesPath) ? backupIssuesPath : null;

  if (jsonlPath) {
    try {
      const content = readFileSync(jsonlPath, 'utf-8').trim();
      const lines = content ? content.split('\n').length : 0;
      results.push({
        name: 'JSONL data',
        status: lines > 0 ? 'pass' : 'warn',
        message: lines > 0 ? `${lines} issue(s) in JSONL` : 'JSONL file is empty',
        details: lines === 0 ? 'Run bd list to verify beads state' : undefined,
      });
    } catch {
      results.push({
        name: 'JSONL data',
        status: 'warn',
        message: 'could not read JSONL file',
      });
    }
  }

  return results;
}

/**
 * Check backlog.md initialization
 */
function checkBacklogInit(cwd: string): CheckResult {
  const configPath = join(cwd, 'backlog', 'config.yml');

  if (existsSync(configPath)) {
    return {
      name: 'Backlog.md Init',
      status: 'pass',
      message: 'backlog/ directory present',
    };
  }

  return {
    name: 'Backlog.md Init',
    status: 'warn',
    message: 'backlog/ not initialized',
    details: 'Run: backlog init',
  };
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
    checkCli('backlog.md', 'backlog', 'npm i -g backlog.md'),
    checkAgents(cwd),
    checkSkills(cwd),
    checkBeadsInit(cwd),
    checkBacklogInit(cwd),
    ...checkGitHooks(cwd),
    ...checkBeadsNoDb(cwd),
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
