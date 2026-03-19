/**
 * Pipeline Integration Tests — Full Hook Round-Trip
 *
 * Tests the complete enforcement pipeline:
 *   inject-skills.mjs (SubagentStart) → subagent works → verify-skills.mjs (SubagentStop)
 *
 * Unlike unit tests that verify each script in isolation, these tests verify
 * that the two hooks work together correctly as an enforcement system:
 * - inject-skills.mjs produces context that verify-skills.mjs can challenge on
 * - The first stop attempt always blocks (compliance gate)
 * - The retry always passes (no infinite loop)
 * - Unknown agent types pass through both hooks cleanly
 * - Malformed input doesn't crash either hook
 *
 * Test plan reference: docs/E2E-SKILL-TESTS.md — "Test Infrastructure Needed" §1
 */

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import type { InjectHookOutput, VerifyHookOutput } from '../hook-test-types.js';

const INJECT_SCRIPT = join(process.cwd(), '.github/hooks/scripts/inject-skills.mjs');
const VERIFY_SCRIPT = join(process.cwd(), '.github/hooks/scripts/verify-skills.mjs');
const PROJECT_ROOT = process.cwd();

/** Run inject-skills.mjs with JSON input */
function runInject(input: Record<string, unknown>): InjectHookOutput {
  const result = execFileSync('node', [INJECT_SCRIPT], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    cwd: PROJECT_ROOT,
    timeout: 10000,
  });
  return JSON.parse(result);
}

/** Run verify-skills.mjs with JSON input */
function runVerify(input: Record<string, unknown>): VerifyHookOutput {
  const result = execFileSync('node', [VERIFY_SCRIPT], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    cwd: PROJECT_ROOT,
    timeout: 10000,
  });
  return JSON.parse(result);
}

/** Simulate the full pipeline: inject → (subagent work) → verify first stop → verify retry */
function runPipeline(agentType: string) {
  // Step 1: SubagentStart — inject skills
  const injectOutput = runInject({
    agent_type: agentType,
    cwd: PROJECT_ROOT,
  });

  // Step 2: SubagentStop (first attempt) — should block
  const firstStop = runVerify({
    agent_type: agentType,
  });

  // Step 3: SubagentStop (retry with stop_hook_active) — should pass
  const retryStop = runVerify({
    agent_type: agentType,
    stop_hook_active: true,
  });

  return { injectOutput, firstStop, retryStop };
}

// ─── Known agents ──────────────────────────────────────────────────────────

const KNOWN_AGENTS = [
  'developer',
  'ux-designer',
  'product-manager',
  'security-reviewer',
  'tester',
  'researcher',
];

// ─── Full pipeline tests ───────────────────────────────────────────────────

describe('Full Pipeline: inject → verify round-trip', () => {
  describe.each(KNOWN_AGENTS)('Agent: %s', (agentType) => {
    it('inject produces context, first stop blocks, retry passes', () => {
      const { injectOutput, firstStop, retryStop } = runPipeline(agentType);

      // Inject should produce context with skills
      expect(injectOutput.continue).toBe(true);
      expect(injectOutput.hookSpecificOutput).toBeDefined();
      expect(injectOutput.hookSpecificOutput!.additionalContext).toBeTruthy();
      expect(injectOutput.hookSpecificOutput!.additionalContext).toContain('SKILL ENFORCEMENT');

      // First stop should block
      expect(firstStop.hookSpecificOutput).toBeDefined();
      expect(firstStop.hookSpecificOutput!.decision).toBe('block');
      expect(firstStop.hookSpecificOutput!.reason).toContain('Skills compliance');
      expect(firstStop.hookSpecificOutput!.reason).toContain('Task tracking');

      // Retry should pass through
      expect(retryStop.continue).toBe(true);
    });

    it('inject context references the correct agent type', () => {
      const { injectOutput } = runPipeline(agentType);
      const ctx = injectOutput.hookSpecificOutput!.additionalContext;
      expect(ctx).toContain(`You are \`${agentType}\``);
    });

    it('verify challenge mentions both skill compliance and task tracking', () => {
      const { firstStop } = runPipeline(agentType);
      const reason = firstStop.hookSpecificOutput!.reason;
      // Must challenge on BOTH dimensions — this is the whole point of the unified hook
      expect(reason).toContain('Skills compliance');
      expect(reason).toContain('Task tracking');
      expect(reason).toContain('backlog task edit');
    });
  });
});

// ─── Unknown agent passthrough ─────────────────────────────────────────────

describe('Unknown agent types pass through cleanly', () => {
  const UNKNOWN_AGENTS = ['orchestrator', 'cto', 'intern', '', 'DEVELOPER'];

  it.each(UNKNOWN_AGENTS)('agent type "%s" does not crash inject', (agentType) => {
    const output = runInject({
      agent_type: agentType,
      cwd: PROJECT_ROOT,
    });
    expect(output.continue).toBe(true);
    // Unknown agents should NOT get additionalContext
    expect(output.hookSpecificOutput).toBeUndefined();
  });

  it.each(UNKNOWN_AGENTS)('agent type "%s" still gets blocked by verify (first stop)', (agentType) => {
    const output = runVerify({
      agent_type: agentType,
    });
    // Verify blocks ALL first stops regardless of agent type
    expect(output.hookSpecificOutput!.decision).toBe('block');
  });
});

