/**
 * Unit tests for set-ado-org CLI command (BETH-64.10)
 *
 * Tests the full orchestration flow with all dependencies mocked:
 * - Existing config detection and "change?" prompt
 * - Credential reuse vs new auth
 * - Org/project discovery and auto-selection
 * - Config save with .gitignore update
 * - Error handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// --- Mocks ---

const mockRetrieve = vi.fn();
const mockDiscoverOrganizations = vi.fn();
const mockListProjects = vi.fn();
const mockAcquireTokenDeviceCode = vi.fn();
const mockAcquireTokenSilent = vi.fn();
const mockLoadConfig = vi.fn();
const mockSaveConfig = vi.fn();
const mockIsConfigured = vi.fn();
const mockValidatePat = vi.fn();
const mockPromptForPat = vi.fn();
const mockStorePat = vi.fn();

vi.mock('../lib/credentialStore.js', () => ({
  retrieve: (...args: unknown[]) => mockRetrieve(...args),
}));

vi.mock('../lib/adoDiscovery.js', () => ({
  discoverOrganizations: (...args: unknown[]) => mockDiscoverOrganizations(...args),
  listProjects: (...args: unknown[]) => mockListProjects(...args),
}));

vi.mock('../lib/entraAuth.js', () => ({
  acquireTokenDeviceCode: (...args: unknown[]) => mockAcquireTokenDeviceCode(...args),
  acquireTokenSilent: (...args: unknown[]) => mockAcquireTokenSilent(...args),
}));

vi.mock('../lib/adoSyncConfig.js', () => ({
  loadConfig: (...args: unknown[]) => mockLoadConfig(...args),
  saveConfig: (...args: unknown[]) => mockSaveConfig(...args),
  isConfigured: (...args: unknown[]) => mockIsConfigured(...args),
}));

vi.mock('../lib/patAuth.js', () => ({
  validatePat: (...args: unknown[]) => mockValidatePat(...args),
  promptForPat: (...args: unknown[]) => mockPromptForPat(...args),
  storePat: (...args: unknown[]) => mockStorePat(...args),
}));

import { setAdoOrg } from './set-ado-org.js';

const MOCK_CREDENTIAL = {
  type: 'entra' as const,
  accessToken: 'mock-token',
  username: 'user@contoso.com',
  expiresOn: new Date('2026-04-01'),
};

const MOCK_ORGS = [
  { accountId: 'org1', accountName: 'contoso', accountUri: 'https://dev.azure.com/contoso' },
  { accountId: 'org2', accountName: 'fabrikam', accountUri: 'https://dev.azure.com/fabrikam' },
];

const MOCK_PROJECTS = [
  { id: 'p1', name: 'Project Alpha', description: 'The main project', state: 'wellFormed' },
  { id: 'p2', name: 'Project Beta', description: '', state: 'wellFormed' },
];

describe('set-ado-org', () => {
  let consoleOutput: string[];
  let consoleErrors: string[];
  const originalCwd = process.cwd;
  const originalExitCode = process.exitCode;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `beth-setado-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    mkdirSync(tmpDir, { recursive: true });

    vi.clearAllMocks();

    // Capture console output
    consoleOutput = [];
    consoleErrors = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      consoleOutput.push(args.map(String).join(' '));
    });
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      consoleErrors.push(args.map(String).join(' '));
    });

    // Mock process.cwd to return our temp dir
    process.cwd = () => tmpDir;
    process.exitCode = undefined;

    // Default: not configured yet
    mockIsConfigured.mockReturnValue(false);
    mockLoadConfig.mockReturnValue(null);
    mockSaveConfig.mockImplementation((_root: string, config: unknown) => config);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.cwd = originalCwd;
    process.exitCode = originalExitCode;
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('completes full flow: auth -> org -> project -> save', async () => {
    mockRetrieve.mockResolvedValue(MOCK_CREDENTIAL);
    mockDiscoverOrganizations.mockResolvedValue({
      profile: { id: 'uid', displayName: 'Steph', emailAddress: 'steph@contoso.com' },
      organizations: MOCK_ORGS,
    });
    mockListProjects.mockResolvedValue(MOCK_PROJECTS);

    await setAdoOrg({
      _testOrgIndex: 0,      // Select contoso
      _testProjectIndex: 1,   // Select Project Beta
      _testConfirmChange: true,
    });

    // Should have saved config with selected org/project
    expect(mockSaveConfig).toHaveBeenCalledWith(
      tmpDir,
      expect.objectContaining({
        organization: 'contoso',
        project: 'Project Beta',
        authMethod: 'entra',
      })
    );

    // Output should include success message
    const output = consoleOutput.join('\n');
    expect(output).toContain('ADO Sync configured');
    expect(output).toContain('contoso');
    expect(output).toContain('Project Beta');
    expect(output).toContain('ado-sync start');
  });

  it('auto-selects when only 1 org exists', async () => {
    mockRetrieve.mockResolvedValue(MOCK_CREDENTIAL);
    mockDiscoverOrganizations.mockResolvedValue({
      profile: { id: 'uid', displayName: 'Steph', emailAddress: 'steph@contoso.com' },
      organizations: [MOCK_ORGS[0]], // Only contoso
    });
    mockListProjects.mockResolvedValue([MOCK_PROJECTS[0]]); // Only 1 project

    await setAdoOrg();

    expect(mockSaveConfig).toHaveBeenCalledWith(
      tmpDir,
      expect.objectContaining({
        organization: 'contoso',
        project: 'Project Alpha',
      })
    );

    const output = consoleOutput.join('\n');
    expect(output).toContain('Auto-selected organization');
    expect(output).toContain('Auto-selected project');
  });

  it('shows current config and skips if user says no to change', async () => {
    mockIsConfigured.mockReturnValue(true);
    mockLoadConfig.mockReturnValue({
      organization: 'existing-org',
      project: 'existing-proj',
      authMethod: 'entra',
    });

    await setAdoOrg({ _testConfirmChange: false });

    expect(mockSaveConfig).not.toHaveBeenCalled();
    const output = consoleOutput.join('\n');
    expect(output).toContain('existing-org/existing-proj');
    expect(output).toContain('Configuration unchanged');
  });

  it('handles org discovery failure gracefully', async () => {
    mockRetrieve.mockResolvedValue(MOCK_CREDENTIAL);
    mockDiscoverOrganizations.mockRejectedValue(new Error('Network failure'));

    await setAdoOrg();

    expect(process.exitCode).toBe(1);
    const errors = consoleErrors.join('\n');
    expect(errors).toContain('Failed to list organizations');
  });

  it('handles no organizations found', async () => {
    mockRetrieve.mockResolvedValue(MOCK_CREDENTIAL);
    mockDiscoverOrganizations.mockResolvedValue({
      profile: { id: 'uid', displayName: 'Steph', emailAddress: 'steph@contoso.com' },
      organizations: [],
    });

    await setAdoOrg();

    expect(process.exitCode).toBe(1);
    const errors = consoleErrors.join('\n');
    expect(errors).toContain('No Azure DevOps organizations found');
  });

  it('handles project listing failure gracefully', async () => {
    mockRetrieve.mockResolvedValue(MOCK_CREDENTIAL);
    mockDiscoverOrganizations.mockResolvedValue({
      profile: { id: 'uid', displayName: 'Steph', emailAddress: 'steph@contoso.com' },
      organizations: [MOCK_ORGS[0]],
    });
    mockListProjects.mockRejectedValue(new Error('403 Forbidden'));

    await setAdoOrg();

    expect(process.exitCode).toBe(1);
    const errors = consoleErrors.join('\n');
    expect(errors).toContain('Failed to list projects');
  });

  it('handles no projects found', async () => {
    mockRetrieve.mockResolvedValue(MOCK_CREDENTIAL);
    mockDiscoverOrganizations.mockResolvedValue({
      profile: { id: 'uid', displayName: 'Steph', emailAddress: 'steph@contoso.com' },
      organizations: [MOCK_ORGS[0]],
    });
    mockListProjects.mockResolvedValue([]);

    await setAdoOrg();

    expect(process.exitCode).toBe(1);
    const errors = consoleErrors.join('\n');
    expect(errors).toContain('No projects found');
  });

  it('triggers device code flow when no credentials exist', async () => {
    mockRetrieve.mockResolvedValue(null); // No cached creds
    mockAcquireTokenDeviceCode.mockResolvedValue({
      accessToken: 'new-token',
      account: { username: 'new-user@contoso.com' },
      expiresOn: new Date(),
    });
    mockDiscoverOrganizations.mockResolvedValue({
      profile: { id: 'uid', displayName: 'New User', emailAddress: 'new@contoso.com' },
      organizations: [MOCK_ORGS[0]],
    });
    mockListProjects.mockResolvedValue([MOCK_PROJECTS[0]]);

    await setAdoOrg();

    expect(mockAcquireTokenDeviceCode).toHaveBeenCalled();
    expect(mockSaveConfig).toHaveBeenCalled();
  });

  it('handles auth failure and PAT decline with exit code 1', async () => {
    mockRetrieve.mockResolvedValue(null);
    mockAcquireTokenDeviceCode.mockRejectedValue(new Error('Device code timed out'));

    await setAdoOrg({ _testPatFallback: false });

    expect(process.exitCode).toBe(1);
    const output = consoleOutput.join('\n');
    expect(output).toContain('Entra auth failed');
    expect(output).toContain('Authentication cancelled');
  });

  it('preserves existing config fields when updating org/project', async () => {
    mockIsConfigured.mockReturnValue(true);
    mockLoadConfig.mockReturnValue({
      organization: 'old-org',
      project: 'old-proj',
      authMethod: 'entra',
      taskPrefix: 'CUSTOM',
      tasksDir: './custom/tasks',
      aiFormatting: { enabled: true, endpoint: 'https://my-endpoint', deployment: 'gpt-4o' },
    });
    mockRetrieve.mockResolvedValue(MOCK_CREDENTIAL);
    mockDiscoverOrganizations.mockResolvedValue({
      profile: { id: 'uid', displayName: 'Steph', emailAddress: 'steph@contoso.com' },
      organizations: [MOCK_ORGS[0]],
    });
    mockListProjects.mockResolvedValue([MOCK_PROJECTS[0]]);

    await setAdoOrg({ _testConfirmChange: true });

    // Should merge with existing config, preserving taskPrefix, tasksDir, aiFormatting
    expect(mockSaveConfig).toHaveBeenCalledWith(
      tmpDir,
      expect.objectContaining({
        organization: 'contoso',
        project: 'Project Alpha',
        taskPrefix: 'CUSTOM',
        tasksDir: './custom/tasks',
      })
    );
  });

  // ═══════════════════════════════════════════════════════════════════
  // PAT Fallback Tests (BETH-64.17.1)
  // ═══════════════════════════════════════════════════════════════════

  describe('PAT fallback when Entra fails', () => {
    const originalFetch = global.fetch;

    beforeEach(() => {
      // Entra auth always fails in these tests
      mockRetrieve.mockResolvedValue(null);
      mockAcquireTokenDeviceCode.mockRejectedValue(new Error('Entra auth failed'));

      // Mock global.fetch for listProjectsWithPat
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ count: 1, value: [{ id: 'p1', name: 'Project Alpha', description: 'Main', state: 'wellFormed' }] }),
      });
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('offers PAT fallback prompt after Entra auth failure', async () => {
      await setAdoOrg({ _testPatFallback: false });

      const output = consoleOutput.join('\n');
      expect(output).toContain('Entra auth failed');
      expect(output).toContain('Enter a PAT instead');
    });

    it('completes full PAT flow: validate → store → save config with authMethod=pat', async () => {
      mockValidatePat.mockResolvedValue({
        valid: true,
        missingWorkItemsScope: false,
        username: 'PAT (contoso)',
      });

      await setAdoOrg({
        _testPatFallback: true,
        _testPatOrg: 'contoso',
        _testPatValue: 'valid-pat-value',
        _testProjectIndex: 0,
      });

      // PAT should be validated
      expect(mockValidatePat).toHaveBeenCalledWith('valid-pat-value', 'contoso');

      // PAT should be stored
      expect(mockStorePat).toHaveBeenCalledWith(tmpDir, 'valid-pat-value');

      // Config should use authMethod: 'pat'
      expect(mockSaveConfig).toHaveBeenCalledWith(
        tmpDir,
        expect.objectContaining({
          organization: 'contoso',
          authMethod: 'pat',
        })
      );

      // Success output
      const output = consoleOutput.join('\n');
      expect(output).toContain('ADO Sync configured');
      expect(output).toContain('pat');
    });

    it('exits with code 1 when PAT validation fails', async () => {
      mockValidatePat.mockResolvedValue({
        valid: false,
        missingWorkItemsScope: false,
        username: '',
        error: 'PAT is invalid or has expired.',
      });

      await setAdoOrg({
        _testPatFallback: true,
        _testPatOrg: 'contoso',
        _testPatValue: 'bad-pat',
      });

      expect(process.exitCode).toBe(1);
      expect(mockStorePat).not.toHaveBeenCalled();
      expect(mockSaveConfig).not.toHaveBeenCalled();
    });

    it('warns about missing Work Items scope but continues', async () => {
      mockValidatePat.mockResolvedValue({
        valid: true,
        missingWorkItemsScope: true,
        username: 'PAT (contoso)',
      });

      await setAdoOrg({
        _testPatFallback: true,
        _testPatOrg: 'contoso',
        _testPatValue: 'limited-pat',
        _testProjectIndex: 0,
      });

      // Should warn but still succeed
      const output = consoleOutput.join('\n');
      expect(output).toContain('Work Items scope');
      expect(output).toContain('ADO Sync configured');
    });

    it('exits when empty PAT is provided', async () => {
      await setAdoOrg({
        _testPatFallback: true,
        _testPatOrg: 'contoso',
        _testPatValue: '',
      });

      expect(process.exitCode).toBe(1);
      const output = consoleOutput.join('\n');
      expect(output).toContain('No PAT provided');
    });

    it('PAT value never appears in console output', async () => {
      const secretPat = 'super-secret-pat-value-12345';
      mockValidatePat.mockResolvedValue({
        valid: true,
        missingWorkItemsScope: false,
        username: 'PAT (contoso)',
      });

      await setAdoOrg({
        _testPatFallback: true,
        _testPatOrg: 'contoso',
        _testPatValue: secretPat,
        _testProjectIndex: 0,
      });

      const allOutput = [...consoleOutput, ...consoleErrors].join('\n');
      expect(allOutput).not.toContain(secretPat);
    });

    it('skips org discovery when using PAT (org already provided)', async () => {
      mockValidatePat.mockResolvedValue({
        valid: true,
        missingWorkItemsScope: false,
        username: 'PAT (my-org)',
      });

      await setAdoOrg({
        _testPatFallback: true,
        _testPatOrg: 'my-org',
        _testPatValue: 'test-pat',
        _testProjectIndex: 0,
      });

      // Should NOT call discoverOrganizations when using PAT
      expect(mockDiscoverOrganizations).not.toHaveBeenCalled();
    });
  });
});
