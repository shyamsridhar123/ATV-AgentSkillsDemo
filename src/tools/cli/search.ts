/**
 * Search Tool
 *
 * Searches file contents using ripgrep (preferred) or a Node.js fallback.
 * Validates search paths against traversal attacks and checks permissions
 * before reading any files.
 */

import { execFile } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve, relative } from 'node:path';
import { containsTraversal } from '../../lib/pathValidation.js';
import type { Tool } from '../interface.js';
import type { ToolContext, ToolInputSchema, ToolResult } from '../types.js';
import { ToolError } from '../types.js';

/** Default maximum number of results to return */
const DEFAULT_MAX_RESULTS = 50;

/** Input schema for the search tool */
const inputSchema: ToolInputSchema = {
  type: 'object',
  properties: {
    query: {
      type: 'string',
      description: 'Search pattern (plain text or regex)',
    },
    isRegexp: {
      type: 'boolean',
      description: 'Whether query is a regular expression (default: false)',
    },
    includePattern: {
      type: 'string',
      description: 'Glob pattern to filter files (e.g., "**/*.ts")',
    },
    path: {
      type: 'string',
      description: 'Directory to search in (defaults to working directory)',
    },
    maxResults: {
      type: 'number',
      description: 'Maximum number of results to return (default: 50)',
    },
  },
  required: ['query'],
};

/**
 * Validate and resolve the search path, ensuring it stays within workingDir.
 *
 * @param searchPath - User-provided search path (may be relative or absolute)
 * @param workingDir - The allowed root directory
 * @param toolName - Name of the calling tool (for error reporting)
 * @returns The resolved absolute path
 * @throws {ToolError} If the path escapes workingDir or contains traversal
 */
function validateSearchPath(searchPath: string, workingDir: string, toolName: string): string {
  if (containsTraversal(searchPath)) {
    throw new ToolError('Search path contains directory traversal sequences', 'INVALID_INPUT', toolName);
  }

  const resolved = resolve(workingDir, searchPath);
  const normalizedWorking = resolve(workingDir);

  if (!resolved.startsWith(normalizedWorking)) {
    throw new ToolError('Search path is outside the working directory', 'INVALID_INPUT', toolName);
  }

  return resolved;
}

/**
 * Attempt to search using ripgrep (rg).
 *
 * @returns Search output string, or null if rg is not available
 */
function searchWithRipgrep(
  query: string,
  isRegexp: boolean,
  includePattern: string | undefined,
  searchPath: string,
  maxResults: number,
  signal?: AbortSignal,
): Promise<string | null> {
  return new Promise((resolvePromise) => {
    const args: string[] = [
      '--no-heading',
      '--line-number',
      '--max-count', String(maxResults),
    ];

    if (isRegexp) {
      args.push('-e', query);
    } else {
      args.push('--fixed-strings', query);
    }

    if (includePattern) {
      args.push('--glob', includePattern);
    }

    args.push(searchPath);

    const child = execFile('rg', args, { maxBuffer: 1024 * 1024, signal }, (error, stdout) => {
      if (error) {
        const nodeErr = error as NodeJS.ErrnoException;
        // Exit code 1 means no matches — that's fine
        if (nodeErr.code === 'ENOENT' || nodeErr.message?.includes('ENOENT')) {
          // rg not found
          resolvePromise(null);
          return;
        }
        if ('code' in error && error.code === 1) {
          // rg exit code 1 = no matches
          resolvePromise('');
          return;
        }
        // Other errors: treat as rg not available
        resolvePromise(null);
        return;
      }
      resolvePromise(stdout);
    });

    // Handle abort to clean up child process
    if (signal) {
      signal.addEventListener('abort', () => {
        child.kill();
      }, { once: true });
    }
  });
}

/**
 * Check whether a filename matches a simple glob pattern.
 * Supports patterns like "*.ts", "**\/*.ts", "*.{ts,js}".
 */
