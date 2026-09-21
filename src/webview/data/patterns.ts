/**
 * patterns.ts - Predefined Agent Architectures, Workflows, and Node Initializers
 *
 * Purpose:
 * Defines preset workflow architectures (sequential, parallel, router, coordinator),
 * default node factories, and topology initializers. Automatically computes valid Python
 * identifiers for new nodes so that agent names and identifiers are strictly valid.
 *
 * Author: Mike Nimer <mikenimer@google.com>
 */

import { Node, Edge } from '@xyflow/react';
import { AgentData, PatternDefinition, PatternType, AgentKind, TriggerData, TriggerType } from '../types';
import { AVAILABLE_TOOLS } from './defaultTools';
import { TRIGGER_CATALOG } from './triggerDefinitions';
import { getLayoutedElements } from '../utils/layout';
import { sanitizeAgentIdentifier } from '../../shared/identifierValidation';

export const PATTERN_DEFINITIONS: PatternDefinition[] = [
  {
    id: 'pattern_sequential',
    name: 'Sequential Pipeline',
    description: 'Prompt Chaining • 3 agents in linear sequence (Planner → Executor → Reviewer)',
    iconName: 'Workflow',
    badge: 'Prompt Chaining',
    type: 'sequential',
    colorTheme: 'blue',
  },
  {
    id: 'pattern_parallel',
    name: 'Parallel / Fan-Out',
    description: 'Fan-Out & Synthesize • 1 Orchestrator concurrently dispatching to 3 domain sub-agents',
    iconName: 'GitFork',
    badge: 'Fan-Out & Synthesize',
    type: 'parallel',
    colorTheme: 'emerald',
  },
  {
    id: 'pattern_router',
    name: 'Router',
    description: 'Classify & Route • Dynamic intent classifier delegating to 3 specialized branch experts',
    iconName: 'Network',
    badge: 'Classify & Route',
    type: 'router',
    colorTheme: 'amber',
  },
  {
    id: 'pattern_loop',
    name: 'Evaluator-Optimizer',
    description: 'Generate & Refine Loop • Cyclic quality feedback loop between Generator and Evaluator',
    iconName: 'Repeat',
    badge: 'Generate & Refine',
    type: 'loop',
    colorTheme: 'purple',
  },
  {
    id: 'pattern_debate',
    name: 'Multi-Agent Debate',
    description: 'Consensus & Panel • Proponent & Opponent agents debate across rounds to reach Judge consensus',
    iconName: 'Scale',
    badge: 'Consensus Panel',
    type: 'debate',
    colorTheme: 'pink',
  },
  {
    id: 'pattern_hierarchical_decomposition',
    name: 'Hierarchical Delegation',
    description: 'Supervisor-Workers • Multi-tier supervisor delegating sub-tasks to Domain Leads & Workers',
    iconName: 'Layers',
    badge: 'Supervisor-Workers',
    type: 'hierarchical_decomposition',
    colorTheme: 'indigo',
  },
  {
    id: 'pattern_review_critique',
    name: 'Review & Critique',
    description: 'Triad Consensus • Author drafts proposal, Critic reviews, Editor synthesizes final artifact',
    iconName: 'CheckSquare',
    badge: 'Triad Review',
    type: 'review_critique',
    colorTheme: 'rose',
  },
  {
    id: 'pattern_coordinator',
    name: 'Coordinator',
    description: 'Central Supervisor • Maintains shared state and manages dynamic handoffs across sub-agents',
    iconName: 'Compass',
    badge: 'Central State',
    type: 'coordinator',
    colorTheme: 'cyan',
  },
];

export interface BasicAgentTypeDefinition {
  kind: AgentKind;
  name: string;
  badge: string;
  colorTheme: 'blue' | 'cyan' | 'purple' | 'emerald' | 'amber' | 'rose' | 'teal';
  description: string;
  iconName: 'Bot' | 'Globe2' | 'Split' | 'Layers' | 'ShieldAlert' | 'LifeBuoy' | 'ShieldCheck';
}

export const CORE_AGENT_TYPES: BasicAgentTypeDefinition[] = [
  {
    kind: 'standard',
    name: 'Agent',
    badge: 'Standard',
    colorTheme: 'blue',
    description: 'LLM agent with tools & system instructions',
    iconName: 'Bot',
  },
  {
    kind: 'a2a',
    name: 'A2A Agent',
    badge: 'Protocol',
    colorTheme: 'cyan',
    description: 'Decentralized JSON-RPC A2A agent endpoint',
    iconName: 'Globe2',
  },
];

export const FLOW_CONTROL_AGENT_TYPES: BasicAgentTypeDefinition[] = [
  {
    kind: 'router',
    name: 'Router',
    badge: 'Branching',
    colorTheme: 'purple',
    description: 'Conditional branching & if/else routing',
    iconName: 'Split',
  },
  {
    kind: 'synthesizer',
    name: 'Synthesizer',
    badge: 'Reducer',
    colorTheme: 'emerald',
    description: 'Aggregates state & formats structured JSON',
    iconName: 'Layers',
  },
  {
    kind: 'hitl',
    name: 'Approval Gate',
    badge: 'HITL',
    colorTheme: 'amber',
    description: 'Human review & gatekeeper pause',
    iconName: 'ShieldAlert',
  },
  {
    kind: 'fallback',
    name: 'Fallback',
    badge: 'Resilience',
    colorTheme: 'rose',
    description: 'Circuit breaker & quota fallback',
    iconName: 'LifeBuoy',
  },
  {
    kind: 'guardrail',
    name: 'Guardrail',
    badge: 'Shield',
    colorTheme: 'teal',
    description: 'Pre/post-flight safety & PII scrubbing',
    iconName: 'ShieldCheck',
  },
];

export const BASIC_AGENT_TYPES: BasicAgentTypeDefinition[] = [
  ...CORE_AGENT_TYPES,
  ...FLOW_CONTROL_AGENT_TYPES,
];

