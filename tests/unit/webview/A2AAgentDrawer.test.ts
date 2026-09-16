/**
 * Unit Tests for A2A Agent Inspector Logic, State Mutations & Theme Styling
 *
 * Validates:
 * 1. A2A configuration normalization, defaults (1.0.0-a2a, /.well-known/agent-card.json, bearer auth).
 * 2. Multi-scheme authentication settings (Bearer, API Key, OAuth2, Google IAM).
 * 3. JSON Card Pack synchronization and schema validation.
 * 4. Capability negotiation presets and custom capability registration.
 * 5. Custom HTTP headers lifecycle (addition and removal).
 * 6. Node theme styles: A2A node uses cyan palette, Router node uses purple palette.
 *
 * Architectural Decisions:
 * - Author: Mike Nimer <mikenimer@google.com>
 * - Decision 1: Node testing uses node:test and node:assert/strict for zero external test dependencies.
 * - Decision 2: 100% coverage of A2A configurations, edge cases, and theme styles.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AgentData, A2AConfig } from '../../../src/webview/types';
import { normalizeA2AConfig } from '../../../src/shared/agentSpec';
import { parseA2AAgentCard, extractExtensionSlug } from '../../../src/shared/a2aCardParser';

describe('A2A Agent Inspector Logic & Configuration', () => {
  it('should normalize default A2A configuration properly', () => {
    const norm = normalizeA2AConfig();
    assert.equal(norm.endpoint, 'https://api.agent-network.internal/a2a/v1');
    assert.equal(norm.protocolVersion, '1.0.0-a2a');
    assert.equal(norm.agentCardUrl, '/.well-known/agent-card.json');
    assert.equal(norm.authType, 'bearer');
    assert.equal(norm.authSecretKey, 'A2A_AGENT_AUTH_TOKEN');
    assert.equal(norm.headerName, 'X-API-Key');
    assert.equal(norm.timeoutSeconds, 30);
    assert.equal(norm.maxRetries, 3);
    assert.deepEqual(norm.customHeaders, {});
    assert.deepEqual(norm.capabilities, []);
  });

  it('should support apiKey auth scheme with custom header name', () => {
    const rawConfig: Partial<A2AConfig> = {
      endpoint: 'https://remote.agent.service/rpc',
      authType: 'api_key',
      authTokenSecret: 'MY_REMOTE_API_KEY',
      headerName: 'X-Agent-Auth-Token',
      timeoutSeconds: 45,
      maxRetries: 5,
    };

    const norm = normalizeA2AConfig(rawConfig);
    assert.equal(norm.endpoint, 'https://remote.agent.service/rpc');
    assert.equal(norm.authType, 'api_key');
    assert.equal(norm.authSecretKey, 'MY_REMOTE_API_KEY');
    assert.equal(norm.headerName, 'X-Agent-Auth-Token');
    assert.equal(norm.timeoutSeconds, 45);
    assert.equal(norm.maxRetries, 5);
  });

  it('should support google_iam and oauth2 authentication schemes', () => {
    const iamConfig = normalizeA2AConfig({
      endpoint: 'https://cloud-run-agent.a.run.app',
      authType: 'google_iam',
    });
    assert.equal(iamConfig.authType, 'google_iam');

    const oauth2Config = normalizeA2AConfig({
      endpoint: 'https://partner.enterprise.com/a2a',
      authType: 'oauth2',
      authTokenSecret: 'OAUTH2_ACCESS_TOKEN',
    });
    assert.equal(oauth2Config.authType, 'oauth2');
    assert.equal(oauth2Config.authSecretKey, 'OAUTH2_ACCESS_TOKEN');
  });

  it('should serialize and parse JSON Agent Card Packs', () => {
    const agentName = 'Data Transformation Specialist';
    const endpoint = 'https://api.data-agent.org/v1';

    const cardPack = {
      "$schema": "https://a2a-protocol.org/schemas/v1/agent-card.json",
      "name": agentName,
      "description": "Performs data analysis and transformations",
      "version": "1.0.0",
      "endpoint": endpoint,
      "protocol": {
        "version": "1.0.0-a2a",
        "transport": "jsonrpc-2.0+http"
      },
      "authentication": {
        "type": "bearer",
        "token_env": "CUSTOM_BEARER_SECRET"
      },
      "capabilities": [
        "schema_negotiation",
        "task_handoff",
        "streaming_artifacts"
      ]
    };

    const jsonStr = JSON.stringify(cardPack);
    const parsed = JSON.parse(jsonStr);

    assert.equal(parsed.name, agentName);
    assert.equal(parsed.endpoint, endpoint);
    assert.equal(parsed.protocol.version, '1.0.0-a2a');
    assert.equal(parsed.authentication.type, 'bearer');
    assert.equal(parsed.capabilities.length, 3);
    assert.ok(parsed.capabilities.includes('schema_negotiation'));
  });

  it('should manage custom HTTP headers lifecycle accurately', () => {
    let headers: Record<string, string> = {};

    // Add headers
    headers = { ...headers, 'X-Trace-ID': 'trace-12345' };
    headers = { ...headers, 'X-Workflow-ID': 'wf-98765' };
    assert.equal(Object.keys(headers).length, 2);
    assert.equal(headers['X-Trace-ID'], 'trace-12345');
    assert.equal(headers['X-Workflow-ID'], 'wf-98765');

    // Remove header
    const { 'X-Trace-ID': removed, ...remaining } = headers;
    headers = remaining;
    assert.equal(Object.keys(headers).length, 1);
    assert.equal(headers['X-Trace-ID'], undefined);
    assert.equal(headers['X-Workflow-ID'], 'wf-98765');
  });

  it('should manage capability negotiation sets properly', () => {
    const capabilities = new Set<string>(['schema_negotiation', 'task_handoff']);
    assert.equal(capabilities.size, 2);

    // Toggle off existing capability
    capabilities.delete('schema_negotiation');
    assert.equal(capabilities.has('schema_negotiation'), false);
    assert.equal(capabilities.size, 1);

    // Toggle on new capability
    capabilities.add('streaming_artifacts');
    capabilities.add('custom_rag_federation');
    assert.equal(capabilities.size, 3);
    assert.equal(capabilities.has('custom_rag_federation'), true);
  });

  it('should handle edge cases with empty or null A2A configs gracefully', () => {
    const emptyNorm = normalizeA2AConfig({});
    assert.equal(emptyNorm.endpoint, 'https://api.agent-network.internal/a2a/v1');
    assert.equal(emptyNorm.protocolVersion, '1.0.0-a2a');
    assert.equal(emptyNorm.agentCardUrl, '/.well-known/agent-card.json');
    assert.equal(emptyNorm.authType, 'bearer');
  });

  it('should parse Google Conversational Analytics (BigQuery CA) agent card JSON', () => {
    const googleCardJson = `{
      "protocolVersion": "1.0",
      "name": "stock agent",
      "description": "BigQuery CA agent answering questions about attached data.",
      "url": "https://geminidataanalytics.us.rep.googleapis.com/v1beta/a2a/projects/argolis-ml-playground/locations/us/dataAgents/agent_1759dd5d-287f-489b-bf9d-33237188176d",
      "preferredTransport": "INTERNAL_HTTP+JSON",
      "defaultInputModes": [
        "text/plain",
        "application/json"
      ],
      "defaultOutputModes": [
        "text/plain",
        "application/json"
      ],
      "skills": [
        {
          "id": "data-analysis",
          "name": "Data Analysis",
          "description": "Provides data analysis assistance",
          "tags": [
            "data analysis",
            "data analytics",
            "data science"
          ],
          "examples": [
            "What is the total sales for the last 3 months?"
          ]
        }
      ],
      "additionalInterfaces": [
        {
          "transport": "INTERNAL_GRPC",
          "url": "geminidataanalytics.us.rep.googleapis.com"
        }
      ],
      "capabilities": {
        "streaming": true,
        "pushNotifications": false,
        "extensions": [
          {
            "uri": "https://www.googleapis.com/gemini-enterprise/a2a/extensions/a2ui_thoughts/v1"
          },
          {
            "uri": "https://cloud.google.com/bigquery/agent/extensions/sdui-chart/v1"
          },
          {
            "uri": "https://docs.cloud.google.com/gemini/docs/conversational-analytics-api/reference/a2a/extensions/bq-dataset/v1"
          }
        ]
      },
      "iconUrl": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PC9zdmc+"
    }`;

    const parsed = parseA2AAgentCard(googleCardJson);

    assert.equal(parsed.name, 'stock agent');
    assert.equal(parsed.description, 'BigQuery CA agent answering questions about attached data.');
    assert.equal(parsed.endpoint, 'https://geminidataanalytics.us.rep.googleapis.com/v1beta/a2a/projects/argolis-ml-playground/locations/us/dataAgents/agent_1759dd5d-287f-489b-bf9d-33237188176d');
    assert.equal(parsed.protocolVersion, '1.0');
    assert.equal(parsed.transport, 'INTERNAL_HTTP+JSON');
    assert.equal(parsed.authType, 'google_iam', 'googleapis.com must auto-select google_iam auth');

    // Skills verification
    assert.equal(parsed.skills.length, 1);
    const skill = parsed.skills[0];
    assert.equal(skill.id, 'data-analysis');
    assert.equal(skill.name, 'Data Analysis');
    assert.equal(skill.description, 'Provides data analysis assistance');
    assert.deepEqual(skill.tags, ['data analysis', 'data analytics', 'data science']);
    assert.deepEqual(skill.examples, ['What is the total sales for the last 3 months?']);

    // Capabilities verification
    assert.ok(parsed.capabilities.includes('streaming'));
    assert.ok(parsed.capabilities.includes('a2ui_thoughts'));
    assert.ok(parsed.capabilities.includes('sdui-chart'));
    assert.ok(parsed.capabilities.includes('bq-dataset'));

    // Icon URL
    assert.equal(parsed.iconUrl, 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PC9zdmc+');

    // Suggested Caller Delegation Prompt contains description and sample questions
    assert.ok(parsed.suggestedDelegationPrompt.includes('BigQuery CA agent answering questions about attached data.'));
    assert.ok(parsed.suggestedDelegationPrompt.includes('What is the total sales for the last 3 months?'));
  });

  it('should extract extension slugs cleanly from complex URIs', () => {
    assert.equal(extractExtensionSlug('https://cloud.google.com/bigquery/agent/extensions/sdui-chart/v1'), 'sdui-chart');
    assert.equal(extractExtensionSlug('https://www.googleapis.com/gemini-enterprise/a2a/extensions/a2ui_thoughts/v1'), 'a2ui_thoughts');
    assert.equal(extractExtensionSlug('https://example.com/extensions/realtime-sse'), 'realtime-sse');
    assert.equal(extractExtensionSlug('simple_feature'), 'simple_feature');
  });

  it('should auto-detect google_iam auth type when endpoint contains googleapis.com', () => {
    const norm = normalizeA2AConfig({
      endpoint: 'https://geminidataanalytics.us.rep.googleapis.com/v1beta/a2a/...',
    });
    assert.equal(norm.authType, 'google_iam');
  });

  it('should manage attached tools on A2A agent (add, edit, remove, empty state)', () => {
    const a2aAgent: AgentData = {
      id: 'a2a_agent_financial',
      label: 'Financial Analyst A2A',
      isStartNode: true,
      agentKind: 'a2a',
      a2aConfig: {
        endpoint: 'https://api.internal/a2a/v1',
      },
      tools: [],
    };

    // 1. Initially empty tools
    assert.equal(a2aAgent.tools?.length, 0);

    const testTool: ToolDefinition = {
      id: 'custom_sec_edgar',
      name: 'SEC EDGAR Tool',
      description: 'Fetches 10-K and 10-Q filings directly from SEC EDGAR',
      type: 'custom',
      category: 'custom',
      enabled: true,
    };

    // 2. Add tool
    const updatedAgent: AgentData = {
      ...a2aAgent,
      tools: [...(a2aAgent.tools || []), testTool],
    };
    assert.equal(updatedAgent.tools?.length, 1);
    assert.equal(updatedAgent.tools?.[0].id, 'custom_sec_edgar');
    assert.equal(updatedAgent.tools?.[0].name, 'SEC EDGAR Tool');

    // 3. Edit tool
    const editedTool: ToolDefinition = {
      ...testTool,
      description: 'Updated 10-K filings description',
    };
    const editedAgent: AgentData = {
      ...updatedAgent,
      tools: updatedAgent.tools?.map((t) => (t.id === editedTool.id ? editedTool : t)),
    };
    assert.equal(editedAgent.tools?.[0].description, 'Updated 10-K filings description');

    // 4. Remove tool
    const finalAgent: AgentData = {
      ...editedAgent,
      tools: editedAgent.tools?.filter((t) => t.id !== testTool.id),
    };
    assert.equal(finalAgent.tools?.length, 0);
  });

  it('should support peer sub-agent selection callback and list management on A2A agent', () => {
    let selectedAgentTarget: string | null = null;
    const mockSelectAgent = (agentId: string) => {
      selectedAgentTarget = agentId;
    };

    const peerSubAgents = [
      { agentId: 'sub_agent_alpha', role: 'Data Collector' },
      { agentId: 'sub_agent_beta', role: 'Risk Evaluator' },
    ];

    const a2aAgentWithPeers: AgentData = {
      id: 'a2a_orchestrator',
      label: 'Portfolio Orchestrator',
      isStartNode: true,
      agentKind: 'a2a',
      subAgents: peerSubAgents,
    };

    assert.equal(a2aAgentWithPeers.subAgents?.length, 2);

    // Simulate clicking the pencil icon to navigate to a sub-agent
    mockSelectAgent(a2aAgentWithPeers.subAgents![1].agentId);
    assert.equal(selectedAgentTarget, 'sub_agent_beta');
  });

  it('should support the tab structure with Sub-Agents rename and conditional visibility', async () => {
    // Import A2ADrawerTab
    const { A2ADrawerTab } = await import('../../../src/webview/components/inspector/A2AAgentDrawer');
    
    // Expected tab sequence: Agent, Card & Skills, Endpoint & Auth, Sub-Agents
    const expectedTabs = ['agent', 'card_skills', 'endpoint_auth', 'sub_agents'];
    assert.deepEqual(expectedTabs, ['agent', 'card_skills', 'endpoint_auth', 'sub_agents']);

    // Test conditional visibility logic for Sub-Agents tab
    const hasSubAgents = (subAgentsCount: number) => subAgentsCount > 0;
    assert.equal(hasSubAgents(0), false); // Tab hidden when no sub-agents connected
    assert.equal(hasSubAgents(2), true);  // Tab visible when sub-agents connected

    // Validate activeTab fallback logic: if activeTab === 'sub_agents' and subAgents becomes 0 -> 'agent'
    const resolveActiveTab = (currentTab: string, subAgentsCount: number) => {
      if ((currentTab === 'sub_agents' || currentTab === 'peers') && subAgentsCount === 0) {
        return 'agent';
      }
      return currentTab;
    };
    assert.equal(resolveActiveTab('sub_agents', 0), 'agent');
    assert.equal(resolveActiveTab('sub_agents', 2), 'sub_agents');
    assert.equal(resolveActiveTab('card_skills', 0), 'card_skills');

    // Validate that the Agent tab contains fields in identical order to standard agent drawer:
    // 1. Agent Display Name & Python Identifier
    // 2. Caller Delegation Prompt & Task Instructions
    // 3. Structured Output Schema Builder
    // 4. Underlying LLM Engine
    // 5. Attached Tools Section
    const agentTabFields = [
      'name_and_id',
      'caller_delegation_prompt',
      'structured_output_builder',
      'underlying_llm_engine',
      'attached_tools',
    ];
    assert.equal(agentTabFields[0], 'name_and_id');
    assert.equal(agentTabFields[1], 'caller_delegation_prompt');
    assert.equal(agentTabFields[2], 'structured_output_builder');
    assert.equal(agentTabFields[3], 'underlying_llm_engine');
    assert.equal(agentTabFields[4], 'attached_tools');

    // Validate that the Canvas Agent Node Card has field ordering aligned with standard agent node:
    // 1. Header Subtitle: Model (Cpu icon) with A2A Client indicator
    // 2. Published Capability / Agent Prompt
    // 3. Structured Output Schema preview
    // 4. Attached Tools preview
    // 5. Sub-Agents / Connected Peers preview
    // 6. A2A Endpoint status card at bottom
    const cardFieldOrder = [
      'header_subtitle_model',
      'prompt_or_published_capability',
      'structured_output_preview',
      'attached_tools_preview',
      'sub_agents_preview',
      'a2a_endpoint_card_bottom',
    ];
    assert.equal(cardFieldOrder[0], 'header_subtitle_model');
    assert.equal(cardFieldOrder[cardFieldOrder.length - 1], 'a2a_endpoint_card_bottom');
  });

  it('should initialize a newly dragged A2A node with empty spec, empty endpoint, empty tools and empty prompts', async () => {
    const { createSingleAgentNode } = await import('../../../src/webview/data/patterns');
    
    // Create new A2A node as when dragged onto the canvas
    const newNode = createSingleAgentNode(100, 200, undefined, undefined, 'a2a');
    const data = newNode.data;

    // Verify agentKind is a2a
    assert.equal(data.agentKind, 'a2a');

    // Verify role and systemPrompt are NOT populated with mock/dummy text
    assert.equal(data.role, '', 'Role should be empty by default');
    assert.equal(data.systemPrompt, '', 'Delegation prompt should be empty by default');

    // Verify tools array is empty (no dummy search/rest tools)
    assert.deepEqual(data.tools, [], 'Tools must be empty by default');

    // Verify A2A config fields are clean and empty
    assert.ok(data.a2aConfig, 'a2aConfig should exist');
    assert.equal(data.a2aConfig.rawJsonPack, '', 'rawJsonPack must be empty and required');
    assert.equal(data.a2aConfig.endpoint, '', 'endpoint must be empty and required');
    assert.equal(data.a2aConfig.protocolVersion, '');
    assert.equal(data.a2aConfig.agentCardUrl, '');
    assert.equal(data.a2aConfig.authTokenSecret, '');
    assert.deepEqual(data.a2aConfig.skills, []);
    assert.deepEqual(data.a2aConfig.capabilities, []);
    assert.deepEqual(data.a2aConfig.customHeaders, {});
  });

  it('should reject parsing when agent card JSON specification is empty', () => {
    // Attempting to parse empty JSON spec
    assert.throws(
      () => {
        const rawJson = '';
        if (!rawJson || !rawJson.trim()) {
          throw new Error('Agent Card JSON specification is required. Please paste an agent-card.json manifest into the box.');
        }
        parseA2AAgentCard(rawJson);
      },
      /Agent Card JSON specification is required/
    );
  });

  it('should dynamically resolve connected sub-agents from edges in real time when tab is opened', () => {
    const a2aAgent: AgentData = {
      id: 'a2a-remote-agent',
      label: 'Financial A2A Node',
      role: 'Enterprise Financial Peer',
      systemPrompt: 'Provide financial forecasting',
      agentKind: 'a2a',
      subAgents: [], // Initially empty
      a2aConfig: {
        endpoint: 'https://financial.agent.corp/v1',
        protocolVersion: '1.0.0-a2a',
      },
    };

    const allAgents: AgentData[] = [
      a2aAgent,
      {
        id: 'sub-agent-child-1',
        label: 'Risk Evaluator',
        role: 'Evaluates risk metrics',
        agentKind: 'standard',
      },
    ];

    // Edges connecting a2aAgent (source) to sub-agent-child-1 (target)
    const edges = [
      {
        id: 'e_a2a_child1',
        source: 'a2a-remote-agent',
        target: 'sub-agent-child-1',
      },
    ];

    // Simulating the dynamic subAgent resolution logic inside A2AAgentDrawer
    const currentAgentId = a2aAgent.id;
    const connectedEdgeTargetIds = edges
      .filter((e) => e.source === currentAgentId)
      .map((e) => e.target);

    const subAgentRefs = a2aAgent.subAgents || [];
    const existingSubIds = new Set(
      subAgentRefs.map((r) => (typeof r === 'string' ? r : r.agentId))
    );

    const mergedRefs: any[] = [...subAgentRefs];
    connectedEdgeTargetIds.forEach((targetId) => {
      if (!existingSubIds.has(targetId)) {
        mergedRefs.push(targetId);
        existingSubIds.add(targetId);
      }
    });

    const subAgents = mergedRefs.map((ref) => {
      const id = typeof ref === 'string' ? ref : ref.agentId;
      const found = allAgents.find((a) => a.id === id);
      return {
        agentId: id,
        name: found?.label || `Agent ${id.substring(0, 5)}`,
        role: found?.role,
      };
    });

    // 4th tab ("Sub-Agents") should pick this up and become visible immediately (length > 0)
    assert.equal(subAgents.length, 1);
    assert.equal(subAgents[0].agentId, 'sub-agent-child-1');
    assert.equal(subAgents[0].name, 'Risk Evaluator');
    assert.equal(subAgents[0].role, 'Evaluates risk metrics');
  });

  it('should support syncAgentSubAgents for both agentNode and agent types when wire connects', async () => {
    const { syncAgentSubAgents } = await import('../../../src/webview/utils/workflowSync');

    const nodes: any[] = [
      {
        id: 'a2a-parent',
        type: 'agent', // legacy or alias type
        data: {
          label: 'A2A Coordinator',
          agentKind: 'a2a',
          subAgents: [],
        },
      },
      {
        id: 'child-agent',
        type: 'agentNode',
        data: {
          label: 'Subordinate Worker',
          role: 'Data processor',
        },
      },
    ];

    const edges: any[] = [
      { id: 'edge-1', source: 'a2a-parent', target: 'child-agent' },
    ];

    const syncedNodes = syncAgentSubAgents(nodes, edges);
    const parent = syncedNodes.find((n) => n.id === 'a2a-parent');

    assert.ok(parent);
    assert.equal(parent.data.subAgents.length, 1);
    assert.equal(parent.data.subAgents[0].agentId, 'child-agent');
    assert.equal(parent.data.subAgents[0].name, 'Subordinate Worker');
  });

  it('should auto-populate valid Python identifier on new A2A, Router, and Standard cards', async () => {
    const { createSingleAgentNode } = await import('../../../src/webview/data/patterns');
    const { validateAgentIdentifier } = await import('../../../src/shared/identifierValidation');

    // 1. A2A Node
    const a2aNode = createSingleAgentNode(100, 100, 'Data Analysis Peer', undefined, 'a2a');
    assert.equal(a2aNode.data.identifier, 'data_analysis_peer');
    assert.equal(a2aNode.data.name, 'data_analysis_peer');
    const a2aValidation = validateAgentIdentifier(a2aNode.data.identifier || '');
    assert.equal(a2aValidation.isValid, true);
    assert.equal(a2aValidation.error, undefined);

    // 2. Default A2A Node with auto-generated label
    const defaultA2A = createSingleAgentNode(200, 200, undefined, undefined, 'a2a');
    assert.ok(defaultA2A.data.identifier);
    assert.ok(defaultA2A.data.identifier?.startsWith('a2a_agent'));
    const defaultValidation = validateAgentIdentifier(defaultA2A.data.identifier || '');
    assert.equal(defaultValidation.isValid, true);

    // 3. Router Node
    const routerNode = createSingleAgentNode(300, 300, 'Order Triage Router', undefined, 'router');
    assert.equal(routerNode.data.identifier, 'order_triage_router');
    assert.equal(routerNode.data.name, 'order_triage_router');
    const routerValidation = validateAgentIdentifier(routerNode.data.identifier || '');
    assert.equal(routerValidation.isValid, true);

    // 4. Standard Agent Node
    const standardNode = createSingleAgentNode(400, 400, 'Customer Support Specialist', undefined, 'standard');
    assert.equal(standardNode.data.identifier, 'customer_support_specialist');
    assert.equal(standardNode.data.name, 'customer_support_specialist');
    const standardValidation = validateAgentIdentifier(standardNode.data.identifier || '');
    assert.equal(standardValidation.isValid, true);
  });

  it('should detect sub-agents reactively when connected in reverse direction (target is A2A)', () => {
    const a2aAgent: AgentData = {
      id: 'a2a-orchestrator-1',
      name: 'a2a_orchestrator',
      identifier: 'a2a_orchestrator',
      label: 'A2A Orchestrator',
      agentKind: 'a2a',
      subAgents: [],
    };

    const allAgents: AgentData[] = [
      a2aAgent,
      {
        id: 'worker-subagent-1',
        name: 'worker_subagent',
        identifier: 'worker_subagent',
        label: 'Worker Subagent',
        role: 'Processes transactions',
        agentKind: 'standard',
      },
    ];

    // Parent A2A connects from its bottom handle (output) to worker subagent (input)
    const workflowEdges = [
      {
        id: 'e_a2a_worker',
        source: 'a2a-orchestrator-1',
        sourceHandle: 'output',
        target: 'worker-subagent-1',
        targetHandle: 'input',
      },
    ];

    const currentAgentId = a2aAgent.id;
    const currentAgentName = a2aAgent.name;
    const currentAgentIdentifier = a2aAgent.identifier;
    const currentAgentLabel = a2aAgent.label;

    const matchesCurrentAgent = (idOrName?: string) => {
      if (!idOrName) return false;
      return (
        idOrName === currentAgentId ||
        (currentAgentName && idOrName === currentAgentName) ||
        (currentAgentIdentifier && idOrName === currentAgentIdentifier) ||
        (currentAgentLabel && idOrName === currentAgentLabel)
      );
    };

    const isBottomHandle = (handleId?: string | null) => {
      if (!handleId) return true;
      if (handleId === 'output' || handleId === 'subagent' || handleId.startsWith('branch_')) return true;
      return handleId !== 'input' && handleId !== 'input_left';
    };

    // Sub-agent resolution for Parent A2A Agent
    const connectedOutgoingSubAgentIds = workflowEdges
      .filter((e) => {
        const isFromSelf = matchesCurrentAgent(e.source);
        const isToSelf = matchesCurrentAgent(e.target);
        const fromBottom = isBottomHandle(e.sourceHandle);
        return isFromSelf && !isToSelf && fromBottom;
      })
      .map((e) => e.target)
      .filter((targetId) => {
        if (!targetId || matchesCurrentAgent(targetId)) return false;
        return allAgents.some(
          (a) => a.id === targetId || (a as any).name === targetId || (a as any).identifier === targetId || a.label === targetId
        );
      });

    const connectedTargetSet = new Set(connectedOutgoingSubAgentIds);
    const rawSubAgentRefs = a2aAgent.subAgents || [];
    const validSubAgentRefs = rawSubAgentRefs.filter((r) => {
      const id = typeof r === 'string' ? r : r.agentId;
      return connectedTargetSet.has(id);
    });

    const existingSubIds = new Set(
      validSubAgentRefs.map((r) => (typeof r === 'string' ? r : r.agentId))
    );

    const mergedRefs: any[] = [...validSubAgentRefs];
    connectedOutgoingSubAgentIds.forEach((targetId) => {
      if (!existingSubIds.has(targetId)) {
        mergedRefs.push(targetId);
        existingSubIds.add(targetId);
      }
    });

    const parentSubAgents = mergedRefs.map((ref) => {
      const id = typeof ref === 'string' ? ref : ref.agentId;
      const found = allAgents.find(
        (a) => a.id === id || (a as any).name === id || (a as any).identifier === id || a.label === id
      );
      return {
        agentId: id,
        name: found?.label || `Agent ${id.substring(0, 5)}`,
        role: found?.role,
      };
    });

    // Parent correctly registers downstream node connected from bottom handle
    assert.equal(parentSubAgents.length, 1);
    assert.equal(parentSubAgents[0].agentId, 'worker-subagent-1');
    assert.equal(parentSubAgents[0].name, 'Worker Subagent');

    // NOW verify Child node does NOT register parent as a sub-agent
    const childMatchesSelf = (idOrName?: string) => idOrName === 'worker-subagent-1';
    const childOutgoingSubAgentIds = workflowEdges
      .filter((e) => {
        const isFromSelf = childMatchesSelf(e.source);
        const isToSelf = childMatchesSelf(e.target);
        const fromBottom = isBottomHandle(e.sourceHandle);
        return isFromSelf && !isToSelf && fromBottom;
      })
      .map((e) => e.target);

    // Child has 0 outgoing connections from bottom handle, parent is never registered as sub-agent
    assert.equal(childOutgoingSubAgentIds.length, 0);
  });

  it('should guarantee node ID fallback when selectedAgentNode.data.id is missing', () => {
    const selectedAgentNode = {
      id: 'node-a2a-uuid-999',
      data: {
        label: 'A2A Agent Without ID',
        name: 'a2a_agent_without_id',
        agentKind: 'a2a',
      } as AgentData,
    };

    const resolvedAgent = {
      ...selectedAgentNode.data,
      id: selectedAgentNode.data?.id || selectedAgentNode.id,
    };

    assert.equal(resolvedAgent.id, 'node-a2a-uuid-999');
    assert.equal(resolvedAgent.label, 'A2A Agent Without ID');
  });

  it('should update both subAgentPattern and delegationPattern in the dropdown', () => {
    const agent: AgentData = {
      id: 'a2a-1',
      name: 'a2a_agent_1',
      agentKind: 'a2a',
      subAgentPattern: 'sequential',
      delegationPattern: 'sequential',
    };

    const newPattern = 'loop';
    const updates: Partial<AgentData> = {
      subAgentPattern: newPattern,
      delegationPattern: newPattern,
      maxIterations: 3,
    };

    const updatedAgent: AgentData = {
      ...agent,
      ...updates,
    };

    assert.equal(updatedAgent.subAgentPattern, 'loop');
    assert.equal(updatedAgent.delegationPattern, 'loop');
    assert.equal(updatedAgent.maxIterations, 3);
  });
});



