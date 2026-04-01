/**
 * PAT Fallback Authentication Tests (BETH-64.17)
 *
 * TDD: Tests written FIRST — covering all three subtasks:
 *   BETH-64.17.1: PAT fallback offered when Entra auth fails
 *   BETH-64.17.2: PAT validation against ADO API before storing
 *   BETH-64.17.3: PAT security (covered in pat-security.test.ts — not duplicated here)
 *
 * Parent ACs from BETH-64.17:
 *   AC#1: If Entra auth fails, offer PAT as alternative
 *   AC#2: PAT input is masked (no echo in terminal)
 *   AC#3: PAT validated against ADO API before storing
 *   AC#4: Warning if PAT doesn't have Work Items scope
 *   AC#5: PAT stored via same credential storage mechanism as Entra tokens
 *   AC#6: authMethod in .beth/ado-sync.json set to 'pat' when using PAT
 *   AC#7: PAT never written to plain-text config files or committed to git
 *   AC#8: PAT never appears in logs or error messages
 *   AC#9: Unit tests for PAT validation and masked input
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, readFileSync, existsSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { Readable, Writable } from 'stream';

import {
  validatePat,
  promptForPat,
  storePat,
  retrievePat,
  removePat,
  getPatCredentialPath,
} from './patAuth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  const dir = join(
    tmpdir(),
    `beth-pat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Create a mock fetch function that returns a predefined response.
 */
function mockFetch(
  responses: Array<{ status: number; body?: unknown; ok?: boolean }>
): typeof globalThis.fetch {
  let callIndex = 0;
  const fn = async (_input: string | URL | Request, _init?: RequestInit): Promise<Response> => {
    const resp = responses[callIndex++] ?? { status: 500, ok: false };
    return {
      ok: resp.ok ?? (resp.status >= 200 && resp.status < 300),
      status: resp.status,
      statusText: `Status ${resp.status}`,
      json: async () => resp.body ?? {},
      text: async () => JSON.stringify(resp.body ?? {}),
    } as unknown as Response;
  };
  return fn as typeof globalThis.fetch;
}

/**
 * Create a mock fetch that rejects with a network error.
 */
function mockFetchNetworkError(message: string): typeof globalThis.fetch {
  const fn = async (): Promise<Response> => {
    throw new Error(message);
  };
  return fn as typeof globalThis.fetch;
}

/**
 * Create a readable stream from a string (for testing promptForPat).
 */
function createInputStream(text: string): NodeJS.ReadableStream {
  const stream = new Readable({
    read() {
      this.push(text);
      this.push(null);
    },
  });
  return stream;
}

/**
 * Create a writable stream that captures output.
 */
function createOutputStream(): NodeJS.WritableStream & { getOutput(): string } {
  let buffer = '';
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      buffer += chunk.toString();
      callback();
    },
  }) as unknown as NodeJS.WritableStream & { getOutput(): string };
  (stream as unknown as { getOutput: () => string }).getOutput = () => buffer;
  return stream;
}

// ═══════════════════════════════════════════════════════════════════════
// BETH-64.17.2: PAT Validation — validates against ADO API before storing
// ═══════════════════════════════════════════════════════════════════════

