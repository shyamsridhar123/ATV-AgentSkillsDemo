/**
 * Doctor Command
 *
 * Checks system health and verifies Beth installation requirements:
 * - Node.js version (≥18)
 * - backlog.md CLI available
 * - .github/agents/ exists with valid frontmatter
 * - .github/skills/ exists
 * - backlog.md initialization
 * - Required MCP servers configured (.vscode/mcp.json)
 *
 * Supports --fix to auto-repair common issues (MCP config, backlog init).
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
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

export interface DoctorOptions {
  verbose?: boolean;
  fix?: boolean;
}

interface CheckResult {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
  details?: string;
  /** Lines to always display below the check (not gated by --verbose) */
  issues?: string[];
  /** Command a user can run to fix this issue manually */
  fixCommand?: string;
  /** If true, --fix can auto-repair this issue */
  fixable?: boolean;
}

/** Max agent issues shown without --verbose */
const MAX_INLINE_ISSUES = 5;

function log(message: string, color = ''): void {
  console.log(`${color}${message}${COLORS.reset}`);
}

function logResult(result: CheckResult, verbose: boolean): void {
  const icon = result.status === 'pass' ? '✓' : result.status === 'warn' ? '⚠' : '✗';
  const color = result.status === 'pass' ? COLORS.green : result.status === 'warn' ? COLORS.yellow : COLORS.red;
  
  log(`${icon} ${result.name}: ${result.message}`, color);

  // Always show inline issues (truncated to MAX_INLINE_ISSUES unless verbose)
  if (result.issues && result.issues.length > 0) {
    const show = verbose ? result.issues : result.issues.slice(0, MAX_INLINE_ISSUES);
    for (const issue of show) {
      log(`    ${issue}`, COLORS.dim);
    }
    if (!verbose && result.issues.length > MAX_INLINE_ISSUES) {
      log(`    ... and ${result.issues.length - MAX_INLINE_ISSUES} more (use --verbose to see all)`, COLORS.dim);
    }
  }

  // Show verbose-only details
  if (verbose && result.details) {
    log(`    ${result.details}`, COLORS.dim);
  }

  // Always show fix command for non-passing checks
  if (result.status !== 'pass' && result.fixCommand) {
    log(`    Fix: ${result.fixCommand}`, COLORS.cyan);
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
    fixCommand: 'Upgrade Node.js: https://nodejs.org/',
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
      fixCommand: `Install: ${installHint}`,
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
      fixCommand: 'npx beth-copilot init',
    };
  }
  
  const agentFiles = readdirSync(agentsDir).filter(f => f.endsWith('.agent.md'));
  
  if (agentFiles.length === 0) {
    return {
      name: 'Agents',
      status: 'fail',
      message: 'no .agent.md files found',
      fixCommand: 'npx beth-copilot init --force',
    };
  }
  
  // Validate frontmatter for each agent
  const issues: string[] = [];
  
  for (const file of agentFiles) {
    try {
      const content = readFileSync(join(agentsDir, file), 'utf-8');
      const { data } = matter(content);
      
      if (!data.name) {
        issues.push(`${file}: missing 'name' in frontmatter`);
      }
    } catch (e) {
      issues.push(`${file}: failed to parse - ${e instanceof Error ? e.message : 'unknown error'}`);
    }
  }
  
  if (issues.length > 0) {
    return {
      name: 'Agents',
      status: 'warn',
      message: `${agentFiles.length} agents, ${issues.length} with issues`,
      issues,
      fixCommand: 'Add a "name" field to the YAML frontmatter of each listed agent file',
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
      fixCommand: 'npx beth-copilot init',
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
  const missing: string[] = [];
  
  for (const dir of skillDirs) {
    const skillMd = join(skillsDir, dir, 'SKILL.md');
    if (!existsSync(skillMd)) {
      missing.push(dir);
    }
  }
  
  if (missing.length > 0) {
    return {
      name: 'Skills',
      status: 'warn',
      message: `${skillDirs.length} skills, ${missing.length} missing SKILL.md`,
      issues: missing.map(d => `${d}/: no SKILL.md file`),
      fixCommand: 'Create a SKILL.md in each listed skill directory',
    };
  }
  
  return {
    name: 'Skills',
    status: 'pass',
    message: `${skillDirs.length} skills configured`,
  };
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
    fixCommand: 'backlog init',
    fixable: true,
  };
}

