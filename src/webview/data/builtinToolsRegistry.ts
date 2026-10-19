/**
 * Built-in Google ADK Extended Toolsets & Control Flow Tools Registry
 *
 * Defines the canonical catalog entries, factories, parsers, and Python ADK
 * code generators for all advanced ADK toolsets and built-in flow control tools:
 * 1. OpenAPIToolset (`openapi_toolset` - TASK-227)
 * 2. ApplicationIntegrationToolset (`application_integration` - TASK-228)
 * 3. VertexAiRagRetrieval Tool (`vertex_ai_rag_retrieval` - TASK-229)
 * 4. Native BigQueryToolset (`bigquery_toolset` - TASK-230)
 * 5. Native SpannerToolset (`spanner_toolset` - TASK-231)
 * 6. ComputerUseToolset (`computer_use` - TASK-232)
 * 7. MCP Toolbox for Databases (`toolbox_databases` - TASK-233)
 * 8. Built-in Control Flow Tools (`exit_loop`, `transfer_to_agent`, `load_memory`, `load_artifacts` - TASK-234)
 *
 * Architectural Decisions:
 * 1. Immutability & Defensive Copies: Exported factories return fresh cloned instances
 *    to prevent state pollution across agent configurations.
 * 2. Pure Code Generation: Code snippets are emitted directly in canonical Python ADK
 *    syntax matching Google ADK conventions.
 * 3. Backward Compatibility: Designed to work alongside existing BUILTIN_ADK_TOOLS
 *    without mutating or displacing pre-existing tools.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import {
  ToolDefinition,
  AdkBuiltinToolType,
  OpenApiToolsetConfig,
  ApplicationIntegrationConfig,
  VertexAiRagRetrievalConfig,
  BigQueryToolsetConfig,
  BigQueryToolsetToolName,
  SpannerToolsetConfig,
  SpannerToolsetToolName,
  ComputerUseConfig,
  ToolboxDatabaseConfig,
} from '../types';

// ============================================================================
// 1. OpenAPI Toolset (TASK-227)
// ============================================================================

export interface OpenApiParsedOperation {
  operationId: string;
  method: string;
  path: string;
  summary?: string;
}

export interface OpenApiParseResult {
  title?: string;
  version?: string;
  serverUrl?: string;
  operations: OpenApiParsedOperation[];
  error?: string;
}

/**
 * Parses raw OpenAPI v3 specification text (JSON or basic YAML) to extract
 * declared API endpoints, methods, and operation IDs for agent designer selection.
 *
 * @param specText Raw OpenAPI JSON or YAML string
 * @returns OpenApiParseResult with discovered operations or error detail
 */
