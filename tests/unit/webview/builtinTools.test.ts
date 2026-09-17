/**
 * Unit Tests for Google ADK Built-in Tools Registry & Categorization
 *
 * Validates:
 * 1. Existence and integrity of all 7 ADK built-in tools:
 *    - google_search
 *    - vertex_ai_search
 *    - load_web_page
 *    - request_input
 *    - preload_memory
 *    - code_execution
 *    - agent_as_tool
 * 2. Immutable cloning behavior of getBuiltinTools().
 * 3. Retrieval by ID and verification of isBuiltinTool().
 * 4. Four-way categorization into grounding, enterprise_search, system, and custom tools.
 * 5. Region rule adherence (default location="global").
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { 
  BUILTIN_ADK_TOOLS, 
  getBuiltinTools, 
  getBuiltinToolById, 
  isBuiltinTool, 
  categorizeTools,
  isDeprecatedMockTool,
  sanitizeToolList,
  DEPRECATED_MOCK_TOOL_IDS,
  isNativeAdkTool
} from '../../../src/webview/data/builtinTools';
import { AVAILABLE_TOOLS, ADK_DEFAULT_TOOLS } from '../../../src/webview/data/defaultTools';
import { reconcileToolsCatalog } from '../../../src/webview/hooks/useToolsManager';
import { ToolDefinition } from '../../../src/webview/types';

describe('ADK Built-in Tools Registry', () => {
  it('should register all 7 official Google ADK built-in tools', () => {
    assert.equal(BUILTIN_ADK_TOOLS.length, 7);

    const builtinTypes = BUILTIN_ADK_TOOLS.map((t) => t.builtinType);
    assert.ok(builtinTypes.includes('google_search'), 'Missing google_search');
    assert.ok(builtinTypes.includes('vertex_ai_search'), 'Missing vertex_ai_search');
    assert.ok(builtinTypes.includes('load_web_page'), 'Missing load_web_page');
    assert.ok(builtinTypes.includes('request_input'), 'Missing request_input');
    assert.ok(builtinTypes.includes('preload_memory'), 'Missing preload_memory');
    assert.ok(builtinTypes.includes('code_execution'), 'Missing code_execution');
    assert.ok(builtinTypes.includes('agent_as_tool'), 'Missing agent_as_tool');
  });

  it('should enforce location="global" for Vertex AI Search datastores', () => {
    const vertexTool = BUILTIN_ADK_TOOLS.find((t) => t.builtinType === 'vertex_ai_search');
    assert.ok(vertexTool);
    assert.equal(vertexTool.category, 'enterprise_search');
    assert.ok(vertexTool.vertexAiSearchConfig);
    assert.equal(vertexTool.vertexAiSearchConfig.location, 'global');
    assert.equal(vertexTool.vertexAiSearchConfig.maxResults, 5);
  });

  it('should initialize Google Search grounding with domain filters and threshold', () => {
    const searchTool = BUILTIN_ADK_TOOLS.find((t) => t.builtinType === 'google_search');
    assert.ok(searchTool);
    assert.equal(searchTool.category, 'grounding');
    assert.ok(searchTool.googleSearchConfig);
    assert.deepEqual(searchTool.googleSearchConfig.domainFilters, []);
    assert.equal(searchTool.googleSearchConfig.dynamicThreshold, 0.3);
  });

  it('should configure Human-in-the-Loop clarification with prompt and timeout', () => {
    const hitlTool = BUILTIN_ADK_TOOLS.find((t) => t.builtinType === 'request_input');
    assert.ok(hitlTool);
    assert.equal(hitlTool.category, 'system');
    assert.ok(hitlTool.requestInputConfig);
    assert.ok(hitlTool.requestInputConfig.prompt?.length > 0);
    assert.equal(hitlTool.requestInputConfig.timeoutSeconds, 300);
  });

  it('should clone tools defensively in getBuiltinTools to prevent state pollution', () => {
    const toolsA = getBuiltinTools();
    const toolsB = getBuiltinTools();

    assert.notEqual(toolsA, toolsB);
    assert.equal(toolsA.length, toolsB.length);

    // Modify toolsA
    toolsA[0].name = 'Mutated Tool Name';
    assert.notEqual(toolsA[0].name, toolsB[0].name);

    if (toolsA[0].googleSearchConfig && toolsB[0].googleSearchConfig) {
      toolsA[0].googleSearchConfig.domainFilters?.push('example.com');
      assert.notEqual(
        toolsA[0].googleSearchConfig.domainFilters?.length,
        toolsB[0].googleSearchConfig.domainFilters?.length
      );
    }
  });

  it('should retrieve individual built-in tools by ID or return undefined for invalid IDs', () => {
    const found = getBuiltinToolById('builtin_vertex_ai_search');
    assert.ok(found);
    assert.equal(found?.builtinType, 'vertex_ai_search');

    const notFound = getBuiltinToolById('non_existent_tool_id');
    assert.equal(notFound, undefined);
  });

  it('should accurately identify built-in tools with isBuiltinTool()', () => {
    const vertex = getBuiltinToolById('builtin_vertex_ai_search')!;
    assert.ok(isBuiltinTool(vertex));

    const legacySearch: ToolDefinition = {
      id: 'tool_google_search',
      name: 'Google Search',
      type: 'search',
      description: 'Legacy search',
    };
    assert.ok(isBuiltinTool(legacySearch));

    const customTool: ToolDefinition = {
      id: 'custom_calc_42',
      name: 'Custom Calculator',
      type: 'custom',
      description: 'A custom tool',
    };
    assert.equal(isBuiltinTool(customTool), false);
  });

  it('should categorize tools accurately into the 4 primary designer categories', () => {
    const testTools: ToolDefinition[] = [
      { id: 't1', name: 'Web Search', type: 'search', builtinType: 'google_search', description: '' },
      { id: 't2', name: 'Reader', type: 'search', builtinType: 'load_web_page', description: '' },
      { id: 't3', name: 'Enterprise Docs', type: 'rag', builtinType: 'vertex_ai_search', description: '' },
      { id: 't4', name: 'Vector Store', type: 'rag', description: '' },
      { id: 't5', name: 'Python Sandbox', type: 'code', builtinType: 'code_execution', description: '' },
      { id: 't6', name: 'Clarification', type: 'custom', builtinType: 'request_input', description: '' },
      { id: 't7', name: 'Sub-Agent', type: 'custom', builtinType: 'agent_as_tool', description: '' },
      { id: 't8', name: 'Memory', type: 'custom', builtinType: 'preload_memory', description: '' },
      { id: 't9', name: 'GitHub MCP', type: 'mcp', description: '' },
      { id: 't10', name: 'Stripe API', type: 'api', description: '' },
      { id: 't11', name: 'Postgres DB', type: 'db', description: '' },
      { id: 't12', name: 'Custom Logic', type: 'custom', description: '' },
    ];

    const categorized = categorizeTools(testTools);

    // Grounding: google_search, load_web_page
    assert.equal(categorized.grounding.length, 2);
    assert.ok(categorized.grounding.some((t) => t.id === 't1'));
    assert.ok(categorized.grounding.some((t) => t.id === 't2'));

    // Enterprise Search: vertex_ai_search, Vector Store
    assert.equal(categorized.enterprise_search.length, 2);
    assert.ok(categorized.enterprise_search.some((t) => t.id === 't3'));
    assert.ok(categorized.enterprise_search.some((t) => t.id === 't4'));

    // System Tools: code_execution, request_input, agent_as_tool, preload_memory
    assert.equal(categorized.system.length, 4);
    assert.ok(categorized.system.some((t) => t.id === 't5'));
    assert.ok(categorized.system.some((t) => t.id === 't6'));
    assert.ok(categorized.system.some((t) => t.id === 't7'));
    assert.ok(categorized.system.some((t) => t.id === 't8'));

    // Custom Tools: mcp, api, db, custom
    assert.equal(categorized.custom.length, 4);
    assert.ok(categorized.custom.some((t) => t.id === 't9'));
    assert.ok(categorized.custom.some((t) => t.id === 't10'));
    assert.ok(categorized.custom.some((t) => t.id === 't11'));
    assert.ok(categorized.custom.some((t) => t.id === 't12'));
  });

  it('should include all built-in tools in default AVAILABLE_TOOLS catalog', () => {
    for (const builtin of BUILTIN_ADK_TOOLS) {
      const match = AVAILABLE_TOOLS.find(
        (t) => t.builtinType === builtin.builtinType || t.id === builtin.id
      );
      assert.ok(match, `Built-in tool ${builtin.builtinType} missing from AVAILABLE_TOOLS`);
    }
  });

  it('should detect deprecated mock tools by ID and name with isDeprecatedMockTool', () => {
    assert.ok(isDeprecatedMockTool({ id: 'tool_google_places', name: 'Google Places API' }));
    assert.ok(isDeprecatedMockTool({ id: 'tool_twitter_api', name: 'Twitter / X API Client' }));
    assert.ok(isDeprecatedMockTool({ id: 'tool_github_api', name: 'GitHub API Client' }));
    assert.ok(isDeprecatedMockTool({ id: 'tool_sql_query', name: 'SQL Database Query' }));
    assert.ok(isDeprecatedMockTool({ id: 'tool_slack_webhook', name: 'Slack Notification Dispatcher' }));
    assert.ok(isDeprecatedMockTool({ id: 'tool_rest_api', name: 'Generic REST API Client' }));
    assert.ok(isDeprecatedMockTool({ id: 'tool_financial_calc', name: 'Procurement & Margin Calculator' }));
    assert.ok(isDeprecatedMockTool({ id: 'tool_rag_search', name: 'Knowledge RAG Vector Search' }));
    assert.ok(isDeprecatedMockTool({ id: 'mcp_postgres', name: 'PostgreSQL MCP Server' }));
    assert.ok(isDeprecatedMockTool({ id: 'mcp_brave_search', name: 'Brave Search MCP Server' }));
    assert.ok(isDeprecatedMockTool({ id: 'mcp_filesystem', name: 'Filesystem MCP Server' }));

    // Valid tools should NOT be flagged as deprecated
    assert.equal(isDeprecatedMockTool({ id: 'tool_google_search', name: 'Google Search Grounding' }), false);
    assert.equal(isDeprecatedMockTool({ id: 'builtin_vertex_ai_search', name: 'Vertex AI Search' }), false);
    assert.equal(isDeprecatedMockTool({ id: 'tool_code_interpreter', name: 'Python Code Sandbox' }), false);
    assert.equal(isDeprecatedMockTool({ id: 'custom_user_tool', name: 'User Custom Function' }), false);
  });

  it('should purge all deprecated mock tools via sanitizeToolList', () => {
    const mixedTools: ToolDefinition[] = [
      ...AVAILABLE_TOOLS,
      { id: 'tool_google_places', name: 'Google Places API (Business Lookup)', type: 'api', description: '' },
      { id: 'tool_twitter_api', name: 'Twitter / X API Client', type: 'api', description: '' },
      { id: 'tool_github_api', name: 'GitHub API Client', type: 'api', description: '' },
      { id: 'tool_sql_query', name: 'SQL Database Query', type: 'db', description: '' },
      { id: 'mcp_github', name: 'GitHub MCP Server', type: 'mcp', description: '' },
    ];

    const sanitized = sanitizeToolList(mixedTools);
    assert.equal(sanitized.length, AVAILABLE_TOOLS.length);

    for (const tool of sanitized) {
      assert.equal(isDeprecatedMockTool(tool), false, `Tool ${tool.id} should have been purged`);
    }
  });

  it('categorizeTools should automatically exclude all deprecated mock tools', () => {
    const mixedTools: ToolDefinition[] = [
      ...AVAILABLE_TOOLS,
      { id: 'tool_google_places', name: 'Google Places API (Business Lookup)', type: 'api', description: '' },
      { id: 'tool_twitter_api', name: 'Twitter / X API Client', type: 'api', description: '' },
      { id: 'tool_github_api', name: 'GitHub API Client', type: 'api', description: '' },
      { id: 'tool_sql_query', name: 'SQL Database Query', type: 'db', description: '' },
      { id: 'tool_financial_calc', name: 'Procurement & Margin Calculator', type: 'custom', description: '' },
    ];

    const categorized = categorizeTools(mixedTools);
    // Custom category should only contain legitimate custom tools (tool_custom_function)
    assert.equal(categorized.custom.length, 1);
    assert.equal(categorized.custom[0].id, 'tool_custom_function');
    assert.ok(!categorized.custom.some((t) => t.id === 'tool_google_places'));
    assert.ok(!categorized.custom.some((t) => t.id === 'tool_sql_query'));
  });

  it('should identify all 8 native ADK tools with isNativeAdkTool()', () => {
    // 7 built-in tools + 1 custom FunctionTool
    for (const tool of ADK_DEFAULT_TOOLS) {
      assert.ok(isNativeAdkTool(tool), `Tool ${tool.name} (${tool.id}) should be identified as a Native ADK tool`);
    }

    // Custom external tools and MCP servers should NOT be identified as native ADK
    assert.equal(isNativeAdkTool({ id: 'tool_mcp_test', name: 'Test MCP', type: 'mcp', description: '' } as ToolDefinition), false);
    assert.equal(isNativeAdkTool({ id: 'tool_api_weather', name: 'Weather API', type: 'api', description: '' } as ToolDefinition), false);
    assert.equal(isNativeAdkTool({ id: 'tool_custom_endpoint', name: 'Custom REST Endpoint', type: 'custom', endpointUrl: 'https://api.example.com', description: '' } as ToolDefinition), false);
  });

  it('should group all 8 ADK tools under native_adk in categorizeTools()', () => {
    const categorized = categorizeTools(AVAILABLE_TOOLS);
    assert.equal(categorized.native_adk.length, 8);
    assert.equal(categorized.google_cloud_mcp.length, 68);

    const ids = categorized.native_adk.map((t) => t.id);
    assert.ok(ids.includes('tool_google_search'), 'Missing Google Search');
    assert.ok(ids.includes('builtin_vertex_ai_search'), 'Missing Vertex AI Search');
    assert.ok(ids.includes('builtin_load_web_page'), 'Missing Web Page Reader');
    assert.ok(ids.includes('builtin_request_input'), 'Missing Human Clarification');
    assert.ok(ids.includes('builtin_preload_memory'), 'Missing Preload Memory');
    assert.ok(ids.includes('tool_code_interpreter'), 'Missing Python Code Sandbox');
    assert.ok(ids.includes('builtin_agent_as_tool'), 'Missing Sub-Agent as Tool');
    assert.ok(ids.includes('tool_custom_function'), 'Missing Custom Python/TS Function');
  });

  it('should reconcile localStorage to restore missing ADK tools when user had only 3 cached', () => {
    // Simulate user state from an older session where only 3 tools were cached
    const oldCachedTools: ToolDefinition[] = [
      {
        id: 'tool_google_search',
        name: 'Google Search Grounding',
        type: 'search',
        category: 'grounding',
        builtinType: 'google_search',
        description: 'Existing cached config',
      },
      {
        id: 'tool_code_interpreter',
        name: 'Python Code Sandbox',
        type: 'code',
        category: 'system',
        builtinType: 'code_execution',
        description: 'Existing cached config',
      },
      {
        id: 'tool_custom_function',
        name: 'Custom Python/TS Function',
        type: 'custom',
        category: 'custom',
        description: 'Existing cached config',
      },
    ];

    const reconciled = reconcileToolsCatalog(oldCachedTools);

    // Reconciled catalog must now have all 8 native ADK tools plus default GCP MCP tools
    const nativeAdkTools = reconciled.filter(isNativeAdkTool);
    assert.equal(nativeAdkTools.length, 8);
    assert.ok(reconciled.length >= 76);

    // Existing configs preserved
    const search = reconciled.find((t) => t.id === 'tool_google_search');
    assert.equal(search?.description, 'Existing cached config');

    // Missing tools added
    assert.ok(reconciled.some((t) => t.builtinType === 'vertex_ai_search'));
    assert.ok(reconciled.some((t) => t.builtinType === 'load_web_page'));
    assert.ok(reconciled.some((t) => t.builtinType === 'request_input'));
    assert.ok(reconciled.some((t) => t.builtinType === 'preload_memory'));
    assert.ok(reconciled.some((t) => t.builtinType === 'agent_as_tool'));
  });

  it('should handle edge cases in reconcileToolsCatalog', () => {
    // Null / non-array input
    const fromNull = reconcileToolsCatalog(null as any);
    assert.equal(fromNull.length, AVAILABLE_TOOLS.length);

    // Empty array input
    const fromEmpty = reconcileToolsCatalog([]);
    assert.equal(fromEmpty.length, AVAILABLE_TOOLS.length);

    // Cached tools with a user MCP server and deprecated mock tool
    const userWorkspace: ToolDefinition[] = [
      {
        id: 'mcp_bigquery',
        name: 'BigQuery MCP',
        type: 'mcp',
        description: 'Custom user registered MCP',
        mcpConfig: {
          serverName: 'bigquery',
          transport: 'http',
          url: 'https://bigquery.googleapis.com/mcp',
          authProvider: 'adc',
        },
      },
      {
        id: 'tool_financial_calc',
        name: 'Procurement & Margin Calculator',
        type: 'custom',
        description: 'Deprecated tool',
      },
    ];

    const reconciled = reconcileToolsCatalog(userWorkspace);

    // Deprecated mock tool purged
    assert.ok(!reconciled.some((t) => t.id === 'tool_financial_calc'));

    // User MCP tool preserved
    const mcp = reconciled.find((t) => t.id === 'mcp_bigquery');
    assert.ok(mcp);
    assert.equal(mcp?.mcpConfig?.serverName, 'bigquery');

    // All 8 native ADK tools present
    for (const adkTool of AVAILABLE_TOOLS) {
      assert.ok(
        reconciled.some((t) => t.id === adkTool.id || (t.builtinType && t.builtinType === adkTool.builtinType)),
        `ADK tool ${adkTool.name} should be present in reconciled output`
      );
    }
  });

  it('should deduplicate multiple instances of Custom Python/TS Function in reconcileToolsCatalog', () => {
    const dirtyCatalog: ToolDefinition[] = [
      {
        id: 'tool_custom_function',
        name: 'Custom Python/TS Function',
        type: 'custom',
        description: 'First instance',
      },
      {
        id: 'tool_custom_duplicate_999',
        name: 'Custom Python/TS Function',
        type: 'custom',
        description: 'Second duplicate instance',
      },
      {
        id: 'tool_custom_function',
        name: 'Custom Python/TS Function',
        type: 'custom',
        description: 'Third duplicate with same id',
      },
    ];

    const reconciled = reconcileToolsCatalog(dirtyCatalog);

    // Exactly one Custom Python/TS Function in the entire catalog
    const customFunctionMatches = reconciled.filter(
      (t) => t.id === 'tool_custom_function' || t.name === 'Custom Python/TS Function'
    );
    assert.equal(customFunctionMatches.length, 1);
  });

  it('should ensure Custom Python/TS Function is only in native_adk and excluded from custom section', () => {
    const categorized = categorizeTools(AVAILABLE_TOOLS);

    // Present in native_adk
    const adkCustom = categorized.native_adk.find((t) => t.id === 'tool_custom_function');
    assert.ok(adkCustom, 'Should be in native_adk');

    // Filter used in PaletteCard and AddToolModal
    const customSectionTools = categorized.custom.filter(
      (t) => !isNativeAdkTool(t) && t.type !== 'mcp' && !t.mcpConfig && !t.id.startsWith('tool_mcp_')
    );

    // Custom Python/TS Function MUST NOT be in the customSectionTools
    const duplicateInCustom = customSectionTools.find((t) => t.id === 'tool_custom_function' || t.name === 'Custom Python/TS Function');
    assert.equal(duplicateInCustom, undefined, 'Custom Python/TS Function must not appear in Custom & External Tools section');
  });
});
