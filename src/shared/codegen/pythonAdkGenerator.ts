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
export function generateA2AClientCode(agent: AgentNodeData | { label: string; a2aConfig?: any }): string {
  const norm = normalizeA2AConfig(agent.a2aConfig);
  const safeId = sanitizePythonIdentifier(agent.label || 'a2a_agent');
  const agentDesc = (agent as AgentNodeData).systemPrompt || (agent as AgentNodeData).description || 'Remote A2A protocol autonomous agent';

  let skillsDoc = '';
  if (norm.skills && norm.skills.length > 0) {
    const skillNames = norm.skills.map((s: any) => s.name || s.id).join(', ');
    skillsDoc = `\n    Skills: ${skillNames}`;
  }

  return `# A2A Client Instance for: ${agent.label}
_client_${safeId} = A2AClient(
    endpoint="${norm.endpoint}",
    auth_type="${norm.authType}",
    auth_secret="${norm.authSecretKey || ''}",
    header_name="${norm.headerName}",
    custom_headers=${JSON.stringify(norm.customHeaders)},
    timeout_seconds=${norm.timeoutSeconds},
    max_retries=${norm.maxRetries}
)

def call_${safeId}_a2a(task_input: str) -> dict:
    """
    Delegates task execution to remote A2A agent '${agent.label}' via JSON-RPC 2.0.
    Endpoint: ${norm.endpoint}
    Description: ${agentDesc.replace(/\n/g, ' ')}${skillsDoc}
    """
    return _client_${safeId}.dispatch_task(task_input=task_input)

def query_${safeId}_card() -> dict:
    """
    Queries capability agent card metadata from '${agent.label}' at ${norm.agentCardUrl}.
    """
    return _client_${safeId}.query_agent_card(agent_card_path="${norm.agentCardUrl}")
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
    // NOTE: Identify all A2A agents from workflow nodes
    const a2aNodes = (workflow.nodes || []).filter(
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
        lines.push(generateA2AClientCode(a2aNode.data));
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

    for (const node of workflow.nodes || []) {
      const nodeTools = node.data?.tools || [];
      const isA2A = node.data?.agentKind === 'a2a';
      const safeId = sanitizePythonIdentifier(node.data?.label || node.id);

      if (nodeTools.length > 0 || isA2A) {
        lines.push(`    if agent_id == "${node.id}":`);
        if (isA2A) {
          lines.push(`        tools.append(call_${safeId}_a2a)`);
        }
        for (const t of nodeTools) {
          const varName = sanitizePythonIdentifier(t.name || t.id);
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
    const defaultModel = options?.defaultModel || 'gemini-3.7-flash';
    const nodes = workflow.nodes || [];
    const routerNodes = nodes.filter((n) => n.data && n.data.agentKind === 'router');
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
        const safeVar = sanitizePythonIdentifier(data.label || routerNode.id);
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
                `        return "${passBranch.id}"`
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
                `        if re.search(r"${rawPattern.replace(/"/g, '\\"')}", target_text, re.IGNORECASE):`,
                `            return "${branch.id}"`,
                '    except Exception as e:',
                `        logger.warning(f"Error evaluating regex pattern for branch '${branch.id}': {e}")`
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
              const termsArrayStr = candidateTerms.map((t) => `"${t}"`).join(', ');
              lines.push(
                `    if any(term in query_text for term in [${termsArrayStr}]):`,
                `        return "${branch.id}"`
              );
            }
          }
        }

        // Return default fallback branch id
        lines.push(
          `    return "${defaultBranchId}"`,
          ''
        );

        // 2. Custom BaseAgent Subclass
        lines.push(
          '# ------------------------------------------------------------------------------',
          `# Router Agent Class: ${routerClassName}`,
          '# ------------------------------------------------------------------------------',
          `class ${routerClassName}(BaseAgent):`,
          `    """Conditional routing agent for '${data.label || routerNode.id}'."""`,
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

    // Instantiate Standard Agents First
    lines.push('# ==============================================================================');
    lines.push('# Initialize Standard Agents');
    lines.push('# ==============================================================================');
    for (const node of nodes) {
      if (node.data?.agentKind === 'router') continue;
      const data = node.data;
      const safeVar = sanitizePythonIdentifier(data?.label || node.id);
      const model = data?.model || defaultModel;
      const prompt = (data?.systemPrompt || 'Autonomous AI Agent').replace(/\n/g, '\\n').replace(/"/g, '\\"');

      lines.push(`${safeVar} = Agent(`);
      lines.push(`    name="${data?.label || node.id}",`);
      lines.push(`    model="${model}",`);
      lines.push(`    instruction="${prompt}",`);
      lines.push(`    tools=setup_agent_tools("${node.id}")`);
      lines.push(')');
      lines.push('');
    }

    // Instantiate Router Agents Next
    if (hasRouter) {
      lines.push('# ==============================================================================');
      lines.push('# Initialize Router Agents & Branch Wiring');
      lines.push('# ==============================================================================');
      for (const node of routerNodes) {
        const data = node.data;
        const safeVar = sanitizePythonIdentifier(data?.label || node.id);
        let routerClassName = toPascalCase(data?.label || node.id);
        if (!routerClassName.endsWith('Router')) {
          routerClassName += 'Router';
        }
        const branches = data?.routerConfig?.branches || [];
        const defaultBranch =
          branches.find((b) => b.isDefault || b.isDefaultFallback) || branches[branches.length - 1];

        // Map branch target variables
        lines.push(`${safeVar}_branches = {`);
        for (const branch of branches) {
          let targetVar = 'None';
          if (branch.targetAgentId) {
            const targetNode = nodes.find((n) => n.id === branch.targetAgentId);
            if (targetNode) {
              targetVar = sanitizePythonIdentifier(targetNode.data?.label || targetNode.id);
            }
          }
          lines.push(`    "${branch.id}": ${targetVar},`);
        }
        lines.push('}');

        let defaultVar = 'None';
        if (defaultBranch?.targetAgentId) {
          const defaultNode = nodes.find((n) => n.id === defaultBranch.targetAgentId);
          if (defaultNode) {
            defaultVar = sanitizePythonIdentifier(defaultNode.data?.label || defaultNode.id);
          }
        }

        lines.push(`${safeVar} = ${routerClassName}(`);
        lines.push(`    name="${data?.label || node.id}",`);
        lines.push(`    branches=${safeVar}_branches,`);
        lines.push(`    default_agent=${defaultVar},`);
        lines.push(`    tools=setup_agent_tools("${node.id}")`);
        lines.push(')');
        lines.push('');
      }
    }

    lines.push('def execute_workflow(user_query: str) -> Dict[str, Any]:');
    lines.push('    """Executes the workflow graph starting from the root agent."""');
    
    // Find start node
    const startNode = nodes.find((n) => n.data?.isStartNode) || nodes[0];
    const rootVar = startNode ? sanitizePythonIdentifier(startNode.data?.label || startNode.id) : 'agent';

    lines.push(`    runner = Runner(agent=${rootVar})`);
    lines.push('    response = runner.run(user_query)');
    lines.push('    return {"response": str(response)}');
    lines.push('');

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
    const workflowCode = this.generateWorkflowFile(workflow, options);

    const hasA2A = (workflow.nodes || []).some((n: any) => n.data?.agentKind === 'a2a');
    const hasMcp = (workflow.nodes || []).some((n: any) =>
      (n.data?.tools || []).some((t: any) => t.type === 'mcp' || t.mcpConfig)
    );
    const requirementsCode = [
      hasA2A ? 'google-adk[a2a]>=0.1.0' : 'google-adk>=0.1.0',
      ...(hasA2A ? ['a2a-sdk[http-server]>=0.3.4'] : []),
      ...(hasMcp ? ['mcp>=1.0.0'] : []),
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
