/**
 * Entra ID Device Code Authentication for ADO Sync
 *
 * Uses @azure/msal-node device code flow targeting Azure DevOps scope.
 * Tokens stored in shared MSAL cache at .beth/msal_token_cache.json (ADR-003).
 *
 * Covers FR-8, FR-9, US-002 from PRD.
 */

import {
  PublicClientApplication,
  DeviceCodeRequest,
  AuthenticationResult,
  LogLevel,
  type Configuration,
  type AccountInfo,
} from '@azure/msal-node';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { ensureBethDir } from './adoSyncConfig.js';

/** Azure DevOps resource ID — all ADO API calls require this scope */
const ADO_RESOURCE_SCOPE = '499b84ac-1321-427f-aa17-267ca6975798/.default';

/** Default multi-tenant app registration client ID for beth-copilot */
const DEFAULT_CLIENT_ID = '499b84ac-1321-427f-aa17-267ca6975798';

/** MSAL token cache filename within .beth/ */
const MSAL_CACHE_FILENAME = 'msal_token_cache.json';

/** Result from a successful authentication */
export interface AuthResult {
  accessToken: string;
  account: AccountInfo;
  expiresOn: Date | null;
}

/** Options for the auth flow */
export interface AuthOptions {
  /** Override the client ID (for custom Entra app registrations) */
  clientId?: string;
  /** Tenant ID to target (defaults to 'organizations' for multi-tenant) */
  tenantId?: string;
  /** Callback for device code message display */
  onDeviceCode?: (message: string) => void;
  /** Timeout in ms for device code auth (default: 120000 = 2 min) */
  timeout?: number;
}

/**
 * Get the MSAL cache file path for a project.
 */
export function getMsalCachePath(projectRoot: string): string {
  return join(projectRoot, '.beth', MSAL_CACHE_FILENAME);
}

/**
 * Create MSAL configuration.
 */
function createMsalConfig(options: AuthOptions = {}): Configuration {
  const authority = options.tenantId
    ? `https://login.microsoftonline.com/${options.tenantId}`
    : 'https://login.microsoftonline.com/organizations';

  return {
    auth: {
      clientId: options.clientId || DEFAULT_CLIENT_ID,
      authority,
    },
    system: {
      loggerOptions: {
        loggerCallback: () => {
          // Silent by default — MSAL is noisy
        },
        piiLoggingEnabled: false,
        logLevel: LogLevel.Error,
      },
      // Note: MSAL Node handles proxy via Node.js global agent / HTTPS_PROXY env var natively
    },
  };
}

/**
 * Load the MSAL token cache from disk.
 * Returns empty string if no cache file exists.
 */
function loadCacheFromDisk(projectRoot: string): string {
  const cachePath = getMsalCachePath(projectRoot);
  if (existsSync(cachePath)) {
    return readFileSync(cachePath, 'utf-8');
  }
  return '';
}

/**
 * Save the MSAL token cache to disk.
 */
function saveCacheToDisk(projectRoot: string, cacheData: string): void {
  ensureBethDir(projectRoot);
  const cachePath = getMsalCachePath(projectRoot);
  writeFileSync(cachePath, cacheData, { encoding: 'utf-8', mode: 0o600 });
}

/**
 * Create a PublicClientApplication with file-based cache persistence.
 */
async function createMsalClient(
  projectRoot: string,
  options: AuthOptions = {}
): Promise<PublicClientApplication> {
  const config = createMsalConfig(options);
  const pca = new PublicClientApplication(config);

  // Load existing cache
  const cacheData = loadCacheFromDisk(projectRoot);
  if (cacheData) {
    const cache = pca.getTokenCache();
    cache.deserialize(cacheData);
  }

  return pca;
}

/**
 * Persist the PCA cache back to disk after token operations.
 */
function persistCache(projectRoot: string, pca: PublicClientApplication): void {
  const cache = pca.getTokenCache();
  const serialized = cache.serialize();
  saveCacheToDisk(projectRoot, serialized);
}

/**
 * Attempt silent token acquisition using cached refresh tokens.
 * Returns null if no cached account exists or refresh fails.
 */
