/**
 * agentSpec.ts - Canonical Domain Type Definitions for Agent Flow Designer
 *
 * This file serves as the single source of truth for all core domain models
 * across both the extension host (Node/backend) and the webview interface (React/frontend).
 * It consolidates duplicated interfaces, enforces consistent structural patterns,
 * and maintains backward-compatibility across all system components.
 *
 * Architectural Decisions:
 * 1. Single Source of Truth: All modifications to core agent, trigger, or tool models must occur here.
 * 2. Inclusive Unification: Merge type fields from both webview types and shared types to prevent parsing or serialization issues.
 * 3. Backward Compatibility: Maintain alias names (e.g., framework targets, branch types) to prevent compile regressions.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

// ============================================================================
// 1. Core Platform & Target Configurations
// ============================================================================

export type FrameworkType = 'google_adk' | 'langgraph';
export type FrameworkTarget = 'google-adk' | 'langgraph' | 'google_adk';

export type LanguageType = 'python' | 'typescript';
export type LanguageTarget = 'python' | 'typescript';

export type AgentKind = 'standard' | 'a2a' | 'router' | 'synthesizer' | 'hitl' | 'fallback' | 'guardrail';

export type DelegationPattern = 
  | 'sequential' 
  | 'parallel' 
  | 'loop' 
  | 'coordinator'
  // Legacy / fallback patterns
  | 'router' 
  | 'debate'
  | 'consensus'
  | 'review_critique' 
  | 'iterative_refinement' 
  | 'hierarchical_decomposition';

export interface DelegationPatternOption {
  id: DelegationPattern;
  label: string;
  desc: string;
}

export const ADK_DELEGATION_PATTERNS: DelegationPatternOption[] = [
  { id: 'sequential', label: 'Sequential', desc: 'Linear pipeline execution (SequentialAgent)' },
  { id: 'parallel', label: 'Parallel', desc: 'Concurrent async dispatch (ParallelAgent)' },
  { id: 'loop', label: 'Loop', desc: 'Iterative execution up to max iterations (LoopAgent)' },
  { id: 'coordinator', label: 'Coordinator', desc: 'LLM dynamic routing and delegation (Agent with sub_agents)' },
];

// ============================================================================
// 2. Model & Execution Configurations
// ============================================================================

/**
 * ModelConfig - Defines parameters for model execution and adaptive reasoning
 *
 * @author Mike Nimer <mikenimer@google.com>
 */
export interface ModelConfig {
  model: string;
  temperature?: number;
  topP?: number;
  maxOutputTokens?: number;
  thinkingBudget?: number; // Thinking budget for next-gen reasoning models (e.g. Gemini 3.7 Flash)
}

// ============================================================================
// 3. Trigger Configurations & QA Test Suites
// ============================================================================

export type TriggerType = 'chat' | 'pubsub' | 'scheduled' | 'tester' | 'eventarc';
export type TriggerKind = 'test' | 'chat' | 'pubsub' | 'scheduled' | 'eventarc' | 'manual' | 'webhook' | 'cron';

export interface TestPrompt {
  id: string;
  name?: string;
  prompt?: string;
  text?: string; // Compatibility alias for prompt text
  expectedOutput?: string;
  assertionType?: 'contains' | 'exact' | 'json_schema' | 'llm_eval';
  status?: 'passed' | 'failed' | 'pending';
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
  messageFormat: 'json' | 'raw' | 'cloudevent' | 'protobuf' | 'text';
}

export interface ScheduledTriggerConfig {
  cronExpression: string;
  timeZone: string;
}

export interface EventArcEventType {
  id: string;
  name: string;
  fullEvent: string;
  description: string;
}

export interface EventArcCategory {
  id: string;
  name: string;
  serviceName: string;
  events: EventArcEventType[];
}

export interface EventarcTriggerConfig {
  provider: 'storage' | 'auth' | 'audit_log' | 'custom' | string;
  eventType: string;
  category?: string;
  serviceName?: string;
  serviceAccount?: string;
  region?: string;
}

