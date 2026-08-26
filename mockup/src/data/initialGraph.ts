import { Node, Edge } from '@xyflow/react';
import { createPatternNodesAndEdges } from './patterns';

const initial = createPatternNodesAndEdges('multi_agent_workflow', 80, 180);

export const INITIAL_NODES: Node<any>[] = initial.nodes;
export const INITIAL_EDGES: Edge[] = initial.edges;

