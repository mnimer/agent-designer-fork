export type FrameworkType = 'google_adk' | 'langgraph';
export type LanguageType = 'python' | 'typescript';
export type AgentKind = 'standard' | 'a2a' | 'router';
export type DelegationPattern = 
  | 'sequential' 
  | 'parallel' 
  | 'router' 
  | 'loop' 
  | 'debate'
  | 'consensus'
  | 'review_critique' 
  | 'iterative_refinement' 
  | 'coordinator' 
  | 'hierarchical_decomposition';

export type TriggerType = 'chat' | 'pubsub' | 'scheduled' | 'tester' | 'eventarc';

export interface TestPrompt {
  id: string;
  name: string;
  prompt: string;
  expectedOutput: string;
  assertionType?: 'contains' | 'exact' | 'json_schema' | 'llm_eval';
  status?: 'passed' | 'failed' | 'pending';
}

export interface TriggerConfig {
  // Chat
  initialMessage?: string;
  streaming?: boolean;
  sessionMemory?: 'in_memory' | 'firestore' | 'redis';
  // PubSub
  topic?: string;
  subscription?: string;
  ackDeadlineSeconds?: number;
  messageFormat?: 'json' | 'protobuf' | 'text';
  autoRegisterSubscription?: boolean;
  // Scheduled
  cronExpression?: string;
  timezone?: string;
  retryCount?: number;
  scheduleInterval?: string;
  // Tester
  testPayload?: string;
  expectedOutput?: string;
  testPrompts?: TestPrompt[];
  runOnCI?: boolean;
  // EventArc
  eventarcCategory?: string;
  eventarcEvent?: string;
  eventarcServiceName?: string;
  eventarcServiceAccount?: string;
  eventarcRegion?: string;
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

export type McpTransportType = 'stdio' | 'sse' | 'http';

export interface McpToolConfig {
  serverName: string;
  transport: McpTransportType;
  command?: string;
  args?: string[];
  serverUrl?: string;
  envVars?: Record<string, string>;
  headers?: Record<string, string>;
  exposedTools?: string[];
  autoApproveTools?: string[];
  timeoutSeconds?: number;
}

export interface ToolDefinition {
  id: string;
  name: string;
  type: 'search' | 'code' | 'api' | 'db' | 'custom' | 'rag' | 'mcp';
  description: string;
  codePrompt?: string; // Describes what the code in the tool should do (e.g. "Call twitter api endpoint...")
  endpointUrl?: string;
  authKeyEnv?: string;
  codeSnippet?: string;
  icon?: string;
  parameters?: Record<string, string>;
  enabled?: boolean;
  mcpConfig?: McpToolConfig;
}

export interface SubAgentRef {
  agentId: string;
  name: string;
  role: string;
  delegationType?: string;
}

export type AgentMemoryType = 
  | 'none'
  | 'langgraph_in_memory'
  | 'postgres'
  | 'redis'
  | 'firestore'
  | 'sqlite'
  | 'window_buffer'
  | 'summary_buffer'
  | 'vector_rag'
  | 'entity_fact';

export interface AgentMemoryConfig {
  type: AgentMemoryType;
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
  sqlitePath?: string;
  // Vector / Semantic RAG settings
  vectorProvider?: 'pgvector' | 'chroma' | 'pinecone' | 'qdrant' | 'weaviate';
  embeddingModel?: string;
  topK?: number;
  similarityThreshold?: number;
  // Entity / Knowledge Fact settings
  userIdKey?: string;
  extractUserFacts?: boolean;
}

export type A2AAuthType = 'bearer' | 'oauth2' | 'google_iam' | 'api_key' | 'mutual_tls' | 'none';

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

export interface A2AConfig {
  connectionMode?: 'url' | 'json_pack';
  endpoint: string;
  protocolVersion: string;
  agentCardUrl: string;
  rawJsonPack?: string;
  authType: A2AAuthType;
  authTokenSecret?: string;
  headerName?: string;
  oauth2Config?: A2AOAuthConfig;
  googleIamConfig?: A2AGoogleIamConfig;
  customHeaders?: Record<string, string>;
  timeoutSeconds?: number;
  maxRetries?: number;
  capabilities: string[];
}

export type RouterEvaluationMode = 
  | 'boolean_expression' 
  | 'llm_classifier' 
  | 'threshold_score' 
  | 'pattern_match';

export interface RouterBranchCondition {
  id: string;
  label: string;
  conditionExpression?: string;
  targetAgentId?: string;
  isDefault?: boolean;
  isDefaultFallback?: boolean;
  description?: string;
}

export interface RouterConfig {
  evaluationMode: RouterEvaluationMode;
  routingPrompt?: string;
  llmEvaluationPrompt?: string;
  expressionVariable?: string;
  thresholdValue?: number;
  fallbackBranch?: string;
  defaultBranchLabel?: string;
  routingStrategy?: 'first_match' | 'highest_confidence' | 'all_matching';
  branches: RouterBranchCondition[];
}

export type SchemaFieldType = 'string' | 'number' | 'boolean' | 'array' | 'object' | 'enum';

export interface StructuredOutputField {
  id: string;
  name: string;
  type: SchemaFieldType;
  description?: string;
  required: boolean;
  arrayItemType?: SchemaFieldType;
  enumValues?: string[];
  defaultValue?: string;
}

export type StructuredOutputFormat = 'text' | 'json_schema' | 'pydantic' | 'list_of_objects';

export interface StructuredOutputSchema {
  enabled: boolean;
  formatType: StructuredOutputFormat;
  name: string;
  description?: string;
  strict?: boolean;
  fields: StructuredOutputField[];
  pydanticClassName?: string;
  rawJsonSchema?: string;
}

export type DebateStyle = 'structured_rebuttal' | 'free_form' | 'socratic' | 'panel_scoring';
export type TieBreakerStrategy = 'conditional_approval' | 'conservative_veto' | 'moderator_vote';

export interface DebateConfig {
  maxRounds: number; // e.g. 1 to 10 (default: 2 or 3)
  consensusThreshold: number; // 0.0 to 1.0 (e.g. 0.85)
  earlyStoppingEnabled: boolean; // Exit early if consensus threshold met
  debateStyle?: DebateStyle;
  tieBreakerStrategy?: TieBreakerStrategy;
  minWordLimitPerBrief?: number;
  requireEvidenceCitations?: boolean;
}

export interface AgentData extends Record<string, unknown> {
  id: string;
  label: string;
  role: string;
  model: string;
  systemPrompt: string;
  temperature: number;
  maxIterations?: number;
  agentKind?: AgentKind;
  a2aConfig?: A2AConfig;
  routerConfig?: RouterConfig;
  debateConfig?: DebateConfig;
  structuredOutput?: StructuredOutputSchema;
  tools: ToolDefinition[];
  subAgents: SubAgentRef[];
  subAgentPattern?: DelegationPattern;
  memoryType?: AgentMemoryType;
  memoryConfig?: AgentMemoryConfig;
  outputFormat?: 'text' | 'json_schema' | 'structured';
  isStartNode?: boolean;
  isOrchestrator?: boolean;
  isEvaluator?: boolean;
  isDebateNode?: boolean;
  status?: 'idle' | 'running' | 'ready' | 'error';
  colorTheme?: string;
  // Handlers for custom actions
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  onAddTool?: (agentId: string) => void;
  onAddSpecificTool?: (agentId: string, tool: ToolDefinition) => void;
  onRemoveTool?: (agentId: string, toolId: string) => void;
  onReorderSubAgents?: (agentId: string, startIndex: number, endIndex: number) => void;
  onUpdateSubAgentPattern?: (agentId: string, pattern: DelegationPattern) => void;
  onUpdateMemoryConfig?: (agentId: string, memoryConfig: AgentMemoryConfig) => void;
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

export interface GeneratedFile {
  name?: string;
  path?: string;
  language?: 'python' | 'typescript' | 'markdown' | 'json' | string;
  content: string;
  description?: string;
}

export interface GenerationConfig {
  framework: FrameworkType;
  language: LanguageType;
  outputFolder: string;
  includeTests: boolean;
  includeDocker: boolean;
  useStreaming: boolean;
  deploymentTarget?: 'cloud_run' | 'agent_engine';
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
}
