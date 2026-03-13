/**
 * Quickstart Command
 *
 * Streamlined setup for Beth:
 * - Checks if Beth is already initialized
 * - Runs doctor to validate setup
 * - Prints "what's next" guidance
 */

import { existsSync } from 'fs';
import { join } from 'path';
import { doctor } from './doctor.js';

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

interface QuickstartOptions {
  verbose?: boolean;
}

function log(message: string, color = ''): void {
  console.log(`${color}${message}${COLORS.reset}`);
}

function logSuccess(message: string): void {
  log(`✓ ${message}`, COLORS.green);
}

function logWarning(message: string): void {
  log(`⚠ ${message}`, COLORS.yellow);
}

function logInfo(message: string): void {
  log(`  ${message}`, COLORS.cyan);
}

/**
 * Check if Beth is initialized in the project
 */
function isBethInitialized(cwd: string): boolean {
  const agentsDir = join(cwd, '.github', 'agents');
  return existsSync(agentsDir);
}

/**
 * Main quickstart command
 */
export async function quickstart(options: QuickstartOptions = {}): Promise<void> {
  const { verbose = false } = options;
  const cwd = process.cwd();
  
  console.log('');
  log('Beth Quickstart', COLORS.bright);
  log('─'.repeat(40), COLORS.dim);
  
  // Step 1: Check if Beth is initialized
  if (!isBethInitialized(cwd)) {
    console.log('');
    logWarning('Beth not initialized in this project.');
    logInfo('Run: npx beth-copilot init');
    console.log('');
    logInfo('Then run: npx beth-copilot quickstart');
    console.log('');
    process.exit(1);
  }
  
  logSuccess('Beth is initialized');
  
  // Step 2: Run doctor (don't exit on failure, we still want to show next steps)
  console.log('');
  log('Running health check...', COLORS.cyan);
  
  await doctor({ verbose }, false);
  
  // Step 3: Print next steps
  console.log('');
  log('─'.repeat(40), COLORS.dim);
  log('\nQuick Start Guide:', COLORS.bright);
  console.log('');
  log('1. Open this project in VS Code', COLORS.cyan);
  log('2. Open Copilot Chat (Ctrl+Alt+I / Cmd+Alt+I)', COLORS.cyan);
  log('3. Type @Beth to start working', COLORS.cyan);
  console.log('');
  log('Pro tip:', COLORS.bright);
  logInfo('Start every session with @Beth and let her route work to specialists.');
  console.log('');
  log('Documentation:', COLORS.bright);
  logInfo('https://github.com/stephschofield/beth');
  console.log('');
  log('"They broke my wings and forgot I had claws."', COLORS.cyan);
  console.log('');
}