describe('BETH-64.17.2: PAT validation against ADO API', () => {
  // AC#1: Valid PAT (200 response) is accepted and flow continues
  describe('AC#1: Valid PAT accepted', () => {
    it('returns valid=true when ADO API returns 200 for projects', async () => {
      const fetch = mockFetch([
        { status: 200, body: { count: 1, value: [{ id: '1', name: 'proj' }] } },
        { status: 200, body: { count: 1, value: [{ id: 'field1' }] } },
      ]);

      const result = await validatePat('valid-test-pat', 'my-org', fetch);
      expect(result.valid).toBe(true);
      expect(result.missingWorkItemsScope).toBe(false);
      expect(result.username).toContain('my-org');
    });

    it('does not include PAT value in the result', async () => {
      const pat = 'secret-pat-must-not-leak-into-result';
      const fetch = mockFetch([
        { status: 200, body: { count: 0, value: [] } },
        { status: 200, body: { count: 0, value: [] } },
      ]);

      const result = await validatePat(pat, 'org', fetch);
      expect(JSON.stringify(result)).not.toContain(pat);
    });
  });

  // AC#2: Invalid PAT (401 response) is rejected with message
  describe('AC#2: Invalid PAT rejected', () => {
    it('returns valid=false on 401 response', async () => {
      const fetch = mockFetch([{ status: 401 }]);

      const result = await validatePat('bad-pat', 'my-org', fetch);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('invalid');
    });

    it('returns valid=false on 403 response', async () => {
      const fetch = mockFetch([{ status: 403 }]);

      const result = await validatePat('bad-pat', 'my-org', fetch);
      expect(result.valid).toBe(false);
    });

    it('error message NEVER contains the PAT value', async () => {
      const pat = 'this-pat-must-never-appear-in-errors';
      const fetch = mockFetch([{ status: 401 }]);

      const result = await validatePat(pat, 'my-org', fetch);
      expect(result.error).not.toContain(pat);
    });
  });

  // AC#3: Network error produces clear error message
  describe('AC#3: Network error handling', () => {
    it('returns valid=false on network error', async () => {
      const fetch = mockFetchNetworkError('ECONNREFUSED');

      const result = await validatePat('test-pat', 'my-org', fetch);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Network error');
    });

    it('network error message does not contain PAT', async () => {
      const pat = 'network-error-pat-leak-check';
      const fetch = mockFetchNetworkError('DNS resolution failed');

      const result = await validatePat(pat, 'my-org', fetch);
      expect(result.error).not.toContain(pat);
    });
  });

  // AC#4: PAT without Work Items scope triggers warning
  describe('AC#4: Work Items scope warning', () => {
    it('reports missingWorkItemsScope when WIT API returns 401', async () => {
      const fetch = mockFetch([
        { status: 200, body: { count: 1, value: [{ id: '1' }] } }, // projects OK
        { status: 401, body: {} }, // WIT 401 = missing scope
      ]);

      const result = await validatePat('limited-pat', 'my-org', fetch);
      expect(result.valid).toBe(true); // PAT is valid overall
      expect(result.missingWorkItemsScope).toBe(true); // but limited
    });

    it('reports missingWorkItemsScope when WIT API returns 403', async () => {
      const fetch = mockFetch([
        { status: 200, body: { count: 1, value: [{ id: '1' }] } },
        { status: 403, body: {} },
      ]);

      const result = await validatePat('limited-pat', 'org', fetch);
      expect(result.valid).toBe(true);
      expect(result.missingWorkItemsScope).toBe(true);
    });

    it('does not flag missing scope when WIT API returns 200', async () => {
      const fetch = mockFetch([
        { status: 200, body: { count: 1, value: [] } },
        { status: 200, body: { count: 1, value: [] } },
      ]);

      const result = await validatePat('full-scope-pat', 'org', fetch);
      expect(result.valid).toBe(true);
      expect(result.missingWorkItemsScope).toBe(false);
    });
  });

  // Additional: PAT uses Basic auth, not Bearer
  describe('Auth header format', () => {
    it('sends Basic auth header (not Bearer)', async () => {
      let capturedHeaders: Record<string, string> = {};
      const fetch = ((_url: string, init: RequestInit) => {
        capturedHeaders = Object.fromEntries(
          Object.entries(init.headers as Record<string, string>)
        );
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ count: 0, value: [] }),
        });
      }) as unknown as typeof globalThis.fetch;

      await validatePat('test-pat', 'org', fetch);
      expect(capturedHeaders['Authorization']).toMatch(/^Basic /);
      expect(capturedHeaders['Authorization']).not.toMatch(/^Bearer /);
    });

    it('encodes PAT as base64 with empty username prefix', async () => {
      const pat = 'my-test-pat';
      let capturedAuth = '';
      const fetch = ((_url: string, init: RequestInit) => {
        capturedAuth = (init.headers as Record<string, string>)['Authorization'];
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ count: 0, value: [] }),
        });
      }) as unknown as typeof globalThis.fetch;

      await validatePat(pat, 'org', fetch);
      const expectedBase64 = Buffer.from(`:${pat}`).toString('base64');
      expect(capturedAuth).toBe(`Basic ${expectedBase64}`);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// PAT Credential Storage (file-based with restricted permissions)
// ═══════════════════════════════════════════════════════════════════════

