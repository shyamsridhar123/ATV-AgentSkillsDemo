#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { dirname, join, relative } from 'path';
import { existsSync, mkdirSync, readdirSync, statSync, copyFileSync, readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import { execSync, spawn } from 'child_process';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEMPLATES_DIR = join(__dirname, '..', 'templates');

// Get current package version
const packageJson = require('../package.json');
const CURRENT_VERSION = packageJson.version;

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

async function checkForUpdates() {
  try {
    const response = await fetch('https://registry.npmjs.org/beth-copilot/latest', {
      signal: AbortSignal.timeout(3000) // 3 second timeout
    });
    
    if (!response.ok) return null;
    
    const data = await response.json();
    const latestVersion = data.version;
    
    if (latestVersion && latestVersion !== CURRENT_VERSION) {
      // Compare versions (simple semver check)
      const current = CURRENT_VERSION.split('.').map(Number);
      const latest = latestVersion.split('.').map(Number);
      
      for (let i = 0; i < 3; i++) {
        if (latest[i] > current[i]) {
          return latestVersion;
        } else if (latest[i] < current[i]) {
          return null;
        }
      }
    }
    return null;
  } catch {
    // Network error, timeout, etc. - silently continue
    return null;
  }
}

function isBacklogCliInstalled() {
  try {
    execSync('backlog --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function getBeadsPath() {
  // Check if bd is available in PATH
  try {
    execSync('bd --version', { stdio: 'ignore' });
    return 'bd';
  } catch {
    // Check common installation paths
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    const commonPaths = [
      join(homeDir, '.local', 'bin', 'bd'),
      join(homeDir, 'bin', 'bd'),
      '/usr/local/bin/bd',
      join(homeDir, '.beads', 'bin', 'bd'),
    ];
    
    for (const bdPath of commonPaths) {
      if (existsSync(bdPath)) {
        return bdPath;
      }
    }
    
    return null;
  }
}

function isBeadsInstalled() {
  return getBeadsPath() !== null;
}

function isBeadsInitialized(cwd) {
  // Check if .beads directory exists in the project
  return existsSync(join(cwd, '.beads'));
}

async function promptYesNo(question) {
  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise((resolve) => {
    rl.question(`${question} (y/N) `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

async function promptForInput(question) {
  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise((resolve) => {
    rl.question(`${question} `, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function installBacklogCli() {
  log('\nInstalling backlog.md CLI...', COLORS.cyan);
  
  return new Promise((resolve) => {
    const child = spawn('npm', ['install', '-g', 'backlog.md'], {
      stdio: 'inherit',
      shell: true
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        logSuccess('backlog.md CLI installed successfully!');
        resolve(true);
      } else {
        logWarning('Failed to install backlog.md CLI. You can install it manually:');
        logInfo('npm i -g backlog.md');
        logInfo('  or');
        logInfo('bun i -g backlog.md');
        resolve(false);
      }
    });
    
    child.on('error', () => {
      logWarning('Failed to install backlog.md CLI. You can install it manually:');
      logInfo('npm i -g backlog.md');
      resolve(false);
    });
  });
}

async function installBeads() {
  log('\nInstalling beads CLI...', COLORS.cyan);
  logInfo('curl -fsSL https://raw.githubusercontent.com/steveyegge/beads/main/scripts/install.sh | bash');
  
  return new Promise((resolve) => {
    const child = spawn('bash', ['-c', 'curl -fsSL https://raw.githubusercontent.com/steveyegge/beads/main/scripts/install.sh | bash'], {
      stdio: 'inherit',
      shell: true
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        logSuccess('beads CLI installed successfully!');
        resolve(true);
      } else {
        logError('Failed to install beads CLI.');
        logInfo('Install manually: curl -fsSL https://raw.githubusercontent.com/steveyegge/beads/main/scripts/install.sh | bash');
        logInfo('Learn more: https://github.com/steveyegge/beads');
        resolve(false);
      }
    });
    
    child.on('error', () => {
      logError('Failed to install beads CLI.');
      logInfo('Install manually: curl -fsSL https://raw.githubusercontent.com/steveyegge/beads/main/scripts/install.sh | bash');
      resolve(false);
    });
  });
}

async function initializeBeads(cwd) {
  log('\nInitializing beads in project...', COLORS.cyan);
  
  const bdPath = getBeadsPath();
  if (!bdPath) {
    logWarning('Failed to initialize beads. Run manually: bd init');
    return false;
  }
  
  return new Promise((resolve) => {
    const child = spawn(bdPath, ['init'], {
      stdio: 'inherit',
      shell: true,
      cwd
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        logSuccess('beads initialized successfully!');
        resolve(true);
      } else {
        logWarning('Failed to initialize beads. Run manually: bd init');
        resolve(false);
      }
    });
    
    child.on('error', () => {
      logWarning('Failed to initialize beads. Run manually: bd init');
      resolve(false);
    });
  });
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
  --skip-beads                        Skip beads check (not recommended)

${COLORS.bright}Examples:${COLORS.reset}
  npx beth-copilot init               Set up Beth in current project
  npx beth-copilot init --force       Overwrite existing Beth files

${COLORS.bright}What gets installed:${COLORS.reset}
  .github/agents/                     8 specialized AI agents
  .github/skills/                     6 domain knowledge modules
  .github/copilot-instructions.md     Copilot configuration
  .vscode/settings.json               Recommended VS Code settings
  AGENTS.md                           Workflow documentation
  Backlog.md                          Task tracking file
  mcp.json.example                    Optional MCP server config

${COLORS.bright}After installation:${COLORS.reset}
  1. Open project in VS Code
  2. Open Copilot Chat (Ctrl+Alt+I / Cmd+Alt+I)
  3. Type @Beth to start working

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

async function init(options = {}) {
  const { force = false, skipBacklog = false, skipMcp = false, skipBeads = false } = options;
  const cwd = process.cwd();
  
  // Check for updates
  const latestVersion = await checkForUpdates();
  if (latestVersion) {
    console.log(`
${COLORS.yellow}╔════════════════════════════════════════════════════════════╗
║  ${COLORS.bright}Update available!${COLORS.reset}${COLORS.yellow} ${CURRENT_VERSION} → ${latestVersion}                          ║
║  Run: ${COLORS.cyan}npx beth-copilot@latest init${COLORS.yellow} to get the latest      ║
╚════════════════════════════════════════════════════════════╝${COLORS.reset}
`);
  }
  
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

  // Copy .vscode/settings.json (recommended settings for agent mode)
  const vscodeSrc = join(TEMPLATES_DIR, '.vscode');
  const vscodeDest = join(cwd, '.vscode');
  
  if (existsSync(vscodeSrc)) {
    if (!existsSync(vscodeDest)) {
      mkdirSync(vscodeDest, { recursive: true });
    }
    
    const settingsSrc = join(vscodeSrc, 'settings.json');
    const settingsDest = join(vscodeDest, 'settings.json');
    
    if (existsSync(settingsSrc)) {
      if (existsSync(settingsDest) && !force) {
        logWarning('Skipped (exists): .vscode/settings.json');
      } else {
        copyFileSync(settingsSrc, settingsDest);
        copiedFiles.push('.vscode/settings.json');
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

  // Check for beads CLI (REQUIRED for Beth)
  if (!skipBeads) {
    console.log('');
    log('Checking beads (required for task tracking)...', COLORS.cyan);
    
    let bdPath = getBeadsPath();
    
    // Loop until beads is installed
    while (!bdPath) {
      logWarning('beads CLI is not installed.');
      logInfo('Beth requires beads for task tracking. Agents use it to coordinate work.');
      logInfo('Learn more: https://github.com/steveyegge/beads');
      console.log('');
      
      const shouldInstallBeads = await promptYesNo('Install beads CLI now? (required)');
      if (shouldInstallBeads) {
        const installed = await installBeads();
        if (installed) {
          // Re-check for beads after installation
          bdPath = getBeadsPath();
          if (!bdPath) {
            console.log('');
            logWarning('beads installed but not found in common paths.');
            logInfo('The installer may have placed it in a custom location.');
            console.log('');
            logInfo('Please try one of these options:');
            logInfo('  1. Open a NEW terminal and run: npx beth-copilot init');
            logInfo('  2. Add ~/.local/bin to your PATH and retry');
            logInfo('  3. Run: source ~/.bashrc (or ~/.zshrc) then retry');
            console.log('');
            
            const retryCheck = await promptYesNo('Retry detection? (select No to enter path manually)');
            if (retryCheck) {
              bdPath = getBeadsPath();
              continue;
            }
            
            // Allow manual path entry
            const customPath = await promptForInput('Enter full path to bd binary (or press Enter to retry installation):');
            if (customPath && existsSync(customPath)) {
              bdPath = customPath;
              logSuccess(`Found beads at: ${bdPath}`);
            } else if (customPath) {
              logError(`File not found: ${customPath}`);
            }
          }
        } else {
          console.log('');
          logError('Installation script failed.');
          logInfo('You can try installing manually:');
          logInfo('  curl -fsSL https://raw.githubusercontent.com/steveyegge/beads/main/scripts/install.sh | bash');
          console.log('');
        }
      } else {
        console.log('');
        logError('beads is REQUIRED for Beth to function.');
        logInfo('Beth agents use beads to track tasks, dependencies, and coordinate work.');
        logInfo('Without beads, the multi-agent workflow will not work correctly.');
        console.log('');
        
        const tryAgain = await promptYesNo('Would you like to try installing beads?');
        if (!tryAgain) {
          logError('Cannot continue without beads. Exiting.');
          logInfo('Install beads manually and run "npx beth-copilot init" again:');
          logInfo('  curl -fsSL https://raw.githubusercontent.com/steveyegge/beads/main/scripts/install.sh | bash');
          process.exit(1);
        }
      }
    }
    
    // Show path info if not in standard PATH
    if (bdPath && bdPath !== 'bd') {
      logSuccess(`beads CLI found at: ${bdPath}`);
      logInfo('Tip: Add ~/.local/bin to your PATH to use "bd" directly.');
    } else {
      logSuccess('beads CLI is installed');
    }
    
    // Initialize beads in the project if not already done
    if (!isBeadsInitialized(cwd)) {
      logInfo('beads not initialized in this project.');
      let initialized = false;
      
      while (!initialized) {
        const shouldInitBeads = await promptYesNo('Initialize beads now? (required)');
        if (shouldInitBeads) {
          initialized = await initializeBeads(cwd);
          if (!initialized) {
            logWarning('Initialization failed. Let\'s try again.');
          }
        } else {
          logError('beads must be initialized for Beth to work correctly.');
          logInfo('The .beads directory stores task tracking data used by all agents.');
          console.log('');
        }
      }
    } else {
      logSuccess('beads is initialized in this project');
    }
  } else {
    logWarning('Skipped beads check (--skip-beads). Beth may not function correctly.');
  }

  // Check for backlog.md CLI (REQUIRED for Beth)
  if (!skipBacklog) {
    console.log('');
    log('Checking backlog.md CLI (required for task management)...', COLORS.cyan);
    
    // Loop until backlog.md is installed
    while (!isBacklogCliInstalled()) {
      logWarning('backlog.md CLI is not installed.');
      logInfo('Beth requires backlog.md for human-readable task tracking and boards.');
      logInfo('Learn more: https://github.com/MrLesk/Backlog.md');
      console.log('');
      
      const shouldInstall = await promptYesNo('Install backlog.md CLI now? (required)');
      if (shouldInstall) {
        const installed = await installBacklogCli();
        if (installed) {
          // Verify installation
          if (isBacklogCliInstalled()) {
            break;
          } else {
            logWarning('Installation completed but backlog CLI not found in PATH.');
            logInfo('Try opening a new terminal or running: source ~/.bashrc');
            console.log('');
            
            const retryCheck = await promptYesNo('Retry detection?');
            if (retryCheck && isBacklogCliInstalled()) {
              break;
            }
          }
        } else {
          console.log('');
          logError('Installation failed.');
          logInfo('You can try installing manually:');
          logInfo('  npm install -g backlog.md');
          logInfo('  bun install -g backlog.md');
          console.log('');
        }
      } else {
        console.log('');
        logError('backlog.md is REQUIRED for Beth to function.');
        logInfo('Beth uses Backlog.md to maintain human-readable task history and boards.');
        logInfo('This complements beads for a complete task management workflow.');
        console.log('');
        
        const tryAgain = await promptYesNo('Would you like to try installing backlog.md?');
        if (!tryAgain) {
          logError('Cannot continue without backlog.md. Exiting.');
          logInfo('Install manually and run "npx beth-copilot init" again:');
          logInfo('  npm install -g backlog.md');
          process.exit(1);
        }
      }
    }
    
    logSuccess('backlog.md CLI is installed');
  } else {
    logWarning('Skipped backlog check (--skip-backlog). Beth may not function correctly.');
  }

  // Final verification
  console.log('');
  log('Verifying installation...', COLORS.cyan);
  
  const finalBeadsOk = skipBeads || getBeadsPath();
  const finalBacklogOk = skipBacklog || isBacklogCliInstalled();
  const finalBeadsInit = skipBeads || isBeadsInitialized(cwd);
  
  if (finalBeadsOk && finalBacklogOk && finalBeadsInit) {
    logSuccess('All dependencies installed and configured!');
  } else {
    if (!finalBeadsOk) logError('beads CLI not found');
    if (!finalBacklogOk) logError('backlog.md CLI not found');
    if (!finalBeadsInit) logError('beads not initialized in project');
    logError('Setup incomplete. Please resolve issues above and run init again.');
    process.exit(1);
  }

  // Next steps
  console.log(`
${COLORS.bright}Next steps:${COLORS.reset}
  1. Open this project in VS Code
  2. Open Copilot Chat (${COLORS.cyan}Ctrl+Alt+I${COLORS.reset} / ${COLORS.cyan}Cmd+Alt+I${COLORS.reset})
  3. Type ${COLORS.cyan}@Beth${COLORS.reset} to start - she's your orchestrator

${COLORS.bright}Pro tip:${COLORS.reset} Start every session with ${COLORS.cyan}@Beth${COLORS.reset} and let her route work to the right specialists.

${COLORS.bright}Documentation:${COLORS.reset}
  https://github.com/stephschofield/beth

${COLORS.cyan}"They broke my wings and forgot I had claws."${COLORS.reset}
`);
}

// Input validation constants
const ALLOWED_COMMANDS = ['init', 'help', '--help', '-h'];
const ALLOWED_FLAGS = ['--force', '--skip-backlog', '--skip-mcp', '--skip-beads'];
const MAX_ARG_LENGTH = 50;

// Validate and sanitize input
function validateArgs(args) {
  for (const arg of args) {
    // Prevent excessively long arguments (log injection, DoS)
    if (arg.length > MAX_ARG_LENGTH) {
      logError('Invalid argument: input too long');
      process.exit(1);
    }
    // Only allow expected characters (alphanumeric, dash)
    if (!/^[a-zA-Z0-9-]+$/.test(arg)) {
      logError('Invalid argument: unexpected characters');
      process.exit(1);
    }
  }
}

// Parse arguments
const args = process.argv.slice(2);
validateArgs(args);

const command = args[0]?.toLowerCase();

const options = {
  force: args.includes('--force'),
  skipBacklog: args.includes('--skip-backlog'),
  skipMcp: args.includes('--skip-mcp'),
  skipBeads: args.includes('--skip-beads'),
};

// Validate unknown flags
const unknownFlags = args.filter(arg => arg.startsWith('--') && !ALLOWED_FLAGS.includes(arg));
if (unknownFlags.length > 0) {
  logError(`Unknown flag: ${unknownFlags[0].slice(0, MAX_ARG_LENGTH)}`);
  console.log('Run "npx beth-copilot help" for usage information.');
  process.exit(1);
}

switch (command) {
  case 'init':
    await init(options);
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
    logError(`Unknown command: ${command.slice(0, MAX_ARG_LENGTH)}`);
    console.log('Run "npx beth-copilot help" for usage information.');
    process.exit(1);
}
