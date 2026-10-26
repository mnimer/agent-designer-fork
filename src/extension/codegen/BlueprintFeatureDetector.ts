/**
 * Blueprint Feature Detector
 *
 * Purpose: Deterministically detects which optional ADK features a blueprint uses (A2A, MCP,
 * A2UI, custom control-flow agents, multi-agent patterns, conditional routing, event triggers,
 * callbacks/planners/skills, non-Gemini models). The skill catalog preloads an optional skill
 * only when the blueprint uses one of the features listed in its `metadata.preloadWhen`.
 *
 * Architectural decisions / notes for future sessions:
 * - Replaces on-demand `load_skill` turns (measured 2026-10-22: each `load_skill` turn cost a full
 *   model call; one took 38 s) with zero-latency, deterministic skill selection.
 * - Feature names are the contract between this detector and skill frontmatter; add a detector
 *   here before referencing a new feature in a SKILL.md.
 * - Detection reads real `.agent` node fields observed in the bundled samples
 *   (`data.agentKind`, `data.subAgentPattern`, `data.a2uiConfig`, `data.tools[].type`, ...).
 *
 * Author: Mike Nimer <mikenimer@google.com>
 */

/** Feature identifiers usable in skill `metadata.preloadWhen`. */
export const BLUEPRINT_FEATURES = {
  a2a: 'a2a',
  a2ui: 'a2ui',
  mcp: 'mcp',
  customAgents: 'custom_agents',
  multiAgentPatterns: 'multi_agent_patterns',
  conditionalRouting: 'conditional_routing',
  eventTriggers: 'event_triggers',
  callbacksPlannersSkills: 'callbacks_planners_skills',
  nonGeminiModels: 'non_gemini_models',
} as const;

export type BlueprintFeature = (typeof BLUEPRINT_FEATURES)[keyof typeof BLUEPRINT_FEATURES];

/** All known feature identifiers (for frontmatter validation). */
export const KNOWN_BLUEPRINT_FEATURES: ReadonlySet<string> = new Set(Object.values(BLUEPRINT_FEATURES));

/** Control-flow agent kinds implemented as custom `BaseAgent` subclasses. */
const CUSTOM_AGENT_KINDS = new Set(['router', 'synthesizer', 'hitl', 'fallback', 'guardrail']);
/** Node config keys that imply a custom control-flow agent. */
const CUSTOM_AGENT_CONFIG_KEYS = ['routerConfig', 'synthesizerConfig', 'hitlConfig', 'fallbackConfig', 'guardrailConfig'];
/** Sub-agent patterns covered by the multi-agent patterns skill. */
const MULTI_AGENT_PATTERNS = new Set(['loop', 'debate', 'review_critique', 'coordinator']);
/** Node flags/config keys that imply a multi-agent pattern. */
const MULTI_AGENT_PATTERN_KEYS = ['debateConfig', 'isDebateNode', 'isEvaluator'];
/** Tool types that wrap another agent as a tool. */
const AGENT_AS_TOOL_TYPES = new Set(['agent_as_tool', 'builtin_agent_as_tool']);
/** Trigger types that are event-driven (not chat/tester). */
const EVENT_TRIGGER_TYPES = new Set(['pubsub', 'eventarc', 'cron', 'scheduled', 'scheduler', 'webhook']);
/** Node config keys for callbacks, planners, plugins, skills, and context management. */
const CALLBACK_PLANNER_SKILL_KEYS = [
  'callbacks',
  'planner',
  'plugins',
  'skills',
  'skillFactoryConfig',
  'contextCacheConfig',
  'eventsCompactionConfig',
];
/** Prefix of Gemini model ids. */
const GEMINI_MODEL_PREFIX = 'gemini';

/**
 * Returns true when a value is "configured" (non-empty array/object, true, or non-empty string).
 *
 * @param value Value to test.
 */
function isConfigured(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === 'object') return Object.keys(value).length > 0;
  if (typeof value === 'string') return value.trim().length > 0;
  return value === true;
}

/**
 * Normalizes a tool entry's type/category/id into lowercase strings.
 *
 * @param tool Tool entry from `data.tools`.
 */
function toolDescriptors(tool: any): string[] {
  if (!tool || typeof tool !== 'object') {
    return typeof tool === 'string' ? [tool.toLowerCase()] : [];
  }
  return [tool.type, tool.category, tool.id, tool.toolType].filter((v) => typeof v === 'string').map((v: string) => v.toLowerCase());
}

/**
 * Detects the optional features used by a blueprint.
 *
 * @param document `.agent` workflow document (raw or codegen view).
 * @returns Set of detected feature identifiers.
 */
export function detectBlueprintFeatures(document: Record<string, any>): Set<BlueprintFeature> {
  const features = new Set<BlueprintFeature>();
  const nodes: any[] = Array.isArray(document?.nodes) ? document.nodes : [];

  for (const node of nodes) {
    const data = node?.data || {};
    const nodeType = String(node?.type || '').toLowerCase();
    const kind = String(data.agentKind || '').toLowerCase();
    const pattern = String(data.subAgentPattern || '').toLowerCase();
    const tools: any[] = Array.isArray(data.tools) ? data.tools : [];
    const descriptors = tools.flatMap(toolDescriptors);

    // 1. Agent-to-Agent.
    if (kind === 'a2a' || data.agentType === 'a2a_agent' || isConfigured(data.a2aConfig) || nodeType.includes('a2a')) {
      features.add(BLUEPRINT_FEATURES.a2a);
    }
    // 2. A2UI rich UI.
    if (data.a2uiConfig?.enabled === true) {
      features.add(BLUEPRINT_FEATURES.a2ui);
    }
    // 3. MCP toolsets.
    if (descriptors.some((d) => d.includes('mcp'))) {
      features.add(BLUEPRINT_FEATURES.mcp);
    }
    // 4. Custom control-flow agents.
    if (CUSTOM_AGENT_KINDS.has(kind) || CUSTOM_AGENT_CONFIG_KEYS.some((key) => isConfigured(data[key]))) {
      features.add(BLUEPRINT_FEATURES.customAgents);
    }
    // 5. Multi-agent patterns (loop, debate, triad, coordinator, agent-as-tool).
    if (
      MULTI_AGENT_PATTERNS.has(pattern) ||
      MULTI_AGENT_PATTERN_KEYS.some((key) => isConfigured(data[key])) ||
      descriptors.some((d) => AGENT_AS_TOOL_TYPES.has(d))
    ) {
      features.add(BLUEPRINT_FEATURES.multiAgentPatterns);
    }
    // 6. Conditional routing (graph Workflow).
    if (pattern === 'router' || kind === 'router' || isConfigured(data.routerConfig)) {
      features.add(BLUEPRINT_FEATURES.conditionalRouting);
    }
    // 7. Event-driven triggers.
    const triggerType = String(data.triggerType || data.triggerKind || '').toLowerCase();
    if (EVENT_TRIGGER_TYPES.has(triggerType)) {
      features.add(BLUEPRINT_FEATURES.eventTriggers);
    }
    // 8. Callbacks, planners, plugins, skills, context management.
    if (CALLBACK_PLANNER_SKILL_KEYS.some((key) => isConfigured(data[key]))) {
      features.add(BLUEPRINT_FEATURES.callbacksPlannersSkills);
    }
    // 9. Non-Gemini models.
    if (typeof data.model === 'string' && data.model.trim() && !data.model.trim().toLowerCase().startsWith(GEMINI_MODEL_PREFIX)) {
      features.add(BLUEPRINT_FEATURES.nonGeminiModels);
    }
  }
  return features;
}