export function parseOpenApiSpecOperations(specText: string): OpenApiParseResult {
  if (!specText || !specText.trim()) {
    return { operations: [], error: 'Empty OpenAPI specification provided.' };
  }

  const trimmed = specText.trim();
  const operations: OpenApiParsedOperation[] = [];

  // 1. Try parsing as standard JSON
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      const title = parsed.info?.title;
      const version = parsed.info?.version;
      const serverUrl = Array.isArray(parsed.servers) && parsed.servers.length > 0
        ? parsed.servers[0].url
        : undefined;

      const paths = parsed.paths || {};
      const validMethods = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head'];

      for (const [pathKey, pathItem] of Object.entries(paths)) {
        if (!pathItem || typeof pathItem !== 'object') continue;
        for (const [methodKey, op] of Object.entries(pathItem as Record<string, any>)) {
          const lowerMethod = methodKey.toLowerCase();
          if (validMethods.includes(lowerMethod) && op && typeof op === 'object') {
            const operationId = op.operationId || `${lowerMethod}_${pathKey.replace(/[^a-zA-Z0-9]/g, '_')}`;
            operations.push({
              operationId,
              method: lowerMethod.toUpperCase(),
              path: pathKey,
              summary: op.summary || op.description,
            });
          }
        }
      }

      return { title, version, serverUrl, operations };
    } catch (err: any) {
      return { operations: [], error: `JSON Parse error: ${err.message}` };
    }
  }

  // 2. Fallback heuristic parser for basic YAML OpenAPI specifications
  try {
    const lines = trimmed.split('\n');
    let title: string | undefined;
    let version: string | undefined;
    let serverUrl: string | undefined;
    let inPaths = false;
    let currentPath = '';
    let currentMethod = '';
    let currentOpId = '';
    let currentSummary = '';

    const validMethods = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head'];

    const flushCurrentOp = () => {
      if (currentPath && currentMethod) {
        operations.push({
          operationId: currentOpId || `${currentMethod}_${currentPath.replace(/[^a-zA-Z0-9]/g, '_')}`,
          method: currentMethod.toUpperCase(),
          path: currentPath,
          summary: currentSummary || undefined,
        });
      }
      currentMethod = '';
      currentOpId = '';
      currentSummary = '';
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      if (trimmedLine.startsWith('title:') && !title) {
        title = trimmedLine.replace('title:', '').trim().replace(/['"]/g, '');
      } else if (trimmedLine.startsWith('version:') && !version) {
        version = trimmedLine.replace('version:', '').trim().replace(/['"]/g, '');
      } else if (trimmedLine.startsWith('url:') && !serverUrl) {
        serverUrl = trimmedLine.replace('url:', '').trim().replace(/['"]/g, '');
      } else if (line.match(/^paths:\s*$/)) {
        inPaths = true;
      } else if (inPaths) {
        // Exit paths if top-level section reached
        if (line.match(/^[a-zA-Z0-9_-]+:\s*$/) && !line.startsWith(' ') && !line.startsWith('\t')) {
          flushCurrentOp();
          inPaths = false;
          continue;
        }

        // Path declaration: e.g. "  /pets:"
        const pathMatch = line.match(/^\s{2}(\/[a-zA-Z0-9_\-\/{}.]*):\s*$/);
        if (pathMatch) {
          flushCurrentOp();
          currentPath = pathMatch[1];
          continue;
        }

        // Method declaration: e.g. "    get:"
        const methodMatch = line.match(/^\s{4}(get|post|put|delete|patch|options|head):\s*$/i);
        if (methodMatch) {
          flushCurrentOp();
          currentMethod = methodMatch[1].toLowerCase();
          continue;
        }

        // OperationId or Summary inside method
        if (currentMethod) {
          const opIdMatch = line.match(/^\s{6}operationId:\s*(.+)$/);
          if (opIdMatch) {
            currentOpId = opIdMatch[1].trim().replace(/['"]/g, '');
          }
          const summaryMatch = line.match(/^\s{6}summary:\s*(.+)$/);
          if (summaryMatch) {
            currentSummary = summaryMatch[1].trim().replace(/['"]/g, '');
          }
        }
      }
    }
    flushCurrentOp();

    return { title, version, serverUrl, operations };
  } catch (err: any) {
    return { operations: [], error: `YAML parse error: ${err.message}` };
  }
}

/**
 * Creates an OpenAPIToolset ToolDefinition for attachment to an agent.
 */
export function createOpenApiToolsetDefinition(
  config: OpenApiToolsetConfig,
  name?: string
): ToolDefinition {
  const toolName = name || 'OpenAPI Toolset';
  return {
    id: `builtin_openapi_${Date.now()}`,
    name: toolName,
    type: 'api',
    category: 'api',
    builtinType: 'openapi_toolset',
    description: 'Dynamic Google ADK OpenAPIToolset wrapping discovered REST endpoints into model-callable tools.',
    codePrompt: 'Invoke REST API endpoints exposed by the OpenAPI v3 specification with validated parameter schemas and authentication.',
    icon: 'FileCode',
    parameters: {
      operation_id: 'string - Name of the OpenAPI operation to invoke',
      parameters: 'object - URL query, header, or body payload matching the OpenAPI schema',
    },
    openApiToolsetConfig: { ...config },
    enabled: true,
  };
}

/**
 * Generates the Python Google ADK snippet for OpenAPIToolset.
 */
export function generateOpenApiToolsetPythonCode(config: OpenApiToolsetConfig): string {
  const lines: string[] = [
    'from google.adk.tools.openapi_tool.openapi_spec_parser.openapi_toolset import OpenAPIToolset',
  ];

  let specArg = '';
  if (config.specSource === 'inline') {
    lines.push(`SPEC_CONTENT = """${config.specContentOrUri.replace(/"""/g, '\\"\\"\\"')}"""`);
    specArg = 'spec_str=SPEC_CONTENT';
  } else if (config.specSource === 'file') {
    specArg = `spec_file_path=${JSON.stringify(config.specContentOrUri)}`;
  } else {
    specArg = `spec_url=${JSON.stringify(config.specContentOrUri)}`;
  }

  const authArgs: string[] = [];
  if (config.authSchemeType === 'api_key') {
    if (config.envVar) {
      lines.push('import os');
      authArgs.push(`api_key=os.environ.get(${JSON.stringify(config.envVar)})`);
    } else if (config.secretName) {
      authArgs.push(`api_key=load_secret(${JSON.stringify(config.secretName)})`);
    }
    if (config.headerName) {
      authArgs.push(`api_key_header=${JSON.stringify(config.headerName)}`);
    }
  } else if (config.authSchemeType === 'bearer') {
    if (config.envVar) {
      lines.push('import os');
      authArgs.push(`bearer_token=os.environ.get(${JSON.stringify(config.envVar)})`);
    } else if (config.secretName) {
      authArgs.push(`bearer_token=load_secret(${JSON.stringify(config.secretName)})`);
    }
  }

  const filtersArg = config.selectedOperations && config.selectedOperations.length > 0
    ? `, selected_operations=${JSON.stringify(config.selectedOperations)}`
    : '';

  const authStr = authArgs.length > 0 ? `, ${authArgs.join(', ')}` : '';
  lines.push(`\nopenapi_toolset = OpenAPIToolset(\n    ${specArg}${authStr}${filtersArg}\n)`);
  return lines.join('\n');
}

// ============================================================================
// 2. Application Integration Toolset (TASK-228)
// ============================================================================

export interface EnterpriseConnectorPreset {
  id: string;
  name: string;
  defaultEntityOperations: Record<string, ('LIST' | 'GET' | 'CREATE' | 'UPDATE' | 'DELETE')[]>;
  defaultActions: string[];
}

export const ENTERPRISE_CONNECTOR_PRESETS: EnterpriseConnectorPreset[] = [
  {
    id: 'salesforce',
    name: 'Salesforce CRM',
    defaultEntityOperations: {
      Account: ['GET', 'LIST', 'CREATE', 'UPDATE'],
      Contact: ['GET', 'LIST', 'CREATE'],
      Opportunity: ['GET', 'LIST', 'UPDATE'],
    },
    defaultActions: ['execute_soql', 'send_chatter_post'],
  },
  {
    id: 'servicenow',
    name: 'ServiceNow ITSM',
    defaultEntityOperations: {
      Incident: ['GET', 'LIST', 'CREATE', 'UPDATE'],
      ChangeRequest: ['GET', 'LIST', 'CREATE'],
    },
    defaultActions: ['resolve_incident', 'escalate_ticket'],
  },
  {
    id: 'jira',
    name: 'Jira Cloud',
    defaultEntityOperations: {
      Issue: ['GET', 'LIST', 'CREATE', 'UPDATE'],
      Project: ['GET', 'LIST'],
    },
    defaultActions: ['transition_issue', 'add_comment'],
  },
  {
    id: 'sap_erp',
    name: 'SAP ERP (ECC / S/4HANA)',
    defaultEntityOperations: {
      SalesOrder: ['GET', 'LIST', 'CREATE'],
      CustomerMaster: ['GET', 'LIST'],
    },
    defaultActions: ['post_goods_issue', 'simulate_pricing'],
  },
  {
    id: 'workday',
    name: 'Workday HCM',
    defaultEntityOperations: {
      Worker: ['GET', 'LIST'],
      JobProfile: ['GET', 'LIST'],
    },
    defaultActions: ['submit_time_off', 'update_personal_info'],
  },
  {
    id: 'hubspot',
    name: 'HubSpot Marketing & CRM',
    defaultEntityOperations: {
      Contact: ['GET', 'LIST', 'CREATE', 'UPDATE'],
      Company: ['GET', 'LIST'],
      Deal: ['GET', 'LIST', 'CREATE'],
    },
    defaultActions: ['create_timeline_event', 'enroll_sequence'],
  },
];

/**
 * Creates an ApplicationIntegrationToolset ToolDefinition.
 */
export function createApplicationIntegrationToolDefinition(
  config: ApplicationIntegrationConfig,
  name?: string
): ToolDefinition {
  const toolName = name || (
    config.mode === 'connector'
      ? `Connector: ${config.connection || 'Enterprise Connector'}`
      : `Integration: ${config.integration || 'GCP Application Integration'}`
  );

  return {
    id: `builtin_app_integration_${Date.now()}`,
    name: toolName,
    type: 'custom',
    category: 'custom',
    builtinType: 'application_integration',
    description: 'Google ADK ApplicationIntegrationToolset for triggering GCP Application Integrations or invoking Enterprise Integration Connectors.',
    codePrompt: 'Execute enterprise integration flows or perform entity CRUD and actions against connected SaaS backends.',
    icon: 'Radio',
    parameters: {
      action: 'string - The operation or trigger name to run',
      payload: 'object - Input parameters and entity attributes',
    },
    applicationIntegrationConfig: { ...config },
    enabled: true,
  };
}

/**
 * Generates the Python Google ADK snippet for ApplicationIntegrationToolset.
 */
export function generateApplicationIntegrationPythonCode(config: ApplicationIntegrationConfig): string {
  const lines: string[] = [
    'from google.adk.tools.application_integration_tool.application_integration_toolset import ApplicationIntegrationToolset',
  ];

  if (config.mode === 'integration_trigger') {
    const triggers = config.triggers && config.triggers.length > 0
      ? JSON.stringify(config.triggers)
      : '[]';
    lines.push(
      `\napp_integration_toolset = ApplicationIntegrationToolset(\n` +
      `    project=${JSON.stringify(config.project)},\n` +
      `    location=${JSON.stringify(config.location)},\n` +
      `    integration=${JSON.stringify(config.integration || '')},\n` +
      `    triggers=${triggers}\n` +
      `)`
    );
  } else {
    // Connector mode
    const entityOps = config.entityOperations ? JSON.stringify(config.entityOperations, null, 4) : '{}';
    const actions = config.actions ? JSON.stringify(config.actions) : '[]';
    lines.push(
      `\napp_integration_toolset = ApplicationIntegrationToolset(\n` +
      `    project=${JSON.stringify(config.project)},\n` +
      `    location=${JSON.stringify(config.location)},\n` +
      `    connection=${JSON.stringify(config.connection || '')},\n` +
      `    entity_operations=${entityOps},\n` +
      `    actions=${actions}\n` +
      `)`
    );
  }

  return lines.join('\n');
}

// ============================================================================
// 3. Vertex AI RAG Retrieval Tool (TASK-229)
// ============================================================================

/**
 * Creates a VertexAiRagRetrieval ToolDefinition.
 */
export function createVertexAiRagRetrievalToolDefinition(
  config: VertexAiRagRetrievalConfig,
  name?: string
): ToolDefinition {
  const toolName = name || 'Vertex AI RAG Retrieval';
  return {
    id: `builtin_vertex_rag_${Date.now()}`,
    name: toolName,
    type: 'rag',
    category: 'enterprise_search',
    builtinType: 'vertex_ai_rag_retrieval',
    description: 'Grounding via Google Cloud Vertex AI Managed RAG Engine corpora with semantic similarity search.',
    codePrompt: 'Retrieve relevant text passages and chunks from indexed Vertex AI RAG corpora with distance score thresholding.',
    icon: 'Database',
    parameters: {
      query: 'string - The semantic retrieval query',
    },
    vertexAiRagRetrievalConfig: {
      similarityTopK: 5,
      vectorDistanceThreshold: 0.5,
      location: 'global',
      ...config,
    },
    enabled: true,
  };
}

/**
 * Generates the Python Google ADK snippet for VertexAiRagRetrieval.
 */
export function generateVertexAiRagRetrievalPythonCode(config: VertexAiRagRetrievalConfig): string {
  const lines: string[] = [
    'from google.adk.tools.retrieval.vertex_ai_rag_retrieval import VertexAiRagRetrieval',
    'from vertexai.preview import rag',
  ];

  const corporaStr = (config.ragCorpora || [])
    .map((c) => `rag.RagResource(rag_corpus=${JSON.stringify(c)})`)
    .join(', ');

  const topK = config.similarityTopK ?? 5;
  const distance = config.vectorDistanceThreshold ?? 0.5;

  lines.push(
    `\nrag_retrieval_tool = VertexAiRagRetrieval(\n` +
    `    rag_resources=[${corporaStr}],\n` +
    `    similarity_top_k=${topK},\n` +
    `    vector_distance_threshold=${distance}\n` +
    `)`
  );

  return lines.join('\n');
}

// ============================================================================
// 4. Native BigQuery Toolset (TASK-230)
// ============================================================================

export const BIGQUERY_TOOLSET_TOOLS: BigQueryToolsetToolName[] = [
  'list_dataset_ids',
  'get_dataset_info',
  'list_table_ids',
  'get_table_info',
  'execute_sql',
  'forecast',
  'analyze_contribution',
  'ask_data_insights',
];

/**
 * Creates a BigQueryToolset ToolDefinition.
 */
export function createBigQueryToolsetDefinition(
  config: BigQueryToolsetConfig,
  name?: string
): ToolDefinition {
  const toolName = name || 'BigQuery Toolset';
  return {
    id: `builtin_bigquery_toolset_${Date.now()}`,
    name: toolName,
    type: 'database',
    category: 'db',
    builtinType: 'bigquery_toolset',
    description: 'Native Google ADK BigQueryToolset for schema exploration, analytical SQL execution, ML forecasting, and contribution analysis.',
    codePrompt: 'Inspect BigQuery schemas, run read-only or authorized analytical queries, forecast time series data, and analyze key metric drivers.',
    icon: 'BarChart3',
    parameters: {
      query: 'string - SQL query or analytical command to execute in BigQuery',
    },
    bigQueryToolsetConfig: {
      writeMode: 'BLOCKED',
      enabledTools: [...BIGQUERY_TOOLSET_TOOLS],
      maxQueryResultRows: 100,
      ...config,
    },
    enabled: true,
  };
}

/**
 * Generates the Python Google ADK snippet for BigQueryToolset.
 */
export function generateBigQueryToolsetPythonCode(config: BigQueryToolsetConfig): string {
  const lines: string[] = [
    'from google.adk.tools.bigquery import BigQueryToolset, BigQueryCredentialsConfig',
    'from google.adk.tools.bigquery.config import BigQueryToolConfig, WriteMode',
  ];

  const writeModeEnum = `WriteMode.${config.writeMode || 'BLOCKED'}`;
  const maxRows = config.maxQueryResultRows ?? 100;
  const toolFilter = config.enabledTools && config.enabledTools.length > 0
    ? `\n    tool_filter=${JSON.stringify(config.enabledTools)},`
    : '';

  lines.push(
    `\nbigquery_tool_config = BigQueryToolConfig(\n` +
    `    write_mode=${writeModeEnum},\n` +
    `    max_query_result_rows=${maxRows}\n` +
    `)\n\n` +
    `bigquery_toolset = BigQueryToolset(\n` +
    `    tool_config=bigquery_tool_config,` +
    toolFilter +
    `\n)`
  );

  return lines.join('\n');
}

// ============================================================================
// 5. Native Spanner Toolset (TASK-231)
// ============================================================================

export const SPANNER_TOOLSET_TOOLS: SpannerToolsetToolName[] = [
  'execute_sql',
  'list_table_names',
  'get_table_schema',
  'similarity_search',
];

/**
 * Creates a SpannerToolset ToolDefinition.
 */
export function createSpannerToolsetDefinition(
  config: SpannerToolsetConfig,
  name?: string
): ToolDefinition {
  const toolName = name || `Spanner: ${config.databaseId || 'DB'}`;
  return {
    id: `builtin_spanner_toolset_${Date.now()}`,
    name: toolName,
    type: 'database',
    category: 'db',
    builtinType: 'spanner_toolset',
    description: 'Native Google ADK SpannerToolset supporting parameterized SQL, schema inspection, and vector similarity search.',
    codePrompt: 'Query and introspect Google Cloud Spanner databases and execute cosine vector similarity queries against embeddings.',
    icon: 'Database',
    parameters: {
      query: 'string - Parameterized SQL query or search text',
    },
    spannerToolsetConfig: {
      readOnly: true,
      enabledTools: [...SPANNER_TOOLSET_TOOLS],
      ...config,
    },
    enabled: true,
  };
}

/**
 * Generates the Python Google ADK snippet for SpannerToolset.
 */
export function generateSpannerToolsetPythonCode(config: SpannerToolsetConfig): string {
  const lines: string[] = [
    'from google.adk.tools.spanner import SpannerToolset, SpannerCredentialsConfig',
    'from google.adk.tools.spanner.config import SpannerToolSettings',
  ];

  const readOnly = config.readOnly ?? true;
  lines.push(
    `\nspanner_settings = SpannerToolSettings(\n` +
    `    project_id=${JSON.stringify(config.projectId || '')},\n` +
    `    instance_id=${JSON.stringify(config.instanceId || '')},\n` +
    `    database_id=${JSON.stringify(config.databaseId || '')},\n` +
    `    read_only=${readOnly ? 'True' : 'False'}\n` +
    `)\n\n` +
    `spanner_toolset = SpannerToolset(\n` +
    `    settings=spanner_settings\n` +
    `)`
  );

  return lines.join('\n');
}

// ============================================================================
// 6. Computer Use Toolset (TASK-232)
// ============================================================================

/**
 * Creates a ComputerUseToolset ToolDefinition.
 */
export function createComputerUseToolsetDefinition(
  config: ComputerUseConfig,
  name?: string
): ToolDefinition {
  const toolName = name || 'Gemini Computer Use';
  return {
    id: `builtin_computer_use_${Date.now()}`,
    name: toolName,
    type: 'custom',
    category: 'system',
    builtinType: 'computer_use',
    description: 'Gemini Computer Use Toolset enabling browser, Playwright, or desktop automation with screen observation and action taking.',
    codePrompt: 'Observe screen state, take screenshots, click elements, fill forms, and automate interactive browser workflows.',
    icon: 'Terminal',
    parameters: {
      action: 'string - Action to execute: click, type, screenshot, key_press, scroll',
      coordinate: 'array - [x, y] coordinates on the screen if applicable',
      text: 'string - Text to type or input',
    },
    computerUseConfig: {
      screenWidth: 1440,
      screenHeight: 900,
      headless: true,
      allowedDomains: [],
      requireConfirmationOnPurchases: true,
      ...config,
    },
    enabled: true,
  };
}

/**
 * Generates the Python Google ADK snippet for ComputerUseToolset.
 */
export function generateComputerUseToolsetPythonCode(config: ComputerUseConfig): string {
  const lines: string[] = [
    'from google.adk.tools.computer_use.computer_use_toolset import ComputerUseToolset',
  ];

  if (config.environment === 'browserbase') {
    lines.push('from google.adk.tools.computer_use.browserbase import BrowserbaseComputer');
    lines.push(
      `\ncomputer = BrowserbaseComputer(\n` +
      `    screen_size=(${config.screenWidth || 1440}, ${config.screenHeight || 900})\n` +
      `)`
    );
  } else {
    lines.push('from google.adk.tools.computer_use.playwright import PlaywrightComputer');
    lines.push(
      `\ncomputer = PlaywrightComputer(\n` +
      `    headless=${config.headless ? 'True' : 'False'},\n` +
      `    screen_size=(${config.screenWidth || 1440}, ${config.screenHeight || 900})\n` +
      `)`
    );
  }

  lines.push(
    `\ncomputer_use_toolset = ComputerUseToolset(\n` +
    `    computer=computer\n` +
    `)`
  );

  return lines.join('\n');
}

// ============================================================================
// 7. MCP Toolbox for Databases (TASK-233)
// ============================================================================

/**
 * Generates a standard copyable tools.yaml configuration file for MCP Toolbox.
 */
export function generateToolboxToolsYaml(config: ToolboxDatabaseConfig): string {
  const dbKind = config.dbKind || 'alloydb';
  const toolsetName = config.toolsetName || 'my_db_toolset';

  let kindSpecificSection = '';
  switch (dbKind) {
    case 'alloydb':
      kindSpecificSection =
        `  alloydb_source:\n` +
        `    type: alloydb\n` +
        `    cluster: projects/MY_PROJECT/locations/MY_REGION/clusters/MY_CLUSTER\n` +
        `    instance: MY_INSTANCE\n` +
        `    database: MY_DATABASE\n` +
        `    user: postgres\n`;
      break;
    case 'cloud_sql_pg':
      kindSpecificSection =
        `  cloud_sql_pg_source:\n` +
        `    type: postgres\n` +
        `    instance_connection_name: MY_PROJECT:MY_REGION:MY_INSTANCE\n` +
        `    database: MY_DATABASE\n` +
        `    user: postgres\n`;
      break;
    case 'cloud_sql_mysql':
      kindSpecificSection =
        `  cloud_sql_mysql_source:\n` +
        `    type: mysql\n` +
        `    instance_connection_name: MY_PROJECT:MY_REGION:MY_INSTANCE\n` +
        `    database: MY_DATABASE\n` +
        `    user: root\n`;
      break;
    case 'spanner':
      kindSpecificSection =
        `  spanner_source:\n` +
        `    type: spanner\n` +
        `    project: MY_PROJECT\n` +
        `    instance: MY_INSTANCE\n` +
        `    database: MY_DATABASE\n`;
      break;
    case 'neo4j':
      kindSpecificSection =
        `  neo4j_source:\n` +
        `    type: neo4j\n` +
        `    uri: neo4j+s://MY_GRAPH_ID.databases.neo4j.io\n` +
        `    username: neo4j\n`;
      break;
    case 'bigquery':
      kindSpecificSection =
        `  bigquery_source:\n` +
        `    type: bigquery\n` +
        `    project: MY_PROJECT\n`;
      break;
  }

  return (
    `sources:\n` +
    kindSpecificSection +
    `\ntoolsets:\n` +
    `  ${toolsetName}:\n` +
    `    description: "Database tools managed by MCP Toolbox for ${dbKind}"\n` +
    `    tools:\n` +
    `      - execute_sql\n` +
    `      - describe_schema\n`
  );
}

/**
 * Creates a ToolboxDatabase ToolDefinition.
 */
export function createToolboxDatabaseToolDefinition(
  config: ToolboxDatabaseConfig,
  name?: string
): ToolDefinition {
  const toolName = name || `MCP Toolbox: ${config.toolsetName || config.dbKind || 'Databases'}`;
  return {
    id: `builtin_toolbox_db_${Date.now()}`,
    name: toolName,
    type: 'database',
    category: 'db',
    builtinType: 'toolbox_databases',
    description: 'Google Cloud MCP Toolbox for Databases connecting AlloyDB, Cloud SQL, Spanner, and Neo4j via managed toolsets.',
    codePrompt: 'Execute safe SQL queries and inspect relational and graph schemas served by an MCP Toolbox instance.',
    icon: 'Database',
    parameters: {
      tool_name: 'string - Name of the database tool exposed in the toolset',
      parameters: 'object - SQL query parameters or schema inspection arguments',
    },
    toolboxDatabaseConfig: { ...config },
    enabled: true,
  };
}

/**
 * Generates the Python Google ADK snippet for ToolboxToolset.
 */
export function generateToolboxDatabasePythonCode(config: ToolboxDatabaseConfig): string {
  const lines: string[] = [
    'from google.adk.tools.toolbox_toolset import ToolboxToolset',
  ];

  const serverUrl = config.serverUrl || 'http://localhost:5000';
  const toolsetName = config.toolsetName ? `, toolset_name=${JSON.stringify(config.toolsetName)}` : '';

  lines.push(
    `\ntoolbox_toolset = ToolboxToolset(\n` +
    `    server_url=${JSON.stringify(serverUrl)}${toolsetName}\n` +
    `)`
  );

  return lines.join('\n');
}

// ============================================================================
// 8. Built-in Control Flow & Memory Tools (TASK-234)
// ============================================================================

export interface ControlFlowToolDescriptor {
  type: AdkBuiltinToolType;
  name: string;
  description: string;
  codePrompt: string;
  icon: string;
}

export const ADK_CONTROL_FLOW_TOOLS: ControlFlowToolDescriptor[] = [
  {
    type: 'exit_loop',
    name: 'Exit Loop',
    description: 'Signals loop termination to a parent LoopAgent by setting tool_context.actions.escalate = True.',
    codePrompt: 'Call when convergence criteria, completion targets, or maximum iterations are met within a LoopAgent.',
    icon: 'LogOut',
  },
  {
    type: 'transfer_to_agent',
    name: 'Transfer to Agent',
    description: 'Explicitly hands off conversational context and control to a designated peer or parent agent.',
    codePrompt: 'Transfer workflow execution to the designated recipient agent with transfer instructions and context payload.',
    icon: 'ArrowRightCircle',
  },
  {
    type: 'load_memory',
    name: 'Load Memory',
    description: 'Dynamically queries BaseMemoryService for historical user recall, preferences, and cross-session knowledge.',
    codePrompt: 'Query the long-term memory service for user preferences, previous facts, or past conversational context.',
    icon: 'Brain',
  },
  {
    type: 'load_artifacts',
    name: 'Load Artifacts',
    description: 'Loads binary, tabular, or structured user artifacts and session attachments directly into model context.',
    codePrompt: 'Retrieve saved workspace artifacts, uploaded images, generated charts, or evaluation outputs by artifact key.',
    icon: 'Layers',
  },
];

/**
 * Generates the Python import line for selected built-in control flow & memory tools.
 */
export function generateControlFlowToolsPythonImport(toolTypes: AdkBuiltinToolType[]): string {
  const validFlowTypes: AdkBuiltinToolType[] = [
    'exit_loop',
    'transfer_to_agent',
    'load_memory',
    'load_artifacts',
  ];

  const matched = toolTypes.filter((t) => validFlowTypes.includes(t));
  if (matched.length === 0) return '';

  return `from google.adk.tools import ${matched.join(', ')}`;
}

// ============================================================================
// Catalog Aggregations
// ============================================================================

export const ADK_EXTENDED_TOOLSETS: ToolDefinition[] = [
  {
    id: 'builtin_openapi_toolset',
    name: 'OpenAPI Toolset',
    type: 'api',
    category: 'api',
    builtinType: 'openapi_toolset',
    description: 'Dynamic Google ADK OpenAPIToolset wrapping discovered REST endpoints into model-callable tools.',
    codePrompt: 'Invoke REST API endpoints exposed by the OpenAPI v3 specification with validated parameter schemas and authentication.',
    icon: 'FileCode',
    parameters: {
      operation_id: 'string - Name of the OpenAPI operation to invoke',
      parameters: 'object - URL query, header, or body payload matching the OpenAPI schema',
    },
    openApiToolsetConfig: {
      specSource: 'inline',
      specContentOrUri: '{\n  "openapi": "3.0.0",\n  "info": { "title": "API", "version": "1.0.0" },\n  "paths": {}\n}',
      specType: 'json',
      authSchemeType: 'none',
    },
    enabled: true,
  },
  {
    id: 'builtin_application_integration',
    name: 'Application Integration & Connectors',
    type: 'custom',
    category: 'custom',
    builtinType: 'application_integration',
    description: 'GCP Application Integration and Enterprise Integration Connectors (Salesforce, ServiceNow, Jira, SAP ERP, Workday, HubSpot).',
    codePrompt: 'Trigger enterprise integration pipelines or query connected enterprise application entities.',
    icon: 'Radio',
    parameters: {
      action: 'string - The operation or trigger name to run',
      payload: 'object - Input parameters and entity attributes',
    },
    applicationIntegrationConfig: {
      mode: 'connector',
      project: '',
      location: 'global',
      connection: 'salesforce',
      entityOperations: {
        Account: ['GET', 'LIST', 'CREATE'],
      },
      actions: ['execute_soql'],
    },
    enabled: true,
  },
  {
    id: 'builtin_vertex_ai_rag_retrieval',
    name: 'Vertex AI RAG Retrieval',
    type: 'rag',
    category: 'enterprise_search',
    builtinType: 'vertex_ai_rag_retrieval',
    description: 'Grounding via Google Cloud Vertex AI Managed RAG Engine corpora with semantic similarity search.',
    codePrompt: 'Retrieve relevant text passages and chunks from indexed Vertex AI RAG corpora with distance score thresholding.',
    icon: 'Database',
    parameters: {
      query: 'string - The semantic retrieval query',
    },
    vertexAiRagRetrievalConfig: {
      ragCorpora: [],
      similarityTopK: 5,
      vectorDistanceThreshold: 0.5,
      location: 'global',
    },
    enabled: true,
  },
  {
    id: 'builtin_bigquery_toolset',
    name: 'Native BigQuery Toolset',
    type: 'database',
    category: 'db',
    builtinType: 'bigquery_toolset',
    description: 'Native Google ADK BigQueryToolset for schema exploration, analytical SQL execution, ML forecasting, and contribution analysis.',
    codePrompt: 'Inspect BigQuery schemas, run read-only or authorized analytical queries, forecast time series data, and analyze key metric drivers.',
    icon: 'BarChart3',
    parameters: {
      query: 'string - SQL query or analytical command to execute in BigQuery',
    },
    bigQueryToolsetConfig: {
      writeMode: 'BLOCKED',
      enabledTools: [...BIGQUERY_TOOLSET_TOOLS],
      maxQueryResultRows: 100,
    },
    enabled: true,
  },
  {
    id: 'builtin_spanner_toolset',
    name: 'Native Spanner Toolset',
    type: 'database',
    category: 'db',
    builtinType: 'spanner_toolset',
    description: 'Native Google ADK SpannerToolset supporting parameterized SQL, schema inspection, and vector similarity search.',
    codePrompt: 'Query and introspect Google Cloud Spanner databases and execute cosine vector similarity queries against embeddings.',
    icon: 'Database',
    parameters: {
      query: 'string - Parameterized SQL query or search text',
    },
    spannerToolsetConfig: {
      projectId: '',
      instanceId: '',
      databaseId: '',
      readOnly: true,
      enabledTools: [...SPANNER_TOOLSET_TOOLS],
    },
    enabled: true,
  },
  {
    id: 'builtin_computer_use',
    name: 'Gemini Computer Use',
    type: 'custom',
    category: 'system',
    builtinType: 'computer_use',
    description: 'Gemini Computer Use Toolset enabling browser, Playwright, or desktop automation with screen observation and action taking.',
    codePrompt: 'Observe screen state, take screenshots, click elements, fill forms, and automate interactive browser workflows.',
    icon: 'Terminal',
    parameters: {
      action: 'string - Action to execute: click, type, screenshot, key_press, scroll',
      coordinate: 'array - [x, y] coordinates on the screen if applicable',
      text: 'string - Text to type or input',
    },
    computerUseConfig: {
      environment: 'playwright_chromium',
      screenWidth: 1440,
      screenHeight: 900,
      headless: true,
      allowedDomains: [],
      requireConfirmationOnPurchases: true,
    },
    enabled: true,
  },
  {
    id: 'builtin_toolbox_databases',
    name: 'MCP Toolbox for Databases',
    type: 'database',
    category: 'db',
    builtinType: 'toolbox_databases',
    description: 'Google Cloud MCP Toolbox for Databases connecting AlloyDB, Cloud SQL, Spanner, and Neo4j via managed toolsets.',
    codePrompt: 'Execute safe SQL queries and inspect relational and graph schemas served by an MCP Toolbox instance.',
    icon: 'Database',
    parameters: {
      tool_name: 'string - Name of the database tool exposed in the toolset',
      parameters: 'object - SQL query parameters or schema inspection arguments',
    },
    toolboxDatabaseConfig: {
      serverUrl: 'http://localhost:5000',
      toolsetName: 'database_tools',
      dbKind: 'alloydb',
    },
    enabled: true,
  },
];

export const ADK_CONTROL_FLOW_TOOL_DEFINITIONS: ToolDefinition[] = ADK_CONTROL_FLOW_TOOLS.map((cf) => ({
  id: `builtin_${cf.type}`,
  name: cf.name,
  type: 'custom',
  category: 'system',
  builtinType: cf.type,
  description: cf.description,
  codePrompt: cf.codePrompt,
  icon: cf.icon,
  parameters: {
    details: 'string - Control signal or query parameter payload',
  },
  enabled: true,
}));

export const ALL_ADK_BUILTIN_TOOLS: ToolDefinition[] = [
  ...ADK_EXTENDED_TOOLSETS,
  ...ADK_CONTROL_FLOW_TOOL_DEFINITIONS,
];
