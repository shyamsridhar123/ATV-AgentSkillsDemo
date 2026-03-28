/**
 * ADO Sync Per-Project Configuration
 *
 * Config lives in .beth/ado-sync.json at the project root.
 * Contains org, project, auth method, tenant ID, task prefix, tasks dir, AI formatting settings.
 * NO SECRETS in this file — tokens are stored separately via MSAL cache.
 *
 * Covers FR-5, FR-7 from PRD.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'fs';
import { join } from 'path';

/** Supported authentication methods */
export type AuthMethod = 'entra' | 'pat';

/** AI formatting configuration for story generation */
export interface AiFormattingConfig {
  enabled: boolean;
  endpoint: string;
  deployment: string;
}

/**
 * Per-project ADO Sync configuration.
 * Stored at .beth/ado-sync.json — NO SECRETS.
 */
export interface AdoSyncConfig {
  organization: string;
  project: string;
  areaPath: string;
  iterationPath: string;
  authMethod: AuthMethod;
  tenantId: string;
  clientId: string;
  taskPrefix: string;
  tasksDir: string;
  aiFormatting: AiFormattingConfig;
}

/** Default config values for new projects */
const DEFAULT_CONFIG: AdoSyncConfig = {
  organization: '',
  project: '',
  areaPath: '',
  iterationPath: '',
  authMethod: 'entra',
  tenantId: '',
  clientId: '',
  taskPrefix: 'BETH',
  tasksDir: './backlog/tasks',
  aiFormatting: {
    enabled: true,
    endpoint: '',
    deployment: 'gpt-4o',
  },
};

/** The .beth directory name */
const BETH_DIR = '.beth';

/** Config filename within .beth/ */
const CONFIG_FILENAME = 'ado-sync.json';

/** Gitignore entries to add */
const GITIGNORE_ENTRIES = [
  '# Beth runtime state (tokens, caches, PID files)',
  '.beth/',
];


/**
 * Resolve the .beth directory path for a given project root.
 */
export function getBethDir(projectRoot: string): string {
  return join(projectRoot, BETH_DIR);
}

/**
 * Resolve the config file path for a given project root.
 */
export function getConfigPath(projectRoot: string): string {
  return join(projectRoot, BETH_DIR, CONFIG_FILENAME);
}

/**
 * Ensure the .beth directory exists, creating it if necessary.
 */
export function ensureBethDir(projectRoot: string): string {
  const bethDir = getBethDir(projectRoot);
  if (!existsSync(bethDir)) {
    mkdirSync(bethDir, { recursive: true });
  }
  return bethDir;
}

/**
 * Check whether .beth/ is already listed in the project's .gitignore.
 */
export function isGitignored(projectRoot: string): boolean {
  const gitignorePath = join(projectRoot, '.gitignore');
  if (!existsSync(gitignorePath)) {
    return false;
  }
  const content = readFileSync(gitignorePath, 'utf-8');
  // Check for .beth/ entry (with or without leading slash)
  return content.split('\n').some(line => {
    const trimmed = line.trim();
    return trimmed === '.beth/' || trimmed === '.beth' || trimmed === '/.beth/' || trimmed === '/.beth';
  });
}

/**
 * Ensure .beth/ is in .gitignore. Creates .gitignore if it doesn't exist.
 * Returns true if the gitignore was modified, false if already present.
 */
export function ensureGitignore(projectRoot: string): boolean {
  if (isGitignored(projectRoot)) {
    return false;
  }

  const gitignorePath = join(projectRoot, '.gitignore');

  if (!existsSync(gitignorePath)) {
    // Create new .gitignore with beth entries
    writeFileSync(gitignorePath, GITIGNORE_ENTRIES.join('\n') + '\n', 'utf-8');
    return true;
  }

  // Append to existing .gitignore
  const existing = readFileSync(gitignorePath, 'utf-8');
  const needsNewline = existing.length > 0 && !existing.endsWith('\n');
  const prefix = needsNewline ? '\n\n' : '\n';
  appendFileSync(gitignorePath, prefix + GITIGNORE_ENTRIES.join('\n') + '\n', 'utf-8');
  return true;
}

/**
 * Validate config shape. Returns an array of error messages (empty = valid).
 * Does NOT validate that the org/project actually exist — that's the discovery API's job.
 */
