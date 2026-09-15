/**
 * Name Sanitizer & Topological Dependency Sorter
 *
 * Purpose:
 * Sanitizes visual graph identifiers into safe, unique, and keyword-compliant Python variables.
 * Orders agent declarations topologically so sub-agents / dependencies are compiled before parent agents.
 * Detects circular delegation loops and raises compile-time errors.
 *
 * Architectural Decisions:
 * - Author: Mike Nimer <mikenimer@google.com>
 * - Decision 1: Case-sensitive Python keyword check matching all 35 Python 3 keywords.
 * - Decision 2: Prevention of shadowing/collisions with core Python builtins.
 * - Decision 3: Backtracking/counter-based suffix allocation for unique, non-colliding duplicate variables.
 * - Decision 4: Three-state DFS topological sort to guarantee circular dependency detection.
 */

/**
 * Exhaustive set of all 35 Python 3 keywords plus common Python builtins
 * to avoid shadowing or syntax errors in generated code.
 */
export const PYTHON_KEYWORDS = new Set<string>([
  // All 35 Python 3 keywords (including lowercase/case variations)
  'False', 'None', 'True', 'false', 'none', 'true',
  'and', 'as', 'assert', 'async', 'await',
  'break', 'class', 'continue', 'def', 'del', 'elif', 'else', 'except',
  'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is',
  'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try',
  'while', 'with', 'yield',

  // Common builtins to avoid collisions/shadowing
  'id', 'type', 'input', 'print', 'list', 'dict', 'set', 'str', 'int',
  'float', 'bool', 'len', 'range', 'open', 'abs', 'all', 'any', 'bin',
  'dir', 'divmod', 'enumerate', 'eval', 'exec', 'filter', 'hash', 'hex',
  'map', 'max', 'min', 'next', 'object', 'oct', 'ord', 'pow', 'repr',
  'reversed', 'round', 'sorted', 'sum', 'tuple', 'zip', 'vars'
]);

/**
 * Sanitizes a raw name into a valid Python identifier, avoiding Python keywords and builtins.
 * Also disambiguates duplicate identifiers if a `usedNames` Set is provided.
 *
 * @param rawName - The raw name of the agent, tool, or variable.
 * @param usedNames - Optional Set of already used identifiers for duplicate detection.
 * @returns A safe, unique Python identifier.
 */
export function sanitizeIdentifier(rawName: string, usedNames?: Set<string>): string {
  // 1. Lowercase and replace non-identifier characters ([^a-zA-Z0-9_]) with '_'
  let name = rawName
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_');

  // 2. Prefix with '_' if starting with a digit
  if (/^[0-9]/.test(name)) {
    name = '_' + name;
  }

  // 3. Append '_' if matching a Python keyword or builtin
  if (PYTHON_KEYWORDS.has(name)) {
    name = name + '_';
  }

  // 4. Disambiguate duplicate identifiers in usedNames by appending _2, _3, etc.
  if (usedNames) {
    let candidate = name;
    let counter = 2;
    while (usedNames.has(candidate)) {
      candidate = `${name}_${counter}`;
      counter++;
    }
    name = candidate;
    usedNames.add(name);
  }

  return name;
}

/**
 * Helper to sort agents topologically based on references (delegation).
 * Agents that are dependencies (i.e. subagents/delegated agents) will be ordered BEFORE parent/root agents.
 *
 * @param agents - Array of agent nodes
 * @param edges - Array of visual connections/edges between nodes
 * @throws Error if circular delegation is detected, listing the participating node IDs.
 * @returns Topological sorted array of agents
 */
export function topologicalSortAgents<T extends { id: string; data?: any }>(
  agents: T[],
  edges: Array<{ source: string; target: string }>
): T[] {
  const agentIds = new Set(agents.map((a) => a.id));

  // Build adjacency list: node ID -> Set of referenced/delegated agent node IDs
  const adj = new Map<string, Set<string>>();
  for (const agent of agents) {
    adj.set(agent.id, new Set<string>());
  }

  // 1. Add direct delegation edges
  for (const edge of edges) {
    if (agentIds.has(edge.source) && agentIds.has(edge.target)) {
      adj.get(edge.source)!.add(edge.target);
    }
  }

  // 2. Add router branches target agent references
  for (const agent of agents) {
    const branches = agent.data?.routerConfig?.branches;
    if (Array.isArray(branches)) {
      for (const branch of branches) {
        if (branch.targetAgentId && agentIds.has(branch.targetAgentId)) {
          adj.get(agent.id)!.add(branch.targetAgentId);
        }
      }
    }
  }

  // 3. Add agent_as_tool tools references
  for (const agent of agents) {
    const tools = agent.data?.tools;
    if (Array.isArray(tools)) {
      for (const tool of tools) {
        if (tool.builtinType === 'agent_as_tool' || tool.id === 'builtin_agent_as_tool') {
          const subAgentId = tool.agentAsToolConfig?.subAgentId;
          if (subAgentId && agentIds.has(subAgentId)) {
            adj.get(agent.id)!.add(subAgentId);
          }
        }
      }
    }
  }

  // DFS Cycle Detection and Topo Sort
  const visited = new Map<string, number>(); // 0 = unvisited, 1 = visiting, 2 = visited
  for (const id of agentIds) {
    visited.set(id, 0);
  }

  const result: T[] = [];
  const visitingStack: string[] = [];

  function visit(id: string) {
    const state = visited.get(id);
    if (state === 1) {
      // Cycle detected! Form clear path list.
      const cycleStartIndex = visitingStack.indexOf(id);
      const cycleNodes = visitingStack.slice(cycleStartIndex);
      throw new Error(
        `Circular delegation detected: ${cycleNodes.join(' -> ')} -> ${id}`
      );
    }
    if (state === 2) {
      return;
    }

    visited.set(id, 1);
    visitingStack.push(id);

    const neighbors = adj.get(id) || new Set();
    for (const neighbor of neighbors) {
      visit(neighbor);
    }

    visitingStack.pop();
    visited.set(id, 2);

    const agentNode = agents.find((a) => a.id === id);
    if (agentNode) {
      result.push(agentNode);
    }
  }

  for (const agent of agents) {
    if (visited.get(agent.id) === 0) {
      visit(agent.id);
    }
  }

  return result;
}