let idCounter = 0;
export const getNextId = (prefix = 'agent') => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 4)}`;

export function createSingleAgentNode(
  x: number, 
  y: number, 
  customLabel?: string, 
  customRole?: string,
  agentKind: AgentKind = 'standard',
  defaults?: Partial<AgentData>
): Node<AgentData> {
  const prefix = agentKind === 'a2a' 
    ? 'a2a_agent' 
    : agentKind === 'router' 
    ? 'router_node' 
    : agentKind === 'synthesizer'
    ? 'synthesizer_agent'
    : agentKind === 'hitl'
    ? 'hitl_agent'
    : agentKind === 'fallback'
    ? 'fallback_agent'
    : agentKind === 'guardrail'
    ? 'guardrail_agent'
    : 'agent';
  const id = getNextId(prefix);
  const agentLabel = customLabel || (
    agentKind === 'router' 
      ? `Router (if/else) ${++idCounter}` 
      : agentKind === 'a2a' 
      ? `A2A Agent ${++idCounter}` 
      : agentKind === 'synthesizer'
      ? `Synthesizer ${++idCounter}`
      : agentKind === 'hitl'
      ? `Approval Gate ${++idCounter}`
      : agentKind === 'fallback'
      ? `Fallback ${++idCounter}`
      : agentKind === 'guardrail'
      ? `Guardrail ${++idCounter}`
      : `Agent ${++idCounter}`
  );
  const agentName = sanitizeAgentIdentifier(defaults?.identifier || defaults?.name || agentLabel || id);

  if (agentKind === 'synthesizer') {
    return {
      id,
      type: 'agentNode',
      position: { x, y },
      data: {
        id,
        label: agentLabel,
        name: agentName,
        identifier: agentName,
        role: customRole || defaults?.role || 'Aggregates and synthesizes upstream state into structured output',
        model: defaults?.model || 'gemini-3.8-flash',
        systemPrompt: defaults?.systemPrompt || 'You are a synthesis agent. You aggregate upstream analysis, research, and data from state variables into a coherent, structured response adhering strictly to the output schema.',
        temperature: defaults?.temperature !== undefined ? defaults.temperature : 0.2,
        maxIterations: 5,
        agentKind: 'synthesizer',
        synthesizerConfig: defaults?.synthesizerConfig || {
          inputStateKeys: ['research_summary', 'extracted_data'],
          reductionStrategy: 'summarize',
          outputSchemaName: 'SynthesizedOutput',
        },
        structuredOutput: defaults?.structuredOutput || {
          enabled: true,
          formatType: 'json_schema',
          name: 'SynthesizedOutput',
          fields: [
            {
              id: 'f1',
              name: 'summary',
              type: 'string',
              required: true,
              description: 'Comprehensive synthesized summary',
            },
          ],
        },
        tools: [],
        subAgents: [],
        subAgentPattern: defaults?.subAgentPattern || 'parallel',
        memoryType: defaults?.memoryType || 'none',
        memoryConfig: defaults?.memoryConfig || {
          type: defaults?.memoryType || 'none',
        },
        outputFormat: 'structured',
        colorTheme: 'green',
        ...defaults,
      },
    };
  }

  if (agentKind === 'hitl') {
    return {
      id,
      type: 'agentNode',
      position: { x, y },
      data: {
        id,
        label: agentLabel,
        name: agentName,
        identifier: agentName,
        role: customRole || defaults?.role || 'Human-in-the-loop approval gatekeeper and authorization checkpoint',
        model: defaults?.model || 'gemini-3.8-flash',
        systemPrompt: defaults?.systemPrompt || 'Pause workflow execution and solicit explicit human authorization before continuing.',
        temperature: defaults?.temperature !== undefined ? defaults.temperature : 0.0,
        maxIterations: 3,
        agentKind: 'hitl',
        hitlConfig: defaults?.hitlConfig || {
          approvalCondition: "state.requires_review == True",
          timeoutHours: 24,
          autoRejectOnTimeout: true,
          notificationPayload: 'Human approval required before continuing workflow',
          requestPrompt: 'Please review and approve the proposed action.',
        },
        tools: [],
        subAgents: [],
        subAgentPattern: defaults?.subAgentPattern || 'sequential',
        memoryType: defaults?.memoryType || 'none',
        memoryConfig: defaults?.memoryConfig || {
          type: defaults?.memoryType || 'none',
        },
        outputFormat: 'text',
        colorTheme: 'amber',
        ...defaults,
      },
    };
  }

  if (agentKind === 'fallback') {
    return {
      id,
      type: 'agentNode',
      position: { x, y },
      data: {
        id,
        label: agentLabel,
        name: agentName,
        identifier: agentName,
        role: customRole || defaults?.role || 'Circuit breaker and graceful degradation fallback handler',
        model: defaults?.model || 'gemini-3.8-flash',
        systemPrompt: defaults?.systemPrompt || 'Catch runtime exceptions, rate limit quotas (429), and remote service outages to gracefully reroute execution.',
        temperature: defaults?.temperature !== undefined ? defaults.temperature : 0.1,
        maxIterations: 5,
        agentKind: 'fallback',
        fallbackConfig: defaults?.fallbackConfig || {
          maxRetries: 3,
          retryDelaySeconds: 2,
          caughtErrorCodes: ['429', '503', 'RESOURCE_EXHAUSTED', 'TIMEOUT'],
          fallbackStrategy: 'switch_agent',
          staticFallbackMessage: 'Primary agent unavailable. Workflow gracefully routed to fallback safety handler.',
        },
        tools: [],
        subAgents: [],
        subAgentPattern: defaults?.subAgentPattern || 'sequential',
        memoryType: defaults?.memoryType || 'none',
        memoryConfig: defaults?.memoryConfig || {
          type: defaults?.memoryType || 'none',
        },
        outputFormat: 'text',
        colorTheme: 'rose',
        ...defaults,
      },
    };
  }

  if (agentKind === 'guardrail') {
    return {
      id,
      type: 'agentNode',
      position: { x, y },
      data: {
        id,
        label: agentLabel,
        name: agentName,
        identifier: agentName,
        role: customRole || defaults?.role || 'Pre/post-flight security shield, PII sanitizer, and content filter',
        model: defaults?.model || 'gemini-3.8-flash',
        systemPrompt: defaults?.systemPrompt || 'Inspect input prompts and agent responses against safety policies, redacting sensitive PII and blocking toxic content.',
        temperature: defaults?.temperature !== undefined ? defaults.temperature : 0.0,
        maxIterations: 3,
        agentKind: 'guardrail',
        guardrailConfig: defaults?.guardrailConfig || {
          direction: 'ingress',
          safetyPolicies: ['pii', 'prompt_injection', 'toxicity', 'secrets'],
          regexPatterns: [],
          blockedKeywords: [],
          actionOnViolation: 'block',
          customViolationMessage: 'Content blocked: Security policy guardrail violation detected.',
        },
        tools: [],
        subAgents: [],
        subAgentPattern: defaults?.subAgentPattern || 'sequential',
        memoryType: defaults?.memoryType || 'none',
        memoryConfig: defaults?.memoryConfig || {
          type: defaults?.memoryType || 'none',
        },
        outputFormat: 'text',
        colorTheme: 'teal',
        ...defaults,
      },
    };
  }

  if (agentKind === 'router') {
    return {
      id,
      type: 'agentNode',
      position: { x, y },
      data: {
        id,
        label: agentLabel,
        name: agentName,
        identifier: agentName,
        role: customRole || 'Conditional router evaluating workflow branching logic (if/else)',
        model: defaults?.model || 'gemini-3.7-flash',
        systemPrompt: 'You evaluate the execution context and state variables to route execution flow to the appropriate downstream agent branch.',
        temperature: defaults?.temperature !== undefined ? defaults.temperature : 0.1,
        maxIterations: 5,
        agentKind: 'router',
        routerConfig: {
          evaluationMode: 'boolean_expression',
          expressionVariable: 'status',
          branches: [
            {
              id: 'branch_if_1',
              label: 'If: Verified / Passed',
              conditionExpression: "state.status == 'passed' or state.score >= 0.8",
              isDefaultFallback: false,
            },
            {
              id: 'branch_else_2',
              label: 'Else: Refactor / Retry',
              conditionExpression: "state.status != 'passed'",
              isDefaultFallback: true,
            },
          ],
          defaultBranchLabel: 'Else: Fallback',
          routingStrategy: 'first_match',
          thresholdValue: 0.8,
          llmEvaluationPrompt: 'Classify whether the prior step succeeded. Output either "passed" or "failed".',
        },
        tools: [],
        subAgents: [],
        subAgentPattern: defaults?.subAgentPattern || 'router',
        memoryType: defaults?.memoryType || 'in_memory',
        memoryConfig: defaults?.memoryConfig || {
          type: defaults?.memoryType || 'in_memory',
          windowTurns: 10,
          maxTokens: 4096,
        },
        outputFormat: 'text',
        colorTheme: 'purple',
        ...defaults,
      },
    };
  }

  if (agentKind === 'a2a') {
    return {
      id,
      type: 'agentNode',
      position: { x, y },
      data: {
        id,
        label: agentLabel,
        name: agentName,
        identifier: agentName,
        role: customRole || defaults?.role || '',
        model: defaults?.model || 'gemini-3.7-flash',
        systemPrompt: defaults?.systemPrompt || '',
        temperature: defaults?.temperature !== undefined ? defaults.temperature : 0.2,
        maxIterations: 10,
        agentKind: 'a2a',
        a2aConfig: {
          endpoint: '',
          protocolVersion: '',
          agentCardUrl: '',
          rawJsonPack: '',
          authType: 'bearer',
          authTokenSecret: '',
          capabilities: [],
          skills: [],
          customHeaders: {},
        },
        tools: defaults?.tools || [],
        subAgents: [],
        subAgentPattern: defaults?.subAgentPattern || 'parallel',
        memoryType: defaults?.memoryType || 'in_memory',
        memoryConfig: defaults?.memoryConfig || {
          type: defaults?.memoryType || 'in_memory',
          windowTurns: 10,
          maxTokens: 4096,
        },
        outputFormat: 'json_schema',
        colorTheme: 'cyan',
        ...defaults,
      },
    };
  }

  return {
    id,
    type: 'agentNode',
    position: { x, y },
    data: {
      id,
      label: agentLabel,
      name: agentName,
      identifier: agentName,
      role: customRole || 'Specialized AI Assistant',
      model: defaults?.model || 'gemini-3.7-flash',
      systemPrompt: defaults?.systemPrompt || '',
      temperature: defaults?.temperature !== undefined ? defaults.temperature : 0.7,
      maxIterations: 10,
      agentKind: 'standard',
      tools: defaults?.tools || [],
      subAgents: defaults?.subAgents || [],
      subAgentPattern: defaults?.subAgentPattern || 'parallel',
      memoryType: defaults?.memoryType || 'in_memory',
      memoryConfig: defaults?.memoryConfig || {
        type: defaults?.memoryType || 'in_memory',
        windowTurns: 10,
        maxTokens: 4096,
      },
      outputFormat: 'text',
      colorTheme: 'blue',
      ...defaults,
    },
  };
}

export function createSingleTriggerNode(
  x: number,
  y: number,
  triggerType: TriggerType = 'chat',
  rootAgentId?: string
): Node<TriggerData> {
  const catalogItem = TRIGGER_CATALOG.find((t) => t.type === triggerType) || TRIGGER_CATALOG[0];
  const id = getNextId(`trigger_${triggerType}`);

  return {
    id,
    type: 'triggerNode',
    position: { x, y },
    data: {
      id,
      label: catalogItem.name,
      triggerType,
      description: catalogItem.description,
      config: { ...catalogItem.defaultConfig },
      targetRootAgentId: rootAgentId,
    },
  };
}

export function generateRawPattern(
  type: PatternType,
  startX: number,
  startY: number
): { nodes: Node<AgentData>[]; edges: Edge[] } {
  // Normalize alias types
  const normalizedType = 
    type === 'multi_agent_workflow' ? 'sequential' :
    type === 'parallel_agent' ? 'parallel' :
    type === 'loop_agent' ? 'loop' : type;

  if (normalizedType === 'sequential') {
    // 3 agents in sequence: Planner -> Executor -> Reviewer
    const id1 = getNextId('planner');
    const id2 = getNextId('executor');
    const id3 = getNextId('reviewer');

    const node1: Node<AgentData> = {
      id: id1,
      type: 'agentNode',
      position: { x: startX, y: startY },
      data: {
        id: id1,
        label: 'Research Planner',
        role: 'Breaks complex goals into step-by-step tasks and execution plans.',
        model: 'gemini-3.7-flash',
        systemPrompt: 'Decompose user requirements into structured execution phases with clear success criteria.',
        temperature: 0.3,
        tools: [AVAILABLE_TOOLS[0]], // Google Search
        subAgents: [],
        subAgentPattern: 'sequential',
        memoryType: 'in_memory',
        memoryConfig: {
          type: 'in_memory',
          windowTurns: 10,
          maxTokens: 4096,
        },
        colorTheme: 'blue',
        isStartNode: true,
      },
    };

    const node2: Node<AgentData> = {
      id: id2,
      type: 'agentNode',
      position: { x: startX + 330, y: startY },
      data: {
        id: id2,
        label: 'Code Executor',
        role: 'Implements tasks, executes code, and fetches required data sources.',
        model: 'gemini-3.7-flash',
        systemPrompt: 'Write clean code, run validation tools, and produce tangible deliverables.',
        temperature: 0.2,
        tools: [AVAILABLE_TOOLS[1], AVAILABLE_TOOLS[4]], // Code interpreter + REST API
        subAgents: [],
        subAgentPattern: 'sequential',
        colorTheme: 'emerald',
      },
    };

    const node3: Node<AgentData> = {
      id: id3,
      type: 'agentNode',
      position: { x: startX + 660, y: startY },
      data: {
        id: id3,
        label: 'Quality Reviewer',
        role: 'Audits deliverables against safety, accuracy, and format constraints.',
        model: 'gemini-3.7-flash',
        systemPrompt: 'Review the output from previous stages for correctness, edge cases, and clarity.',
        temperature: 0.1,
        tools: [AVAILABLE_TOOLS[3]], // Knowledge RAG
        subAgents: [],
        subAgentPattern: 'sequential',
        structuredOutput: {
          enabled: true,
          formatType: 'pydantic',
          name: 'ReviewReport',
          description: 'Structured quality audit report and score.',
          strict: true,
          fields: [
            { id: 'f1', name: 'score', type: 'number', required: true, description: 'Quality score 0.0-1.0' },
            { id: 'f2', name: 'passed', type: 'boolean', required: true, description: 'Approval status' },
            { id: 'f3', name: 'findings', type: 'array', arrayItemType: 'string', required: true, description: 'Specific review findings' },
          ],
        },
        colorTheme: 'purple',
      },
    };

    const edges: Edge[] = [
      {
        id: `e_${id1}_${id2}`,
        source: id1,
        target: id2,
        sourceHandle: 'output',
        targetHandle: 'input',
        animated: true,
        style: { stroke: '#3b82f6', strokeWidth: 2 },
      },
      {
        id: `e_${id2}_${id3}`,
        source: id2,
        target: id3,
        sourceHandle: 'output',
        targetHandle: 'input',
        animated: true,
        style: { stroke: '#3b82f6', strokeWidth: 2 },
      },
    ];

    return { nodes: [node1, node2, node3], edges };
  } 
  
  if (normalizedType === 'parallel') {
    // 1 Orchestrator with 3 sub-agents
    const rootId = getNextId('orchestrator');
    const sub1Id = getNextId('analyst');
    const sub2Id = getNextId('researcher');
    const sub3Id = getNextId('assessor');

    const rootNode: Node<AgentData> = {
      id: rootId,
      type: 'agentNode',
      position: { x: startX + 330, y: startY },
      data: {
        id: rootId,
        label: 'Lead Orchestrator',
        role: 'Dispatches parallel sub-tasks and synthesizes concurrent findings.',
        model: 'gemini-3.7-flash',
        systemPrompt: 'Coordinate multiple domain agents concurrently and aggregate their structured outputs.',
        temperature: 0.4,
        tools: [],
        subAgents: [
          { agentId: sub1Id, name: 'Market Analyst', role: 'Analyzes financial & market data' },
          { agentId: sub2Id, name: 'Tech Researcher', role: 'Deep technical stack investigation' },
          { agentId: sub3Id, name: 'Risk Assessor', role: 'Identifies vulnerabilities & operational risk' },
        ],
        subAgentPattern: 'parallel',
        isOrchestrator: true,
        colorTheme: 'amber',
        isStartNode: true,
      },
    };

    const subNode1: Node<AgentData> = {
      id: sub1Id,
      type: 'agentNode',
      position: { x: startX, y: startY + 280 },
      data: {
        id: sub1Id,
        label: 'Market Analyst',
        role: 'Processes financial indices, user statistics, and industry benchmarks.',
        model: 'gemini-3.7-flash',
        systemPrompt: 'Analyze economic trends and competitive positioning.',
        temperature: 0.5,
        tools: [AVAILABLE_TOOLS[2]], // SQL
        subAgents: [],
        colorTheme: 'cyan',
      },
    };

    const subNode2: Node<AgentData> = {
      id: sub2Id,
      type: 'agentNode',
      position: { x: startX + 330, y: startY + 280 },
      data: {
        id: sub2Id,
        label: 'Tech Researcher',
        role: 'Investigates APIs, architecture patterns, and benchmarks.',
        model: 'gemini-3.7-flash',
        systemPrompt: 'Perform technical web search and code documentation retrieval.',
        temperature: 0.3,
        tools: [AVAILABLE_TOOLS[0], AVAILABLE_TOOLS[1]], // Search + Code
        subAgents: [],
        colorTheme: 'blue',
      },
    };

    const subNode3: Node<AgentData> = {
      id: sub3Id,
      type: 'agentNode',
      position: { x: startX + 660, y: startY + 280 },
      data: {
        id: sub3Id,
        label: 'Risk Assessor',
        role: 'Verifies safety, legal compliance, and operational vulnerability.',
        model: 'gemini-3.7-flash',
        systemPrompt: 'Score risk levels and propose mitigation strategies.',
        temperature: 0.2,
        tools: [AVAILABLE_TOOLS[3]], // Knowledge RAG
        subAgents: [],
        colorTheme: 'rose',
      },
    };

    const edges: Edge[] = [
      {
        id: `e_${rootId}_${sub1Id}`,
        source: rootId,
        target: sub1Id,
        sourceHandle: 'subagent',
        targetHandle: 'input',
        animated: true,
        style: { stroke: '#3b82f6', strokeWidth: 2, strokeDasharray: '4 4' },
      },
      {
        id: `e_${rootId}_${sub2Id}`,
        source: rootId,
        target: sub2Id,
        sourceHandle: 'subagent',
        targetHandle: 'input',
        animated: true,
        style: { stroke: '#3b82f6', strokeWidth: 2, strokeDasharray: '4 4' },
      },
      {
        id: `e_${rootId}_${sub3Id}`,
        source: rootId,
        target: sub3Id,
        sourceHandle: 'subagent',
        targetHandle: 'input',
        animated: true,
        style: { stroke: '#3b82f6', strokeWidth: 2, strokeDasharray: '4 4' },
      },
    ];

    return { nodes: [rootNode, subNode1, subNode2, subNode3], edges };
  }

  if (normalizedType === 'router') {
    // 1 Intent Router with 3 branch experts
    const routerId = getNextId('router_node');
    const codeId = getNextId('code_expert');
    const searchId = getNextId('search_expert');
    const creativeId = getNextId('creative_expert');

    const branchCodeId = `branch_code_${Date.now().toString(36)}`;
    const branchSearchId = `branch_search_${Date.now().toString(36)}`;
    const branchCreativeId = `branch_creative_${Date.now().toString(36)}`;

    const routerNode: Node<AgentData> = {
      id: routerId,
      type: 'agentNode',
      position: { x: startX + 330, y: startY },
      data: {
        id: routerId,
        label: 'Intent Router',
        role: 'Classifies user intent and dynamically routes the task to the best specialized agent.',
        model: 'gemini-3.7-flash',
        systemPrompt: 'Analyze incoming prompt complexity. Categorize as CODE, RESEARCH, or CREATIVE and route payload.',
        temperature: 0.1,
        agentKind: 'router',
        routerConfig: {
          evaluationMode: 'llm_classifier',
          routingPrompt: 'Categorize incoming user request into CODE, RESEARCH, or CREATIVE domain.',
          branches: [
            {
              id: branchCodeId,
              label: 'Route: Code Intent',
              conditionExpression: "intent == 'code' or category == 'programming'",
              targetAgentId: codeId,
              isDefault: false,
              description: 'Routes coding and algorithmic tasks to Code Specialist',
            },
            {
              id: branchSearchId,
              label: 'Route: Research Intent',
              conditionExpression: "intent == 'research' or category == 'factual'",
              targetAgentId: searchId,
              isDefault: false,
              description: 'Routes web search and factual inquiries to Research Specialist',
            },
            {
              id: branchCreativeId,
              label: 'Route: Creative Intent',
              conditionExpression: "intent == 'creative' or category == 'copywriting'",
              targetAgentId: creativeId,
              isDefault: true,
              description: 'Routes narrative and UX copy tasks to Creative Copywriter',
            },
          ],
        },
        tools: [],
        subAgents: [
          { agentId: codeId, name: 'Code Specialist', role: 'Algorithmic programming and debugging' },
          { agentId: searchId, name: 'Research Specialist', role: 'Deep factual and web grounding' },
          { agentId: creativeId, name: 'Creative Copywriter', role: 'Engaging narrative and UX writing' },
        ],
        subAgentPattern: 'router',
        isStartNode: true,
        colorTheme: 'purple',
      },
    };

    const codeNode: Node<AgentData> = {
      id: codeId,
      type: 'agentNode',
      position: { x: startX, y: startY + 280 },
      data: {
        id: codeId,
        label: 'Code Specialist',
        role: 'Writes verified code solutions and executes unit tests.',
        model: 'gemini-3.7-flash',
        systemPrompt: 'Implement clean software solutions with thorough test cases.',
        temperature: 0.2,
        tools: [AVAILABLE_TOOLS[1]],
        subAgents: [],
        colorTheme: 'emerald',
      },
    };

    const searchNode: Node<AgentData> = {
      id: searchId,
      type: 'agentNode',
      position: { x: startX + 330, y: startY + 280 },
      data: {
        id: searchId,
        label: 'Research Specialist',
        role: 'Performs live web synthesis and vector RAG retrieval.',
        model: 'gemini-3.7-flash',
        systemPrompt: 'Ground all statements with recent facts and reputable citations.',
        temperature: 0.3,
        tools: [AVAILABLE_TOOLS[0], AVAILABLE_TOOLS[3]],
        subAgents: [],
        colorTheme: 'blue',
      },
    };

    const creativeNode: Node<AgentData> = {
      id: creativeId,
      type: 'agentNode',
      position: { x: startX + 660, y: startY + 280 },
      data: {
        id: creativeId,
        label: 'Creative Copywriter',
        role: 'Produces engaging prose, marketing copy, and design docs.',
        model: 'gemini-3.7-flash',
        systemPrompt: 'Craft persuasive and clear copy adhering to brand guidelines.',
        temperature: 0.8,
        tools: [],
        subAgents: [],
        colorTheme: 'amber',
      },
    };

    const edges: Edge[] = [
      {
        id: `e_${routerId}_${branchCodeId}_${codeId}`,
        source: routerId,
        target: codeId,
        sourceHandle: branchCodeId,
        targetHandle: 'input',
        animated: true,
        style: { stroke: '#3b82f6', strokeWidth: 2 },
      },
      {
        id: `e_${routerId}_${branchSearchId}_${searchId}`,
        source: routerId,
        target: searchId,
        sourceHandle: branchSearchId,
        targetHandle: 'input',
        animated: true,
        style: { stroke: '#3b82f6', strokeWidth: 2 },
      },
      {
        id: `e_${routerId}_${branchCreativeId}_${creativeId}`,
        source: routerId,
        target: creativeId,
        sourceHandle: branchCreativeId,
        targetHandle: 'input',
        animated: true,
        style: { stroke: '#3b82f6', strokeWidth: 2 },
      },
    ];

    return { nodes: [routerNode, codeNode, searchNode, creativeNode], edges };
  }

  if (normalizedType === 'loop') {
    // Loop Agent: 1 generator with 1 evaluator in a feedback loop
    const genId = getNextId('generator');
    const evalId = getNextId('evaluator');

    const genNode: Node<AgentData> = {
      id: genId,
      type: 'agentNode',
      position: { x: startX, y: startY },
      data: {
        id: genId,
        label: 'Draft Generator',
        role: 'Produces drafts and iterates based on evaluator critique and test scores.',
        model: 'gemini-3.7-flash',
        systemPrompt: 'Generate high quality draft solutions. Incorporate feedback loops until quality score > 90%.',
        temperature: 0.7,
        tools: [AVAILABLE_TOOLS[1]], // Code interpreter
        subAgents: [
          { agentId: evalId, name: 'Critic Evaluator', role: 'Critiques output and scores quality' },
        ],
        subAgentPattern: 'loop',
        colorTheme: 'blue',
        isStartNode: true,
      },
    };

    const evalNode: Node<AgentData> = {
      id: evalId,
      type: 'agentNode',
      position: { x: startX + 360, y: startY },
      data: {
        id: evalId,
        label: 'Critic Evaluator',
        role: 'Tests draft output against criteria, provides critique, or approves convergence.',
        model: 'gemini-3.7-flash',
        systemPrompt: 'Evaluate the generated solution. Return either "APPROVED" with final score or actionable revision points.',
        temperature: 0.1,
        tools: [AVAILABLE_TOOLS[0], AVAILABLE_TOOLS[5]], // Search + Custom function
        subAgents: [],
        subAgentPattern: 'loop',
        isEvaluator: true,
        colorTheme: 'purple',
      },
    };

    const edges: Edge[] = [
      {
        id: `e_${genId}_${evalId}`,
        source: genId,
        target: evalId,
        sourceHandle: 'output',
        targetHandle: 'input',
        animated: true,
        style: { stroke: '#3b82f6', strokeWidth: 2 },
      },
      {
        id: `e_${evalId}_${genId}_loop`,
        source: evalId,
        target: genId,
        sourceHandle: 'subagent',
        targetHandle: 'input',
        animated: true,
        style: { stroke: '#3b82f6', strokeWidth: 2, strokeDasharray: '5 5' },
      },
    ];

    return { nodes: [genNode, evalNode], edges };
  }

  if (normalizedType === 'debate' || normalizedType === 'consensus') {
    // Multi-Agent Debate & Consensus Pattern:
    // Moderator / Framer -> Affirmative Proponent & Skeptical Opponent -> Consensus Judge
    const modId = getNextId('moderator');
    const propId = getNextId('proponent');
    const oppId = getNextId('opponent');
    const judgeId = getNextId('judge');

    const modNode: Node<AgentData> = {
      id: modId,
      type: 'agentNode',
      position: { x: startX + 330, y: startY },
      data: {
        id: modId,
        label: 'Debate Moderator',
        role: 'Frames the core thesis, establishes debate rules, and commissions affirmative and skeptical briefs.',
        model: 'gemini-3.7-flash',
        systemPrompt: 'You frame the core debate question, define the evaluation rubric, and commission structured arguments from affirmative and skeptical perspectives.',
        temperature: 0.3,
        tools: [AVAILABLE_TOOLS[0]], // Web search
        subAgents: [
          { agentId: propId, name: 'Affirmative Proponent', role: 'Argues in favor of the thesis with evidence' },
          { agentId: oppId, name: 'Skeptical Opponent', role: 'Identifies failure modes, counter-evidence, and risks' },
          { agentId: judgeId, name: 'Consensus Judge', role: 'Arbitrates cross-examination and renders consensus verdict' },
        ],
        subAgentPattern: 'debate',
        colorTheme: 'blue',
        isStartNode: true,
        isDebateNode: true,
        debateConfig: {
          maxRounds: 2,
          consensusThreshold: 0.85,
          earlyStoppingEnabled: true,
          debateStyle: 'structured_rebuttal',
          tieBreakerStrategy: 'conditional_approval',
          minWordLimitPerBrief: 250,
          requireEvidenceCitations: true,
        },
      },
    };

    const propNode: Node<AgentData> = {
      id: propId,
      type: 'agentNode',
      position: { x: startX, y: startY + 280 },
      data: {
        id: propId,
        label: 'Affirmative Proponent',
        role: 'Builds an evidence-backed case in favor of the proposal, highlighting upside, viability, and benefits.',
        model: 'gemini-3.7-flash',
        systemPrompt: 'Construct the strongest affirmative argument for the thesis. Support claims with verified data and strategic benefits.',
        temperature: 0.7,
        tools: [AVAILABLE_TOOLS[0], AVAILABLE_TOOLS[4]], // Web search + REST API
        subAgents: [],
        colorTheme: 'emerald',
      },
    };

    const oppNode: Node<AgentData> = {
      id: oppId,
      type: 'agentNode',
      position: { x: startX + 660, y: startY + 280 },
      data: {
        id: oppId,
        label: 'Skeptical Opponent',
        role: 'Conducts adversarial red-teaming, highlights risks, logical fallacies, edge-case failure modes, and boundaries.',
        model: 'gemini-3.7-flash',
        systemPrompt: 'Stress-test the affirmative case. Identify vulnerabilities, cost overruns, negative externalities, and unstated assumptions.',
        temperature: 0.6,
        tools: [AVAILABLE_TOOLS[3], AVAILABLE_TOOLS[0]], // Knowledge RAG + Web search
        subAgents: [],
        colorTheme: 'rose',
      },
    };

    const judgeNode: Node<AgentData> = {
      id: judgeId,
      type: 'agentNode',
      position: { x: startX + 330, y: startY + 560 },
      data: {
        id: judgeId,
        label: 'Consensus Judge',
        role: 'Arbitrates debate arguments, scores evidence strength, and drafts an objective consensus verdict.',
        model: 'gemini-3.7-flash',
        systemPrompt: 'Evaluate both arguments objectively. Reconcile valid points, discard unfounded claims, and generate a synthesized consensus decision with clear trade-offs.',
        temperature: 0.2,
        tools: [AVAILABLE_TOOLS[1]], // Code interpreter
        subAgents: [],
        structuredOutput: {
          enabled: true,
          formatType: 'json_schema',
          name: 'ConsensusVerdict',
          description: 'Final multi-agent debate consensus and decision report.',
          strict: true,
          fields: [
            { id: 'f1', name: 'verdict', type: 'string', required: true, description: 'Final consensus outcome (Approved, Rejected, Conditional)' },
            { id: 'f2', name: 'confidenceScore', type: 'number', required: true, description: 'Consensus confidence score (0.0 to 1.0)' },
            { id: 'f3', name: 'keyAgreements', type: 'array', arrayItemType: 'string', required: true, description: 'Shared points agreed by both sides' },
            { id: 'f4', name: 'unresolvedDisputes', type: 'array', arrayItemType: 'string', required: true, description: 'Remaining points of disagreement' },
            { id: 'f5', name: 'recommendations', type: 'array', arrayItemType: 'string', required: true, description: 'Actionable recommended steps' },
          ],
        },
        colorTheme: 'purple',
      },
    };

    const edges: Edge[] = [
      {
        id: `e_${modId}_${propId}`,
        source: modId,
        target: propId,
        sourceHandle: 'subagent',
        targetHandle: 'input',
        animated: true,
        style: { stroke: '#3b82f6', strokeWidth: 2 },
      },
      {
        id: `e_${modId}_${oppId}`,
        source: modId,
        target: oppId,
        sourceHandle: 'subagent',
        targetHandle: 'input',
        animated: true,
        style: { stroke: '#3b82f6', strokeWidth: 2 },
      },
      {
        id: `e_${propId}_${oppId}_critique`,
        source: propId,
        target: oppId,
        sourceHandle: 'output',
        targetHandle: 'input',
        animated: true,
        style: { stroke: '#3b82f6', strokeWidth: 2, strokeDasharray: '4 4' },
      },
      {
        id: `e_${propId}_${judgeId}`,
        source: propId,
        target: judgeId,
        sourceHandle: 'output',
        targetHandle: 'input',
        animated: true,
        style: { stroke: '#3b82f6', strokeWidth: 2 },
      },
      {
        id: `e_${oppId}_${judgeId}`,
        source: oppId,
        target: judgeId,
        sourceHandle: 'output',
        targetHandle: 'input',
        animated: true,
        style: { stroke: '#3b82f6', strokeWidth: 2 },
      },
    ];

    return { nodes: [modNode, propNode, oppNode, judgeNode], edges };
  }

  if (normalizedType === 'review_critique') {
    // Review & Critique: Author -> Critic -> Editor
    const authId = getNextId('author');
    const criticId = getNextId('critic');
    const editorId = getNextId('editor');

    const authNode: Node<AgentData> = {
      id: authId,
      type: 'agentNode',
      position: { x: startX, y: startY },
      data: {
        id: authId,
        label: 'Content Author',
        role: 'Generates comprehensive initial proposals, architecture specs, and implementations.',
        model: 'gemini-3.7-flash',
        systemPrompt: 'Draft clear, thorough, and structured deliverables addressing all prompt requirements.',
        temperature: 0.7,
        tools: [AVAILABLE_TOOLS[0]],
        subAgents: [
          { agentId: criticId, name: 'Adversarial Critic', role: 'Rigorous peer reviewer' },
          { agentId: editorId, name: 'Synthesis Editor', role: 'Final polish and validation' },
        ],
        subAgentPattern: 'review_critique',
        isStartNode: true,
        colorTheme: 'blue',
      },
    };

    const criticNode: Node<AgentData> = {
      id: criticId,
      type: 'agentNode',
      position: { x: startX + 330, y: startY },
      data: {
        id: criticId,
        label: 'Adversarial Critic',
        role: 'Conducts adversarial reviews, detects logic flaws, and outlines concrete objections.',
        model: 'gemini-3.7-flash',
        systemPrompt: 'Stress-test all claims, identify weaknesses, security gaps, and unstated assumptions.',
        temperature: 0.2,
        tools: [AVAILABLE_TOOLS[3]],
        subAgents: [],
        colorTheme: 'rose',
      },
    };

    const editorNode: Node<AgentData> = {
      id: editorId,
      type: 'agentNode',
      position: { x: startX + 660, y: startY },
      data: {
        id: editorId,
        label: 'Synthesis Editor',
        role: 'Synthesizes original draft with critical feedback into a publication-ready artifact.',
        model: 'gemini-3.7-flash',
        systemPrompt: 'Harmonize the initial content with critical reviews to produce a definitive version.',
        temperature: 0.3,
        tools: [AVAILABLE_TOOLS[1]],
        subAgents: [],
        colorTheme: 'emerald',
      },
    };

    const edges: Edge[] = [
      {
        id: `e_${authId}_${criticId}`,
        source: authId,
        target: criticId,
        sourceHandle: 'output',
        targetHandle: 'input',
        animated: true,
        style: { stroke: '#3b82f6', strokeWidth: 2 },
      },
      {
        id: `e_${criticId}_${editorId}`,
        source: criticId,
        target: editorId,
        sourceHandle: 'output',
        targetHandle: 'input',
        animated: true,
        style: { stroke: '#3b82f6', strokeWidth: 2 },
      },
    ];

    return { nodes: [authNode, criticNode, editorNode], edges };
  }

  if (normalizedType === 'iterative_refinement') {
    // Iterative Refinement: Draft Generator -> Quality Benchmark Evaluator
    const genId = getNextId('refine_gen');
    const evalId = getNextId('benchmark_eval');

    const genNode: Node<AgentData> = {
      id: genId,
      type: 'agentNode',
      position: { x: startX, y: startY },
      data: {
        id: genId,
        label: 'Iterative Creator',
        role: 'Produces candidate iterations and improves version N+1 using evaluation deltas.',
        model: 'gemini-3.7-flash',
        systemPrompt: 'Generate structured solution candidates. Address all regression tests identified by Evaluator.',
        temperature: 0.6,
        tools: [AVAILABLE_TOOLS[1]],
        subAgents: [
          { agentId: evalId, name: 'Quality Benchmark Evaluator', role: 'Calculates quality metrics' },
        ],
        subAgentPattern: 'iterative_refinement',
        isStartNode: true,
        colorTheme: 'cyan',
      },
    };

    const evalNode: Node<AgentData> = {
      id: evalId,
      type: 'agentNode',
      position: { x: startX + 360, y: startY },
      data: {
        id: evalId,
        label: 'Benchmark Evaluator',
        role: 'Calculates precision, recall, and adherence metrics; signals stop when threshold exceeded.',
        model: 'gemini-3.7-flash',
        systemPrompt: 'Score input on 0-100 scale. If score >= 95, return FINAL_PASSED, else return step-wise fixes.',
        temperature: 0.1,
        tools: [AVAILABLE_TOOLS[0], AVAILABLE_TOOLS[5]],
        subAgents: [],
        isEvaluator: true,
        colorTheme: 'purple',
      },
    };

    const edges: Edge[] = [
      {
        id: `e_${genId}_${evalId}`,
        source: genId,
        target: evalId,
        sourceHandle: 'output',
        targetHandle: 'input',
        animated: true,
        style: { stroke: '#3b82f6', strokeWidth: 2 },
      },
      {
        id: `e_${evalId}_${genId}_refine`,
        source: evalId,
        target: genId,
        sourceHandle: 'subagent',
        targetHandle: 'input',
        animated: true,
        style: { stroke: '#3b82f6', strokeWidth: 2, strokeDasharray: '4 4' },
      },
    ];

    return { nodes: [genNode, evalNode], edges };
  }

  if (normalizedType === 'coordinator') {
    // Coordinator: 1 Central Coordinator agent with 3 sub-agents
    const coordId = getNextId('coordinator');
    const d1Id = getNextId('db_worker');
    const d2Id = getNextId('api_worker');
    const d3Id = getNextId('doc_worker');

    const coordNode: Node<AgentData> = {
      id: coordId,
      type: 'agentNode',
      position: { x: startX + 330, y: startY },
      data: {
        id: coordId,
        label: 'Central Coordinator',
        role: 'Maintains blackboard state, manages transaction safety, and delegates domain tasks.',
        model: 'gemini-3.7-flash',
        systemPrompt: 'You are the central supervisor. Manage lock contention, orchestrate sub-agents, and merge results.',
        temperature: 0.3,
        tools: [],
        subAgents: [
          { agentId: d1Id, name: 'Database Agent', role: 'Data warehouse query execution' },
          { agentId: d2Id, name: 'Integration Agent', role: 'External REST & GraphQL API sync' },
          { agentId: d3Id, name: 'Document Agent', role: 'PDF & Markdown report generation' },
        ],
        subAgentPattern: 'coordinator',
        isOrchestrator: true,
        isStartNode: true,
        colorTheme: 'amber',
      },
    };

    const d1Node: Node<AgentData> = {
      id: d1Id,
      type: 'agentNode',
      position: { x: startX, y: startY + 280 },
      data: {
        id: d1Id,
        label: 'Database Agent',
        role: 'Executes optimized SQL and vector queries against databases.',
        model: 'gemini-3.7-flash',
        systemPrompt: 'Read/write database records safely and efficiently.',
        temperature: 0.1,
        tools: [AVAILABLE_TOOLS[2]],
        subAgents: [],
        colorTheme: 'cyan',
      },
    };

    const d2Node: Node<AgentData> = {
      id: d2Id,
      type: 'agentNode',
      position: { x: startX + 330, y: startY + 280 },
      data: {
        id: d2Id,
        label: 'Integration Agent',
        role: 'Authenticates and proxies requests across third-party web services.',
        model: 'gemini-3.7-flash',
        systemPrompt: 'Invoke RESTful APIs with correct headers and payload schemas.',
        temperature: 0.2,
        tools: [AVAILABLE_TOOLS[4]],
        subAgents: [],
        colorTheme: 'emerald',
      },
    };

    const d3Node: Node<AgentData> = {
      id: d3Id,
      type: 'agentNode',
      position: { x: startX + 660, y: startY + 280 },
      data: {
        id: d3Id,
        label: 'Document Agent',
        role: 'Assembles markdown summaries, changelogs, and user manuals.',
        model: 'gemini-3.7-flash',
        systemPrompt: 'Generate polished technical documentation.',
        temperature: 0.4,
        tools: [AVAILABLE_TOOLS[3]],
        subAgents: [],
        colorTheme: 'purple',
      },
    };

    const edges: Edge[] = [
      {
        id: `e_${coordId}_${d1Id}`,
        source: coordId,
        target: d1Id,
        sourceHandle: 'subagent',
        targetHandle: 'input',
        animated: true,
        style: { stroke: '#3b82f6', strokeWidth: 2, strokeDasharray: '4 4' },
      },
      {
        id: `e_${coordId}_${d2Id}`,
        source: coordId,
        target: d2Id,
        sourceHandle: 'subagent',
        targetHandle: 'input',
        animated: true,
        style: { stroke: '#3b82f6', strokeWidth: 2, strokeDasharray: '4 4' },
      },
      {
        id: `e_${coordId}_${d3Id}`,
        source: coordId,
        target: d3Id,
        sourceHandle: 'subagent',
        targetHandle: 'input',
        animated: true,
        style: { stroke: '#3b82f6', strokeWidth: 2, strokeDasharray: '4 4' },
      },
    ];

    return { nodes: [coordNode, d1Node, d2Node, d3Node], edges };
  }

  // Hierarchical Decomposition: Master Architect -> 2 Leads -> 4 Workers
  const masterId = getNextId('master');
  const lead1Id = getNextId('frontend_lead');
  const lead2Id = getNextId('backend_lead');
  const w1Id = getNextId('ui_worker');
  const w2Id = getNextId('state_worker');
  const w3Id = getNextId('api_worker');
  const w4Id = getNextId('db_worker');

  const masterNode: Node<AgentData> = {
    id: masterId,
    type: 'agentNode',
    position: { x: startX + 480, y: startY },
    data: {
      id: masterId,
      label: 'Chief System Architect',
      role: 'Decomposes high-level requirements into domain lead work-streams.',
      model: 'gemini-3.7-flash',
      systemPrompt: 'Produce system architecture specs and distribute subsystem boundaries to domain leads.',
      temperature: 0.2,
      tools: [AVAILABLE_TOOLS[0]],
      subAgents: [
        { agentId: lead1Id, name: 'Frontend Lead', role: 'UI/UX subsystem manager' },
        { agentId: lead2Id, name: 'Backend Lead', role: 'Services & storage subsystem manager' },
      ],
      subAgentPattern: 'hierarchical_decomposition',
      isOrchestrator: true,
      isStartNode: true,
      colorTheme: 'blue',
    },
  };

  const lead1Node: Node<AgentData> = {
    id: lead1Id,
    type: 'agentNode',
    position: { x: startX + 160, y: startY + 280 },
    data: {
      id: lead1Id,
      label: 'Frontend Lead',
      role: 'Supervises UI components, design fidelity, and client interactions.',
      model: 'gemini-3.7-flash',
      systemPrompt: 'Coordinate frontend implementation tasks across component and state engineers.',
      temperature: 0.3,
      tools: [],
      subAgents: [
        { agentId: w1Id, name: 'UI Components Agent', role: 'Tailwind styling & layout' },
        { agentId: w2Id, name: 'Client State Agent', role: 'Local store and cache handlers' },
      ],
      subAgentPattern: 'parallel',
      colorTheme: 'emerald',
    },
  };

  const lead2Node: Node<AgentData> = {
    id: lead2Id,
    type: 'agentNode',
    position: { x: startX + 800, y: startY + 280 },
    data: {
      id: lead2Id,
      label: 'Backend Lead',
      role: 'Supervises REST endpoints, business logic, and database schemas.',
      model: 'gemini-3.7-flash',
      systemPrompt: 'Coordinate backend services, database migrations, and external API gateways.',
      temperature: 0.2,
      tools: [],
      subAgents: [
        { agentId: w3Id, name: 'API Services Agent', role: 'Express/FastAPI endpoints' },
        { agentId: w4Id, name: 'Database Model Agent', role: 'Postgres & Firestore storage' },
      ],
      subAgentPattern: 'parallel',
      colorTheme: 'purple',
    },
  };

  const w1Node: Node<AgentData> = {
    id: w1Id,
    type: 'agentNode',
    position: { x: startX, y: startY + 560 },
    data: {
      id: w1Id,
      label: 'UI Components Agent',
      role: 'Builds responsive components with Tailwind CSS and React.',
      model: 'gemini-3.7-flash',
      systemPrompt: 'Implement accessible, polished UI components.',
      temperature: 0.4,
      tools: [AVAILABLE_TOOLS[1]],
      subAgents: [],
      colorTheme: 'cyan',
    },
  };

  const w2Node: Node<AgentData> = {
    id: w2Id,
    type: 'agentNode',
    position: { x: startX + 320, y: startY + 560 },
    data: {
      id: w2Id,
      label: 'Client State Agent',
      role: 'Implements event streams and local synchronization.',
      model: 'gemini-3.7-flash',
      systemPrompt: 'Manage client state containers and async caches.',
      temperature: 0.3,
      tools: [AVAILABLE_TOOLS[1]],
      subAgents: [],
      colorTheme: 'cyan',
    },
  };

  const w3Node: Node<AgentData> = {
    id: w3Id,
    type: 'agentNode',
    position: { x: startX + 640, y: startY + 560 },
    data: {
      id: w3Id,
      label: 'API Services Agent',
      role: 'Implements API routes and authentication middleware.',
      model: 'gemini-3.7-flash',
      systemPrompt: 'Construct high throughput API controllers and input validation schemas.',
      temperature: 0.2,
      tools: [AVAILABLE_TOOLS[4]],
      subAgents: [],
      colorTheme: 'purple',
    },
  };

  const w4Node: Node<AgentData> = {
    id: w4Id,
    type: 'agentNode',
    position: { x: startX + 960, y: startY + 560 },
    data: {
      id: w4Id,
      label: 'Database Model Agent',
      role: 'Designs database tables, migrations, and index optimization.',
      model: 'gemini-3.7-flash',
      systemPrompt: 'Author relational schemas, ORM models, and query indexes.',
      temperature: 0.1,
      tools: [AVAILABLE_TOOLS[2]],
      subAgents: [],
      colorTheme: 'purple',
    },
  };

  const edges: Edge[] = [
    {
      id: `e_${masterId}_${lead1Id}`,
      source: masterId,
      target: lead1Id,
      sourceHandle: 'subagent',
      targetHandle: 'input',
      animated: true,
      style: { stroke: '#3b82f6', strokeWidth: 2 },
    },
    {
      id: `e_${masterId}_${lead2Id}`,
      source: masterId,
      target: lead2Id,
      sourceHandle: 'subagent',
      targetHandle: 'input',
      animated: true,
      style: { stroke: '#3b82f6', strokeWidth: 2 },
    },
    {
      id: `e_${lead1Id}_${w1Id}`,
      source: lead1Id,
      target: w1Id,
      sourceHandle: 'subagent',
      targetHandle: 'input',
      animated: true,
      style: { stroke: '#3b82f6', strokeWidth: 2, strokeDasharray: '4 4' },
    },
    {
      id: `e_${lead1Id}_${w2Id}`,
      source: lead1Id,
      target: w2Id,
      sourceHandle: 'subagent',
      targetHandle: 'input',
      animated: true,
      style: { stroke: '#3b82f6', strokeWidth: 2, strokeDasharray: '4 4' },
    },
    {
      id: `e_${lead2Id}_${w3Id}`,
      source: lead2Id,
      target: w3Id,
      sourceHandle: 'subagent',
      targetHandle: 'input',
      animated: true,
      style: { stroke: '#3b82f6', strokeWidth: 2, strokeDasharray: '4 4' },
    },
    {
      id: `e_${lead2Id}_${w4Id}`,
      source: lead2Id,
      target: w4Id,
      sourceHandle: 'subagent',
      targetHandle: 'input',
      animated: true,
      style: { stroke: '#3b82f6', strokeWidth: 2, strokeDasharray: '4 4' },
    },
  ];

  return { 
    nodes: [masterNode, lead1Node, lead2Node, w1Node, w2Node, w3Node, w4Node], 
    edges 
  };
}

export function createPatternNodesAndEdges(
  type: PatternType,
  startX: number,
  startY: number
): { nodes: Node<any>[]; edges: Edge[] } {
  const result = generateRawPattern(type, 0, 0);

  // Automatically find the root node (isStartNode: true or the first agent)
  const rootNode = result.nodes.find((n) => n.data?.isStartNode) || result.nodes[0];
  let combinedNodes: Node<any>[] = result.nodes;
  let combinedEdges: Edge[] = result.edges;

  if (rootNode) {
    // Automatically attach a Test Suite Trigger positioned above the root node
    const testerNode = createSingleTriggerNode(
      rootNode.position.x,
      0,
      'tester',
      rootNode.id
    );

    const triggerEdge: Edge = {
      id: `e_trigger_${testerNode.id}_${rootNode.id}`,
      source: testerNode.id,
      sourceHandle: 'trigger_out_right',
      target: rootNode.id,
      targetHandle: 'input_left',
      animated: true,
      style: { stroke: '#f59e0b', strokeWidth: 2, strokeDasharray: '5 5' },
    };

    combinedNodes = [testerNode, ...result.nodes];
    combinedEdges = [triggerEdge, ...result.edges];
  }

  // Run Dagre auto-layout on the full pattern graph
  const layouted = getLayoutedElements(combinedNodes, combinedEdges, {
    direction: 'TB',
    nodeSep: 70,
    rankSep: 110,
  });

  // Shift to target startX, startY
  const finalNodes = layouted.nodes.map((node) => ({
    ...node,
    position: {
      x: Math.round(startX + node.position.x),
      y: Math.round(startY + node.position.y),
    },
  }));

  return {
    nodes: finalNodes,
    edges: combinedEdges,
  };
}