export async function acquireTokenSilent(
  projectRoot: string,
  options: AuthOptions = {}
): Promise<AuthResult | null> {
  const pca = await createMsalClient(projectRoot, options);
  const cache = pca.getTokenCache();
  const accounts = await cache.getAllAccounts();

  if (accounts.length === 0) {
    return null;
  }

  // Use first account (single-user scenario)
  const account = accounts[0];

  try {
    const result = await pca.acquireTokenSilent({
      account,
      scopes: [ADO_RESOURCE_SCOPE],
    });

    if (!result) {
      return null;
    }

    // Persist refreshed tokens
    persistCache(projectRoot, pca);

    return {
      accessToken: result.accessToken,
      account: result.account!,
      expiresOn: result.expiresOn,
    };
  } catch {
    // Silent acquisition failed — need interactive auth
    return null;
  }
}

/**
 * Run the device code authentication flow.
 *
 * Prints a message asking the user to open a URL and enter a code.
 * Blocks until auth completes, times out, or is cancelled.
 */
export async function acquireTokenDeviceCode(
  projectRoot: string,
  options: AuthOptions = {}
): Promise<AuthResult> {
  const pca = await createMsalClient(projectRoot, options);

  const timeout = options.timeout ?? 120000;

  const deviceCodeRequest: DeviceCodeRequest = {
    scopes: [ADO_RESOURCE_SCOPE],
    deviceCodeCallback: (response) => {
      if (options.onDeviceCode) {
        options.onDeviceCode(response.message);
      } else {
        // Default: print to stderr so it doesn't pollute stdout
        process.stderr.write(`\n${response.message}\n\n`);
      }
    },
    timeout: Math.floor(timeout / 1000), // MSAL wants seconds
  };

  let result: AuthenticationResult;
  try {
    const maybeResult = await pca.acquireTokenByDeviceCode(deviceCodeRequest);
    if (!maybeResult) {
      throw new Error('Authentication succeeded but received null response.');
    }
    result = maybeResult;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('timeout') || msg.includes('expired')) {
      throw new Error(
        'Device code authentication timed out. Please try again.'
      );
    }
    if (msg.includes('cancelled') || msg.includes('denied')) {
      throw new Error(
        'Authentication was cancelled or denied. Check your Entra ID permissions.'
      );
    }
    throw new Error(`Entra ID authentication failed: ${msg}`);
  }

  if (!result || !result.account) {
    throw new Error('Authentication succeeded but no account information was returned.');
  }

  // Persist tokens to shared cache
  persistCache(projectRoot, pca);

  return {
    accessToken: result.accessToken,
    account: result.account,
    expiresOn: result.expiresOn,
  };
}

/**
 * Get the cached account info without acquiring a new token.
 * Returns null if no account is cached.
 */
export async function getCachedAccount(
  projectRoot: string,
  options: AuthOptions = {}
): Promise<AccountInfo | null> {
  const pca = await createMsalClient(projectRoot, options);
  const cache = pca.getTokenCache();
  const accounts = await cache.getAllAccounts();
  return accounts.length > 0 ? accounts[0] : null;
}

/**
 * Clear all cached tokens for the project.
 * Used when the user wants to re-authenticate from scratch.
 */
export async function clearTokenCache(
  projectRoot: string,
  options: AuthOptions = {}
): Promise<void> {
  const pca = await createMsalClient(projectRoot, options);
  const cache = pca.getTokenCache();
  const accounts = await cache.getAllAccounts();

  for (const account of accounts) {
    await cache.removeAccount(account);
  }

  persistCache(projectRoot, pca);
}

/**
 * Check if valid (non-expired) credentials exist for this project.
 * Returns the account info if valid, null otherwise.
 */
export async function checkCredentials(
  projectRoot: string,
  options: AuthOptions = {}
): Promise<AuthResult | null> {
  // First check for PAT env var override
  const pat = process.env['BETH_ADO_PAT'] || process.env['BETH_ADO_TOKEN'];
  if (pat) {
    // PAT doesn't have an account — return a synthetic result
    return {
      accessToken: pat,
      account: {
        homeAccountId: 'env-var',
        environment: 'env-var',
        tenantId: '',
        username: 'PAT (environment variable)',
        localAccountId: 'env-var',
      } as AccountInfo,
      expiresOn: null, // PATs don't have expiry info available this way
    };
  }

  // Try silent acquisition with cached tokens
  return acquireTokenSilent(projectRoot, options);
}
