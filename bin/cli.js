#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { dirname, join, relative } from 'path';
import { existsSync, mkdirSync, readdirSync, statSync, copyFileSync, readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import { execSync, spawn } from 'child_process';
import { validateBeadsPath, validateBacklogPath, validateBinaryPath } from './lib/pathValidation.js';

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
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgYellow: '\x1b[43m',
};

// Beth's dramatic ASCII banner
const BETH_ASCII = [
  '██████╗ ███████╗████████╗██╗  ██╗',
  '██╔══██╗██╔════╝╚══██╔══╝██║  ██║',
  '██████╔╝█████╗     ██║   ███████║',
  '██╔══██╗██╔══╝     ██║   ██╔══██║',
  '██████╔╝███████╗   ██║   ██║  ██║',
  '╚═════╝ ╚══════╝   ╚═╝   ╚═╝  ╚═╝',
];

// Fire characters for animation (from light to intense)
const FIRE_CHARS = [' ', '.', ':', '*', 's', 'S', '#', '$', '&', '@'];
const FIRE_CHARS_SIMPLE = [' ', '.', '*', '^', ')', '(', '%', '#'];

// Generate a fire line with flickering effect
function generateFireLine(width, intensity, frame) {
  let line = '';
  for (let i = 0; i < width; i++) {
    // Create wave pattern for fire
    const wave = Math.sin((i + frame) * 0.3) * 0.5 + 0.5;
    const noise = Math.random();
    const heat = (intensity * wave * 0.7 + noise * 0.3);
    
    if (heat > 0.85) {
      line += FIRE_CHARS_SIMPLE[7]; // #
    } else if (heat > 0.7) {
      line += FIRE_CHARS_SIMPLE[6]; // %
    } else if (heat > 0.55) {
      line += FIRE_CHARS_SIMPLE[Math.random() > 0.5 ? 4 : 5]; // ) or (
    } else if (heat > 0.4) {
      line += FIRE_CHARS_SIMPLE[3]; // ^
    } else if (heat > 0.25) {
      line += FIRE_CHARS_SIMPLE[2]; // *
    } else if (heat > 0.1) {
      line += FIRE_CHARS_SIMPLE[1]; // .
    } else {
      line += ' ';
    }
  }
  return line;
}

