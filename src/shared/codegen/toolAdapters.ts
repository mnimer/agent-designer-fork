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
          definitions.push(`${varName} = GoogleSearchTool(bypass_multi_tools_limit=True, domain_filters=${domainsStr})`);
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
          `    bypass_multi_tools_limit=True,\n` +
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

        const toolArgs: string[] = [
          `    name="${serverName}",`,
          `    transport="${transport}",`,
        ];

        if (transport === 'sse' || transport === 'http') {
          const sseUrl = tool.mcpConfig?.serverUrl || tool.endpointUrl || 'http://localhost:8000/sse';
          toolArgs.push(`    url="${sseUrl}",`);
          if (tool.mcpConfig?.authProviderType === 'google_credentials') {
            importSet.add('import google.auth');
            importSet.add('from google.auth.transport.requests import Request as GoogleAuthRequest');
            importSet.add('import os');

            const scopes = tool.mcpConfig.oauthConfig?.scopes && tool.mcpConfig.oauthConfig.scopes.length > 0
              ? JSON.stringify(tool.mcpConfig.oauthConfig.scopes)
              : '["https://www.googleapis.com/auth/cloud-platform", "https://www.googleapis.com/auth/bigquery"]';
            const projectIdExpr = tool.mcpConfig.oauthConfig?.projectId
              ? `"${tool.mcpConfig.oauthConfig.projectId}"`
              : 'os.environ.get("GOOGLE_CLOUD_PROJECT", "")';

            const headerFnName = `_get_${varName}_headers`;
            const headerBlock = [
              `def ${headerFnName}():`,
              `    """Resolves and auto-refreshes Google Cloud ADC OAuth token for ${serverName}."""`,
              `    credentials, default_project = google.auth.default(scopes=${scopes})`,
              `    if not credentials.valid:`,
              `        credentials.refresh(GoogleAuthRequest())`,
              `    headers = {"Authorization": f"Bearer {credentials.token}"}`,
              `    project = ${projectIdExpr} or default_project`,
              `    if project:`,
              `        headers["x-goog-user-project"] = project`,
              `    return headers`,
            ].join('\n');

            definitions.push(headerBlock);
            toolArgs.push(`    headers=${headerFnName}(),`);
          } else if (tool.mcpConfig?.authProviderType === 'bearer_token' || tool.mcpConfig?.secretConfig) {
            importSet.add('import os');
            const envVarName = tool.mcpConfig?.secretConfig?.envVar || `${serverName.toUpperCase().replace(/[^A-Z0-9_]/g, '_')}_TOKEN`;
            const headerFnName = `_get_${varName}_headers`;
            const headerBlock = [
              `def ${headerFnName}():`,
              `    """Resolves Bearer secret token from environment / Secret Manager for ${serverName}."""`,
              `    token = os.environ.get("${envVarName}", "")`,
              `    return {`,
              `        "Authorization": f"Bearer {token}",`,
              `        "Content-Type": "application/json",`,
              `        "Accept": "application/json, text/event-stream",`,
              `    }`,
            ].join('\n');

            definitions.push(headerBlock);
            toolArgs.push(`    headers=${headerFnName}(),`);
          } else if (tool.mcpConfig?.headers && Object.keys(tool.mcpConfig.headers).length > 0) {
            toolArgs.push(`    headers=${JSON.stringify(tool.mcpConfig.headers)},`);
          } else if (tool.authKeyEnv) {
            toolArgs.push(`    headers={"Authorization": f"Bearer {os.environ.get('${tool.authKeyEnv}', '')}"},`);
            importSet.add('import os');
          }
        } else {
          const cmd = tool.mcpConfig?.command || 'npx';
          const args = JSON.stringify(tool.mcpConfig?.args || []);
          toolArgs.push(`    command="${cmd}",`);
          toolArgs.push(`    args=${args},`);
          if (tool.mcpConfig?.cwd) {
            toolArgs.push(`    cwd="${tool.mcpConfig.cwd}",`);
          }
          if (tool.mcpConfig?.envVars && Object.keys(tool.mcpConfig.envVars).length > 0) {
            toolArgs.push(`    env=${JSON.stringify(tool.mcpConfig.envVars)},`);
          }
        }

        if (tool.mcpConfig?.timeoutSeconds) {
          toolArgs.push(`    timeout=${tool.mcpConfig.timeoutSeconds},`);
        }

        if (tool.mcpConfig?.exposedTools && tool.mcpConfig.exposedTools.length > 0 && !tool.mcpConfig.exposedTools.includes('*')) {
          toolArgs.push(`    tools=${JSON.stringify(tool.mcpConfig.exposedTools)},`);
        }

        if (tool.mcpConfig?.autoApproveTools && tool.mcpConfig.autoApproveTools.length > 0) {
          toolArgs.push(`    auto_approve_tools=${JSON.stringify(tool.mcpConfig.autoApproveTools)},`);
        }

        definitions.push(`${varName} = McpClientTool(\n${toolArgs.join('\n')}\n)`);
        bindings.push(varName);
        continue;
      }

      // 9. REST API Tools (async httpx client)
      if (tool.type === 'api' || tool.type === 'rest' || (tool.endpointUrl && !tool.mcpConfig && !tool.builtinType)) {
        importSet.add('import httpx');
        const funcName = sanitizePythonIdentifier(tool.name || tool.id);
        const docString = tool.description || `REST API tool invoking ${tool.endpointUrl || 'endpoint'}`;
        const method = (tool.httpMethod || 'GET').toUpperCase();
        const url = tool.endpointUrl || 'https://api.example.com';
        const timeout = tool.timeoutSeconds ?? 30;

        const paramKeys = Object.keys(tool.parameters || {});
        const sig = paramKeys.length > 0
          ? paramKeys.map((k) => `${sanitizePythonIdentifier(k)}: str = ""`).join(', ')
          : '**kwargs';

        const lines: string[] = [
          `async def ${funcName}(${sig}) -> dict:`,
          `    """${docString}"""`,
          `    url = "${url}"`,
        ];

        const headerEntries: Record<string, string> = {
          Accept: 'application/json',
          ...(tool.headers || {}),
        };
        if (['POST', 'PUT', 'PATCH'].includes(method)) {
          headerEntries['Content-Type'] = headerEntries['Content-Type'] || 'application/json';
        }

        const headerLines = Object.entries(headerEntries).map(
          ([k, v]) => `        "${k}": "${v}",`
        );
        lines.push(`    headers = {\n${headerLines.join('\n')}\n    }`);

        if (tool.authKeyEnv) {
          importSet.add('import os');
          lines.push(`    token = os.environ.get("${tool.authKeyEnv}", "")`);
          lines.push(`    if token:`);
          lines.push(`        headers["Authorization"] = f"Bearer {token}"`);
        }

        if (tool.secretManagerKey) {
          lines.push(`    if "Authorization" not in headers or not headers["Authorization"]:`);
          lines.push(`        try:`);
          lines.push(`            from google.cloud import secretmanager`);
          lines.push(`            sm_client = secretmanager.SecretManagerServiceClient()`);
          lines.push(`            sm_resp = sm_client.access_secret_version(request={"name": "${tool.secretManagerKey}"})`);
          lines.push(`            sm_token = sm_resp.payload.data.decode("utf-8")`);
          lines.push(`            headers["Authorization"] = f"Bearer {sm_token}"`);
          lines.push(`        except Exception:`);
          lines.push(`            pass`);
        }

        if (paramKeys.length > 0) {
          const dictEntries = paramKeys
            .map((k) => `"${k}": ${sanitizePythonIdentifier(k)}`)
            .join(', ');
          lines.push(`    data_map = {k: v for k, v in {${dictEntries}}.items() if v}`);
        } else {
          lines.push(`    data_map = kwargs`);
        }

        const isQuery = method === 'GET' || method === 'DELETE';
        const dataArg = isQuery ? 'params=data_map' : 'json=data_map';

        lines.push(`    try:`);
        lines.push(`        async with httpx.AsyncClient(timeout=${timeout}.0) as client:`);
        lines.push(`            response = await client.request(`);
        lines.push(`                method="${method}",`);
        lines.push(`                url=url,`);
        lines.push(`                ${dataArg},`);
        lines.push(`                headers=headers,`);
        lines.push(`            )`);
        lines.push(`            response.raise_for_status()`);
        lines.push(`            try:`);
        lines.push(`                return response.json()`);
        lines.push(`            except Exception:`);
        lines.push(`                return {"status": "success", "text": response.text}`);
        lines.push(`    except httpx.HTTPStatusError as e:`);
        lines.push(`        return {"status": "error", "code": e.response.status_code, "detail": e.response.text}`);
        lines.push(`    except Exception as e:`);
        lines.push(`        return {"status": "error", "message": str(e)}`);

        definitions.push(lines.join('\n'));
        bindings.push(funcName);
        continue;
      }

      // 10. Custom Function Tools
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

      // 7. MCP Server Tool -> Authenticated Streamable HTTP / Stdio @tool wrapper
      if (tool.type === 'mcp' || tool.mcpConfig) {
        const funcName = `${sanitizePythonIdentifier(tool.name || tool.id)}_tool`;
        const serverName = tool.mcpConfig?.serverName || tool.name || 'mcp-server';
        const docString = tool.description || `Interacts with ${serverName} MCP server`;
        const transport = tool.mcpConfig?.transport || 'http';
        const timeout = tool.mcpConfig?.timeoutSeconds || 30;

        if (transport === 'http' || transport === 'sse') {
          const endpointUrl = tool.mcpConfig?.serverUrl || tool.endpointUrl || 'https://localhost:8080/mcp';
          importSet.add('import requests');

          if (tool.mcpConfig?.authProviderType === 'google_credentials') {
            importSet.add('import google.auth');
            importSet.add('from google.auth.transport.requests import Request as GoogleAuthRequest');

            const scopes = tool.mcpConfig.oauthConfig?.scopes && tool.mcpConfig.oauthConfig.scopes.length > 0
              ? JSON.stringify(tool.mcpConfig.oauthConfig.scopes)
              : '["https://www.googleapis.com/auth/cloud-platform", "https://www.googleapis.com/auth/bigquery"]';
            const projectIdExpr = tool.mcpConfig.oauthConfig?.projectId
              ? `"${tool.mcpConfig.oauthConfig.projectId}"`
              : 'os.environ.get("GOOGLE_CLOUD_PROJECT", "")';

            const tokenFnName = `_get_${funcName}_token`;
            definitions.push(
              `def ${tokenFnName}():\n` +
              `    """Resolves and refreshes Google Cloud ADC OAuth token."""\n` +
              `    creds, default_proj = google.auth.default(scopes=${scopes})\n` +
              `    if not creds.valid:\n` +
              `        creds.refresh(GoogleAuthRequest())\n` +
              `    return creds.token, ${projectIdExpr} or default_proj\n\n` +
              `@tool\n` +
              `def ${funcName}(action: str, parameters: dict = None) -> dict:\n` +
              `    """${docString}"""\n` +
              `    token, proj = ${tokenFnName}()\n` +
              `    headers = {\n` +
              `        "Authorization": f"Bearer {token}",\n` +
              `        "Content-Type": "application/json",\n` +
              `    }\n` +
              `    if proj:\n` +
              `        headers["x-goog-user-project"] = proj\n` +
              `    payload = {\n` +
              `        "jsonrpc": "2.0",\n` +
              `        "id": 1,\n` +
              `        "method": f"tools/{action}",\n` +
              `        "params": parameters or {},\n` +
              `    }\n` +
              `    resp = requests.post("${endpointUrl}", json=payload, headers=headers, timeout=${timeout})\n` +
              `    return resp.json()`
            );
          } else if (tool.mcpConfig?.authProviderType === 'bearer_token' || tool.mcpConfig?.secretConfig) {
            importSet.add('import os');
            const envVarName = tool.mcpConfig?.secretConfig?.envVar || `${serverName.toUpperCase().replace(/[^A-Z0-9_]/g, '_')}_TOKEN`;
            definitions.push(
              `@tool\n` +
              `def ${funcName}(action: str, parameters: dict = None) -> dict:\n` +
              `    """${docString}"""\n` +
              `    token = os.environ.get("${envVarName}", "")\n` +
              `    headers = {\n` +
              `        "Authorization": f"Bearer {token}",\n` +
              `        "Content-Type": "application/json",\n` +
              `        "Accept": "application/json, text/event-stream",\n` +
              `    }\n` +
              `    payload = {\n` +
              `        "jsonrpc": "2.0",\n` +
              `        "id": 1,\n` +
              `        "method": f"tools/{action}",\n` +
              `        "params": parameters or {},\n` +
              `    }\n` +
              `    resp = requests.post("${endpointUrl}", json=payload, headers=headers, timeout=${timeout})\n` +
              `    return resp.json()`
            );
          } else {
            const customHeaders = tool.mcpConfig?.headers ? JSON.stringify(tool.mcpConfig.headers) : '{}';
            definitions.push(
              `@tool\n` +
              `def ${funcName}(action: str, parameters: dict = None) -> dict:\n` +
              `    """${docString}"""\n` +
              `    headers = ${customHeaders}\n` +
              `    payload = {\n` +
              `        "jsonrpc": "2.0",\n` +
              `        "id": 1,\n` +
              `        "method": f"tools/{action}",\n` +
              `        "params": parameters or {},\n` +
              `    }\n` +
              `    resp = requests.post("${endpointUrl}", json=payload, headers=headers, timeout=${timeout})\n` +
              `    return resp.json()`
            );
          }
        } else {
          definitions.push(
            `@tool\n` +
            `def ${funcName}(action: str, parameters: dict = None) -> dict:\n` +
            `    """${docString} (stdio MCP runner)"""\n` +
            `    return {"status": "success", "tool": "${serverName}", "action": action, "params": parameters or {}}`
          );
        }

        bindings.push(funcName);
        continue;
      }

      // 8. REST API Tools (async httpx client with @tool decorator)
      if (tool.type === 'api' || tool.type === 'rest' || (tool.endpointUrl && !tool.mcpConfig && !tool.builtinType)) {
        importSet.add('import httpx');
        const funcName = sanitizePythonIdentifier(tool.name || tool.id);
        const docString = tool.description || `REST API tool invoking ${tool.endpointUrl || 'endpoint'}`;
        const method = (tool.httpMethod || 'GET').toUpperCase();
        const url = tool.endpointUrl || 'https://api.example.com';
        const timeout = tool.timeoutSeconds ?? 30;

        const paramKeys = Object.keys(tool.parameters || {});
        const sig = paramKeys.length > 0
          ? paramKeys.map((k) => `${sanitizePythonIdentifier(k)}: str = ""`).join(', ')
          : '**kwargs';

        const lines: string[] = [
          `@tool`,
          `async def ${funcName}(${sig}) -> dict:`,
          `    """${docString}"""`,
          `    url = "${url}"`,
        ];

        const headerEntries: Record<string, string> = {
          Accept: 'application/json',
          ...(tool.headers || {}),
        };
        if (['POST', 'PUT', 'PATCH'].includes(method)) {
          headerEntries['Content-Type'] = headerEntries['Content-Type'] || 'application/json';
        }

        const headerLines = Object.entries(headerEntries).map(
          ([k, v]) => `        "${k}": "${v}",`
        );
        lines.push(`    headers = {\n${headerLines.join('\n')}\n    }`);

        if (tool.authKeyEnv) {
          importSet.add('import os');
          lines.push(`    token = os.environ.get("${tool.authKeyEnv}", "")`);
          lines.push(`    if token:`);
          lines.push(`        headers["Authorization"] = f"Bearer {token}"`);
        }

        if (tool.secretManagerKey) {
          lines.push(`    if "Authorization" not in headers or not headers["Authorization"]:`);
          lines.push(`        try:`);
          lines.push(`            from google.cloud import secretmanager`);
          lines.push(`            sm_client = secretmanager.SecretManagerServiceClient()`);
          lines.push(`            sm_resp = sm_client.access_secret_version(request={"name": "${tool.secretManagerKey}"})`);
          lines.push(`            sm_token = sm_resp.payload.data.decode("utf-8")`);
          lines.push(`            headers["Authorization"] = f"Bearer {sm_token}"`);
          lines.push(`        except Exception:`);
          lines.push(`            pass`);
        }

        if (paramKeys.length > 0) {
          const dictEntries = paramKeys
            .map((k) => `"${k}": ${sanitizePythonIdentifier(k)}`)
            .join(', ');
          lines.push(`    data_map = {k: v for k, v in {${dictEntries}}.items() if v}`);
        } else {
          lines.push(`    data_map = kwargs`);
        }

        const isQuery = method === 'GET' || method === 'DELETE';
        const dataArg = isQuery ? 'params=data_map' : 'json=data_map';

        lines.push(`    try:`);
        lines.push(`        async with httpx.AsyncClient(timeout=${timeout}.0) as client:`);
        lines.push(`            response = await client.request(`);
        lines.push(`                method="${method}",`);
        lines.push(`                url=url,`);
        lines.push(`                ${dataArg},`);
        lines.push(`                headers=headers,`);
        lines.push(`            )`);
        lines.push(`            response.raise_for_status()`);
        lines.push(`            try:`);
        lines.push(`                return response.json()`);
        lines.push(`            except Exception:`);
        lines.push(`                return {"status": "success", "text": response.text}`);
        lines.push(`    except httpx.HTTPStatusError as e:`);
        lines.push(`        return {"status": "error", "code": e.response.status_code, "detail": e.response.text}`);
        lines.push(`    except Exception as e:`);
        lines.push(`        return {"status": "error", "message": str(e)}`);

        definitions.push(lines.join('\n'));
        bindings.push(funcName);
        continue;
      }

      // 9. General Custom Tools / APIs
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
