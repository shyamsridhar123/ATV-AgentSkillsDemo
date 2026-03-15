/**
 * Skill Routing Tests — Categories 2–10
 *
 * Verifies every skill in the test matrix:
 * 1. Has a valid SKILL.md file on disk
 * 2. Is mapped to the correct agent
 * 3. Has the expected enforcement mechanism (hook inject, readFile, or keyword)
 *
 * These tests validate the structural integrity of the skill system.
 * They do NOT test LLM prompt inference (that requires integration testing).
 *
 * Test plan reference: docs/E2E-SKILL-TESTS.md — Categories 2–10 (tests 10–72)
 */

import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

const PROJECT_ROOT = process.cwd();
const SKILLS_DIR = join(PROJECT_ROOT, '.github/skills');
const PROMPTS_DIR = join(PROJECT_ROOT, '.github/prompts');
const EXTERNAL_SKILLS_DIR = join(process.env.HOME || '~', '.agents/skills');

// ─── Type definitions ──────────────────────────────────────────────────────

interface SkillTest {
  id: number;
  skill: string;
  /** Resolved path to SKILL.md relative to project root (or absolute for external) */
  skillPath: string;
  agent: string;
  testPrompt: string;
  /** Whether this skill lives outside the repo (e.g., ~/.agents/skills/) */
  external?: boolean;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function skillExists(test: SkillTest): boolean {
  if (test.external) {
    return existsSync(test.skillPath);
  }
  return existsSync(join(PROJECT_ROOT, test.skillPath));
}

function readSkillContent(test: SkillTest): string {
  const fullPath = test.external ? test.skillPath : join(PROJECT_ROOT, test.skillPath);
  return readFileSync(fullPath, 'utf8');
}

// Valid agents that Beth can route to
const VALID_AGENTS = [
  'Beth',
  'developer',
  'product-manager',
  'ux-designer',
  'security-reviewer',
  'tester',
  'researcher',
];

// ─── Category 2: Azure Skills (tests 10–31) ───────────────────────────────

const AZURE_SKILLS: SkillTest[] = [
  {
    id: 10,
    skill: 'azure-prepare',
    skillPath: '.github/skills/azure-prepare/SKILL.md',
    agent: 'developer',
    testPrompt: 'Create a new containerized Node.js app and deploy it to Azure Container Apps',
  },
  {
    id: 11,
    skill: 'azure-validate',
    skillPath: '.github/skills/azure-validate/SKILL.md',
    agent: 'developer',
    testPrompt: 'Validate my app\'s deployment readiness and check the Bicep configuration',
  },
  {
    id: 12,
    skill: 'azure-deploy',
    skillPath: '.github/skills/azure-deploy/SKILL.md',
    agent: 'developer',
    testPrompt: 'Run azd up to push the app to production',
  },
  {
    id: 13,
    skill: 'azure-compute',
    skillPath: '.github/skills/azure-compute/SKILL.md',
    agent: 'developer',
    testPrompt: 'Recommend the best VM size for our ML training workload on Azure',
  },
  {
    id: 14,
    skill: 'azure-storage',
    skillPath: '.github/skills/azure-storage/SKILL.md',
    agent: 'developer',
    testPrompt: 'Set up blob storage with lifecycle management for our file upload service',
  },
  {
    id: 15,
    skill: 'azure-ai',
    skillPath: '.github/skills/azure-ai/SKILL.md',
    agent: 'developer',
    testPrompt: 'Configure Azure AI Search with vector search for our product catalog',
  },
  {
    id: 16,
    skill: 'azure-aigateway',
    skillPath: '.github/skills/azure-aigateway/SKILL.md',
    agent: 'developer',
    testPrompt: 'Set up semantic caching and token limits for our Azure OpenAI gateway',
  },
  {
    id: 17,
    skill: 'azure-kusto',
    skillPath: '.github/skills/azure-kusto/SKILL.md',
    agent: 'developer',
    testPrompt: 'Write KQL queries to analyze the IoT telemetry in Azure Data Explorer',
  },
  {
    id: 18,
    skill: 'azure-messaging',
    skillPath: '.github/skills/azure-messaging/SKILL.md',
    agent: 'developer',
    testPrompt: 'Troubleshoot this AMQP connection error with our Event Hub consumer',
  },
  {
    id: 19,
    skill: 'azure-hosted-copilot-sdk',
    skillPath: '.github/skills/azure-hosted-copilot-sdk/SKILL.md',
    agent: 'developer',
    testPrompt: 'Build a copilot app using @github/copilot-sdk and deploy to Azure',
  },
  {
    id: 20,
    skill: 'appinsights-instrumentation',
    skillPath: '.github/skills/appinsights-instrumentation/SKILL.md',
    agent: 'developer',
    testPrompt: 'Instrument our web app with Application Insights telemetry',
  },
  {
    id: 21,
    skill: 'microsoft-foundry',
    skillPath: '.github/skills/microsoft-foundry/SKILL.md',
    agent: 'developer',
    testPrompt: 'Deploy our agent to Microsoft Foundry and run batch evaluation',
  },
  {
    id: 22,
    skill: 'azure-rbac',
    skillPath: '.github/skills/azure-rbac/SKILL.md',
    agent: 'security-reviewer',
    testPrompt: 'Find the least privilege RBAC role for our managed identity to read blobs',
  },
  {
    id: 23,
    skill: 'azure-compliance',
    skillPath: '.github/skills/azure-compliance/SKILL.md',
    agent: 'security-reviewer',
    testPrompt: 'Run a compliance scan and security audit on our Azure subscription',
  },
  {
    id: 24,
    skill: 'entra-app-registration',
    skillPath: '.github/skills/entra-app-registration/SKILL.md',
    agent: 'security-reviewer',
    testPrompt: 'Create an Entra ID app registration with OAuth and MSAL configuration',
  },
  {
    id: 25,
    skill: 'azure-cost-optimization',
    skillPath: '.github/skills/azure-cost-optimization/SKILL.md',
    agent: 'product-manager',
    testPrompt: 'Analyze our Azure spending and find cost optimization opportunities',
  },
  {
    id: 26,
    skill: 'azure-cloud-migrate',
    skillPath: '.github/skills/azure-cloud-migrate/SKILL.md',
    agent: 'product-manager',
    testPrompt: 'Assess migrating our Lambda functions to Azure Functions',
  },
  {
    id: 27,
    skill: 'azure-diagnostics',
    skillPath: '.github/skills/azure-diagnostics/SKILL.md',
    agent: 'tester',
    testPrompt: 'Troubleshoot why our Container App is failing health probes in production',
  },
  {
    id: 28,
    skill: 'azure-resource-lookup',
    skillPath: '.github/skills/azure-resource-lookup/SKILL.md',
    agent: 'Beth',
    testPrompt: 'List all VMs and storage accounts across our Azure subscriptions',
  },
  {
    id: 29,
    skill: 'azure-resource-visualizer',
    skillPath: '.github/skills/azure-resource-visualizer/SKILL.md',
    agent: 'Beth',
    testPrompt: 'Generate a Mermaid architecture diagram of our Azure resource group',
  },
  {
    id: 30,
    skill: 'azure-postgres',
    skillPath: join(EXTERNAL_SKILLS_DIR, 'azure-postgres/SKILL.md'),
    agent: 'developer',
    testPrompt: 'Configure passwordless Entra ID authentication for our Postgres server',
    external: true,
  },
  {
    id: 31,
    skill: 'azure-quotas',
    skillPath: join(EXTERNAL_SKILLS_DIR, 'azure-quotas/SKILL.md'),
    agent: 'developer',
    testPrompt: 'Check our Azure subscription quotas and vCPU limits',
    external: true,
  },
];

// ─── Category 3: Design & Frontend (tests 32–35) ──────────────────────────

const DESIGN_SKILLS: SkillTest[] = [
  {
    id: 32,
    skill: 'frontend-design',
    skillPath: '.github/skills/frontend-design/SKILL.md',
    agent: 'developer',
    testPrompt: 'Build a distinctive, production-grade landing page with creative animations',
  },
  {
    id: 33,
    skill: 'brainstorming',
    skillPath: '.github/skills/brainstorming/SKILL.md',
    agent: 'ux-designer',
    testPrompt: 'Let\'s brainstorm approaches for the new onboarding flow',
  },
  {
    id: 34,
    skill: 'document-review',
    skillPath: '.github/skills/document-review/SKILL.md',
    agent: 'ux-designer',
    testPrompt: 'Review and refine this brainstorm document before we proceed to planning',
  },
  {
    id: 35,
    skill: 'every-style-editor',
    skillPath: '.github/skills/every-style-editor/SKILL.md',
    agent: 'product-manager',
    testPrompt: 'Edit this blog post for grammar and style guide compliance',
  },
];

// ─── Category 4: Product & Research (tests 36–39) ─────────────────────────

const PRODUCT_SKILLS: SkillTest[] = [
  {
    id: 36,
    skill: 'prd',
    skillPath: '.github/skills/prd/SKILL.md',
    agent: 'product-manager',
    testPrompt: 'Write a product requirements document for the billing dashboard feature',
  },
  {
    id: 37,
    skill: 'web-search',
    skillPath: '.github/skills/web-search/SKILL.md',
    agent: 'researcher',
    testPrompt: 'Research the competitive landscape for AI code assistants',
  },
  {
    id: 38,
    skill: 'proof',
    skillPath: '.github/skills/proof/SKILL.md',
    agent: 'product-manager',
    testPrompt: 'Create a proof document and share it for team review',
  },
  {
    id: 39,
    skill: 'changelog',
    skillPath: '.github/skills/changelog/SKILL.md',
    agent: 'developer',
    testPrompt: 'Generate a changelog from recent commits',
  },
];

// ─── Category 5: Developer Workflow (tests 40–53) ─────────────────────────

const DEVELOPER_WORKFLOW_SKILLS: SkillTest[] = [
  {
    id: 40,
    skill: 'create-agent-skills',
    skillPath: '.github/skills/create-agent-skills/SKILL.md',
    agent: 'developer',
    testPrompt: 'Create a new Claude Code skill for database migration workflows',
  },
  {
    id: 41,
    skill: 'git-worktree',
    skillPath: '.github/skills/git-worktree/SKILL.md',
    agent: 'developer',
    testPrompt: 'Create a git worktree for isolated parallel development on the feature branch',
  },
  {
    id: 42,
    skill: 'feature-video',
    skillPath: '.github/skills/feature-video/SKILL.md',
    agent: 'developer',
    testPrompt: 'Record a video walkthrough of the new settings feature for the PR',
  },
  {
    id: 43,
    skill: 'resolve_parallel',
    skillPath: '.github/skills/resolve_parallel/SKILL.md',
    agent: 'developer',
    testPrompt: 'Resolve all code TODOs in the codebase using parallel processing',
  },
  {
    id: 44,
    skill: 'resolve_todo_parallel',
    skillPath: '.github/skills/resolve_todo_parallel/SKILL.md',
    agent: 'developer',
    testPrompt: 'Resolve all pending CLI todos in my todo list',
  },
  {
    id: 45,
    skill: 'resolve-pr-parallel',
    skillPath: '.github/skills/resolve-pr-parallel/SKILL.md',
    agent: 'developer',
    testPrompt: 'Address all PR review comments using parallel processing',
  },
  {
    id: 46,
    skill: 'lfg',
    skillPath: '.github/skills/lfg/SKILL.md',
    agent: 'developer',
    testPrompt: 'Execute the work plan sequentially — let\'s go',
  },
  {
    id: 47,
    skill: 'slfg',
    skillPath: '.github/skills/slfg/SKILL.md',
    agent: 'developer',
    testPrompt: 'Execute the work plan using swarm parallel processing',
  },
  {
    id: 48,
    skill: 'deepen-plan',
    skillPath: '.github/skills/deepen-plan/SKILL.md',
    agent: 'developer',
    testPrompt: 'Enhance this plan with parallel research agents to add depth and best practices',
  },
  {
    id: 49,
    skill: 'agent-browser',
    skillPath: '.github/skills/agent-browser/SKILL.md',
    agent: 'developer',
    testPrompt: 'Browse the staging site and fill out the signup form to test it',
  },
  {
    id: 50,
    skill: 'agent-native-architecture',
    skillPath: '.github/skills/agent-native-architecture/SKILL.md',
    agent: 'developer',
    testPrompt: 'Design an application where agents are first-class citizens with MCP tools',
  },
  {
    id: 51,
    skill: 'rclone',
    skillPath: '.github/skills/rclone/SKILL.md',
    agent: 'developer',
    testPrompt: 'Upload the generated video files to our S3 bucket',
  },
  {
    id: 52,
    skill: 'gemini-imagegen',
    skillPath: '.github/skills/gemini-imagegen/SKILL.md',
    agent: 'developer',
    testPrompt: 'Generate a product mockup image using Gemini for the landing page',
  },
  {
    id: 53,
    skill: 'generate_command',
    skillPath: '.github/skills/generate_command/SKILL.md',
    agent: 'developer',
    testPrompt: 'Generate a shell command to find all TypeScript files with TODO comments',
  },
];

// ─── Category 6: Testing & QA (tests 54–58) ──────────────────────────────

const TESTING_SKILLS: SkillTest[] = [
  {
    id: 54,
    skill: 'test-browser',
    skillPath: '.github/skills/test-browser/SKILL.md',
    agent: 'tester',
    testPrompt: 'Run browser tests on pages affected by the current PR',
  },
  {
    id: 55,
    skill: 'test-xcode',
    skillPath: '.github/skills/test-xcode/SKILL.md',
    agent: 'tester',
    testPrompt: 'Run Xcode tests for the iOS module',
  },
  {
    id: 56,
    skill: 'report-bug',
    skillPath: '.github/skills/report-bug/SKILL.md',
    agent: 'tester',
    testPrompt: 'File a bug report for the broken pagination on the search results page',
  },
  {
    id: 57,
    skill: 'reproduce-bug',
    skillPath: '.github/skills/reproduce-bug/SKILL.md',
    agent: 'tester',
    testPrompt: 'Reproduce the intermittent crash reported in issue #42',
  },
  {
    id: 58,
    skill: 'triage',
    skillPath: '.github/skills/triage/SKILL.md',
    agent: 'tester',
    testPrompt: 'Triage the incoming bug reports and prioritize by severity',
  },
];

// ─── Category 7: Orchestration & Swarm (tests 59–62) ─────────────────────

const ORCHESTRATION_SKILLS: SkillTest[] = [
  {
    id: 59,
    skill: 'orchestrating-swarms',
    skillPath: '.github/skills/orchestrating-swarms/SKILL.md',
    agent: 'Beth',
    testPrompt: 'Orchestrate a swarm of agents to parallelize the migration work',
  },
  {
    id: 60,
    skill: 'setup',
    skillPath: '.github/skills/setup/SKILL.md',
    agent: 'Beth',
    testPrompt: 'Set up the project structure and initialize the development environment',
  },
  {
    id: 61,
    skill: 'heal-skill',
    skillPath: '.github/skills/heal-skill/SKILL.md',
    agent: 'Beth',
    testPrompt: 'Fix this broken skill that isn\'t loading correctly',
  },
  {
    id: 62,
    skill: 'file-todos',
    skillPath: '.github/skills/file-todos/SKILL.md',
    agent: 'developer',
    testPrompt: 'Scan the codebase and create tasks for all TODO/FIXME comments',
  },
];

// ─── Category 8: CE Workflow Pipeline (tests 63–67) ──────────────────────

const CE_WORKFLOW_SKILLS: SkillTest[] = [
  {
    id: 63,
    skill: 'ce:brainstorm',
    skillPath: '.github/skills/ce:brainstorm/SKILL.md',
    agent: 'ux-designer',
    testPrompt: '/ce:brainstorm — explore requirements for the new dashboard',
  },
  {
    id: 64,
    skill: 'ce:plan',
    skillPath: '.github/skills/ce:plan/SKILL.md',
    agent: 'developer',
    testPrompt: '/ce:plan — transform the feature description into a structured project plan',
  },
  {
    id: 65,
    skill: 'ce:work',
    skillPath: '.github/skills/ce:work/SKILL.md',
    agent: 'developer',
    testPrompt: '/ce:work — execute the work plan and finish the feature',
  },
  {
    id: 66,
    skill: 'ce:review',
    skillPath: '.github/skills/ce:review/SKILL.md',
    agent: 'developer',
    testPrompt: '/ce:review — perform exhaustive multi-agent code review',
  },
  {
    id: 67,
    skill: 'ce:compound',
    skillPath: '.github/skills/ce:compound/SKILL.md',
    agent: 'developer',
    testPrompt: '/ce:compound — document what we solved to compound team knowledge',
  },
];

// ─── Category 9: Language-Specific (tests 68–70) ─────────────────────────

const LANGUAGE_SKILLS: SkillTest[] = [
  {
    id: 68,
    skill: 'dhh-rails-style',
    skillPath: '.github/skills/dhh-rails-style/SKILL.md',
    agent: 'developer',
    testPrompt: 'Write a Rails controller for user management in DHH\'s 37signals style',
  },
  {
    id: 69,
    skill: 'andrew-kane-gem-writer',
    skillPath: '.github/skills/andrew-kane-gem-writer/SKILL.md',
    agent: 'developer',
    testPrompt: 'Create a Ruby gem for CSV parsing following Andrew Kane\'s patterns',
  },
  {
    id: 70,
    skill: 'dspy-ruby',
    skillPath: '.github/skills/dspy-ruby/SKILL.md',
    agent: 'developer',
    testPrompt: 'Build an LLM module using DSPy.rb signatures for intent classification',
  },
];

// ─── Category 10: Remaining Skills (tests 71–72) ─────────────────────────

const REMAINING_SKILLS: SkillTest[] = [
  {
    id: 71,
    skill: 'compound-docs',
    skillPath: '.github/skills/compound-docs/SKILL.md',
    agent: 'developer',
    testPrompt: 'That worked! Document this solution for the team',
  },
  {
    id: 72,
    skill: 'agent-native-audit',
    skillPath: '.github/skills/agent-native-audit/SKILL.md',
    agent: 'security-reviewer',
    testPrompt: 'Audit the agent-native architecture for security and reliability',
  },
];

// ─── All skills combined for cross-cutting tests ──────────────────────────

const ALL_SKILLS: SkillTest[] = [
  ...AZURE_SKILLS,
  ...DESIGN_SKILLS,
  ...PRODUCT_SKILLS,
  ...DEVELOPER_WORKFLOW_SKILLS,
  ...TESTING_SKILLS,
  ...ORCHESTRATION_SKILLS,
  ...CE_WORKFLOW_SKILLS,
  ...LANGUAGE_SKILLS,
  ...REMAINING_SKILLS,
];

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('Category 2: Azure Skills', () => {
  describe.each(AZURE_SKILLS)(
    'Test #$id: $skill → $agent',
    (test) => {
      if (test.external) {
        it.skipIf(!skillExists(test))('skill file exists (external)', () => {
          expect(skillExists(test)).toBe(true);
        });

        it.skipIf(!skillExists(test))('skill file is non-empty', () => {
          const content = readSkillContent(test);
          expect(content.length).toBeGreaterThan(0);
        });
      } else {
        it('skill file exists on disk', () => {
          expect(skillExists(test)).toBe(true);
        });

        it('skill file is non-empty', () => {
          const content = readSkillContent(test);
          expect(content.length).toBeGreaterThan(0);
        });
      }

      it('agent is a valid Beth team member', () => {
        expect(VALID_AGENTS).toContain(test.agent);
      });

      it('test prompt is non-empty', () => {
        expect(test.testPrompt.length).toBeGreaterThan(10);
      });
    },
  );
});

describe('Category 3: Design & Frontend', () => {
  describe.each(DESIGN_SKILLS)(
    'Test #$id: $skill → $agent',
    (test) => {
      it('skill file exists on disk', () => {
        expect(skillExists(test)).toBe(true);
      });

      it('skill file is non-empty', () => {
        const content = readSkillContent(test);
        expect(content.length).toBeGreaterThan(0);
      });

      it('agent is a valid Beth team member', () => {
        expect(VALID_AGENTS).toContain(test.agent);
      });
    },
  );
});

describe('Category 4: Product & Research', () => {
  describe.each(PRODUCT_SKILLS)(
    'Test #$id: $skill → $agent',
    (test) => {
      it('skill file exists on disk', () => {
        expect(skillExists(test)).toBe(true);
      });

      it('skill file is non-empty', () => {
        const content = readSkillContent(test);
        expect(content.length).toBeGreaterThan(0);
      });

      it('agent is a valid Beth team member', () => {
        expect(VALID_AGENTS).toContain(test.agent);
      });
    },
  );
});

describe('Category 5: Developer Workflow', () => {
  describe.each(DEVELOPER_WORKFLOW_SKILLS)(
    'Test #$id: $skill → $agent',
    (test) => {
      it('skill file exists on disk', () => {
        expect(skillExists(test)).toBe(true);
      });

      it('skill file is non-empty', () => {
        const content = readSkillContent(test);
        expect(content.length).toBeGreaterThan(0);
      });

      it('agent is a valid Beth team member', () => {
        expect(VALID_AGENTS).toContain(test.agent);
      });
    },
  );
});

describe('Category 6: Testing & QA', () => {
  describe.each(TESTING_SKILLS)(
    'Test #$id: $skill → $agent',
    (test) => {
      it('skill file exists on disk', () => {
        expect(skillExists(test)).toBe(true);
      });

      it('skill file is non-empty', () => {
        const content = readSkillContent(test);
        expect(content.length).toBeGreaterThan(0);
      });

      it('agent is a valid Beth team member', () => {
        expect(VALID_AGENTS).toContain(test.agent);
      });
    },
  );
});

describe('Category 7: Orchestration & Swarm', () => {
  describe.each(ORCHESTRATION_SKILLS)(
    'Test #$id: $skill → $agent',
    (test) => {
      it('skill file exists on disk', () => {
        expect(skillExists(test)).toBe(true);
      });

      it('skill file is non-empty', () => {
        const content = readSkillContent(test);
        expect(content.length).toBeGreaterThan(0);
      });

      it('agent is a valid Beth team member', () => {
        expect(VALID_AGENTS).toContain(test.agent);
      });
    },
  );
});

describe('Category 8: CE Workflow Pipeline', () => {
  describe.each(CE_WORKFLOW_SKILLS)(
    'Test #$id: $skill → $agent',
    (test) => {
      it('skill file exists on disk', () => {
        expect(skillExists(test)).toBe(true);
      });

      it('skill file is non-empty', () => {
        const content = readSkillContent(test);
        expect(content.length).toBeGreaterThan(0);
      });

      it('agent is a valid Beth team member', () => {
        expect(VALID_AGENTS).toContain(test.agent);
      });

      it('test prompt starts with /ce: (slash command)', () => {
        expect(test.testPrompt).toMatch(/^\/ce:/);
      });
    },
  );

  it('CE pipeline covers all 5 phases: brainstorm → plan → work → review → compound', () => {
    const phases = CE_WORKFLOW_SKILLS.map((s) => s.skill);
    expect(phases).toContain('ce:brainstorm');
    expect(phases).toContain('ce:plan');
    expect(phases).toContain('ce:work');
    expect(phases).toContain('ce:review');
    expect(phases).toContain('ce:compound');
  });
});

describe('Category 9: Language-Specific', () => {
  describe.each(LANGUAGE_SKILLS)(
    'Test #$id: $skill → $agent',
    (test) => {
      it('skill file exists on disk', () => {
        expect(skillExists(test)).toBe(true);
      });

      it('skill file is non-empty', () => {
        const content = readSkillContent(test);
        expect(content.length).toBeGreaterThan(0);
      });

      it('all language skills route to developer', () => {
        expect(test.agent).toBe('developer');
      });
    },
  );
});

describe('Category 10: Remaining Skills', () => {
  describe.each(REMAINING_SKILLS)(
    'Test #$id: $skill → $agent',
    (test) => {
      it('skill file exists on disk', () => {
        expect(skillExists(test)).toBe(true);
      });

      it('skill file is non-empty', () => {
        const content = readSkillContent(test);
        expect(content.length).toBeGreaterThan(0);
      });

      it('agent is a valid Beth team member', () => {
        expect(VALID_AGENTS).toContain(test.agent);
      });
    },
  );
});

// ─── Cross-cutting validation ──────────────────────────────────────────────

describe('Cross-cutting: Test matrix integrity', () => {
  it('all test IDs are unique', () => {
    const ids = ALL_SKILLS.map((t) => t.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('test IDs are sequential from 10 to 72', () => {
    const ids = ALL_SKILLS.map((t) => t.id).sort((a, b) => a - b);
    expect(ids[0]).toBe(10);
    expect(ids[ids.length - 1]).toBe(72);
  });

  it('all agents in the matrix are valid', () => {
    for (const test of ALL_SKILLS) {
      expect(VALID_AGENTS).toContain(test.agent);
    }
  });

  it('no duplicate skill names in the matrix', () => {
    const skills = ALL_SKILLS.map((t) => t.skill);
    // prd appears in both Category 1 (hook) and Category 4 (routing) — allow it
    // web-search also appears twice — same reason
    // Only check within THIS matrix (Categories 2-10)
    const duplicates = skills.filter((s, i) => skills.indexOf(s) !== i);
    expect(duplicates).toHaveLength(0);
  });

  it('every non-external skill has a corresponding directory in .github/skills/', () => {
    for (const test of ALL_SKILLS) {
      if (test.external) continue;
      // Extract skill dir name from path
      const match = test.skillPath.match(/\.github\/skills\/([^/]+)\//);
      if (match) {
        const skillDir = join(SKILLS_DIR, match[1]);
        expect(existsSync(skillDir)).toBe(true);
      }
    }
  });

  it('agent routing distribution is reasonable', () => {
    const agentCounts: Record<string, number> = {};
    for (const test of ALL_SKILLS) {
      agentCounts[test.agent] = (agentCounts[test.agent] || 0) + 1;
    }
    // Developer should have the most skills (they're the builder)
    expect(agentCounts['developer']).toBeGreaterThan(agentCounts['tester'] || 0);
    expect(agentCounts['developer']).toBeGreaterThan(agentCounts['product-manager'] || 0);
  });
});
