/**
 * Skill Loader
 *
 * Parses SKILL.md files from the skills directory into typed SkillDefinition objects.
 * Extracts trigger phrases from the description field for on-demand loading.
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import matter from 'gray-matter';
import type {
  SkillDefinition,
  SkillFrontmatter,
  SkillLoadResult,
  SkillLoadError,
  TriggerMap,
} from './types.js';

/**
 * Default skills directory relative to workspace root.
 */
export const DEFAULT_SKILLS_DIR = '.github/skills';

/**
 * File name for skill definition files.
 */
export const SKILL_FILE_NAME = 'SKILL.md';

/**
 * Load all skills from a directory.
 * Skills are expected to be in subdirectories: skills/<name>/SKILL.md
 *
 * @param skillsDir - Path to skills directory (default: .github/skills)
 * @returns Object containing loaded skills and any errors
 */
export function loadSkills(skillsDir: string = DEFAULT_SKILLS_DIR): SkillLoadResult {
  const skills: SkillDefinition[] = [];
  const errors: SkillLoadError[] = [];

  if (!existsSync(skillsDir)) {
    errors.push({
      filePath: skillsDir,
      message: `Skills directory not found: ${skillsDir}`,
    });
    return { skills, errors };
  }

  // Get subdirectories (each skill is in its own folder)
  const entries = readdirSync(skillsDir);
  const skillDirs = entries.filter((entry) => {
    const entryPath = join(skillsDir, entry);
    return existsSync(entryPath) && statSync(entryPath).isDirectory();
  });

  if (skillDirs.length === 0) {
    errors.push({
      filePath: skillsDir,
      message: `No skill directories found in ${skillsDir}`,
    });
    return { skills, errors };
  }

  for (const dir of skillDirs) {
    const skillPath = join(skillsDir, dir, SKILL_FILE_NAME);

    if (!existsSync(skillPath)) {
      errors.push({
        filePath: join(skillsDir, dir),
        message: `Missing ${SKILL_FILE_NAME} in skill directory: ${dir}`,
      });
      continue;
    }

    const result = loadSkill(skillPath, dir);

    if ('error' in result) {
      errors.push(result.error);
    } else {
      skills.push(result.skill);
    }
  }

  return { skills, errors };
}

/**
 * Load a single skill from a file.
 *
 * @param filePath - Path to the SKILL.md file
 * @param id - Skill ID (directory name)
 * @returns Either a skill definition or an error
 */
export function loadSkill(
  filePath: string,
  id?: string
): { skill: SkillDefinition } | { error: SkillLoadError } {
  try {
    let content = readFileSync(filePath, 'utf-8');

    // Handle GitHub Copilot skill file format: ```skill\n---\n...\n---\n...\n```
    // Strip the code fence wrapper if present
    content = stripCodeFence(content);

    const { data, content: body } = matter(content);

    // Validate required fields
    const validation = validateFrontmatter(data, filePath);
    if (validation.error) {
      return { error: validation.error };
    }

    // Use provided ID or extract from path
    const skillId = id || basename(join(filePath, '..'));

    // Normalize frontmatter
    const frontmatter = normalizeFrontmatter(data);

    // Extract trigger phrases from description
    const triggers = extractTriggers(frontmatter.description);

    return {
      skill: {
        id: skillId,
        frontmatter,
        body: body.trim(),
        sourcePath: filePath,
        triggers,
      },
    };
  } catch (err) {
    return {
      error: {
        filePath,
        message: `Failed to parse skill file: ${err instanceof Error ? err.message : String(err)}`,
        cause: err instanceof Error ? err : undefined,
      },
    };
  }
}

/**
 * Strip GitHub Copilot code fence wrapper from skill/agent files.
 *
 * Files may be wrapped in ```skill or ```chatagent code fences.
 * This extracts the content inside the fence.
 */
