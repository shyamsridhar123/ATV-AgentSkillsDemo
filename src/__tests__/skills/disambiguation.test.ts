/**
 * Disambiguation Tests — Known Challenge Pairs
 *
 * These skill pairs share semantic space and can be confused by LLM inference.
 * Tests verify structural differences that SHOULD enable correct disambiguation.
 *
 * Test plan reference: docs/E2E-SKILL-TESTS.md — Known Disambiguation Challenges
 */

import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';

const PROJECT_ROOT = process.cwd();
const SKILLS_DIR = join(PROJECT_ROOT, '.github/skills');

/** Read a skill's SKILL.md content */
function readSkill(skillName: string): string {
  const path = join(SKILLS_DIR, skillName, 'SKILL.md');
  return readFileSync(path, 'utf8');
}

/** Check if a skill directory exists */
function skillDirExists(skillName: string): boolean {
  return existsSync(join(SKILLS_DIR, skillName));
}

// ─── Pair 1: brainstorming vs ce:brainstorm ────────────────────────────────

describe('Disambiguation: brainstorming vs ce:brainstorm', () => {
  it('both skills exist', () => {
    expect(skillDirExists('brainstorming')).toBe(true);
    expect(skillDirExists('ce:brainstorm')).toBe(true);
  });

  it('brainstorming is freeform — triggers on natural language', () => {
    const content = readSkill('brainstorming');
    // Should trigger on conversational phrases, not slash commands
    expect(content).toMatch(/brainstorm|think through|explore/i);
  });

  it('ce:brainstorm is a slash command workflow', () => {
    const content = readSkill('ce:brainstorm');
    // Should reference the /ce: prefix or pipeline structure
    expect(content).toMatch(/ce:brainstorm|slash|workflow|pipeline/i);
  });

  it('they are distinct files with different content', () => {
    const freeform = readSkill('brainstorming');
    const slashCmd = readSkill('ce:brainstorm');
    expect(freeform).not.toBe(slashCmd);
  });
});

// ─── Pair 2: compound-docs vs ce:compound ──────────────────────────────────

describe('Disambiguation: compound-docs vs ce:compound', () => {
  it('both skills exist', () => {
    expect(skillDirExists('compound-docs')).toBe(true);
    expect(skillDirExists('ce:compound')).toBe(true);
  });

  it('compound-docs auto-detects from success phrases', () => {
    const content = readSkill('compound-docs');
    // Should trigger on natural completion phrases
    expect(content).toMatch(/document|solution|worked|knowledge/i);
  });

  it('ce:compound is a slash command workflow', () => {
    const content = readSkill('ce:compound');
    expect(content).toMatch(/ce:compound|slash|workflow|compound/i);
  });

  it('they are distinct files with different content', () => {
    const autoDocs = readSkill('compound-docs');
    const slashCmd = readSkill('ce:compound');
    expect(autoDocs).not.toBe(slashCmd);
  });
});

// ─── Pair 3: ce:plan vs deepen-plan ────────────────────────────────────────

describe('Disambiguation: ce:plan vs deepen-plan', () => {
  it('both skills exist', () => {
    expect(skillDirExists('ce:plan')).toBe(true);
    expect(skillDirExists('deepen-plan')).toBe(true);
  });

  it('ce:plan creates plans from scratch', () => {
    const content = readSkill('ce:plan');
    // Should focus on creation/transformation
    expect(content).toMatch(/plan|transform|create|structure/i);
  });

  it('deepen-plan enriches existing plans', () => {
    const content = readSkill('deepen-plan');
    // Should focus on enhancement/enrichment
    expect(content).toMatch(/enhance|deepen|research|depth|enrich/i);
  });

  it('they are distinct files with different content', () => {
    const create = readSkill('ce:plan');
    const deepen = readSkill('deepen-plan');
    expect(create).not.toBe(deepen);
  });
});

// ─── Pair 4: ce:review vs document-review ──────────────────────────────────

