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

export type ToolCategory = 'grounding' | 'enterprise_search' | 'system' | 'custom' | 'mcp' | 'api' | 'db' | 'code' | 'rag' | 'builtin';

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

export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  type: 'builtin' | 'rest' | 'mcp' | 'code' | 'custom' | 'database' | 'search' | 'api' | 'db' | 'rag' | string;
  category?: ToolCategory | string;
  builtinType?: AdkBuiltinToolType;
  config?: Record<string, unknown>;
  vertexAiSearchConfig?: VertexAiSearchConfig;
  googleSearchConfig?: GoogleSearchConfig;
  requestInputConfig?: RequestInputConfig;
  agentAsToolConfig?: AgentAsToolConfig;
  parameters?: Record<string, string>;
  codePrompt?: string;
  endpointUrl?: string;
  authKeyEnv?: string;
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

export interface RouterBranch {
  id: string;
  condition: string;
  targetAgentId?: string;
  isDefault?: boolean;
}

export interface RouterAgentConfig {
  evaluationMode: 'boolean' | 'intent_classifier' | 'numeric_threshold';
  model?: string;
  classifierPrompt?: string;
  branches: RouterBranch[];
}

export interface A2AAgentConfig {
  protocolVersion: string;
  endpointUrl: string;
  agentCardUrl: string;
  authType: 'bearer' | 'apiKey' | 'oauth2' | 'iam';
  authSecretKey?: string;
  iamTargetAudience?: string;
  capabilities: string[];
}

export interface AgentNodeData {
  label: string;
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