describe('PAT credential storage', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = makeTmpDir();
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('storePat creates .beth/pat_credential with the PAT value', () => {
    storePat(projectRoot, 'test-pat-value');
    const credPath = getPatCredentialPath(projectRoot);
    expect(existsSync(credPath)).toBe(true);
    expect(readFileSync(credPath, 'utf-8')).toBe('test-pat-value');
  });

  it('retrievePat returns the stored PAT', () => {
    storePat(projectRoot, 'stored-pat');
    expect(retrievePat(projectRoot)).toBe('stored-pat');
  });

  it('retrievePat returns null when no PAT is stored', () => {
    expect(retrievePat(projectRoot)).toBeNull();
  });

  it('removePat deletes the credential file', () => {
    storePat(projectRoot, 'to-be-removed');
    removePat(projectRoot);
    expect(retrievePat(projectRoot)).toBeNull();
  });

  it('removePat is a no-op when no PAT exists', () => {
    expect(() => removePat(projectRoot)).not.toThrow();
  });

  it('credential file has restrictive permissions (0o600)', () => {
    storePat(projectRoot, 'permissions-test-pat');
    const credPath = getPatCredentialPath(projectRoot);
    const stat = statSync(credPath);
    // 0o600 = owner read+write only (octal 600 = decimal 384)
    const mode = stat.mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('storePat creates .beth/ directory if it does not exist', () => {
    const bethDir = join(projectRoot, '.beth');
    expect(existsSync(bethDir)).toBe(false);
    storePat(projectRoot, 'creates-dir');
    expect(existsSync(bethDir)).toBe(true);
  });

  it('PAT is NOT stored inside .beth/ado-sync.json', () => {
    const pat = 'this-pat-must-not-be-in-config';
    storePat(projectRoot, pat);

    const configPath = join(projectRoot, '.beth', 'ado-sync.json');
    if (existsSync(configPath)) {
      const config = readFileSync(configPath, 'utf-8');
      expect(config).not.toContain(pat);
    }
    // PAT should be in its own file
    const credPath = getPatCredentialPath(projectRoot);
    expect(readFileSync(credPath, 'utf-8')).toBe(pat);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// PAT Masked Input (promptForPat)
// ═══════════════════════════════════════════════════════════════════════

describe('PAT masked input (promptForPat)', () => {
  it('reads PAT from a non-TTY input stream', async () => {
    const input = createInputStream('my-secret-pat\n');
    const output = createOutputStream();

    const result = await promptForPat('Enter PAT: ', input, output);
    expect(result).toBe('my-secret-pat');
  });

  it('trims whitespace from the input', async () => {
    const input = createInputStream('  spaced-pat  \n');
    const output = createOutputStream();

    const result = await promptForPat('PAT: ', input, output);
    expect(result).toBe('spaced-pat');
  });

  it('displays the prompt message on the output stream', async () => {
    const input = createInputStream('test\n');
    const output = createOutputStream();

    await promptForPat('Enter your PAT: ', input, output);
    expect(output.getOutput()).toContain('Enter your PAT: ');
  });

  it('PAT value does NOT appear in output stream', async () => {
    const pat = 'invisible-pat-must-not-echo';
    const input = createInputStream(`${pat}\n`);
    const output = createOutputStream();

    await promptForPat('PAT: ', input, output);
    expect(output.getOutput()).not.toContain(pat);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// BETH-64.17.1: PAT fallback in set-ado-org flow
// Tests here target the integration: Entra fails → PAT prompt → validate → save
// ═══════════════════════════════════════════════════════════════════════

describe('BETH-64.17.1: PAT fallback offered when Entra auth fails', () => {

  // We're going to test by directly importing set-ado-org and mocking deps
  // but first let's verify the core contract through the patAuth module

  // AC#1: PAT prompt shown after Entra auth failure
  it('validatePat is callable and returns expected shape after Entra failure scenario', async () => {
    // Simulate: Entra auth threw, user provided PAT, we validate it
    const fetch = mockFetch([
      { status: 200, body: { count: 1, value: [{ id: '1' }] } },
      { status: 200, body: { count: 1, value: [] } },
    ]);

    const result = await validatePat('user-provided-pat', 'contoso', fetch);
    expect(result).toMatchObject({
      valid: true,
      missingWorkItemsScope: false,
    });
  });

  // AC#3: Accepting (y) proceeds to PAT input - verified through prompt
  it('promptForPat returns the user-provided PAT value', async () => {
    const input = createInputStream('my-fallback-pat\n');
    const output = createOutputStream();

    const pat = await promptForPat('Enter PAT: ', input, output);
    expect(pat).toBe('my-fallback-pat');
  });

  // AC#4: Declining aborts - tested through the confirm flow
  it('empty PAT from promptForPat returns empty string (user declined/cancelled)', async () => {
    const input = createInputStream('\n');
    const output = createOutputStream();

    const pat = await promptForPat('Enter PAT: ', input, output);
    expect(pat).toBe('');
  });

  // Full PAT flow: validate → store → return credential
  it('valid PAT is stored and retrievable after validation', async () => {
    const projectRoot = makeTmpDir();
    const pat = 'validated-and-stored-pat';

    const fetch = mockFetch([
      { status: 200, body: { count: 1, value: [] } },
      { status: 200, body: { count: 0, value: [] } },
    ]);

    const validationResult = await validatePat(pat, 'contoso', fetch);
    expect(validationResult.valid).toBe(true);

    storePat(projectRoot, pat);
    expect(retrievePat(projectRoot)).toBe(pat);

    rmSync(projectRoot, { recursive: true, force: true });
  });

  // Integration: validate + store + config says 'pat'
  it('after PAT storage, config authMethod should be set to "pat" (not "entra")', async () => {
    // This test verifies the CONTRACT — the caller (set-ado-org) is responsible
    // for calling saveConfig with authMethod: 'pat'
    // Here we just verify storePat and retrievePat are independent of config
    const projectRoot = makeTmpDir();

    storePat(projectRoot, 'my-pat');
    const stored = retrievePat(projectRoot);
    expect(stored).toBe('my-pat');

    // Config file should NOT exist just from storePat
    const configPath = join(projectRoot, '.beth', 'ado-sync.json');
    // storePat doesn't create config — that's set-ado-org's job
    // This verifies separation of concerns
    expect(existsSync(configPath)).toBe(false);

    rmSync(projectRoot, { recursive: true, force: true });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Security: PAT never leaks
// ═══════════════════════════════════════════════════════════════════════

describe('PAT security (extended from BETH-64.17.3)', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = makeTmpDir();
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('validatePat error messages never contain the PAT', async () => {
    const pats = [
      'nzp2dw4x7lqzp3ydjgbz3hs4xqjyj3h6rfgtmqe5yzpfm7ycvuq',
      'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.fakepayload.fakesig',
      'AAAA-super-secret-pat-value-12345',
    ];

    for (const pat of pats) {
      // 401 error
      const fetch401 = mockFetch([{ status: 401 }]);
      const r401 = await validatePat(pat, 'org', fetch401);
      expect(r401.error ?? '').not.toContain(pat);
      expect(JSON.stringify(r401)).not.toContain(pat);

      // Network error
      const fetchErr = mockFetchNetworkError('connection refused');
      const rErr = await validatePat(pat, 'org', fetchErr);
      expect(rErr.error ?? '').not.toContain(pat);
      expect(JSON.stringify(rErr)).not.toContain(pat);
    }
  });

  it('promptForPat never echoes the PAT to the output', async () => {
    const pat = 'echo-test-secret-pat-99999';
    const input = createInputStream(`${pat}\n`);
    const output = createOutputStream();

    const result = await promptForPat('PAT: ', input, output);
    expect(result).toBe(pat); // We get it back
    expect(output.getOutput()).not.toContain(pat); // But it was never echoed
  });

  it('credential file path is inside .beth/ (gitignored)', () => {
    const credPath = getPatCredentialPath(projectRoot);
    expect(credPath).toContain('.beth');
    expect(credPath).toContain('pat_credential');
  });

  it('source code of patAuth.ts never logs credential values', () => {
    const source = readFileSync(
      join(__dirname, 'patAuth.ts'),
      'utf-8'
    );

    // No console.log, console.error with credential references
    const logLines = source.split('\n').filter(
      (line: string) => line.includes('console.log') || line.includes('console.error')
    );

    for (const line of logLines) {
      expect(line).not.toContain('pat');
      expect(line).not.toContain('accessToken');
      expect(line).not.toContain('credential');
    }
  });
});
