/**
 * Smoke Test — Vitest Infrastructure Verification
 *
 * Proves the new Vitest test infrastructure works correctly
 * alongside the existing node:test-based tests.
 */

import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { loadAgents } from '../core/agents/loader.js';
import { loadSkills } from '../core/skills/loader.js';

const TEMPLATES_AGENTS_DIR = join(process.cwd(), 'templates', '.github', 'agents');
const TEMPLATES_SKILLS_DIR = join(process.cwd(), 'templates', '.github', 'skills');

describe('Smoke Test: Agent Loader', () => {
  it('should load agents from templates directory', () => {
    const result = loadAgents(TEMPLATES_AGENTS_DIR);

    expect(result.errors).toHaveLength(0);
    expect(result.agents.length).toBeGreaterThanOrEqual(6);

    const agentIds = result.agents.map((a) => a.id);
    expect(agentIds).toContain('beth');
    expect(agentIds).toContain('developer');
  });
});

describe('Smoke Test: Skill Loader', () => {
  it('should load skills from templates directory', () => {
    const result = loadSkills(TEMPLATES_SKILLS_DIR);

    expect(result.errors).toHaveLength(0);
    expect(result.skills.length).toBeGreaterThanOrEqual(5);

    const skillIds = result.skills.map((s) => s.id);
    expect(skillIds).toContain('prd');
    expect(skillIds).toContain('shadcn-ui');
  });
});

describe('Smoke Test: Barrel Exports', () => {
  it('should export agent loader functions', async () => {
    const mod = await import('../index.js');

    expect(mod.loadAgents).toBeDefined();
    expect(typeof mod.loadAgents).toBe('function');
    expect(mod.loadAgent).toBeDefined();
    expect(typeof mod.loadAgent).toBe('function');
  });

  it('should export skill loader functions', async () => {
    const mod = await import('../index.js');

    expect(mod.loadSkills).toBeDefined();
    expect(typeof mod.loadSkills).toBe('function');
    expect(mod.loadSkill).toBeDefined();
    expect(typeof mod.loadSkill).toBe('function');
  });
});

describe('Smoke Test: package.json bin field', () => {
  const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8'));

  it('should have beth-copilot bin entry', () => {
    expect(pkg.bin['beth-copilot']).toBe('bin/cli.js');
  });

  it('should have beth bin entry for backward compat', () => {
    expect(pkg.bin['beth']).toBe('bin/cli.js');
  });

  it('should point both entries to the same file', () => {
    expect(pkg.bin['beth-copilot']).toBe(pkg.bin['beth']);
  });
});
