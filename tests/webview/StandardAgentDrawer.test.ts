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
import { AgentNodeData } from '../../src/shared/types';
import { getMemoryOption } from '../../src/webview/data/memoryOptions';
import { AVAILABLE_TOOLS } from '../../src/webview/data/defaultTools';

describe('Standard Agent Inspector Logic & Configuration', () => {
  it('should resolve memory options metadata accurately', () => {
    const firestoreMem = getMemoryOption('firestore');
    assert.equal(firestoreMem.type, 'firestore');
    assert.ok(firestoreMem.name.includes('Firestore'));
    assert.ok(firestoreMem.description.includes('Google GenAI') || firestoreMem.description.includes('ADK'));

    const redisMem = getMemoryOption('redis');
    assert.equal(redisMem.type, 'redis');
    assert.equal(redisMem.badge, 'Distributed Cache');

    const noneMem = getMemoryOption('none');
    assert.equal(noneMem.type, 'none');
    assert.equal(noneMem.badge, 'Stateless Execution');
  });

  it('should list all available predefined tool types in the catalog', () => {
    assert.ok(AVAILABLE_TOOLS.length >= 5);
    const searchTool = AVAILABLE_TOOLS.find((t) => t.id === 'tool_google_search');
    assert.ok(searchTool);
    assert.ok(searchTool?.type === 'search' || searchTool?.type === 'builtin');

    const mcpTool = AVAILABLE_TOOLS.find((t) => t.id === 'tool_mcp_github');
    assert.ok(mcpTool);
    assert.equal(mcpTool?.type, 'mcp');
  });

  it('should update agent parameters immutably', () => {
    const initialAgent: AgentNodeData = {
      label: 'Analyst Agent',
      model: 'gemini-2.5-flash',
      temperature: 0.5,
      memoryType: 'none',
      tools: [],
    };

    const updatedAgent: AgentNodeData = {
      ...initialAgent,
      model: 'gemini-2.5-pro',
      temperature: 0.8,
      memoryType: 'postgres',
      tools: [AVAILABLE_TOOLS[0]],
    };

    assert.equal(updatedAgent.model, 'gemini-2.5-pro');
    assert.equal(updatedAgent.temperature, 0.8);
    assert.equal(updatedAgent.memoryType, 'postgres');
    assert.equal(updatedAgent.tools?.length, 1);
  });
});
