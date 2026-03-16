/**
 * Beth CLI - TypeScript Core
 *
 * Exports for the Beth CLI: agent/skill loaders, CLI commands, and utilities.
 * Beth runs on GitHub Copilot's runtime — this package is the installer and
 * validation tooling, not a standalone agent platform.
 */

// Core exports - Agent loading and types
export * from './core/agents/index.js';

// Core exports - Skill loading and types
export * from './core/skills/index.js';

// Library utilities
export * from './lib/index.js';
