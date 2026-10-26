/**
 * Blueprint View Builder
 *
 * Purpose: Builds the single canonical "codegen view" of the user's `.agent` workflow document
 * that every code generation sub-agent receives (core, all phase 2 shards, and the reviewer).
 *
 * The view is derived from the React Flow document by:
 *   1. Sanitizing non-trigger node names into valid Python identifiers (same rule the monolithic
 *      engine applied via `sanitizeAgentIdentifier`).
 *   2. Dropping canvas-only presentation fields (`node.position`, `edge.sourceHandle`,
 *      `edge.targetHandle`, `edge.animated`, `edge.style`). Graph shape is preserved through
 *      `edge.source` / `edge.target`.
 *   3. Serializing as minified JSON.
 *
 * Architectural decisions / notes for future sessions:
 * - This shapes the LLM INPUT only; it never rewrites generated code (AGENTS.md compliant).
 * - No per-shard slicing: every agent sees identical bytes, which keeps shards consistent and
 *   maximizes Gemini prompt-prefix cache hits.
 *
 * Author: Mike Nimer <mikenimer@google.com>
 */
import { sanitizeAgentIdentifier } from '../../shared/identifierValidation';

/** Node fields that only affect canvas rendering. */
const NODE_PRESENTATION_FIELDS = ['position', 'positionAbsolute', 'measured', 'width', 'height', 'selected', 'dragging'];

/** Edge fields that only affect canvas rendering. */
const EDGE_PRESENTATION_FIELDS = ['sourceHandle', 'targetHandle', 'animated', 'style', 'selected', 'markerEnd', 'markerStart'];

/** Node types that represent triggers (never renamed). */
const TRIGGER_NODE_TYPES = new Set(['trigger', 'triggerNode', 'tester', 'chat']);

/** Node id fragments that identify triggers in legacy documents. */
const TRIGGER_ID_FRAGMENTS = ['trigger', 'tester'];

/**
 * Returns a shallow copy of `source` without the given keys.
 *
 * @param source Object to copy.
 * @param keys Keys to omit.
 */
function omitKeys(source: Record<string, any>, keys: readonly string[]): Record<string, any> {
  const copy: Record<string, any> = { ...source };
  for (const key of keys) {
    delete copy[key];
  }
  return copy;
}

/**
 * Determines whether a workflow node is a trigger node.
 *
 * @param node React Flow node from the `.agent` document.
 */
function isTriggerNode(node: Record<string, any>): boolean {
  if (TRIGGER_NODE_TYPES.has(node.type)) {
    return true;
  }
  const id: string = typeof node.id === 'string' ? node.id : '';
  return TRIGGER_ID_FRAGMENTS.some((fragment) => id.includes(fragment));
}

/**
 * Builds the codegen view object (not serialized). Exposed for tests and for callers that need
 * to inspect the normalized structure.
 *
 * @param document The `.agent` workflow document.
 * @returns A new object; the input document is not mutated.
 */
export function buildBlueprintView(document: Record<string, any>): Record<string, any> {
  if (!document || typeof document !== 'object') {
    // NOTE: Fail fast — generating code without a blueprint is always a caller bug.
    throw new Error('Cannot build code generation blueprint: workflow document is missing.');
  }

  // 1. Nodes: drop presentation fields, sanitize agent/tool names into Python identifiers.
  const nodes = (Array.isArray(document.nodes) ? document.nodes : []).map((node: Record<string, any>) => {
    const cleanNode = omitKeys(node, NODE_PRESENTATION_FIELDS);
    if (isTriggerNode(node)) {
      return cleanNode;
    }
    const data = node.data || {};
    return {
      ...cleanNode,
      data: { ...data, name: sanitizeAgentIdentifier(data.name || data.label || node.id) },
    };
  });

  // 2. Edges: keep graph shape (id/source/target/data), drop rendering-only fields.
  const edges = (Array.isArray(document.edges) ? document.edges : []).map((edge: Record<string, any>) =>
    omitKeys(edge, EDGE_PRESENTATION_FIELDS)
  );

  // 3. Document-level fields: keep everything else (metadata, deployment, name, description...).
  const { viewport: _viewport, ...rest } = document;
  return { ...rest, nodes, edges };
}

/**
 * Builds the minified JSON blueprint string handed to every code generation agent.
 *
 * @param document The `.agent` workflow document.
 * @returns Minified JSON string.
 */
export function buildBlueprintJson(document: Record<string, any>): string {
  return JSON.stringify(buildBlueprintView(document));
}
