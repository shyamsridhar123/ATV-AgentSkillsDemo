/**
 * Skill Schema Types
 *
 * Type definitions for Beth skills parsed from SKILL.md files.
 * Skills are domain-specific knowledge modules that agents load on-demand.
 */

/**
 * Skill frontmatter parsed from YAML.
 * This is the metadata block at the top of SKILL.md files.
 */
export interface SkillFrontmatter {
  /** Display name of the skill */
  name: string;

  /** Description containing trigger phrases */
  description?: string;
}

/**
 * Fully parsed skill definition.
 * Combines frontmatter metadata with the markdown body (skill content).
 */
export interface SkillDefinition {
  /** Unique identifier derived from directory name (e.g., 'prd' from 'skills/prd/SKILL.md') */
  id: string;

  /** Parsed YAML frontmatter */
  frontmatter: SkillFrontmatter;

  /** Raw markdown body (the skill content to inject) */
  body: string;

  /** Source file path for debugging */
  sourcePath: string;

  /** Trigger phrases extracted from description */
  triggers: string[];
}

/**
 * Result of loading skills from a directory.
 */
export interface SkillLoadResult {
  /** Successfully loaded skills */
  skills: SkillDefinition[];

  /** Errors encountered during loading */
  errors: SkillLoadError[];
}

/**
 * Error encountered while loading a skill file.
 */
export interface SkillLoadError {
  /** Path to the problematic file */
  filePath: string;

  /** Human-readable error message */
  message: string;

  /** Original error for debugging */
  cause?: Error;
}

/**
 * Map of trigger phrases to skill definitions.
 * Used for quick lookup when processing user input.
 */
export type TriggerMap = Map<string, SkillDefinition>;