const BETH_TAGLINES = [
  "I don't speak dipshit. I speak in consequences.",
  "They broke my wings and forgot I had claws.",
  "I'm the trailer park AND the tornado.",
  "I don't do excuses. I do results.",
  "You want my opinion? You're getting it either way.",
  "I believe in lovin' with your whole soul and destroyin' anything that wants to kill what you love.",
  "The sting never fades. That's the point.",
];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function animateBethBanner() {
  // Simple, clean fire animation
  const RESET = '\x1b[0m';
  const BRIGHT = '\x1b[1m';
  
  // Fire color palette
  const FIRE_COLORS = [
    '\x1b[97m',         // white (hottest)
    '\x1b[93m',         // bright yellow
    '\x1b[33m',         // yellow
    '\x1b[38;5;214m',   // gold
    '\x1b[38;5;208m',   // orange
    '\x1b[91m',         // red
    '\x1b[31m',         // dark red
    '\x1b[38;5;52m',    // ember
  ];
  
  // BETH gradient (red to yellow)
  const BETH_COLORS = [
    '\x1b[38;5;196m', '\x1b[38;5;202m', '\x1b[38;5;208m',
    '\x1b[38;5;214m', '\x1b[38;5;220m', '\x1b[38;5;226m',
  ];
  
  // Convert to character arrays
  const bethLines = BETH_ASCII.map(s => [...s]);
  const W = bethLines[0].length;
  const H = bethLines.length;
  const FIRE_H = 4;
  const TOTAL_H = H + FIRE_H;
  
  // Helpers
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  
  // Hide cursor and make space
  process.stdout.write('\x1b[?25l\n');
  for (let i = 0; i < TOTAL_H; i++) console.log('');
  
  for (let frame = 0; frame < 70; frame++) {
    process.stdout.write(`\x1b[${TOTAL_H}A`);
    
    // BETH visibility (fades in from frame 15-45)
    const vis = clamp((frame - 15) / 30, 0, 1);
    // Fire dies down at end
    const fireStrength = frame > 55 ? 1 - (frame - 55) / 15 : 1;
    
    // Render BETH rows
    for (let r = 0; r < H; r++) {
      let line = '';
      for (let c = 0; c < W; c++) {
        const ch = bethLines[r][c];
        if (ch === ' ') {
          // Gap - show fire through it sometimes
          if (Math.random() < 0.15 * fireStrength) {
            const h = 0.3 + Math.random() * 0.3;
            const ci = clamp(Math.floor((1 - h) * 5), 0, FIRE_COLORS.length - 1);
            line += FIRE_COLORS[ci] + pick(['^', '*', '.']);
          } else {
            line += ' ';
          }
        } else {
          // BETH character
          if (Math.random() < vis) {
            const ci = Math.floor((c / W) * BETH_COLORS.length);
            const col = BETH_COLORS[clamp(ci, 0, BETH_COLORS.length - 1)];
            line += (Math.random() > 0.95 ? '\x1b[97m' : col) + BRIGHT + ch;
          } else {
            // Not visible yet - show fire
            const h = 0.5 + Math.random() * 0.5;
            const ci = clamp(Math.floor((1 - h) * 4), 0, FIRE_COLORS.length - 1);
            line += FIRE_COLORS[ci] + pick(['#', '@', '%', '&']);
          }
        }
      }
      console.log(line + RESET);
    }
    
    // Fire rows below
    for (let fr = 0; fr < FIRE_H; fr++) {
      let line = '';
      const baseHeat = (1 - fr / FIRE_H) * fireStrength;
      for (let c = 0; c < W; c++) {
        const wave = Math.sin((c + frame * 2) * 0.15) * 0.15;
        const heat = clamp(baseHeat + wave + (Math.random() - 0.5) * 0.3, 0, 1);
        
        let ch;
        if (heat > 0.6) ch = pick(['#', '@', '%']);
        else if (heat > 0.35) ch = pick(['^', '*', '(', ')']);
        else if (heat > 0.15) ch = pick(['.', ':', '*']);
        else ch = ' ';
        
        const ci = clamp(Math.floor((1 - heat) * 6), 0, FIRE_COLORS.length - 1);
        line += FIRE_COLORS[ci] + ch;
      }
      console.log(line + RESET);
    }
    
    await sleep(frame < 15 ? 80 : frame < 45 ? 50 : 60);
  }
  
  // Final clean frame
  process.stdout.write(`\x1b[${TOTAL_H}A`);
  for (let r = 0; r < H; r++) {
    let line = '';
    for (let c = 0; c < W; c++) {
      const ci = Math.floor((c / W) * BETH_COLORS.length);
      line += BETH_COLORS[clamp(ci, 0, BETH_COLORS.length - 1)] + BRIGHT + bethLines[r][c];
    }
    console.log(line + RESET);
  }
  // Clear fire area with spaces
  for (let fr = 0; fr < FIRE_H; fr++) {
    console.log(' '.repeat(W));
  }
  
  process.stdout.write('\x1b[?25h');
  
  const tagline = BETH_TAGLINES[Math.floor(Math.random() * BETH_TAGLINES.length)];
  console.log('');
  process.stdout.write(COLORS.cyan + COLORS.bright + '"');
  for (const ch of tagline) {
    process.stdout.write(ch);
    await sleep(18);
  }
  console.log('"' + COLORS.reset);
  console.log('');
  
  // Show version and quick help
  console.log(`${COLORS.dim}v${CURRENT_VERSION}${COLORS.reset}                          ${COLORS.dim}AI Orchestrator for GitHub Copilot${COLORS.reset}`);
  console.log('');
  console.log(`${COLORS.bright}Commands:${COLORS.reset}`);
  console.log(`  ${COLORS.cyan}npx beth-copilot init${COLORS.reset}      Install Beth in your project`);
  console.log(`  ${COLORS.cyan}npx beth-copilot help${COLORS.reset}      Show full documentation`);
  console.log('');
  console.log(`${COLORS.bright}After install:${COLORS.reset} Open VS Code → Copilot Chat → ${COLORS.cyan}@Beth${COLORS.reset}`);
  console.log('');
}