export function validateConfig(config: unknown): string[] {
  const errors: string[] = [];

  if (config === null || typeof config !== 'object') {
    return ['Config must be a JSON object'];
  }

  const c = config as Record<string, unknown>;

  // Required string fields
  for (const field of ['organization', 'project', 'authMethod', 'taskPrefix', 'tasksDir']) {
    if (typeof c[field] !== 'string') {
      errors.push(`"${field}" must be a string`);
    }
  }

  // authMethod must be 'entra' or 'pat'
  if (typeof c['authMethod'] === 'string' && c['authMethod'] !== 'entra' && c['authMethod'] !== 'pat') {
    errors.push('"authMethod" must be "entra" or "pat"');
  }

  // Optional string fields (must be string if present)
  for (const field of ['areaPath', 'iterationPath', 'tenantId', 'clientId']) {
    if (c[field] !== undefined && typeof c[field] !== 'string') {
      errors.push(`"${field}" must be a string`);
    }
  }

  // aiFormatting validation
  if (c['aiFormatting'] !== undefined) {
    if (typeof c['aiFormatting'] !== 'object' || c['aiFormatting'] === null) {
      errors.push('"aiFormatting" must be an object');
    } else {
      const ai = c['aiFormatting'] as Record<string, unknown>;
      if (typeof ai['enabled'] !== 'boolean') {
        errors.push('"aiFormatting.enabled" must be a boolean');
      }
      if (ai['endpoint'] !== undefined && typeof ai['endpoint'] !== 'string') {
        errors.push('"aiFormatting.endpoint" must be a string');
      }
      if (ai['deployment'] !== undefined && typeof ai['deployment'] !== 'string') {
        errors.push('"aiFormatting.deployment" must be a string');
      }
    }
  }

  // Security: reject any keys that look like secrets
  const secretPatterns = ['token', 'secret', 'password', 'pat', 'key', 'credential'];
  for (const key of Object.keys(c)) {
    const lower = key.toLowerCase();
    if (secretPatterns.some(p => lower.includes(p)) && typeof c[key] === 'string' && (c[key] as string).length > 0) {
      // Only flag if it's not a known safe field
      const safeFields = ['taskPrefix', 'authMethod'];
      if (!safeFields.includes(key)) {
        errors.push(`Suspicious field "${key}" looks like it may contain a secret. Config must contain NO secrets.`);
      }
    }
  }

  return errors;
}

/**
 * Load ADO Sync config from .beth/ado-sync.json.
 * Returns null if the config file doesn't exist.
 * Throws if the file exists but is invalid JSON or fails validation.
 */
export function loadConfig(projectRoot: string): AdoSyncConfig | null {
  const configPath = getConfigPath(projectRoot);

  if (!existsSync(configPath)) {
    return null;
  }

  const raw = readFileSync(configPath, 'utf-8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON in ${configPath}`);
  }

  const errors = validateConfig(parsed);
  if (errors.length > 0) {
    throw new Error(`Invalid ADO Sync config in ${configPath}:\n  - ${errors.join('\n  - ')}`);
  }

  // Merge with defaults for any missing optional fields
  return { ...DEFAULT_CONFIG, ...(parsed as Partial<AdoSyncConfig>) };
}

/**
 * Save ADO Sync config to .beth/ado-sync.json.
 * Creates .beth/ directory and updates .gitignore if needed.
 */
export function saveConfig(projectRoot: string, config: Partial<AdoSyncConfig>): AdoSyncConfig {
  // Merge with defaults
  const full: AdoSyncConfig = { ...DEFAULT_CONFIG, ...config };

  // Validate before writing
  const errors = validateConfig(full);
  if (errors.length > 0) {
    throw new Error(`Cannot save invalid config:\n  - ${errors.join('\n  - ')}`);
  }

  // Ensure .beth/ exists
  ensureBethDir(projectRoot);

  // Ensure .gitignore has .beth/
  ensureGitignore(projectRoot);

  // Write config (pretty-printed, no secrets)
  const configPath = getConfigPath(projectRoot);
  writeFileSync(configPath, JSON.stringify(full, null, 2) + '\n', 'utf-8');

  return full;
}

/**
 * Create a default config with the given org/project.
 * Used by the set-ado-org flow after org/project selection.
 */
export function createConfig(
  projectRoot: string,
  organization: string,
  project: string,
  options: Partial<AdoSyncConfig> = {}
): AdoSyncConfig {
  return saveConfig(projectRoot, {
    organization,
    project,
    ...options,
  });
}

/**
 * Check if ADO Sync is configured for the given project.
 */
export function isConfigured(projectRoot: string): boolean {
  return existsSync(getConfigPath(projectRoot));
}
