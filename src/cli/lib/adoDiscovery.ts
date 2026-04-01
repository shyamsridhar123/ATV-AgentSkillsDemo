/**
 * ADO Organization and Project Discovery API
 *
 * Lists accessible ADO organizations and projects after Entra auth.
 * Uses ADO accounts API (vssps.visualstudio.com) for orgs
 * and dev.azure.com for projects.
 *
 * Covers FR-10, FR-11, US-003 from PRD.
 */

/** An ADO organization accessible to the authenticated user */
export interface AdoOrganization {
  accountId: string;
  accountName: string;
  accountUri: string;
}

/** An ADO project within an organization */
export interface AdoProject {
  id: string;
  name: string;
  description: string;
  state: string;
}

/** Profile info from the authenticated user */
export interface AdoProfile {
  id: string;
  displayName: string;
  emailAddress: string;
}

/** Error types for ADO API calls */
export class AdoApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly isRetryable: boolean = false
  ) {
    super(message);
    this.name = 'AdoApiError';
  }
}

/**
 * Fetch JSON from an ADO API endpoint with auth header.
 * Handles common error codes: 401, 403, 429.
 *
 * @param url - ADO API URL
 * @param accessToken - Token value
 * @param authScheme - Auth scheme: 'Bearer' for Entra, 'Basic' for PAT (default: 'Bearer')
 */
async function adoFetch<T>(url: string, accessToken: string, authScheme: 'Bearer' | 'Basic' = 'Bearer'): Promise<T> {
  const response = await fetch(url, {
    headers: {
      'Authorization': `${authScheme} ${accessToken}`,
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    switch (response.status) {
      case 401:
        throw new AdoApiError(
          'Authentication expired or invalid. Please re-authenticate.',
          401
        );
      case 403:
        throw new AdoApiError(
          'Access denied. Check your ADO permissions.',
          403
        );
      case 429:
        throw new AdoApiError(
          'Rate limited by Azure DevOps. Please wait a moment and try again.',
          429,
          true
        );
      default:
        throw new AdoApiError(
          `ADO API error: ${response.status} ${response.statusText}`,
          response.status
        );
    }
  }

  return response.json() as Promise<T>;
}

/**
 * Get the authenticated user's profile (member ID).
 * The member ID is needed to list organizations.
 */
export async function getProfile(accessToken: string): Promise<AdoProfile> {
  interface ProfileResponse {
    id: string;
    displayName: string;
    emailAddress: string;
  }

  const profile = await adoFetch<ProfileResponse>(
    'https://app.vssps.visualstudio.com/_apis/profile/profiles/me?api-version=7.1',
    accessToken
  );

  return {
    id: profile.id,
    displayName: profile.displayName,
    emailAddress: profile.emailAddress,
  };
}

/**
 * List ADO organizations accessible to the authenticated user.
 */
export async function listOrganizations(
  accessToken: string,
  memberId: string
): Promise<AdoOrganization[]> {
  interface AccountsResponse {
    count: number;
    value: Array<{
      accountId: string;
      accountName: string;
      accountUri: string;
    }>;
  }

  const result = await adoFetch<AccountsResponse>(
    `https://app.vssps.visualstudio.com/_apis/accounts?memberId=${encodeURIComponent(memberId)}&api-version=7.1`,
    accessToken
  );

  return result.value.map((a) => ({
    accountId: a.accountId,
    accountName: a.accountName,
    accountUri: a.accountUri,
  }));
}

/**
 * List projects within an ADO organization.
 * Supports pagination for orgs with 100+ projects.
 *
 * @param accessToken - Bearer token (Entra) or base64-encoded Basic token (PAT)
 * @param organization - ADO organization name
 * @param authScheme - Auth scheme: 'Bearer' for Entra, 'Basic' for PAT (default: 'Bearer')
 */
export async function listProjects(
  accessToken: string,
  organization: string,
  authScheme: 'Bearer' | 'Basic' = 'Bearer'
): Promise<AdoProject[]> {
  interface ProjectsResponse {
    count: number;
    value: Array<{
      id: string;
      name: string;
      description: string;
      state: string;
    }>;
  }

  const allProjects: AdoProject[] = [];
  let skip = 0;
  const top = 100;

  // Paginate until we have all projects
  while (true) {
    const url = `https://dev.azure.com/${encodeURIComponent(organization)}/_apis/projects?api-version=7.1&$top=${top}&$skip=${skip}&stateFilter=wellFormed`;
    const result = await adoFetch<ProjectsResponse>(url, accessToken, authScheme);

    for (const p of result.value) {
      allProjects.push({
        id: p.id,
        name: p.name,
        description: p.description || '',
        state: p.state,
      });
    }

    if (result.value.length < top) {
      break; // No more pages
    }
    skip += top;
  }

  return allProjects;
}

/**
 * High-level: discover organizations and return them.
 * Convenience wrapper that gets profile first, then lists orgs.
 */
export async function discoverOrganizations(
  accessToken: string
): Promise<{ profile: AdoProfile; organizations: AdoOrganization[] }> {
  const profile = await getProfile(accessToken);
  const organizations = await listOrganizations(accessToken, profile.id);

  return { profile, organizations };
}
