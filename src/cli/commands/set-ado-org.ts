/**
 * set-ado-org Command
 *
 * Orchestrates the full ADO Sync setup flow:
 * 1. Check existing credentials (reuse if valid)
 * 2. Authenticate via Entra ID device code flow (or PAT fallback)
 * 3. Discover ADO organizations
 * 4. Select organization
 * 5. List and select project
 * 6. Save config to .beth/ado-sync.json
 * 7. Update .gitignore
 *
 * Covers FR-1, US-004 from PRD.
 */

import { createInterface } from 'readline';
import { join } from 'path';
import {
  loadConfig,
  saveConfig,
  isConfigured,
  type AdoSyncConfig,
} from '../lib/adoSyncConfig.js';
import {
  acquireTokenDeviceCode,
  type AuthOptions,
} from '../lib/entraAuth.js';
import { retrieve } from '../lib/credentialStore.js';
import {
  discoverOrganizations,
  listProjects,
  type AdoOrganization,
  type AdoProject,
} from '../lib/adoDiscovery.js';
import { ensureAdoSyncMcpEntry } from '../lib/mcpConfig.js';
import { discoverPython, VENV_DIR, venvBinDir, pythonExeName } from '../lib/pythonRuntime.js';

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

function log(message: string, color = ''): void {
  console.log(`${color}${message}${COLORS.reset}`);
}

function logError(message: string): void {
  console.error(`${COLORS.red}${COLORS.bright}ERROR:${COLORS.reset} ${COLORS.red}${message}${COLORS.reset}`);
}