// ─── Malformed input resilience ────────────────────────────────────────────

describe('Malformed input handling', () => {
  it('inject handles missing agent_type gracefully', () => {
    const output = runInject({ cwd: PROJECT_ROOT });
    expect(output.continue).toBe(true);
  });

  it('inject handles empty object gracefully', () => {
    const output = runInject({});
    expect(output.continue).toBe(true);
  });

  it('verify handles empty object gracefully (blocks on first attempt)', () => {
    const output = runVerify({});
    expect(output.hookSpecificOutput!.decision).toBe('block');
  });

  it('inject handles non-string agent_type gracefully', () => {
    const output = runInject({ agent_type: 42 });
    expect(output.continue).toBe(true);
  });

  it('inject handles null agent_type gracefully', () => {
    const output = runInject({ agent_type: null });
    expect(output.continue).toBe(true);
  });

  it('both scripts handle garbage stdin without crashing', () => {
    // inject-skills.mjs
    const injectResult = execFileSync('node', [INJECT_SCRIPT], {
      input: 'this is not json {{{',
      encoding: 'utf8',
      cwd: PROJECT_ROOT,
      timeout: 10000,
    });
    const injectOutput: InjectHookOutput = JSON.parse(injectResult);
    expect(injectOutput.continue).toBe(true);

    // verify-skills.mjs
    const verifyResult = execFileSync('node', [VERIFY_SCRIPT], {
      input: 'garbage input!!!',
      encoding: 'utf8',
      cwd: PROJECT_ROOT,
      timeout: 10000,
    });
    const verifyOutput: VerifyHookOutput = JSON.parse(verifyResult);
    expect(verifyOutput.continue).toBe(true);
  });
});

// ─── Skill content injection verification ──────────────────────────────────

describe('Injected skill content is real, not placeholders', () => {
  it('developer context contains actual vercel-react-best-practices content', () => {
    const output = runInject({
      agent_type: 'developer',
      cwd: PROJECT_ROOT,
    });
    const ctx = output.hookSpecificOutput!.additionalContext;
    // The inject layer loads the actual SKILL.md file content
    // Verify it contains real content, not just the path
    expect(ctx).toContain('React');
    expect(ctx.length).toBeGreaterThan(500); // Real content, not a stub
  });

  it('ux-designer context contains actual web-design-guidelines content', () => {
    const output = runInject({
      agent_type: 'ux-designer',
      cwd: PROJECT_ROOT,
    });
    const ctx = output.hookSpecificOutput!.additionalContext;
    expect(ctx.length).toBeGreaterThan(500);
  });

  it('tester context contains actual web-design-guidelines content', () => {
    const output = runInject({
      agent_type: 'tester',
      cwd: PROJECT_ROOT,
    });
    const ctx = output.hookSpecificOutput!.additionalContext;
    expect(ctx.length).toBeGreaterThan(500);
  });

  it('researcher context contains actual web-search content', () => {
    const output = runInject({
      agent_type: 'researcher',
      cwd: PROJECT_ROOT,
    });
    const ctx = output.hookSpecificOutput!.additionalContext;
    expect(ctx.length).toBeGreaterThan(200);
  });
});

// ─── Cross-hook consistency ────────────────────────────────────────────────

describe('Cross-hook consistency', () => {
  it('verify challenge text mentions skills that inject actually loaded', () => {
    // The verify hook should challenge about skills — and inject should have provided them
    const injectOutput = runInject({
      agent_type: 'developer',
      cwd: PROJECT_ROOT,
    });
    const verifyOutput = runVerify({
      agent_type: 'developer',
    });

    // Inject loaded skills
    const ctx = injectOutput.hookSpecificOutput!.additionalContext;
    expect(ctx).toContain('MANDATORY');

    // Verify challenges about those skills
    const reason = verifyOutput.hookSpecificOutput!.reason;
    expect(reason).toContain('MANDATORY skills');
  });

  it('all 6 agents produce different inject contexts', () => {
    const contexts = KNOWN_AGENTS.map((agent) => {
      const output = runInject({
        agent_type: agent,
        cwd: PROJECT_ROOT,
      });
      return output.hookSpecificOutput!.additionalContext;
    });

    // Every agent should get a unique context
    const uniqueContexts = new Set(contexts);
    expect(uniqueContexts.size).toBe(KNOWN_AGENTS.length);
  });

  it('verify produces identical challenge for all agent types', () => {
    // The compliance gate is agent-agnostic — same challenge for everyone
    const challenges = KNOWN_AGENTS.map((agent) => {
      const output = runVerify({ agent_type: agent });
      return output.hookSpecificOutput!.reason;
    });

    const uniqueChallenges = new Set(challenges);
    expect(uniqueChallenges.size).toBe(1);
  });
});
