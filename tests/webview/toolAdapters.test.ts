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
} from '../../src/shared/codegen/toolAdapters';
import { ToolDefinition } from '../../src/shared/types';
import { BUILTIN_ADK_TOOLS } from '../../src/webview/data/builtinTools';

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
  });
});
