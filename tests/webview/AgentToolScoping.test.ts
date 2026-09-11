/**
 * Unit Tests for Agent Tool Property Scoping and Global Tool Isolation
 *
 * Validates:
 * 1. Attaching a tool to multiple agents creates deep-copied, independent tool instances.
 * 2. Editing tool properties from an agent inspector updates that agent's JSON node only.
 * 3. Editing a global tool saves to the designer state without mutating existing agent tool instances.
 * 4. Subsequent tool attachments inherit updated global tool template values.
 * 5. Extreme and edge conditions: multiple agents with multiple tools, partial property updates,
 *    and nested config mutations (e.g. Vertex AI Search and MCP configs).
 *
 * Architectural Decisions:
 * - Scoped Tool Configuration: Tools attached to agents maintain independent deep-copied instances
 *   in `node.data.tools`. Modifying a tool from an AgentDrawer updates only that specific agent's JSON.
 *   Modifying a tool from the global palette/Tools menu updates the global designer template without
 *   mutating existing agent-scoped tool instances.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AgentData, ToolDefinition } from '../../src/webview/types';
import { AVAILABLE_TOOLS } from '../../src/webview/data/defaultTools';
import { getBuiltinTools } from '../../src/webview/data/builtinTools';

describe('Agent Tool Scoping & Property Isolation Logic', () => {
  // Helper to simulate deep copying as implemented in handleAddSpecificTool
  const attachToolToAgent = (agent: AgentData, tool: ToolDefinition): AgentData => {
    const toolInstance: ToolDefinition = JSON.parse(JSON.stringify(tool));
    const currentTools = agent.tools || [];
    if (currentTools.some((t) => t.id === tool.id)) {
      return agent;
    }
    return {
      ...agent,
      tools: [...currentTools, toolInstance],
    };
  };

  // Helper to simulate handleSaveTool when scope === 'agent'
  const saveToolToAgent = (agent: AgentData, savedTool: ToolDefinition): AgentData => {
    return {
      ...agent,
      tools: (agent.tools || []).map((t) =>
        t.id === savedTool.id ? JSON.parse(JSON.stringify(savedTool)) : t
      ),
    };
  };

  // Helper to simulate handleSaveTool when scope === 'global'
  const saveToolToGlobal = (
    globalCatalog: ToolDefinition[],
    savedTool: ToolDefinition
  ): ToolDefinition[] => {
    const deepCopiedTool: ToolDefinition = JSON.parse(JSON.stringify(savedTool));
    const exists = globalCatalog.some((t) => t.id === deepCopiedTool.id);
    if (exists) {
      return globalCatalog.map((t) => (t.id === deepCopiedTool.id ? deepCopiedTool : t));
    }
    return [deepCopiedTool, ...globalCatalog];
  };

  it('should deep-copy tool instances when attached to multiple agents ensuring object isolation', () => {
    const vertexTool = AVAILABLE_TOOLS.find((t) => t.id === 'builtin_vertex_ai_search');
    assert.ok(vertexTool, 'Vertex AI Search tool should be available in default tools');

    let agent1: AgentData = {
      id: 'agent-1',
      label: 'Financial Research Agent',
      role: 'Research',
      model: 'gemini-2.5-pro',
      temperature: 0.2,
      tools: [],
    };

    let agent2: AgentData = {
      id: 'agent-2',
      label: 'Legal Compliance Agent',
      role: 'Compliance',
      model: 'gemini-2.5-pro',
      temperature: 0.1,
      tools: [],
    };

    agent1 = attachToolToAgent(agent1, vertexTool);
    agent2 = attachToolToAgent(agent2, vertexTool);

    assert.equal(agent1.tools?.length, 1);
    assert.equal(agent2.tools?.length, 1);

    // Verify object references are strictly decoupled
    assert.notEqual(agent1.tools?.[0], agent2.tools?.[0]);
    assert.notEqual(agent1.tools?.[0], vertexTool);
    assert.notEqual(agent2.tools?.[0], vertexTool);

    // Verify deep object references in nested configs are decoupled
    assert.notEqual(
      agent1.tools?.[0].vertexAiSearchConfig,
      agent2.tools?.[0].vertexAiSearchConfig
    );
  });

  it('should update tool properties ONLY in the specific agent JSON when saved from agent inspector', () => {
    const vertexTool = AVAILABLE_TOOLS.find((t) => t.id === 'builtin_vertex_ai_search')!;
    let agent1: AgentData = {
      id: 'agent-finance',
      label: 'Finance Agent',
      tools: [],
    };
    let agent2: AgentData = {
      id: 'agent-support',
      label: 'Customer Support Agent',
      tools: [],
    };

    agent1 = attachToolToAgent(agent1, vertexTool);
    agent2 = attachToolToAgent(agent2, vertexTool);

    // Edit tool on Agent 1: configure specific datastore and filter
    const agent1Tool = JSON.parse(JSON.stringify(agent1.tools![0])) as ToolDefinition;
    agent1Tool.vertexAiSearchConfig = {
      dataStoreId: 'finance-earnings-reports-v2',
      location: 'global',
      project: 'corp-finance-prod',
      filter: 'year >= 2024',
      maxResults: 15,
    };
    agent1Tool.description = 'Search through corporate quarterly financial 10-K filings.';

    // Save to Agent 1
    agent1 = saveToolToAgent(agent1, agent1Tool);

    // Assertions on Agent 1
    assert.equal(
      agent1.tools![0].vertexAiSearchConfig?.dataStoreId,
      'finance-earnings-reports-v2'
    );
    assert.equal(agent1.tools![0].vertexAiSearchConfig?.maxResults, 15);
    assert.equal(agent1.tools![0].vertexAiSearchConfig?.project, 'corp-finance-prod');
    assert.equal(
      agent1.tools![0].description,
      'Search through corporate quarterly financial 10-K filings.'
    );

    // Assertions on Agent 2: Must be completely untouched and retain default values
    assert.equal(
      agent2.tools![0].vertexAiSearchConfig?.dataStoreId,
      ''
    );
    assert.equal(agent2.tools![0].vertexAiSearchConfig?.maxResults, 5);
    assert.notEqual(
      agent2.tools![0].description,
      'Search through corporate quarterly financial 10-K filings.'
    );

    // Assertions on global template: Must remain untouched
    const globalVertexTool = AVAILABLE_TOOLS.find((t) => t.id === 'builtin_vertex_ai_search')!;
    assert.equal(
      globalVertexTool.vertexAiSearchConfig?.dataStoreId,
      ''
    );
  });

  it('should update global catalog without mutating existing agent tool instances', () => {
    let globalCatalog = [...AVAILABLE_TOOLS];
    const mcpToolTemplate = globalCatalog.find((t) => t.builtinType === 'google_search')!;

    let agentA: AgentData = {
      id: 'agent-a',
      label: 'Agent A',
      tools: [],
    };

    agentA = attachToolToAgent(agentA, mcpToolTemplate);
    assert.equal(agentA.tools![0].googleSearchConfig?.dynamicThreshold, 0.3);

    // Modify global tool template in designer state
    const updatedGlobalTemplate: ToolDefinition = {
      ...mcpToolTemplate,
      googleSearchConfig: {
        domainFilters: ['google.com', 'news.google.com'],
        dynamicThreshold: 0.9,
      },
      description: 'Globally modified web search template',
    };

    globalCatalog = saveToolToGlobal(globalCatalog, updatedGlobalTemplate);

    // Global catalog has the updated configuration
    const savedInCatalog = globalCatalog.find((t) => t.id === mcpToolTemplate.id)!;
    assert.equal(savedInCatalog.googleSearchConfig?.dynamicThreshold, 0.9);
    assert.deepEqual(savedInCatalog.googleSearchConfig?.domainFilters, [
      'google.com',
      'news.google.com',
    ]);
    assert.equal(savedInCatalog.description, 'Globally modified web search template');

    // Agent A must preserve its existing configuration without mutation
    assert.equal(agentA.tools![0].googleSearchConfig?.dynamicThreshold, 0.3);
    assert.notEqual(agentA.tools![0].description, 'Globally modified web search template');

    // Newly attached Agent B should receive the updated global configuration
    let agentB: AgentData = {
      id: 'agent-b',
      label: 'Agent B',
      tools: [],
    };
    agentB = attachToolToAgent(agentB, savedInCatalog);
    assert.equal(agentB.tools![0].googleSearchConfig?.dynamicThreshold, 0.9);
    assert.deepEqual(agentB.tools![0].googleSearchConfig?.domainFilters, [
      'google.com',
      'news.google.com',
    ]);
  });

  it('should handle extreme conditions: multiple distinct tools on multiple agents with concurrent scoped edits', () => {
    const tools = getBuiltinTools();
    const searchTool = tools.find((t) => t.builtinType === 'google_search')!;
    const codeTool = tools.find((t) => t.builtinType === 'code_execution')!;
    const inputTool = tools.find((t) => t.builtinType === 'request_input')!;

    let agents: AgentData[] = [
      { id: 'agent-1', label: 'Agent 1', tools: [] },
      { id: 'agent-2', label: 'Agent 2', tools: [] },
      { id: 'agent-3', label: 'Agent 3', tools: [] },
    ];

    // Attach all 3 tools to each of the 3 agents
    agents = agents.map((agent) => {
      let a = attachToolToAgent(agent, searchTool);
      a = attachToolToAgent(a, codeTool);
      a = attachToolToAgent(a, inputTool);
      return a;
    });

    // Verify each agent has 3 tools
    agents.forEach((agent) => {
      assert.equal(agent.tools?.length, 3);
    });

    // Edit request_input on Agent 2 only
    const agent2InputTool = JSON.parse(
      JSON.stringify(agents[1].tools!.find((t) => t.builtinType === 'request_input')!)
    ) as ToolDefinition;
    agent2InputTool.requestInputConfig = {
      prompt: 'Specialized Agent 2 prompt for supervisor confirmation',
      timeoutSec: 120,
    };
    agents[1] = saveToolToAgent(agents[1], agent2InputTool);

    // Verify Agent 2 has custom prompt
    assert.equal(
      agents[1].tools?.find((t) => t.builtinType === 'request_input')
        ?.requestInputConfig?.prompt,
      'Specialized Agent 2 prompt for supervisor confirmation'
    );
    assert.equal(
      agents[1].tools?.find((t) => t.builtinType === 'request_input')
        ?.requestInputConfig?.timeoutSec,
      120
    );

    // Verify Agent 1 and Agent 3 still have default request_input prompt
    assert.notEqual(
      agents[0].tools?.find((t) => t.builtinType === 'request_input')
        ?.requestInputConfig?.prompt,
      'Specialized Agent 2 prompt for supervisor confirmation'
    );
    assert.notEqual(
      agents[2].tools?.find((t) => t.builtinType === 'request_input')
        ?.requestInputConfig?.prompt,
      'Specialized Agent 2 prompt for supervisor confirmation'
    );
  });

  it('should only remove tool from the targeted agent node when deleted from an agent-scoped edit session', () => {
    const googleSearchTool = AVAILABLE_TOOLS.find(
      (t) => t.id === 'tool_google_search' || t.builtinType === 'google_search'
    )!;
    assert.ok(googleSearchTool);

    let globalCatalog = [...AVAILABLE_TOOLS];

    let agent1: AgentData = {
      id: 'agent-1',
      label: 'Agent Alpha',
      role: 'Research',
      model: 'gemini-3.7-flash',
      temperature: 0.2,
      tools: [],
    };

    let agent2: AgentData = {
      id: 'agent-2',
      label: 'Agent Beta',
      role: 'Writer',
      model: 'gemini-3.7-flash',
      temperature: 0.7,
      tools: [],
    };

    // Attach tool to both agents
    agent1 = attachToolToAgent(agent1, googleSearchTool);
    agent2 = attachToolToAgent(agent2, googleSearchTool);

    assert.equal(agent1.tools?.length, 1);
    assert.equal(agent2.tools?.length, 1);
    assert.ok(globalCatalog.some((t) => t.id === googleSearchTool.id));

    // Simulate deleting tool while editing from Agent 1 (editingToolScope: { type: 'agent', agentId: 'agent-1' })
    const scope: { type: 'agent' | 'global'; agentId?: string } = {
      type: 'agent',
      agentId: 'agent-1',
    };

    const toolToDeleteId = googleSearchTool.id;

    // Simulate handleDeleteTool logic
    let nodes = [
      { id: 'agent-1', type: 'agentNode', data: agent1 },
      { id: 'agent-2', type: 'agentNode', data: agent2 },
    ];

    if (scope.type === 'agent' && scope.agentId) {
      nodes = nodes.map((n) => {
        if (n.id === scope.agentId && n.type === 'agentNode') {
          return {
            ...n,
            data: {
              ...n.data,
              tools: (n.data.tools || []).filter((t: ToolDefinition) => t.id !== toolToDeleteId),
            },
          };
        }
        return n;
      });
    }

    const updatedAgent1 = nodes.find((n) => n.id === 'agent-1')!.data as AgentData;
    const updatedAgent2 = nodes.find((n) => n.id === 'agent-2')!.data as AgentData;

    // 1. Tool MUST be removed from Agent 1
    assert.equal(updatedAgent1.tools?.length, 0);

    // 2. Tool MUST still be attached to Agent 2
    assert.equal(updatedAgent2.tools?.length, 1);
    assert.equal(updatedAgent2.tools?.[0].id, googleSearchTool.id);

    // 3. Tool MUST still exist in the global catalog
    assert.ok(globalCatalog.some((t) => t.id === googleSearchTool.id));
  });

  it('should remove tool from catalog and all agent nodes when deleted from global scope', () => {
    const customTool: ToolDefinition = {
      id: 'custom_calc_tool',
      name: 'Calculator Tool',
      type: 'custom',
      description: 'Performs calculations',
    };

    let globalCatalog: ToolDefinition[] = [customTool, ...AVAILABLE_TOOLS];

    let nodes = [
      {
        id: 'agent-1',
        type: 'agentNode',
        data: {
          id: 'agent-1',
          label: 'Agent 1',
          role: 'Analyst',
          model: 'gemini-3.7-flash',
          tools: [customTool],
        } as AgentData,
      },
      {
        id: 'agent-2',
        type: 'agentNode',
        data: {
          id: 'agent-2',
          label: 'Agent 2',
          role: 'Analyst',
          model: 'gemini-3.7-flash',
          tools: [customTool],
        } as AgentData,
      },
    ];

    const scope = { type: 'global' as const };
    const toolToDeleteId = customTool.id;

    // Global delete execution
    if (scope.type === 'global') {
      globalCatalog = globalCatalog.filter((t) => t.id !== toolToDeleteId);
      nodes = nodes.map((n) => {
        if (n.type === 'agentNode' && (n.data as AgentData).tools) {
          return {
            ...n,
            data: {
              ...n.data,
              tools: (n.data as AgentData).tools?.filter((t) => t.id !== toolToDeleteId) || [],
            },
          };
        }
        return n;
      });
    }

    // 1. Tool removed from global catalog
    assert.equal(globalCatalog.some((t) => t.id === customTool.id), false);

    // 2. Tool stripped from both agents
    assert.equal((nodes[0].data as AgentData).tools?.length, 0);
    assert.equal((nodes[1].data as AgentData).tools?.length, 0);
  });
});