/**
 * TriggerConfig - Unified trigger properties container
 *
 * @author Mike Nimer <mikenimer@google.com>
 */
export interface TriggerConfig {
  // Chat
  initialMessage?: string;
  welcomeMessage?: string;
  suggestedPrompts?: string[];
  streaming?: boolean;
  sessionMemory?: 'in_memory' | 'firestore' | 'redis';
  
  // PubSub
  topic?: string;
  topicPath?: string;
  subscription?: string;
  subscriptionId?: string;
  ackDeadlineSeconds?: number;
  messageFormat?: 'json' | 'protobuf' | 'text' | 'raw' | 'cloudevent';
  autoRegisterSubscription?: boolean;
  
  // Scheduled / Cron
  cronExpression?: string;
  timezone?: string;
  timeZone?: string; // Compatibility alias
  retryCount?: number;
  scheduleInterval?: string;
  
  // Tester / QA
  testPayload?: string;
  expectedOutput?: string;
  testPrompts?: TestPrompt[];
  testScenarios?: TestSuiteScenario[];
  runOnCI?: boolean;
  
  // EventArc
  eventarcCategory?: string;
  eventarcEvent?: string;
  eventarcServiceName?: string;
  eventarcServiceAccount?: string;
  eventarcRegion?: string;
  provider?: string;
  eventType?: string;
}

export interface TriggerNodeData {
  label: string;
  description?: string;
  triggerKind?: TriggerKind;
  triggerType?: string | TriggerType;
  config?: TriggerConfig & Record<string, any>;
  testConfig?: TestSuiteTriggerConfig;
  chatConfig?: ChatTriggerConfig;
  pubsubConfig?: PubSubTriggerConfig;
  scheduledConfig?: ScheduledTriggerConfig;
  eventarcConfig?: EventarcTriggerConfig;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  onReconnectRoot?: (triggerId: string, newRootAgentId: string) => void;
  [key: string]: any;
}

export interface TriggerData extends Record<string, unknown> {
  id: string;
  label: string;
  triggerType: TriggerType;
  description: string;
  config: TriggerConfig;
  targetRootAgentId?: string;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  onReconnectRoot?: (triggerId: string, newRootAgentId: string) => void;
}

// ============================================================================
// 4. MCP & External Tool Integrations
// ============================================================================

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

// ============================================================================
// 5. Tool Configurations
// ============================================================================

export type ToolCategory = 
  | 'grounding' 
  | 'enterprise_search' 
  | 'system' 
  | 'custom' 
  | 'mcp' 
  | 'api' 
  | 'db' 
  | 'code' 
  | 'rag' 
  | 'builtin'
  | 'google_cloud_mcp';

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

/**
 * ToolDefinition - Complete canonical descriptor of standard or custom tool parameters
 *
 * @author Mike Nimer <mikenimer@google.com>
 */
export interface ToolDefinition {
  id: string;
  name: string;
  type: 'builtin' | 'rest' | 'mcp' | 'code' | 'custom' | 'database' | 'search' | 'api' | 'db' | 'rag' | string;
  category?: ToolCategory | string;
  builtinType?: AdkBuiltinToolType;
  description: string;
  codePrompt?: string; 
  endpointUrl?: string;
  httpMethod?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  authKeyEnv?: string;
  secretManagerKey?: string;
  headers?: Record<string, string>;
  timeoutSeconds?: number;
  codeSnippet?: string;
  icon?: string;
  parameters?: Record<string, string>;
  enabled?: boolean;
  config?: Record<string, unknown>;
  mcpConfig?: McpToolConfig;
  vertexAiSearchConfig?: VertexAiSearchConfig;
  googleSearchConfig?: GoogleSearchConfig;
  requestInputConfig?: RequestInputConfig;
  agentAsToolConfig?: AgentAsToolConfig;
}

export type AgentToolConfig = ToolDefinition;

/**
 * ToolBinding - Describes a tool and its execution overrides bound to a specific agent
 *
 * @author Mike Nimer <mikenimer@google.com>
 */
