#!/usr/bin/env node

/**
 * Compliance Verification Hook — SubagentStop
 *
 * Fires when a subagent completes (or an agent stops). On the FIRST stop
 * attempt, blocks and asks the agent to confirm TWO things:
 *   1. It applied its MANDATORY skills (injected by inject-skills.mjs)
 *   2. It updated its task status via `backlog task edit`
 *
 * On the second attempt (stop_hook_active=true), lets it through.
 *
 * Why a single hook? The stop_hook_active flag is global — if two separate
 * hooks both use it, the second hook never fires its challenge because the
 * retry from the first hook sets stop_hook_active=true globally.
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

// First stop attempt — block and request compliance verification
const output = {
  hookSpecificOutput: {
    hookEventName: 'Stop',
    decision: 'block',
    reason:
      'Before finishing, confirm BOTH of the following:\n\n' +
      '1. **Skills compliance:** Confirm you loaded and applied your MANDATORY skills. ' +
      'If you were injected skill context by the enforcement hook, state which ' +
      'key rules you applied. If you did NOT read your required skill files, ' +
      'read them now and verify your work complies.\n\n' +
      '2. **Task tracking:** Confirm you updated your task status in Backlog.md. ' +
      'If you were assigned a task ID, you MUST run: ' +
      '`backlog task edit <task-id> -s "Done" --plain` to mark it complete. ' +
      'If you created follow-up work, confirm you ran: ' +
      '`backlog task create "Title" -d "Description" --plain`. ' +
      'State which task(s) you updated and their final status.',
  },
};

process.stdout.write(JSON.stringify(output));
