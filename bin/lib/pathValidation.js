/**
 * Path validation utilities for user-supplied binary paths.
 * Prevents path traversal attacks, injection, and execution of unintended binaries.
 */

import { existsSync, statSync, accessSync, constants } from 'fs';
import { resolve, normalize, isAbsolute, basename, dirname } from 'path';

// Characters that could be used for shell injection
// Note: backslash is allowed as Windows path separator
const SHELL_INJECTION_CHARS = /[;&|`$(){}[\]<>!'"]/;

// Path traversal sequences
const TRAVERSAL_PATTERNS = [
  /\.\.[/\\]/, // ../ or ..\
  /[/\\]\.\.[/\\]/, // /../ or \..\
  /[/\\]\.\.$/,  // ends with /.. or \..
  /^\.\.[/\\]/, // starts with ../ or ..\
  /^\.\.$/,     // just ".."
];

/**
 * Validation result type
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - Whether the path is valid
 * @property {string} [error] - Error message if invalid
 * @property {string} [normalizedPath] - Normalized absolute path if valid
 */

/**
 * Check if a path contains traversal sequences
 * @param {string} inputPath - The path to check
 * @returns {boolean} - True if traversal sequences found
 */
export function containsTraversal(inputPath) {
  if (!inputPath || typeof inputPath !== 'string') {
    return false;
  }
  
  return TRAVERSAL_PATTERNS.some(pattern => pattern.test(inputPath));
}

/**
 * Check if a path contains shell injection characters
 * @param {string} inputPath - The path to check
 * @returns {boolean} - True if injection characters found
 */
export function containsShellInjection(inputPath) {
  if (!inputPath || typeof inputPath !== 'string') {
    return false;
  }
  
  return SHELL_INJECTION_CHARS.test(inputPath);
}

/**
 * Check if a file exists and is executable
 * @param {string} filePath - Absolute path to check
 * @returns {{exists: boolean, executable: boolean}}
 */
export function checkExecutable(filePath) {
  const result = { exists: false, executable: false };
  
  try {
    if (!existsSync(filePath)) {
      return result;
    }
    
    result.exists = true;
    
    const stats = statSync(filePath);
    if (!stats.isFile()) {
      return result;
    }
    
    // On Windows, check file extension for executability
    if (process.platform === 'win32') {
      const executableExtensions = ['.exe', '.cmd', '.bat', '.com', '.ps1'];
      const ext = filePath.toLowerCase().slice(filePath.lastIndexOf('.'));
      result.executable = executableExtensions.includes(ext);
    } else {
      // On Unix, check execute permission
      try {
        accessSync(filePath, constants.X_OK);
        result.executable = true;
      } catch {
        result.executable = false;
      }
    }
  } catch {
    // File access error
  }
  
  return result;
}

/**
 * Validate a user-supplied binary path
 * @param {string} inputPath - The path provided by the user
 * @param {Object} [options] - Validation options
 * @param {boolean} [options.requireAbsolute=false] - Require absolute path
 * @param {boolean} [options.checkExists=true] - Check if file exists
 * @param {boolean} [options.verifyExecutable=true] - Check if file is executable
 * @param {string[]} [options.allowedBasenames] - If provided, only allow these binary names
 * @returns {ValidationResult}
 */
export function validateBinaryPath(inputPath, options = {}) {
  const {
    requireAbsolute = false,
    checkExists = true,
    verifyExecutable = true,
    allowedBasenames = null,
  } = options;

  // Basic type and empty check
  if (!inputPath || typeof inputPath !== 'string') {
    return { valid: false, error: 'Path cannot be empty' };
  }

  // Trim whitespace
  const trimmedPath = inputPath.trim();
  if (trimmedPath.length === 0) {
    return { valid: false, error: 'Path cannot be empty' };
  }

  // Length limit to prevent DoS
  if (trimmedPath.length > 4096) {
    return { valid: false, error: 'Path exceeds maximum length (4096 characters)' };
  }

  // Check for null bytes (path injection)
  if (trimmedPath.includes('\0')) {
    return { valid: false, error: 'Path contains invalid characters (null byte)' };
  }

  // Check for path traversal
  if (containsTraversal(trimmedPath)) {
    return { valid: false, error: 'Path contains directory traversal sequences (../)' };
  }

  // Check for shell injection characters
  if (containsShellInjection(trimmedPath)) {
    return { 
      valid: false, 
      error: 'Path contains potentially dangerous characters. Use an absolute path without special characters.' 
    };
  }

  // Normalize the path
  let normalizedPath;
  try {
    normalizedPath = normalize(trimmedPath);
    
    // After normalization, check again for traversal (could be obfuscated)
    if (containsTraversal(normalizedPath)) {
      return { valid: false, error: 'Path resolves to a directory traversal' };
    }
    
    // Resolve to absolute path
    normalizedPath = resolve(normalizedPath);
  } catch (err) {
    return { valid: false, error: `Invalid path format: ${err.message}` };
  }

  // Check if absolute path is required
  if (requireAbsolute && !isAbsolute(trimmedPath)) {
    return { valid: false, error: 'Path must be an absolute path' };
  }

  // Check allowed basenames (whitelist specific binaries)
  if (allowedBasenames && allowedBasenames.length > 0) {
    // Extract basename handling both Unix and Windows separators
    // This is necessary because on Unix, basename() doesn't handle Windows paths
    const pathParts = normalizedPath.split(/[\\/]/);
    const name = pathParts[pathParts.length - 1] || '';
    const nameWithoutExt = name.replace(/\.(exe|cmd|bat|com)$/i, '');
    
    const allowed = allowedBasenames.some(allowedName => {
      const allowedLower = allowedName.toLowerCase();
      return name.toLowerCase() === allowedLower || 
             nameWithoutExt.toLowerCase() === allowedLower;
    });
    
    if (!allowed) {
      return { 
        valid: false, 
        error: `Binary '${name}' is not in the allowed list: ${allowedBasenames.join(', ')}` 
      };
    }
  }

  // Check if file exists
  if (checkExists) {
    const execCheck = checkExecutable(normalizedPath);
    
    if (!execCheck.exists) {
      return { valid: false, error: `File not found: ${normalizedPath}` };
    }
    
    // Check if executable
    if (verifyExecutable && !execCheck.executable) {
      return { valid: false, error: `File is not executable: ${normalizedPath}` };
    }
  }

  return { valid: true, normalizedPath };
}

/**
 * Validate a binary path specifically for the beads (bd) CLI
 * @param {string} inputPath - The path to validate
 * @returns {ValidationResult}
 */
export function validateBeadsPath(inputPath) {
  return validateBinaryPath(inputPath, {
    checkExists: true,
    verifyExecutable: true,
    allowedBasenames: ['bd', 'bd.exe', 'bd.cmd'],
  });
}

/**
 * Validate a binary path specifically for the backlog CLI
 * @param {string} inputPath - The path to validate
 * @returns {ValidationResult}
 */
export function validateBacklogPath(inputPath) {
  return validateBinaryPath(inputPath, {
    checkExists: true,
    verifyExecutable: true,
    allowedBasenames: ['backlog', 'backlog.exe', 'backlog.cmd'],
  });
}
