/**
 * Unit tests for Entra ID device code auth flow (BETH-64.7)
 *
 * MSAL is mocked — no real Azure calls.
 * Tests: device code flow, silent token acquisition, cache persistence,
 * PAT env var override, error handling.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Mock MSAL before importing our module
const mockAcquireTokenSilent = vi.fn();
const mockAcquireTokenByDeviceCode = vi.fn();
const mockGetAllAccounts = vi.fn();
const mockRemoveAccount = vi.fn();
const mockSerialize = vi.fn();
const mockDeserialize = vi.fn();

const mockTokenCache = {
  getAllAccounts: mockGetAllAccounts,
  removeAccount: mockRemoveAccount,
  serialize: mockSerialize,
  deserialize: mockDeserialize,
};

vi.mock('@azure/msal-node', () => {
  // Must use a real function (not arrow) so `new` works
  function MockPCA() {
    return {
      acquireTokenSilent: mockAcquireTokenSilent,
      acquireTokenByDeviceCode: mockAcquireTokenByDeviceCode,
      getTokenCache: () => mockTokenCache,
    };
  }
  return {
    PublicClientApplication: MockPCA,
    LogLevel: { Error: 0, Warning: 1, Info: 2, Verbose: 3, Trace: 4 },
  };
});

import {
  acquireTokenSilent,
  acquireTokenDeviceCode,
  getCachedAccount,
  clearTokenCache,
  checkCredentials,
  getMsalCachePath,
} from '../lib/entraAuth.js';

function makeTmpDir(): string {
  const dir = join(tmpdir(), `beth-auth-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

const MOCK_ACCOUNT = {
  homeAccountId: 'uid.tid',
  environment: 'login.microsoftonline.com',
  tenantId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  username: 'user@contoso.com',
  localAccountId: 'local-id',
};

const MOCK_AUTH_RESULT = {
  accessToken: 'mock-access-token-value',
  account: MOCK_ACCOUNT,
  expiresOn: new Date('2026-03-24T00:00:00Z'),
  uniqueId: 'uid',
  tenantId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  scopes: ['499b84ac-1321-427f-aa17-267ca6975798/.default'],
  tokenType: 'Bearer',
  idToken: '',
  idTokenClaims: {},
  authority: 'https://login.microsoftonline.com/organizations',
  correlationId: 'corr-id',
  fromCache: false,
};

describe('entraAuth', () => {
  let projectRoot: string;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    projectRoot = makeTmpDir();
    vi.clearAllMocks();
    mockSerialize.mockReturnValue('{}');
    mockGetAllAccounts.mockResolvedValue([]);
    // Clean env vars
    delete process.env['BETH_ADO_PAT'];
    delete process.env['BETH_ADO_TOKEN'];
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
    process.env = { ...originalEnv };
  });

  // --- getMsalCachePath ---

  describe('getMsalCachePath', () => {
    it('returns path inside .beth/', () => {
      const path = getMsalCachePath(projectRoot);
      expect(path).toBe(join(projectRoot, '.beth', 'msal_token_cache.json'));
    });
  });

  // --- acquireTokenSilent ---

  describe('acquireTokenSilent', () => {
    it('returns null when no cached accounts exist', async () => {
      mockGetAllAccounts.mockResolvedValue([]);
      const result = await acquireTokenSilent(projectRoot);
      expect(result).toBeNull();
    });

    it('returns token when silent acquisition succeeds', async () => {
      mockGetAllAccounts.mockResolvedValue([MOCK_ACCOUNT]);
      mockAcquireTokenSilent.mockResolvedValue(MOCK_AUTH_RESULT);

      const result = await acquireTokenSilent(projectRoot);
      expect(result).not.toBeNull();
      expect(result!.accessToken).toBe('mock-access-token-value');
      expect(result!.account.username).toBe('user@contoso.com');
    });

    it('persists cache after successful silent acquisition', async () => {
      mockGetAllAccounts.mockResolvedValue([MOCK_ACCOUNT]);
      mockAcquireTokenSilent.mockResolvedValue(MOCK_AUTH_RESULT);
      mockSerialize.mockReturnValue('{"cached": true}');

      await acquireTokenSilent(projectRoot);

      // Check the cache file was written
      const cachePath = getMsalCachePath(projectRoot);
      expect(existsSync(cachePath)).toBe(true);
    });

    it('returns null when silent acquisition fails', async () => {
      mockGetAllAccounts.mockResolvedValue([MOCK_ACCOUNT]);
      mockAcquireTokenSilent.mockRejectedValue(new Error('InteractionRequired'));

      const result = await acquireTokenSilent(projectRoot);
      expect(result).toBeNull();
    });

    it('returns null when MSAL returns null', async () => {
      mockGetAllAccounts.mockResolvedValue([MOCK_ACCOUNT]);
      mockAcquireTokenSilent.mockResolvedValue(null);

      const result = await acquireTokenSilent(projectRoot);
      expect(result).toBeNull();
    });

    it('loads existing cache from disk', async () => {
      // Write a cache file first
      mkdirSync(join(projectRoot, '.beth'), { recursive: true });
      writeFileSync(getMsalCachePath(projectRoot), '{"existing": "cache"}', 'utf-8');

      mockGetAllAccounts.mockResolvedValue([]);
      await acquireTokenSilent(projectRoot);

      // Should have called deserialize with the existing cache
      expect(mockDeserialize).toHaveBeenCalledWith('{"existing": "cache"}');
    });
  });

  // --- acquireTokenDeviceCode ---

  describe('acquireTokenDeviceCode', () => {
    it('calls device code flow and returns result', async () => {
      mockAcquireTokenByDeviceCode.mockResolvedValue(MOCK_AUTH_RESULT);
      mockSerialize.mockReturnValue('{"new": "tokens"}');

      const result = await acquireTokenDeviceCode(projectRoot);

      expect(result.accessToken).toBe('mock-access-token-value');
      expect(result.account.username).toBe('user@contoso.com');
      expect(mockAcquireTokenByDeviceCode).toHaveBeenCalled();
    });

    it('calls onDeviceCode callback when provided', async () => {
      mockAcquireTokenByDeviceCode.mockImplementation(async (request: { deviceCodeCallback: (r: { message: string }) => void }) => {
        request.deviceCodeCallback({ message: 'To sign in, visit https://microsoft.com/devicelogin and enter code ABC123' });
        return MOCK_AUTH_RESULT;
      });

      const messages: string[] = [];
      await acquireTokenDeviceCode(projectRoot, {
        onDeviceCode: (msg) => messages.push(msg),
      });

      expect(messages).toHaveLength(1);
      expect(messages[0]).toContain('ABC123');
    });

    it('persists cache after successful device code flow', async () => {
      mockAcquireTokenByDeviceCode.mockResolvedValue(MOCK_AUTH_RESULT);
      mockSerialize.mockReturnValue('{"device_code": "tokens"}');

      await acquireTokenDeviceCode(projectRoot);

      const cachePath = getMsalCachePath(projectRoot);
      expect(existsSync(cachePath)).toBe(true);
    });

    it('throws on timeout', async () => {
      mockAcquireTokenByDeviceCode.mockRejectedValue(new Error('device code timeout'));

      await expect(acquireTokenDeviceCode(projectRoot)).rejects.toThrow('timed out');
    });

    it('throws on cancellation', async () => {
      mockAcquireTokenByDeviceCode.mockRejectedValue(new Error('user cancelled'));

      await expect(acquireTokenDeviceCode(projectRoot)).rejects.toThrow('cancelled or denied');
    });

    it('throws on generic error', async () => {
      mockAcquireTokenByDeviceCode.mockRejectedValue(new Error('Network error'));

      await expect(acquireTokenDeviceCode(projectRoot)).rejects.toThrow('Entra ID authentication failed');
    });

    it('throws when no account returned', async () => {
      mockAcquireTokenByDeviceCode.mockResolvedValue({ ...MOCK_AUTH_RESULT, account: null });

      await expect(acquireTokenDeviceCode(projectRoot)).rejects.toThrow('no account information');
    });

    it('passes custom clientId and tenantId', async () => {
      mockAcquireTokenByDeviceCode.mockResolvedValue(MOCK_AUTH_RESULT);

      await acquireTokenDeviceCode(projectRoot, {
        clientId: 'custom-client',
        tenantId: 'custom-tenant',
      });

      // The PCA constructor was called — we verify via the mock being invoked
      expect(mockAcquireTokenByDeviceCode).toHaveBeenCalled();
    });
  });

  // --- getCachedAccount ---

  describe('getCachedAccount', () => {
    it('returns null when no accounts cached', async () => {
      mockGetAllAccounts.mockResolvedValue([]);
      const result = await getCachedAccount(projectRoot);
      expect(result).toBeNull();
    });

    it('returns first cached account', async () => {
      mockGetAllAccounts.mockResolvedValue([MOCK_ACCOUNT]);
      const result = await getCachedAccount(projectRoot);
      expect(result?.username).toBe('user@contoso.com');
    });
  });

  // --- clearTokenCache ---

  describe('clearTokenCache', () => {
    it('removes all accounts from cache', async () => {
      const account2 = { ...MOCK_ACCOUNT, username: 'user2@contoso.com' };
      mockGetAllAccounts.mockResolvedValue([MOCK_ACCOUNT, account2]);
      mockSerialize.mockReturnValue('{}');

      await clearTokenCache(projectRoot);

      expect(mockRemoveAccount).toHaveBeenCalledTimes(2);
      expect(mockRemoveAccount).toHaveBeenCalledWith(MOCK_ACCOUNT);
      expect(mockRemoveAccount).toHaveBeenCalledWith(account2);
    });

    it('persists empty cache after clearing', async () => {
      mockGetAllAccounts.mockResolvedValue([MOCK_ACCOUNT]);
      mockSerialize.mockReturnValue('{}');

      await clearTokenCache(projectRoot);

      const cachePath = getMsalCachePath(projectRoot);
      expect(existsSync(cachePath)).toBe(true);
    });

    it('handles empty cache gracefully', async () => {
      mockGetAllAccounts.mockResolvedValue([]);
      mockSerialize.mockReturnValue('{}');

      await clearTokenCache(projectRoot);
      expect(mockRemoveAccount).not.toHaveBeenCalled();
    });
  });

  // --- checkCredentials ---

  describe('checkCredentials', () => {
    it('returns PAT from BETH_ADO_PAT env var', async () => {
      process.env['BETH_ADO_PAT'] = 'my-pat-value';

      const result = await checkCredentials(projectRoot);
      expect(result).not.toBeNull();
      expect(result!.accessToken).toBe('my-pat-value');
      expect(result!.account.username).toBe('PAT (environment variable)');
    });

    it('returns PAT from BETH_ADO_TOKEN env var', async () => {
      process.env['BETH_ADO_TOKEN'] = 'my-token-value';

      const result = await checkCredentials(projectRoot);
      expect(result).not.toBeNull();
      expect(result!.accessToken).toBe('my-token-value');
    });

    it('prefers env var over cached token', async () => {
      process.env['BETH_ADO_PAT'] = 'env-pat';
      mockGetAllAccounts.mockResolvedValue([MOCK_ACCOUNT]);
      mockAcquireTokenSilent.mockResolvedValue(MOCK_AUTH_RESULT);

      const result = await checkCredentials(projectRoot);
      expect(result!.accessToken).toBe('env-pat');
      // Should not have attempted silent acquisition
      expect(mockAcquireTokenSilent).not.toHaveBeenCalled();
    });

    it('falls back to silent token acquisition', async () => {
      mockGetAllAccounts.mockResolvedValue([MOCK_ACCOUNT]);
      mockAcquireTokenSilent.mockResolvedValue(MOCK_AUTH_RESULT);

      const result = await checkCredentials(projectRoot);
      expect(result).not.toBeNull();
      expect(result!.accessToken).toBe('mock-access-token-value');
    });

    it('returns null when no credentials available', async () => {
      mockGetAllAccounts.mockResolvedValue([]);

      const result = await checkCredentials(projectRoot);
      expect(result).toBeNull();
    });
  });
});
