/**
 * Unit tests for agent schema types and parsing.
 * Run with: node --test dist/core/agents/types.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import type { 
  AgentFrontmatter, 
  AgentDefinition, 
  AgentHandoff, 
  AgentTool,
  AgentLoadResult,
  AgentLoadError,
} from './types.js';

describe('AgentFrontmatter type validation', () => {
  it('should accept valid minimal frontmatter', () => {
    const frontmatter: AgentFrontmatter = {
      name: 'test-agent',
    };
    
    assert.strictEqual(frontmatter.name, 'test-agent');
    assert.strictEqual(frontmatter.description, undefined);
    assert.strictEqual(frontmatter.model, undefined);
    assert.strictEqual(frontmatter.tools, undefined);
    assert.strictEqual(frontmatter.handoffs, undefined);
    assert.strictEqual(frontmatter.infer, undefined);
  });

  it('should accept valid full frontmatter', () => {
    const frontmatter: AgentFrontmatter = {
      name: 'developer',
      description: 'Expert React developer',
      model: 'Claude Opus 4.5',
      tools: ['readFile', 'editFiles', 'runInTerminal'],
      handoffs: [
        {
          label: 'Quality Assurance',
          agent: 'tester',
          prompt: 'Test the feature',
          send: false,
        },
      ],
      infer: true,
    };
    
    assert.strictEqual(frontmatter.name, 'developer');
    assert.strictEqual(frontmatter.description, 'Expert React developer');
    assert.strictEqual(frontmatter.model, 'Claude Opus 4.5');
    assert.strictEqual(frontmatter.tools?.length, 3);
    assert.strictEqual(frontmatter.handoffs?.length, 1);
    assert.strictEqual(frontmatter.infer, true);
  });
});

describe('AgentHandoff type validation', () => {
  it('should accept valid handoff with all fields', () => {
    const handoff: AgentHandoff = {
      label: 'Design Review',
      agent: 'ux-designer',
      prompt: 'Review the UI implementation',
      send: true,
    };
    
    assert.strictEqual(handoff.label, 'Design Review');
    assert.strictEqual(handoff.agent, 'ux-designer');
    assert.strictEqual(handoff.prompt, 'Review the UI implementation');
    assert.strictEqual(handoff.send, true);
  });

  it('should accept handoff without optional send field', () => {
    const handoff: AgentHandoff = {
      label: 'Security Audit',
      agent: 'security-reviewer',
      prompt: 'Check for vulnerabilities',
    };
    
    assert.strictEqual(handoff.label, 'Security Audit');
    assert.strictEqual(handoff.agent, 'security-reviewer');
    assert.strictEqual(handoff.send, undefined);
  });
});

describe('AgentTool type validation', () => {
  it('should accept known tool names', () => {
    const tools: AgentTool[] = [
      'codebase',
      'readFile',
      'editFiles',
      'createFile',
      'listDirectory',
      'fileSearch',
      'textSearch',
      'runInTerminal',
      'getTerminalOutput',
      'problems',
      'usages',
      'runSubagent',
    ];
    
    assert.strictEqual(tools.length, 12);
    assert.ok(tools.includes('readFile'));
    assert.ok(tools.includes('runSubagent'));
  });

  it('should accept custom/MCP tool names as strings', () => {
    const tools: AgentTool[] = [
      'readFile',
      'mcp_brave_search',  // Custom MCP tool
      'mcp_azure_deploy',  // Custom MCP tool
    ];
    
    assert.strictEqual(tools.length, 3);
    assert.ok(tools.includes('mcp_brave_search'));
  });
});

describe('AgentDefinition type validation', () => {
  it('should accept valid agent definition', () => {
    const agent: AgentDefinition = {
      id: 'developer',
      frontmatter: {
        name: 'developer',
        description: 'Expert developer',
        model: 'Claude Opus 4.5',
        tools: ['readFile', 'editFiles'],
        infer: true,
      },
      body: '# Developer Agent\n\nYou are an expert developer.',
      sourcePath: '/project/.github/agents/developer.agent.md',
    };
    
    assert.strictEqual(agent.id, 'developer');
    assert.strictEqual(agent.frontmatter.name, 'developer');
    assert.ok(agent.body.includes('expert developer'));
    assert.ok(agent.sourcePath.endsWith('.agent.md'));
  });
});

describe('AgentLoadResult type validation', () => {
  it('should represent successful load with no errors', () => {
    const result: AgentLoadResult = {
      agents: [
        {
          id: 'beth',
          frontmatter: { name: 'Beth' },
          body: '# Beth\n\nOrchestrator',
          sourcePath: '.github/agents/beth.agent.md',
        },
      ],
      errors: [],
    };
    
    assert.strictEqual(result.agents.length, 1);
    assert.strictEqual(result.errors.length, 0);
  });

  it('should represent partial load with some errors', () => {
    const result: AgentLoadResult = {
      agents: [
        {
          id: 'developer',
          frontmatter: { name: 'developer' },
          body: '# Developer',
          sourcePath: '.github/agents/developer.agent.md',
        },
      ],
      errors: [
        {
          filePath: '.github/agents/broken.agent.md',
          message: 'Invalid YAML frontmatter',
        },
      ],
    };
    
    assert.strictEqual(result.agents.length, 1);
    assert.strictEqual(result.errors.length, 1);
    assert.ok(result.errors[0].message.includes('YAML'));
  });
});

describe('AgentLoadError type validation', () => {
  it('should represent error without cause', () => {
    const error: AgentLoadError = {
      filePath: '.github/agents/invalid.agent.md',
      message: 'Missing name field in frontmatter',
    };
    
    assert.strictEqual(error.filePath, '.github/agents/invalid.agent.md');
    assert.ok(error.message.includes('name'));
    assert.strictEqual(error.cause, undefined);
  });

  it('should represent error with cause', () => {
    const originalError = new Error('YAML parse error at line 5');
    const error: AgentLoadError = {
      filePath: '.github/agents/malformed.agent.md',
      message: 'Failed to parse YAML frontmatter',
      cause: originalError,
    };
    
    assert.ok(error.cause instanceof Error);
    assert.ok(error.cause?.message.includes('line 5'));
  });
});

describe('Type compatibility with actual agent files', () => {
  it('should represent Beth agent structure', () => {
    // This mirrors the actual beth.agent.md structure
    const beth: AgentDefinition = {
      id: 'beth',
      frontmatter: {
        name: 'Beth',
        description: 'Ruthless, hyper-competent orchestrator for multi-agent workflows',
        model: 'Claude Opus 4.5',
        tools: [
          'codebase',
          'readFile',
          'editFiles',
          'createFile',
          'listDirectory',
          'fileSearch',
          'textSearch',
          'runInTerminal',
          'getTerminalOutput',
          'runSubagent',
        ],
        handoffs: [
          { label: 'Development', agent: 'developer', prompt: 'Implement this feature' },
          { label: 'Testing', agent: 'tester', prompt: 'Test this feature' },
          { label: 'Design', agent: 'ux-designer', prompt: 'Design this feature' },
          { label: 'Requirements', agent: 'product-manager', prompt: 'Define requirements' },
          { label: 'Research', agent: 'researcher', prompt: 'Research this topic' },
          { label: 'Security', agent: 'security-reviewer', prompt: 'Review security' },
        ],
        infer: true,
      },
      body: '# Beth\n\n> "I don\'t speak dipshit. I speak in consequences."',
      sourcePath: '.github/agents/beth.agent.md',
    };
    
    assert.strictEqual(beth.frontmatter.name, 'Beth');
    assert.strictEqual(beth.frontmatter.tools?.length, 10);
    assert.strictEqual(beth.frontmatter.handoffs?.length, 6);
    assert.strictEqual(beth.frontmatter.infer, true);
  });

  it('should represent developer agent structure', () => {
    // This mirrors the actual developer.agent.md structure
    const developer: AgentDefinition = {
      id: 'developer',
      frontmatter: {
        name: 'developer',
        description: 'Expert React/TypeScript/Next.js developer',
        model: 'Claude Opus 4.5',
        tools: [
          'codebase',
          'readFile',
          'editFiles',
          'createFile',
          'listDirectory',
          'fileSearch',
          'textSearch',
          'runInTerminal',
          'getTerminalOutput',
          'problems',
          'usages',
          'runSubagent',
        ],
        handoffs: [
          { label: 'Quality Assurance', agent: 'tester', prompt: 'Test the implemented feature', send: false },
          { label: 'Design Review', agent: 'ux-designer', prompt: 'Review implementation against design specs', send: false },
          { label: 'Technical Feasibility', agent: 'product-manager', prompt: 'Provide technical feasibility assessment', send: false },
        ],
        infer: true,
      },
      body: '# IDEO Developer Agent',
      sourcePath: '.github/agents/developer.agent.md',
    };
    
    assert.strictEqual(developer.frontmatter.name, 'developer');
    assert.strictEqual(developer.frontmatter.tools?.length, 12);
    assert.strictEqual(developer.frontmatter.handoffs?.length, 3);
    // Check handoff has send: false
    assert.strictEqual(developer.frontmatter.handoffs?.[0].send, false);
  });
});
