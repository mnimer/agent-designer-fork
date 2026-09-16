/**
 * Unit Tests for Cross-Harness Tool Adapter Compiler
 *
 * Validates Python code generation for both:
 * 1. Google ADK (Python):
 *    - GoogleSearchTool
 *    - VertexAiSearchTool (location="global")
 *    - load_web_page
 *    - request_input
 *    - PreloadMemoryTool
 *    - CodeExecutionTool
 *    - AgentTool
 *    - McpClientTool (stdio & SSE)
 *    - Custom Python functions & tools list assembly
 * 2. LangGraph (Python):
 *    - DuckDuckGoSearchRun / search tools
 *    - VertexAISearchRetriever (location="global")
 *    - WebBaseLoader tool
 *    - Human interrupt tool (langgraph.types.interrupt)
 *    - PythonREPL execution tool
 *    - Sub-agent invocation tool
 *    - Custom @tool decorated functions
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { 
  compileTools, 
  ToolAdapterCompiler, 
  sanitizePythonIdentifier 
} from '../../../src/shared/codegen/toolAdapters';
import { ToolDefinition } from '../../../src/shared/types';
import { BUILTIN_ADK_TOOLS } from '../../../src/webview/data/builtinTools';

describe('Tool Adapter Compiler', () => {
  describe('Identifier Sanitization', () => {
    it('should sanitize names with spaces, special characters, and leading numbers', () => {
      assert.equal(sanitizePythonIdentifier('Search API!'), 'search_api');
      assert.equal(sanitizePythonIdentifier('123-start-agent'), 'tool_123_start_agent');
      assert.equal(sanitizePythonIdentifier('google_search'), 'google_search');
      assert.equal(sanitizePythonIdentifier('__invalid__'), 'invalid');
      assert.equal(sanitizePythonIdentifier(''), 'custom_tool');
    });
  });

  describe('Google ADK (Python) Compilation', () => {
    it('should compile Google Search Grounding with and without domain filters', () => {
      const searchTool: ToolDefinition = {
        id: 'search_1',
        name: 'Google Search Grounding',
        type: 'search',
        builtinType: 'google_search',
        googleSearchConfig: {
          domainFilters: ['cloud.google.com', 'ai.google.dev'],
          dynamicThreshold: 0.4,
        },
      };

      const result = compileTools([searchTool], 'google-adk');
      assert.ok(result.imports.some((i) => i.includes('from google.adk.tools.google_search_tool import GoogleSearchTool')));
      assert.ok(result.toolDefinitions.some((inst) => 
        inst.includes("GoogleSearchTool(") &&
        inst.includes("bypass_multi_tools_limit=True") &&
        inst.includes('cloud.google.com') &&
        inst.includes('ai.google.dev')
      ));
      assert.ok(result.toolBindings.includes('google_search_grounding_tool'));
    });

    it('should compile Google Search singleton when domain filters are omitted', () => {
      const searchTool: ToolDefinition = {
        id: 'search_default',
        name: 'Google Search',
        type: 'search',
        builtinType: 'google_search',
      };

      const result = compileTools([searchTool], 'google-adk');
      assert.ok(result.imports.some((i) => i.includes('from google.adk.tools import google_search')));
      assert.ok(result.toolDefinitions.some((d) => d.includes('google_search_tool = google_search')));
      assert.ok(result.toolBindings.includes('google_search_tool'));
    });

    it('should compile Vertex AI Search with dataStoreId, project, location="global", and maxResults', () => {
      const vertexTool: ToolDefinition = {
        id: 'vertex_1',
        name: 'Product Knowledge Base',
        type: 'rag',
        builtinType: 'vertex_ai_search',
        vertexAiSearchConfig: {
          dataStoreId: 'ecommerce-catalog-v1',
          projectId: 'my-gcp-project',
          location: 'global',
          maxResults: 8,
        },
      };

      const result = compileTools([vertexTool], 'google-adk');
      assert.ok(result.imports.some((i) => i.includes('from google.adk.tools import VertexAiSearchTool')));
      assert.ok(result.toolDefinitions.some((inst) => 
        inst.includes("VertexAiSearchTool(") &&
        inst.includes('ecommerce-catalog-v1') &&
        inst.includes('location="global"') &&
        inst.includes('max_results=8')
      ));
      assert.ok(result.toolBindings.includes('product_knowledge_base_tool'));
    });

    it('should compile Web Page Reader function tool', () => {
      const webTool: ToolDefinition = {
        id: 'web_reader',
        name: 'Web Page Reader',
        type: 'search',
        builtinType: 'load_web_page',
      };

      const result = compileTools([webTool], 'google-adk');
      assert.ok(result.imports.some((i) => i.includes('from google.adk.tools import load_web_page')));
      assert.ok(result.toolBindings.includes('load_web_page'));
    });

    it('should compile Human-in-the-Loop Clarification request_input tool', () => {
      const hitlTool: ToolDefinition = {
        id: 'clarify_1',
        name: 'User Clarification',
        type: 'custom',
        builtinType: 'request_input',
        requestInputConfig: {
          prompt: 'Please verify order details:',
          timeoutSeconds: 120,
        },
      };

      const result = compileTools([hitlTool], 'google-adk');
      assert.ok(result.imports.some((i) => i.includes('from google.adk.tools import request_input')));
      assert.ok(result.toolBindings.includes('request_input'));
    });

    it('should compile PreloadMemoryTool', () => {
      const memoryTool: ToolDefinition = {
        id: 'mem_1',
        name: 'Session Memory',
        type: 'custom',
        builtinType: 'preload_memory',
      };

      const result = compileTools([memoryTool], 'google-adk');
      assert.ok(result.imports.some((i) => i.includes('from google.adk.tools import PreloadMemoryTool')));
      assert.ok(result.toolDefinitions.some((inst) => inst.includes('session_memory_tool = PreloadMemoryTool()')));
      assert.ok(result.toolBindings.includes('session_memory_tool'));
    });

    it('should compile Sandboxed CodeExecutionTool', () => {
      const codeTool: ToolDefinition = {
        id: 'code_sandbox',
        name: 'Python Code Sandbox',
        type: 'code',
        builtinType: 'code_execution',
      };

      const result = compileTools([codeTool], 'google-adk');
      assert.ok(result.imports.some((i) => i.includes('from google.adk.tools import CodeExecutionTool')));
      assert.ok(result.toolDefinitions.some((inst) => inst.includes('python_code_sandbox_tool = CodeExecutionTool()')));
      assert.ok(result.toolBindings.includes('python_code_sandbox_tool'));
    });

    it('should compile Sub-Agent as a Tool wrapper (agent_as_tool)', () => {
      const subAgentTool: ToolDefinition = {
        id: 'sub_analyst',
        name: 'Data Analyst Agent Tool',
        type: 'custom',
        builtinType: 'agent_as_tool',
        agentAsToolConfig: {
          subAgentName: 'agent_analyst_01',
          description: 'Delegates complex financial calculations to specialist agent.',
        },
      };

      const result = compileTools([subAgentTool], 'google-adk');
      assert.ok(result.imports.some((i) => i.includes('from google.adk.tools import AgentTool')));
      assert.ok(result.toolDefinitions.some((inst) => 
        inst.includes("AgentTool(") &&
        inst.includes("agent=agent_analyst_01")
      ));
      assert.ok(result.toolBindings.includes('data_analyst_agent_tool_tool'));
    });

    it('should compile MCP Client Tool with stdio transport', () => {
      const mcpTool: ToolDefinition = {
        id: 'mcp_git',
        name: 'GitHub MCP Client',
        type: 'mcp',
        mcpConfig: {
          serverName: 'github-mcp',
          transport: 'stdio',
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-github'],
        },
      };

      const result = compileTools([mcpTool], 'google-adk');
      assert.ok(result.imports.some((i) => i.includes('from google.adk.tools.mcp import McpClientTool')));
      assert.ok(result.toolDefinitions.some((inst) => 
        inst.includes('McpClientTool(') &&
        inst.includes('command="npx"') &&
        inst.includes('name="github-mcp"')
      ));
      assert.ok(result.toolBindings.includes('github_mcp_client_tool'));
    });

    it('should compile MCP Client Tool with full configuration (cwd, env, timeout, tools, auto-approve)', () => {
      const advancedMcpTool: ToolDefinition = {
        id: 't_mcp_advanced',
        name: 'Database MCP',
        type: 'mcp',
        mcpConfig: {
          serverName: 'postgres-db',
          transport: 'stdio',
          command: 'uvx',
          args: ['mcp-server-postgres'],
          cwd: '/workspace/db',
          envVars: { DB_PORT: '5432' },
          timeoutSeconds: 45,
          exposedTools: ['read_query', 'list_tables'],
          autoApproveTools: ['read_query'],
        },
      };

      const result = compileTools([advancedMcpTool], 'google-adk');
      const def = result.toolDefinitions.find((d) => d.includes('database_mcp_tool'));
      assert.ok(def, 'Should generate database_mcp_tool');
      assert.ok(def.includes('name="postgres-db"'));
      assert.ok(def.includes('transport="stdio"'));
      assert.ok(def.includes('command="uvx"'));
      assert.ok(def.includes('cwd="/workspace/db"'));
      assert.ok(def.includes('env={"DB_PORT": "5432"}'));
      assert.ok(def.includes('timeout=45'));
      assert.ok(def.includes('tools=["read_query", "list_tables"]'));
      assert.ok(def.includes('auto_approve_tools=["read_query"]'));
    });

    it('should compile MCP Client Tool with SSE transport and custom headers', () => {
      const sseMcpTool: ToolDefinition = {
        id: 't_mcp_sse',
        name: 'Remote Search MCP',
        type: 'mcp',
        mcpConfig: {
          serverName: 'remote-search',
          transport: 'sse',
          serverUrl: 'https://mcp.internal.example/sse',
          headers: { 'X-Custom-Auth': 'secret-token' },
          timeoutSeconds: 20,
        },
      };

      const result = compileTools([sseMcpTool], 'google-adk');
      const def = result.toolDefinitions.find((d) => d.includes('remote_search_mcp_tool'));
      assert.ok(def, 'Should generate remote_search_mcp_tool');
      assert.ok(def.includes('name="remote-search"'));
      assert.ok(def.includes('transport="sse"'));
      assert.ok(def.includes('url="https://mcp.internal.example/sse"'));
      assert.ok(def.includes('headers={"X-Custom-Auth": "secret-token"}'));
      assert.ok(def.includes('timeout=20'));
    });

    it('should compile MCP Client Tool with Google Cloud ADC authProviderType and auto-refreshing OAuth tokens', () => {
      const googleMcpTool: ToolDefinition = {
        id: 't_mcp_bigquery',
        name: 'BigQuery MCP',
        type: 'mcp',
        mcpConfig: {
          serverName: 'bigquery-server',
          transport: 'http',
          serverUrl: 'https://bigquery.googleapis.com/mcp',
          authProviderType: 'google_credentials',
          oauthConfig: {
            scopes: [
              'https://www.googleapis.com/auth/cloud-platform',
              'https://www.googleapis.com/auth/bigquery',
            ],
            projectId: 'my-production-project',
          },
          timeoutSeconds: 30,
        },
      };

      const result = compileTools([googleMcpTool], 'google-adk');
      assert.ok(result.imports.some((i) => i.includes('import google.auth')));
      assert.ok(result.imports.some((i) => i.includes('from google.auth.transport.requests import Request as GoogleAuthRequest')));

      const headerFnDef = result.toolDefinitions.find((d) => d.includes('def _get_bigquery_mcp_tool_headers():'));
      assert.ok(headerFnDef, 'Should generate header resolution function');
      assert.ok(headerFnDef.includes('google.auth.default(scopes='));
      assert.ok(headerFnDef.includes('credentials.refresh(GoogleAuthRequest())'));
      assert.ok(headerFnDef.includes('"my-production-project"'));

      const toolDef = result.toolDefinitions.find((d) => d.includes('bigquery_mcp_tool = McpClientTool('));
      assert.ok(toolDef, 'Should instantiate bigquery_mcp_tool');
      assert.ok(toolDef.includes('url="https://bigquery.googleapis.com/mcp"'));
      assert.ok(toolDef.includes('headers=_get_bigquery_mcp_tool_headers()'));
      assert.ok(result.toolBindings.includes('bigquery_mcp_tool'));
    });

    it('should compile MCP Client Tool with Bearer token and Secret Manager envVar resolution', () => {
      const slackMcpTool: ToolDefinition = {
        id: 't_mcp_slack',
        name: 'Slack MCP',
        type: 'mcp',
        mcpConfig: {
          serverName: 'slack-server',
          transport: 'http',
          serverUrl: 'https://gateway.mcpservers.org/slack/mcp',
          authProviderType: 'bearer_token',
          secretConfig: {
            secretName: 'slack-bot-token',
            envVar: 'SLACK_BOT_TOKEN',
            hasToken: true,
          },
        },
      };

      const result = compileTools([slackMcpTool], 'google-adk');
      assert.ok(result.imports.some((i) => i.includes('import os')));

      const headerFn = result.toolDefinitions.find((d) => d.includes('def _get_slack_mcp_tool_headers():'));
      assert.ok(headerFn, 'Should generate header function resolving os.environ');
      assert.ok(headerFn.includes('os.environ.get("SLACK_BOT_TOKEN", "")'));
      assert.ok(headerFn.includes('"Authorization": f"Bearer {token}"'));
      assert.ok(headerFn.includes('"Accept": "application/json, text/event-stream"'));

      const toolDef = result.toolDefinitions.find((d) => d.includes('slack_mcp_tool = McpClientTool('));
      assert.ok(toolDef, 'Should instantiate slack_mcp_tool');
      assert.ok(toolDef.includes('headers=_get_slack_mcp_tool_headers()'));
      assert.ok(result.toolBindings.includes('slack_mcp_tool'));
    });

    it('should compile REST API tool with async httpx client and GET query params', () => {
      const restTool: ToolDefinition = {
        id: 'cust_crm_api',
        name: 'CRM Customer Query',
        type: 'api',
        httpMethod: 'GET',
        endpointUrl: 'https://crm.example.com/api/v1/customers',
        authKeyEnv: 'CRM_API_TOKEN',
        timeoutSeconds: 15,
        parameters: {
          customer_id: 'ID of the customer',
          status: 'Active status',
        },
      };

      const result = compileTools([restTool], 'google-adk');
      assert.ok(result.imports.some((i) => i.includes('import httpx')));
      assert.ok(result.imports.some((i) => i.includes('import os')));

      const def = result.toolDefinitions.find((d) => d.includes('async def crm_customer_query'));
      assert.ok(def, 'Should generate async function for REST tool');
      assert.ok(def.includes('url = "https://crm.example.com/api/v1/customers"'));
      assert.ok(def.includes('method="GET"'));
      assert.ok(def.includes('params=data_map'));
      assert.ok(def.includes('httpx.AsyncClient(timeout=15.0)'));
      assert.ok(def.includes('token = os.environ.get("CRM_API_TOKEN", "")'));
      assert.ok(def.includes('headers["Authorization"] = f"Bearer {token}"'));
      assert.ok(result.toolBindings.includes('crm_customer_query'));
    });

    it('should compile REST API tool with POST JSON body and Secret Manager fallback', () => {
      const postTool: ToolDefinition = {
        id: 'send_order_api',
        name: 'Submit Order API',
        type: 'api',
        httpMethod: 'POST',
        endpointUrl: 'https://orders.example.com/v2/orders',
        secretManagerKey: 'projects/my-proj/secrets/orders-secret/versions/latest',
        headers: {
          'X-Tenant-Id': 'tenant-999',
        },
        parameters: {
          sku: 'Product SKU',
          quantity: 'Quantity count',
        },
      };

      const result = compileTools([postTool], 'google-adk');
      const def = result.toolDefinitions.find((d) => d.includes('async def submit_order_api'));
      assert.ok(def, 'Should generate async submit_order_api');
      assert.ok(def.includes('method="POST"'));
      assert.ok(def.includes('json=data_map'));
      assert.ok(def.includes('"X-Tenant-Id": "tenant-999"'));
      assert.ok(def.includes('projects/my-proj/secrets/orders-secret/versions/latest'));
      assert.ok(result.toolBindings.includes('submit_order_api'));
    });

    it('should compile custom Python functions with docstrings and typed signatures', () => {
      const customTool: ToolDefinition = {
        id: 'cust_weather',
        name: 'Get Weather Forecast',
        type: 'custom',
        description: 'Fetch real-time weather given a city and days.',
        parameters: [
          { name: 'city', type: 'string', required: true, description: 'City name' },
          { name: 'days', type: 'number', required: false, description: 'Number of forecast days' },
        ],
      };

      const result = compileTools([customTool], 'google-adk');
      assert.ok(result.toolDefinitions.some((def) => 
        def.includes('def get_weather_forecast(') &&
        def.includes('Fetch real-time weather given a city and days.')
      ));
      assert.ok(result.toolBindings.includes('get_weather_forecast'));
    });

    it('should compile local Python file tools with relative sourceFile into module imports (Google ADK)', () => {
      const localTool: ToolDefinition = {
        id: 'cust_triage',
        name: 'Triage Query Tool',
        type: 'custom',
        toolMode: 'local_file',
        sourceFile: './tools/triage_tools.py',
        functionName: 'triage_query_tool',
      };

      const result = compileTools([localTool], 'google-adk');
      assert.ok(result.imports.some((i) => i.includes('from tools.triage_tools import triage_query_tool')));
      assert.ok(result.toolBindings.includes('triage_query_tool'));
    });

    it('should compile AI generated tools with custom codeSnippet (Google ADK)', () => {
      const aiTool: ToolDefinition = {
        id: 'cust_ai_calc',
        name: 'calculate_tax',
        type: 'custom',
        toolMode: 'ai_generated',
        codeSnippet: 'def calculate_tax(amount: float) -> float:\n    """Calculates tax rate."""\n    return amount * 0.08',
      };

      const result = compileTools([aiTool], 'google-adk');
      assert.ok(result.toolDefinitions.some((d) => d.includes('def calculate_tax(amount: float) -> float:')));
      assert.ok(result.toolBindings.includes('calculate_tax'));
    });

    it('should exclude disabled tools from the generated toolBindings list', () => {
      const tools: ToolDefinition[] = [
        { id: 't1', name: 'Enabled Search', type: 'search', builtinType: 'google_search', isEnabled: true },
        { id: 't2', name: 'Disabled Vertex', type: 'rag', builtinType: 'vertex_ai_search', isEnabled: false },
      ];

      const result = compileTools(tools, 'google-adk');
      assert.ok(result.toolBindings.includes('enabled_search_tool'));
      assert.ok(!result.toolBindings.includes('disabled_vertex_tool'));
    });

    it('should compile full ADK Python code block including tools=[...] array', () => {
      const result = compileTools(BUILTIN_ADK_TOOLS, 'google-adk');
      assert.ok(result.fullCodeSnippet.includes('# --- Google ADK Tool Imports ---'));
      assert.ok(result.fullCodeSnippet.includes('tools = ['));
      assert.ok(result.fullCodeSnippet.includes('google_search'));
      assert.ok(result.fullCodeSnippet.includes('VertexAiSearchTool('));
    });
  });

  describe('LangGraph (Python) Compilation', () => {
    it('should compile LangGraph tools with @tool decorators, DuckDuckGo, and VertexAISearchRetriever', () => {
      const tools: ToolDefinition[] = [
        {
          id: 'lg_search',
          name: 'Web Search',
          type: 'search',
          builtinType: 'google_search',
        },
        {
          id: 'lg_vertex',
          name: 'Enterprise Search',
          type: 'rag',
          builtinType: 'vertex_ai_search',
          vertexAiSearchConfig: {
            dataStoreId: 'internal-wiki',
            location: 'global',
            project: 'company-gcp',
          },
        },
        {
          id: 'lg_code',
          name: 'Code Sandbox',
          type: 'code',
          builtinType: 'code_execution',
        },
        {
          id: 'lg_hitl',
          name: 'Human Clarification',
          type: 'custom',
          builtinType: 'request_input',
        },
      ];

      const result = compileTools(tools, 'langgraph');

      // Imports
      assert.ok(result.imports.some((i) => i.includes('from langchain_core.tools import tool')));
      assert.ok(result.imports.some((i) => i.includes('from langchain_community.tools import DuckDuckGoSearchRun')));
      assert.ok(result.imports.some((i) => i.includes('from langchain_google_community import VertexAISearchRetriever')));
      assert.ok(result.imports.some((i) => i.includes('from langgraph.types import interrupt')));

      // Tool instances & decorators
      assert.ok(result.toolDefinitions.some((inst) => inst.includes('web_search_tool = DuckDuckGoSearchRun()')));
      assert.ok(result.toolDefinitions.some((inst) => 
        inst.includes("VertexAISearchRetriever(") &&
        inst.includes('data_store_id="internal-wiki"') &&
        inst.includes('location_id="global"')
      ));
      assert.ok(result.toolDefinitions.some((def) => 
        def.includes('@tool') &&
        def.includes('def request_human_clarification(query_or_prompt: str) -> str:') &&
        def.includes('return interrupt(')
      ));

      // Tool bindings
      assert.ok(result.toolBindings.includes('web_search_tool'));
      assert.ok(result.toolBindings.includes('enterprise_search_tool'));
      assert.ok(result.toolBindings.includes('execute_python_code'));
      assert.ok(result.toolBindings.includes('request_human_clarification'));
      assert.ok(result.fullCodeSnippet.includes('tools = ['));
    });

    it('should compile MCP Client Tool for LangGraph with Google Cloud ADC authentication', () => {
      const gcpMcpTool: ToolDefinition = {
        id: 'gcp_mcp_alloydb',
        name: 'AlloyDB MCP',
        type: 'mcp',
        category: 'google_cloud_mcp',
        description: 'Google Cloud AlloyDB MCP Server',
        mcpConfig: {
          serverName: 'alloydb-mcp',
          transport: 'http',
          serverUrl: 'https://alloydb.googleapis.com/mcp',
          authProviderType: 'google_credentials',
          oauthConfig: {
            scopes: ['https://www.googleapis.com/auth/cloud-platform'],
            projectId: 'my-genai-project',
          },
          timeoutSeconds: 30,
        },
      };

      const result = compileTools([gcpMcpTool], 'langgraph');
      assert.ok(result.imports.some((i) => i.includes('import requests')));
      assert.ok(result.imports.some((i) => i.includes('import google.auth')));
      assert.ok(result.imports.some((i) => i.includes('from google.auth.transport.requests import Request as GoogleAuthRequest')));

      const def = result.toolDefinitions.find((d) => d.includes('alloydb_mcp_tool'));
      assert.ok(def, 'Should generate alloydb_mcp_tool');
      assert.ok(def.includes('_get_alloydb_mcp_tool_token'));
      assert.ok(def.includes('https://alloydb.googleapis.com/mcp'));
      assert.ok(def.includes('Authorization'));
      assert.ok(def.includes('x-goog-user-project'));
      assert.ok(result.toolBindings.includes('alloydb_mcp_tool'));
    });

    it('should compile MCP Client Tool for LangGraph with Bearer token environment resolution', () => {
      const yahooTool: ToolDefinition = {
        id: 't_mcp_yahoo',
        name: 'Yahoo Finance MCP',
        type: 'mcp',
        mcpConfig: {
          serverName: 'yahoo-finance',
          transport: 'http',
          serverUrl: 'https://gateway.mcpservers.org/yahoo-finance/mcp',
          authProviderType: 'bearer_token',
          secretConfig: {
            secretName: 'yahoo-finance-token',
            envVar: 'YAHOO_FINANCE_TOKEN',
            hasToken: true,
          },
        },
      };

      const result = compileTools([yahooTool], 'langgraph');
      assert.ok(result.imports.some((i) => i.includes('import os')));
      assert.ok(result.imports.some((i) => i.includes('import requests')));

      const def = result.toolDefinitions.find((d) => d.includes('yahoo_finance_mcp_tool'));
      assert.ok(def, 'Should generate yahoo_finance_mcp_tool function');
      assert.ok(def.includes('os.environ.get("YAHOO_FINANCE_TOKEN", "")'));
      assert.ok(def.includes('"Authorization": f"Bearer {token}"'));
      assert.ok(def.includes('https://gateway.mcpservers.org/yahoo-finance/mcp'));
      assert.ok(result.toolBindings.includes('yahoo_finance_mcp_tool'));
    });

    it('should compile REST API tool with @tool decorator and async httpx client for LangGraph', () => {
      const restTool: ToolDefinition = {
        id: 'lg_weather_api',
        name: 'Live Weather API',
        type: 'api',
        httpMethod: 'GET',
        endpointUrl: 'https://api.weather.com/v3/current',
        parameters: {
          city: 'City name',
        },
      };

      const result = compileTools([restTool], 'langgraph');
      assert.ok(result.imports.some((i) => i.includes('import httpx')));
      const def = result.toolDefinitions.find((d) => d.includes('async def live_weather_api'));
      assert.ok(def, 'Should generate live_weather_api function');
      assert.ok(def.includes('@tool'));
      assert.ok(def.includes('method="GET"'));
      assert.ok(def.includes('params=data_map'));
      assert.ok(result.toolBindings.includes('live_weather_api'));
    });

    it('should compile local Python file tools with relative sourceFile into module imports (LangGraph)', () => {
      const localTool: ToolDefinition = {
        id: 'cust_threat',
        name: 'Threat Intel Query Tool',
        type: 'custom',
        toolMode: 'local_file',
        sourceFile: './tools/threat_intel_tools.py',
        functionName: 'threat_intel_query_tool',
      };

      const result = compileTools([localTool], 'langgraph');
      assert.ok(result.imports.some((i) => i.includes('from tools.threat_intel_tools import threat_intel_query_tool')));
      assert.ok(result.toolBindings.includes('threat_intel_query_tool'));
    });

    it('should compile AI generated tools with custom codeSnippet (LangGraph)', () => {
      const aiTool: ToolDefinition = {
        id: 'cust_ai_filter',
        name: 'filter_logs',
        type: 'custom',
        toolMode: 'ai_generated',
        codeSnippet: '@tool\ndef filter_logs(pattern: str) -> list:\n    """Filters security logs."""\n    return []',
      };

      const result = compileTools([aiTool], 'langgraph');
      assert.ok(result.toolDefinitions.some((d) => d.includes('def filter_logs(pattern: str) -> list:')));
      assert.ok(result.toolBindings.includes('filter_logs'));
    });
  });
});