function showBethBannerStatic({ showQuickHelp = true } = {}) {
  const bethColors = [
    '\x1b[38;5;196m',
    '\x1b[38;5;202m',
    '\x1b[38;5;208m',
    '\x1b[38;5;214m',
    '\x1b[38;5;220m',
    '\x1b[38;5;226m',
  ];
  
  const fireColors = [
    '\x1b[93m',        // bright yellow
    '\x1b[38;5;208m',  // orange
    '\x1b[91m',        // red
    '\x1b[38;5;52m',   // dark red
  ];
  
  console.log('\n');
  const bethChars = BETH_ASCII.map(line => [...line]);
  const bethWidth = bethChars[0].length;
  
  // BETH with gradient
  for (let row = 0; row < BETH_ASCII.length; row++) {
    let line = '';
    for (let c = 0; c < bethWidth; c++) {
      const char = bethChars[row][c];
      const colorIndex = Math.floor((c / bethWidth) * bethColors.length);
      line += bethColors[Math.min(colorIndex, bethColors.length - 1)] + COLORS.bright + char;
    }
    console.log(line + COLORS.reset);
  }
  

  
  const tagline = BETH_TAGLINES[Math.floor(Math.random() * BETH_TAGLINES.length)];
  console.log('');
  console.log(COLORS.cyan + COLORS.bright + '"' + tagline + '"' + COLORS.reset);
  console.log('');
  
  // Show version and quick help (optional)
  if (showQuickHelp) {
    console.log(`${COLORS.dim}v${CURRENT_VERSION}${COLORS.reset}                          ${COLORS.dim}AI Orchestrator for GitHub Copilot${COLORS.reset}`);
    console.log('');
    console.log(`${COLORS.bright}Commands:${COLORS.reset}`);
    console.log(`  ${COLORS.cyan}npx beth-copilot init${COLORS.reset}      Install Beth in your project`);
    console.log(`  ${COLORS.cyan}npx beth-copilot help${COLORS.reset}      Show full documentation`);
    console.log('');
    console.log(`${COLORS.bright}After install:${COLORS.reset} Open VS Code → Copilot Chat → ${COLORS.cyan}@Beth${COLORS.reset}`);
    console.log('');
  }
}

// Compact Beth portrait with colors
const BETH_PORTRAIT = [
  '       .╭━━━━━━━╮.',
  '    ╭──╯ ▒▓▓▓▓▒ ╰──╮',
  '   ╱  ▓██████████▓  ╲',
  '  ╱  ████▓▓██▓▓████  ╲',
  '  │  ███ ◉ ██ ◉ ███  │',
  '  │   ███▄▄▄▄▄▄███   │',
  '  │    ▀██▄══▄██▀    │',
  '  │      ╰────╯      │',
  '  │   ▓██████████▓   │',
  '  ╲   ████████████   ╱',
  '   ╲  ▀██████████▀  ╱',
  '    ╰───╮      ╭───╯',
  '        ╰──────╯',
];

