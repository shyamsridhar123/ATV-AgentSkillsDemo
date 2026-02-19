/**
 * Agent Schema Types
 *
 * Type definitions for Beth agent configurations parsed from .agent.md files.
 * These types mirror the YAML frontmatter structure used by GitHub Copilot custom agents.
 */

/**
 * Tools available to agents.
 * Maps to GitHub Copilot's tool capabilities.
 */
export type AgentTool =
  | 'codebase'          // Search and understand codebase
  | 'readFile'          // Read file contents
  | 'editFiles'         // Edit files in workspace
  | 'createFile'        // Create new files
  | 'listDirectory'     // List directory contents
  | 'fileSearch'        // Search for files by name
  | 'textSearch'        // Search for text in files
  | 'runInTerminal'     // Run terminal commands
  | 'getTerminalOutput' // Get terminal output
  | 'problems'          // Get diagnostics/problems
  | 'usages'            // Find usages of symbols
  | 'runSubagent'       // Spawn child agents
  | string;             // Custom/MCP tools

/**
 * Handoff definition for agent-to-agent transfers.
 */
export interface AgentHandoff {
  /** UI label for the handoff action */
  label: string;

  /** Target agent name */
  agent: string;

  /** Default prompt to send with the handoff */
  prompt: string;

  /** Whether to automatically send or just prepare the handoff */
  send?: boolean;
}

/**
 * Agent frontmatter parsed from YAML.
 * This is the metadata block at the top of .agent.md files.
 */
export interface AgentFrontmatter {
  /** Display name of the agent */
  name: string;

  /** Brief description of the agent's purpose */
  description?: string;

  /** LLM model to use (e.g., 'Claude Opus 4.5') */
  model?: string;

  /** List of tools this agent can use */
  tools?: AgentTool[];

  /** Other agents this agent can hand off to */
  handoffs?: AgentHandoff[];

  /** Whether this agent can be invoked as a subagent */
  infer?: boolean;
}

/**
 * Fully parsed agent definition.
 * Combines frontmatter metadata with the markdown body (system prompt).
 */
export interface AgentDefinition {
  /** Unique identifier derived from filename (e.g., 'developer' from 'developer.agent.md') */
  id: string;

  /** Parsed YAML frontmatter */
  frontmatter: AgentFrontmatter;

  /** Raw markdown body (becomes the system prompt) */
  body: string;

  /** Source file path for debugging */
  sourcePath: string;
}

/**
 * Result of loading agents from a directory.
 */
export interface AgentLoadResult {
  /** Successfully loaded agents */
  agents: AgentDefinition[];

  /** Errors encountered during loading */
  errors: AgentLoadError[];
}

/**
 * Error encountered while loading an agent file.
 */
export interface AgentLoadError {
  /** Path to the problematic file */
  filePath: string;

  /** Human-readable error message */
  message: string;

  /** Original error for debugging */
  cause?: Error;
}
