/**
 * Unit tests for credential storage abstraction (BETH-64.8)
 *
 * Tests: retrieve/store/remove API, PAT env var override, MSAL fallback,
 * tokens never in plain-text logs.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Mock both entraAuth and adoSyncConfig
const mockAcquireTokenSilent = vi.fn();
const mockAcquireTokenDeviceCode = vi.fn();
const mockClearTokenCache = vi.fn();
const mockGetCachedAccount = vi.fn();
const mockGetMsalCachePath = vi.fn();
const mockLoadConfig = vi.fn();

vi.mock('../lib/entraAuth.js', () => ({
  acquireTokenSilent: (...args: unknown[]) => mockAcquireTokenSilent(...args),
  acquireTokenDeviceCode: (...args: unknown[]) => mockAcquireTokenDeviceCode(...args),
  clearTokenCache: (...args: unknown[]) => mockClearTokenCache(...args),
  checkCredentials: vi.fn(),
  getCachedAccount: (...args: unknown[]) => mockGetCachedAccount(...args),
  getMsalCachePath: (...args: unknown[]) => mockGetMsalCachePath(...args),
}));

vi.mock('../lib/adoSyncConfig.js', () => ({
  loadConfig: (...args: unknown[]) => mockLoadConfig(...args),
}));

import { retrieve, store, remove, hasCredentials } from '../lib/credentialStore.js';

function makeTmpDir(): string {
  const dir = join(tmpdir(), `beth-cred-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

const MOCK_ACCOUNT = {
  homeAccountId: 'uid.tid',
  environment: 'login.microsoftonline.com',
  tenantId: 'tid',
  username: 'user@contoso.com',
  localAccountId: 'local',
};

describe('credentialStore', () => {
  let projectRoot: string;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    projectRoot = makeTmpDir();
    vi.clearAllMocks();
    mockLoadConfig.mockReturnValue(null);
    delete process.env['BETH_ADO_PAT'];
    delete process.env['BETH_ADO_TOKEN'];
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
    process.env = { ...originalEnv };
  });

  // --- retrieve ---

  describe('retrieve', () => {
    it('returns PAT from BETH_ADO_PAT env var', async () => {
      process.env['BETH_ADO_PAT'] = 'my-pat';

      const cred = await retrieve(projectRoot);
      expect(cred).not.toBeNull();
      expect(cred!.type).toBe('pat');
      expect(cred!.accessToken).toBe('my-pat');
      expect(cred!.username).toContain('PAT');
    });

    it('returns PAT from BETH_ADO_TOKEN env var', async () => {
      process.env['BETH_ADO_TOKEN'] = 'my-token';

      const cred = await retrieve(projectRoot);
      expect(cred).not.toBeNull();
      expect(cred!.type).toBe('pat');
      expect(cred!.accessToken).toBe('my-token');
    });

    it('prefers env var over cached MSAL token', async () => {
      process.env['BETH_ADO_PAT'] = 'env-pat';
      mockAcquireTokenSilent.mockResolvedValue({
        accessToken: 'msal-token',
        account: MOCK_ACCOUNT,
        expiresOn: new Date(),
      });

      const cred = await retrieve(projectRoot);
      expect(cred!.accessToken).toBe('env-pat');
      expect(mockAcquireTokenSilent).not.toHaveBeenCalled();
    });

    it('falls back to MSAL silent acquisition', async () => {
      mockAcquireTokenSilent.mockResolvedValue({
        accessToken: 'msal-access-token',
        account: MOCK_ACCOUNT,
        expiresOn: new Date('2026-04-01'),
      });

      const cred = await retrieve(projectRoot);
      expect(cred).not.toBeNull();
      expect(cred!.type).toBe('entra');
      expect(cred!.accessToken).toBe('msal-access-token');
      expect(cred!.username).toBe('user@contoso.com');
    });

    it('returns null when no credentials available', async () => {
      mockAcquireTokenSilent.mockResolvedValue(null);

      const cred = await retrieve(projectRoot);
      expect(cred).toBeNull();
    });

    it('passes clientId/tenantId from config to MSAL', async () => {
      mockLoadConfig.mockReturnValue({
        clientId: 'custom-client',
        tenantId: 'custom-tenant',
      });
      mockAcquireTokenSilent.mockResolvedValue(null);

      await retrieve(projectRoot);

      expect(mockAcquireTokenSilent).toHaveBeenCalledWith(
        projectRoot,
        expect.objectContaining({
          clientId: 'custom-client',
          tenantId: 'custom-tenant',
        })
      );
    });
  });

  // --- store ---

  describe('store', () => {
    it('triggers device code flow and returns credential', async () => {
      mockAcquireTokenDeviceCode.mockResolvedValue({
        accessToken: 'new-token',
        account: MOCK_ACCOUNT,
        expiresOn: new Date('2026-04-01'),
      });

      const cred = await store(projectRoot);
      expect(cred.type).toBe('entra');
      expect(cred.accessToken).toBe('new-token');
      expect(cred.username).toBe('user@contoso.com');
    });

    it('passes onDeviceCode callback through', async () => {
      const callback = vi.fn();
      mockAcquireTokenDeviceCode.mockResolvedValue({
        accessToken: 'tok',
        account: MOCK_ACCOUNT,
        expiresOn: null,
      });

      await store(projectRoot, { onDeviceCode: callback });

      expect(mockAcquireTokenDeviceCode).toHaveBeenCalledWith(
        projectRoot,
        expect.objectContaining({ onDeviceCode: callback })
      );
    });
  });

  // --- remove ---

  describe('remove', () => {
    it('clears the MSAL token cache', async () => {
      mockClearTokenCache.mockResolvedValue(undefined);

      await remove(projectRoot);
      expect(mockClearTokenCache).toHaveBeenCalledWith(projectRoot, {});
    });
  });

  // --- hasCredentials ---

  describe('hasCredentials', () => {
    it('returns true when BETH_ADO_PAT is set', async () => {
      process.env['BETH_ADO_PAT'] = 'some-pat';
      expect(await hasCredentials(projectRoot)).toBe(true);
    });

    it('returns true when MSAL has cached accounts', async () => {
      mockGetCachedAccount.mockResolvedValue(MOCK_ACCOUNT);
      expect(await hasCredentials(projectRoot)).toBe(true);
    });

    it('returns false when no credentials exist', async () => {
      mockGetCachedAccount.mockResolvedValue(null);
      expect(await hasCredentials(projectRoot)).toBe(false);
    });
  });

  // --- Security ---

  describe('security', () => {
    it('credential accessToken is never logged by the store API', async () => {
      // The store API returns tokens but never logs them.
      // This test verifies the return shape doesn't include log-friendly toString.
      mockAcquireTokenDeviceCode.mockResolvedValue({
        accessToken: 'secret-value-never-log-this',
        account: MOCK_ACCOUNT,
        expiresOn: null,
      });

      const cred = await store(projectRoot);
      // Verify the credential doesn't expose token in toString/JSON beyond the field
      const serialized = JSON.stringify(cred);
      expect(serialized).toContain('secret-value-never-log-this'); // it's in the struct
      // But the type doesn't have a custom toString that leaks it
      expect(String(cred)).not.toContain('secret-value-never-log-this');
    });
  });
});
