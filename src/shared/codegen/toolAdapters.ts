/**
 * Cross-Harness Tool Adapter Architecture & Code Compiler
 *
 * Compiles runtime-agnostic visual ToolDefinition objects into target-framework-specific
 * executable Python code for:
 * 1. Google ADK (Python): Direct imports (`from google.adk.tools import ...`),
 *    parameterized tool initializers, and `Agent(tools=[...])` bindings.
 * 2. LangGraph (Python): LangChain/LangGraph tools (`@tool` decorators,
 *    `langgraph.types.interrupt` for HITL clarification, `DuckDuckGoSearchRun`,
 *    `VertexAISearchRetriever`, and `PythonREPL`).
 *
 * Architectural Decisions:
 * 1. Runtime-Agnostic JSON: Visual tools are stored as declarative JSON schemas and compiled dynamically per harness.
 * 2. Region Safety: Vertex AI Search always defaults to `location="global"` per project guidelines.
 * 3. Human-in-the-Loop Interruption: ADK uses `from google.adk.tools import request_input`, whereas LangGraph leverages native `from langgraph.types import interrupt`.
 * 4. Modular Output: Compilers produce discrete import statements, constructor blocks, and tool arrays, plus unified file snippets.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { ToolDefinition } from '../types';

export interface CompiledToolPackage {
  framework: string;
  imports: string[];
  toolDefinitions: string[];
  toolBindings: string[];
  fullCodeSnippet: string;
}

/**
 * Sanitizes tool names into valid Python variable identifiers (snake_case).
 *
 * @param name Raw tool name or identifier
 * @returns Clean Python identifier
 */
export function sanitizePythonIdentifier(name: string): string {
  // NOTE: Strip leading 'tool_' or 'builtin_' prefixes, lowercase, replace non-alphanumeric with underscores, and strip edge underscores
  let cleaned = name
    .replace(/^(builtin_|tool_)/, '')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (/^[0-9]/.test(cleaned)) {
    cleaned = `tool_${cleaned}`;
  }
  return cleaned || 'custom_tool';
}

/**
 * ToolAdapterCompiler
 *
 * Compiles visual tool definitions across execution harnesses (Google ADK vs LangGraph).
 */
export class ToolAdapterCompiler {
  /**
   * Compiles tool definitions for the requested target framework.
   *
   * @param tools Array of ToolDefinition objects
   * @param framework Framework identifier ('google-adk' | 'langgraph')
   * @returns CompiledToolPackage containing generated Python code
   */
  public compile(tools: ToolDefinition[], framework: string = 'google-adk'): CompiledToolPackage {
    // NOTE: Normalize framework string
    const normalized = framework.toLowerCase().replace(/_/g, '-');
    if (normalized.includes('langgraph')) {
      return this.compileForLangGraph(tools);
    }
    return this.compileForGoogleAdk(tools);
  }

