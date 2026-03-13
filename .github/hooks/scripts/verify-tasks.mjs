#!/usr/bin/env node

/**
 * Task Tracking Enforcement Hook — SubagentStop
 *
 * Fires when a subagent completes. On the FIRST stop attempt, blocks and asks
 * the subagent to confirm it reviewed and updated its task status via the
 * Backlog.md CLI. On the second attempt (stop_hook_active=true), lets through.
 *
 * This prevents the drift problem where subagents complete work but forget to
 * close their tasks, leaving "In Progress" items that are actually done.
 *
 * Hook event: SubagentStop
 * Input: JSON via stdin with stop_hook_active field
 * Output: JSON to stdout with hookSpecificOutput
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

// First stop attempt — block and request task tracking confirmation
const output = {
  hookSpecificOutput: {
    hookEventName: 'Stop',
    decision: 'block',
    reason:
      'Before finishing: Confirm you updated your task status in Backlog.md. ' +
      'If you were assigned a task ID, you MUST run: ' +
      '`backlog task edit <task-id> -s "Done" --plain` to mark it complete. ' +
      'If you created follow-up work, confirm you ran: ' +
      '`backlog task create "Title" -d "Description" --plain`. ' +
      'State which task(s) you updated and their final status.',
  },
};

process.stdout.write(JSON.stringify(output));
