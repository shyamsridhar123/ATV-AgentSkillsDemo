#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { dirname, join, relative } from 'path';
import { existsSync, mkdirSync, readdirSync, statSync, copyFileSync, readFileSync, writeFileSync, unlinkSync, chmodSync } from 'fs';
import { createRequire } from 'module';
import { execSync, spawn } from 'child_process';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEMPLATES_DIR = join(__dirname, '..', 'templates');

// TypeScript commands are in dist/ after build
const DIST_DIR = join(__dirname, '..', 'dist');

// Dynamic import for TypeScript commands (lazy loaded)
async function loadTsCommand(commandName) {
  const commandPath = join(DIST_DIR, 'cli', 'commands', `${commandName}.js`);
  if (!existsSync(commandPath)) {
    console.error(`Command '${commandName}' not found. Run 'npm run build' first.`);
    process.exit(1);
  }
  return import(commandPath);
}

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
  
  // Show version line only — commands are shown after install completes
  console.log(`${COLORS.dim}v${CURRENT_VERSION}${COLORS.reset}                          ${COLORS.dim}AI Orchestrator for GitHub Copilot${COLORS.reset}`);
  console.log('');
}

function showBethBannerStatic() {
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
  
  // Show version (always)
  console.log(`${COLORS.dim}v${CURRENT_VERSION}${COLORS.reset}                          ${COLORS.dim}AI Orchestrator for GitHub Copilot${COLORS.reset}`);
  console.log('');
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

/**
 * User-facing error with actionable fix instructions
 */
class UserError extends Error {
  constructor(message, { problem, fix, command } = {}) {
    super(message);
    this.name = 'UserError';
    this.problem = problem;
    this.fix = fix;
    this.command = command;
  }
}

/**
 * Display a user-friendly error with fix instructions
 */
function showUserError(error) {
  console.log('');
  console.log(`${COLORS.red}╔════════════════════════════════════════════════════════════╗${COLORS.reset}`);
  console.log(`${COLORS.red}║${COLORS.reset}  ${COLORS.bright}${COLORS.red}Installation Error${COLORS.reset}                                       ${COLORS.red}║${COLORS.reset}`);
  console.log(`${COLORS.red}╚════════════════════════════════════════════════════════════╝${COLORS.reset}`);
  console.log('');
  
  if (error.problem) {
    console.log(`${COLORS.bright}Problem:${COLORS.reset}`);
    console.log(`  ${error.problem}`);
    console.log('');
  }
  
  if (error.fix) {
    console.log(`${COLORS.bright}Fix:${COLORS.reset}`);
    console.log(`  ${error.fix}`);
    console.log('');
  }
  
  if (error.command) {
    console.log(`${COLORS.bright}Run this command:${COLORS.reset}`);
    console.log(`  ${COLORS.cyan}${error.command}${COLORS.reset}`);
    console.log('');
  }
  
  if (globalThis.VERBOSE) {
    console.log(`${COLORS.dim}Stack trace:${COLORS.reset}`);
    console.log(`${COLORS.dim}${error.stack}${COLORS.reset}`);
    console.log('');
  }
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

const BETH_GUARD_BEGIN = '# --- BEGIN BETH GUARD ---';
const BETH_GUARD_END = '# --- END BETH GUARD ---';

/**
 * Generate the shell script to append to the pre-push hook.
 * Pure shell — no Node dependency at hook time for speed.
 */
function generateGuardScript() {
  return `
${BETH_GUARD_BEGIN}
# Branch discipline enforcement — installed by beth-copilot
# Bypass: BETH_SKIP_PUSH_GUARD=1 git push
if [ "\$BETH_SKIP_PUSH_GUARD" = "1" ]; then
  echo "⚠ Pre-push guard bypassed (BETH_SKIP_PUSH_GUARD=1)" >&2
else
  _beth_branch=\$(git branch --show-current 2>/dev/null)

  # Block pushes from protected branches
  case "\$_beth_branch" in
    main|master)
      echo "✗ Pushing from '\$_beth_branch' is blocked. Work on an epic branch." >&2
      echo "  Set BETH_SKIP_PUSH_GUARD=1 to bypass." >&2
      exit 1
      ;;
  esac

  # Warn if not on an epic or release branch
  case "\$_beth_branch" in
    epic/*) ;;
    release/*) ;;
    "")
      echo "⚠ Detached HEAD — no branch name. Proceeding anyway." >&2
      ;;
    *)
      echo "⚠ Branch '\$_beth_branch' doesn't follow the epic/<id> convention." >&2
      ;;
  esac
fi
${BETH_GUARD_END}
`;
}

function showHelp() {
  showBethBannerStatic();
  console.log(`${COLORS.bright}Beth${COLORS.reset} - AI Orchestrator for GitHub Copilot

${COLORS.bright}Commands:${COLORS.reset}
  ${COLORS.cyan}npx beth-copilot init${COLORS.reset} [options]     Initialize Beth in current directory
  ${COLORS.cyan}npx beth-copilot update${COLORS.reset} [options]   Update project files to latest templates
  ${COLORS.cyan}npx beth-copilot doctor${COLORS.reset}             Check system health and dependencies
  ${COLORS.cyan}npx beth-copilot land${COLORS.reset} [options]     Automated session completion (test, commit, push)
  ${COLORS.cyan}npx beth-copilot quickstart${COLORS.reset}         Run init + doctor
  ${COLORS.cyan}npx beth-copilot pre-push-guard${COLORS.reset}     Run branch discipline checks (used by git hook)
  ${COLORS.cyan}npx beth-copilot help${COLORS.reset}               Show this help message

${COLORS.bright}Init Options:${COLORS.reset}
  --force                             Overwrite existing files
  --skip-backlog                      Don't create Backlog.md
  --skip-mcp                          Don't create mcp.json.example
  --verbose                           Show detailed diagnostics on errors

${COLORS.bright}Update Options:${COLORS.reset}
  --check-only                        Report update status without modifying files
  --force                             Overwrite user-modified files with templates
  --verbose                           Show per-file detail

${COLORS.bright}Land Options:${COLORS.reset}
  --message, -m <msg>                 Custom commit message
  --skip-tests                        Skip test execution (not recommended)
  --force, -f                         Push even if tests fail (dangerous)
  --dry-run                           Show what would happen without executing

${COLORS.bright}Examples:${COLORS.reset}
  npx beth-copilot init               Set up Beth in current project
  npx beth-copilot init --force       Overwrite existing Beth files
  npx beth-copilot update             Update to latest templates
  npx beth-copilot update --check-only See what changed without modifying
  npx beth-copilot doctor             Verify installation health
  npx beth-copilot land -m "feat: new component"  Commit and push session work

${COLORS.bright}What gets installed:${COLORS.reset}
  .github/agents/                     7 specialized AI agents
  .github/skills/                     Domain knowledge modules
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
  
  if (existsSync(dest)) {
    const destStats = statSync(dest);
    if (!destStats.isDirectory()) {
      if (force) {
        // Destination exists as a file but should be a directory - remove it
        unlinkSync(dest);
        mkdirSync(dest, { recursive: true });
      } else {
        const relativePath = relative(process.cwd(), dest);
        throw new UserError(
          `Path conflict: ${relativePath}`,
          {
            problem: `"${relativePath}" exists as a file, but Beth needs it to be a directory.`,
            fix: 'Either remove the file manually, or use --force to let Beth handle it.',
            command: 'npx beth-copilot@latest init --force'
          }
        );
      }
    }
  } else {
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
  const { force = false, skipBacklog = false, skipMcp = false } = options;
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
    showBethBannerStatic();
  }
  
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

  // Install .vscode/mcp.json with required MCP servers (unless --skip-mcp)
  if (!skipMcp) {
    const mcpJsonDest = join(cwd, '.vscode', 'mcp.json');
    if (!existsSync(join(cwd, '.vscode'))) {
      mkdirSync(join(cwd, '.vscode'), { recursive: true });
    }
    
    if (existsSync(mcpJsonDest) && !force) {
      // Verify existing mcp.json has the required servers
      try {
        const existing = JSON.parse(readFileSync(mcpJsonDest, 'utf-8'));
        const missing = [];
        if (!existing.servers?.playwright) missing.push('playwright');
        if (!existing.servers?.backlog) missing.push('backlog');
        
        if (missing.length > 0) {
          logWarning(`.vscode/mcp.json exists but missing required servers: ${missing.join(', ')}`);
          logInfo('Add them manually or run with --force to overwrite');
        } else {
          logSuccess('.vscode/mcp.json already has required MCP servers');
        }
      } catch {
        logWarning('.vscode/mcp.json exists but could not be parsed — verify it manually');
      }
    } else {
      const mcpTemplateSrc = join(TEMPLATES_DIR, 'mcp.json.example');
      if (existsSync(mcpTemplateSrc)) {
        copyFileSync(mcpTemplateSrc, mcpJsonDest);
        copiedFiles.push('.vscode/mcp.json');
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

  // Final verification
  console.log('');
  log('Verifying installation...', COLORS.cyan);
  logSuccess('All files installed and configured!');

  // Next steps
  console.log(`
${COLORS.bright}Next steps:${COLORS.reset}
  1. Open this project in VS Code
  2. Open Copilot Chat (${COLORS.cyan}Ctrl+Alt+I${COLORS.reset} / ${COLORS.cyan}Cmd+Alt+I${COLORS.reset})
  3. Type ${COLORS.cyan}@Beth${COLORS.reset} to start - she's your orchestrator

${COLORS.bright}Pro tip:${COLORS.reset} Start every session with ${COLORS.cyan}@Beth${COLORS.reset} and let her route work to the right specialists.`);

  // Commands at the bottom — easy to find and copy-paste
  console.log(`
${COLORS.bright}Commands:${COLORS.reset}
  ${COLORS.cyan}npx beth-copilot update${COLORS.reset}     Update Beth to the latest templates
  ${COLORS.cyan}npx beth-copilot doctor${COLORS.reset}     Check system health and dependencies
  ${COLORS.cyan}npx beth-copilot land${COLORS.reset}       Automated session completion (test, commit, push)
  ${COLORS.cyan}npx beth-copilot help${COLORS.reset}       Show all commands, options, and documentation
`);

  console.log(`${COLORS.dim}Tip: Run with --verbose for detailed diagnostics if you hit issues.${COLORS.reset}`);
  console.log(`${COLORS.dim}Documentation: https://github.com/stephschofield/beth${COLORS.reset}`);
  console.log(`${COLORS.cyan}"They broke my wings and forgot I had claws."${COLORS.reset}`);
  console.log('');
}

// Input validation constants
const ALLOWED_COMMANDS = ['init', 'help', '--help', '-h', 'doctor', 'quickstart', 'pre-push-guard', 'update', 'land'];
const ALLOWED_FLAGS = ['--force', '--skip-backlog', '--skip-mcp', '--verbose', '--reason', '-r', '-f', '--skip-tests', '--message', '-m', '--dry-run', '--check-only'];
const MAX_ARG_LENGTH = 50;

// Validate and sanitize input
function validateArgs(args) {
  // The 'land' and 'update' commands handle their own arg validation
  const command = args[0]?.toLowerCase();
  if (command === 'land' || command === 'update') return;

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
  verbose: args.includes('--verbose'),
};

// Set global verbose flag for logDebug
globalThis.VERBOSE = options.verbose;

// Validate unknown flags (exclude --help which is handled as a command)
// Skip for 'land' and 'update' commands which handle their own arg parsing
if (command !== 'land' && command !== 'update') {
  const unknownFlags = args.filter(arg => arg.startsWith('--') && !ALLOWED_FLAGS.includes(arg) && arg !== '--help');
  if (unknownFlags.length > 0) {
    logError(`Unknown flag: ${unknownFlags[0].slice(0, MAX_ARG_LENGTH)}`);
    console.log('Run "npx beth-copilot help" for usage information.');
    process.exit(1);
  }
}

switch (command) {
  case 'init':
    try {
      await init(options);
    } catch (error) {
      if (error instanceof UserError) {
        showUserError(error);
        process.exit(1);
      }
      throw error;
    }
    break;
  case 'doctor':
    {
      const { doctor } = await loadTsCommand('doctor');
      await doctor(options);
    }
    break;
  case 'quickstart':
    {
      const { quickstart } = await loadTsCommand('quickstart');
      await quickstart(options);
    }
    break;
  case 'land':
    {
      const { land } = await loadTsCommand('land');
      // Pass raw args after 'land' — the command handles its own parsing
      const landArgs = process.argv.slice(3);
      await land(landArgs);
    }
    break;
  case 'update':
    {
      const { update } = await loadTsCommand('update');
      const updateArgs = process.argv.slice(3);
      await update(updateArgs);
    }
    break;
  case 'pre-push-guard':
    {
      const { prePushGuard } = await loadTsCommand('pre-push-guard');
      await prePushGuard();
    }
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
