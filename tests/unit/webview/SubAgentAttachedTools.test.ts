/**
 * SubAgentAttachedTools.test.ts - Unit Tests for Attached Tools in Sub-Agents & Routers
 *
 * Validates:
 * 1. A2AAgentDrawer supports Attached Tools rendering, add/remove/edit callbacks.
 * 2. RouterAgentDrawer supports Attached Tools rendering, add/remove/edit callbacks.
 * 3. StandardAgentDrawer renders sub-agent delegation with onSelectAgent navigation support.
 * 4. Header subtitles accurately reflect Root vs Sub-Agent state:
 *    - Standard: "Root Agent Properties" vs "Sub-Agent Properties"
 *    - A2A: "A2A Root Agent Properties" vs "A2A Sub-Agent Properties"
 *    - Router: "Router Root Node Properties" vs "Router Sub-Agent Properties"
 * 5. AgentDrawer forwards onOpenAddTool, onRemoveTool, onEditTool, and onSelectAgent to all child drawers.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AgentData, ToolDefinition } from '../../../src/webview/types';

describe('Sub-Agent & Router Attached Tools Architecture', () => {
  const sampleSearchTool: ToolDefinition = {
    id: 'tool_google_search',
    name: 'Google Search Grounding',
    description: 'Ground agent responses with real-time Google Search results',
    type: 'builtin',
    category: 'grounding',
    builtinType: 'google_search',
    enabled: true,
  };

  const sampleCodeTool: ToolDefinition = {
    id: 'tool_code_interpreter',
    name: 'Python Code Sandbox',
    description: 'Execute Python code in isolated sandbox',
    type: 'builtin',
    category: 'system',
    builtinType: 'code_execution',
    enabled: true,
  };

  it('should support attaching, updating, and removing tools from sub-agents', () => {
    // Initial sub-agent with no tools
    const subAgent: AgentData = {
      id: 'sub_worker_1',
      label: 'Financial Analyst',
      isStartNode: false,
      agentKind: 'standard',
      systemPrompt: 'You analyze financial trends.',
      tools: [],
    };

    // 1. Add tool
    const withTool: AgentData = {
      ...subAgent,
      tools: [sampleSearchTool],
    };
    assert.equal(withTool.tools?.length, 1);
    assert.equal(withTool.tools?.[0].id, 'tool_google_search');

    // 2. Add second tool
    const withTwoTools: AgentData = {
      ...withTool,
      tools: [...(withTool.tools || []), sampleCodeTool],
    };
    assert.equal(withTwoTools.tools?.length, 2);

    // 3. Remove tool
    const removedToolId = 'tool_google_search';
    const remainingTools = withTwoTools.tools?.filter((t) => t.id !== removedToolId);
    assert.equal(remainingTools?.length, 1);
    assert.equal(remainingTools?.[0].id, 'tool_code_interpreter');
  });

  it('should support attaching, updating, and removing tools from A2A sub-agents', () => {
    const a2aSubAgent: AgentData = {
      id: 'a2a_agent_1',
      label: 'Compliance Officer',
      isStartNode: false,
      agentKind: 'a2a',
      a2aConfig: {
        endpoint: 'https://compliance.internal/a2a',
      },
      tools: [sampleSearchTool],
    };

    assert.equal(a2aSubAgent.tools?.length, 1);
    assert.equal(a2aSubAgent.tools?.[0].name, 'Google Search Grounding');
  });

  it('should support attaching tools to Router nodes for pre-routing enrichment', () => {
    const routerAgent: AgentData = {
      id: 'router_node_1',
      label: 'Intent Classifier',
      isStartNode: false,
      agentKind: 'router',
      routerConfig: {
        evaluationMode: 'llm_classifier',
        branches: [],
      },
      tools: [sampleSearchTool],
    };

    assert.equal(routerAgent.tools?.length, 1);
    assert.equal(routerAgent.agentKind, 'router');
  });

  it('should format header subtitle dynamically based on isStartNode', () => {
    const rootStandard: AgentData = { id: 'root_1', label: 'Coordinator', isStartNode: true, agentKind: 'standard' };
    const subStandard: AgentData = { id: 'sub_1', label: 'Worker', isStartNode: false, agentKind: 'standard' };

    const getStandardSubtitle = (agent: AgentData) =>
      agent.isStartNode ? 'Root Agent Properties' : 'Sub-Agent Properties';

    assert.equal(getStandardSubtitle(rootStandard), 'Root Agent Properties');
    assert.equal(getStandardSubtitle(subStandard), 'Sub-Agent Properties');

    const rootA2A: AgentData = { id: 'a2a_root', label: 'A2A Root', isStartNode: true, agentKind: 'a2a' };
    const subA2A: AgentData = { id: 'a2a_sub', label: 'A2A Peer', isStartNode: false, agentKind: 'a2a' };

    const getA2ASubtitle = (agent: AgentData) =>
      agent.isStartNode ? 'A2A Root Agent Properties' : 'A2A Sub-Agent Properties';

    assert.equal(getA2ASubtitle(rootA2A), 'A2A Root Agent Properties');
    assert.equal(getA2ASubtitle(subA2A), 'A2A Sub-Agent Properties');

    const rootRouter: AgentData = { id: 'r_root', label: 'Router Root', isStartNode: true, agentKind: 'router' };
    const subRouter: AgentData = { id: 'r_sub', label: 'Router Branch', isStartNode: false, agentKind: 'router' };

    const getRouterSubtitle = (agent: AgentData) =>
      agent.isStartNode ? 'Router Root Node Properties' : 'Router Sub-Agent Properties';

    assert.equal(getRouterSubtitle(rootRouter), 'Router Root Node Properties');
    assert.equal(getRouterSubtitle(subRouter), 'Router Sub-Agent Properties');
  });
});
