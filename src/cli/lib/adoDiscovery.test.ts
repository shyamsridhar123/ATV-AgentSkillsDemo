/**
 * Unit tests for ADO org/project discovery API (BETH-64.9)
 *
 * Tests: profile fetching, org listing, project listing with pagination,
 * error handling (401, 403, 429).
 * All HTTP calls mocked via globalThis.fetch.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getProfile,
  listOrganizations,
  listProjects,
  discoverOrganizations,
  AdoApiError,
} from '../lib/adoDiscovery.js';

const MOCK_TOKEN = 'mock-access-token';

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

describe('adoDiscovery', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // --- getProfile ---

  describe('getProfile', () => {
    it('returns user profile', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        jsonResponse({
          id: 'user-id-123',
          displayName: 'Steph Schofield',
          emailAddress: 'steph@contoso.com',
        })
      );

      const profile = await getProfile(MOCK_TOKEN);
      expect(profile.id).toBe('user-id-123');
      expect(profile.displayName).toBe('Steph Schofield');
      expect(profile.emailAddress).toBe('steph@contoso.com');
    });

    it('sends Bearer token in Authorization header', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        jsonResponse({ id: 'x', displayName: 'x', emailAddress: 'x' })
      );

      await getProfile(MOCK_TOKEN);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('vssps.visualstudio.com'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': `Bearer ${MOCK_TOKEN}`,
          }),
        })
      );
    });

    it('throws AdoApiError on 401', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(jsonResponse({}, 401));

      await expect(getProfile(MOCK_TOKEN)).rejects.toThrow(AdoApiError);
      await expect(getProfile(MOCK_TOKEN)).rejects.toThrow('expired or invalid');
    });

    it('throws AdoApiError on 403', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(jsonResponse({}, 403));

      await expect(getProfile(MOCK_TOKEN)).rejects.toThrow('Access denied');
    });

    it('throws AdoApiError on 429 (rate limited)', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(jsonResponse({}, 429));

      try {
        await getProfile(MOCK_TOKEN);
        expect.unreachable('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(AdoApiError);
        expect((e as AdoApiError).isRetryable).toBe(true);
      }
    });
  });

  // --- listOrganizations ---

  describe('listOrganizations', () => {
    it('returns list of organizations', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        jsonResponse({
          count: 2,
          value: [
            { accountId: 'org1-id', accountName: 'contoso', accountUri: 'https://dev.azure.com/contoso' },
            { accountId: 'org2-id', accountName: 'fabrikam', accountUri: 'https://dev.azure.com/fabrikam' },
          ],
        })
      );

      const orgs = await listOrganizations(MOCK_TOKEN, 'member-id');
      expect(orgs).toHaveLength(2);
      expect(orgs[0].accountName).toBe('contoso');
      expect(orgs[1].accountName).toBe('fabrikam');
    });

    it('encodes memberId in URL', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        jsonResponse({ count: 0, value: [] })
      );

      await listOrganizations(MOCK_TOKEN, 'id with spaces');

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('memberId=id%20with%20spaces'),
        expect.anything()
      );
    });

    it('returns empty array when user has no orgs', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        jsonResponse({ count: 0, value: [] })
      );

      const orgs = await listOrganizations(MOCK_TOKEN, 'member-id');
      expect(orgs).toEqual([]);
    });
  });

  // --- listProjects ---

  describe('listProjects', () => {
    it('returns list of projects', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        jsonResponse({
          count: 2,
          value: [
            { id: 'p1', name: 'Project Alpha', description: 'First project', state: 'wellFormed' },
            { id: 'p2', name: 'Project Beta', description: '', state: 'wellFormed' },
          ],
        })
      );

      const projects = await listProjects(MOCK_TOKEN, 'contoso');
      expect(projects).toHaveLength(2);
      expect(projects[0].name).toBe('Project Alpha');
      expect(projects[1].description).toBe('');
    });

    it('paginates when there are more than 100 projects', async () => {
      const page1 = Array.from({ length: 100 }, (_, i) => ({
        id: `p${i}`,
        name: `Project ${i}`,
        description: '',
        state: 'wellFormed',
      }));
      const page2 = [
        { id: 'p100', name: 'Project 100', description: '', state: 'wellFormed' },
      ];

      vi.mocked(globalThis.fetch)
        .mockResolvedValueOnce(jsonResponse({ count: 100, value: page1 }))
        .mockResolvedValueOnce(jsonResponse({ count: 1, value: page2 }));

      const projects = await listProjects(MOCK_TOKEN, 'contoso');
      expect(projects).toHaveLength(101);
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);

      // Verify second call has $skip=100
      const secondCall = vi.mocked(globalThis.fetch).mock.calls[1];
      expect(secondCall[0]).toContain('$skip=100');
    });

    it('encodes organization name in URL', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        jsonResponse({ count: 0, value: [] })
      );

      await listProjects(MOCK_TOKEN, 'my org');

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('dev.azure.com/my%20org'),
        expect.anything()
      );
    });

    it('handles empty project list', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        jsonResponse({ count: 0, value: [] })
      );

      const projects = await listProjects(MOCK_TOKEN, 'contoso');
      expect(projects).toEqual([]);
    });
  });

  // --- discoverOrganizations ---

  describe('discoverOrganizations', () => {
    it('returns profile and organizations', async () => {
      vi.mocked(globalThis.fetch)
        .mockResolvedValueOnce(
          jsonResponse({
            id: 'uid',
            displayName: 'Steph',
            emailAddress: 'steph@contoso.com',
          })
        )
        .mockResolvedValueOnce(
          jsonResponse({
            count: 1,
            value: [
              { accountId: 'oid', accountName: 'contoso', accountUri: 'https://dev.azure.com/contoso' },
            ],
          })
        );

      const result = await discoverOrganizations(MOCK_TOKEN);
      expect(result.profile.displayName).toBe('Steph');
      expect(result.organizations).toHaveLength(1);
      expect(result.organizations[0].accountName).toBe('contoso');
    });

    it('makes exactly 2 API calls (profile + orgs)', async () => {
      vi.mocked(globalThis.fetch)
        .mockResolvedValueOnce(
          jsonResponse({ id: 'uid', displayName: 'x', emailAddress: 'x' })
        )
        .mockResolvedValueOnce(
          jsonResponse({ count: 0, value: [] })
        );

      await discoverOrganizations(MOCK_TOKEN);
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    });
  });
});