function matchesGlob(filePath: string, pattern: string): boolean {
  // Convert glob to regex
  let regexStr = pattern
    .replace(/\*\*\//g, '(.+/)?')     // **/ matches any directory depth
    .replace(/\*/g, '[^/]*')           // * matches anything except /
    .replace(/\?/g, '[^/]')            // ? matches single char
    .replace(/\{([^}]+)\}/g, (_match, group: string) => {
      // {ts,js} => (ts|js)
      return '(' + group.split(',').join('|') + ')';
    });
  regexStr = '^' + regexStr + '$';

  try {
    const regex = new RegExp(regexStr);
    return regex.test(filePath);
  } catch {
    return false;
  }
}

/**
 * Recursively collect all files under a directory.
 */
async function collectFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip hidden directories and node_modules
      if (entry.name.startsWith('.') || entry.name === 'node_modules') {
        continue;
      }
      const subFiles = await collectFiles(fullPath);
      files.push(...subFiles);
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Fallback Node.js search when ripgrep is not available.
 */
async function searchWithNode(
  query: string,
  isRegexp: boolean,
  includePattern: string | undefined,
  searchPath: string,
  maxResults: number,
): Promise<string> {
  const files = await collectFiles(searchPath);
  const results: string[] = [];

  let pattern: RegExp;
  if (isRegexp) {
    pattern = new RegExp(query);
  } else {
    // Escape special regex characters for literal search
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    pattern = new RegExp(escaped);
  }

  for (const filePath of files) {
    if (results.length >= maxResults) break;

    // Apply include pattern filter
    if (includePattern) {
      const relPath = relative(searchPath, filePath);
      if (!matchesGlob(relPath, includePattern)) {
        continue;
      }
    }

    let contents: string;
    try {
      contents = await readFile(filePath, 'utf-8');
    } catch {
      // Skip files we can't read (binary, permission denied, etc.)
      continue;
    }

    const lines = contents.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (results.length >= maxResults) break;
      if (pattern.test(lines[i])) {
        results.push(`${filePath}:${i + 1}:${lines[i]}`);
      }
    }
  }

  return results.join('\n');
}

/**
 * Search tool implementation.
 *
 * Searches file contents using ripgrep when available, falling back to
 * a recursive Node.js search. Results are returned in `filepath:line:content` format.
 */
export const searchTool: Tool = {
  name: 'search',
  description: 'Search file contents using grep/ripgrep. Returns matches in filepath:line:content format.',
  inputSchema,

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    // Check permission
    if (!context.permissions.allowFileRead) {
      throw new ToolError('File read permission denied', 'PERMISSION_DENIED', 'search');
    }

    // Validate query
    const query = input.query;
    if (typeof query !== 'string' || query.trim().length === 0) {
      throw new ToolError('query is required and must be a non-empty string', 'INVALID_INPUT', 'search');
    }

    const isRegexp = typeof input.isRegexp === 'boolean' ? input.isRegexp : false;
    const includePattern = typeof input.includePattern === 'string' ? input.includePattern : undefined;
    const maxResults = typeof input.maxResults === 'number' && input.maxResults > 0
      ? input.maxResults
      : DEFAULT_MAX_RESULTS;

    // Validate and resolve search path
    const rawPath = typeof input.path === 'string' ? input.path : context.workingDir;
    const searchPath = validateSearchPath(rawPath, context.workingDir, 'search');

    // Try ripgrep first, fall back to Node.js search
    let output = await searchWithRipgrep(query, isRegexp, includePattern, searchPath, maxResults, context.signal);
    let usedRipgrep = true;

    if (output === null) {
      // rg not available, use Node.js fallback
      usedRipgrep = false;
      try {
        output = await searchWithNode(query, isRegexp, includePattern, searchPath, maxResults);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        throw new ToolError(`Search failed: ${message}`, 'EXECUTION_FAILED', 'search', {
          cause: err instanceof Error ? err : undefined,
        });
      }
    }

    // Trim trailing newline
    const trimmed = output.trim();

    // Count matches
    const matchCount = trimmed.length === 0 ? 0 : trimmed.split('\n').length;

    return {
      success: true,
      output: trimmed,
      metadata: {
        matchCount,
        maxResults,
        searchPath,
        engine: usedRipgrep ? 'ripgrep' : 'node',
      },
    };
  },
};
