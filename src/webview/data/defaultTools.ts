/**
 * Default Tool Catalog
 *
 * Defines the canonical tools available in the Visual Agent Designer palette.
 * Strictly contains official, verified Google ADK built-in tools and a custom function tool.
 *
 * Built-in Tools:
 * 1. Google Search Grounding (`google_search`)
 * 2. Vertex AI Search (`vertex_ai_search`, location="global")
 * 3. Web Page Reader (`load_web_page`)
 * 4. Human Clarification (HITL) (`request_input`)
 * 5. Preload Memory Tool (`preload_memory`)
 * 6. Python Code Sandbox (`code_execution`)
 * 7. Sub-Agent as Tool (`agent_as_tool`)
 *
 * Plus:
 * 8. Custom Function (`custom`)
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { ToolDefinition } from '../types';

export const AVAILABLE_TOOLS: ToolDefinition[] = [
  {
    id: 'tool_google_search',
    name: 'Google Search Grounding',
    type: 'search',
    category: 'grounding',
    builtinType: 'google_search',
    description: 'Grounding search engine tool for real-time web retrieval and source verification.',
    codePrompt: 'Query the Google Search Grounding tool with the given search terms. Return structured search snippets, source titles, and citation URLs for grounding model responses.',
    parameters: {
      query: 'string - The search terms or question to look up online',
    },
    googleSearchConfig: {
      domainFilters: [],
      dynamicThreshold: 0.3,
    },
    enabled: true,
  },
  {
    id: 'builtin_vertex_ai_search',
    name: 'Vertex AI Search',
    type: 'rag',
    category: 'enterprise_search',
    builtinType: 'vertex_ai_search',
    description: 'Grounding against enterprise Vertex AI Search datastores and unstructured/structured corpora.',
    codePrompt: 'Query the connected Vertex AI Search enterprise datastore. Retrieves authorized organizational documents, knowledge bases, and structured data with strict access controls.',
    parameters: {
      query: 'string - Semantic search query for enterprise datastore retrieval',
      max_results: 'number - Maximum number of document chunks to return (default 5)',
    },
    vertexAiSearchConfig: {
      dataStoreId: '',
      location: 'global',
      project: '',
      engineId: '',
      maxResults: 5,
    },
    enabled: true,
  },
  {
    id: 'builtin_load_web_page',
    name: 'Web Page Reader',
    type: 'search',
    category: 'grounding',
    builtinType: 'load_web_page',
    description: 'Fetches web page content over HTTP and converts HTML to clean, model-friendly markdown.',
    codePrompt: 'Load public web pages by URL, stripping boilerplate markup, navigation, and script tags to return clean markdown for document inspection and summary.',
    parameters: {
      url: 'string - Fully qualified HTTP or HTTPS URL to fetch',
    },
    enabled: true,
  },
  {
    id: 'builtin_request_input',
    name: 'Human Clarification (HITL)',
    type: 'custom',
    category: 'system',
    builtinType: 'request_input',
    description: 'Pauses model execution to request clarifications, confirmations, or approvals directly from the human operator.',
    codePrompt: 'Interrupt agent processing and solicit human operator clarification or confirmation before executing sensitive steps or when intent is ambiguous.',
    parameters: {
      prompt: 'string - Clarification question or prompt displayed to the operator',
    },
    requestInputConfig: {
      prompt: 'Please provide required input or confirm this action:',
      timeoutSeconds: 300,
    },
    enabled: true,
  },
  {
    id: 'builtin_preload_memory',
    name: 'Preload Memory Tool',
    type: 'custom',
    category: 'system',
    builtinType: 'preload_memory',
    description: 'Injects historical user session context, chat memories, and preferences into the prompt window before execution.',
    codePrompt: 'Load historical session facts, prior agent conclusions, and user preferences into the active conversational context for multi-turn coherence.',
    parameters: {
      session_id: 'string - Unique conversation session identifier',
      limit: 'number - Maximum history turns to retrieve (default 10)',
    },
    enabled: true,
  },
  {
    id: 'tool_code_interpreter',
    name: 'Python Code Sandbox',
    type: 'code',
    category: 'system',
    builtinType: 'code_execution',
    description: 'Executes Python code in an isolated sandboxed runtime with data science libraries.',
    codePrompt: 'Run sandboxed Python 3.11 code in an ephemeral container. Returns stdout, stderr, and generated artifact file paths (charts, data tables, CSVs).',
    parameters: {
      code: 'string - Python code block to execute',
      timeout: 'number - Execution timeout in seconds (default 30)',
    },
    enabled: true,
  },
  {
    id: 'builtin_agent_as_tool',
    name: 'Sub-Agent as Tool',
    type: 'custom',
    category: 'system',
    builtinType: 'agent_as_tool',
    description: 'Wraps another configured agent as a callable tool, delegating focused sub-tasks and retrieving findings.',
    codePrompt: 'Delegate specific sub-tasks to a specialized sub-agent (e.g. researcher, evaluator, calculator) and return its synthesized conclusions.',
    parameters: {
      task_description: 'string - Detailed objective and prompt instructions for the sub-agent',
    },
    agentAsToolConfig: {
      subAgentId: '',
      subAgentName: '',
      subAgentDescription: '',
    },
    enabled: true,
  },
  {
    id: 'tool_custom_function',
    name: 'Custom Python/TS Function',
    type: 'custom',
    category: 'custom',
    description: 'User-defined custom business logic function with custom schemas.',
    codePrompt: 'Define your custom tool behavior, business rules, calculations, or internal system integrations in plain language or code.',
    parameters: {
      input_data: 'string | object - Input arguments',
    },
    enabled: true,
  },
];