export interface ToolBinding {
  toolId: string;
  enabled?: boolean;
  configOverrides?: Record<string, unknown>;
}

// ============================================================================
// 6. Memory & Checkpointing Configurations
// ============================================================================

export type AgentMemoryType = 
  | 'none'
  | 'in_memory'
  | 'langgraph_in_memory'
  | 'firestore'
  | 'postgres'
  | 'cloud_sql'
  | 'spanner'
  | 'redis'
  | 'sqlite'
  | 'window_buffer'
  | 'summary_buffer'
  | 'vector_rag'
  | 'entity_fact';

export type MemoryType = 
  | 'none' 
  | 'in_memory'
  | 'buffer' 
  | 'firestore' 
  | 'redis' 
  | 'postgres' 
  | 'cloud_sql'
  | 'spanner'
  | 'sqlite' 
  | 'window_buffer'
  | 'summary_buffer'
  | 'vector_rag' 
  | 'entity_fact'
  | 'langgraph_in_memory' 
  | string;

export interface AgentMemoryConfig {
  type: AgentMemoryType | MemoryType;
  // Threading / Session IDs
  threadIdKey?: string;
  // Window / Token / Summary
  windowTurns?: number;
  maxTokens?: number;
  summaryModel?: string;
  // Database / Checkpointer settings
  connectionEnvVar?: string;
  tableName?: string;
  ttlSeconds?: number;
  collectionName?: string;
  databaseId?: string;
  projectId?: string;
  instanceConnectionName?: string;
  databaseName?: string;
  databaseUrlSecret?: string;
  instanceId?: string;
  // Cloud Memorystore (Redis / Valkey) parameters
  redisHost?: string;
  redisPort?: number;
  authSecretName?: string;
  sqlitePath?: string;
  // Vector / Semantic RAG settings
  vectorProvider?: 'pgvector' | 'chroma' | 'pinecone' | 'qdrant' | 'weaviate';
  embeddingModel?: string;
  topK?: number;
  similarityThreshold?: number;
  // Entity / Knowledge Fact settings
  userIdKey?: string;
  extractUserFacts?: boolean;
  [key: string]: any;
}

// ============================================================================
// 7. Router Configurations
// ============================================================================

export type RouterEvaluationMode = 
  | 'boolean'
  | 'boolean_expression' 
  | 'intent_classifier'
  | 'llm_classifier' 
  | 'numeric_threshold'
  | 'threshold_score' 
  | 'pattern_match';

export interface RouterBranchCondition {
  id: string;
  label?: string;
  conditionExpression?: string;
  condition?: string;
  targetAgentId?: string;
  isDefault?: boolean;
  isDefaultFallback?: boolean;
  description?: string;
}

export type RouterBranch = RouterBranchCondition;

export interface RouterConfig {
  evaluationMode: RouterEvaluationMode;
  routingPrompt?: string;
  classifierPrompt?: string;
  llmEvaluationPrompt?: string;
  expressionVariable?: string;
  thresholdValue?: number;
  fallbackBranch?: string;
  defaultBranchLabel?: string;
  routingStrategy?: 'first_match' | 'highest_confidence' | 'all_matching';
  branches: RouterBranchCondition[];
}

export type RouterAgentConfig = RouterConfig;

// ============================================================================
// 8. Agent-to-Agent (A2A) Configurations
// ============================================================================

export type A2AAuthType = 'bearer' | 'oauth2' | 'google_iam' | 'api_key' | 'mutual_tls' | 'none' | 'apiKey' | 'iam';

export interface A2AOAuthConfig {
  tokenUrl?: string;
  clientId?: string;
  clientSecretEnv?: string;
  scope?: string;
  audience?: string;
}

