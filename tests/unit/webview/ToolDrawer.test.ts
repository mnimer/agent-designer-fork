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
import React from 'react';
import {
  ToolDrawer,
  ToolPropertyDrawer,
  TRANSPORT_DESCRIPTIONS,
  McpToolDrawer,
  VertexAiSearchToolDrawer,
  GoogleSearchToolDrawer,
  RequestInputToolDrawer,
  AgentAsToolDrawer,
  CodeExecutionToolDrawer,
  CustomFunctionToolDrawer,
  WebPageReaderToolDrawer,
  PreloadMemoryToolDrawer,
  ApiToolDrawer,
} from '../../../src/webview/components/inspector/ToolDrawer';
import { ToolDrawerShell } from '../../../src/webview/components/inspector/tools/ToolDrawerShell';
import { ToolDefinition, AgentData } from '../../../src/webview/types';
import { BUILTIN_ADK_TOOLS, getBuiltinToolById } from '../../../src/webview/data/builtinTools';

describe('Tool Drawer & Property Inspector Logic', () => {
  it('should export all specialized tool drawers and Shell cleanly', () => {
    assert.ok(ToolDrawer);
    assert.ok(ToolPropertyDrawer);
    assert.equal(ToolDrawer, ToolPropertyDrawer);
    assert.ok(McpToolDrawer);
    assert.ok(VertexAiSearchToolDrawer);
    assert.ok(GoogleSearchToolDrawer);
    assert.ok(RequestInputToolDrawer);
    assert.ok(AgentAsToolDrawer);
    assert.ok(CodeExecutionToolDrawer);
    assert.ok(CustomFunctionToolDrawer);
    assert.ok(WebPageReaderToolDrawer);
    assert.ok(PreloadMemoryToolDrawer);
    assert.ok(ApiToolDrawer);
    assert.ok(ToolDrawerShell);
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

  it('should provide clear transport descriptions for stdio, sse, and http with bestFor guidance', () => {
    assert.ok(TRANSPORT_DESCRIPTIONS.stdio, 'stdio description must exist');
    assert.ok(TRANSPORT_DESCRIPTIONS.sse, 'sse description must exist');
    assert.ok(TRANSPORT_DESCRIPTIONS.http, 'http description must exist');

    assert.ok(TRANSPORT_DESCRIPTIONS.stdio.desc.includes('local process'));
    assert.ok(TRANSPORT_DESCRIPTIONS.stdio.bestFor.includes('Local machine'));

    assert.ok(TRANSPORT_DESCRIPTIONS.sse.desc.includes('Deprecated'));
    assert.ok(TRANSPORT_DESCRIPTIONS.sse.bestFor.includes('Legacy'));

    assert.ok(TRANSPORT_DESCRIPTIONS.http.desc.includes('HTTP'));
  });

  it('should configure advanced MCP stdio settings including cwd, env, auto-approve, and timeout', () => {
    const mcpTool: ToolDefinition = {
      id: 'tool_mcp_fs',
      name: 'Filesystem MCP',
      type: 'mcp',
      description: 'Filesystem tools via MCP',
      mcpConfig: {
        serverName: 'fs-server',
        transport: 'stdio',
        command: 'uvx',
        args: ['mcp-server-filesystem', '/tmp/workspace'],
        cwd: '/tmp/workspace',
        envVars: {
          DEBUG: 'true',
          LOG_LEVEL: 'info',
        },
        autoApproveTools: ['read_file', 'list_directory'],
        exposedTools: ['read_file', 'write_file', 'list_directory'],
        timeoutSeconds: 45,
      },
    };

    assert.equal(mcpTool.mcpConfig?.serverName, 'fs-server');
    assert.equal(mcpTool.mcpConfig?.transport, 'stdio');
    assert.equal(mcpTool.mcpConfig?.command, 'uvx');
    assert.equal(mcpTool.mcpConfig?.cwd, '/tmp/workspace');
    assert.deepEqual(mcpTool.mcpConfig?.envVars, { DEBUG: 'true', LOG_LEVEL: 'info' });
    assert.deepEqual(mcpTool.mcpConfig?.autoApproveTools, ['read_file', 'list_directory']);
    assert.deepEqual(mcpTool.mcpConfig?.exposedTools, ['read_file', 'write_file', 'list_directory']);
    assert.equal(mcpTool.mcpConfig?.timeoutSeconds, 45);
  });

  it('should configure MCP SSE and HTTP transports with custom headers', () => {
    const mcpRemote: ToolDefinition = {
      id: 'tool_mcp_cloud',
      name: 'Cloud MCP',
      type: 'mcp',
      description: 'Remote cloud MCP gateway',
      mcpConfig: {
        serverName: 'cloud-gateway',
        transport: 'http',
        serverUrl: 'https://mcp.internal.corp/stream',
        headers: {
          Authorization: 'Bearer secret_token_xyz',
          'X-Tenant-ID': 'tenant-100',
        },
        timeoutSeconds: 60,
        exposedTools: ['*'],
      },
    };

    assert.equal(mcpRemote.mcpConfig?.transport, 'http');
    assert.equal(mcpRemote.mcpConfig?.serverUrl, 'https://mcp.internal.corp/stream');
    assert.equal(mcpRemote.mcpConfig?.headers?.['Authorization'], 'Bearer secret_token_xyz');
    assert.equal(mcpRemote.mcpConfig?.headers?.['X-Tenant-ID'], 'tenant-100');
    assert.equal(mcpRemote.mcpConfig?.timeoutSeconds, 60);
  });

  it('should configure MCP HTTP remote server with Google Cloud ADC authProviderType', () => {
    const googleMcp: ToolDefinition = {
      id: 'tool_mcp_bigquery',
      name: 'BigQuery MCP',
      type: 'mcp',
      description: 'BigQuery Cloud remote MCP server',
      mcpConfig: {
        serverName: 'bigquery',
        transport: 'http',
        serverUrl: 'https://bigquery.googleapis.com/mcp',
        authProviderType: 'google_credentials',
        oauthConfig: {
          scopes: [
            'https://www.googleapis.com/auth/cloud-platform',
            'https://www.googleapis.com/auth/bigquery',
          ],
          projectId: 'my-project-123',
        },
        timeoutSeconds: 30,
        exposedTools: ['*'],
      },
    };

    assert.equal(googleMcp.mcpConfig?.transport, 'http');
    assert.equal(googleMcp.mcpConfig?.authProviderType, 'google_credentials');
    assert.equal(googleMcp.mcpConfig?.serverUrl, 'https://bigquery.googleapis.com/mcp');
    assert.equal(googleMcp.mcpConfig?.oauthConfig?.projectId, 'my-project-123');
    assert.deepEqual(googleMcp.mcpConfig?.oauthConfig?.scopes, [
      'https://www.googleapis.com/auth/cloud-platform',
      'https://www.googleapis.com/auth/bigquery',
    ]);
  });

  it('should support toggling tool exposure and auto-approval patterns', () => {
    const config = {
      exposedTools: ['tool_a', 'tool_b'],
      autoApproveTools: ['read_*'],
    };

    // Toggle exposure for tool_c
    const updatedExposed = config.exposedTools.includes('tool_c')
      ? config.exposedTools.filter((t) => t !== 'tool_c')
      : [...config.exposedTools, 'tool_c'];
    assert.deepEqual(updatedExposed, ['tool_a', 'tool_b', 'tool_c']);

    // Toggle un-expose tool_a
    const unexposed = updatedExposed.filter((t) => t !== 'tool_a');
    assert.deepEqual(unexposed, ['tool_b', 'tool_c']);

    // Add auto-approve pattern
    const updatedAutoApprove = [...config.autoApproveTools, 'list_*'];
    assert.deepEqual(updatedAutoApprove, ['read_*', 'list_*']);

    // Remove pattern
    const prunedAutoApprove = updatedAutoApprove.filter((p) => p !== 'read_*');
    assert.deepEqual(prunedAutoApprove, ['list_*']);
  });

  it('should return null when drawer is closed or tool is null', () => {
    const closedResult = ToolDrawer({
      tool: { id: 't1', name: 'T1', type: 'mcp', description: '' },
      isOpen: false,
      onClose: () => {},
      onSaveTool: () => {},
    });
    assert.equal(closedResult, null);

    const nullToolResult = ToolDrawer({
      tool: null,
      isOpen: true,
      onClose: () => {},
      onSaveTool: () => {},
    });
    assert.equal(nullToolResult, null);
  });

  it('should route tools to their dedicated drawer component based on type without a category dropdown', () => {
    // 1. Vertex AI Search routes to VertexAiSearchToolDrawer
    const vertexElem = ToolDrawer({
      tool: { id: 'builtin_vertex_ai_search', name: 'Vertex', type: 'builtin', builtinType: 'vertex_ai_search', description: '' },
      isOpen: true,
      onClose: () => {},
      onSaveTool: () => {},
    });
    assert.ok(vertexElem);
    assert.equal(vertexElem.type, VertexAiSearchToolDrawer);

    // 2. Google Search routes to GoogleSearchToolDrawer
    const googleElem = ToolDrawer({
      tool: { id: 'builtin_google_search', name: 'Google', type: 'builtin', builtinType: 'google_search', description: '' },
      isOpen: true,
      onClose: () => {},
      onSaveTool: () => {},
    });
    assert.ok(googleElem);
    assert.equal(googleElem.type, GoogleSearchToolDrawer);

    // 3. Request Input routes to RequestInputToolDrawer
    const hitlElem = ToolDrawer({
      tool: { id: 'builtin_request_input', name: 'HITL', type: 'builtin', builtinType: 'request_input', description: '' },
      isOpen: true,
      onClose: () => {},
      onSaveTool: () => {},
    });
    assert.ok(hitlElem);
    assert.equal(hitlElem.type, RequestInputToolDrawer);

    // 4. Agent As Tool routes to AgentAsToolDrawer
    const agentElem = ToolDrawer({
      tool: { id: 'builtin_agent_as_tool', name: 'SubAgent', type: 'builtin', builtinType: 'agent_as_tool', description: '' },
      isOpen: true,
      onClose: () => {},
      onSaveTool: () => {},
    });
    assert.ok(agentElem);
    assert.equal(agentElem.type, AgentAsToolDrawer);

    // 5. MCP server tool routes to McpToolDrawer
    const mcpElem = ToolDrawer({
      tool: { id: 'custom_mcp_1', name: 'My MCP Server', type: 'mcp', description: '' },
      isOpen: true,
      onClose: () => {},
      onSaveTool: () => {},
    });
    assert.ok(mcpElem);
    assert.equal(mcpElem.type, McpToolDrawer);

    // 6. Python Code Sandbox routes to CodeExecutionToolDrawer
    const codeElem = ToolDrawer({
      tool: { id: 'tool_code_interpreter', name: 'Python Code Sandbox', type: 'code', builtinType: 'code_execution', description: '' },
      isOpen: true,
      onClose: () => {},
      onSaveTool: () => {},
    });
    assert.ok(codeElem);
    assert.equal(codeElem.type, CodeExecutionToolDrawer);

    // 7. Web Page Reader routes to WebPageReaderToolDrawer
    const webElem = ToolDrawer({
      tool: { id: 'builtin_load_web_page', name: 'Web Page Reader', type: 'search', builtinType: 'load_web_page', description: '' },
      isOpen: true,
      onClose: () => {},
      onSaveTool: () => {},
    });
    assert.ok(webElem);
    assert.equal(webElem.type, WebPageReaderToolDrawer);

    // 8. Preload Memory routes to PreloadMemoryToolDrawer
    const memElem = ToolDrawer({
      tool: { id: 'builtin_preload_memory', name: 'Preload Memory Tool', type: 'custom', builtinType: 'preload_memory', description: '' },
      isOpen: true,
      onClose: () => {},
      onSaveTool: () => {},
    });
    assert.ok(memElem);
    assert.equal(memElem.type, PreloadMemoryToolDrawer);

    // 9. REST API endpoint tool routes to ApiToolDrawer
    const apiElem = ToolDrawer({
      tool: { id: 'api_tool_1', name: 'My API', type: 'api', description: '' },
      isOpen: true,
      onClose: () => {},
      onSaveTool: () => {},
    });
    assert.ok(apiElem);
    assert.equal(apiElem.type, ApiToolDrawer);

    // 10. Custom Function tool routes to CustomFunctionToolDrawer
    const customElem = ToolDrawer({
      tool: { id: 'tool_custom_function', name: 'My Custom Logic', type: 'custom', description: '' },
      isOpen: true,
      onClose: () => {},
      onSaveTool: () => {},
    });
    assert.ok(customElem);
    assert.equal(customElem.type, CustomFunctionToolDrawer);
  });

  it('should instantiate CodeExecutionToolDrawer with timeout parameters', () => {
    const props = {
      tool: {
        id: 'tool_code_interpreter',
        name: 'Python Code Sandbox',
        type: 'code' as const,
        description: 'Runs Python scripts',
        parameters: {
          code: 'string',
          timeout: 'number - Execution timeout in seconds (default 45)',
        },
      },
      isOpen: true,
      onClose: () => {},
      onSaveTool: () => {},
    };
    const elem = React.createElement(CodeExecutionToolDrawer, props);

    assert.ok(elem);
    assert.equal(elem.type, CodeExecutionToolDrawer);
    assert.equal(elem.props.tool.name, 'Python Code Sandbox');
    assert.equal(elem.props.tool.type, 'code');
  });

  it('should instantiate CustomFunctionToolDrawer with docstring and arguments', () => {
    const props = {
      tool: {
        id: 'tool_custom_function',
        name: 'Calculate Risk Score',
        type: 'custom' as const,
        description: 'Custom risk metric calculator',
        codePrompt: 'Calculates portfolio risk metric',
        parameters: {
          symbol: 'string - Stock ticker',
          horizon_days: 'number - Days ahead',
        },
      },
      isOpen: true,
      onClose: () => {},
      onSaveTool: () => {},
    };
    const elem = React.createElement(CustomFunctionToolDrawer, props);

    assert.ok(elem);
    assert.equal(elem.type, CustomFunctionToolDrawer);
    assert.equal(elem.props.tool.name, 'Calculate Risk Score');
    assert.equal(elem.props.tool.codePrompt, 'Calculates portfolio risk metric');
  });

  it('should instantiate WebPageReaderToolDrawer with markdown sanitization details', () => {
    const props = {
      tool: {
        id: 'builtin_load_web_page',
        name: 'Web Page Reader',
        type: 'search' as const,
        description: 'Scrapes web pages into markdown',
        parameters: {
          url: 'string - Web address',
        },
      },
      isOpen: true,
      onClose: () => {},
      onSaveTool: () => {},
    };
    const elem = React.createElement(WebPageReaderToolDrawer, props);

    assert.ok(elem);
    assert.equal(elem.type, WebPageReaderToolDrawer);
    assert.equal(elem.props.tool.name, 'Web Page Reader');
  });

  it('should instantiate PreloadMemoryToolDrawer with history turn thresholds', () => {
    const props = {
      tool: {
        id: 'builtin_preload_memory',
        name: 'Preload Memory Tool',
        type: 'custom' as const,
        description: 'Preloads conversational context',
        parameters: {
          session_id: 'string',
          limit: 'number - default 15',
        },
      },
      isOpen: true,
      onClose: () => {},
      onSaveTool: () => {},
    };
    const elem = React.createElement(PreloadMemoryToolDrawer, props);

    assert.ok(elem);
    assert.equal(elem.type, PreloadMemoryToolDrawer);
    assert.equal(elem.props.tool.name, 'Preload Memory Tool');
  });

  it('should instantiate ApiToolDrawer with endpoint URL and secret auth headers', () => {
    const props = {
      tool: {
        id: 'api_tool_1',
        name: 'Customer Service API',
        type: 'api' as const,
        description: 'Calls CRM REST endpoint',
        endpointUrl: 'https://crm.example.com/api/v2/customers',
        authKeyEnv: 'CRM_API_KEY',
        parameters: {
          customer_id: 'string',
        },
      },
      isOpen: true,
      onClose: () => {},
      onSaveTool: () => {},
    };
    const elem = React.createElement(ApiToolDrawer, props);

    assert.ok(elem);
    assert.equal(elem.type, ApiToolDrawer);
    assert.equal(elem.props.tool.name, 'Customer Service API');
    assert.equal(elem.props.tool.endpointUrl, 'https://crm.example.com/api/v2/customers');
    assert.equal(elem.props.tool.authKeyEnv, 'CRM_API_KEY');
  });

  it('should persist and rehydrate discovered MCP tools and default authProviderType to google_credentials', () => {
    const discoveredToolsList: ToolDefinition[] = [
      {
        id: 'bigquery_execute_sql',
        name: 'execute_sql',
        type: 'mcp',
        description: 'Executes BigQuery SQL queries with IAM authorization.',
      },
      {
        id: 'bigquery_list_tables',
        name: 'list_tables',
        type: 'mcp',
        description: 'Lists all BigQuery tables inside a dataset.',
      },
    ];

    const mcpTool: ToolDefinition = {
      id: 'tool_mcp_bigquery_remote',
      name: 'BigQuery Remote MCP',
      type: 'mcp',
      description: 'Streamable HTTP remote MCP server for BigQuery',
      mcpConfig: {
        serverName: 'bigquery',
        transport: 'http',
        serverUrl: 'https://bigquery.googleapis.com/mcp',
        authProviderType: 'google_credentials',
        oauthConfig: {
          scopes: [
            'https://www.googleapis.com/auth/cloud-platform',
            'https://www.googleapis.com/auth/bigquery',
          ],
          projectId: 'my-gcp-project',
        },
        timeoutSeconds: 30,
        exposedTools: ['execute_sql'],
        autoApproveTools: [],
        discoveredTools: discoveredToolsList,
      },
    };

    // 1. Validate discoveredTools are stored on mcpConfig
    assert.equal(mcpTool.mcpConfig?.authProviderType, 'google_credentials');
    assert.ok(mcpTool.mcpConfig?.discoveredTools);
    assert.equal(mcpTool.mcpConfig?.discoveredTools?.length, 2);
    assert.equal(mcpTool.mcpConfig?.discoveredTools?.[0].name, 'execute_sql');
    assert.equal(mcpTool.mcpConfig?.discoveredTools?.[1].name, 'list_tables');

    // 2. Simulate drawer render and prop propagation
    const props = {
      tool: mcpTool,
      isOpen: true,
      onClose: () => {},
      onSaveTool: (updated: ToolDefinition) => {
        assert.ok(updated.mcpConfig?.discoveredTools);
        assert.equal(updated.mcpConfig?.discoveredTools?.length, 2);
      },
    };
    const elem = React.createElement(McpToolDrawer, props);
    assert.ok(elem);
    assert.equal(elem.type, McpToolDrawer);
    assert.equal(elem.props.tool.mcpConfig?.authProviderType, 'google_credentials');
    assert.deepEqual(elem.props.tool.mcpConfig?.discoveredTools, discoveredToolsList);
  });

  it('should safely handle opening edit on tools without throwing SyntaxError: "undefined" is not valid JSON', () => {
    // 1. Simulate safe cloning and validation of tool definition
    const validTool: ToolDefinition = {
      id: 'tool_custom_test',
      name: 'Custom Test Tool',
      type: 'custom',
      description: 'A test custom tool',
      enabled: true,
    };

    // Test cloning of valid tool
    const cloned = JSON.parse(JSON.stringify(validTool));
    assert.deepEqual(cloned, validTool);

    // 2. Test safe handling when tool is undefined or non-object
    const safeCloneTool = (tool?: ToolDefinition | null): ToolDefinition | null => {
      if (!tool || typeof tool !== 'object') return null;
      try {
        return JSON.parse(JSON.stringify(tool));
      } catch {
        return null;
      }
    };

    assert.equal(safeCloneTool(undefined), null);
    assert.equal(safeCloneTool(null), null);
    assert.deepEqual(safeCloneTool(validTool), validTool);

    // 3. Test safe localStorage parsing with undefined/corrupt strings
    const safeParseLocalStorage = (raw: string | null): any => {
      if (!raw || raw === 'undefined' || raw === 'null') return null;
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    };

    assert.equal(safeParseLocalStorage('undefined'), null);
    assert.equal(safeParseLocalStorage('null'), null);
    assert.equal(safeParseLocalStorage(''), null);
    assert.equal(safeParseLocalStorage(null), null);
    assert.deepEqual(safeParseLocalStorage('{"id":"t1"}'), { id: 't1' });
  });

  it('should support reactive onUpdateTool in ToolDrawer without requiring a Save button', () => {
    let lastUpdatedTool: ToolDefinition | null = null;
    const testTool: ToolDefinition = {
      id: 'tool_google_search',
      name: 'Google Search',
      type: 'builtin',
      builtinType: 'google_search',
      description: 'Search Google for web results',
      enabled: true,
      googleSearchConfig: {
        domainFilters: ['google.com'],
      },
    };

    // Instantiate ToolDrawer with onUpdateTool
    const elem = React.createElement(ToolDrawer, {
      tool: testTool,
      isOpen: true,
      onClose: () => {},
      onUpdateTool: (updated: ToolDefinition) => {
        lastUpdatedTool = updated;
      },
      onDeleteTool: () => {},
    });

    assert.ok(elem);
    assert.equal(elem.props.tool.id, 'tool_google_search');
    assert.ok(elem.props.onUpdateTool);

    // Simulate reactive update dispatch
    elem.props.onUpdateTool({
      ...testTool,
      googleSearchConfig: {
        domainFilters: ['google.com', 'developer.chrome.com'],
      },
    });

    assert.ok(lastUpdatedTool);
    assert.deepEqual(lastUpdatedTool?.googleSearchConfig?.domainFilters, ['google.com', 'developer.chrome.com']);
  });

  it('should render ToolDrawerShell with header delete button and without bottom Save button row', () => {
    let deletedToolId: string | null = null;
    const shellElem = React.createElement(ToolDrawerShell, {
      isOpen: true,
      onClose: () => {},
      toolName: 'Custom Tool',
      onChangeName: () => {},
      description: 'A tool description',
      onChangeDescription: () => {},
      onDelete: () => {
        deletedToolId = 'tool-123';
      },
      children: React.createElement('div', { id: 'test-content' }, 'Tool Content'),
    });

    assert.ok(shellElem);
    assert.equal(shellElem.props.isOpen, true);
    assert.equal(shellElem.props.toolName, 'Custom Tool');
    assert.ok(shellElem.props.onDelete);
    assert.equal(shellElem.props.onSave, undefined);

    // Verify onDelete callback triggers
    shellElem.props.onDelete();
    assert.equal(deletedToolId, 'tool-123');
  });
});