// Portrait animation for init command
async function animatePortrait() {
  const AMBER = '\x1b[38;2;218;165;32m';
  const GOLD = '\x1b[38;2;255;215;0m';
  const SKIN = '\x1b[38;2;235;210;160m';
  const DARK = '\x1b[38;2;139;90;43m';
  const EYE = '\x1b[38;2;70;130;180m';
  const LIP = '\x1b[38;2;180;80;80m';
  const WHITE = '\x1b[38;2;255;255;255m';
  const RESET = '\x1b[0m';
  const BOLD = '\x1b[1m';
  const DIM = '\x1b[2m';
  
  // Hide cursor
  process.stdout.write('\x1b[?25l');
  
  try {
    // Clear screen
    process.stdout.write('\x1b[2J\x1b[H');
    await sleep(200);
    
    // Quick glitch effect
    const glitchChars = '░▒▓█';
    for (let frame = 0; frame < 3; frame++) {
      process.stdout.write('\x1b[H');
      for (let j = 0; j < 5; j++) {
        const col = Math.floor(Math.random() * 20) + 5;
        const row = Math.floor(Math.random() * 10) + 2;
        const r = Math.floor(Math.random() * 150 + 100);
        const g = Math.floor(Math.random() * 100 + 50);
        const b = Math.floor(Math.random() * 50);
        const char = glitchChars[Math.floor(Math.random() * glitchChars.length)];
        process.stdout.write(`\x1b[${row};${col}H\x1b[38;2;${r};${g};${b}m${char.repeat(3)}`);
      }
      await sleep(50);
    }
    
    // Display portrait with colors
    process.stdout.write('\x1b[2J\x1b[H');
    console.log();
    
    for (let i = 0; i < BETH_PORTRAIT.length; i++) {
      let line = BETH_PORTRAIT[i];
      // Colorize: frame in amber, face content in skin tones
      line = line
        .replace(/[╭╮╯╰│╱╲━.─]/g, `${AMBER}$&${RESET}`)
        .replace(/[▓█▒░▀▄▐▌]/g, `${SKIN}$&${RESET}`)
        .replace(/◉/g, `${EYE}◉${RESET}`)
        .replace(/══/g, `${LIP}══${RESET}`);
      console.log('  ' + line);
      await sleep(40);
    }
    
    await sleep(300);
    
    // Banner below portrait
    console.log();
    console.log(`  ${GOLD}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);
    console.log(`  ${AMBER}${BOLD}        B E T H${RESET}`);
    console.log(`  ${DIM}${WHITE}   AI Agent Orchestrator${RESET}`);
    console.log(`  ${GOLD}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);
    
    await sleep(300);
    
    // Typewriter quote
    const quote = BETH_TAGLINES[Math.floor(Math.random() * BETH_TAGLINES.length)];
    console.log();
    process.stdout.write(`  ${AMBER}"`);
    for (const ch of quote) {
      process.stdout.write(ch);
      await sleep(20);
    }
    console.log(`"${RESET}`);
    console.log();
    
  } finally {
    // Show cursor
    process.stdout.write('\x1b[?25h');
  }
}

// Detect if we can do animations (TTY and not piped)
function canAnimate() {
  return process.stdout.isTTY && !process.env.CI && !process.env.NO_COLOR;
}

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

function logDebug(message) {
  if (globalThis.VERBOSE) {
    log(`  [debug] ${message}`, COLORS.yellow);
  }
}