export interface A2AGoogleIamConfig {
  targetAudience?: string;
  serviceAccountEnv?: string;
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

export interface A2AConfig {
  connectionMode?: 'url' | 'json_pack';
  endpoint?: string; // Standardized
  endpointUrl?: string; // Compatibility alias
  protocolVersion: string;
  agentCardUrl: string;
  rawJsonPack?: string;
  authType: A2AAuthType;
  authTokenSecret?: string;
  authSecretKey?: string; // Compatibility alias
  iamTargetAudience?: string; // Compatibility alias
  headerName?: string;
  oauth2Config?: A2AOAuthConfig;
  googleIamConfig?: A2AGoogleIamConfig;
  customHeaders?: Record<string, string>;
  timeoutSeconds?: number;
  maxRetries?: number;
  capabilities: string[];
  skills?: A2AAgentSkill[];
  iconUrl?: string;
  preferredTransport?: string;
  delegationPrompt?: string;
}

export type A2AAgentConfig = A2AConfig;

export interface NormalizedA2AConfig {
  endpoint: string;
  protocolVersion: string;
  agentCardUrl: string;
  authType: 'bearer' | 'apiKey' | 'api_key' | 'oauth2' | 'iam' | 'google_iam';
  authSecretKey?: string;
  headerName: string;
  timeoutSeconds: number;
  maxRetries: number;
  customHeaders: Record<string, string>;
  capabilities: string[];
  skills?: any[];
  iconUrl?: string;
  preferredTransport?: string;
  delegationPrompt?: string;
}

/**
 * Normalizes varied visual designer A2A config shapes into a uniform internal representation.
 *
 * @param config Raw A2A config from canvas or inspector
 * @returns Standardized NormalizedA2AConfig
 */
export function normalizeA2AConfig(config?: Partial<A2AAgentConfig> & Record<string, any>): NormalizedA2AConfig {
  const endpoint = config?.endpoint || config?.endpointUrl || config?.url || 'https://api.agent-network.internal/a2a/v1';
  const protocolVersion = config?.protocolVersion || config?.version || '1.0.0-a2a';
  const agentCardUrl = config?.agentCardUrl || '/.well-known/agent-card.json';
  const authType = (config?.authType as any) || (endpoint.includes('googleapis.com') ? 'google_iam' : 'bearer');
  const authSecretKey = config?.authTokenSecret || config?.authSecretKey || 'A2A_AGENT_AUTH_TOKEN';
  const headerName = config?.headerName || 'X-API-Key';
  const timeoutSeconds = config?.timeoutSeconds ?? 30;
  const maxRetries = config?.maxRetries ?? 3;
  const customHeaders = config?.customHeaders || {};
  const capabilities = Array.isArray(config?.capabilities) ? config.capabilities : [];
  const skills = Array.isArray(config?.skills) ? config.skills : [];
  const iconUrl = config?.iconUrl;
  const preferredTransport = config?.preferredTransport || 'INTERNAL_HTTP+JSON';
  const delegationPrompt = config?.delegationPrompt;

  return {
    endpoint,
    protocolVersion,
    agentCardUrl,
    authType,
    authSecretKey,
    headerName,
    timeoutSeconds,
    maxRetries,
    customHeaders,
    capabilities,
    skills,
    iconUrl,
    preferredTransport,
    delegationPrompt,
  };
}

// ============================================================================
// 9. Structured Output Schema Settings
// ============================================================================

export type SchemaFieldType = 'string' | 'number' | 'boolean' | 'array' | 'object' | 'enum';

export interface StructuredOutputField {
  id?: string;
  name: string;
  type: SchemaFieldType;
  description?: string;
  required?: boolean;
  arrayItemType?: SchemaFieldType;
  itemType?: string; // Compatibility alias
  enumValues?: string[];
  defaultValue?: string;
}

export type SchemaField = StructuredOutputField;

export type StructuredOutputFormat = 'text' | 'json_schema' | 'pydantic' | 'list_of_objects';

export interface StructuredOutputSchema {
  enabled: boolean;
  formatType?: StructuredOutputFormat;
  name?: string;
  description?: string;
  strict?: boolean;
  fields: StructuredOutputField[];
  pydanticClassName?: string;
  rawJsonSchema?: string;
}

// ============================================================================
// 10. Multi-Agent Debate Configurations
// ============================================================================

export type DebateStyle = 'structured_rebuttal' | 'free_form' | 'socratic' | 'panel_scoring';
export type TieBreakerStrategy = 'conditional_approval' | 'conservative_veto' | 'moderator_vote';

export interface DebateConfig {
  maxRounds: number;
  consensusThreshold: number;
  earlyStoppingEnabled: boolean;
  debateStyle?: DebateStyle;
  tieBreakerStrategy?: TieBreakerStrategy;
  minWordLimitPerBrief?: number;
  requireEvidenceCitations?: boolean;
}

// ============================================================================
// 11. Orchestration Configurations
// ============================================================================

export interface SynthesizerConfig {
  inputStateKeys?: string[];
  reductionStrategy?: 'concatenate' | 'merge_json' | 'summarize';
  outputSchemaName?: string;
}

export interface HitlConfig {
  approvalCondition?: string;
  timeoutHours?: number;
  autoRejectOnTimeout?: boolean;
  notificationPayload?: string;
  approverRoles?: string[];
  requestPrompt?: string;
  approvedAgentId?: string;
  rejectedAgentId?: string;
}

export interface FallbackConfig {
  maxRetries?: number;
  retryDelaySeconds?: number;
  caughtErrorCodes?: string[];
  fallbackStrategy?: 'switch_agent' | 'return_static' | 'retry_with_backoff';
  primaryTargetAgentId?: string;
  fallbackTargetAgentId?: string;
  staticFallbackMessage?: string;
}

export interface GuardrailConfig {
  direction?: 'ingress' | 'egress' | 'both';
  safetyPolicies?: ('pii' | 'prompt_injection' | 'toxicity' | 'hallucination' | 'secrets')[];
  regexPatterns?: string[];
  blockedKeywords?: string[];
  actionOnViolation?: 'block' | 'redact' | 'warn';
  customViolationMessage?: string;
  passTargetAgentId?: string;
  blockTargetAgentId?: string;
}

/**
 * SubAgentRef - Reference to a child delegated agent
 *
 * @author Mike Nimer <mikenimer@google.com>
 */
export interface SubAgentRef {
  agentId: string;
  name: string;
  role: string;
  delegationType?: string;
}

/**
 * SubAgentConfig - Standard configuration representing a delegated sub-agent
 *
 * @author Mike Nimer <mikenimer@google.com>
 */
export interface SubAgentConfig {
  agentId: string;
  name: string;
  role: string;
  delegationType?: string;
}

/**
 * AgentNodeData - The canonical data format for an Agent Node on the react-flow canvas
 *
 * @author Mike Nimer <mikenimer@google.com>
 */
export interface AgentNodeData {
  label: string;
  name?: string;
  identifier?: string;
  description?: string;
  role: string;
  model?: string;
  systemPrompt?: string;
  temperature?: number;
  maxIterations?: number;
  agentKind?: AgentKind;
  a2aConfig?: A2AConfig;
  routerConfig?: RouterConfig;
  debateConfig?: DebateConfig;
  synthesizerConfig?: SynthesizerConfig;
  hitlConfig?: HitlConfig;
  fallbackConfig?: FallbackConfig;
  guardrailConfig?: GuardrailConfig;
  structuredOutput?: StructuredOutputSchema;
  structuredOutputSchema?: StructuredOutputSchema; // Compatibility alias
  standardConfig?: any; // Compatibility alias
  tools?: ToolDefinition[];
  subAgents?: SubAgentRef[];
  subAgentPattern?: DelegationPattern;
  memoryType?: AgentMemoryType | MemoryType;
  memoryConfig?: AgentMemoryConfig;
  outputFormat?: 'text' | 'json_schema' | 'structured';
  isStartNode?: boolean;
  isOrchestrator?: boolean;
  isEvaluator?: boolean;
  isDebateNode?: boolean;
  status?: 'idle' | 'running' | 'ready' | 'success' | 'error';
  colorTheme?: string;
  // Handlers for custom actions
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  onAddTool?: (agentId: string) => void;
  onAddSpecificTool?: (agentId: string, tool: ToolDefinition) => void;
  onRemoveTool?: (agentId: string, toolId: string) => void;
  onReorderSubAgents?: (agentId: string, startIndex: number, endIndex: number) => void;
  onUpdateSubAgentPattern?: (agentId: string, pattern: DelegationPattern) => void;
  onUpdateMaxIterations?: (agentId: string, maxIterations: number) => void;
  onUpdateMemoryConfig?: (agentId: string, memoryConfig: AgentMemoryConfig) => void;
  [key: string]: any;
}

export type AgentData = AgentNodeData;

// ============================================================================
// 12. Workflow Canvas Document & States
// ============================================================================

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

export interface GeneratedFile {
  name?: string;
  path?: string;
  language?: 'python' | 'typescript' | 'markdown' | 'json' | string;
  content: string;
  description?: string;
}

export interface GenerationConfig {
  framework: FrameworkType | FrameworkTarget;
  language: LanguageType | LanguageTarget;
  outputFolder: string;
  includeTests: boolean;
  includeDocker: boolean;
  useStreaming: boolean;
  deploymentTarget?: 'cloud_run' | 'agent_engine';
  deployedResourceId?: string;
  serviceUrl?: string;
  consoleUrl?: string;
  deployedAt?: string;
}

export type DeploymentTarget = 'local' | 'agent_engine' | 'cloud_run';

export interface DeploymentConfig {
  target: DeploymentTarget;
  port?: number;
  localMode?: string;
  localPort?: number;
  environmentVariables?: Record<string, string>;
  gcpProjectId?: string;
  gcpRegion?: string;
  cloudRunServiceName?: string;
  cloudRunService?: string;
  cloudRunProject?: string;
  cloudRunRegion?: string;
  cloudRunCpu?: string;
  cloudRunMemory?: string;
  cloudRunAllowUnauthenticated?: boolean;
  agentEngineProject?: string;
  agentEngineRegion?: string;
  agentEngineRuntime?: string;
  agentEngineAppId?: string;
  minInstances?: number;
  maxInstances?: number;
  cpu?: string;
  memory?: string;
  allowUnauthenticated?: boolean;
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

export interface WorkflowState {
  nodes: any[];
  edges: any[];
  config: GenerationConfig;
  deploymentConfig?: DeploymentConfig;
  selectedAgentId?: string | null;
  selectedTriggerId?: string | null;
  sampleId?: string;
}

export interface AgentFileTab {
  id: string;
  filename: string;
  title: string;
  isDirty?: boolean;
  nodes: any[];
  edges: any[];
  config: GenerationConfig;
  deploymentConfig?: DeploymentConfig;
  selectedAgentId?: string | null;
  selectedTriggerId?: string | null;
  sampleId?: string;
}

/**
 * Definition of a pre-configured sample workflow blueprint (.agent)
 * displayed in the Samples gallery and instantiated onto the canvas.
 *
 * Architectural Decisions:
 * - Author: Mike Nimer <mikenimer@google.com>
 * - Added optional `readmeContent` property so sample cards in the palette can
 *   open an Information dialog displaying the full README description.
 */
export interface SampleWorkflowDefinition {
  id: string;
  name: string;
  filename: string;
  category: string;
  badge: string;
  description: string;
  features: string[];
  nodesCount: number;
  toolsCount: number;
  triggerType: string;
  iconName: string;
  color: string;
  nodes: any[];
  edges: any[];
  config?: Partial<GenerationConfig>;
  deploymentConfig?: Partial<DeploymentConfig>;
  testPrompts?: TestPrompt[];
  sourceFilePath?: string;
  readmeContent?: string;
}

export type PatternType = 
  | 'sequential'
  | 'parallel'
  | 'router'
  | 'loop'
  | 'debate'
  | 'consensus'
  | 'review_critique'
  | 'iterative_refinement'
  | 'coordinator'
  | 'hierarchical_decomposition'
  | 'multi_agent_workflow'
  | 'parallel_agent'
  | 'loop_agent';

export interface PatternDefinition {
  id: string;
  name: string;
  description: string;
  iconName: string;
  badge: string;
  type: PatternType;
}
