/**
 * Unit tests for .github/hooks/scripts/inject-skills.mjs
 *
 * Tests the SubagentStart hook that deterministically injects skill context
 * for each agent type. Verifies correct skill mapping, output format,
 * and graceful handling of edge cases.
 */

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import type { InjectHookOutput } from './hook-test-types.js';

const SCRIPT_PATH = join(process.cwd(), '.github/hooks/scripts/inject-skills.mjs');
const PROJECT_ROOT = process.cwd();

/** Helper: pipe JSON input to inject-skills.mjs and parse the JSON output */
function runHook(input: Record<string, unknown>): InjectHookOutput {
  const result = execFileSync('node', [SCRIPT_PATH], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    cwd: PROJECT_ROOT,
    timeout: 10000,
  });
  return JSON.parse(result);
}

/** Helper: extract additionalContext string from hook output */
function getContext(input: Record<string, unknown>): string {
  const output = runHook(input);
  return output.hookSpecificOutput?.additionalContext ?? '';
}

// ─── Core behavior ─────────────────────────────────────────────────────────

describe('inject-skills.mjs: output structure', () => {
  it('should always set continue: true', () => {
    const output = runHook({ agent_type: 'developer', cwd: PROJECT_ROOT });
    expect(output.continue).toBe(true);
  });

  it('should include hookSpecificOutput with SubagentStart event name', () => {
    const output = runHook({ agent_type: 'developer', cwd: PROJECT_ROOT });
    expect(output.hookSpecificOutput).toBeDefined();
    expect(output.hookSpecificOutput!.hookEventName).toBe('SubagentStart');
  });
});

// ─── UX Designer (includes ui-ux-pro-max) ──────────────────────────────────

describe('inject-skills.mjs: ux-designer', () => {
  const ctx = () => getContext({ agent_type: 'ux-designer', cwd: PROJECT_ROOT });

  it('should inject web-design-guidelines into context', () => {
    expect(ctx()).toContain('.github/skills/web-design-guidelines/SKILL.md');
    expect(ctx()).toContain('Skills loaded into context');
  });

  it('should mandate readFile for framer-components', () => {
    expect(ctx()).toContain('.github/skills/framer-components/SKILL.md');
    expect(ctx()).toContain('Skills to load via readFile');
  });

  it('should mandate readFile for ui-ux-pro-max', () => {
    expect(ctx()).toContain('.github/prompts/ui-ux-pro-max/PROMPT.md');
  });

  it('should include the NON-NEGOTIABLE header', () => {
    expect(ctx()).toContain('SKILL ENFORCEMENT');
    expect(ctx()).toContain('NON-NEGOTIABLE');
  });

  it('should identify the agent type in the context', () => {
    expect(ctx()).toContain('You are `ux-designer`');
  });
});

// ─── Developer ─────────────────────────────────────────────────────────────

describe('inject-skills.mjs: developer', () => {
  const ctx = () => getContext({ agent_type: 'developer', cwd: PROJECT_ROOT });

  it('should inject vercel-react-best-practices SKILL.md into context', () => {
    expect(ctx()).toContain('.github/skills/vercel-react-best-practices/SKILL.md');
    expect(ctx()).toContain('Skills loaded into context');
  });

  it('should mandate readFile for shadcn-ui', () => {
    expect(ctx()).toContain('.github/skills/shadcn-ui/SKILL.md');
  });

  it('should mandate readFile for vercel-react-best-practices AGENTS.md', () => {
    expect(ctx()).toContain('.github/skills/vercel-react-best-practices/AGENTS.md');
  });
});

// ─── Product Manager ───────────────────────────────────────────────────────

describe('inject-skills.mjs: product-manager', () => {
  const ctx = () => getContext({ agent_type: 'product-manager', cwd: PROJECT_ROOT });

  it('should mandate readFile for prd skill', () => {
    expect(ctx()).toContain('.github/skills/prd/SKILL.md');
  });

  it('should NOT have "Skills loaded into context" (no inject files)', () => {
    expect(ctx()).not.toContain('Skills loaded into context');
  });
});

// ─── Security Reviewer ─────────────────────────────────────────────────────

describe('inject-skills.mjs: security-reviewer', () => {
  const ctx = () => getContext({ agent_type: 'security-reviewer', cwd: PROJECT_ROOT });

  it('should mandate readFile for security-analysis', () => {
    expect(ctx()).toContain('.github/skills/security-analysis/SKILL.md');
  });
});

// ─── Tester ────────────────────────────────────────────────────────────────

describe('inject-skills.mjs: tester', () => {
  const ctx = () => getContext({ agent_type: 'tester', cwd: PROJECT_ROOT });

  it('should inject web-design-guidelines into context', () => {
    expect(ctx()).toContain('.github/skills/web-design-guidelines/SKILL.md');
    expect(ctx()).toContain('Skills loaded into context');
  });

  it('should NOT have readFile mandate (no readFile files)', () => {
    expect(ctx()).not.toContain('Skills to load via readFile');
  });
});

// ─── Researcher ────────────────────────────────────────────────────────────

describe('inject-skills.mjs: researcher', () => {
  const ctx = () => getContext({ agent_type: 'researcher', cwd: PROJECT_ROOT });

  it('should inject web-search skill into context', () => {
    expect(ctx()).toContain('.github/skills/web-search/SKILL.md');
  });
});

// ─── Edge cases ────────────────────────────────────────────────────────────

describe('inject-skills.mjs: edge cases', () => {
  it('should pass through unknown agent types with continue: true', () => {
    const output = runHook({ agent_type: 'unknown-agent', cwd: PROJECT_ROOT });
    expect(output.continue).toBe(true);
    expect(output).not.toHaveProperty('hookSpecificOutput');
  });

  it('should handle missing agent_type gracefully', () => {
    const output = runHook({ cwd: PROJECT_ROOT });
    expect(output.continue).toBe(true);
  });

  it('should handle malformed JSON input gracefully', () => {
    const result = execFileSync('node', [SCRIPT_PATH], {
      input: 'not json at all',
      encoding: 'utf8',
      cwd: PROJECT_ROOT,
      timeout: 10000,
    });
    const output = JSON.parse(result);
    expect(output.continue).toBe(true);
  });

  it('should handle empty input gracefully', () => {
    const result = execFileSync('node', [SCRIPT_PATH], {
      input: '',
      encoding: 'utf8',
      cwd: PROJECT_ROOT,
      timeout: 10000,
    });
    const output = JSON.parse(result);
    expect(output.continue).toBe(true);
  });
});