  /**
   * Compiles tools into official Google ADK (Python) imports, tool initializers,
   * and agent tool array bindings.
   *
   * @param tools Array of ToolDefinition objects
   * @returns CompiledToolPackage
   */
  public compileForGoogleAdk(tools: ToolDefinition[]): CompiledToolPackage {
    const importSet = new Set<string>();
    const definitions: string[] = [];
    const bindings: string[] = [];

    // Base ADK imports
    importSet.add('import os');

    for (const tool of tools) {
      if (tool.enabled === false || tool.isEnabled === false) continue;

      const builtinType = tool.builtinType;
      const toolId = tool.id;

      // 1. Web Page Reader
      if (builtinType === 'load_web_page' || toolId === 'builtin_load_web_page') {
        importSet.add('from google.adk.tools import load_web_page');
        bindings.push('load_web_page');
        continue;
      }

      // 2. Human-in-the-Loop Clarification
      if (builtinType === 'request_input' || toolId === 'builtin_request_input') {
        importSet.add('from google.adk.tools import request_input');
        bindings.push('request_input');
        continue;
      }

      // 3. Preload Memory Context
      if (builtinType === 'preload_memory' || toolId === 'builtin_preload_memory') {
        importSet.add('from google.adk.tools import PreloadMemoryTool');
        const varName = `${sanitizePythonIdentifier(tool.name || 'preload_memory')}_tool`;
        definitions.push(`${varName} = PreloadMemoryTool()`);
        bindings.push(varName);
        continue;
      }

      // 4. Code Interpreter (Sandboxed Execution)
      if (builtinType === 'code_execution' || toolId === 'tool_code_interpreter' || (tool.type === 'code' && !builtinType)) {
        importSet.add('from google.adk.tools import CodeExecutionTool');
        const varName = `${sanitizePythonIdentifier(tool.name || 'code_execution')}_tool`;
        definitions.push(`${varName} = CodeExecutionTool()`);
        bindings.push(varName);
        continue;
      }

      // 5. Sub-Agent as a Tool
      if (builtinType === 'agent_as_tool' || toolId === 'builtin_agent_as_tool') {
        importSet.add('from google.adk.tools import AgentTool');
        const varName = `${sanitizePythonIdentifier(tool.name || 'sub_agent')}_tool`;
        const targetAgent = tool.agentAsToolConfig?.subAgentName 
          ? sanitizePythonIdentifier(tool.agentAsToolConfig.subAgentName) 
          : 'sub_agent';
        definitions.push(
          `# Sub-agent wrapper tool\n` +
          `${varName} = AgentTool(agent=${targetAgent})`
        );
        bindings.push(varName);
        continue;
      }

      // 6. Google Search Grounding
      if (builtinType === 'google_search' || toolId === 'builtin_google_search' || toolId === 'tool_google_search' || tool.category === 'grounding' || tool.type === 'search') {
        const domainFilters = tool.googleSearchConfig?.domainFilters || [];

        const varName = `${sanitizePythonIdentifier(tool.name || 'google_search')}_tool`;

        if (domainFilters.length > 0) {
          importSet.add('from google.adk.tools.google_search_tool import GoogleSearchTool');
          const domainsStr = JSON.stringify(domainFilters);
          definitions.push(`${varName} = GoogleSearchTool(domain_filters=${domainsStr})`);
          bindings.push(varName);
        } else {
          // NOTE: In Google ADK, google_search is exported as a pre-instantiated singleton from google.adk.tools
          importSet.add('from google.adk.tools import google_search');
          definitions.push(`${varName} = google_search`);
          bindings.push(varName);
        }
        continue;
      }

      // 7. Vertex AI Search (Enterprise Datastores)
      if (builtinType === 'vertex_ai_search' || toolId === 'builtin_vertex_ai_search' || tool.category === 'enterprise_search' || tool.type === 'rag') {
        importSet.add('from google.adk.tools import VertexAiSearchTool');
        const varName = `${sanitizePythonIdentifier(tool.name || 'vertex_ai_search')}_tool`;
        const dataStoreId = tool.vertexAiSearchConfig?.dataStoreId || 'enterprise-datastore';
        const project = tool.vertexAiSearchConfig?.project 
          ? `"${tool.vertexAiSearchConfig.project}"` 
          : 'os.environ.get("GOOGLE_CLOUD_PROJECT", "default-project")';
        const location = tool.vertexAiSearchConfig?.location || 'global';
        const maxResults = tool.vertexAiSearchConfig?.maxResults || 5;

        definitions.push(
          `${varName} = VertexAiSearchTool(\n` +
          `    data_store_id="${dataStoreId}",\n` +
          `    project=${project},\n` +
          `    location="${location}",\n` +
          `    max_results=${maxResults},\n` +
          `)`
        );
        bindings.push(varName);
        continue;
      }

      // 8. MCP Server Tool
      if (tool.type === 'mcp' || tool.mcpConfig) {
        importSet.add('from google.adk.tools.mcp import McpClientTool');
        const varName = `${sanitizePythonIdentifier(tool.name || 'mcp')}_tool`;
        const serverName = tool.mcpConfig?.serverName || 'mcp-server';
        const transport = tool.mcpConfig?.transport || 'stdio';

        if (transport === 'sse') {
          const sseUrl = tool.mcpConfig?.serverUrl || 'http://localhost:8000/sse';
          definitions.push(
            `${varName} = McpClientTool(\n` +
            `    name="${serverName}",\n` +
            `    transport="sse",\n` +
            `    url="${sseUrl}",\n` +
            `)`
          );
        } else {
          const cmd = tool.mcpConfig?.command || 'npx';
          const args = JSON.stringify(tool.mcpConfig?.args || []);
          definitions.push(
            `${varName} = McpClientTool(\n` +
            `    name="${serverName}",\n` +
            `    transport="stdio",\n` +
            `    command="${cmd}",\n` +
            `    args=${args},\n` +
            `)`
          );
        }
        bindings.push(varName);
        continue;
      }

      // 9. Custom Function Tools
      const funcName = sanitizePythonIdentifier(tool.name || tool.id);
      const docString = tool.description || 'Custom agent tool';
      const paramKeys = Object.keys(tool.parameters || {});
      const sig = paramKeys.length > 0 ? paramKeys.join(': str, ') + ': str' : '**kwargs';

      definitions.push(
        `def ${funcName}(${sig}) -> dict:\n` +
        `    """${docString}"""\n` +
        `    # Custom tool execution logic\n` +
        `    return {"status": "success", "tool": "${funcName}"}\n`
      );
      bindings.push(funcName);
    }

    const importsArray = Array.from(importSet).sort();
    const fullSnippet = [
      '# --- Google ADK Tool Imports ---',
      importsArray.join('\n'),
      '',
      '# --- Tool Definitions & Instances ---',
      definitions.join('\n\n'),
      '',
      `# Tool bindings array for Agent(tools=...)\n` +
      `tools = [\n    ${bindings.join(',\n    ')}\n]`,
    ].filter(Boolean).join('\n');

    return {
      framework: 'google-adk',
      imports: importsArray,
      toolDefinitions: definitions,
      toolBindings: bindings,
      fullCodeSnippet: fullSnippet,
    };
  }

