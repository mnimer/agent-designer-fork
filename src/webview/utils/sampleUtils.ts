/**
 * Visual Agent Designer - Sample Workflow Utilities
 *
 * Provides utility functions for instantiating and remapping sample workflow blueprints
 * discovered dynamically from disk (resource/samples/).
 *
 * Architectural Decisions:
 * - Author: Mike Nimer <mikenimer@google.com>
 * - Decision 1: Single Source of Truth on Disk: Samples are loaded dynamically from
 *   resource/samples/<name>/ rather than hardcoded static catalogs in TypeScript.
 * - Decision 2: Collision-Free Instantiation: When dropping a sample workflow onto the canvas,
 *   all node and edge IDs are scoped with a unique prefix (`s_<sampleId>_<timestamp>_`).
 * - Decision 3: Single Root Agent Constraint: If the canvas already contains a start/root agent,
 *   newly dropped agent nodes have `isStartNode` set to false to prevent conflicting entry points.
 * - Decision 4: Reference Integrity: Sub-agent delegations, router branch targets, and trigger
 *   connections are updated to point to the newly remapped node IDs.
 */

import { Node, Edge } from '@xyflow/react';
import { SampleWorkflowDefinition, AgentData, TriggerData } from '../types';

/**
 * Creates canvas nodes and edges from a sample workflow definition, prefixing IDs
 * with a unique prefix so that multiple instances or drops onto an existing diagram do not collide.
 *
 * @author Mike Nimer <mikenimer@google.com>
 * @param sample The sample workflow definition to instantiate
 * @param dropX Target X coordinate on the canvas (defaults to 100)
 * @param dropY Target Y coordinate on the canvas (defaults to 100)
 * @param existingNodes Existing nodes already on the canvas to check for root start nodes
 * @returns Remapped nodes and edges ready for auto-layout
 */
export function createSampleNodesAndEdges(
  sample: SampleWorkflowDefinition,
  dropX = 100,
  dropY = 100,
  existingNodes: Node<any>[] = []
): { nodes: Node<AgentData | TriggerData>[]; edges: Edge[] } {
  // NOTE: If sample contains no nodes, fail fast with empty arrays
  if (!sample.nodes || sample.nodes.length === 0) {
    return { nodes: [], edges: [] };
  }

  // Generate unique prefix per drop instance
  const prefix = `s_${sample.id}_${Date.now().toString(36)}_`;
  const idMap = new Map<string, string>();

  // 1. Build map of old IDs to new unique IDs
  sample.nodes.forEach((node) => {
    idMap.set(node.id, `${prefix}${node.id}`);
  });

  const hasExistingStartNode = existingNodes.some(
    (n) => (n.type === 'agentNode' || n.type === 'agent') && (n.data as AgentData)?.isStartNode
  );

  // 2. Remap nodes (Agents and Triggers)
  const remappedNodes: Node<AgentData | TriggerData>[] = sample.nodes.map((node) => {
    const newId = idMap.get(node.id) || `${prefix}${node.id}`;
    const rawData = node.data as any;

    if (node.type === 'agentNode' || node.type === 'agent') {
      const remappedSubAgents = rawData.subAgents?.map((sa: any) => ({
        ...sa,
        agentId: idMap.get(sa.agentId) || sa.agentId,
      })) || [];

      let remappedRouterConfig = rawData.routerConfig;
      if (remappedRouterConfig?.branches) {
        remappedRouterConfig = {
          ...remappedRouterConfig,
          branches: remappedRouterConfig.branches.map((b: any) => ({
            ...b,
            targetAgentId: idMap.get(b.targetAgentId) || b.targetAgentId,
          })),
        };
      }

      const agentData: AgentData = {
        ...rawData,
        id: newId,
        subAgents: remappedSubAgents,
        routerConfig: remappedRouterConfig,
        // NOTE: Only preserve isStartNode if canvas does not already have a start node
        isStartNode: hasExistingStartNode ? false : Boolean(rawData.isStartNode),
      };

      return {
        ...node,
        id: newId,
        type: 'agentNode',
        data: agentData,
      };
    } else {
      // Trigger node
      const triggerData: TriggerData = {
        ...rawData,
        id: newId,
        targetAgentId: idMap.get(rawData.targetAgentId) || rawData.targetAgentId,
        connectedAgentId: idMap.get(rawData.connectedAgentId) || rawData.connectedAgentId,
        targetRootAgentId: idMap.get(rawData.targetRootAgentId) || rawData.targetRootAgentId,
      };

      return {
        ...node,
        id: newId,
        type: 'triggerNode',
        data: triggerData,
      };
    }
  });

  // 3. Remap edges connecting the sample nodes
  const remappedEdges: Edge[] = sample.edges.map((edge) => {
    const newSource = idMap.get(edge.source) || edge.source;
    const newTarget = idMap.get(edge.target) || edge.target;
    return {
      ...edge,
      id: `${prefix}${edge.id}`,
      source: newSource,
      target: newTarget,
    };
  });

  return { nodes: remappedNodes, edges: remappedEdges };
}