/** Required MCP servers that agents depend on */
const REQUIRED_MCP_SERVERS: Array<{
  key: string;
  label: string;
  description: string;
  config: Record<string, unknown>;
}> = [
  {
    key: 'playwright',
    label: 'Playwright',
    description: 'Browser automation for testing, screenshots, and web scraping. Used by the tester agent for E2E tests and accessibility audits.',
    config: { command: 'npx', args: ['@playwright/mcp@0.0.68'] },
  },
  {
    key: 'backlog',
    label: 'Backlog.md',
    description: 'Task tracking MCP server. Lets agents create, update, and query tasks in Backlog.md directly from chat.',
    config: { command: 'backlog', args: ['mcp', 'start'] },
  },
];

/**
 * Validate that a server entry has the expected structure:
 * either { command: string, args: string[] } or { type: string, url: string }
 */
export function isValidServerEntry(entry: unknown): boolean {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
  const s = entry as Record<string, unknown>;
  const hasCommandArgs = typeof s.command === 'string' && Array.isArray(s.args);
  const hasTypeUrl = typeof s.type === 'string' && typeof s.url === 'string';
  return hasCommandArgs || hasTypeUrl;
}

/**
 * Format a server config as a readable JSON snippet for display.
 */
function formatServerHint(key: string, config: Record<string, unknown>): string {
  return `"${key}": ${JSON.stringify(config)}`;
}

/**
 * Check .vscode/mcp.json for required MCP servers.
 * Returns a CheckResult and optionally an issues list with server descriptions.
 */
export function checkMcpServers(cwd: string): CheckResult {
  const mcpPath = join(cwd, '.vscode', 'mcp.json');

  if (!existsSync(mcpPath)) {
    return {
      name: 'MCP Servers',
      status: 'fail',
      message: '.vscode/mcp.json not found',
      issues: [
        'This file configures MCP (Model Context Protocol) servers that VS Code Copilot agents connect to.',
        ...REQUIRED_MCP_SERVERS.map(s => `${s.label}: ${s.description}`),
      ],
      fixCommand: 'npx beth-copilot doctor --fix',
      fixable: true,
    };
  }

  let config: Record<string, unknown>;
  try {
    config = JSON.parse(readFileSync(mcpPath, 'utf-8'));
  } catch {
    return {
      name: 'MCP Servers',
      status: 'fail',
      message: '.vscode/mcp.json is not valid JSON',
      issues: ['The corrupted file will be backed up and regenerated.'],
      fixCommand: 'npx beth-copilot doctor --fix',
      fixable: true,
    };
  }

  const servers = config.servers as Record<string, unknown> | undefined;
  if (!servers || typeof servers !== 'object') {
    return {
      name: 'MCP Servers',
      status: 'fail',
      message: '.vscode/mcp.json missing "servers" object',
      fixCommand: 'npx beth-copilot doctor --fix',
      fixable: true,
    };
  }

  const missing = REQUIRED_MCP_SERVERS.filter(s => !servers[s.key]);

  if (missing.length > 0) {
    return {
      name: 'MCP Servers',
      status: 'fail',
      message: `missing required server(s): ${missing.map(m => m.label).join(', ')}`,
      issues: missing.map(s =>
        `${s.label} — ${s.description}\n      Add to .vscode/mcp.json → servers: ${formatServerHint(s.key, s.config)}`
      ),
      fixCommand: 'npx beth-copilot doctor --fix',
      fixable: true,
    };
  }

  // Validate structure of required servers
  const malformed = REQUIRED_MCP_SERVERS.filter(s => {
    const entry = servers[s.key];
    return !isValidServerEntry(entry);
  });

  if (malformed.length > 0) {
    return {
      name: 'MCP Servers',
      status: 'warn',
      message: `server(s) with invalid structure: ${malformed.map(m => m.label).join(', ')}`,
      issues: malformed.map(s =>
        `${s.label}: needs { command, args } or { type, url }. Expected: ${formatServerHint(s.key, s.config)}`
      ),
      fixCommand: 'npx beth-copilot doctor --fix',
      fixable: true,
    };
  }

  const totalServers = Object.keys(servers).length;
  return {
    name: 'MCP Servers',
    status: 'pass',
    message: `${totalServers} servers configured (${REQUIRED_MCP_SERVERS.map(s => `${s.label.toLowerCase()} ✓`).join(', ')})`,
  };
}

/**
 * Auto-fix: ensure .vscode/mcp.json exists and contains all required servers.
 * Merges missing servers into existing config without overwriting user additions.
 * Returns the list of actions taken.
 */
