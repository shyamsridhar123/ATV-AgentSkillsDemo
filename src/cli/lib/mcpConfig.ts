/**
 * MCP Auto-Configuration for ADO Sync (BETH-64.16)
 *
 * Manages the ado-sync MCP server entry in .vscode/mcp.json.
 * After set-ado-org completes, this adds/updates the ado-sync server
 * so Copilot agents can use ADO Sync tools directly.
 *
 * Covers FR-12, US-007 from PRD.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

/** The key used for the ado-sync server in mcp.json */
export const ADO_SYNC_SERVER_KEY = 'ado-sync';

const MCP_SCHEMA = 'https://code.visualstudio.com/docs/copilot/chat/mcp-servers';

/** Required MCP servers that must be present for doctor/agent health */
const REQUIRED_DEFAULT_SERVERS: Record<string, Record<string, unknown>> = {
  playwright: { command: 'npx', args: ['@playwright/mcp@0.0.68'] },
  backlog: { command: 'backlog', args: ['mcp', 'start'] },
};

/** Shape of a single MCP server entry */
export interface McpServerEntry {
  command: string;
  args: string[];
  cwd: string;
}

/** Result of ensureAdoSyncMcpEntry */
export interface McpConfigResult {
  /** What happened: created (new file), added (to existing), updated (replaced entry), unchanged */
  action: 'created' | 'added' | 'updated' | 'unchanged';
  /** Path to the mcp.json file */
  mcpJsonPath: string;
}

/**
 * Build the MCP server entry for ado-sync.
 *
 * @param pythonPath - Absolute path to the python binary (typically venv python)
 * @param projectRoot - Project root directory
 */
export function buildAdoSyncMcpEntry(pythonPath: string, projectRoot: string): McpServerEntry {
  return {
    command: pythonPath,
    args: ['-m', 'app.mcp_server'],
    cwd: join(projectRoot, 'ado-sync'),
  };
}

/**
 * Ensure the ado-sync MCP server entry exists in .vscode/mcp.json.
 *
 * - If .vscode/mcp.json doesn't exist, creates it with the ado-sync entry.
 * - If it exists, adds or updates the ado-sync entry while preserving all other entries.
 * - If the entry already matches, returns unchanged.
 * - If the file is corrupted JSON, replaces it.
 *
 * @param projectRoot - Project root directory
 * @param pythonPath - Absolute path to the python binary
 */
export function ensureAdoSyncMcpEntry(projectRoot: string, pythonPath: string): McpConfigResult {
  const vsDir = join(projectRoot, '.vscode');
  const mcpJsonPath = join(vsDir, 'mcp.json');
  const newEntry = buildAdoSyncMcpEntry(pythonPath, projectRoot);

  // Ensure .vscode/ directory exists
  if (!existsSync(vsDir)) {
    mkdirSync(vsDir, { recursive: true });
  }

  // Try to read existing config
  let config: Record<string, unknown> | null = null;
  if (existsSync(mcpJsonPath)) {
    try {
      const raw = readFileSync(mcpJsonPath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        config = parsed as Record<string, unknown>;
      }
    } catch {
      // Corrupted JSON — will create fresh
      config = null;
    }
  }

  // No valid existing config — create fresh with required defaults
  if (config === null) {
    const fresh = {
      $schema: MCP_SCHEMA,
      servers: {
        ...REQUIRED_DEFAULT_SERVERS,
        [ADO_SYNC_SERVER_KEY]: newEntry,
      },
    };
    writeMcpConfig(mcpJsonPath, fresh);
    return { action: 'created', mcpJsonPath };
  }

  // Ensure servers object exists
  if (config.servers === null || typeof config.servers !== 'object' || Array.isArray(config.servers)) {
    config.servers = {};
  }

  const servers = config.servers as Record<string, unknown>;
  const existing = servers[ADO_SYNC_SERVER_KEY] as Record<string, unknown> | undefined;

  // Check if entry already matches
  if (existing &&
      existing.command === newEntry.command &&
      JSON.stringify(existing.args) === JSON.stringify(newEntry.args) &&
      existing.cwd === newEntry.cwd) {
    return { action: 'unchanged', mcpJsonPath };
  }

  // Determine action
  const action = existing ? 'updated' : 'added';

  // Set the entry
  servers[ADO_SYNC_SERVER_KEY] = newEntry;

  // Ensure $schema is present
  if (!config.$schema) {
    config.$schema = MCP_SCHEMA;
  }

  writeMcpConfig(mcpJsonPath, config);
  return { action, mcpJsonPath };
}

/**
 * Write config to disk with consistent 2-space JSON formatting.
 * Note: normalizes formatting rather than preserving original indentation.
 */
function writeMcpConfig(path: string, config: Record<string, unknown>): void {
  writeFileSync(path, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}
