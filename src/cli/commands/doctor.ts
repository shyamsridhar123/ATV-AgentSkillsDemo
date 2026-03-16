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
 */

import { execSync } from 'child_process';
import { existsSync, readdirSync, readFileSync } from 'fs';
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

/** Required MCP servers that agents depend on */
const REQUIRED_MCP_SERVERS: Array<{ key: string; label: string; hint: string }> = [
  { key: 'playwright', label: 'Playwright', hint: '"playwright": { "command": "npx", "args": ["@playwright/mcp@0.0.68"] }' },
  { key: 'backlog', label: 'Backlog.md', hint: '"backlog": { "command": "backlog", "args": ["mcp", "start"] }' },
];

/**
 * Check .vscode/mcp.json for required MCP servers
 */
export function checkMcpServers(cwd: string): CheckResult {
  const mcpPath = join(cwd, '.vscode', 'mcp.json');

  if (!existsSync(mcpPath)) {
    return {
      name: 'MCP Servers',
      status: 'fail',
      message: '.vscode/mcp.json not found',
      details: 'Run: npx beth-copilot init (or npx beth-copilot init --force to regenerate)',
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
      details: 'Fix the JSON syntax or run: npx beth-copilot init --force',
    };
  }

  const servers = config.servers as Record<string, unknown> | undefined;
  if (!servers || typeof servers !== 'object') {
    return {
      name: 'MCP Servers',
      status: 'fail',
      message: '.vscode/mcp.json missing "servers" object',
      details: 'Run: npx beth-copilot init --force',
    };
  }

  const missing = REQUIRED_MCP_SERVERS.filter(s => !servers[s.key]);

  if (missing.length > 0) {
    return {
      name: 'MCP Servers',
      status: 'fail',
      message: `missing required server(s): ${missing.map(m => m.label).join(', ')}`,
      details: missing.map(m => `Add to .vscode/mcp.json servers: ${m.hint}`).join('\n    '),
    };
  }

  const totalServers = Object.keys(servers).length;
  return {
    name: 'MCP Servers',
    status: 'pass',
    message: `${totalServers} servers configured (playwright ✓, backlog ✓)`,
  };
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