export function fixMcpServers(cwd: string): string[] {
  const vsDir = join(cwd, '.vscode');
  const mcpPath = join(vsDir, 'mcp.json');
  const actions: string[] = [];

  // Ensure .vscode/ exists
  if (!existsSync(vsDir)) {
    mkdirSync(vsDir, { recursive: true });
    actions.push('Created .vscode/ directory');
  }

  // Parse or create the config
  let config: Record<string, unknown> = {};
  if (existsSync(mcpPath)) {
    try {
      config = JSON.parse(readFileSync(mcpPath, 'utf-8'));
    } catch {
      // Backup corrupted file
      const backupPath = mcpPath + '.bak';
      writeFileSync(backupPath, readFileSync(mcpPath, 'utf-8'));
      actions.push(`Backed up corrupted mcp.json to ${backupPath}`);
      config = {};
    }
  }

  // Ensure servers object
  if (!config.servers || typeof config.servers !== 'object' || Array.isArray(config.servers)) {
    config.servers = {};
    actions.push('Created "servers" object in mcp.json');
  }

  // Add schema if missing
  if (!config['$schema']) {
    config = { '$schema': 'https://code.visualstudio.com/docs/copilot/chat/mcp-servers', ...config };
    actions.push('Added $schema reference to mcp.json');
  }

  const servers = config.servers as Record<string, unknown>;

  // Add missing required servers
  for (const required of REQUIRED_MCP_SERVERS) {
    if (!servers[required.key] || !isValidServerEntry(servers[required.key])) {
      servers[required.key] = required.config;
      actions.push(`Added ${required.label} server: ${required.description}`);
    }
  }

  // Write the file
  writeFileSync(mcpPath, JSON.stringify(config, null, 2) + '\n');

  if (actions.length === 0) {
    actions.push('MCP servers already configured correctly');
  }

  return actions;
}

/**
 * Auto-fix: run backlog init if not already initialized.
 * Returns the list of actions taken.
 */
function fixBacklogInit(cwd: string): string[] {
  const configPath = join(cwd, 'backlog', 'config.yml');
  if (existsSync(configPath)) {
    return ['Backlog already initialized'];
  }

  try {
    execSync('backlog init', {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return ['Ran backlog init — backlog/ directory created'];
  } catch (e) {
    return [`Failed to run backlog init: ${e instanceof Error ? e.message : 'unknown error'}. Run manually: backlog init`];
  }
}

/**
 * Main doctor command
 * @param options - Command options (verbose, fix)
 * @param exitOnFailure - If false, returns result instead of calling process.exit
 */
export async function doctor(options: DoctorOptions = {}, exitOnFailure = true): Promise<{ passed: number; warned: number; failed: number }> {
  const { verbose = false, fix = false } = options;
  const cwd = process.cwd();
  
  console.log('');
  log('Beth Doctor - System Health Check', COLORS.bright);
  log('─'.repeat(40), COLORS.dim);
  console.log('');
  
  // --- Fix mode: apply auto-repairs before running checks ---
  if (fix) {
    log('🔧 Auto-fix mode enabled', COLORS.cyan);
    console.log('');

    // Fix MCP servers
    const mcpActions = fixMcpServers(cwd);
    for (const action of mcpActions) {
      log(`  ✓ ${action}`, COLORS.green);
    }

    // Fix backlog init
    const backlogActions = fixBacklogInit(cwd);
    for (const action of backlogActions) {
      const failed = action.startsWith('Failed');
      log(`  ${failed ? '✗' : '✓'} ${action}`, failed ? COLORS.red : COLORS.green);
    }

    console.log('');
    log('─'.repeat(40), COLORS.dim);
    console.log('');
    log('Re-checking after fixes...', COLORS.bright);
    console.log('');
  }

  const results: CheckResult[] = [
    checkNodeVersion(cwd),
    checkCli('backlog.md', 'backlog', 'npm i -g backlog.md'),
    checkAgents(cwd),
    checkSkills(cwd),
    checkBacklogInit(cwd),
    checkMcpServers(cwd),
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
  const hasFixable = results.some(r => r.status !== 'pass' && r.fixable);
  
  if (failed > 0) {
    log(`\n${failed} check(s) failed. Fix issues above and run doctor again.`, COLORS.red);
    if (hasFixable) {
      log(`\nTip: run ${COLORS.cyan}npx beth-copilot doctor --fix${COLORS.reset}${COLORS.red} to auto-repair fixable issues.`, COLORS.red);
    }
    if (exitOnFailure) {
      process.exit(1);
    }
  } else if (warned > 0) {
    log(`\n${passed}/${results.length} passed, ${warned} warning(s)`, COLORS.yellow);
    if (hasFixable) {
      log(`\nTip: run ${COLORS.cyan}npx beth-copilot doctor --fix${COLORS.reset}${COLORS.yellow} to auto-repair fixable issues.`, COLORS.yellow);
    }
  } else {
    log(`\nAll ${results.length} checks passed! Beth is ready.`, COLORS.green);
  }
  
  console.log('');
  
  return { passed, warned, failed };
}
