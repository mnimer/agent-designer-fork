/**
 * Shared Type Definitions for Agent Flow Builder
 * Defines the schema for .agent workflow JSON documents, node configurations,
 * tool descriptors, structured output schemas, and test scenarios.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

export type AgentKind = 'standard' | 'router' | 'a2a';
export type TriggerKind = 'test' | 'chat' | 'pubsub' | 'scheduled' | 'eventarc';
export type FrameworkTarget = 'google-adk' | 'langgraph';
export type LanguageTarget = 'python' | 'typescript';
export type MemoryType = 'none' | 'buffer' | 'firestore';

export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  type: 'builtin' | 'rest' | 'mcp' | 'code';
  config?: Record<string, unknown>;
}

export interface SchemaField {
  id: string;
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'enum';
  description: string;
  required: boolean;
  enumValues?: string[];
  itemType?: string;
}

export interface StructuredOutputSchema {
  enabled: boolean;
  name: string;
  description: string;
  strict: boolean;
  fields: SchemaField[];
}

export interface StandardAgentConfig {
  model: string;
  systemInstruction: string;
  temperature: number;
  topP: number;
  maxOutputTokens: number;
  tools: ToolDefinition[];
  memory: MemoryType;
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
  agentKind: AgentKind;
  standardConfig?: StandardAgentConfig;
  routerConfig?: RouterAgentConfig;
  a2aConfig?: A2AAgentConfig;
  status?: 'idle' | 'running' | 'success' | 'error';
}

export interface TestSuiteTriggerConfig {
  testScenarios: {
    id: string;
    name: string;
    inputQuery: string;
    expectedOutputPattern?: string;
  }[];
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
  triggerKind: TriggerKind;
  testConfig?: TestSuiteTriggerConfig;
  chatConfig?: ChatTriggerConfig;
  pubsubConfig?: PubSubTriggerConfig;
  scheduledConfig?: ScheduledTriggerConfig;
  eventarcConfig?: EventarcTriggerConfig;
}

export interface WorkflowNode {
  id: string;
  type: 'agent' | 'trigger';
  position: {
    x: number;
    y: number;
  };
  data: AgentNodeData | TriggerNodeData;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  label?: string;
  data?: {
    branchId?: string;
    conditionExpression?: string;
  };
}

export interface ViewportState {
  x: number;
  y: number;
  zoom: number;
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
  metadata?: {
    createdAt: string;
    updatedAt: string;
    author?: string;
  };
}