function stripCodeFence(content: string): string {
  // Match opening fence: ```skill, ```chatagent, ````skill, etc.
  const fenceMatch = content.match(/^(`{3,})(skill|chatagent)\s*[\r\n]/);
  if (!fenceMatch) {
    return content;
  }

  const fenceLength = fenceMatch[1].length;
  const closingFence = '`'.repeat(fenceLength);

  // Find the closing fence
  const closingIndex = content.lastIndexOf(closingFence);
  if (closingIndex === -1 || closingIndex === 0) {
    return content;
  }

  // Extract content between fences
  const startIndex = fenceMatch[0].length;
  return content.slice(startIndex, closingIndex).trim();
}

/**
 * Validate that frontmatter has required fields.
 */
function validateFrontmatter(
  data: Record<string, unknown>,
  filePath: string
): { error?: SkillLoadError } {
  if (!data.name || typeof data.name !== 'string') {
    return {
      error: {
        filePath,
        message: `Missing or invalid 'name' in frontmatter`,
      },
    };
  }

  return {};
}

/**
 * Normalize frontmatter data to typed SkillFrontmatter.
 */
function normalizeFrontmatter(data: Record<string, unknown>): SkillFrontmatter {
  const frontmatter: SkillFrontmatter = {
    name: data.name as string,
  };

  if (data.description) {
    frontmatter.description = String(data.description);
  }

  return frontmatter;
}

/**
 * Extract trigger phrases from a skill description.
 *
 * Looks for patterns like:
 * - "Triggers on: phrase1, phrase2, phrase3"
 * - "Use when: phrase1, phrase2"
 *
 * Also extracts quoted phrases as potential triggers.
 */
export function extractTriggers(description?: string): string[] {
  if (!description) return [];

  const triggers: string[] = [];

  // Pattern 1: "Triggers on: x, y, z" or "Use when: x, y, z"
  const triggersMatch = description.match(/(?:Triggers on|Use when)[:\s]+([^.]+)/i);
  if (triggersMatch) {
    const phrases = triggersMatch[1].split(',').map((s) => s.trim().toLowerCase());
    triggers.push(...phrases.filter((p) => p.length > 0));
  }

  // Pattern 2: Quoted phrases like "create a prd"
  const quotedMatches = description.match(/"([^"]+)"/g);
  if (quotedMatches) {
    const quoted = quotedMatches.map((q) => q.replace(/"/g, '').toLowerCase());
    triggers.push(...quoted.filter((q) => !triggers.includes(q)));
  }

  // Deduplicate
  return [...new Set(triggers)];
}

/**
 * Build a trigger map for quick lookups.
 *
 * @param result - The result from loadSkills()
 * @returns Map of lowercase trigger phrase -> skill definition
 */
export function buildTriggerMap(result: SkillLoadResult): TriggerMap {
  const map: TriggerMap = new Map();

  for (const skill of result.skills) {
    for (const trigger of skill.triggers) {
      // Store with lowercase key for case-insensitive matching
      map.set(trigger.toLowerCase(), skill);
    }
  }

  return map;
}

/**
 * Find skills that match a user query.
 *
 * @param query - User input to check for triggers
 * @param triggerMap - Map from buildTriggerMap()
 * @returns Array of matching skills (ordered by trigger length, longest first)
 */
export function findMatchingSkills(
  query: string,
  triggerMap: TriggerMap
): SkillDefinition[] {
  const queryLower = query.toLowerCase();
  const matches: Array<{ skill: SkillDefinition; triggerLength: number }> = [];

  for (const [trigger, skill] of triggerMap) {
    if (queryLower.includes(trigger)) {
      matches.push({ skill, triggerLength: trigger.length });
    }
  }

  // Sort by trigger length (prefer more specific matches)
  matches.sort((a, b) => b.triggerLength - a.triggerLength);

  // Deduplicate skills (a skill might match multiple triggers)
  const seen = new Set<string>();
  const result: SkillDefinition[] = [];

  for (const { skill } of matches) {
    if (!seen.has(skill.id)) {
      seen.add(skill.id);
      result.push(skill);
    }
  }

  return result;
}

/**
 * Get a skill by ID from a load result.
 *
 * @param result - The result from loadSkills()
 * @param id - Skill ID to find (e.g., 'prd', 'shadcn-ui')
 * @returns The skill definition or undefined if not found
 */
export function getSkillById(
  result: SkillLoadResult,
  id: string
): SkillDefinition | undefined {
  return result.skills.find((skill) => skill.id.toLowerCase() === id.toLowerCase());
}
