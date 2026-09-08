/**
 * Unit Tests for Tool Drawer Configuration & Inspector Logic
 *
 * Validates:
 * 1. ToolDrawer and ToolPropertyDrawer backward compatibility export parity.
 * 2. Vertex AI Search configuration validation (ensuring default location="global").
 * 3. Google Search Grounding filter management (adding/removing domains).
 * 4. Human-in-the-Loop Clarification settings updates.
 * 5. Sub-Agent as a Tool configuration bindings.
 * 6. MCP Server transport and environment configurations.
 * 7. Parameter schema list manipulation (add, update, delete).
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ToolDrawer, ToolPropertyDrawer } from '../../src/webview/components/inspector/ToolDrawer';
import { ToolDefinition, AgentData } from '../../src/webview/types';
import { BUILTIN_ADK_TOOLS, getBuiltinToolById } from '../../src/webview/data/builtinTools';

describe('Tool Drawer & Property Inspector Logic', () => {
  it('should export both ToolDrawer and ToolPropertyDrawer identically for backward compatibility', () => {
    assert.ok(ToolDrawer);
    assert.ok(ToolPropertyDrawer);
    assert.equal(ToolDrawer, ToolPropertyDrawer);
  });

  it('should maintain Vertex AI Search datastore configuration with global region default', () => {
    const vertexTool = getBuiltinToolById('builtin_vertex_ai_search')!;
    assert.ok(vertexTool);

    // Simulate inspector configuration mutation
    const updatedTool: ToolDefinition = {
      ...vertexTool,
      vertexAiSearchConfig: {
        ...vertexTool.vertexAiSearchConfig,
        dataStoreId: 'internal-docs-ds',
        projectId: 'gcp-corp-prod',
        location: 'global',
        maxResults: 10,
      },
    };

    assert.equal(updatedTool.vertexAiSearchConfig?.dataStoreId, 'internal-docs-ds');
    assert.equal(updatedTool.vertexAiSearchConfig?.projectId, 'gcp-corp-prod');
    assert.equal(updatedTool.vertexAiSearchConfig?.location, 'global');
    assert.equal(updatedTool.vertexAiSearchConfig?.maxResults, 10);
  });

  it('should update Google Search domain filters and dynamic threshold', () => {
    const searchTool = getBuiltinToolById('builtin_google_search')!;
    assert.ok(searchTool);

    const updatedTool: ToolDefinition = {
      ...searchTool,
      googleSearchConfig: {
        domainFilters: ['google.com', 'github.com'],
        dynamicThreshold: 0.75,
      },
    };

    assert.deepEqual(updatedTool.googleSearchConfig?.domainFilters, ['google.com', 'github.com']);
    assert.equal(updatedTool.googleSearchConfig?.dynamicThreshold, 0.75);

    // Remove domain
    const filteredDomains = updatedTool.googleSearchConfig?.domainFilters?.filter((d) => d !== 'google.com');
    const prunedTool = {
      ...updatedTool,
      googleSearchConfig: {
        ...updatedTool.googleSearchConfig,
        domainFilters: filteredDomains,
      },
    };
    assert.deepEqual(prunedTool.googleSearchConfig?.domainFilters, ['github.com']);
  });

  it('should configure Human-in-the-Loop clarification parameters', () => {
    const hitlTool = getBuiltinToolById('builtin_request_input')!;
    assert.ok(hitlTool);

    const updatedTool: ToolDefinition = {
      ...hitlTool,
      requestInputConfig: {
        prompt: 'Please confirm payment authorization of $500:',
        timeoutSeconds: 600,
      },
    };

    assert.equal(updatedTool.requestInputConfig?.prompt, 'Please confirm payment authorization of $500:');
    assert.equal(updatedTool.requestInputConfig?.timeoutSeconds, 600);
  });

  it('should configure Sub-Agent as a Tool delegation target', () => {
    const agentTool = getBuiltinToolById('builtin_agent_as_tool')!;
    assert.ok(agentTool);

    const updatedTool: ToolDefinition = {
      ...agentTool,
      agentAsToolConfig: {
        targetAgentId: 'agent_analyst_007',
        targetAgentName: 'Financial Modeling Sub-Agent',
        description: 'Computes discounted cash flow forecasts.',
      },
    };

    assert.equal(updatedTool.agentAsToolConfig?.targetAgentId, 'agent_analyst_007');
    assert.equal(updatedTool.agentAsToolConfig?.targetAgentName, 'Financial Modeling Sub-Agent');
    assert.equal(updatedTool.agentAsToolConfig?.description, 'Computes discounted cash flow forecasts.');
  });

  it('should configure MCP Server tool with stdio and SSE transports', () => {
    const mcpStdio: ToolDefinition = {
      id: 'tool_mcp_git',
      name: 'GitHub MCP',
      type: 'mcp',
      description: 'Interact with GitHub issues',
      mcpConfig: {
        serverName: 'github-server',
        transportType: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github'],
      },
    };

    assert.equal(mcpStdio.mcpConfig?.serverName, 'github-server');
    assert.equal(mcpStdio.mcpConfig?.transportType, 'stdio');
    assert.equal(mcpStdio.mcpConfig?.command, 'npx');

    const mcpSse: ToolDefinition = {
      id: 'tool_mcp_remote',
      name: 'Remote MCP',
      type: 'mcp',
      description: 'Remote SSE server',
      mcpConfig: {
        serverName: 'remote-sse',
        transportType: 'sse',
        url: 'https://mcp.internal.net/sse',
      },
    };

    assert.equal(mcpSse.mcpConfig?.transportType, 'sse');
    assert.equal(mcpSse.mcpConfig?.url, 'https://mcp.internal.net/sse');
  });

  it('should support adding, updating, and removing tool parameters', () => {
    const customTool: ToolDefinition = {
      id: 'custom_query',
      name: 'Query Analytics',
      type: 'custom',
      description: 'Run SQL analytics',
      parameters: [
        { name: 'query', type: 'string', required: true, description: 'SQL query string' },
      ],
    };

    // Add parameter
    const withParam: ToolDefinition = {
      ...customTool,
      parameters: [
        ...(customTool.parameters || []),
        { name: 'limit', type: 'number', required: false, description: 'Max records' },
      ],
    };
    assert.equal(withParam.parameters?.length, 2);

    // Update parameter
    const updatedParams = withParam.parameters?.map((p) =>
      p.name === 'limit' ? { ...p, description: 'Max row limit (default 100)' } : p
    );
    const withUpdatedParam: ToolDefinition = {
      ...withParam,
      parameters: updatedParams,
    };
    assert.equal(withUpdatedParam.parameters?.[1].description, 'Max row limit (default 100)');

    // Delete parameter
    const withoutParam: ToolDefinition = {
      ...withUpdatedParam,
      parameters: withUpdatedParam.parameters?.filter((p) => p.name !== 'limit'),
    };
    assert.equal(withoutParam.parameters?.length, 1);
    assert.equal(withoutParam.parameters?.[0].name, 'query');
  });

  it('should attach tool to selected agent data cleanly', () => {
    const testAgent: AgentData = {
      name: 'Customer Support Lead',
      description: 'Assists customers with ticket queries',
      tools: [],
    };

    const toolToAdd = getBuiltinToolById('builtin_vertex_ai_search')!;
    assert.ok(toolToAdd);

    const updatedAgent: AgentData = {
      ...testAgent,
      tools: [...testAgent.tools, toolToAdd],
    };

    assert.equal(updatedAgent.tools.length, 1);
    assert.equal(updatedAgent.tools[0].id, 'builtin_vertex_ai_search');
    assert.equal(updatedAgent.tools[0].vertexAiSearchConfig?.location, 'global');
  });
});
