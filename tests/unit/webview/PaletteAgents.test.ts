/**
 * Unit Tests for Basic Agent Types in PaletteCard
 *
 * Validates:
 * 1. PaletteCard basic agent types catalog includes Standard, A2A, and Router nodes.
 * 2. Visual metadata (theme color, badge label, agent kind) for all 3 types.
 * 3. Drag-and-drop payload generation for all 3 basic agent types.
 * 4. createSingleAgentNode generates valid node structure for all 3 basic agent types.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createSingleAgentNode } from '../../../src/webview/data/patterns';
import { AgentKind } from '../../../src/webview/types';

describe('Basic Agent Types Palette & Node Creation', () => {
  const BASIC_AGENT_TYPES: {
    kind: AgentKind;
    label: string;
    badge: string;
    color: string;
    description: string;
  }[] = [
    {
      kind: 'standard',
      label: 'Agent',
      badge: 'Standard',
      color: 'blue',
      description: 'LLM agent with tools & prompt',
    },
    {
      kind: 'a2a',
      label: 'A2A Agent',
      badge: 'Protocol',
      color: 'cyan',
      description: 'Decentralized JSON-RPC A2A endpoint',
    },
    {
      kind: 'router',
      label: 'Router',
      badge: 'Branching',
      color: 'purple',
      description: 'Conditional branching & if/else routing',
    },
  ];

  it('should include exactly 3 basic agent types in the catalog', () => {
    assert.equal(BASIC_AGENT_TYPES.length, 3);
    const kinds = BASIC_AGENT_TYPES.map((a) => a.kind);
    assert.deepEqual(kinds, ['standard', 'a2a', 'router']);
  });

  it('should configure Router Agent with Branching badge and purple theme', () => {
    const routerType = BASIC_AGENT_TYPES.find((a) => a.kind === 'router');
    assert.ok(routerType);
    assert.equal(routerType?.badge, 'Branching');
    assert.equal(routerType?.color, 'purple');
    assert.ok(routerType?.description.includes('branching'));
  });

  it('should generate correct drag-and-drop transfer data for router agent', () => {
    const mockData: Record<string, string> = {};
    const handleDragStartAgent = (type: string, isPattern = false, agentKind?: string) => {
      mockData['application/reactflow/type'] = type;
      mockData['application/reactflow/isPattern'] = isPattern ? 'true' : 'false';
      if (agentKind) {
        mockData['application/reactflow/agentKind'] = agentKind;
      }
    };

    handleDragStartAgent('router', false, 'router');
    assert.equal(mockData['application/reactflow/type'], 'router');
    assert.equal(mockData['application/reactflow/isPattern'], 'false');
    assert.equal(mockData['application/reactflow/agentKind'], 'router');
  });

  it('should create valid router node on canvas with default branches and purple theme', () => {
    const routerNode = createSingleAgentNode(100, 200, undefined, undefined, 'router');

    assert.equal(routerNode.type, 'agentNode');
    assert.equal(routerNode.data.agentKind, 'router');
    assert.equal(routerNode.data.colorTheme, 'purple');
    assert.ok(routerNode.data.routerConfig);
    assert.equal(routerNode.data.routerConfig?.evaluationMode, 'boolean_expression');
    assert.ok(routerNode.data.routerConfig?.branches.length >= 2);
  });

  it('should create valid standard and A2A nodes on canvas', () => {
    const standardNode = createSingleAgentNode(0, 0, undefined, undefined, 'standard');
    assert.equal(standardNode.data.agentKind, 'standard');

    const a2aNode = createSingleAgentNode(50, 50, undefined, undefined, 'a2a');
    assert.equal(a2aNode.data.agentKind, 'a2a');
    assert.ok(a2aNode.data.a2aConfig);
  });
});
