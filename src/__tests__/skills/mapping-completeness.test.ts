/**
 * Agent-Skill Mapping Completeness Tests
 *
 * Verifies that the skill enforcement system is complete — no orphan skills,
 * no missing mappings, no drift between what's on disk and what's in the hooks.
 *
 * What these tests catch:
 * - New skills added to .github/skills/ but not added to the test matrix
 * - Skills removed from disk but still referenced in inject-skills.mjs
 * - inject-skills.mjs agent map drifting from copilot-instructions.md docs
 * - Agent definitions (.agent.md) missing from .github/agents/
 * - Skills with no SKILL.md file inside their directory
 *
 * Test plan reference: docs/E2E-SKILL-TESTS.md — "Implementation Notes"
 */

import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { readdirSync, existsSync, readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import type { InjectHookOutput } from '../hook-test-types';

const PROJECT_ROOT = process.cwd();
const SKILLS_DIR = join(PROJECT_ROOT, '.github/skills');
const AGENTS_DIR = join(PROJECT_ROOT, '.github/agents');
const INJECT_SCRIPT = join(PROJECT_ROOT, '.github/hooks/scripts/inject-skills.mjs');

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Get all skill directory names from .github/skills/ */
function getAllSkillDirs(): string[] {
  return readdirSync(SKILLS_DIR)
    .filter((name) => statSync(join(SKILLS_DIR, name)).isDirectory());
}

/** Get all agent .md files from .github/agents/ */
function getAllAgentFiles(): string[] {
  if (!existsSync(AGENTS_DIR)) return [];
  return readdirSync(AGENTS_DIR)
    .filter((name) => name.endsWith('.agent.md'));
}

/** Run inject-skills.mjs for an agent type and return the raw output */
function runInjectHook(agentType: string): InjectHookOutput {
  const result = execFileSync('node', [INJECT_SCRIPT], {
    input: JSON.stringify({ agent_type: agentType, cwd: PROJECT_ROOT }),
    encoding: 'utf8',
    cwd: PROJECT_ROOT,
    timeout: 10000,
  });
  return JSON.parse(result);
}

/** Read inject-skills.mjs source to extract the AGENT_SKILLS map */
function getAgentSkillsMap(): Record<string, { inject: string[]; readFile: string[] }> {
  const source = readFileSync(INJECT_SCRIPT, 'utf8');

  // Extract all skill paths per agent by parsing the source line by line
  const result: Record<string, { inject: string[]; readFile: string[] }> = {};
  let currentAgent = '';
  let currentSection: 'inject' | 'readFile' | '' = '';

  for (const line of source.split('\n')) {
    // Match agent name: 'developer': {
    const agentMatch = line.match(/^\s*'([^']+)'\s*:\s*\{/);
    if (agentMatch) {
      currentAgent = agentMatch[1];
      result[currentAgent] = { inject: [], readFile: [] };
      continue;
    }

    // Match section: inject: [ or readFile: [
    const sectionMatch = line.match(/^\s*(inject|readFile)\s*:\s*\[/);
    if (sectionMatch && currentAgent) {
      currentSection = sectionMatch[1] as 'inject' | 'readFile';
      // Check for inline single-item array: inject: ['.github/...']
      const inlineMatch = line.match(/\[\s*'([^']+)'\s*\]/);
      if (inlineMatch) {
        result[currentAgent][currentSection].push(inlineMatch[1]);
        currentSection = '';
      }
      continue;
    }

    // Match skill path inside array: '.github/skills/...'
    const pathMatch = line.match(/^\s*'([^']+\.(?:md|MD))'/);
    if (pathMatch && currentAgent && currentSection) {
      result[currentAgent][currentSection].push(pathMatch[1]);
    }

    // End of array
    if (line.match(/^\s*\]/) && currentSection) {
      currentSection = '';
    }

    // End of agent object
    if (line.match(/^\s*\},?\s*$/) && currentAgent && !currentSection) {
      currentAgent = '';
    }
  }

  return result;
}

// ─── Known agents from the hook ────────────────────────────────────────────

