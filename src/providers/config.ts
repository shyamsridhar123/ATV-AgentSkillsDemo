/**
 * Configuration management for LLM providers.
 *
 * Loads and validates configuration from environment variables and ~/.beth/.env file.
 * Uses Entra ID (Azure AD) for authentication via @azure/identity.
 * Follows a precedence order: process.env > ~/.beth/.env
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { TokenCredential } from '@azure/identity';
import { DefaultAzureCredential } from '@azure/identity';

/** Default API version for Azure OpenAI */
const DEFAULT_API_VERSION = '2024-12-01-preview';

/** Environment variable names for Azure OpenAI configuration */
const ENV_KEYS = {
  ENDPOINT: 'AZURE_OPENAI_ENDPOINT',
  DEPLOYMENT: 'AZURE_OPENAI_DEPLOYMENT',
  API_VERSION: 'AZURE_OPENAI_API_VERSION',
} as const;

/**
 * Configuration for an LLM provider.
 * Authentication is handled via Entra ID (DefaultAzureCredential).
 */
export interface ProviderConfig {
  /** Azure OpenAI resource endpoint URL */
  endpoint: string;

  /** Entra ID token credential for authentication */
  credential: TokenCredential;

  /** Model deployment name */
  deployment: string;

  /** API version (defaults to '2024-12-01-preview') */
  apiVersion: string;
}

/**
 * Error thrown when required configuration fields are missing.
 */
export class ConfigError extends Error {
  /** List of environment variable names that are missing */
  readonly missingFields: string[];

  /**
   * Create a new ConfigError
   * @param missingFields - Array of missing environment variable names
   */
  constructor(missingFields: string[]) {
    const fieldList = missingFields.join(', ');
    const message =
      `Missing required configuration: ${fieldList}\n\n` +
      `Set these environment variables, or add them to ~/.beth/.env:\n` +
      missingFields.map((f) => `  ${f}=<value>`).join('\n') +
      `\n\nAuthentication uses Entra ID (az login or AZURE_CLIENT_ID/AZURE_TENANT_ID/AZURE_CLIENT_SECRET).`;

    super(message);
    this.name = 'ConfigError';
    this.missingFields = missingFields;

    // Maintains proper stack trace for where error was thrown (V8 only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ConfigError);
    }
  }
}

/**
 * Parse key-value pairs from a .env file content.
 *
 * Supports:
 * - `KEY=VALUE` format
 * - Comments starting with `#`
 * - Empty lines (ignored)
 * - Single and double quoted values
 * - Values with `=` characters
 *
 * Does NOT modify process.env.
 *
 * @param content - Raw content of a .env file
 * @returns Object mapping environment variable names to values
 *
 * @example
 * ```typescript
 * const vars = parseDotEnv('KEY=value\n# comment\nQUOTED="hello world"');
 * // { KEY: 'value', QUOTED: 'hello world' }
 * ```
 */
export function parseDotEnv(content: string): Record<string, string> {
  const result: Record<string, string> = {};

  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (trimmed === '' || trimmed.startsWith('#')) {
      continue;
    }

    // Find the first '=' to split key from value
    const equalsIndex = trimmed.indexOf('=');
    if (equalsIndex === -1) {
      // No '=' found, skip invalid line
      continue;
    }

    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1);

    // Skip if key is empty
    if (key === '') {
      continue;
    }

    // Handle quoted values
    value = value.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      // Remove surrounding quotes
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

/**
 * Validate that a string is a valid URL format.
 *
 * @param urlString - The string to validate
 * @returns True if the string is a valid URL
 */
function isValidUrl(urlString: string): boolean {
  try {
    new URL(urlString);
    return true;
  } catch {
    return false;
  }
}

/**
 * Load environment variables from ~/.beth/.env file.
 *
 * Silently returns an empty object if the file doesn't exist or can't be read.
 *
 * @returns Parsed environment variables from the dotenv file
 */
function loadDotEnvFile(): Record<string, string> {
  const dotEnvPath = join(homedir(), '.beth', '.env');

  try {
    const content = readFileSync(dotEnvPath, 'utf-8');
    return parseDotEnv(content);
  } catch {
    // File doesn't exist or can't be read - this is expected and not an error
    return {};
  }
}

/**
 * Load and validate provider configuration.
 *
 * Configuration is loaded with the following precedence (highest to lowest):
 * 1. `process.env` - Explicit environment variables
 * 2. `~/.beth/.env` - User dotfile fallback
 *
 * Authentication uses Entra ID via DefaultAzureCredential, which supports:
 * - Azure CLI (`az login`)
 * - Environment variables (AZURE_CLIENT_ID, AZURE_TENANT_ID, AZURE_CLIENT_SECRET)
 * - Managed Identity (in Azure environments)
 * - Visual Studio Code credentials
 *
 * @param credential - Optional custom TokenCredential (defaults to DefaultAzureCredential)
 * @returns Validated provider configuration
 * @throws {ConfigError} If required fields are missing or endpoint is invalid
 *
 * @example
 * ```typescript
 * try {
 *   const config = loadConfig();
 *   console.log(`Using deployment: ${config.deployment}`);
 * } catch (error) {
 *   if (error instanceof ConfigError) {
 *     console.error(`Missing: ${error.missingFields.join(', ')}`);
 *   }
 * }
 * ```
 */
export function loadConfig(credential?: TokenCredential): ProviderConfig {
  // Load dotenv file as fallback
  const dotEnvVars = loadDotEnvFile();

  // Helper to get a value with precedence: process.env > dotenv
  const getValue = (key: string): string | undefined => {
    return process.env[key] ?? dotEnvVars[key];
  };

  // Gather values
  const endpoint = getValue(ENV_KEYS.ENDPOINT);
  const deployment = getValue(ENV_KEYS.DEPLOYMENT);
  const apiVersion = getValue(ENV_KEYS.API_VERSION) ?? DEFAULT_API_VERSION;

  // Check for missing required fields
  const missingFields: string[] = [];

  if (!endpoint) {
    missingFields.push(ENV_KEYS.ENDPOINT);
  }
  if (!deployment) {
    missingFields.push(ENV_KEYS.DEPLOYMENT);
  }

  if (missingFields.length > 0) {
    throw new ConfigError(missingFields);
  }

  // Validate endpoint URL format (never include the actual endpoint in error)
  if (!isValidUrl(endpoint!)) {
    throw new ConfigError([`${ENV_KEYS.ENDPOINT} (invalid URL format)`]);
  }

  return {
    endpoint: endpoint!,
    credential: credential ?? new DefaultAzureCredential(),
    deployment: deployment!,
    apiVersion,
  };
}
