/**
 * Shared Type Definitions for Agent Flow Builder
 * Defines the schema for .agent workflow JSON documents, node configurations,
 * tool descriptors, structured output schemas, and test scenarios.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

export type AgentKind = 'standard' | 'router' | 'a2a';
export type TriggerKind = 'test' | 'chat' | 'pubsub' | 'scheduled' | 'eventarc' | 'manual' | 'webhook' | 'cron';
export type FrameworkTarget = 'google-adk' | 'langgraph';
export type LanguageTarget = 'python' | 'typescript';
export type MemoryType = 'none' | 'buffer' | 'firestore' | 'redis' | 'postgres' | 'sqlite' | 'vector_rag' | 'langgraph_in_memory' | string;

export type ToolCategory = 'grounding' | 'enterprise_search' | 'system' | 'custom' | 'mcp' | 'api' | 'db' | 'code' | 'rag' | 'builtin' | 'google_cloud_mcp';

export type GoogleCloudMcpDomain =
  | 'databases_storage'
  | 'compute_containers'
  | 'ai_search_agent'
  | 'analytics_etl_governance'
  | 'management_observability_security'
  | 'developer_workspace';

export type GoogleCloudLaunchStage = 'GA' | 'Preview' | 'Beta';

export interface GoogleCloudMcpServerDefinition {
  id: string;
  name: string;
  description: string;
  domain: GoogleCloudMcpDomain;
  launchStage: GoogleCloudLaunchStage;
  defaultEndpoint: string;
  regionalEndpointPattern?: string;
  supportedRegions?: string[];
  toolsets?: string[];
  docUrl?: string;
  icon?: string;
  defaultScopes?: string[];
  isMultiEndpoint?: boolean;
}

export type AdkBuiltinToolType = 
  | 'google_search' 
  | 'vertex_ai_search' 
  | 'load_web_page' 
  | 'request_input' 
  | 'preload_memory' 
  | 'code_execution' 
  | 'agent_as_tool';

export interface VertexAiSearchConfig {
  dataStoreId?: string;
  location?: string;
  project?: string;
  engineId?: string;
  maxResults?: number;
}

export interface GoogleSearchConfig {
  domainFilters?: string[];
  dynamicThreshold?: number;
}

export interface RequestInputConfig {
  prompt?: string;
  timeoutSeconds?: number;
}

export interface AgentAsToolConfig {
  subAgentId?: string;
  subAgentName?: string;
  subAgentDescription?: string;
}

export type McpTransportType = 'stdio' | 'sse' | 'http';

export type McpAuthProviderType = 'none' | 'google_credentials' | 'bearer_token';

export interface McpOAuthConfig {
  scopes?: string[];
  projectId?: string;
}

export interface McpSecretConfig {
  secretName?: string;
  envVar?: string;
  authUrl?: string;
  tokenUrl?: string;
  clientId?: string;
  clientSecret?: string;
  scopes?: string[];
  hasToken?: boolean;
  tokenPreview?: string;
  bearerToken?: string;
}

export interface McpToolConfig {
  serverName: string;
  transport: McpTransportType;
  command?: string;
  args?: string[];
  cwd?: string;
  serverUrl?: string;
  envVars?: Record<string, string>;
  headers?: Record<string, string>;
  exposedTools?: string[];
  autoApproveTools?: string[];
  timeoutSeconds?: number;
  authProviderType?: McpAuthProviderType;
  oauthConfig?: McpOAuthConfig;
  secretConfig?: McpSecretConfig;
  discoveredTools?: ToolDefinition[];
  region?: string;
  selectedToolset?: string;
  launchStage?: GoogleCloudLaunchStage;
}

export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  type: 'builtin' | 'rest' | 'mcp' | 'code' | 'custom' | 'database' | 'search' | 'api' | 'db' | 'rag' | string;
  category?: ToolCategory | string;
  builtinType?: AdkBuiltinToolType;
  config?: Record<string, unknown>;
  mcpConfig?: McpToolConfig;
  vertexAiSearchConfig?: VertexAiSearchConfig;
  googleSearchConfig?: GoogleSearchConfig;
  requestInputConfig?: RequestInputConfig;
  agentAsToolConfig?: AgentAsToolConfig;
  parameters?: Record<string, string>;
  codePrompt?: string;
  endpointUrl?: string;
  httpMethod?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  authKeyEnv?: string;
  secretManagerKey?: string;
  headers?: Record<string, string>;
  timeoutSeconds?: number;
  enabled?: boolean;
}

export type AgentToolConfig = ToolDefinition;

export interface SchemaField {
  id?: string;
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'enum';
  description?: string;
  required?: boolean;
  enumValues?: string[];
  itemType?: string;
}

export interface StructuredOutputSchema {
  enabled: boolean;
  name?: string;
  description?: string;
  strict?: boolean;
  fields: SchemaField[];
}

export interface StandardAgentConfig {
  model: string;
  systemInstruction: string;
  temperature?: number;
  topP?: number;
  maxOutputTokens?: number;
  tools: ToolDefinition[];
  memory?: MemoryType;
  structuredOutput?: StructuredOutputSchema;
  outputSchema?: StructuredOutputSchema;
  firestoreConfig?: {
    collectionName: string;
  };
}

export type RouterEvaluationMode =
  | 'boolean'
  | 'boolean_expression'
  | 'intent_classifier'
  | 'llm_classifier'
  | 'numeric_threshold'
  | 'threshold_score'
  | 'pattern_match';

export interface RouterBranch {
  id: string;
  label?: string;
  condition?: string;
  conditionExpression?: string;
  targetAgentId?: string;
  isDefault?: boolean;
  isDefaultFallback?: boolean;
  description?: string;
}

export interface RouterAgentConfig {
  evaluationMode: RouterEvaluationMode;
  model?: string;
  classifierPrompt?: string;
  routingPrompt?: string;
  llmEvaluationPrompt?: string;
  expressionVariable?: string;
  thresholdValue?: number;
  fallbackBranch?: string;
  routingStrategy?: 'first_match' | 'highest_confidence' | 'all_matching';
  branches: RouterBranch[];
}

export interface A2AAgentSkill {
  id: string;
  name: string;
  description: string;
  tags?: string[];
  examples?: string[];
  inputModes?: string[];
  outputModes?: string[];
}

export interface A2AAgentConfig {
  protocolVersion: string;
  endpointUrl: string;
  agentCardUrl: string;
  authType: 'bearer' | 'apiKey' | 'oauth2' | 'iam';
  authSecretKey?: string;
  iamTargetAudience?: string;
  capabilities: string[];
  skills?: A2AAgentSkill[];
  iconUrl?: string;
  preferredTransport?: string;
  delegationPrompt?: string;
}

export interface AgentNodeData {
  label: string;
  name?: string;
  description?: string;
  agentKind?: AgentKind;
  model?: string;
  systemPrompt?: string;
  temperature?: number;
  memoryType?: MemoryType;
  tools?: ToolDefinition[];
  structuredOutputSchema?: StructuredOutputSchema;
  standardConfig?: StandardAgentConfig;
  routerConfig?: RouterAgentConfig;
  a2aConfig?: A2AAgentConfig;
  status?: 'idle' | 'running' | 'success' | 'error';
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  onAddTool?: (agentId: string) => void;
  onRemoveTool?: (agentId: string, toolId: string) => void;
  [key: string]: any;
}

export interface TestSuiteScenario {
  id: string;
  name: string;
  inputQuery: string;
  expectedOutputPattern?: string;
  expectedOutput?: string;
  assertionType?: 'contains' | 'exact' | 'json_schema' | 'llm_eval';
  expectedSchema?: any;
  [key: string]: any;
}

export type TriggerTestScenario = TestSuiteScenario;

export interface TestPrompt {
  id: string;
  name?: string;
  prompt?: string;
  text?: string;
  [key: string]: any;
}

export interface TestSuiteTriggerConfig {
  testScenarios: TestSuiteScenario[];
  testPrompts?: TestPrompt[];
}

export interface ChatTriggerConfig {
  welcomeMessage: string;
  suggestedPrompts: string[];
}

export interface PubSubTriggerConfig {
  topicPath: string;
  subscriptionId: string;
  ackDeadlineSeconds: number;
  messageFormat: 'json' | 'raw' | 'cloudevent';
}

export interface ScheduledTriggerConfig {
  cronExpression: string;
  timeZone: string;
}

export interface EventarcTriggerConfig {
  provider: 'storage' | 'auth' | 'audit_log' | 'custom';
  eventType: string;
}

export interface TriggerNodeData {
  label: string;
  description?: string;
  triggerKind?: TriggerKind;
  triggerType?: string;
  config?: Record<string, any>;
  testConfig?: TestSuiteTriggerConfig;
  chatConfig?: ChatTriggerConfig;
  pubsubConfig?: PubSubTriggerConfig;
  scheduledConfig?: ScheduledTriggerConfig;
  eventarcConfig?: EventarcTriggerConfig;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  [key: string]: any;
}

export interface WorkflowNode {
  id: string;
  type: 'agent' | 'trigger' | string;
  position: {
    x: number;
    y: number;
  };
  data: AgentNodeData | TriggerNodeData | any;
  selected?: boolean;
}

export type AgentWorkflowNode = WorkflowNode;

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  label?: string;
  animated?: boolean;
  data?: {
    branchId?: string;
    conditionExpression?: string;
    [key: string]: any;
  };
}

export type AgentWorkflowEdge = WorkflowEdge;

export interface ViewportState {
  x: number;
  y: number;
  zoom: number;
}

export interface WorkflowMetadata {
  createdAt?: string;
  updatedAt?: string;
  author?: string;
  outputFolder?: string;
  [key: string]: any;
}

export interface PluginSettings {
  defaultAgentTheme?: string;
  useStreamingByDefault?: boolean;
  geminiApiKey?: string;
  targetFramework?: FrameworkTarget;
  targetLanguage?: LanguageTarget;
  [key: string]: any;
}

export interface WorkflowDeploymentConfig {
  target: 'agent_engine' | 'cloud_run' | string;
  deploymentTarget?: 'agent_engine' | 'cloud_run' | string;
  outputFolder: string;
  framework: FrameworkTarget | string;
  language: LanguageTarget | string;
  includeTests?: boolean;
  includeDocker?: boolean;
  useStreaming?: boolean;
  [key: string]: any;
}

export interface AgentWorkflowDocument {
  version: string;
  name: string;
  description: string;
  framework: FrameworkTarget;
  language: LanguageTarget;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  viewport?: ViewportState;
  metadata?: WorkflowMetadata;
  deployment?: WorkflowDeploymentConfig;
}
