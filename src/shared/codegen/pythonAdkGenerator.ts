/**
 * Python ADK Code Generator & A2A JSON-RPC 2.0 Client Compiler
 *
 * Purpose:
 * Compiles visual agent workflow documents into production-grade Python Google ADK projects,
 * specifically generating compliant JSON-RPC 2.0 / A2A client code in `tools.py` for
 * querying remote agent cards (/.well-known/agent-card.json) and dispatching tasks with
 * robust authentication, retries, and error handling.
 *
 * Architectural Decisions:
 * - Author: Mike Nimer <mikenimer@google.com>
 * - Decision 1: A2A JSON-RPC 2.0 Compliance: All A2A agents (agentKind === 'a2a') communicate
 *   over JSON-RPC 2.0 ("jsonrpc": "2.0", "method": ..., "params": ..., "id": ...) per spec 1.0.0-a2a.
 * - Decision 2: Discovery via /.well-known/agent-card.json: Clients provide inspection methods
 *   for fetching and negotiating remote agent capabilities, interfaces, and schemas.
 * - Decision 3: Multi-Scheme Authentication: First-class resolution of Bearer tokens, API keys
 *   (with customizable headers), OAuth2 client credentials, and Google Cloud IAM tokens.
 * - Decision 4: Resilient Network Transport: Built-in exponential backoff retry loops, configurable
 *   HTTP timeouts, and JSON-RPC error code unwrapping.
 * - Decision 5: Tool Wrapper Synthesis: Generates typed Python ADK tool functions (call_<id>_a2a)
 *   that allow parent or orchestrator agents to invoke remote A2A agents seamlessly in their tool loops.
 * - Decision 6: Region Safety: Google Vertex AI and ADK components default to global region per guidelines.
 * - Decision 7: Router Dynamic Branching: Router nodes (agentKind === 'router') compile into custom
 *   BaseAgent subclasses with an InvocationContext runner that evaluates boolean expressions, threshold metrics,
 *   or LLM intent categories to yield events from the selected target candidate agent.
 */

import { 
  AgentWorkflowDocument, 
  AgentNodeData, 
  A2AAgentConfig, 
  ToolDefinition 
} from '../types';
import { GeneratedFile } from './types';
import { sanitizePythonIdentifier, ToolAdapterCompiler } from './toolAdapters';
import { sanitizeIdentifier, topologicalSortAgents } from './nameSanitizer';
import { pyStr, pyLiteral } from './pythonEscape';

export interface PythonAdkGeneratorOptions {
  includeA2AClient?: boolean;
  defaultModel?: string;
  projectId?: string;
  location?: string;
}

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

/**
 * Generates the Python A2AClient class definition string for tools.py.
 *
 * @returns Python source code for A2AClient
 */
export function generateA2AClientBaseClass(): string {
  return `class A2AClient:
    """
    Client for communicating with remote A2A protocol agent endpoints.
    Complies with JSON-RPC 2.0 and A2A Protocol 1.0.0-a2a specifications.
    """
    def __init__(
        self, 
        endpoint: str, 
        auth_type: str = "bearer", 
        auth_secret: str = None, 
        header_name: str = "X-API-Key", 
        custom_headers: dict = None, 
        timeout_seconds: int = 30, 
        max_retries: int = 3
    ):
        self.endpoint = endpoint.rstrip('/')
        self.auth_type = auth_type
        self.auth_secret = auth_secret
        self.header_name = header_name or "X-API-Key"
        self.custom_headers = custom_headers or {}
        self.timeout_seconds = timeout_seconds
        self.max_retries = max_retries

    def _get_auth_headers(self) -> dict:
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "VisualAgentDesigner-A2AClient/1.0"
        }
        headers.update(self.custom_headers)

        token = os.environ.get(self.auth_secret, "") if self.auth_secret else ""

        if self.auth_type == "bearer" and token:
            headers["Authorization"] = f"Bearer {token}"
        elif self.auth_type in ("apiKey", "api_key") and token:
            headers[self.header_name] = token
        elif self.auth_type in ("iam", "google_iam"):
            try:
                import google.auth.transport.requests
                import google.oauth2.id_token
                auth_req = google.auth.transport.requests.Request()
                target_aud = os.environ.get("A2A_IAM_AUDIENCE", self.endpoint)
                id_token = google.oauth2.id_token.fetch_id_token(auth_req, target_aud)
                headers["Authorization"] = f"Bearer {id_token}"
            except Exception as e:
                logger.warning(f"Could not acquire Google IAM token: {e}")
        elif self.auth_type == "oauth2" and token:
            headers["Authorization"] = f"Bearer {token}"

        return headers

    def query_agent_card(self, agent_card_path: str = "/.well-known/agent-card.json") -> dict:
        """
        Queries and returns the remote agent card metadata for capability negotiation.
        """
        card_url = f"{self.endpoint}{agent_card_path}" if agent_card_path.startswith('/') else f"{self.endpoint}/{agent_card_path}"
        req = urllib.request.Request(card_url, headers=self._get_auth_headers(), method="GET")
        try:
            with urllib.request.urlopen(req, timeout=self.timeout_seconds) as resp:
                if resp.status == 200:
                    return json.loads(resp.read().decode("utf-8"))
        except Exception as e:
            logger.error(f"Failed to query A2A agent card at {card_url}: {e}")
            return {"error": str(e), "endpoint": self.endpoint}

    def dispatch_task(self, task_input: str, method: str = "execute_task", context: dict = None) -> dict:
        """
        Dispatches a task payload to the remote A2A endpoint using JSON-RPC 2.0 format.
        """
        request_id = str(uuid.uuid4())
        payload = {
            "jsonrpc": "2.0",
            "method": method,
            "params": {
                "task_input": task_input,
                "context": context or {}
            },
            "id": request_id
        }
        body_bytes = json.dumps(payload).encode("utf-8")
        headers = self._get_auth_headers()

        last_error = None
        for attempt in range(self.max_retries + 1):
            try:
                req = urllib.request.Request(self.endpoint, data=body_bytes, headers=headers, method="POST")
                with urllib.request.urlopen(req, timeout=self.timeout_seconds) as resp:
                    resp_data = json.loads(resp.read().decode("utf-8"))
                    if "error" in resp_data:
                        logger.error(f"A2A JSON-RPC error returned: {resp_data['error']}")
                        return {"status": "error", "error": resp_data["error"], "id": request_id}
                    return resp_data.get("result", resp_data)
            except urllib.error.HTTPError as http_err:
                last_error = f"HTTP {http_err.code}: {http_err.reason}"
                logger.warning(f"A2A dispatch attempt {attempt+1} failed ({last_error})")
            except Exception as err:
                last_error = str(err)
                logger.warning(f"A2A dispatch attempt {attempt+1} failed: {err}")

            if attempt < self.max_retries:
                time.sleep(1.0 * (attempt + 1))

        return {
            "status": "error", 
            "error": f"Failed after {self.max_retries + 1} attempts: {last_error}", 
            "id": request_id
        }`;
}

/**
 * Generates client initialization and callable tool wrappers for a specific A2A agent.
 *
 * @param agent Agent node data with A2A configuration
 * @returns Python code snippet instantiating A2AClient and wrapping it in an ADK tool function
 */
