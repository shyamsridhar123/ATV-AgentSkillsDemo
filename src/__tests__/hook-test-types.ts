/**
 * Shared types for hook test helpers (inject-skills.mjs + verify-skills.mjs).
 *
 * Eliminates `as any` casts across hook test files by typing the JSON output
 * structures that the hook scripts produce.
 */

/** Output shape from inject-skills.mjs (SubagentStart hook) */
export interface InjectHookOutput {
  continue: boolean;
  hookSpecificOutput?: {
    hookEventName: 'SubagentStart';
    additionalContext: string;
  };
}

/** Output shape from verify-skills.mjs (SubagentStop hook) */
export interface VerifyHookOutput {
  continue?: boolean;
  hookSpecificOutput?: {
    hookEventName: 'Stop';
    decision: 'block';
    reason: string;
  };
}
