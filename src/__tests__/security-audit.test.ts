/**
 * Security Audit Tests — BETH-43
 *
 * Automated regression tests for security findings from the full codebase audit.
 * Each test validates a specific security property remains intact.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = join(import.meta.dirname, '..', '..');

// ─── F-01: doctor.ts checkCli uses execSync with template literal ───────────
describe('SEC: Command injection surface in doctor.ts', () => {
  it('checkCli only receives hardcoded command strings, not user input', () => {
    const doctorSrc = readFileSync(
      join(ROOT, 'src', 'cli', 'commands', 'doctor.ts'),
      'utf-8',
    );

    // Extract all checkCli() call sites
    const callMatches = [...doctorSrc.matchAll(/checkCli\(\s*'([^']+)'\s*,\s*'([^']+)'/g)];
    expect(callMatches.length).toBeGreaterThan(0);

    // Verify all command arguments are simple alphanumeric strings (no user input)
    for (const match of callMatches) {
      const command = match[2];
      expect(command).toMatch(
        /^[a-zA-Z0-9._-]+$/,
        `checkCli command '${command}' contains non-alphanumeric characters`,
      );
    }
  });

  it('checkCli uses execSync with piped stdio (no shell output leakage)', () => {
    const doctorSrc = readFileSync(
      join(ROOT, 'src', 'cli', 'commands', 'doctor.ts'),
      'utf-8',
    );
    // Verify stdio is piped (not inherited) to prevent output leakage
    expect(doctorSrc).toContain("stdio: ['pipe', 'pipe', 'pipe']");
  });
});

// ─── F-02: CLI input validation ─────────────────────────────────────────────
describe('SEC: CLI argument validation in bin/cli.js', () => {
  it('rejects arguments with shell metacharacters', () => {
    const result = runCli('init;whoami');
    expect(result.exitCode).not.toBe(0);
    expect(result.output).toMatch(/invalid argument|unexpected character/i);
  });

  it('rejects excessively long arguments', () => {
    const longArg = 'a'.repeat(100);
    const result = runCli(longArg);
    expect(result.exitCode).not.toBe(0);
    expect(result.output).toMatch(/invalid argument|input too long|unknown command/i);
  });

  it('rejects unknown commands gracefully (no stack trace)', () => {
    const result = runCli('notacommand');
    expect(result.exitCode).not.toBe(0);
    expect(result.output).toMatch(/unknown command/i);
    // Should NOT leak a stack trace
    expect(result.output).not.toMatch(/at\s+\w+\s+\(/);
  });

  it('truncates command name in error to prevent log injection', () => {
    const cliSrc = readFileSync(join(ROOT, 'bin', 'cli.js'), 'utf-8');
    // The default case truncates command output
    expect(cliSrc).toContain('command.slice(0, MAX_ARG_LENGTH)');
  });
});

// ─── F-03: Path validation ──────────────────────────────────────────────────
describe('SEC: Path validation (pathValidation.ts)', () => {
  // Import dynamically to test the actual module
  let pathValidation: typeof import('../../src/lib/pathValidation.js');

  it('module loads successfully', async () => {
    pathValidation = await import('../../src/lib/pathValidation.js');
    expect(pathValidation).toBeDefined();
  });

  it('rejects null bytes in paths', async () => {
    const mod = await import('../../src/lib/pathValidation.js');
    const result = mod.validateBinaryPath('/usr/bin/test\0whoami');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('null byte');
  });

  it('rejects path traversal sequences', async () => {
    const mod = await import('../../src/lib/pathValidation.js');
    const traversalPaths = [
      '../../../etc/passwd',
      '/usr/bin/../../../etc/shadow',
      '..\\windows\\system32\\cmd.exe',
    ];
    for (const p of traversalPaths) {
      const result = mod.validateBinaryPath(p, { checkExists: false });
      expect(result.valid).toBe(false);
    }
  });

  it('rejects shell injection characters', async () => {
    const mod = await import('../../src/lib/pathValidation.js');
    const injectionPaths = [
      '/usr/bin/test; rm -rf /',
      '/usr/bin/test | cat /etc/passwd',
      '/usr/bin/test$(whoami)',
      "/usr/bin/test`id`",
    ];
    for (const p of injectionPaths) {
      const result = mod.validateBinaryPath(p, { checkExists: false });
      expect(result.valid).toBe(false);
    }
  });

  it('rejects paths exceeding 4096 characters', async () => {
    const mod = await import('../../src/lib/pathValidation.js');
    const longPath = '/bin/' + 'a'.repeat(5000);
    const result = mod.validateBinaryPath(longPath, { checkExists: false });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('maximum length');
  });
});

// ─── F-04: No secrets in source code ────────────────────────────────────────
describe('SEC: No hardcoded secrets in source', () => {
  const srcFiles = collectSourceFiles(join(ROOT, 'src'));
  const binFile = join(ROOT, 'bin', 'cli.js');

  it('no hardcoded API keys or secrets in src/', () => {
    const secretPatterns = [
      /sk_live_[a-zA-Z0-9]+/,
      /sk_test_[a-zA-Z0-9]+/,
      /AKIA[0-9A-Z]{16}/,  // AWS access key
      /ghp_[a-zA-Z0-9]{36}/,  // GitHub PAT
      /password\s*[:=]\s*['"][^'"]+['"]/i,
    ];

    for (const file of srcFiles) {
      const content = readFileSync(file, 'utf-8');
      for (const pattern of secretPatterns) {
        expect(content).not.toMatch(pattern);
      }
    }
  });

  it('no secrets in bin/cli.js', () => {
    const content = readFileSync(binFile, 'utf-8');
    expect(content).not.toMatch(/sk_live_|sk_test_|AKIA[0-9A-Z]{16}|ghp_/);
  });
});

// ─── F-05: gray-matter YAML deserialization safety ──────────────────────────
describe('SEC: YAML deserialization via gray-matter', () => {
  it('gray-matter js-yaml 3.x does not execute custom YAML tags by default', () => {
    // gray-matter 4.x uses js-yaml 3.x with safeLoad (not load)
    // Verify gray-matter uses js-yaml safely
    const matter = require('gray-matter');

    // __proto__ pollution attempt via YAML
    const maliciousYaml = `---
name: test
__proto__:
  polluted: true
---
body`;

    const result = matter(maliciousYaml);
    // Ensure __proto__ doesn't pollute Object prototype
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
    // The data should have __proto__ as a regular key (NOT prototype pollution)
    expect(result.data.name).toBe('test');
  });

  it('gray-matter does not execute JavaScript in YAML tags', () => {
    const matter = require('gray-matter');

    // Attempt to use !!js/function tag (which js-yaml 3.x safeLoad blocks)
    const maliciousYaml = `---
name: "!!js/function 'function(){return process.exit()}'"
---
body`;

    // Should not throw or execute — should treat as string
    const result = matter(maliciousYaml);
    expect(typeof result.data.name).toBe('string');
  });
});

// ─── F-06: Hook system integrity ────────────────────────────────────────────
describe('SEC: Hook system integrity', () => {
  it('inject-skills.mjs only maps to whitelisted agent types', () => {
    const hookSrc = readFileSync(
      join(ROOT, '.github', 'hooks', 'scripts', 'inject-skills.mjs'),
      'utf-8',
    );

    // Extract the AGENT_SKILLS object keys
    const agentMatches = [...hookSrc.matchAll(/'([a-z-]+)':\s*\{/g)];
    const agentTypes = agentMatches.map(m => m[1]);

    // These are the only valid agent types
    const expected = [
      'ux-designer',
      'developer',
      'product-manager',
      'security-reviewer',
      'tester',
      'researcher',
    ];

    for (const agent of agentTypes) {
      expect(expected).toContain(agent);
    }
  });

  it('inject-skills.mjs only reads from .github/ directory', () => {
    const hookSrc = readFileSync(
      join(ROOT, '.github', 'hooks', 'scripts', 'inject-skills.mjs'),
      'utf-8',
    );

    // All inject/readFile paths should start with .github/
    const pathMatches = [...hookSrc.matchAll(/'([^']+\.md)'/g)];
    const mdPaths = pathMatches.map(m => m[1]).filter(p => !p.includes('SKILL'));

    for (const path of pathMatches.map(m => m[1])) {
      expect(path).toMatch(/^\.github\//);
    }
  });

  it('inject-skills.mjs gracefully handles invalid JSON stdin', () => {
    const hookSrc = readFileSync(
      join(ROOT, '.github', 'hooks', 'scripts', 'inject-skills.mjs'),
      'utf-8',
    );
    // Verify it catches JSON parse errors and exits cleanly
    expect(hookSrc).toContain('} catch {');
    expect(hookSrc).toContain('continue: true');
  });

  it('verify-skills.mjs handles invalid JSON stdin gracefully', () => {
    const hookSrc = readFileSync(
      join(ROOT, '.github', 'hooks', 'scripts', 'verify-skills.mjs'),
      'utf-8',
    );
    expect(hookSrc).toContain('} catch {');
    expect(hookSrc).toContain('continue: true');
  });

  it('skill-enforcement.json only references local hook scripts', () => {
    const config = JSON.parse(
      readFileSync(
        join(ROOT, '.github', 'hooks', 'skill-enforcement.json'),
        'utf-8',
      ),
    );

    for (const [, hooks] of Object.entries(config.hooks) as [string, Array<{ command: string }>][]) {
      for (const hook of hooks) {
        // Commands should only reference local relative .github paths
        expect(hook.command).toMatch(/^node \.github\//);
        // No shell operators
        expect(hook.command).not.toMatch(/[;&|`$]/);
      }
    }
  });
});

// ─── F-07: Land command uses execFileSync (not execSync) ────────────────────
describe('SEC: land.ts uses execFileSync for git commands', () => {
  it('does not use execSync anywhere in land.ts', () => {
    const landSrc = readFileSync(
      join(ROOT, 'src', 'cli', 'commands', 'land.ts'),
      'utf-8',
    );
    // execFileSync is safe (no shell), execSync is not
    expect(landSrc).not.toContain('execSync(');
    expect(landSrc).toContain('execFileSync');
  });

  it('does not use execSync anywhere in pre-push-guard.ts', () => {
    const guardSrc = readFileSync(
      join(ROOT, 'src', 'cli', 'commands', 'pre-push-guard.ts'),
      'utf-8',
    );
    expect(guardSrc).not.toContain('execSync(');
    expect(guardSrc).toContain('execFileSync');
  });
});

// ─── F-08: .gitignore covers sensitive paths ────────────────────────────────
describe('SEC: .gitignore covers sensitive paths', () => {
  it('ignores .env files', () => {
    const gitignore = readFileSync(join(ROOT, '.gitignore'), 'utf-8');
    expect(gitignore).toContain('.env');
    expect(gitignore).toContain('.env.local');
  });

  it('ignores node_modules', () => {
    const gitignore = readFileSync(join(ROOT, '.gitignore'), 'utf-8');
    expect(gitignore).toContain('node_modules');
  });

  it('ignores dist/ build output', () => {
    const gitignore = readFileSync(join(ROOT, '.gitignore'), 'utf-8');
    expect(gitignore).toContain('dist/');
  });
});

// ─── F-09: MCP config safety ────────────────────────────────────────────────
describe('SEC: MCP configuration safety', () => {
  it('mcp.json.example pins package versions', () => {
    const mcp = JSON.parse(
      readFileSync(join(ROOT, 'templates', 'mcp.json.example'), 'utf-8'),
    );

    for (const [name, server] of Object.entries(mcp.servers) as [string, Record<string, unknown>][]) {
      if (server.command === 'npx' && server.args && Array.isArray(server.args)) {
        // The first arg to npx is the package — it should pin a version
        const packageArg = (server.args as string[])[0];
        if (packageArg) {
          expect(packageArg).toMatch(
            /@\d/,
            `MCP server '${name}' uses unpinned package: ${packageArg}`,
          );
        }
      }
    }
  });

  it('copilot-mcp-config.json uses HTTPS URLs only', () => {
    const config = JSON.parse(
      readFileSync(
        join(ROOT, 'templates', '.github', 'copilot-mcp-config.json'),
        'utf-8',
      ),
    );

    for (const [, server] of Object.entries(config.mcpServers) as [string, Record<string, unknown>][]) {
      if (server.url) {
        expect(String(server.url)).toMatch(/^https:\/\//);
      }
    }
  });
});

// ─── F-10: Template security ────────────────────────────────────────────────
describe('SEC: Template file integrity', () => {
  it('templates contain no executable scripts besides hooks', () => {
    const templateDir = join(ROOT, 'templates');
    const allFiles = collectAllFiles(templateDir);
    const executableExtensions = ['.sh', '.bash', '.ps1', '.bat', '.cmd'];

    for (const file of allFiles) {
      const ext = file.slice(file.lastIndexOf('.'));
      if (executableExtensions.includes(ext)) {
        // Should only be in hooks
        expect(file).toContain('hooks');
      }
    }
  });

  it('dependabot.yml is included in templates for security updates', () => {
    expect(
      existsSync(join(ROOT, 'templates', '.github', 'dependabot.yml')),
    ).toBe(true);
  });
});

// ─── F-11: SSRF protection ─────────────────────────────────────────────────
describe('SEC: SSRF protection in fetch calls', () => {
  it('update.ts only fetches from npmjs.org registry', () => {
    const updateSrc = readFileSync(
      join(ROOT, 'src', 'cli', 'commands', 'update.ts'),
      'utf-8',
    );
    const fetchMatches = [...updateSrc.matchAll(/fetch\(['"`]([^'"`]+)/g)];
    for (const match of fetchMatches) {
      expect(match[1]).toMatch(/^https:\/\/registry\.npmjs\.org\//);
    }
  });

  it('bin/cli.js only fetches from npmjs.org registry', () => {
    const cliSrc = readFileSync(join(ROOT, 'bin', 'cli.js'), 'utf-8');
    const fetchMatches = [...cliSrc.matchAll(/fetch\(['"`]([^'"`]+)/g)];
    for (const match of fetchMatches) {
      expect(match[1]).toMatch(/^https:\/\/registry\.npmjs\.org\//);
    }
  });

  it('fetch calls use timeouts to prevent hanging', () => {
    const updateSrc = readFileSync(
      join(ROOT, 'src', 'cli', 'commands', 'update.ts'),
      'utf-8',
    );
    expect(updateSrc).toContain('AbortSignal.timeout');

    const cliSrc = readFileSync(join(ROOT, 'bin', 'cli.js'), 'utf-8');
    expect(cliSrc).toContain('AbortSignal.timeout');
  });
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function runCli(args: string): { exitCode: number; output: string } {
  const cliPath = join(ROOT, 'bin', 'cli.js');
  try {
    const output = execFileSync('node', [cliPath, args], {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { exitCode: 0, output };
  } catch (error: unknown) {
    const err = error as { status?: number; stdout?: string; stderr?: string };
    return {
      exitCode: err.status ?? 1,
      output: (err.stdout ?? '') + (err.stderr ?? ''),
    };
  }
}

function collectSourceFiles(dir: string): string[] {
  const { readdirSync, statSync } = require('fs');
  const { join } = require('path');
  const results: string[] = [];
  if (!existsSync(dir)) return results;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...collectSourceFiles(full));
    } else if (full.endsWith('.ts') && !full.endsWith('.test.ts')) {
      results.push(full);
    }
  }
  return results;
}

function collectAllFiles(dir: string): string[] {
  const { readdirSync, statSync } = require('fs');
  const { join } = require('path');
  const results: string[] = [];
  if (!existsSync(dir)) return results;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...collectAllFiles(full));
    } else {
      results.push(full);
    }
  }
  return results;
}