/** Prompt for a single line of input */
async function prompt(question: string, inputStream = process.stdin, outputStream = process.stdout): Promise<string> {
  const rl = createInterface({ input: inputStream, output: outputStream });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/** Prompt for yes/no confirmation */
async function confirm(question: string, defaultYes = false): Promise<boolean> {
  const suffix = defaultYes ? '[Y/n]' : '[y/N]';
  const answer = await prompt(`${question} ${suffix} `);
  if (answer === '') return defaultYes;
  return answer.toLowerCase().startsWith('y');
}

/** Select from a numbered list. Returns the index. */
async function selectFromList<T>(
  items: T[],
  formatter: (item: T, index: number) => string,
  promptText: string
): Promise<number> {
  for (let i = 0; i < items.length; i++) {
    log(`  ${COLORS.cyan}${i + 1}.${COLORS.reset} ${formatter(items[i], i)}`);
  }
  console.log();

  while (true) {
    const answer = await prompt(promptText);
    const num = parseInt(answer, 10);
    if (num >= 1 && num <= items.length) {
      return num - 1;
    }
    log(`  Please enter a number between 1 and ${items.length}`, COLORS.yellow);
  }
}

/** Options for the set-ado-org command */
export interface SetAdoOrgOptions {
  /** Non-interactive mode for testing — provide these to skip prompts */
  _testOrgIndex?: number;
  _testProjectIndex?: number;
  _testConfirmChange?: boolean;
  /** Override input/output streams for testing */
  _inputStream?: NodeJS.ReadableStream;
  _outputStream?: NodeJS.WritableStream;
}

/**
 * The main set-ado-org command flow.
 */
export async function setAdoOrg(options: SetAdoOrgOptions = {}): Promise<void> {
  const cwd = process.cwd();

  log('\n  ADO Sync Configuration', `${COLORS.bright}${COLORS.magenta}`);
  log('  ─────────────────────', COLORS.dim);

  // Step 1: Check existing configuration
  if (isConfigured(cwd)) {
    const existingConfig = loadConfig(cwd);
    if (existingConfig) {
      log(`\n  Currently configured: ${COLORS.cyan}${existingConfig.organization}/${existingConfig.project}${COLORS.reset}`);
      log(`  Auth method: ${existingConfig.authMethod}`, COLORS.dim);

      const shouldChange = options._testConfirmChange ?? await confirm('\n  Change configuration?');
      if (!shouldChange) {
        log('\n  Configuration unchanged.', COLORS.dim);
        return;
      }
    }
  }

  // Step 2: Get credentials (reuse or authenticate)
  log('\n  Checking credentials...', COLORS.dim);
  let credential = await retrieve(cwd);
  let authOptions: AuthOptions = {};

  if (credential) {
    log(`  ${COLORS.green}✓${COLORS.reset} Authenticated as ${COLORS.cyan}${credential.username}${COLORS.reset}`);
  } else {
    log('\n  No valid credentials found. Starting Entra ID authentication...', COLORS.yellow);
    log('  (This will open a browser-based login flow)\n', COLORS.dim);

    try {
      const authResult = await acquireTokenDeviceCode(cwd, {
        ...authOptions,
        onDeviceCode: (message) => {
          log(`  ${COLORS.bright}${message}${COLORS.reset}`);
        },
      });
      credential = {
        type: 'entra',
        accessToken: authResult.accessToken,
        username: authResult.account.username,
        expiresOn: authResult.expiresOn,
      };
      log(`\n  ${COLORS.green}✓${COLORS.reset} Authenticated as ${COLORS.cyan}${credential.username}${COLORS.reset}`);
    } catch (error) {
      logError(error instanceof Error ? error.message : String(error));
      log('\n  Tip: You can also set BETH_ADO_PAT environment variable for PAT authentication.', COLORS.dim);
      process.exitCode = 1;
      return;
    }
  }

  // Step 3: Discover organizations
  log('\n  Discovering ADO organizations...', COLORS.dim);
  let organizations: AdoOrganization[];
  try {
    const discovery = await discoverOrganizations(credential.accessToken);
    organizations = discovery.organizations;
  } catch (error) {
    logError(`Failed to list organizations: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
    return;
  }

  if (organizations.length === 0) {
    logError('No Azure DevOps organizations found for this account.');
    log('  Check that your Entra account has access to an ADO org.', COLORS.dim);
    process.exitCode = 1;
    return;
  }

  // Step 4: Select organization (auto-select if only 1)
  let selectedOrg: AdoOrganization;
  if (organizations.length === 1) {
    selectedOrg = organizations[0];
    log(`  ${COLORS.green}✓${COLORS.reset} Auto-selected organization: ${COLORS.cyan}${selectedOrg.accountName}${COLORS.reset} (only one available)`);
  } else {
    log(`\n  Select an organization:\n`);
    const orgIndex = options._testOrgIndex ?? await selectFromList(
      organizations,
      (org) => org.accountName,
      `  Organization (1-${organizations.length}): `
    );
    selectedOrg = organizations[orgIndex];
  }

  // Step 5: List and select project
  log(`\n  Loading projects for ${COLORS.cyan}${selectedOrg.accountName}${COLORS.reset}...`, COLORS.dim);
  let projects: AdoProject[];
  try {
    projects = await listProjects(credential.accessToken, selectedOrg.accountName);
  } catch (error) {
    logError(`Failed to list projects: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
    return;
  }

  if (projects.length === 0) {
    logError(`No projects found in organization "${selectedOrg.accountName}".`);
    process.exitCode = 1;
    return;
  }

  let selectedProject: AdoProject;
  if (projects.length === 1) {
    selectedProject = projects[0];
    log(`  ${COLORS.green}✓${COLORS.reset} Auto-selected project: ${COLORS.cyan}${selectedProject.name}${COLORS.reset} (only one available)`);
  } else {
    log(`\n  Select a project:\n`);
    const projIndex = options._testProjectIndex ?? await selectFromList(
      projects,
      (proj) => proj.description ? `${proj.name} — ${proj.description}` : proj.name,
      `  Project (1-${projects.length}): `
    );
    selectedProject = projects[projIndex];
  }

  // Step 6: Save config
  log('\n  Saving configuration...', COLORS.dim);

  const existingConfig = loadConfig(cwd);
  const configUpdate: Partial<AdoSyncConfig> = {
    ...(existingConfig || {}),
    organization: selectedOrg.accountName,
    project: selectedProject.name,
    authMethod: 'entra',
  };

  saveConfig(cwd, configUpdate);

  // Step 7: Configure MCP server entry
  try {
    let pythonPath: string;
    try {
      const python = await discoverPython(cwd);
      // Prefer the expected venv path for consistency with ado-sync start
      const venvPython = join(cwd, VENV_DIR, venvBinDir(), pythonExeName());
      pythonPath = python.source === 'venv' ? python.pythonPath : venvPython;
    } catch {
      // No Python found — use a placeholder that ado-sync start will fix
      pythonPath = join(cwd, VENV_DIR, venvBinDir(), pythonExeName());
    }
    const mcpResult = ensureAdoSyncMcpEntry(cwd, pythonPath);
    if (mcpResult.action !== 'unchanged') {
      log(`  ${COLORS.green}✓${COLORS.reset} MCP server entry ${mcpResult.action} in .vscode/mcp.json`);
    }
  } catch (error) {
    log(`  ${COLORS.yellow}⚠${COLORS.reset} Could not update .vscode/mcp.json: ${error instanceof Error ? error.message : String(error)}`, COLORS.dim);
  }

  // Step 8: Success!
  log(`\n  ${COLORS.green}${COLORS.bright}✓ ADO Sync configured!${COLORS.reset}`);
  log(`  Organization: ${COLORS.cyan}${selectedOrg.accountName}${COLORS.reset}`);
  log(`  Project:      ${COLORS.cyan}${selectedProject.name}${COLORS.reset}`);
  log(`  Config:       ${COLORS.dim}.beth/ado-sync.json${COLORS.reset}`);
  log(`\n  ${COLORS.bright}Next steps:${COLORS.reset}`);
  log(`  Run ${COLORS.cyan}npx beth-copilot ado-sync start${COLORS.reset} to begin syncing`);
  log('');
}
