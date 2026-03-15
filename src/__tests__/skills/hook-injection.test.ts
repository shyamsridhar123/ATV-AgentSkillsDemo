/**
 * Category 1: Hook-Enforced Mandatory Skills (deterministic injection tests)
 *
 * These skills are deterministically injected by inject-skills.mjs.
 * No prompt inference needed — the hook fires on agent_type alone.
 * Tests verify hook output, not LLM behavior.
 *
 * Test plan reference: docs/E2E-SKILL-TESTS.md — Category 1 (tests 1–9)
 */

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

const SCRIPT_PATH = join(process.cwd(), '.github/hooks/scripts/inject-skills.mjs');
const PROJECT_ROOT = process.cwd();

/** Helper: pipe JSON input to inject-skills.mjs and parse the JSON output */
function runHook(input: Record<string, unknown>): Record<string, unknown> {
  const result = execFileSync('node', [SCRIPT_PATH], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    cwd: PROJECT_ROOT,
    timeout: 10000,
  });
  return JSON.parse(result);
}

/** Helper: extract additionalContext string from hook output */
function getContext(agentType: string): string {
  const output = runHook({ agent_type: agentType, cwd: PROJECT_ROOT }) as any;
  return output.hookSpecificOutput?.additionalContext ?? '';
}

// ─── Test matrix from the plan ─────────────────────────────────────────────

interface HookTest {
  id: number;
  skill: string;
  skillPath: string;
  agent: string;
  enforcement: 'inject' | 'readFile';
  testPrompt: string;
}

const HOOK_TEST_MATRIX: HookTest[] = [
  {
    id: 1,
    skill: 'web-design-guidelines',
    skillPath: '.github/skills/web-design-guidelines/SKILL.md',
    agent: 'ux-designer',
    enforcement: 'inject',
    testPrompt: 'Review the login page for accessibility compliance',
  },
  {
    id: 2,
    skill: 'framer-components',
    skillPath: '.github/skills/framer-components/SKILL.md',
    agent: 'ux-designer',
    enforcement: 'readFile',
    testPrompt: 'Create a Framer component with property controls for a card',
  },
  {
    id: 3,
    skill: 'ui-ux-pro-max',
    skillPath: '.github/prompts/ui-ux-pro-max/PROMPT.md',
    agent: 'ux-designer',
    enforcement: 'readFile',
    testPrompt: 'Design a color palette and style guide for the dashboard',
  },
  {
    id: 4,
    skill: 'vercel-react-best-practices',
    skillPath: '.github/skills/vercel-react-best-practices/SKILL.md',
    agent: 'developer',
    enforcement: 'inject',
    testPrompt: 'Optimize the data fetching in our Next.js product page',
  },
  {
    id: 5,
    skill: 'shadcn-ui',
    skillPath: '.github/skills/shadcn-ui/SKILL.md',
    agent: 'developer',
    enforcement: 'readFile',
    testPrompt: 'Add a shadcn dialog component for the settings modal',
  },
  {
    id: 6,
    skill: 'vercel-react-best-practices/AGENTS.md',
    skillPath: '.github/skills/vercel-react-best-practices/AGENTS.md',
    agent: 'developer',
    enforcement: 'readFile',
    testPrompt: 'Refactor the server components to eliminate waterfalls',
  },
  {
    id: 7,
    skill: 'prd',
    skillPath: '.github/skills/prd/SKILL.md',
    agent: 'product-manager',
    enforcement: 'readFile',
    testPrompt: 'Create a PRD for the user notifications feature',
  },
  {
    id: 8,
    skill: 'security-analysis',
    skillPath: '.github/skills/security-analysis/SKILL.md',
    agent: 'security-reviewer',
    enforcement: 'readFile',
    testPrompt: 'Run an OWASP security review on the auth module',
  },
  {
    id: 9,
    skill: 'web-design-guidelines',
    skillPath: '.github/skills/web-design-guidelines/SKILL.md',
    agent: 'tester',
    enforcement: 'inject',
    testPrompt: 'Audit the checkout flow for WCAG 2.1 AA compliance',
  },
];

// ─── Parameterized tests ───────────────────────────────────────────────────

describe('Category 1: Hook-Enforced Mandatory Skills', () => {
  describe.each(HOOK_TEST_MATRIX)(
    'Test #$id: $skill → $agent ($enforcement)',
    ({ skill, skillPath, agent, enforcement }) => {
      it('skill file exists on disk', () => {
        const fullPath = join(PROJECT_ROOT, skillPath);
        expect(existsSync(fullPath)).toBe(true);
      });

      it('hook includes skill path in context', () => {
        const ctx = getContext(agent);
        expect(ctx).toContain(skillPath);
      });

      if (enforcement === 'inject') {
        it('skill content is injected directly (not just referenced)', () => {
          const ctx = getContext(agent);
          expect(ctx).toContain('Skills loaded into context');
          expect(ctx).toContain(skillPath);
        });
      }

      if (enforcement === 'readFile') {
        it('skill is listed under readFile mandate', () => {
          const ctx = getContext(agent);
          expect(ctx).toContain('Skills to load via readFile');
          expect(ctx).toContain(skillPath);
        });
      }

      it('context includes NON-NEGOTIABLE enforcement header', () => {
        const ctx = getContext(agent);
        expect(ctx).toContain('SKILL ENFORCEMENT');
        expect(ctx).toContain('NON-NEGOTIABLE');
      });

      it('context identifies the correct agent type', () => {
        const ctx = getContext(agent);
        expect(ctx).toContain(`You are \`${agent}\``);
      });
    },
  );

  // ─── Researcher (special case — capability, not domain knowledge) ──────

  describe('Researcher: web-search injection', () => {
    it('injects web-search skill into researcher context', () => {
      const ctx = getContext('researcher');
      expect(ctx).toContain('.github/skills/web-search/SKILL.md');
    });

    it('researcher has no readFile mandates', () => {
      const ctx = getContext('researcher');
      expect(ctx).not.toContain('Skills to load via readFile');
    });
  });

  // ─── Cross-agent verification ──────────────────────────────────────────

  describe('Cross-agent isolation', () => {
    it('developer does NOT get ux-designer skills', () => {
      const ctx = getContext('developer');
      expect(ctx).not.toContain('framer-components');
      expect(ctx).not.toContain('ui-ux-pro-max');
    });

    it('ux-designer does NOT get developer skills', () => {
      const ctx = getContext('ux-designer');
      expect(ctx).not.toContain('shadcn-ui');
      expect(ctx).not.toContain('vercel-react-best-practices/AGENTS.md');
    });

    it('tester does NOT get readFile mandates', () => {
      const ctx = getContext('tester');
      expect(ctx).not.toContain('Skills to load via readFile');
    });

    it('product-manager does NOT get inject skills', () => {
      const ctx = getContext('product-manager');
      expect(ctx).not.toContain('Skills loaded into context');
    });
  });
});
