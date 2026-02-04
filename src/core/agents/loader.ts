/**
 * Agent Loader
 *
 * Parses .agent.md files from the agents directory into typed AgentDefinition objects.
 * Uses gray-matter to extract YAML frontmatter and markdown body.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import matter from 'gray-matter';
import type {
  AgentDefinition,
  AgentFrontmatter,
  AgentHandoff,
  AgentLoadResult,
  AgentLoadError,
} from './types.js';

/**
 * Default agents directory relative to workspace root.
 */
export const DEFAULT_AGENTS_DIR = '.github/agents';

/**
 * File extension for agent definition files.
 */
export const AGENT_FILE_EXTENSION = '.agent.md';

/**
 * Load all agents from a directory.
 *
 * @param agentsDir - Path to agents directory (default: .github/agents)
 * @returns Object containing loaded agents and any errors
 */
export function loadAgents(agentsDir: string = DEFAULT_AGENTS_DIR): AgentLoadResult {
  const agents: AgentDefinition[] = [];
  const errors: AgentLoadError[] = [];

  if (!existsSync(agentsDir)) {
    errors.push({
      filePath: agentsDir,
      message: `Agents directory not found: ${agentsDir}`,
    });
    return { agents, errors };
  }

  const files = readdirSync(agentsDir).filter((f) =>
    f.endsWith(AGENT_FILE_EXTENSION)
  );

  if (files.length === 0) {
    errors.push({
      filePath: agentsDir,
      message: `No ${AGENT_FILE_EXTENSION} files found in ${agentsDir}`,
    });
    return { agents, errors };
  }

  for (const file of files) {
    const filePath = join(agentsDir, file);
    const result = loadAgent(filePath);

    if ('error' in result) {
      errors.push(result.error);
    } else {
      agents.push(result.agent);
    }
  }

  return { agents, errors };
}

/**
 * Load a single agent from a file.
 *
 * @param filePath - Path to the .agent.md file
 * @returns Either an agent definition or an error
 */
export function loadAgent(
  filePath: string
): { agent: AgentDefinition } | { error: AgentLoadError } {
  try {
    let content = readFileSync(filePath, 'utf-8');

    // Handle GitHub Copilot agent file format: ```chatagent\n---\n...\n---\n...\n```
    // Strip the code fence wrapper if present
    content = stripCodeFence(content);

    const { data, content: body } = matter(content);

    // Validate required fields
    const validation = validateFrontmatter(data, filePath);
    if (validation.error) {
      return { error: validation.error };
    }

    // Extract agent ID from filename (e.g., 'developer.agent.md' -> 'developer')
    const id = basename(filePath, AGENT_FILE_EXTENSION);

    // Normalize frontmatter
    const frontmatter = normalizeFrontmatter(data);

    return {
      agent: {
        id,
        frontmatter,
        body: body.trim(),
        sourcePath: filePath,
      },
    };
  } catch (err) {
    return {
      error: {
        filePath,
        message: `Failed to parse agent file: ${err instanceof Error ? err.message : String(err)}`,
        cause: err instanceof Error ? err : undefined,
      },
    };
  }
}

/**
 * Strip GitHub Copilot code fence wrapper from agent/skill files.
 *
 * Files may be wrapped in ```chatagent or ```skill code fences.
 * This extracts the content inside the fence.
 */
function stripCodeFence(content: string): string {
  // Match opening fence: ```chatagent, ```skill, ````chatagent, etc.
  const fenceMatch = content.match(/^(`{3,})(chatagent|skill)\s*[\r\n]/);
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
): { error?: AgentLoadError } {
  if (!data.name || typeof data.name !== 'string') {
    return {
      error: {
        filePath,
        message: `Missing or invalid 'name' in frontmatter`,
      },
    };
  }

  // Validate handoffs if present
  if (data.handoffs && !Array.isArray(data.handoffs)) {
    return {
      error: {
        filePath,
        message: `'handoffs' must be an array`,
      },
    };
  }

  if (Array.isArray(data.handoffs)) {
    for (let i = 0; i < data.handoffs.length; i++) {
      const handoff = data.handoffs[i];
      if (!handoff.label || !handoff.agent || !handoff.prompt) {
        return {
          error: {
            filePath,
            message: `Handoff at index ${i} missing required fields (label, agent, prompt)`,
          },
        };
      }
    }
  }

  // Validate tools if present
  if (data.tools && !Array.isArray(data.tools)) {
    return {
      error: {
        filePath,
        message: `'tools' must be an array`,
      },
    };
  }

  return {};
}

/**
 * Normalize frontmatter data to typed AgentFrontmatter.
 */
function normalizeFrontmatter(data: Record<string, unknown>): AgentFrontmatter {
  const frontmatter: AgentFrontmatter = {
    name: data.name as string,
  };

  if (data.description) {
    frontmatter.description = String(data.description);
  }

  if (data.model) {
    frontmatter.model = String(data.model);
  }

  if (Array.isArray(data.tools)) {
    frontmatter.tools = data.tools.map(String);
  }

  if (typeof data.infer === 'boolean') {
    frontmatter.infer = data.infer;
  }

  if (Array.isArray(data.handoffs)) {
    frontmatter.handoffs = data.handoffs.map(normalizeHandoff);
  }

  return frontmatter;
}

/**
 * Normalize a single handoff definition.
 */
function normalizeHandoff(data: Record<string, unknown>): AgentHandoff {
  return {
    label: String(data.label),
    agent: String(data.agent),
    prompt: String(data.prompt),
    send: typeof data.send === 'boolean' ? data.send : undefined,
  };
}

/**
 * Get an agent by ID from a load result.
 *
 * @param result - The result from loadAgents()
 * @param id - Agent ID to find (e.g., 'developer', 'beth')
 * @returns The agent definition or undefined if not found
 */
export function getAgentById(
  result: AgentLoadResult,
  id: string
): AgentDefinition | undefined {
  return result.agents.find((agent) => agent.id.toLowerCase() === id.toLowerCase());
}

/**
 * Get agents that can be used as subagents (infer: true).
 *
 * @param result - The result from loadAgents()
 * @returns Array of agents with infer: true
 */
export function getInferableAgents(result: AgentLoadResult): AgentDefinition[] {
  return result.agents.filter((agent) => agent.frontmatter.infer === true);
}