  /**
   * Compiles tool definitions into LangGraph / LangChain equivalents
   * using `@tool` decorators, retrievers, and `langgraph.types.interrupt`.
   *
   * @param tools Array of ToolDefinition objects
   * @returns CompiledToolPackage
   */
  public compileForLangGraph(tools: ToolDefinition[]): CompiledToolPackage {
    const importSet = new Set<string>();
    const definitions: string[] = [];
    const bindings: string[] = [];

    importSet.add('import os');
    importSet.add('from langchain_core.tools import tool');

    for (const tool of tools) {
      if (tool.enabled === false || tool.isEnabled === false) continue;

      const builtinType = tool.builtinType;
      const toolId = tool.id;

      // 1. Web Page Reader -> WebBaseLoader wrapped in @tool
      if (builtinType === 'load_web_page' || toolId === 'builtin_load_web_page') {
        importSet.add('from langchain_community.document_loaders import WebBaseLoader');
        const funcName = 'load_web_page_tool';
        definitions.push(
          `@tool\n` +
          `def ${funcName}(url: str) -> str:\n` +
          `    """Fetches web page HTML and returns clean text content."""\n` +
          `    loader = WebBaseLoader(url)\n` +
          `    docs = loader.load()\n` +
          `    return "\\n\\n".join([doc.page_content for doc in docs])`
        );
        bindings.push(funcName);
        continue;
      }

      // 2. Human-in-the-Loop Clarification -> langgraph.types.interrupt
      if (builtinType === 'request_input' || toolId === 'builtin_request_input') {
        importSet.add('from langgraph.types import interrupt');
        const funcName = 'request_human_clarification';
        definitions.push(
          `@tool\n` +
          `def ${funcName}(query_or_prompt: str) -> str:\n` +
          `    """Pauses graph execution to solicit input or approval from human operator."""\n` +
          `    return interrupt(query_or_prompt)`
        );
        bindings.push(funcName);
        continue;
      }

      // 3. Code Interpreter -> PythonREPL
      if (builtinType === 'code_execution' || toolId === 'tool_code_interpreter' || (tool.type === 'code' && !builtinType)) {
        importSet.add('from langchain_experimental.utilities import PythonREPL');
        const funcName = 'execute_python_code';
        definitions.push(
          `@tool\n` +
          `def ${funcName}(code: str) -> str:\n` +
          `    """Executes Python code in a sandboxed runtime environment."""\n` +
          `    repl = PythonREPL()\n` +
          `    return repl.run(code)`
        );
        bindings.push(funcName);
        continue;
      }

      // 4. Sub-Agent as a Tool -> Function calling sub-graph invoke
      if (builtinType === 'agent_as_tool' || toolId === 'builtin_agent_as_tool') {
        const subAgentVar = tool.agentAsToolConfig?.subAgentName 
          ? sanitizePythonIdentifier(tool.agentAsToolConfig.subAgentName) 
          : 'sub_agent_app';
        const funcName = `${sanitizePythonIdentifier(tool.name || 'sub_agent')}_tool`;
        definitions.push(
          `@tool\n` +
          `def ${funcName}(task_description: str) -> str:\n` +
          `    """Delegates a specialized sub-task to a sub-agent graph."""\n` +
          `    result = ${subAgentVar}.invoke({"messages": [("user", task_description)]})\n` +
          `    return str(result.get("messages", [""])[-1])`
        );
        bindings.push(funcName);
        continue;
      }

      // 5. Google Search Grounding -> DuckDuckGo or Tavily search tool
      if (builtinType === 'google_search' || toolId === 'tool_google_search' || tool.category === 'grounding' || tool.type === 'search') {
        importSet.add('from langchain_community.tools import DuckDuckGoSearchRun');
        const varName = `${sanitizePythonIdentifier(tool.name || 'search')}_tool`;
        definitions.push(`${varName} = DuckDuckGoSearchRun()`);
        bindings.push(varName);
        continue;
      }

      // 6. Vertex AI Search -> VertexAISearchRetriever
      if (builtinType === 'vertex_ai_search' || tool.category === 'enterprise_search' || tool.type === 'rag') {
        importSet.add('from langchain_google_community import VertexAISearchRetriever');
        const varName = `${sanitizePythonIdentifier(tool.name || 'vertex_retriever')}_tool`;
        const dataStoreId = tool.vertexAiSearchConfig?.dataStoreId || 'enterprise-datastore';
        const project = tool.vertexAiSearchConfig?.project 
          ? `"${tool.vertexAiSearchConfig.project}"` 
          : 'os.environ.get("GOOGLE_CLOUD_PROJECT", "default-project")';
        const location = tool.vertexAiSearchConfig?.location || 'global';
        const maxResults = tool.vertexAiSearchConfig?.maxResults || 5;

        definitions.push(
          `${varName} = VertexAISearchRetriever(\n` +
          `    project_id=${project},\n` +
          `    data_store_id="${dataStoreId}",\n` +
          `    location_id="${location}",\n` +
          `    max_extractive_answer_count=${maxResults},\n` +
          `)`
        );
        bindings.push(varName);
        continue;
      }


      // 7. General Custom Tools / APIs
      const funcName = sanitizePythonIdentifier(tool.name || tool.id);
      const docString = tool.description || 'Custom LangGraph agent tool';
      const paramKeys = Object.keys(tool.parameters || {});
      const sig = paramKeys.length > 0 ? paramKeys.join(': str, ') + ': str' : '**kwargs';

      definitions.push(
        `@tool\n` +
        `def ${funcName}(${sig}) -> dict:\n` +
        `    """${docString}"""\n` +
        `    return {"status": "success", "tool": "${funcName}"}`
      );
      bindings.push(funcName);
    }

    const importsArray = Array.from(importSet).sort();
    const fullSnippet = [
      '# --- LangGraph Tool Setup ---',
      importsArray.join('\n'),
      '',
      definitions.join('\n\n'),
      '',
      `# Tool list for bind_tools(...) or ToolNode(...)\n` +
      `tools = [\n    ${bindings.join(',\n    ')}\n]`,
    ].filter(Boolean).join('\n');

    return {
      framework: 'langgraph',
      imports: importsArray,
      toolDefinitions: definitions,
      toolBindings: bindings,
      fullCodeSnippet: fullSnippet,
    };
  }
}

/**
 * Top-level convenience compiler function.
 *
 * @param tools List of tools
 * @param framework Target framework
 * @returns CompiledToolPackage
 */
export function compileTools(tools: ToolDefinition[], framework: string = 'google-adk'): CompiledToolPackage {
  const compiler = new ToolAdapterCompiler();
  return compiler.compile(tools, framework);
}
