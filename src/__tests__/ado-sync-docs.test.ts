/**
 * ADO Sync User Documentation Tests (BETH-64.18)
 *
 * TDD: These tests define the structure and content requirements
 * for docs/ADO-SYNC-SETUP.md — the user-facing setup guide.
 *
 * Each test maps to an acceptance criterion from the task.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DOCS_DIR = join(process.cwd(), 'docs');
const DOC_PATH = join(DOCS_DIR, 'ADO-SYNC-SETUP.md');
const README_PATH = join(process.cwd(), 'README.md');

let doc: string;

beforeAll(() => {
  // AC#1: File must exist
  expect(existsSync(DOC_PATH), `docs/ADO-SYNC-SETUP.md must exist`).toBe(true);
  doc = readFileSync(DOC_PATH, 'utf-8');
});

describe('AC#1: File exists at docs/ADO-SYNC-SETUP.md', () => {
  it('should be a non-empty markdown file', () => {
    expect(doc.length).toBeGreaterThan(500);
  });

  it('should have a top-level title', () => {
    expect(doc).toMatch(/^# .+/m);
  });
});

describe('AC#2: Prerequisites section', () => {
  it('should have a prerequisites section', () => {
    expect(doc).toMatch(/## Prerequisites/i);
  });

  it('should mention Node.js', () => {
    expect(doc).toMatch(/Node\.js/i);
  });

  it('should mention Python 3.10+', () => {
    expect(doc).toMatch(/Python 3\.10/i);
  });

  it('should mention Azure DevOps access', () => {
    expect(doc).toMatch(/Azure DevOps/i);
  });

  it('should mention Entra ID or PAT authentication', () => {
    expect(doc).toMatch(/Entra ID|Personal Access Token|PAT/i);
  });
});

describe('AC#3: Step-by-step walkthrough', () => {
  it('should have a setup/walkthrough section', () => {
    expect(doc).toMatch(/## .*(Setup|Walkthrough|Getting Started|Step)/i);
  });

  it('should include the set-ado-org command', () => {
    expect(doc).toMatch(/npx beth-copilot set-ado-org/);
  });

  it('should include the ado-sync start command', () => {
    expect(doc).toMatch(/npx beth-copilot ado-sync start/);
  });

  it('should include the ado-sync status command', () => {
    expect(doc).toMatch(/npx beth-copilot ado-sync status/);
  });

  it('should include the ado-sync stop command', () => {
    expect(doc).toMatch(/npx beth-copilot ado-sync stop/);
  });

  it('should show expected terminal output', () => {
    // At least 3 code blocks showing terminal output
    const codeBlocks = doc.match(/```[\s\S]*?```/g) || [];
    expect(codeBlocks.length).toBeGreaterThanOrEqual(3);
  });

  it('should show the ADO Sync configured success message', () => {
    expect(doc).toMatch(/ADO Sync configured/i);
  });
});

describe('AC#4: Troubleshooting section', () => {
  it('should have a troubleshooting section', () => {
    expect(doc).toMatch(/## Troubleshooting/i);
  });

  it('should cover Python not found', () => {
    expect(doc).toMatch(/Python.*not found|No Python|python.*missing/i);
  });

  it('should cover authentication failures', () => {
    expect(doc).toMatch(/auth.*fail|authentication.*error|401|403|credential/i);
  });

  it('should cover organization not found', () => {
    expect(doc).toMatch(/org.*not found|no.*organization|organization.*error/i);
  });
});

describe('AC#5: FAQ section', () => {
  it('should have a FAQ section', () => {
    expect(doc).toMatch(/## FAQ|## Frequently Asked/i);
  });

  it('should explain how to change organization', () => {
    expect(doc).toMatch(/change.*org|switch.*org|reconfigure/i);
  });

  it('should explain how to stop syncing', () => {
    expect(doc).toMatch(/stop.*sync|disable.*sync|ado-sync stop/i);
  });

  it('should explain where config lives', () => {
    expect(doc).toMatch(/\.beth\/ado-sync\.json/);
  });

  it('should explain what gets created in ADO', () => {
    expect(doc).toMatch(/user stor|work item|created in.*ADO|Azure DevOps.*creat/i);
  });
});

describe('AC#6: Security section', () => {
  it('should have a security section', () => {
    expect(doc).toMatch(/## Security/i);
  });

  it('should explain where credentials are stored', () => {
    expect(doc).toMatch(/\.beth\/msal_token_cache|\.beth\/pat_credential|credential.*stor/i);
  });

  it('should explain what is safe to commit', () => {
    expect(doc).toMatch(/safe to commit|gitignore|\.beth\/.*gitignore/i);
  });

  it('should mention .beth/ is gitignored', () => {
    expect(doc).toMatch(/\.beth\/.*gitignore|gitignore.*\.beth/i);
  });

  it('should warn against committing secrets', () => {
    expect(doc).toMatch(/never commit.*token|never commit.*secret|never commit.*PAT|do not commit.*credential/i);
  });
});

describe('AC#7: README links to this doc', () => {
  it('should have a link to ADO-SYNC-SETUP.md in the main README', () => {
    const readme = readFileSync(README_PATH, 'utf-8');
    expect(readme).toMatch(/ADO-SYNC-SETUP\.md/);
  });
});