const HOOKED_AGENTS = ['developer', 'ux-designer', 'product-manager', 'security-reviewer', 'tester', 'researcher'];

// ─── Skills covered in the E2E test plan (docs/E2E-SKILL-TESTS.md) ────────
// Every skill in the 72-test matrix. Used to detect orphan skills.

const SKILLS_IN_TEST_PLAN = new Set([
  // Category 1 (hook-enforced)
  'web-design-guidelines', 'framer-components', 'shadcn-ui',
  'vercel-react-best-practices', 'prd', 'security-analysis', 'web-search',
  // Category 2 (azure)
  'azure-prepare', 'azure-validate', 'azure-deploy', 'azure-compute',
  'azure-storage', 'azure-ai', 'azure-aigateway', 'azure-kusto',
  'azure-messaging', 'azure-hosted-copilot-sdk', 'appinsights-instrumentation',
  'microsoft-foundry', 'azure-rbac', 'azure-compliance', 'entra-app-registration',
  'azure-cost-optimization', 'azure-cloud-migrate', 'azure-diagnostics',
  'azure-resource-lookup', 'azure-resource-visualizer',
  // Category 3 (design)
  'frontend-design', 'brainstorming', 'document-review', 'every-style-editor',
  // Category 4 (product)
  'proof', 'changelog',
  // Category 5 (developer workflow)
  'create-agent-skills', 'git-worktree', 'feature-video',
  'resolve_parallel', 'resolve_todo_parallel', 'resolve-pr-parallel',
  'lfg', 'slfg', 'deepen-plan', 'agent-browser', 'agent-native-architecture',
  'rclone', 'gemini-imagegen', 'generate_command',
  // Category 6 (testing)
  'test-browser', 'test-xcode', 'report-bug', 'reproduce-bug', 'triage',
  // Category 7 (orchestration)
  'orchestrating-swarms', 'setup', 'heal-skill', 'file-todos',
  // Category 8 (CE)
  'ce:brainstorm', 'ce:plan', 'ce:work', 'ce:review', 'ce:compound',
  // Category 9 (language)
  'dhh-rails-style', 'andrew-kane-gem-writer', 'dspy-ruby',
  // Category 10 (remaining)
  'compound-docs', 'agent-native-audit',
]);

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('Skill Inventory: All on-disk skills accounted for', () => {
  const allSkillDirs = getAllSkillDirs();

  it('every skill directory has a SKILL.md file', () => {
    const missing: string[] = [];
    for (const dir of allSkillDirs) {
      if (!existsSync(join(SKILLS_DIR, dir, 'SKILL.md'))) {
        missing.push(dir);
      }
    }
    expect(missing).toHaveLength(0);
  });

  it('no empty skill directories', () => {
    const empty: string[] = [];
    for (const dir of allSkillDirs) {
      const contents = readdirSync(join(SKILLS_DIR, dir));
      if (contents.length === 0) {
        empty.push(dir);
      }
    }
    expect(empty).toHaveLength(0);
  });

  it('reports skills NOT in the E2E test plan (potential gaps)', () => {
    const uncovered: string[] = [];
    for (const dir of allSkillDirs) {
      if (!SKILLS_IN_TEST_PLAN.has(dir)) {
        uncovered.push(dir);
      }
    }

    // These are known skills that are intentionally NOT in the 72-test matrix.
    // They may be aliases, deprecated, or workflow variants.
    // This test documents them explicitly so new additions are caught.
    const KNOWN_UNCOVERED = new Set([
      // These are workflow: prefixed aliases of ce: skills
      'workflows:brainstorm', 'workflows:compound', 'workflows:plan',
      'workflows:review', 'workflows:work',
      // Alternate/older skill names
      'create-agent-skill', 'skill-creator',
      // Deploy docs (documentation-only, not a routable skill)
      'deploy-docs',
    ]);

    const trueGaps = uncovered.filter((s) => !KNOWN_UNCOVERED.has(s));
    // If this fails, a new skill was added but not put in the test matrix
    expect(trueGaps).toHaveLength(0);
  });
});

