/**
 * Update Command
 *
 * Updates project files to the latest Beth templates.
 * Compares installed files against the package templates and
 * copies new or updated files into the project.
 *
 * Behavior:
 *   - New files (exist in template but not in project) → always installed
 *   - Unchanged files (content matches template) → skipped
 *   - User-modified files (content differs from template):
 *     - Without --force → skipped with warning
 *     - With --force → overwritten
 *   - --check-only → reports status without modifying anything
 *   - --verbose → shows per-file detail
 *
 * Options:
 *   --check-only    Report update status without modifying files
 *   --force         Overwrite user-modified files with template versions
 *   --verbose       Show per-file detail
 */

import { existsSync, readFileSync, mkdirSync, readdirSync, statSync, copyFileSync } from 'fs';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

export interface UpdateOptions {
  checkOnly?: boolean;
  force?: boolean;
  verbose?: boolean;
}

interface FileAction {
  relativePath: string;
  action: 'new' | 'updated' | 'skipped' | 'unchanged';
  reason?: string;
}

function log(message: string, color = ''): void {
  console.log(`${color}${message}${COLORS.reset}`);
}

/**
 * Parse update command arguments from raw argv.
 */
export function parseUpdateArgs(rawArgs: string[]): UpdateOptions {
  const opts: UpdateOptions = {};
  for (const arg of rawArgs) {
    if (arg === '--check-only') opts.checkOnly = true;
    else if (arg === '--force' || arg === '-f') opts.force = true;
    else if (arg === '--verbose') opts.verbose = true;
  }
  return opts;
}

/**
 * Resolve the templates directory from the package installation.
 */
function getTemplatesDir(): string {
  // Walk up from dist/cli/commands/update.js → package root → templates/
  const thisFile = fileURLToPath(import.meta.url);
  const packageRoot = join(dirname(thisFile), '..', '..', '..');
  return join(packageRoot, 'templates');
}

/**
 * Recursively collect all files in a directory, returning relative paths.
 */
function collectFiles(dir: string, base: string = dir): string[] {
  const results: string[] = [];
  if (!existsSync(dir)) return results;

  const entries = readdirSync(dir);
  for (const entry of entries) {
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      results.push(...collectFiles(full, base));
    } else {
      results.push(relative(base, full));
    }
  }
  return results;
}

/**
 * Get the current package version.
 */
function getPackageVersion(): string {
  try {
    const thisFile = fileURLToPath(import.meta.url);
    const packageRoot = join(dirname(thisFile), '..', '..', '..');
    const pkg = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf-8'));
    return pkg.version || 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Check npm registry for latest version.
 * Returns null on any error (network, timeout, parse).
 */
async function checkLatestVersion(): Promise<string | null> {
  try {
    const response = await fetch('https://registry.npmjs.org/beth-copilot/latest', {
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return null;
    const data = await response.json() as { version?: string };
    return data.version ?? null;
  } catch {
    return null;
  }
}

/**
 * Main update command.
 */
export async function update(rawArgs: string[]): Promise<void> {
  const opts = parseUpdateArgs(rawArgs);
  const cwd = process.cwd();
  const templatesDir = getTemplatesDir();
  const currentVersion = getPackageVersion();

  if (!existsSync(templatesDir)) {
    log('✗ Templates directory not found. Package may be corrupted.', COLORS.red);
    process.exitCode = 1;
    return;
  }

  // Version info
  const latestVersion = await checkLatestVersion();

  if (opts.verbose) {
    log(`Current version: ${currentVersion}`, COLORS.dim);
    if (latestVersion) {
      log(`Latest version:  ${latestVersion}`, COLORS.dim);
    } else {
      log('Latest version:  (could not check registry)', COLORS.dim);
    }
    log(`Templates dir:   ${templatesDir}`, COLORS.dim);
    log(`Project dir:     ${cwd}`, COLORS.dim);
    log('', '');
  }

  // Collect all template files
  const templateFiles = collectFiles(templatesDir);

  if (templateFiles.length === 0) {
    log('✗ No template files found. Package may be corrupted.', COLORS.red);
    process.exitCode = 1;
    return;
  }

  const actions: FileAction[] = [];

  for (const relPath of templateFiles) {
    const templatePath = join(templatesDir, relPath);
    const projectPath = join(cwd, relPath);
    const templateContent = readFileSync(templatePath, 'utf-8');

    if (!existsSync(projectPath)) {
      // New file — doesn't exist in project yet
      actions.push({ relativePath: relPath, action: 'new' });
    } else {
      const projectContent = readFileSync(projectPath, 'utf-8');
      if (projectContent === templateContent) {
        // Unchanged — matches template exactly
        actions.push({ relativePath: relPath, action: 'unchanged' });
      } else {
        // User-modified — content differs
        if (opts.force) {
          actions.push({ relativePath: relPath, action: 'updated', reason: 'force overwrite' });
        } else {
          actions.push({
            relativePath: relPath,
            action: 'skipped',
            reason: 'user-modified (use --force to overwrite)',
          });
        }
      }
    }
  }

  // --check-only: report and exit
  if (opts.checkOnly) {
    const newFiles = actions.filter(a => a.action === 'new');
    const modified = actions.filter(a => a.action === 'skipped' || a.action === 'updated');

    if (newFiles.length === 0 && modified.length === 0) {
      log(`✓ Project is up to date (version ${currentVersion})`, COLORS.green);
    } else {
      log(`Update available: ${newFiles.length} new, ${modified.length} changed files`, COLORS.yellow);
    }

    if (opts.verbose) {
      for (const a of actions) {
        const icon = a.action === 'unchanged' ? '·' : a.action === 'new' ? '+' : '~';
        log(`  ${icon} ${a.relativePath} (${a.action})`, COLORS.dim);
      }
    }

    process.exitCode = 0;
    return;
  }

  // Apply updates
  let installed = 0;
  let updated = 0;
  let skipped = 0;

  for (const action of actions) {
    const templatePath = join(templatesDir, action.relativePath);
    const projectPath = join(cwd, action.relativePath);

    switch (action.action) {
      case 'new': {
        const dir = dirname(projectPath);
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }
        copyFileSync(templatePath, projectPath);
        installed++;
        if (opts.verbose) {
          log(`  + ${action.relativePath}`, COLORS.green);
        }
        break;
      }
      case 'updated': {
        copyFileSync(templatePath, projectPath);
        updated++;
        if (opts.verbose) {
          log(`  ↻ ${action.relativePath} (overwritten)`, COLORS.yellow);
        }
        break;
      }
      case 'skipped': {
        skipped++;
        log(`  Skipped (modified): ${action.relativePath}`, COLORS.yellow);
        break;
      }
      case 'unchanged': {
        if (opts.verbose) {
          log(`  · ${action.relativePath} (unchanged)`, COLORS.dim);
        }
        break;
      }
    }
  }

  // Summary
  if (installed === 0 && updated === 0 && skipped === 0) {
    log(`\n✓ Project is already up to date (version ${currentVersion})`, COLORS.green);
  } else {
    log('');
    if (installed > 0) {
      log(`✓ ${installed} new file(s) installed`, COLORS.green);
    }
    if (updated > 0) {
      log(`✓ Updated ${updated} file(s)`, COLORS.green);
    }
    if (skipped > 0) {
      log(`⚠ Skipped ${skipped} user-modified file(s) (use --force to overwrite)`, COLORS.yellow);
    }
  }

  process.exitCode = 0;
}
