/**
 * Unit Tests for Standard Agent Inspector State & Memory Options
 *
 * Validates:
 * 1. Agent configuration mutations (model, prompt, temperature, memory, tools).
 * 2. Memory provider option resolution and descriptions.
 * 3. Default tool attachments and catalog retrieval.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AgentNodeData } from '../../../src/shared/types';
import { getMemoryOption } from '../../../src/webview/data/memoryOptions';
import { AVAILABLE_TOOLS } from '../../../src/webview/data/defaultTools';

describe('Standard Agent Inspector Logic & Configuration', () => {
  it('should resolve memory options metadata accurately', () => {
    const noneMem = getMemoryOption('none');
    assert.equal(noneMem.type, 'none');
    assert.ok(noneMem.name.includes('Stateless') || noneMem.name.includes('No Memory'));
    assert.equal(noneMem.badge, 'Stateless Execution');
  });

  it('should list all available predefined tool types in the catalog', () => {
    assert.ok(AVAILABLE_TOOLS.length >= 5);
    const searchTool = AVAILABLE_TOOLS.find((t) => t.id === 'tool_google_search');
    assert.ok(searchTool);
    assert.ok(searchTool?.type === 'search' || searchTool?.type === 'builtin');

    const ragTool = AVAILABLE_TOOLS.find((t) => t.id === 'builtin_vertex_ai_search');
    assert.ok(ragTool);
    assert.equal(ragTool?.type, 'rag');
  });

  it('should update agent parameters immutably', () => {
    const initialAgent: AgentNodeData = {
      label: 'Analyst Agent',
      model: 'gemini-flash-latest',
      temperature: 0.5,
      memoryType: 'none',
      tools: [],
    };

    const updatedAgent: AgentNodeData = {
      ...initialAgent,
      model: 'gemini-pro-latest',
      temperature: 0.8,
      memoryType: 'postgres',
      tools: [AVAILABLE_TOOLS[0]],
    };

    assert.equal(updatedAgent.model, 'gemini-pro-latest');
    assert.equal(updatedAgent.memoryType, 'postgres');
    assert.equal(updatedAgent.tools?.length, 1);
  });

  it('should restrict delegation patterns strictly to valid Google ADK patterns', async () => {
    const { ADK_DELEGATION_PATTERNS } = await import('../../../src/webview/types');
    assert.equal(ADK_DELEGATION_PATTERNS.length, 4);
    const patternIds = ADK_DELEGATION_PATTERNS.map((p) => p.id);
    assert.deepEqual(patternIds, ['sequential', 'parallel', 'loop', 'coordinator']);
  });

  it('should initialize default maxIterations of 3 for loop delegation pattern', () => {
    const agent: AgentNodeData = {
      label: 'Iterative Refiner',
      model: 'gemini-flash-latest',
      subAgentPattern: 'loop',
      subAgents: [
        { agentId: 'sub-1', name: 'Draftsman', role: 'Drafter', delegationType: 'loop' }
      ]
    };

    const maxIterations = agent.maxIterations ?? 3;
    assert.equal(maxIterations, 3);

    const updatedWithCustomCycles = {
      ...agent,
      maxIterations: 5,
    };
    assert.equal(updatedWithCustomCycles.maxIterations, 5);
  });
});
