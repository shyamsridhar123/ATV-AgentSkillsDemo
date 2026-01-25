#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { dirname, join, relative } from 'path';
import { existsSync, mkdirSync, readdirSync, statSync, copyFileSync, readFileSync, writeFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEMPLATES_DIR = join(__dirname, '..', 'templates');

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

function log(message, color = '') {
  console.log(`${color}${message}${COLORS.reset}`);
}

function logSuccess(message) {
  log(`✓ ${message}`, COLORS.green);
}

function logWarning(message) {
  log(`⚠ ${message}`, COLORS.yellow);
}

function logError(message) {
  log(`✗ ${message}`, COLORS.red);
}

function logInfo(message) {
  log(`  ${message}`, COLORS.cyan);
}

function showHelp() {
  console.log(`
${COLORS.bright}Beth${COLORS.reset} - AI Orchestrator for GitHub Copilot

${COLORS.bright}Usage:${COLORS.reset}
  npx beth-copilot init [options]     Initialize Beth in current directory
  npx beth-copilot help               Show this help message

${COLORS.bright}Options:${COLORS.reset}
  --force                             Overwrite existing files
  --skip-backlog                      Don't create Backlog.md
  --skip-mcp                          Don't create mcp.json.example

${COLORS.bright}Examples:${COLORS.reset}
  npx beth-copilot init               Set up Beth in current project
  npx beth-copilot init --force       Overwrite existing Beth files

${COLORS.bright}What gets installed:${COLORS.reset}
  .github/agents/                     8 specialized AI agents
  .github/skills/                     6 domain knowledge modules
  .github/copilot-instructions.md     Copilot configuration
  AGENTS.md                           Workflow documentation
  Backlog.md                          Task tracking file
  mcp.json.example                    Optional MCP server config

${COLORS.bright}After installation:${COLORS.reset}
  1. Open project in VS Code
  2. Enable Agent mode in Copilot Chat
  3. Type @Beth and tell her what you need

${COLORS.bright}Documentation:${COLORS.reset}
  https://github.com/stephschofield/beth
`);
}

function copyDirRecursive(src, dest, options = {}) {
  const { force = false, copiedFiles = [] } = options;
  
  if (!existsSync(dest)) {
    mkdirSync(dest, { recursive: true });
  }

  const entries = readdirSync(src);
  
  for (const entry of entries) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    const stats = statSync(srcPath);
    
    if (stats.isDirectory()) {
      copyDirRecursive(srcPath, destPath, { force, copiedFiles });
    } else {
      if (existsSync(destPath) && !force) {
        logWarning(`Skipped (exists): ${relative(process.cwd(), destPath)}`);
      } else {
        copyFileSync(srcPath, destPath);
        copiedFiles.push(relative(process.cwd(), destPath));
      }
    }
  }
  
  return copiedFiles;
}

function init(options = {}) {
  const { force = false, skipBacklog = false, skipMcp = false } = options;
  const cwd = process.cwd();
  
  console.log(`
${COLORS.bright}🤠 Beth is moving in.${COLORS.reset}
${COLORS.cyan}"I don't do excuses. I do results."${COLORS.reset}
`);

  // Check if templates exist
  if (!existsSync(TEMPLATES_DIR)) {
    logError('Templates directory not found. Package may be corrupted.');
    process.exit(1);
  }

  const copiedFiles = [];

  // Copy .github directory (agents, skills, copilot-instructions.md)
  const githubSrc = join(TEMPLATES_DIR, '.github');
  const githubDest = join(cwd, '.github');
  
  if (existsSync(githubSrc)) {
    log('\nInstalling agents and skills...');
    copyDirRecursive(githubSrc, githubDest, { force, copiedFiles });
  }

  // Copy AGENTS.md
  const agentsMdSrc = join(TEMPLATES_DIR, 'AGENTS.md');
  const agentsMdDest = join(cwd, 'AGENTS.md');
  
  if (existsSync(agentsMdSrc)) {
    if (existsSync(agentsMdDest) && !force) {
      logWarning('Skipped (exists): AGENTS.md');
    } else {
      copyFileSync(agentsMdSrc, agentsMdDest);
      copiedFiles.push('AGENTS.md');
    }
  }

  // Copy Backlog.md (unless skipped)
  if (!skipBacklog) {
    const backlogSrc = join(TEMPLATES_DIR, 'Backlog.md');
    const backlogDest = join(cwd, 'Backlog.md');
    
    if (existsSync(backlogSrc)) {
      if (existsSync(backlogDest) && !force) {
        logWarning('Skipped (exists): Backlog.md');
      } else {
        copyFileSync(backlogSrc, backlogDest);
        copiedFiles.push('Backlog.md');
      }
    }
  }

  // Copy mcp.json.example (unless skipped)
  if (!skipMcp) {
    const mcpSrc = join(TEMPLATES_DIR, 'mcp.json.example');
    const mcpDest = join(cwd, 'mcp.json.example');
    
    if (existsSync(mcpSrc)) {
      if (existsSync(mcpDest) && !force) {
        logWarning('Skipped (exists): mcp.json.example');
      } else {
        copyFileSync(mcpSrc, mcpDest);
        copiedFiles.push('mcp.json.example');
      }
    }
  }

  // Summary
  console.log('');
  if (copiedFiles.length > 0) {
    logSuccess(`Installed ${copiedFiles.length} files:`);
    copiedFiles.forEach(f => logInfo(f));
  } else {
    logWarning('No files were copied. Use --force to overwrite existing files.');
  }

  // Next steps
  console.log(`
${COLORS.bright}Next steps:${COLORS.reset}
  1. Open this project in VS Code
  2. Ensure GitHub Copilot + Copilot Chat are installed
  3. Switch to ${COLORS.cyan}Agent mode${COLORS.reset} in Copilot Chat
  4. Type ${COLORS.cyan}@Beth${COLORS.reset} and tell her what you need

${COLORS.bright}Documentation:${COLORS.reset}
  https://github.com/stephschofield/beth

${COLORS.cyan}"They broke my wings and forgot I had claws."${COLORS.reset}
`);
}

// Parse arguments
const args = process.argv.slice(2);
const command = args[0];

const options = {
  force: args.includes('--force'),
  skipBacklog: args.includes('--skip-backlog'),
  skipMcp: args.includes('--skip-mcp'),
};

switch (command) {
  case 'init':
    init(options);
    break;
  case 'help':
  case '--help':
  case '-h':
    showHelp();
    break;
  case undefined:
    showHelp();
    break;
  default:
    logError(`Unknown command: ${command}`);
    console.log('Run "npx beth-copilot help" for usage information.');
    process.exit(1);
}
