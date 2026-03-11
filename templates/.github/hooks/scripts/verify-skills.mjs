#!/usr/bin/env node

/**
 * Skill Verification Hook — SubagentStop / Agent Stop
 *
 * Fires when a subagent completes (or an agent stops). On the FIRST stop
 * attempt, blocks and asks the agent to confirm it applied its required skills.
 * On the second attempt (stop_hook_active=true), lets it through.
 *
 * This is a lightweight enforcement gate — not a deep analysis of output.
 * The real skill content was already injected by inject-skills.mjs at
 * SubagentStart. This hook just forces a final compliance check.
 */

let input = '';
for await (const chunk of process.stdin) {
  input += chunk;
}

let data;
try {
  data = JSON.parse(input);
} catch {
  process.stdout.write(JSON.stringify({ continue: true }));
  process.exit(0);
}

// If this is a retry (stop_hook_active), let the agent complete
if (data.stop_hook_active) {
  process.stdout.write(JSON.stringify({ continue: true }));
  process.exit(0);
}

// First stop attempt — block and request skill verification
const output = {
  hookSpecificOutput: {
    hookEventName: 'Stop',
    decision: 'block',
    reason:
      'Before finishing: Confirm you loaded and applied your MANDATORY skills. ' +
      'If you were injected skill context by the enforcement hook, state which ' +
      'key rules you applied. If you did NOT read your required skill files, ' +
      'read them now and verify your work complies.',
  },
};

process.stdout.write(JSON.stringify(output));
