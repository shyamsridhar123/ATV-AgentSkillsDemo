/**
 * PAT Authentication for ADO Sync (BETH-64.17)
 *
 * Fallback when Entra ID device code auth fails or is unavailable.
 * Validates PAT against ADO API before storing.
 * PAT is stored in MSAL cache file (same mechanism as Entra tokens) at .beth/pat_credential.
 * PAT NEVER appears in .beth/ado-sync.json, logs, or error messages.
 *
 * Covers US-008, AC#1–AC#9 from BETH-64.17.
 */

import { createInterface, type Interface } from 'readline';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { ensureBethDir } from './adoSyncConfig.js';

/** Filename for PAT credential storage within .beth/ */
const PAT_CREDENTIAL_FILENAME = 'pat_credential';

/** Result of PAT validation against ADO API */
export interface PatValidationResult {
  valid: boolean;
  /** True if PAT works but lacks Work Items scope */
  missingWorkItemsScope: boolean;
  /** Organization name if discoverable from response */
  username: string;
  /** Error message if validation failed (NEVER contains the PAT itself) */
  error?: string;
}

/**
 * Validate a PAT against the ADO API by calling GET _apis/projects.
 *
 * PATs use Basic auth: base64(":PAT") in the Authorization header.
 * This is different from Entra tokens which use Bearer auth.
 *
 * @param pat - The Personal Access Token to validate
 * @param organization - ADO organization to validate against
 * @returns Validation result (PAT is NEVER included in error messages)
 */
export async function validatePat(
  pat: string,
  organization: string,
  fetchFn: typeof globalThis.fetch = globalThis.fetch
): Promise<PatValidationResult> {
  // PATs use Basic authentication with empty username
  const basicAuth = Buffer.from(`:${pat}`).toString('base64');

  try {
    // Step 1: Validate the PAT can access the org
    const projectsUrl = `https://dev.azure.com/${encodeURIComponent(organization)}/_apis/projects?api-version=7.1&$top=1`;
    const response = await fetchFn(projectsUrl, {
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Accept': 'application/json',
      },
    });

    if (response.status === 401 || response.status === 403) {
      return {
        valid: false,
        missingWorkItemsScope: false,
        username: '',
        error: 'PAT is invalid or has expired. Please generate a new one from dev.azure.com.',
      };
    }

    if (!response.ok) {
      return {
        valid: false,
        missingWorkItemsScope: false,
        username: '',
        error: `ADO API returned status ${response.status}. Check your organization name.`,
      };
    }

    // Step 2: Check Work Items scope by hitting the work items API
    let missingWorkItemsScope = false;
    try {
      const witUrl = `https://dev.azure.com/${encodeURIComponent(organization)}/_apis/wit/fields?api-version=7.1&$top=1`;
      const witResponse = await fetchFn(witUrl, {
        headers: {
          'Authorization': `Basic ${basicAuth}`,
          'Accept': 'application/json',
        },
      });

      if (witResponse.status === 401 || witResponse.status === 403) {
        missingWorkItemsScope = true;
      }
    } catch {
      // Network error on scope check — don't fail the whole validation
      missingWorkItemsScope = false;
    }

    return {
      valid: true,
      missingWorkItemsScope,
      username: `PAT (${organization})`,
    };
  } catch (error: unknown) {
    // Network error — NEVER include PAT in the error message
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return {
      valid: false,
      missingWorkItemsScope: false,
      username: '',
      error: `Network error validating PAT: ${msg}`,
    };
  }
}

/**
 * Prompt for PAT input with masked/no-echo input.
 * Uses raw mode on stdin to suppress character echo.
 *
 * @param message - Prompt message to display
 * @param inputStream - Input stream (default: process.stdin)
 * @param outputStream - Output stream (default: process.stderr)
 * @returns The entered PAT value
 */
export async function promptForPat(
  message: string = 'Enter your Personal Access Token: ',
  inputStream: NodeJS.ReadableStream = process.stdin,
  outputStream: NodeJS.WritableStream = process.stderr
): Promise<string> {
  return new Promise((resolve) => {
    outputStream.write(message);

    // If stdin is a TTY, use raw mode for masked input
    const isTTY = 'setRawMode' in inputStream && typeof (inputStream as NodeJS.ReadStream).setRawMode === 'function';
    const stdin = inputStream as NodeJS.ReadStream;

    if (isTTY) {
      stdin.setRawMode(true);
      stdin.resume();
      stdin.setEncoding('utf-8');

      let input = '';
      const onData = (char: string) => {
        const c = char.toString();
        if (c === '\n' || c === '\r' || c === '\u0004') {
          // Enter or Ctrl+D — done
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener('data', onData);
          outputStream.write('\n');
          resolve(input.trim());
        } else if (c === '\u0003') {
          // Ctrl+C
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener('data', onData);
          outputStream.write('\n');
          resolve('');
        } else if (c === '\u007f' || c === '\b') {
          // Backspace
          if (input.length > 0) {
            input = input.slice(0, -1);
          }
        } else {
          input += c;
        }
      };

      stdin.on('data', onData);
    } else {
      // Non-TTY (testing, piped input) — use readline
      const rl: Interface = createInterface({ input: inputStream, output: outputStream, terminal: false });
      rl.question('', (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    }
  });
}

/**
 * Get the path to the PAT credential file.
 */
export function getPatCredentialPath(projectRoot: string): string {
  return join(projectRoot, '.beth', PAT_CREDENTIAL_FILENAME);
}

/**
 * Store a PAT securely in the .beth/ directory.
 * File is created with restrictive permissions (0o600 — owner read/write only).
 *
 * @param projectRoot - Project root directory
 * @param pat - The PAT to store
 */
export function storePat(projectRoot: string, pat: string): void {
  ensureBethDir(projectRoot);
  const credPath = getPatCredentialPath(projectRoot);
  writeFileSync(credPath, pat, { encoding: 'utf-8', mode: 0o600 });
}

/**
 * Retrieve a stored PAT from the .beth/ directory.
 * Returns null if no PAT is stored.
 */
export function retrievePat(projectRoot: string): string | null {
  const credPath = getPatCredentialPath(projectRoot);
  if (!existsSync(credPath)) {
    return null;
  }
  return readFileSync(credPath, 'utf-8').trim();
}

/**
 * Remove the stored PAT credential file.
 */
export function removePat(projectRoot: string): void {
  const credPath = getPatCredentialPath(projectRoot);
  if (existsSync(credPath)) {
    unlinkSync(credPath);
  }
}