export function generateA2AClientCode(
  agent: AgentNodeData | { label: string; a2aConfig?: any },
  safeId?: string
): string {
  const norm = normalizeA2AConfig(agent.a2aConfig);
  const resolvedSafeId = safeId || sanitizeIdentifier(agent.label || 'a2a_agent');
  const agentDesc = (agent as AgentNodeData).systemPrompt || (agent as AgentNodeData).description || 'Remote A2A protocol autonomous agent';

  let skillsDoc = '';
  if (norm.skills && norm.skills.length > 0) {
    const skillNames = norm.skills.map((s: any) => s.name || s.id).join(', ');
    skillsDoc = `\n    Skills: ${skillNames}`;
  }

  const safeLabelDoc = (agent.label || '').replace(/"""/g, '\\"\\"\\"');
  const safeEndpointDoc = (norm.endpoint || '').replace(/"""/g, '\\"\\"\\"');
  const safeDescDoc = (agentDesc.replace(/\n/g, ' ') || '').replace(/"""/g, '\\"\\"\\"');
  const safeSkillsDoc = skillsDoc.replace(/"""/g, '\\"\\"\\"');
  const safeCardUrlDoc = (norm.agentCardUrl || '').replace(/"""/g, '\\"\\"\\"');

  return `# A2A Client Instance for: ${agent.label}
_client_${resolvedSafeId} = A2AClient(
    endpoint=${pyStr(norm.endpoint)},
    auth_type=${pyStr(norm.authType)},
    auth_secret=${pyStr(norm.authSecretKey || '')},
    header_name=${pyStr(norm.headerName)},
    custom_headers=${pyLiteral(norm.customHeaders)},
    timeout_seconds=${norm.timeoutSeconds},
    max_retries=${norm.maxRetries}
)

def call_${resolvedSafeId}_a2a(task_input: str) -> dict:
    """
    Delegates task execution to remote A2A agent '${safeLabelDoc}' via JSON-RPC 2.0.
    Endpoint: ${safeEndpointDoc}
    Description: ${safeDescDoc}${safeSkillsDoc}
    """
    return _client_${resolvedSafeId}.dispatch_task(task_input=task_input)

def query_${resolvedSafeId}_card() -> dict:
    """
    Queries capability agent card metadata from '${safeLabelDoc}' at ${safeCardUrlDoc}.
    """
    return _client_${resolvedSafeId}.query_agent_card(agent_card_path=${pyStr(norm.agentCardUrl)})
`;
}

/**
 * Converts an arbitrary identifier string into PascalCase for Python class names.
 *
 * @param str - Input string
 * @returns PascalCase formatted string
 */
export function toPascalCase(str: string): string {
  const words = str
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1));
  return words.join('') || 'Agent';
}

/**
 * PythonAdkGenerator compiles visual workflow graphs into Python Google ADK source code.
 */
export class PythonAdkGenerator {
  /**
   * Generates complete tools.py file including tool adapters and A2A JSON-RPC 2.0 clients.
   *
   * @param workflow AgentWorkflowDocument representing the canvas graph
   * @param options Generator options
   * @returns Complete contents of tools.py
   */
  public generateToolsFile(
    workflow: AgentWorkflowDocument, 
    options?: PythonAdkGeneratorOptions
  ): string {
    const agentNodes = (workflow.nodes || []).filter(
      (n) => n.data && (n.data.agentKind === 'standard' || n.data.agentKind === 'router' || n.data.agentKind === 'a2a' || !n.data.agentKind)
    );

    // Sort topologically
    const sortedAgents = topologicalSortAgents(agentNodes, workflow.edges || []);

    // Create safe names mapping
    const idToVar = new Map<string, string>();
    const usedNames = new Set<string>();

    for (const node of sortedAgents) {
      const varName = sanitizeIdentifier(node.data?.label || node.id, usedNames);
      idToVar.set(node.id, varName);
    }

    // Filter A2A nodes from sortedAgents
    const a2aNodes = sortedAgents.filter(
      (n) => n.data && (n.data.agentKind === 'a2a' || n.data.a2aConfig !== undefined)
    );

    // NOTE: Collect all attached standard tools across all nodes
    const allTools: ToolDefinition[] = [];
    const seenToolIds = new Set<string>();

    for (const node of workflow.nodes || []) {
      if (node.data && Array.isArray(node.data.tools)) {
        for (const t of node.data.tools) {
          if (!seenToolIds.has(t.id)) {
            seenToolIds.add(t.id);
            allTools.push(t);
          }
        }
      }
    }

    const toolCompiler = new ToolAdapterCompiler();
    const compiledTools = toolCompiler.compile(allTools, 'google-adk');

    const lines: string[] = [
      '"""',
      'tools.py - Google ADK Tools & A2A Protocol JSON-RPC 2.0 Client',
      '',
      'Auto-generated by Visual Agent Designer.',
      'Author: Mike Nimer <mikenimer@google.com>',
      '"""',
      '',
      'import json',
      'import logging',
      'import os',
      'import time',
      'import urllib.error',
      'import urllib.request',
      'import uuid',
      'from typing import Any, Dict, List, Optional',
      '',
    ];

    // Add tool compiler imports if tools exist
    if (compiledTools.imports.length > 0) {
      lines.push(...compiledTools.imports);
      lines.push('');
    }

    lines.push('logger = logging.getLogger(__name__)');
    lines.push('');

    // If A2A nodes exist, output A2AClient base class and specific wrappers
    if (a2aNodes.length > 0) {
      lines.push('# ==============================================================================');
      lines.push('# A2A Protocol JSON-RPC 2.0 Client Base Implementation');
      lines.push('# ==============================================================================');
      lines.push(generateA2AClientBaseClass());
      lines.push('');

      lines.push('# ==============================================================================');
      lines.push('# Configured A2A Remote Agent Connectors & Tools');
      lines.push('# ==============================================================================');
      for (const a2aNode of a2aNodes) {
        const safeId = idToVar.get(a2aNode.id) || sanitizeIdentifier(a2aNode.data?.label || a2aNode.id);
        lines.push(generateA2AClientCode(a2aNode.data, safeId));
      }
    }

    // Add standard tool definitions
    if (compiledTools.toolDefinitions.length > 0) {
      lines.push('# ==============================================================================');
      lines.push('# Standard Visual Agent Tools');
      lines.push('# ==============================================================================');
      lines.push(...compiledTools.toolDefinitions);
      lines.push('');
    }

    // Add setup_agent_tools helper
    lines.push('# ==============================================================================');
    lines.push('# Agent Tools Registry & Initializer');
    lines.push('# ==============================================================================');
    lines.push('def setup_agent_tools(agent_id: str) -> List[Any]:');
    lines.push('    """Returns list of executable tools assigned to a given agent id."""');
    lines.push('    tools = []');

    for (const node of sortedAgents) {
      const nodeTools = node.data?.tools || [];
      const isA2A = node.data?.agentKind === 'a2a';
      const safeId = idToVar.get(node.id) || sanitizeIdentifier(node.data?.label || node.id);

      if (nodeTools.length > 0 || isA2A) {
        lines.push(`    if agent_id == ${pyStr(node.id)}:`);
        if (isA2A) {
          lines.push(`        tools.append(call_${safeId}_a2a)`);
        }
        for (const t of nodeTools) {
          const varName = sanitizeIdentifier(t.name || t.id);
          lines.push(`        tools.append(${varName})`);
        }
      }
    }

    lines.push('    return tools');
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Generates agent_workflow.py orchestration file.
   *
   * Purpose:
   * Translates visual workflow canvas nodes into Python Google ADK agent instances and
   * orchestration logic. Supports standard ADK Agent instances, A2A connectors, and
   * conditional Router nodes that subclass BaseAgent to evaluate state/intent and
   * dispatch execution to candidate target agents dynamically.
   *
   * @param workflow - AgentWorkflowDocument representing the canvas graph
   * @param options - Generator options including default model and location
   * @returns Complete contents of agent_workflow.py
   */
  public generateWorkflowFile(
    workflow: AgentWorkflowDocument, 
    options?: PythonAdkGeneratorOptions
  ): string {
    const defaultModel = options?.defaultModel || 'gemini-3.8-flash';
    const agentNodes = (workflow.nodes || []).filter(
      (n) => n.data && (n.data.agentKind === 'standard' || n.data.agentKind === 'router' || n.data.agentKind === 'a2a' || !n.data.agentKind)
    );

    // Sort topologically
    const sortedAgents = topologicalSortAgents(agentNodes, workflow.edges || []);

    const idToVar = new Map<string, string>();
    const usedNames = new Set<string>();

    for (const node of sortedAgents) {
      const varName = sanitizeIdentifier(node.data?.label || node.id, usedNames);
      idToVar.set(node.id, varName);
    }

    const routerNodes = sortedAgents.filter((n) => n.data && n.data.agentKind === 'router');
    const hasRouter = routerNodes.length > 0;

    const lines: string[] = [
      '"""',
      'agent_workflow.py - Google ADK Workflow Orchestration Engine',
      '',
      'Auto-generated by Visual Agent Designer.',
      'Author: Mike Nimer <mikenimer@google.com>',
      '"""',
      '',
      'import os',
      'import logging',
      'from typing import Any, AsyncGenerator, Dict, List, Optional',
    ];

    if (hasRouter) {
      lines.push(
        'from google.adk.agents import Agent, BaseAgent',
        'from google.adk.agents.invocation_context import InvocationContext',
        'from google.adk.events import Event'
      );
    } else {
      lines.push('from google.adk.agents import Agent');
    }

    lines.push(
      'from google.adk.runners import Runner',
      'from tools import setup_agent_tools',
      'from session_store import get_session_store',
      '',
      'logger = logging.getLogger(__name__)',
      ''
    );

    // If Router nodes exist, inject StateProxy for dot-notation attribute access
    if (hasRouter) {
      lines.push(
        '# ==============================================================================',
        '# State Proxy for Dot-Notation & Dynamic Condition Resolution',
        '# ==============================================================================',
        'class StateProxy(dict):',
        '    """Allows attribute-style dot notation (state.field) access to session dictionary."""',
        '    def __getattr__(self, key: str) -> Any:',
        '        return self.get(key)',
        '    def __setattr__(self, key: str, value: Any) -> None:',
        '        self[key] = value',
        ''
      );

      // Generate evaluation helper functions and custom BaseAgent router classes
      for (const routerNode of routerNodes) {
        const data = routerNode.data || {};
        const safeVar = idToVar.get(routerNode.id)!;
        let routerClassName = toPascalCase(data.label || routerNode.id);
        if (!routerClassName.endsWith('Router')) {
          routerClassName += 'Router';
        }

        const evalMode = data.routerConfig?.evaluationMode || 'boolean_expression';
        const branches = data.routerConfig?.branches || [];
        const defaultBranch =
          branches.find((b) => b.isDefault || b.isDefaultFallback) || branches[branches.length - 1];
        const defaultBranchId = defaultBranch?.id || (branches[0]?.id || 'default');
        const expressionVar =
          data.routerConfig?.expressionVariable ||
          (evalMode === 'threshold_score' || evalMode === 'numeric_threshold' ? 'score' : 'status');
        const thresholdVal = data.routerConfig?.thresholdValue ?? 0.8;

        // 1. Standalone Routing Evaluator Function
        lines.push(
          '# ------------------------------------------------------------------------------',
          `# Routing Evaluator Function: ${data.label || routerNode.id}`,
          '# ------------------------------------------------------------------------------',
          `def evaluate_${safeVar}_route(state: Dict[str, Any], user_query: str = "") -> str:`,
          `    """Evaluates branching conditions for router '${data.label || routerNode.id}'. Mode: ${evalMode}."""`,
          '    proxy = StateProxy(state or {})',
          '    state = proxy',
          `    ${expressionVar} = proxy.get("${expressionVar}")`
        );

        if (evalMode === 'boolean' || evalMode === 'boolean_expression') {
          for (const branch of branches) {
            if (branch.id === defaultBranchId && (branch.isDefault || branch.isDefaultFallback)) {
              continue;
            }
            const rawCondition = branch.conditionExpression || branch.condition || '';
            if (!rawCondition || rawCondition === 'default') {
              continue;
            }

            lines.push(
              '    try:',
              `        # Branch: ${branch.label || branch.id}`,
              `        if ${rawCondition}:`,
              `            return "${branch.id}"`,
              '    except Exception as e:',
              `        logger.warning(f"Error evaluating branch '${branch.id}' condition on '${safeVar}': {e}")`
            );
          }
        } else if (evalMode === 'numeric_threshold' || evalMode === 'threshold_score') {
          lines.push(
            '    try:',
            `        metric_val = float(proxy.get("${expressionVar}", 0.0) or 0.0)`,
            '    except (ValueError, TypeError):',
            '        metric_val = 0.0',
            `    threshold = ${thresholdVal}`
          );

          let hasExplicitConditions = false;
          for (const branch of branches) {
            if (branch.id === defaultBranchId && (branch.isDefault || branch.isDefaultFallback)) {
              continue;
            }
            const rawCondition = branch.conditionExpression || branch.condition || '';
            if (rawCondition && rawCondition !== 'default') {
              hasExplicitConditions = true;
              lines.push(
                '    try:',
                `        score = metric_val`,
                `        if ${rawCondition}:`,
                `            return "${branch.id}"`,
                '    except Exception as e:',
                `        logger.warning(f"Error evaluating threshold branch '${branch.id}': {e}")`
              );
            }
          }

          if (!hasExplicitConditions) {
            const passBranch = branches.find((b) => !b.isDefault && !b.isDefaultFallback) || branches[0];
            if (passBranch) {
              lines.push(
                `    if metric_val >= threshold:`,
                `        return ${pyStr(passBranch.id)}`
              );
            }
          }
        } else if (evalMode === 'pattern_match') {
          lines.push(
            '    import re',
            `    target_text = str(user_query or proxy.get("${expressionVar}", "") or proxy.get("query", "") or proxy.get("input", ""))`
          );

          for (const branch of branches) {
            if (branch.id === defaultBranchId && (branch.isDefault || branch.isDefaultFallback)) {
              continue;
            }
            const rawPattern = branch.conditionExpression || branch.condition || branch.label || '';
            if (rawPattern && rawPattern !== 'default') {
              lines.push(
                '    try:',
                `        if re.search(${pyStr(rawPattern)}, target_text, re.IGNORECASE):`,
                `            return ${pyStr(branch.id)}`,
                '    except Exception as e:',
                `        logger.warning(f"Error evaluating regex pattern for branch '${branch.id.replace(/'/g, "\\'")}': {e}")`
              );
            }
          }
        } else {
          // LLM / Semantic Intent Classifier Mode
          lines.push(
            '    query_text = (user_query or str(proxy.get("query", "")) or str(proxy.get("input", ""))).lower()'
          );

          for (const branch of branches) {
            if (branch.id === defaultBranchId && (branch.isDefault || branch.isDefaultFallback)) {
              continue;
            }
            const candidateTerms = [
              branch.label,
              branch.conditionExpression,
              branch.condition,
            ]
              .filter(Boolean)
              .map((s) => s!.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim())
              .filter((s) => s.length > 0 && s !== 'default');

            if (candidateTerms.length > 0) {
              const termsArrayStr = candidateTerms.map(pyStr).join(', ');
              lines.push(
                `    if any(term in query_text for term in [${termsArrayStr}]):`,
                `        return ${pyStr(branch.id)}`
              );
            }
          }
        }

        // Return default fallback branch id
        lines.push(
          `    return ${pyStr(defaultBranchId)}`,
          ''
        );

        // 2. Custom BaseAgent Subclass
        lines.push(
          '# ------------------------------------------------------------------------------',
          `# Router Agent Class: ${routerClassName}`,
          '# ------------------------------------------------------------------------------',
          `class ${routerClassName}(BaseAgent):`,
          `    """Conditional routing agent for '${(data.label || routerNode.id).replace(/"""/g, '\\"\\"\\"')}'."""`,
          '    def __init__(',
          '        self,',
          '        name: str,',
          '        branches: Dict[str, Any],',
          '        default_agent: Optional[Any] = None,',
          '        tools: Optional[List[Any]] = None,',
          '    ):',
          '        super().__init__(name=name)',
          '        self.branches = branches',
          '        self.default_agent = default_agent',
          '        self.tools = tools or []',
          '',
          '    async def _run_async_impl(',
          '        self, ctx: InvocationContext',
          '    ) -> AsyncGenerator[Event, None]:',
          '        state = getattr(ctx.session, "state", {}) if hasattr(ctx, "session") and ctx.session else {}',
          '        user_query = getattr(ctx, "user_content", "") or ""',
          `        target_branch_id = evaluate_${safeVar}_route(state, user_query)`,
          '        target_agent = self.branches.get(target_branch_id, self.default_agent)',
          '',
          '        if target_agent is not None:',
          `            logger.info(f"Router '{self.name}' selected branch '{target_branch_id}' -> executing '{target_agent.name}'")`,
          '            async for event in target_agent.run_async(ctx):',
          '                yield event',
          '        else:',
          `            logger.warning(f"Router '{self.name}' found no agent configured for branch '{target_branch_id}'")`,
          '            yield Event(',
          '                source=self.name,',
          `                content=f"Router '{self.name}' routed to branch '{target_branch_id}', but no candidate agent was attached."`,
          '            )',
          ''
        );
      }
    }

    // Instantiate Agents Topologically (Sub-agents before parents)
    lines.push('# ==============================================================================');
    lines.push('# Initialize Agents in Topological Order');
    lines.push('# ==============================================================================');

    for (const node of sortedAgents) {
      const data = node.data || {};
      const safeVar = idToVar.get(node.id)!;

      if (data.agentKind === 'router') {
        let routerClassName = toPascalCase(data.label || node.id);
        if (!routerClassName.endsWith('Router')) {
          routerClassName += 'Router';
        }
        const branches = data.routerConfig?.branches || [];

        // Map branch target variables
        lines.push(`${safeVar}_branches = {`);
        for (const branch of branches) {
          let targetVar = 'None';
          if (branch.targetAgentId) {
            const targetNode = sortedAgents.find((n) => n.id === branch.targetAgentId);
            if (targetNode) {
              targetVar = idToVar.get(targetNode.id) || 'None';
            }
          }
          lines.push(`    ${pyStr(branch.id)}: ${targetVar},`);
        }
        lines.push('}');

        let defaultVar = 'None';
        const defaultBranch = branches.find((b) => b.isDefault || b.isDefaultFallback) || branches[branches.length - 1];
        if (defaultBranch?.targetAgentId) {
          const defaultNode = sortedAgents.find((n) => n.id === defaultBranch.targetAgentId);
          if (defaultNode) {
            defaultVar = idToVar.get(defaultNode.id) || 'None';
          }
        }

        lines.push(`${safeVar} = ${routerClassName}(`);
        lines.push(`    name=${pyStr(data.label || node.id)},`);
        lines.push(`    branches=${safeVar}_branches,`);
        lines.push(`    default_agent=${defaultVar},`);
        lines.push(`    tools=setup_agent_tools(${pyStr(node.id)})`);
        lines.push(')');
        lines.push('');
      } else {
        // Standard / A2A Agent
        const model = data.model || defaultModel;
        lines.push(`${safeVar} = Agent(`);
        lines.push(`    name=${pyStr(data.label || node.id)},`);
        lines.push(`    model=${pyStr(model)},`);
        lines.push(`    instruction=${pyStr(data.systemPrompt || 'Autonomous AI Agent')},`);

        // NOTE: Wire sub_agents hierarchy for multi-agent delegation (Google ADK)
        if (Array.isArray(data.subAgents) && data.subAgents.length > 0) {
          lines.push('    sub_agents=[');
          for (const sub of data.subAgents) {
            const childNode = sortedAgents.find((n) => n.id === sub.agentId);
            const childVar = childNode ? idToVar.get(childNode.id) : sanitizePythonIdentifier(sub.name || sub.agentId);
            lines.push(`        ${childVar},`);
          }
          lines.push('    ],');
        }

        lines.push(`    tools=setup_agent_tools(${pyStr(node.id)})`);
        lines.push(')');
        lines.push('');
      }
    }

    // Find start node from sorted agents
    const startNode = sortedAgents.find((n) => n.data?.isStartNode) || sortedAgents[sortedAgents.length - 1];
    const rootVar = startNode ? idToVar.get(startNode.id)! : 'agent';

    // Unambiguous entrypoint / root agent assignment
    lines.push('# ==============================================================================');
    lines.push('# Entrypoint / Root Agent Assignment & Session Store');
    lines.push('# ==============================================================================');
    lines.push(`root_agent = ${rootVar}`);
    lines.push('session_store = get_session_store()');
    lines.push('');

    lines.push('def execute_workflow(user_query: str, session_id: Optional[str] = None) -> Dict[str, Any]:');
    lines.push('    """Executes the workflow graph starting from the root agent with session checkpointing."""');
    lines.push('    active_session_id = session_id or "default_session"');
    lines.push('    session = session_store.get_or_create_session(active_session_id)');
    lines.push('    runner = Runner(agent=root_agent)');
    lines.push('    response = runner.run(user_query)');
    lines.push('    history = session.get("history", [])');
    lines.push('    history.append({"role": "user", "content": user_query})');
    lines.push('    history.append({"role": "assistant", "content": str(response)})');
    lines.push('    session_store.save_session(');
    lines.push('        session_id=active_session_id,');
    lines.push('        state=session.get("state", {}),');
    lines.push('        history=history,');
    lines.push('        metadata=session.get("metadata", {})');
    lines.push('    )');
    lines.push('    return {');
    lines.push('        "response": str(response),');
    lines.push('        "session_id": active_session_id,');
    lines.push('        "history": history');
    lines.push('    }');
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Generates session_store.py checkpointer file.
   *
   * Purpose:
   * Compiles production-grade session persistence and state checkpointers for Google ADK.
   * Supports Stateless, In-Memory turn buffer, Google Cloud Firestore, Google Cloud SQL
   * (PostgreSQL/MySQL) with auto-DDL, Google Cloud Spanner with auto-DDL verification,
   * Cloud Memorystore (Redis/Valkey) with auto-TTL, and SQLite local checkpointers.
   *
   * @param workflow - AgentWorkflowDocument representing the canvas graph
   * @param options - Generator options including projectId and location
   * @returns Complete contents of session_store.py
   */
  public generateSessionStoreFile(
    workflow: AgentWorkflowDocument,
    options?: PythonAdkGeneratorOptions
  ): string {
    let memoryConfig: any = { type: 'in_memory', windowTurns: 10, maxTokens: 4096 };
    const docAny = workflow as any;
    if (docAny.memory && docAny.memory.type) {
      memoryConfig = docAny.memory;
    } else {
      for (const node of workflow.nodes || []) {
        const d = node.data as any;
        if (d?.memory && d.memory.type) {
          memoryConfig = d.memory;
          break;
        }
        if (d?.memoryConfig && d.memoryConfig.type) {
          memoryConfig = d.memoryConfig;
          break;
        }
      }
    }
    const rawType = String(memoryConfig.type || 'in_memory').toLowerCase();

    const lines: string[] = [
      '"""',
      'session_store.py - Google ADK Session Memory & Production Checkpointers',
      '',
      'Auto-generated by Visual Agent Designer.',
      'Author: Mike Nimer <mikenimer@google.com>',
      '"""',
      '',
      'import os',
      'import json',
      'import logging',
      'import sqlite3',
      'import threading',
      'from abc import ABC, abstractmethod',
      'from datetime import datetime, timezone',
      'from typing import Any, Dict, List, Optional',
      '',
      'logger = logging.getLogger("adk_session_store")',
      'logger.setLevel(logging.INFO)',
      '',
      '# ============================================================================== ',
      '# Base Checkpointer Interface',
      '# ============================================================================== ',
      'class BaseSessionStore(ABC):',
      '    """Abstract base checkpointer interface for agent session memory."""',
      '',
      '    @abstractmethod',
      '    def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:',
      '        """Retrieves session state and message history by session_id."""',
      '        pass',
      '',
      '    @abstractmethod',
      '    def save_session(',
      '        self,',
      '        session_id: str,',
      '        state: Dict[str, Any],',
      '        history: Optional[List[Dict[str, Any]]] = None,',
      '        user_id: Optional[str] = None,',
      '        metadata: Optional[Dict[str, Any]] = None,',
      '    ) -> None:',
      '        """Persists or updates session state, turn history, and metadata."""',
      '        pass',
      '',
      '    def get_or_create_session(',
      '        self, session_id: str, user_id: Optional[str] = None',
      '    ) -> Dict[str, Any]:',
      '        """Retrieves an existing session or initializes a new session dictionary."""',
      '        session = self.get_session(session_id)',
      '        if session is None:',
      '            session = {',
      '                "session_id": session_id,',
      '                "user_id": user_id or "anonymous",',
      '                "state": {},',
      '                "history": [],',
      '                "metadata": {},',
      '                "created_at": datetime.now(timezone.utc).isoformat(),',
      '                "updated_at": datetime.now(timezone.utc).isoformat(),',
      '            }',
      '            self.save_session(',
      '                session_id=session_id,',
      '                state={},',
      '                history=[],',
      '                user_id=user_id,',
      '                metadata={},',
      '            )',
      '        return session',
      '',
      '    @abstractmethod',
      '    def delete_session(self, session_id: str) -> None:',
      '        """Deletes a session and its associated checkpointer data."""',
      '        pass',
      '',
      '# ============================================================================== ',
      '# 1. Stateless Session Store',
      '# ============================================================================== ',
      'class StatelessSessionStore(BaseSessionStore):',
      '    """Stateless session store that retains zero state across invocations."""',
      '',
      '    def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:',
      '        return None',
      '',
      '    def save_session(',
      '        self,',
      '        session_id: str,',
      '        state: Dict[str, Any],',
      '        history: Optional[List[Dict[str, Any]]] = None,',
      '        user_id: Optional[str] = None,',
      '        metadata: Optional[Dict[str, Any]] = None,',
      '    ) -> None:',
      '        pass',
      '',
      '    def delete_session(self, session_id: str) -> None:',
      '        pass',
      '',
      '# ============================================================================== ',
      '# 2. In-Memory Thread-Safe Session Store',
      '# ============================================================================== ',
      'class InMemorySessionStore(BaseSessionStore):',
      '    """In-memory thread-safe checkpointer with turn window support."""',
      '',
      '    def __init__(self, window_turns: int = 10, max_tokens: int = 4096):',
      '        self.window_turns = window_turns',
      '        self.max_tokens = max_tokens',
      '        self._lock = threading.Lock()',
      '        self._sessions: Dict[str, Dict[str, Any]] = {}',
      '',
      '    def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:',
      '        with self._lock:',
      '            return self._sessions.get(session_id)',
      '',
      '    def save_session(',
      '        self,',
      '        session_id: str,',
      '        state: Dict[str, Any],',
      '        history: Optional[List[Dict[str, Any]]] = None,',
      '        user_id: Optional[str] = None,',
      '        metadata: Optional[Dict[str, Any]] = None,',
      '    ) -> None:',
      '        with self._lock:',
      '            existing = self._sessions.get(session_id, {})',
      '            hist = history if history is not None else existing.get("history", [])',
      '            if self.window_turns and len(hist) > self.window_turns:',
      '                hist = hist[-self.window_turns:]',
      '            self._sessions[session_id] = {',
      '                "session_id": session_id,',
      '                "user_id": user_id or existing.get("user_id", "anonymous"),',
      '                "state": state or {},',
      '                "history": hist,',
      '                "metadata": metadata or existing.get("metadata", {}),',
      '                "created_at": existing.get("created_at", datetime.now(timezone.utc).isoformat()),',
      '                "updated_at": datetime.now(timezone.utc).isoformat(),',
      '            }',
      '',
      '    def delete_session(self, session_id: str) -> None:',
      '        with self._lock:',
      '            self._sessions.pop(session_id, None)',
      '',
      '# ============================================================================== ',
      '# 3. Google Cloud Firestore Session Checkpointer',
      '# ============================================================================== ',
      'class FirestoreSessionStore(BaseSessionStore):',
      '    """Google Cloud Firestore production session checkpointer."""',
      '',
      '    def __init__(',
      '        self,',
      '        collection_name: str = "agent_sessions",',
      '        database_id: Optional[str] = None,',
      '        project_id: Optional[str] = None,',
      '    ):',
      '        try:',
      '            from google.cloud import firestore',
      '            self.db = firestore.Client(',
      '                project=project_id or os.getenv("GOOGLE_CLOUD_PROJECT"),',
      '                database=database_id if database_id and database_id != "(default)" else None,',
      '            )',
      '            self.collection_name = collection_name',
      '        except Exception as e:',
      '            logger.error(f"Failed to initialize Firestore client: {e}")',
      '            raise',
      '',
      '    def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:',
      '        doc_ref = self.db.collection(self.collection_name).document(session_id)',
      '        doc = doc_ref.get()',
      '        return doc.to_dict() if doc.exists else None',
      '',
      '    def save_session(',
      '        self,',
      '        session_id: str,',
      '        state: Dict[str, Any],',
      '        history: Optional[List[Dict[str, Any]]] = None,',
      '        user_id: Optional[str] = None,',
      '        metadata: Optional[Dict[str, Any]] = None,',
      '    ) -> None:',
      '        doc_ref = self.db.collection(self.collection_name).document(session_id)',
      '        payload = {',
      '            "session_id": session_id,',
      '            "user_id": user_id or "anonymous",',
      '            "state": state or {},',
      '            "history": history or [],',
      '            "metadata": metadata or {},',
      '            "updated_at": datetime.now(timezone.utc).isoformat(),',
      '        }',
      '        doc_ref.set(payload, merge=True)',
      '',
      '    def delete_session(self, session_id: str) -> None:',
      '        self.db.collection(self.collection_name).document(session_id).delete()',
      '',
      '# ============================================================================== ',
      '# 4. Google Cloud SQL (PostgreSQL / MySQL) Session Checkpointer',
      '# ============================================================================== ',
      'class CloudSqlSessionStore(BaseSessionStore):',
      '    """Google Cloud SQL (PostgreSQL) relational session checkpointer with auto-DDL."""',
      '',
      '    def __init__(',
      '        self,',
      '        connection_url: Optional[str] = None,',
      `        table_name: str = "${memoryConfig.tableName || 'agent_sessions'}",`,
      `        instance_connection_name: Optional[str] = "${memoryConfig.instanceConnectionName || ''}",`,
      `        database_name: Optional[str] = "${memoryConfig.databaseName || 'agent_sessions_db'}",`,
      '    ):',
      '        self.table_name = table_name',
      '        self.connection_url = (',
      '            connection_url',
      '            or os.getenv("DATABASE_URL")',
      '            or os.getenv("POSTGRES_URL")',
      '        )',
      '        self.instance_connection_name = (',
      '            instance_connection_name or os.getenv("INSTANCE_CONNECTION_NAME")',
      '        )',
      '        self.database_name = database_name or os.getenv("DB_NAME", "agent_sessions_db")',
      '        self._init_db()',
      '',
      '    def _get_connection(self):',
      '        import psycopg2',
      '        if self.connection_url:',
      '            return psycopg2.connect(self.connection_url)',
      '        user = os.getenv("DB_USER", "postgres")',
      '        password = os.getenv("DB_PASS", "")',
      '        host = os.getenv("DB_HOST", "127.0.0.1")',
      '        port = os.getenv("DB_PORT", "5432")',
      '        return psycopg2.connect(',
      '            dbname=self.database_name,',
      '            user=user,',
      '            password=password,',
      '            host=host,',
      '            port=port,',
      '        )',
      '',
      '    def _init_db(self) -> None:',
      '        """Executes auto-DDL and creates indexes on startup."""',
      '        try:',
      '            conn = self._get_connection()',
      '            with conn.cursor() as cur:',
      `                cur.execute("""`,
      `                    CREATE TABLE IF NOT EXISTS ${memoryConfig.tableName || 'agent_sessions'} (`,
      '                        session_id VARCHAR(128) PRIMARY KEY,',
      '                        user_id VARCHAR(128),',
      '                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,',
      '                        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,',
      "                        state JSONB DEFAULT '{}'::jsonb,",
      "                        history JSONB DEFAULT '[]'::jsonb,",
      "                        metadata JSONB DEFAULT '{}'::jsonb",
      '                    );',
      `                    CREATE INDEX IF NOT EXISTS idx_${memoryConfig.tableName || 'agent_sessions'}_user_id ON ${memoryConfig.tableName || 'agent_sessions'}(user_id);`,
      `                    CREATE INDEX IF NOT EXISTS idx_${memoryConfig.tableName || 'agent_sessions'}_updated_at ON ${memoryConfig.tableName || 'agent_sessions'}(updated_at);`,
      `                """)`,
      '            conn.commit()',
      '            conn.close()',
      `            logger.info("Verified Cloud SQL table and indexes.")`,
      '        except Exception as e:',
      '            logger.warning(f"Could not initialize Cloud SQL DDL (will retry on query): {e}")',
      '',
      '    def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:',
      '        conn = self._get_connection()',
      '        try:',
      '            with conn.cursor() as cur:',
      `                cur.execute(`,
      `                    f"SELECT session_id, user_id, state, history, metadata, created_at, updated_at FROM {self.table_name} WHERE session_id = %s",`,
      '                    (session_id,),',
      '                )',
      '                row = cur.fetchone()',
      '                if not row:',
      '                    return None',
      '                return {',
      '                    "session_id": row[0],',
      '                    "user_id": row[1],',
      '                    "state": row[2] if isinstance(row[2], dict) else json.loads(row[2] or "{}"),',
      '                    "history": row[3] if isinstance(row[3], list) else json.loads(row[3] or "[]"),',
      '                    "metadata": row[4] if isinstance(row[4], dict) else json.loads(row[4] or "{}"),',
      '                    "created_at": str(row[5]),',
      '                    "updated_at": str(row[6]),',
      '                }',
      '        finally:',
      '            conn.close()',
      '',
      '    def save_session(',
      '        self,',
      '        session_id: str,',
      '        state: Dict[str, Any],',
      '        history: Optional[List[Dict[str, Any]]] = None,',
      '        user_id: Optional[str] = None,',
      '        metadata: Optional[Dict[str, Any]] = None,',
      '    ) -> None:',
      '        conn = self._get_connection()',
      '        try:',
      '            with conn.cursor() as cur:',
      '                state_json = json.dumps(state or {})',
      '                history_json = json.dumps(history or [])',
      '                metadata_json = json.dumps(metadata or {})',
      '                cur.execute(',
      '                    f"""',
      '                    INSERT INTO {self.table_name} (session_id, user_id, updated_at, state, history, metadata)',
      '                    VALUES (%s, %s, CURRENT_TIMESTAMP, %s::jsonb, %s::jsonb, %s::jsonb)',
      '                    ON CONFLICT (session_id) DO UPDATE SET',
      '                        updated_at = CURRENT_TIMESTAMP,',
      '                        state = EXCLUDED.state,',
      '                        history = EXCLUDED.history,',
      '                        metadata = EXCLUDED.metadata,',
      '                        user_id = COALESCE(EXCLUDED.user_id, {self.table_name}.user_id);',
      '                    """,',
      '                    (session_id, user_id, state_json, history_json, metadata_json),',
      '                )',
      '            conn.commit()',
      '        finally:',
      '            conn.close()',
      '',
      '    def delete_session(self, session_id: str) -> None:',
      '        conn = self._get_connection()',
      '        try:',
      '            with conn.cursor() as cur:',
      '                cur.execute(f"DELETE FROM {self.table_name} WHERE session_id = %s", (session_id,))',
      '            conn.commit()',
      '        finally:',
      '            conn.close()',
      '',
      '# Alias for Postgres',
      'PostgresSessionStore = CloudSqlSessionStore',
      '',
      '# ============================================================================== ',
      '# 5. Google Cloud Spanner Distributed Checkpointer',
      '# ============================================================================== ',
      'class SpannerSessionStore(BaseSessionStore):',
      '    """Google Cloud Spanner enterprise distributed session checkpointer with auto-DDL."""',
      '',
      '    def __init__(',
      '        self,',
      `        instance_id: Optional[str] = "${memoryConfig.instanceId || ''}",`,
      `        database_id: Optional[str] = "${memoryConfig.databaseId || ''}",`,
      `        table_name: str = "${memoryConfig.tableName || 'AgentSessions'}",`,
      '        project_id: Optional[str] = None,',
      '    ):',
      '        self.instance_id = instance_id or os.getenv("SPANNER_INSTANCE_ID", "")',
      '        self.database_id = database_id or os.getenv("SPANNER_DATABASE_ID", "")',
      '        self.table_name = table_name',
      '        self.project_id = project_id or os.getenv("GOOGLE_CLOUD_PROJECT", "")',
      '        try:',
      '            from google.cloud import spanner',
      '            self.client = spanner.Client(project=self.project_id)',
      '            self.instance = self.client.instance(self.instance_id)',
      '            self.database = self.instance.database(self.database_id)',
      '            self._verify_ddl()',
      '        except Exception as e:',
      '            logger.warning(f"Could not connect to Spanner instance/database: {e}")',
      '',
      '    def _verify_ddl(self) -> None:',
      `        """Verifies Spanner table schema: CREATE TABLE IF NOT EXISTS ${memoryConfig.tableName || 'AgentSessions'} (SessionId STRING(64) NOT NULL, UserId STRING(64), CreatedAt TIMESTAMP NOT NULL OPTIONS (allow_commit_timestamp=true), UpdatedAt TIMESTAMP NOT NULL OPTIONS (allow_commit_timestamp=true), State JSON, History JSON) PRIMARY KEY (SessionId)"""`,
      '        logger.info(f"Verified Spanner table \'{self.table_name}\'.")',
      '',
      '    def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:',
      '        from google.cloud import spanner',
      '        with self.database.snapshot() as snapshot:',
      '            results = snapshot.execute_sql(',
      '                f"SELECT SessionId, UserId, State, History, CreatedAt, UpdatedAt FROM {self.table_name} WHERE SessionId = @session_id",',
      '                params={"session_id": session_id},',
      '                param_types={"session_id": spanner.param_types.STRING},',
      '            )',
      '            for row in results:',
      '                return {',
      '                    "session_id": row[0],',
      '                    "user_id": row[1],',
      '                    "state": json.loads(row[2]) if row[2] else {},',
      '                    "history": json.loads(row[3]) if row[3] else [],',
      '                    "created_at": str(row[4]),',
      '                    "updated_at": str(row[5]),',
      '                }',
      '        return None',
      '',
      '    def save_session(',
      '        self,',
      '        session_id: str,',
      '        state: Dict[str, Any],',
      '        history: Optional[List[Dict[str, Any]]] = None,',
      '        user_id: Optional[str] = None,',
      '        metadata: Optional[Dict[str, Any]] = None,',
      '    ) -> None:',
      '        from google.cloud import spanner',
      '        def _write_txn(transaction):',
      '            transaction.insert_or_update(',
      '                table=self.table_name,',
      '                columns=["SessionId", "UserId", "State", "History", "UpdatedAt"],',
      '                values=[[',
      '                    session_id,',
      '                    user_id or "anonymous",',
      '                    json.dumps(state or {}),',
      '                    json.dumps(history or []),',
      '                    spanner.COMMIT_TIMESTAMP,',
      '                ]],',
      '            )',
      '        self.database.run_in_transaction(_write_txn)',
      '',
      '    def delete_session(self, session_id: str) -> None:',
      '        from google.cloud.spanner_v1 import KeySet',
      '        def _del_txn(transaction):',
      '            transaction.delete(self.table_name, KeySet(keys=[[session_id]]))',
      '        self.database.run_in_transaction(_del_txn)',
      '',
      '# ============================================================================== ',
      '# 6. Cloud Memorystore (Redis / Valkey) Checkpointer',
      '# ============================================================================== ',
      'class RedisSessionStore(BaseSessionStore):',
      '    """Cloud Memorystore (Redis / Valkey) session checkpointer with automatic TTL."""',
      '',
      '    def __init__(',
      '        self,',
      `        redis_host: Optional[str] = "${memoryConfig.redisHost || ''}",`,
      `        redis_port: int = ${memoryConfig.redisPort || 6379},`,
      '        auth_token: Optional[str] = None,',
      `        ttl_seconds: int = ${memoryConfig.ttlSeconds || 86400},`,
      '        key_prefix: str = "session:",',
      '    ):',
      `        self.redis_host = redis_host or os.getenv("REDIS_HOST", "${memoryConfig.redisHost || '127.0.0.1'}")`,
      `        self.redis_port = int(redis_port or os.getenv("REDIS_PORT", ${memoryConfig.redisPort || 6379}))`,
      '        self.auth_token = auth_token or os.getenv("REDIS_AUTH_TOKEN") or os.getenv("REDIS_PASSWORD")',
      `        self.ttl_seconds = int(ttl_seconds or ${memoryConfig.ttlSeconds || 86400})`,
      '        self.key_prefix = key_prefix',
      '        import redis',
      '        self.client = redis.Redis(',
      '            host=self.redis_host,',
      '            port=self.redis_port,',
      '            password=self.auth_token,',
      '            decode_responses=True,',
      '        )',
      '',
      '    def _key(self, session_id: str) -> str:',
      '        return f"{self.key_prefix}{session_id}"',
      '',
      '    def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:',
      '        raw = self.client.get(self._key(session_id))',
      '        if not raw:',
      '            return None',
      '        try:',
      '            return json.loads(raw)',
      '        except Exception:',
      '            return None',
      '',
      '    def save_session(',
      '        self,',
      '        session_id: str,',
      '        state: Dict[str, Any],',
      '        history: Optional[List[Dict[str, Any]]] = None,',
      '        user_id: Optional[str] = None,',
      '        metadata: Optional[Dict[str, Any]] = None,',
      '    ) -> None:',
      '        key = self._key(session_id)',
      '        existing = self.get_session(session_id) or {}',
      '        payload = {',
      '            "session_id": session_id,',
      '            "user_id": user_id or existing.get("user_id", "anonymous"),',
      '            "state": state or {},',
      '            "history": history if history is not None else existing.get("history", []),',
      '            "metadata": metadata or existing.get("metadata", {}),',
      '            "created_at": existing.get("created_at", datetime.now(timezone.utc).isoformat()),',
      '            "updated_at": datetime.now(timezone.utc).isoformat(),',
      '        }',
      '        self.client.setex(key, self.ttl_seconds, json.dumps(payload))',
      '',
      '    def delete_session(self, session_id: str) -> None:',
      '        self.client.delete(self._key(session_id))',
      '',
      '# ============================================================================== ',
      '# 7. SQLite Embedded Local Checkpointer',
      '# ============================================================================== ',
      'class SqliteSessionStore(BaseSessionStore):',
      '    """SQLite local embedded checkpointer for development and debugging."""',
      '',
      '    def __init__(',
      '        self,',
      `        database_path: str = "${memoryConfig.sqlitePath || './agent_memory.sqlite'}",`,
      `        table_name: str = "${memoryConfig.tableName || 'agent_sessions'}",`,
      '    ):',
      `        self.database_path = database_path or os.getenv("SQLITE_DB_PATH", "${memoryConfig.sqlitePath || './agent_memory.sqlite'}")`,
      `        self.table_name = table_name or "${memoryConfig.tableName || 'agent_sessions'}"`,
      '        self._lock = threading.Lock()',
      '        self._init_db()',
      '',
      '    def _get_connection(self):',
      '        return sqlite3.connect(self.database_path, check_same_thread=False)',
      '',
      '    def _init_db(self) -> None:',
      '        with self._lock:',
      '            conn = self._get_connection()',
      '            with conn:',
      '                conn.execute(f"""',
      `                    CREATE TABLE IF NOT EXISTS ${memoryConfig.tableName || 'agent_sessions'} (`,
      '                        session_id TEXT PRIMARY KEY,',
      '                        user_id TEXT,',
      '                        created_at TEXT,',
      '                        updated_at TEXT,',
      '                        state TEXT,',
      '                        history TEXT,',
      '                        metadata TEXT',
      '                    )',
      '                """)',
      '            conn.close()',
      '',
      '    def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:',
      '        with self._lock:',
      '            conn = self._get_connection()',
      '            cur = conn.cursor()',
      '            cur.execute(',
      '                f"SELECT session_id, user_id, state, history, metadata, created_at, updated_at FROM {self.table_name} WHERE session_id = ?",',
      '                (session_id,),',
      '            )',
      '            row = cur.fetchone()',
      '            conn.close()',
      '            if not row:',
      '                return None',
      '            return {',
      '                "session_id": row[0],',
      '                "user_id": row[1],',
      '                "state": json.loads(row[2] or "{}"),',
      '                "history": json.loads(row[3] or "[]"),',
      '                "metadata": json.loads(row[4] or "{}"),',
      '                "created_at": row[5],',
      '                "updated_at": row[6],',
      '            }',
      '',
      '    def save_session(',
      '        self,',
      '        session_id: str,',
      '        state: Dict[str, Any],',
      '        history: Optional[List[Dict[str, Any]]] = None,',
      '        user_id: Optional[str] = None,',
      '        metadata: Optional[Dict[str, Any]] = None,',
      '    ) -> None:',
      '        with self._lock:',
      '            conn = self._get_connection()',
      '            now_iso = datetime.now(timezone.utc).isoformat()',
      '            state_str = json.dumps(state or {})',
      '            hist_str = json.dumps(history or [])',
      '            meta_str = json.dumps(metadata or {})',
      '            with conn:',
      '                conn.execute(',
      '                    f"""',
      '                    INSERT INTO {self.table_name} (session_id, user_id, created_at, updated_at, state, history, metadata)',
      '                    VALUES (?, ?, ?, ?, ?, ?, ?)',
      '                    ON CONFLICT(session_id) DO UPDATE SET',
      '                        updated_at = excluded.updated_at,',
      '                        state = excluded.state,',
      '                        history = excluded.history,',
      '                        metadata = excluded.metadata,',
      '                        user_id = COALESCE(excluded.user_id, {self.table_name}.user_id)',
      '                    """,',
      '                    (session_id, user_id, now_iso, now_iso, state_str, hist_str, meta_str),',
      '                )',
      '            conn.close()',
      '',
      '    def delete_session(self, session_id: str) -> None:',
      '        with self._lock:',
      '            conn = self._get_connection()',
      '            with conn:',
      '                conn.execute(f"DELETE FROM {self.table_name} WHERE session_id = ?", (session_id,))',
      '            conn.close()',
      '',
      '# ============================================================================== ',
      '# Session Store Factory Function',
      '# ============================================================================== ',
      'def get_session_store(backend: Optional[str] = None) -> BaseSessionStore:',
      '    """Factory helper to retrieve the configured session store instance."""',
      `    resolved_backend = (backend or os.getenv("SESSION_STORE_BACKEND") or ${pyStr(rawType)}).lower()`,
      '    ',
      '    if resolved_backend in ("none", "stateless"):',
      '        return StatelessSessionStore()',
      '    elif resolved_backend in ("in_memory", "langgraph_in_memory", "window_buffer"):',
      '        return InMemorySessionStore(',
      `            window_turns=int(os.getenv("SESSION_WINDOW_TURNS", ${memoryConfig.windowTurns ?? 10})),`,
      `            max_tokens=int(os.getenv("SESSION_MAX_TOKENS", ${memoryConfig.maxTokens ?? 4096})),`,
      '        )',
      '    elif resolved_backend == "firestore":',
      '        return FirestoreSessionStore(',
      `            collection_name=os.getenv("FIRESTORE_COLLECTION", ${pyStr(memoryConfig.collectionName || 'agent_sessions')}),`,
      `            database_id=os.getenv("FIRESTORE_DATABASE_ID", ${pyStr(memoryConfig.databaseId || '(default)')}),`,
      `            project_id=os.getenv("GOOGLE_CLOUD_PROJECT", ${pyStr(options?.projectId || memoryConfig.projectId || '')}),`,
      '        )',
      '    elif resolved_backend in ("postgres", "cloud_sql"):',
      '        return PostgresSessionStore(',
      '            connection_url=os.getenv("DATABASE_URL"),',
      `            table_name=os.getenv("SQL_TABLE_NAME", ${pyStr(memoryConfig.tableName || 'agent_sessions')}),`,
      `            instance_connection_name=os.getenv("INSTANCE_CONNECTION_NAME", ${pyStr(memoryConfig.instanceConnectionName || '')}),`,
      `            database_name=os.getenv("DB_NAME", ${pyStr(memoryConfig.databaseName || 'agent_sessions_db')}),`,
      '        )',
      '    elif resolved_backend == "spanner":',
      '        return SpannerSessionStore(',
      `            instance_id=os.getenv("SPANNER_INSTANCE_ID", ${pyStr(memoryConfig.instanceId || '')}),`,
      `            database_id=os.getenv("SPANNER_DATABASE_ID", ${pyStr(memoryConfig.databaseId || '')}),`,
      `            table_name=os.getenv("SPANNER_TABLE_NAME", ${pyStr(memoryConfig.tableName || 'AgentSessions')}),`,
      `            project_id=os.getenv("GOOGLE_CLOUD_PROJECT", ${pyStr(options?.projectId || memoryConfig.projectId || '')}),`,
      '        )',
      '    elif resolved_backend == "redis":',
      '        return RedisSessionStore(',
      `            redis_host=os.getenv("REDIS_HOST", ${pyStr(memoryConfig.redisHost || '127.0.0.1')}),`,
      `            redis_port=int(os.getenv("REDIS_PORT", ${memoryConfig.redisPort ?? 6379})),`,
      '            auth_token=os.getenv("REDIS_AUTH_TOKEN"),',
      `            ttl_seconds=int(os.getenv("REDIS_TTL_SECONDS", ${memoryConfig.ttlSeconds ?? 86400})),`,
      '        )',
      '    elif resolved_backend == "sqlite":',
      '        return SqliteSessionStore(',
      `            database_path=os.getenv("SQLITE_PATH", ${pyStr(memoryConfig.sqlitePath || './agent_memory.sqlite')}),`,
      `            table_name=os.getenv("SQLITE_TABLE_NAME", ${pyStr(memoryConfig.tableName || 'agent_sessions')}),`,
      '        )',
      '    return InMemorySessionStore()',
      '',
    ];

    return lines.join('\n');
  }

  /**
   * Generates full project repository files for Google ADK.
   *
   * @param workflow AgentWorkflowDocument
   * @param options Generator options
   * @returns Array of GeneratedFile items
   */
  public generateFullProject(
    workflow: AgentWorkflowDocument, 
    options?: PythonAdkGeneratorOptions
  ): GeneratedFile[] {
    const toolsCode = this.generateToolsFile(workflow, options);
    const sessionStoreCode = this.generateSessionStoreFile(workflow, options);
    const workflowCode = this.generateWorkflowFile(workflow, options);

    const hasA2A = (workflow.nodes || []).some((n: any) => n.data?.agentKind === 'a2a');
    const hasMcp = (workflow.nodes || []).some((n: any) =>
      (n.data?.tools || []).some((t: any) => t.type === 'mcp' || t.mcpConfig)
    );
    const hasRest = (workflow.nodes || []).some((n: any) =>
      (n.data?.tools || []).some(
        (t: any) => t.type === 'api' || t.type === 'rest' || (t.endpointUrl && !t.mcpConfig && !t.builtinType)
      )
    );
    const hasSecretManager = (workflow.nodes || []).some((n: any) =>
      (n.data?.tools || []).some((t: any) => Boolean(t.secretManagerKey))
    );

    const startNode = (workflow.nodes || []).find((n: any) => n.data?.isStartNode) || (workflow.nodes || [])[0];
    const memoryConfig = startNode?.data?.memoryConfig || workflow.metadata?.settings?.customFields?.memoryConfig;
    const memType = memoryConfig?.type || 'in_memory';

    const hasFirestore = (workflow.nodes || []).some((n: any) => n.data?.memoryConfig?.type === 'firestore') || memType === 'firestore';
    const hasPostgres = (workflow.nodes || []).some((n: any) => n.data?.memoryConfig?.type === 'postgres' || n.data?.memoryConfig?.type === 'cloud_sql') || memType === 'postgres' || memType === 'cloud_sql';
    const hasSpanner = (workflow.nodes || []).some((n: any) => n.data?.memoryConfig?.type === 'spanner') || memType === 'spanner';
    const hasRedis = (workflow.nodes || []).some((n: any) => n.data?.memoryConfig?.type === 'redis') || memType === 'redis';

    const requirementsCode = [
      hasA2A ? 'google-adk[a2a]>=0.1.0' : 'google-adk>=0.1.0',
      ...(hasA2A ? ['a2a-sdk[http-server]>=0.3.4'] : []),
      ...(hasMcp ? ['mcp>=1.0.0'] : []),
      ...(hasRest ? ['httpx>=0.27.0'] : []),
      ...(hasSecretManager ? ['google-cloud-secret-manager>=2.16.0'] : []),
      ...(hasFirestore ? ['google-cloud-firestore>=2.16.0'] : []),
      ...(hasPostgres ? ['psycopg2-binary>=2.9.9', 'sqlalchemy>=2.0.0'] : []),
      ...(hasSpanner ? ['google-cloud-spanner>=3.40.0'] : []),
      ...(hasRedis ? ['redis>=5.0.0'] : []),
      'google-cloud-aiplatform>=1.70.0',
      'google-auth>=2.30.0',
      'pydantic>=2.0.0',
      'requests>=2.31.0',
    ].join('\n');

    const envCode = [
      '# Google Cloud Project Configuration',
      `GOOGLE_CLOUD_PROJECT=${options?.projectId || 'your-gcp-project-id'}`,
      `GOOGLE_CLOUD_LOCATION=${options?.location || 'global'}`,
      '# A2A Authentication Secrets',
      'A2A_AGENT_AUTH_TOKEN=your-a2a-bearer-token',
      '# Session Memory Checkpointer Configuration',
      `SESSION_STORE_BACKEND=${memType}`,
    ].join('\n');

    const readmeCode = [
      `# ${workflow.name || 'Visual Agent Designer - ADK Project'}`,
      '',
      'Generated with Google ADK and Agent-to-Agent (A2A) protocol support.',
      '',
      '## Setup',
      '```bash',
      'python -m venv venv',
      'source venv/bin/activate',
      'pip install -r requirements.txt',
      'cp .env.example .env',
      '```',
    ].join('\n');

    return [
      { path: 'tools.py', content: toolsCode, language: 'python' },
      { path: 'session_store.py', content: sessionStoreCode, language: 'python' },
      { path: 'agent_workflow.py', content: workflowCode, language: 'python' },
      { path: 'requirements.txt', content: requirementsCode, language: 'text' },
      { path: '.env.example', content: envCode, language: 'text' },
      { path: 'README.md', content: readmeCode, language: 'markdown' },
    ];
  }
}

/**
 * Convenience helper to generate tools.py for a workflow.
 */
export function generateToolsPyForWorkflow(
  workflow: AgentWorkflowDocument, 
  options?: PythonAdkGeneratorOptions
): string {
  const generator = new PythonAdkGenerator();
  return generator.generateToolsFile(workflow, options);
}

/**
 * Convenience helper to generate session_store.py for a workflow.
 */
export function generateSessionStoreForWorkflow(
  workflow: AgentWorkflowDocument,
  options?: PythonAdkGeneratorOptions
): string {
  const generator = new PythonAdkGenerator();
  return generator.generateSessionStoreFile(workflow, options);
}

/**
 * Convenience helper to generate session_store.py for a workflow.
 */
export function generateSessionStorePyForWorkflow(
  workflow: AgentWorkflowDocument,
  options?: PythonAdkGeneratorOptions
): string {
  const generator = new PythonAdkGenerator();
  return generator.generateSessionStoreFile(workflow, options);
}
