#!/usr/bin/env node

/**
 * Skill Enforcement Hook — SubagentStart
 *
 * Deterministic skill injection for subagents. When Beth (or any orchestrator)
 * spawns a subagent, this hook maps agent_type → required skills and injects
 * them as additionalContext. The LLM doesn't decide whether to load skills —
 * this script does.
 *
 * Hook event: SubagentStart
 * Input: JSON via stdin with agent_type field
 * Output: JSON to stdout with hookSpecificOutput.additionalContext
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ─── Agent → Required Skills mapping ───────────────────────────────────────
// This is the single source of truth for which skills each agent MUST use.
// Update this map when adding new agents or skills.
const AGENT_SKILLS = {
  'ux-designer': {
    inject: ['.github/skills/web-design-guidelines/SKILL.md'],
    readFile: [
      '.github/skills/framer-components/SKILL.md',
      '.github/prompts/ui-ux-pro-max/PROMPT.md',
    ],
  },
  'developer': {
    inject: ['.github/skills/vercel-react-best-practices/SKILL.md'],
    readFile: [
      '.github/skills/shadcn-ui/SKILL.md',
      '.github/skills/vercel-react-best-practices/AGENTS.md',
    ],
  },
  'product-manager': {
    inject: [],
    readFile: ['.github/skills/prd/SKILL.md'],
  },
  'security-reviewer': {
    inject: [],
    readFile: ['.github/skills/security-analysis/SKILL.md'],
  },
  'tester': {
    inject: ['.github/skills/web-design-guidelines/SKILL.md'],
    readFile: [],
  },
  'researcher': {
    inject: ['.github/skills/web-search/SKILL.md'],
    readFile: [],
  },
};

// ─── Read stdin ────────────────────────────────────────────────────────────
let input = '';
for await (const chunk of process.stdin) {
  input += chunk;
}

let data;
try {
  data = JSON.parse(input);
} catch {
  // If we can't parse input, exit cleanly — don't block the subagent
  process.stdout.write(JSON.stringify({ continue: true }));
  process.exit(0);
}

const agentType = data.agent_type;
const cwd = data.cwd || process.cwd();

// ─── Look up skills for this agent ─────────────────────────────────────────
const config = AGENT_SKILLS[agentType];

if (!config) {
  // Unknown agent type — no skill enforcement needed
  process.stdout.write(JSON.stringify({ continue: true }));
  process.exit(0);
}

// ─── Build the injection context ───────────────────────────────────────────
const sections = [];

sections.push('## ⚡ SKILL ENFORCEMENT — INJECTED BY HOOK (NON-NEGOTIABLE)');
sections.push('');
sections.push(`You are \`${agentType}\`. The following skills are MANDATORY for your work.`);
sections.push('This context was injected by the skill-enforcement hook — not by your own instructions.');
sections.push('You MUST apply these rules. Ignoring them is a compliance violation.');
sections.push('');

// Inject small skill files directly into context
if (config.inject.length > 0) {
  sections.push('### Skills loaded into context (apply immediately):');
  sections.push('');

  for (const skillPath of config.inject) {
    try {
      const fullPath = join(cwd, skillPath);
      const content = readFileSync(fullPath, 'utf8');
      sections.push(`#### ${skillPath}`);
      sections.push('');
      sections.push(content);
      sections.push('');
    } catch (err) {
      sections.push(`> ⚠️ WARNING: Could not load ${skillPath}: ${err.message}`);
      sections.push(`> You MUST use readFile to load this skill manually.`);
      sections.push('');
    }
  }
}

// For larger skill files, mandate readFile as first action
if (config.readFile.length > 0) {
  sections.push('### Skills to load via readFile (MANDATORY FIRST STEP):');
  sections.push('');
  sections.push('Before doing ANY work, you MUST read these files using the readFile tool:');
  sections.push('');
  for (const skillPath of config.readFile) {
    sections.push(`- \`${skillPath}\``);
  }
  sections.push('');
  sections.push('Do NOT proceed with any task until you have read ALL of the above files.');
  sections.push('After reading, briefly confirm which key patterns you will apply.');
  sections.push('');
}

const additionalContext = sections.join('\n');

// ─── Output ────────────────────────────────────────────────────────────────
const output = {
  continue: true,
  hookSpecificOutput: {
    hookEventName: 'SubagentStart',
    additionalContext,
  },
};

process.stdout.write(JSON.stringify(output));