describe('Disambiguation: ce:review vs document-review', () => {
  it('both skills exist', () => {
    expect(skillDirExists('ce:review')).toBe(true);
    expect(skillDirExists('document-review')).toBe(true);
  });

  it('ce:review focuses on code review', () => {
    const content = readSkill('ce:review');
    expect(content).toMatch(/code|review|multi-agent|analysis/i);
  });

  it('document-review focuses on markdown/document review', () => {
    const content = readSkill('document-review');
    expect(content).toMatch(/document|brainstorm|plan|refine/i);
  });

  it('they are distinct files with different content', () => {
    const codeReview = readSkill('ce:review');
    const docReview = readSkill('document-review');
    expect(codeReview).not.toBe(docReview);
  });
});

// ─── Pair 5: resolve_parallel vs resolve_todo_parallel vs resolve-pr-parallel

describe('Disambiguation: resolve_parallel vs resolve_todo_parallel vs resolve-pr-parallel', () => {
  it('all three skills exist', () => {
    expect(skillDirExists('resolve_parallel')).toBe(true);
    expect(skillDirExists('resolve_todo_parallel')).toBe(true);
    expect(skillDirExists('resolve-pr-parallel')).toBe(true);
  });

  it('resolve_parallel targets code TODOs', () => {
    const content = readSkill('resolve_parallel');
    expect(content).toMatch(/TODO|FIXME|code|codebase/i);
  });

  it('resolve_todo_parallel targets CLI todos', () => {
    const content = readSkill('resolve_todo_parallel');
    expect(content).toMatch(/todo|pending|CLI|list/i);
  });

  it('resolve-pr-parallel targets PR review comments', () => {
    const content = readSkill('resolve-pr-parallel');
    expect(content).toMatch(/PR|pull request|review|comment/i);
  });

  it('all three are distinct files', () => {
    const code = readSkill('resolve_parallel');
    const todo = readSkill('resolve_todo_parallel');
    const pr = readSkill('resolve-pr-parallel');
    expect(code).not.toBe(todo);
    expect(code).not.toBe(pr);
    expect(todo).not.toBe(pr);
  });
});

// ─── Pair 6: lfg vs slfg ──────────────────────────────────────────────────

describe('Disambiguation: lfg vs slfg', () => {
  it('both skills exist', () => {
    expect(skillDirExists('lfg')).toBe(true);
    expect(skillDirExists('slfg')).toBe(true);
  });

  it('lfg is sequential execution', () => {
    const content = readSkill('lfg');
    expect(content).toMatch(/sequential|execute|work plan|step/i);
  });

  it('slfg is swarm/parallel execution', () => {
    const content = readSkill('slfg');
    expect(content).toMatch(/swarm|parallel|concurrent/i);
  });

  it('they are distinct files with different content', () => {
    const sequential = readSkill('lfg');
    const parallel = readSkill('slfg');
    expect(sequential).not.toBe(parallel);
  });
});

// ─── Cross-pair integrity ──────────────────────────────────────────────────

describe('Disambiguation: cross-pair structural integrity', () => {
  const ALL_DISAMBIGUATION_SKILLS = [
    'brainstorming', 'ce:brainstorm',
    'compound-docs', 'ce:compound',
    'ce:plan', 'deepen-plan',
    'ce:review', 'document-review',
    'resolve_parallel', 'resolve_todo_parallel', 'resolve-pr-parallel',
    'lfg', 'slfg',
  ];

  it('none of the disambiguation skills are missing', () => {
    for (const skill of ALL_DISAMBIGUATION_SKILLS) {
      expect(skillDirExists(skill)).toBe(true);
    }
  });

  it('all disambiguation skill files are non-empty', () => {
    for (const skill of ALL_DISAMBIGUATION_SKILLS) {
      const content = readSkill(skill);
      expect(content.length).toBeGreaterThan(0);
    }
  });

  it('no two skills in any pair have identical content', () => {
    const pairs: [string, string][] = [
      ['brainstorming', 'ce:brainstorm'],
      ['compound-docs', 'ce:compound'],
      ['ce:plan', 'deepen-plan'],
      ['ce:review', 'document-review'],
      ['lfg', 'slfg'],
    ];

    for (const [a, b] of pairs) {
      const contentA = readSkill(a);
      const contentB = readSkill(b);
      expect(contentA).not.toBe(contentB);
    }
  });
});