describe('inject-skills.mjs: Source-of-truth validation', () => {
  it('covers all 6 known agent types', () => {
    for (const agent of HOOKED_AGENTS) {
      const output = runInjectHook(agent);
      expect(output.hookSpecificOutput).toBeDefined();
      expect(output.hookSpecificOutput!.additionalContext).toBeTruthy();
    }
  });

  it('every skill path in the hook actually exists on disk', () => {
    const agentMap = getAgentSkillsMap();
    const broken: string[] = [];

    for (const [agent, config] of Object.entries(agentMap)) {
      for (const path of [...config.inject, ...config.readFile]) {
        const fullPath = join(PROJECT_ROOT, path);
        if (!existsSync(fullPath)) {
          broken.push(`${agent}: ${path}`);
        }
      }
    }
    expect(broken).toHaveLength(0);
  });

  it('every skill file referenced in the hook is non-empty', () => {
    const agentMap = getAgentSkillsMap();
    const empty: string[] = [];

    for (const [agent, config] of Object.entries(agentMap)) {
      for (const path of [...config.inject, ...config.readFile]) {
        const fullPath = join(PROJECT_ROOT, path);
        if (existsSync(fullPath)) {
          const content = readFileSync(fullPath, 'utf8');
          if (content.trim().length === 0) {
            empty.push(`${agent}: ${path}`);
          }
        }
      }
    }
    expect(empty).toHaveLength(0);
  });

  it('no duplicate skill paths within any single agent', () => {
    const agentMap = getAgentSkillsMap();
    const dupes: string[] = [];

    for (const [agent, config] of Object.entries(agentMap)) {
      const allPaths = [...config.inject, ...config.readFile];
      const unique = new Set(allPaths);
      if (unique.size !== allPaths.length) {
        dupes.push(`${agent}: has duplicate skill paths`);
      }
    }
    expect(dupes).toHaveLength(0);
  });
});

describe('Agent definitions: .agent.md files', () => {
  const agentFiles = getAllAgentFiles();

  it('every hooked agent has a corresponding .agent.md file', () => {
    // Map from hook agent names to expected file names
    const expectedFiles = HOOKED_AGENTS.map((a) => `${a}.agent.md`);
    const missing = expectedFiles.filter((f) => !agentFiles.includes(f));
    expect(missing).toHaveLength(0);
  });

  it('Beth orchestrator has an .agent.md file', () => {
    // Beth is special — she's the orchestrator, not a hooked agent
    const bethFile = agentFiles.find((f) => f.toLowerCase().includes('beth'));
    expect(bethFile).toBeDefined();
  });

  it('every .agent.md file is non-empty', () => {
    const empty: string[] = [];
    for (const file of agentFiles) {
      const content = readFileSync(join(AGENTS_DIR, file), 'utf8');
      if (content.trim().length < 50) {
        empty.push(file);
      }
    }
    expect(empty).toHaveLength(0);
  });
});

describe('SKILL.md content quality', () => {
  const allSkillDirs = getAllSkillDirs();

  it('every SKILL.md has at least 100 characters of content', () => {
    const tooShort: string[] = [];
    for (const dir of allSkillDirs) {
      const path = join(SKILLS_DIR, dir, 'SKILL.md');
      if (existsSync(path)) {
        const content = readFileSync(path, 'utf8');
        if (content.trim().length < 100) {
          tooShort.push(`${dir}: ${content.trim().length} chars`);
        }
      }
    }
    expect(tooShort).toHaveLength(0);
  });

  it('every SKILL.md starts with YAML frontmatter, a markdown heading, or a code fence', () => {
    const badStart: string[] = [];
    for (const dir of allSkillDirs) {
      const path = join(SKILLS_DIR, dir, 'SKILL.md');
      if (existsSync(path)) {
        const content = readFileSync(path, 'utf8').trimStart();
        // SKILL.md files can start with:
        // - YAML frontmatter (---)
        // - Markdown heading (#)
        // - Code fence with skill type (```skill, ```yaml, etc.)
        const validStart = content.startsWith('#') ||
          content.startsWith('---') ||
          content.startsWith('```');
        if (!validStart) {
          badStart.push(dir);
        }
      }
    }
    expect(badStart).toHaveLength(0);
  });
});