function showPathDiagnostics() {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  const isWindows = process.platform === 'win32';
  
  console.log('');
  log('PATH Diagnostics:', COLORS.bright);
  logInfo(`Platform: ${process.platform}`);
  logInfo(`HOME: ${homeDir}`);
  logInfo(`PATH: ${process.env.PATH}`);
  
  if (isWindows) {
    logInfo(`APPDATA: ${process.env.APPDATA || '(not set)'}`);
    logInfo(`npm prefix: Run "npm config get prefix" to check`);
  } else {
    logInfo(`npm prefix: Run "npm config get prefix" to check`);
    logInfo(`Common locations: ~/.local/bin, /usr/local/bin, ~/.npm-global/bin`);
  }
  console.log('');
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

function getBacklogPath() {
  // Check if backlog is available in PATH
  try {
    logDebug('Checking if backlog is in PATH...');
    execSync('backlog --version', { stdio: 'ignore' });
    logDebug('Found backlog in PATH');
    return 'backlog';
  } catch {
    logDebug('backlog not in PATH, checking common locations...');
    // Check common installation paths
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    const isWindows = process.platform === 'win32';
    
    const commonPaths = isWindows ? [
      join(process.env.APPDATA || '', 'npm', 'backlog.cmd'),
      join(homeDir, 'AppData', 'Roaming', 'npm', 'backlog.cmd'),
      join(homeDir, 'AppData', 'Local', 'npm-global', 'backlog.cmd'),
    ] : [
      join(homeDir, '.local', 'bin', 'backlog'),
      join(homeDir, 'bin', 'backlog'),
      '/usr/local/bin/backlog',
      join(homeDir, '.npm-global', 'bin', 'backlog'),
      join(homeDir, '.bun', 'bin', 'backlog'),
    ];
    
    for (const backlogPath of commonPaths) {
      logDebug(`Checking: ${backlogPath}`);
      if (existsSync(backlogPath)) {
        logDebug(`Found at: ${backlogPath}`);
        return backlogPath;
      }
    }
    
    logDebug('backlog not found in any common location');
    return null;
  }
}

function isBacklogCliInstalled() {
  return getBacklogPath() !== null;
}

function getBeadsPath() {
  // Check if bd is available in PATH
  try {
    logDebug('Checking if bd is in PATH...');
    execSync('bd --version', { stdio: 'ignore' });
    logDebug('Found bd in PATH');
    return 'bd';
  } catch {
    logDebug('bd not in PATH, checking common locations...');
    // Check common installation paths based on platform
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    const isWindows = process.platform === 'win32';
    
    const commonPaths = isWindows ? [
      // Windows: npm global, Go bin, local apps
      join(process.env.APPDATA || '', 'npm', 'bd.cmd'),
      join(homeDir, 'AppData', 'Roaming', 'npm', 'bd.cmd'),
      join(homeDir, 'AppData', 'Local', 'Microsoft', 'WindowsApps', 'bd.exe'),
      join(homeDir, 'go', 'bin', 'bd.exe'),
      join(process.env.GOPATH || join(homeDir, 'go'), 'bin', 'bd.exe'),
    ] : [
      // Unix: homebrew, npm global, go bin, local bin
      '/opt/homebrew/bin/bd',
      '/usr/local/bin/bd',
      join(homeDir, '.local', 'bin', 'bd'),
      join(homeDir, 'bin', 'bd'),
      join(homeDir, '.npm-global', 'bin', 'bd'),
      join(homeDir, 'go', 'bin', 'bd'),
      join(process.env.GOPATH || join(homeDir, 'go'), 'bin', 'bd'),
    ];
    
    for (const bdPath of commonPaths) {
      logDebug(`Checking: ${bdPath}`);
      if (existsSync(bdPath)) {
        logDebug(`Found at: ${bdPath}`);
        return bdPath;
      }
    }
    
    logDebug('bd not found in any common location');
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

/**
 * Installs the backlog.md CLI globally via npm.
 * 
 * SECURITY NOTE - shell:true usage:
 * - Required for cross-platform npm execution (npm.cmd on Windows, npm on Unix)
 * - Arguments are HARDCODED - no user input is passed to the shell
 * - Command injection risk: NONE (no dynamic/user-supplied values)
 * 
 * Alternative considered: Using platform-specific binary names (npm.cmd vs npm)
 * would eliminate shell:true but adds complexity and edge cases for non-standard installs.
 * 
 * @returns {Promise<boolean>} True if installation succeeded and was verified
 */
async function installBacklogCli() {
  const isWindows = process.platform === 'win32';
  const isMac = process.platform === 'darwin';
  
  log('\nInstalling backlog.md CLI via npm...', COLORS.cyan);
  logInfo('npm install -g backlog.md');
  
  // SECURITY: shell:true is required for cross-platform npm execution.
  // All arguments are hardcoded constants - no user input reaches the shell.
  return new Promise((resolve) => {
    const child = spawn('npm', ['install', '-g', 'backlog.md'], {
      stdio: 'inherit',
      shell: true
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        // CRITICAL: Verify installation actually worked before claiming success
        const verifiedPath = getBacklogPath();
        if (verifiedPath) {
          logSuccess('backlog.md CLI installed and verified!');
          resolve(true);
        } else {
          logWarning('npm reported success but backlog CLI not found in PATH.');
          logInfo('This can happen if npm global bin is not in your PATH.');
          if (globalThis.VERBOSE) {
            showPathDiagnostics();
          } else {
            logInfo('Run with --verbose for PATH diagnostics.');
          }
          console.log('');
          showBacklogAlternatives(isMac);
          resolve(false);
        }
      } else {
        logError('npm install failed.');
        console.log('');
        showBacklogAlternatives(isMac);
        resolve(false);
      }
    });
    
    child.on('error', () => {
      logError('Failed to run npm.');
      logInfo('Make sure npm is installed and in your PATH.');
      resolve(false);
    });
  });
}

function showBacklogAlternatives(isMac) {
  logInfo('Alternative installation methods:');
  if (isMac) {
    logInfo('  Homebrew: brew install backlog-md');
  }
  logInfo('  Bun:      bun install -g backlog.md');
  logInfo('');
  logInfo('Learn more: https://github.com/MrLesk/Backlog.md');
}

/**
 * Installs the beads CLI globally via npm.
 * 
 * SECURITY NOTE - shell:true usage:
 * - Required for cross-platform npm execution (npm.cmd on Windows, npm on Unix)
 * - Arguments are HARDCODED - no user input is passed to the shell
 * - Command injection risk: NONE (no dynamic/user-supplied values)
 * 
 * Alternative considered: Using platform-specific binary names (npm.cmd vs npm)
 * would eliminate shell:true but adds complexity and edge cases for non-standard installs.
 * 
 * @returns {Promise<boolean>} True if installation succeeded and was verified
 */
async function installBeads() {
  const isWindows = process.platform === 'win32';
  const isMac = process.platform === 'darwin';
  
  log('\nInstalling beads CLI via npm...', COLORS.cyan);
  logInfo('npm install -g @beads/bd');
  
  // SECURITY: shell:true is required for cross-platform npm execution.
  // All arguments are hardcoded constants - no user input reaches the shell.
  return new Promise((resolve) => {
    const child = spawn('npm', ['install', '-g', '@beads/bd'], {
      stdio: 'inherit',
      shell: true
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        // CRITICAL: Verify installation actually worked before claiming success
        // npm can exit 0 even when the package isn't properly installed
        const verifiedPath = getBeadsPath();
        if (verifiedPath) {
          logSuccess('beads CLI installed and verified!');
          resolve(true);
        } else {
          logWarning('npm reported success but beads CLI not found in PATH.');
          logInfo('This can happen if npm global bin is not in your PATH.');
          if (globalThis.VERBOSE) {
            showPathDiagnostics();
          } else {
            logInfo('Run with --verbose for PATH diagnostics.');
          }
          console.log('');
          showBeadsAlternatives(isWindows, isMac);
          resolve(false);
        }
      } else {
        logError('npm install failed.');
        console.log('');
        showBeadsAlternatives(isWindows, isMac);
        resolve(false);
      }
    });
    
    child.on('error', () => {
      logError('Failed to run npm.');
      logInfo('Make sure npm is installed and in your PATH.');
      resolve(false);
    });
  });
}

function showBeadsAlternatives(isWindows, isMac) {
  logInfo('Alternative installation methods:');
  if (isWindows) {
    logInfo('  PowerShell: irm https://raw.githubusercontent.com/steveyegge/beads/main/install.ps1 | iex');
    logInfo('  Go:         go install github.com/steveyegge/beads/cmd/bd@latest');
  } else {
    if (isMac) {
      logInfo('  Homebrew:   brew install beads');
    }
    logInfo('  Script:     curl -fsSL https://raw.githubusercontent.com/steveyegge/beads/main/scripts/install.sh | bash');
    logInfo('  Go:         go install github.com/steveyegge/beads/cmd/bd@latest');
  }
  logInfo('');
  logInfo('Learn more: https://github.com/steveyegge/beads');
}

/**
 * Initializes beads in the current project directory.
 * 
 * SECURITY NOTE - shell:true usage:
 * - bdPath is validated via getBeadsPath() which only returns paths that:
 *   1. Pass execSync('bd --version') verification, OR
 *   2. Exist on disk (verified via existsSync) from a HARDCODED list of paths
 * - Arguments are HARDCODED ('init') - no user input is passed to the shell
 * - Command injection risk: LOW (bdPath is validated, no user input in args)
 * 
 * The shell:true is used for PATH resolution consistency, though it could be
 * eliminated since we have an absolute path. Kept for consistency with other
 * spawn calls and to handle edge cases in shell script wrappers.
 * 
 * @param {string} cwd - Current working directory (validated by caller)
 * @returns {Promise<boolean>} True if initialization succeeded
 */
async function initializeBeads(cwd) {
  log('\nInitializing beads in project...', COLORS.cyan);
  
  const bdPath = getBeadsPath();
  if (!bdPath) {
    logWarning('Failed to initialize beads. Run manually: bd init');
    return false;
  }
  
  // SECURITY: bdPath is validated by getBeadsPath() (existsSync check).
  // Only 'init' argument is passed - no user input reaches the shell.
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
  showBethBannerStatic({ showQuickHelp: false });
  console.log(`${COLORS.bright}Beth${COLORS.reset} - AI Orchestrator for GitHub Copilot

${COLORS.bright}Usage:${COLORS.reset}
  npx beth-copilot init [options]     Initialize Beth in current directory
  npx beth-copilot help               Show this help message

${COLORS.bright}Options:${COLORS.reset}
  --force                             Overwrite existing files
  --skip-backlog                      Don't create Backlog.md
  --skip-mcp                          Don't create mcp.json.example
  --skip-beads                        Skip beads check (not recommended)
  --verbose                           Show detailed diagnostics on errors

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
  
  // Show Beth's fire animation
  if (canAnimate()) {
    await animateBethBanner();
  } else {
    showBethBannerStatic({ showQuickHelp: false });
  }
  
  log(`${COLORS.yellow}Tip: Run with --verbose for detailed diagnostics if you hit issues.${COLORS.reset}`);

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
            if (customPath) {
              const validation = validateBeadsPath(customPath);
              if (validation.valid) {
                bdPath = validation.normalizedPath;
                logSuccess(`Found beads at: ${bdPath}`);
              } else {
                logError(`Invalid path: ${validation.error}`);
              }
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
          logInfo('  npm install -g @beads/bd');
          process.exit(1);
        }
      }
    }
    
    // Show path info if not in standard PATH
    if (bdPath && bdPath !== 'bd') {
      logSuccess(`beads CLI found at: ${bdPath}`);
      const isWindows = process.platform === 'win32';
      if (isWindows) {
        logInfo('Tip: Ensure npm global bin is in your PATH to use "bd" directly.');
      } else {
        logInfo('Tip: Add ~/.local/bin or npm global bin to your PATH to use "bd" directly.');
      }
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
    
    let backlogPath = getBacklogPath();
    
    // Loop until backlog.md is installed
    while (!backlogPath) {
      logWarning('backlog.md CLI is not installed.');
      logInfo('Beth requires backlog.md for human-readable task tracking and boards.');
      logInfo('Learn more: https://github.com/MrLesk/Backlog.md');
      console.log('');
      
      const shouldInstall = await promptYesNo('Install backlog.md CLI now? (required)');
      if (shouldInstall) {
        const installed = await installBacklogCli();
        if (installed) {
          // Re-check for backlog after installation
          backlogPath = getBacklogPath();
          if (!backlogPath) {
            console.log('');
            logWarning('backlog.md installed but not found in common paths.');
            logInfo('The installer may have placed it in a custom location.');
            console.log('');
            logInfo('Please try one of these options:');
            logInfo('  1. Open a NEW terminal and run: npx beth-copilot init');
            logInfo('  2. Run: source ~/.bashrc (or ~/.zshrc) then retry');
            console.log('');
            
            const retryCheck = await promptYesNo('Retry detection?');
            if (retryCheck) {
              backlogPath = getBacklogPath();
            }
          }
        } else {
          console.log('');
          logError('Installation failed.');
          logInfo('You can try installing manually:');
          logInfo('  npm install -g backlog.md');
          if (process.platform === 'darwin') {
            logInfo('  brew install backlog-md');
          }
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
  const finalBacklogOk = skipBacklog || getBacklogPath();
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
const ALLOWED_FLAGS = ['--force', '--skip-backlog', '--skip-mcp', '--skip-beads', '--verbose'];
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
  verbose: args.includes('--verbose'),
};

// Set global verbose flag for logDebug
globalThis.VERBOSE = options.verbose;

// Validate unknown flags (exclude --help which is handled as a command)
const unknownFlags = args.filter(arg => arg.startsWith('--') && !ALLOWED_FLAGS.includes(arg) && arg !== '--help');
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
