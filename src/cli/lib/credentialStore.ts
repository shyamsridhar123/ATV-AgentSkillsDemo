/**
 * Credential Storage Abstraction for ADO Sync
 *
 * Provides a unified API over the MSAL shared cache (ADR-003) and PAT env vars.
 * Callers don't know the backend — they call store/retrieve/delete.
 *
 * Storage strategy (ordered by preference):
 * 1. Environment variable override (BETH_ADO_PAT / BETH_ADO_TOKEN) — CI/automation
 * 2. MSAL shared cache at .beth/msal_token_cache.json — Entra tokens (primary)
 *
 * Per ADR-001 (superseded by ADR-003): MSAL's built-in cache handles encryption
 * via msal-extensions (DPAPI on Windows, Keychain on macOS, libsecret on Linux).
 * No separate keychain dependency needed.
 *
 * Covers FR-6 from PRD.
 */

import {
  acquireTokenSilent,
  acquireTokenDeviceCode,
  clearTokenCache,
  getCachedAccount,
  getMsalCachePath,
  type AuthOptions,
} from './entraAuth.js';
import { loadConfig } from './adoSyncConfig.js';
import { existsSync } from 'fs';

/** Credential types supported */
export type CredentialType = 'entra' | 'pat';

/** A resolved credential ready for API calls */
export interface Credential {
  type: CredentialType;
  accessToken: string;
  username: string;
  expiresOn: Date | null;
}

/**
 * Retrieve a credential for ADO API calls.
 *
 * Resolution order:
 * 1. BETH_ADO_PAT / BETH_ADO_TOKEN env var → PAT credential
 * 2. MSAL cache silent acquisition → Entra credential
 * 3. null (no credentials available)
 *
 * Callers don't need to know whether it's a PAT or Entra token.
 */
export async function retrieve(projectRoot: string): Promise<Credential | null> {
  // Check env var first (CI/automation)
  const pat = process.env['BETH_ADO_PAT'] || process.env['BETH_ADO_TOKEN'];
  if (pat) {
    return {
      type: 'pat',
      accessToken: pat,
      username: 'PAT (environment variable)',
      expiresOn: null,
    };
  }

  // Load config to get clientId/tenantId for MSAL
  const config = loadConfig(projectRoot);
  const authOptions: AuthOptions = config
    ? { clientId: config.clientId || undefined, tenantId: config.tenantId || undefined }
    : {};

  const result = await acquireTokenSilent(projectRoot, authOptions);
  if (result) {
    return {
      type: 'entra',
      accessToken: result.accessToken,
      username: result.account.username,
      expiresOn: result.expiresOn,
    };
  }

  return null;
}

/**
 * Store credentials via interactive auth (device code flow).
 * Returns the credential after successful auth.
 *
 * The MSAL cache handles actual storage — this triggers the auth flow
 * that populates it.
 */
export async function store(
  projectRoot: string,
  options: AuthOptions & { onDeviceCode?: (message: string) => void } = {}
): Promise<Credential> {
  const result = await acquireTokenDeviceCode(projectRoot, options);
  return {
    type: 'entra',
    accessToken: result.accessToken,
    username: result.account.username,
    expiresOn: result.expiresOn,
  };
}

/**
 * Delete all stored credentials for the project.
 * Clears the MSAL token cache.
 */
export async function remove(
  projectRoot: string,
  options: AuthOptions = {}
): Promise<void> {
  await clearTokenCache(projectRoot, options);
}

/**
 * Check if any credentials are available (without acquiring new ones).
 */
export async function hasCredentials(projectRoot: string): Promise<boolean> {
  // Check env var
  if (process.env['BETH_ADO_PAT'] || process.env['BETH_ADO_TOKEN']) {
    return true;
  }

  // Check MSAL cache has accounts
  const config = loadConfig(projectRoot);
  const authOptions: AuthOptions = config
    ? { clientId: config.clientId || undefined, tenantId: config.tenantId || undefined }
    : {};

  const account = await getCachedAccount(projectRoot, authOptions);
  return account !== null;
}

/**
 * Check if the MSAL cache file exists for the project.
 */
export function hasCacheFile(projectRoot: string): boolean {
  return existsSync(getMsalCachePath(projectRoot));
}
