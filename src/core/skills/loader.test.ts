/**
 * Skill Loader Tests
 *
 * Tests for parsing SKILL.md files into typed SkillDefinition objects.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { join } from 'node:path';
import {
  loadSkills,
  loadSkill,
  getSkillById,
  extractTriggers,
  buildTriggerMap,
  findMatchingSkills,
  DEFAULT_SKILLS_DIR,
  SKILL_FILE_NAME,
} from './loader.js';

// Test against templates directory
const TEMPLATES_SKILLS_DIR = join(process.cwd(), 'templates', '.github', 'skills');

describe('Skill Loader', () => {
  describe('loadSkills', () => {
    it('should load all skills from templates directory', () => {
      const result = loadSkills(TEMPLATES_SKILLS_DIR);

      assert.strictEqual(result.errors.length, 0, `Unexpected errors: ${JSON.stringify(result.errors)}`);
      assert.ok(result.skills.length >= 5, `Expected at least 5 skills, got ${result.skills.length}`);

      // Check expected skills exist
      const skillIds = result.skills.map((s) => s.id);
      assert.ok(skillIds.includes('prd'), 'Should include prd skill');
      assert.ok(skillIds.includes('shadcn-ui'), 'Should include shadcn-ui skill');
      assert.ok(skillIds.includes('vercel-react-best-practices'), 'Should include react best practices skill');
    });

    it('should return error for non-existent directory', () => {
      const result = loadSkills('/non/existent/path');

      assert.strictEqual(result.skills.length, 0);
      assert.strictEqual(result.errors.length, 1);
      assert.ok(result.errors[0].message.includes('not found'));
    });
  });

  describe('loadSkill', () => {
    it('should parse PRD skill correctly', () => {
      const filePath = join(TEMPLATES_SKILLS_DIR, 'prd', 'SKILL.md');
      const result = loadSkill(filePath, 'prd');

      assert.ok(!('error' in result), `Unexpected error: ${JSON.stringify(result)}`);
      const { skill } = result as { skill: any };

      assert.strictEqual(skill.id, 'prd');
      assert.strictEqual(skill.frontmatter.name, 'prd');
      assert.ok(skill.frontmatter.description?.includes('PRD'));
      assert.ok(skill.body.length > 100, 'Should have substantial body content');
      assert.ok(skill.triggers.length > 0, 'Should have extracted triggers');
    });

    it('should extract sourcePath correctly', () => {
      const filePath = join(TEMPLATES_SKILLS_DIR, 'prd', 'SKILL.md');
      const result = loadSkill(filePath, 'prd');

      assert.ok(!('error' in result));
      const { skill } = result as { skill: any };

      assert.strictEqual(skill.sourcePath, filePath);
    });
  });

  describe('extractTriggers', () => {
    it('should extract triggers from "Triggers on:" pattern', () => {
      const description = 'Generate PRDs. Triggers on: create a prd, write prd for, plan this feature.';
      const triggers = extractTriggers(description);

      assert.ok(triggers.includes('create a prd'));
      assert.ok(triggers.includes('write prd for'));
      assert.ok(triggers.includes('plan this feature'));
    });

    it('should extract triggers from "Use when:" pattern', () => {
      const description = 'Component library skill. Use when: shadcn, ui component, install button';
      const triggers = extractTriggers(description);

      assert.ok(triggers.includes('shadcn'));
      assert.ok(triggers.includes('ui component'));
      assert.ok(triggers.includes('install button'));
    });

    it('should extract quoted phrases', () => {
      const description = 'Use when asked to "create a prd" or "write requirements"';
      const triggers = extractTriggers(description);

      assert.ok(triggers.includes('create a prd'));
      assert.ok(triggers.includes('write requirements'));
    });

    it('should deduplicate triggers', () => {
      const description = 'Triggers on: create a prd. Use "create a prd" often.';
      const triggers = extractTriggers(description);

      const prdCount = triggers.filter((t) => t === 'create a prd').length;
      assert.strictEqual(prdCount, 1, 'Should not have duplicate triggers');
    });

    it('should return empty array for undefined description', () => {
      const triggers = extractTriggers(undefined);
      assert.deepStrictEqual(triggers, []);
    });

    it('should return empty array for description without triggers', () => {
      const triggers = extractTriggers('Just a simple description with no trigger patterns.');
      assert.deepStrictEqual(triggers, []);
    });
  });

  describe('buildTriggerMap', () => {
    it('should build a map from triggers to skills', () => {
      const result = loadSkills(TEMPLATES_SKILLS_DIR);
      const triggerMap = buildTriggerMap(result);

      assert.ok(triggerMap.size > 0, 'Should have triggers in map');

      // PRD skill should be findable by its triggers
      const prdSkill = result.skills.find((s) => s.id === 'prd');
      if (prdSkill && prdSkill.triggers.length > 0) {
        const mappedSkill = triggerMap.get(prdSkill.triggers[0]);
        assert.ok(mappedSkill, 'Should find skill by trigger');
        assert.strictEqual(mappedSkill?.id, 'prd');
      }
    });

    it('should use lowercase keys for case-insensitive matching', () => {
      const result = loadSkills(TEMPLATES_SKILLS_DIR);
      const triggerMap = buildTriggerMap(result);

      // All keys should be lowercase
      for (const key of triggerMap.keys()) {
        assert.strictEqual(key, key.toLowerCase(), `Key "${key}" should be lowercase`);
      }
    });
  });

  describe('findMatchingSkills', () => {
    it('should find skills matching a query', () => {
      const result = loadSkills(TEMPLATES_SKILLS_DIR);
      const triggerMap = buildTriggerMap(result);

      // Find PRD skill with a relevant query
      const prdSkill = result.skills.find((s) => s.id === 'prd');
      if (prdSkill && prdSkill.triggers.length > 0) {
        const query = `I want to ${prdSkill.triggers[0]} for my feature`;
        const matches = findMatchingSkills(query, triggerMap);

        assert.ok(matches.length > 0, 'Should find matching skill');
        assert.ok(matches.some((s) => s.id === 'prd'), 'Should include PRD skill');
      }
    });

    it('should be case-insensitive', () => {
      const result = loadSkills(TEMPLATES_SKILLS_DIR);
      const triggerMap = buildTriggerMap(result);

      const matchesLower = findMatchingSkills('create a prd', triggerMap);
      const matchesUpper = findMatchingSkills('CREATE A PRD', triggerMap);

      assert.deepStrictEqual(
        matchesLower.map((s) => s.id),
        matchesUpper.map((s) => s.id),
        'Case should not affect results'
      );
    });

    it('should return empty array for non-matching query', () => {
      const result = loadSkills(TEMPLATES_SKILLS_DIR);
      const triggerMap = buildTriggerMap(result);

      const matches = findMatchingSkills('xyzzy plugh nothing matches this', triggerMap);
      assert.deepStrictEqual(matches, []);
    });

    it('should deduplicate skills that match multiple triggers', () => {
      const result = loadSkills(TEMPLATES_SKILLS_DIR);
      const triggerMap = buildTriggerMap(result);

      // Find a skill with multiple triggers
      const multiTriggerSkill = result.skills.find((s) => s.triggers.length > 1);
      if (multiTriggerSkill) {
        // Create a query that contains multiple triggers for the same skill
        const query = multiTriggerSkill.triggers.join(' and ');
        const matches = findMatchingSkills(query, triggerMap);

        const skillCount = matches.filter((s) => s.id === multiTriggerSkill.id).length;
        assert.strictEqual(skillCount, 1, 'Should not duplicate skills');
      }
    });
  });

  describe('getSkillById', () => {
    it('should find skill by ID (case-insensitive)', () => {
      const result = loadSkills(TEMPLATES_SKILLS_DIR);

      const prd = getSkillById(result, 'PRD');
      assert.ok(prd, 'Should find PRD skill');
      assert.strictEqual(prd?.frontmatter.name, 'prd');

      const prdLower = getSkillById(result, 'prd');
      assert.strictEqual(prd?.id, prdLower?.id, 'Case should not matter');
    });

    it('should return undefined for non-existent skill', () => {
      const result = loadSkills(TEMPLATES_SKILLS_DIR);
      const notFound = getSkillById(result, 'non-existent-skill');

      assert.strictEqual(notFound, undefined);
    });
  });

  describe('constants', () => {
    it('should export correct constants', () => {
      assert.strictEqual(DEFAULT_SKILLS_DIR, '.github/skills');
      assert.strictEqual(SKILL_FILE_NAME, 'SKILL.md');
    });
  });
});

describe('Skill frontmatter structure compatibility', () => {
  it('all loaded skills should have valid frontmatter structure', () => {
    const result = loadSkills(TEMPLATES_SKILLS_DIR);

    for (const skill of result.skills) {
      // Required fields
      assert.ok(skill.frontmatter.name, `${skill.id} should have name`);

      // Body should be non-empty
      assert.ok(skill.body.length > 0, `${skill.id} should have body content`);

      // Triggers should be an array
      assert.ok(Array.isArray(skill.triggers), `${skill.id} triggers should be array`);
    }
  });
});
