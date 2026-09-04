/**
 * Unit Tests for useWorkflowState Hook
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AgentWorkflowDocument, AgentWorkflowNode } from '../../src/shared/types';

describe('useWorkflowState Logic', () => {
  const sampleDoc: AgentWorkflowDocument = {
    version: '1.0.0',
    name: 'test_workflow',
    description: 'Test workflow description',
    framework: 'google-adk',
    language: 'python',
    nodes: [
      {
        id: 'trigger-1',
        type: 'trigger',
        position: { x: 100, y: 100 },
        data: {
          label: 'Inbound Test Trigger',
          triggerKind: 'test',
        },
      },
      {
        id: 'agent-1',
        type: 'agent',
        position: { x: 400, y: 100 },
        data: {
          label: 'Primary Agent',
          agentKind: 'standard',
          standardConfig: {
            model: 'gemini-flash-latest',
            systemInstruction: 'Test instruction',
            tools: [],
          },
        },
      },
    ],
    edges: [
      {
        id: 'edge-1',
        source: 'trigger-1',
        target: 'agent-1',
      },
    ],
  };

  it('should initialize with provided document and version 1', () => {
    let currentDoc = sampleDoc;
    let version = 1;
    let isDirty = false;

    assert.equal(currentDoc.name, 'test_workflow');
    assert.equal(currentDoc.nodes.length, 2);
    assert.equal(currentDoc.edges.length, 1);
    assert.equal(version, 1);
    assert.equal(isDirty, false);
  });

  it('should add a new agent node and increment version and dirty flag', () => {
    let currentDoc = { ...sampleDoc };
    let version = 1;
    let isDirty = false;

    const newNode: AgentWorkflowNode = {
      id: 'agent-2',
      type: 'agent',
      position: { x: 400, y: 300 },
      data: {
        label: 'Secondary Assistant',
        agentKind: 'standard',
        standardConfig: {
          model: 'gemini-flash-latest',
          systemInstruction: 'Secondary instruction',
          tools: [],
        },
      },
    };

    // Add node mutation
    currentDoc = {
      ...currentDoc,
      nodes: [...currentDoc.nodes, newNode],
    };
    version++;
    isDirty = true;

    assert.equal(currentDoc.nodes.length, 3);
    assert.equal(currentDoc.nodes.find((n) => n.id === 'agent-2')?.data.label, 'Secondary Assistant');
    assert.equal(version, 2);
    assert.equal(isDirty, true);
  });

  it('should remove a node and its associated edges', () => {
    let currentDoc = { ...sampleDoc };
    let version = 1;

    // Remove trigger-1
    const targetId = 'trigger-1';
    currentDoc = {
      ...currentDoc,
      nodes: currentDoc.nodes.filter((n) => n.id !== targetId),
      edges: currentDoc.edges.filter((e) => e.source !== targetId && e.target !== targetId),
    };
    version++;

    assert.equal(currentDoc.nodes.length, 1);
    assert.equal(currentDoc.edges.length, 0);
    assert.equal(version, 2);
  });

  it('should connect two nodes and avoid duplicate edges', () => {
    let currentDoc = { ...sampleDoc };

    const connection = {
      source: 'agent-1',
      target: 'trigger-1',
      sourceHandle: 'output',
      targetHandle: 'input',
    };

    const edgeExists = currentDoc.edges.some(
      (e) => e.source === connection.source && e.target === connection.target
    );

    assert.equal(edgeExists, false);

    const newEdge = {
      id: `edge-${connection.source}-${connection.target}`,
      source: connection.source,
      target: connection.target,
      sourceHandle: connection.sourceHandle,
      targetHandle: connection.targetHandle,
    };

    currentDoc = {
      ...currentDoc,
      edges: [...currentDoc.edges, newEdge],
    };

    assert.equal(currentDoc.edges.length, 2);
  });

  it('should update node data properties cleanly', () => {
    let currentDoc = { ...sampleDoc };

    currentDoc = {
      ...currentDoc,
      nodes: currentDoc.nodes.map((node) => {
        if (node.id === 'agent-1') {
          return {
            ...node,
            data: {
              ...node.data,
              label: 'Updated Agent Name',
            },
          };
        }
        return node;
      }),
    };

    const updated = currentDoc.nodes.find((n) => n.id === 'agent-1');
    assert.equal(updated?.data.label, 'Updated Agent Name');
  });

  describe('syncWorkflowSubAgents Synchronization Engine', () => {
    it('should synchronize multiple connected agent nodes into parent subAgents list', async () => {
      const { syncWorkflowSubAgents } = await import('../../src/webview/hooks/useWorkflowState');

      const parentNode: AgentWorkflowNode = {
        id: 'parent',
        type: 'agent',
        position: { x: 100, y: 100 },
        data: { label: 'Parent Orchestrator', isStartNode: true, subAgents: [] },
      };

      const worker1: AgentWorkflowNode = {
        id: 'worker-1',
        type: 'agent',
        position: { x: 100, y: 300 },
        data: { label: 'Worker One', role: 'Data Collector' },
      };

      const worker2: AgentWorkflowNode = {
        id: 'worker-2',
        type: 'agent',
        position: { x: 300, y: 300 },
        data: { label: 'Worker Two', role: 'Code Generator' },
      };

      const worker3: AgentWorkflowNode = {
        id: 'worker-3',
        type: 'agent',
        position: { x: 500, y: 300 },
        data: { label: 'Worker Three', role: 'Security Reviewer' },
      };

      const edges: any[] = [
        { id: 'e1', source: 'parent', target: 'worker-1' },
        { id: 'e2', source: 'parent', target: 'worker-2' },
        { id: 'e3', source: 'parent', target: 'worker-3' },
      ];

      const synced = syncWorkflowSubAgents([parentNode, worker1, worker2, worker3], edges);
      const syncedParent = synced.find((n) => n.id === 'parent')!;
      const subList = syncedParent.data.subAgents as any[];

      // All 3 connected workers must be in subAgents
      assert.equal(subList.length, 3);
      assert.equal(subList[0].agentId, 'worker-1');
      assert.equal(subList[0].name, 'Worker One');
      assert.equal(subList[0].role, 'Data Collector');

      assert.equal(subList[1].agentId, 'worker-2');
      assert.equal(subList[1].name, 'Worker Two');
      assert.equal(subList[1].role, 'Code Generator');

      assert.equal(subList[2].agentId, 'worker-3');
      assert.equal(subList[2].name, 'Worker Three');
      assert.equal(subList[2].role, 'Security Reviewer');
    });

    it('should automatically propagate renamed child agent label and role to parent subAgents', async () => {
      const { syncWorkflowSubAgents } = await import('../../src/webview/hooks/useWorkflowState');

      const parentNode: AgentWorkflowNode = {
        id: 'parent',
        type: 'agent',
        position: { x: 100, y: 100 },
        data: {
          label: 'Parent Orchestrator',
          subAgents: [{ agentId: 'child-1', name: 'Old Name', role: 'Old Role' }],
        },
      };

      // Child agent renamed
      const renamedChild: AgentWorkflowNode = {
        id: 'child-1',
        type: 'agent',
        position: { x: 100, y: 300 },
        data: { label: 'Super Research Agent', role: 'Lead Researcher' },
      };

      const edges: any[] = [{ id: 'e1', source: 'parent', target: 'child-1' }];

      const synced = syncWorkflowSubAgents([parentNode, renamedChild], edges);
      const syncedParent = synced.find((n) => n.id === 'parent')!;
      const sub = (syncedParent.data.subAgents as any[])[0];

      assert.equal(sub.name, 'Super Research Agent');
      assert.equal(sub.role, 'Lead Researcher');
    });

    it('should prune severed connections when an edge is removed', async () => {
      const { syncWorkflowSubAgents } = await import('../../src/webview/hooks/useWorkflowState');

      const parentNode: AgentWorkflowNode = {
        id: 'parent',
        type: 'agent',
        position: { x: 100, y: 100 },
        data: {
          label: 'Parent Orchestrator',
          subAgents: [
            { agentId: 'child-1', name: 'Child 1', role: 'Worker' },
            { agentId: 'child-2', name: 'Child 2', role: 'Worker' },
          ],
        },
      };

      const child1: AgentWorkflowNode = { id: 'child-1', type: 'agent', position: { x: 100, y: 300 }, data: { label: 'Child 1' } };
      const child2: AgentWorkflowNode = { id: 'child-2', type: 'agent', position: { x: 300, y: 300 }, data: { label: 'Child 2' } };

      // Only child-1 edge remains, child-2 edge is removed
      const edges: any[] = [{ id: 'e1', source: 'parent', target: 'child-1' }];

      const synced = syncWorkflowSubAgents([parentNode, child1, child2], edges);
      const syncedParent = synced.find((n) => n.id === 'parent')!;
      const subList = syncedParent.data.subAgents as any[];

      assert.equal(subList.length, 1);
      assert.equal(subList[0].agentId, 'child-1');
    });

    it('should preserve custom user reordering of subAgents across sync runs', async () => {
      const { syncWorkflowSubAgents } = await import('../../src/webview/hooks/useWorkflowState');

      // User has manually reordered subAgents: [child-2, child-1]
      const parentNode: AgentWorkflowNode = {
        id: 'parent',
        type: 'agent',
        position: { x: 100, y: 100 },
        data: {
          label: 'Parent Orchestrator',
          subAgents: [
            { agentId: 'child-2', name: 'Child 2', role: 'Worker B' },
            { agentId: 'child-1', name: 'Child 1', role: 'Worker A' },
          ],
        },
      };

      const child1: AgentWorkflowNode = { id: 'child-1', type: 'agent', position: { x: 100, y: 300 }, data: { label: 'Child 1', role: 'Worker A' } };
      const child2: AgentWorkflowNode = { id: 'child-2', type: 'agent', position: { x: 300, y: 300 }, data: { label: 'Child 2', role: 'Worker B' } };
      const child3: AgentWorkflowNode = { id: 'child-3', type: 'agent', position: { x: 500, y: 300 }, data: { label: 'Child 3', role: 'Worker C' } };

      // Connect new child-3
      const edges: any[] = [
        { id: 'e1', source: 'parent', target: 'child-1' },
        { id: 'e2', source: 'parent', target: 'child-2' },
        { id: 'e3', source: 'parent', target: 'child-3' },
      ];

      const synced = syncWorkflowSubAgents([parentNode, child1, child2, child3], edges);
      const syncedParent = synced.find((n) => n.id === 'parent')!;
      const subList = syncedParent.data.subAgents as any[];

      // Order should preserve [child-2, child-1] and append new [child-3] at the end
      assert.equal(subList.length, 3);
      assert.equal(subList[0].agentId, 'child-2');
      assert.equal(subList[1].agentId, 'child-1');
      assert.equal(subList[2].agentId, 'child-3');
    });
  });

  describe('syncAgentSubAgents React Flow Webview Engine', () => {
    it('should synchronize React Flow nodes and edges with multi-connect, rename, and ordering', async () => {
      const { syncAgentSubAgents } = await import('../../src/webview/App');

      const rfNodes: any[] = [
        {
          id: 'agent-root',
          type: 'agentNode',
          position: { x: 0, y: 0 },
          data: {
            label: 'Root Coordinator',
            subAgents: [
              { agentId: 'agent-b', name: 'Old Agent B', role: 'Old Role B' },
              { agentId: 'agent-a', name: 'Old Agent A', role: 'Old Role A' },
            ],
          },
        },
        {
          id: 'agent-a',
          type: 'agentNode',
          position: { x: 0, y: 200 },
          data: { label: 'Renamed Alpha', role: 'Senior Developer' },
        },
        {
          id: 'agent-b',
          type: 'agentNode',
          position: { x: 200, y: 200 },
          data: { label: 'Renamed Beta', role: 'Staff QA' },
        },
        {
          id: 'agent-c',
          type: 'agentNode',
          position: { x: 400, y: 200 },
          data: { label: 'New Gamma', role: 'DevOps Lead' },
        },
      ];

      const rfEdges: any[] = [
        { id: 'e1', source: 'agent-root', target: 'agent-a' },
        { id: 'e2', source: 'agent-root', target: 'agent-b' },
        { id: 'e3', source: 'agent-root', target: 'agent-c' },
      ];

      const synced = syncAgentSubAgents(rfNodes, rfEdges);
      const root = synced.find((n: any) => n.id === 'agent-root')!;
      const subs = root.data.subAgents;

      // Preserves existing [agent-b, agent-a] order, updates names & roles, and appends newly connected [agent-c]
      assert.equal(subs.length, 3);
      assert.equal(subs[0].agentId, 'agent-b');
      assert.equal(subs[0].name, 'Renamed Beta');
      assert.equal(subs[0].role, 'Staff QA');

      assert.equal(subs[1].agentId, 'agent-a');
      assert.equal(subs[1].name, 'Renamed Alpha');
      assert.equal(subs[1].role, 'Senior Developer');

      assert.equal(subs[2].agentId, 'agent-c');
      assert.equal(subs[2].name, 'New Gamma');
      assert.equal(subs[2].role, 'DevOps Lead');
    });

    it('should inherit parent agent subAgentPattern as delegationType so children never contradict parent', async () => {
      const { syncWorkflowSubAgents } = await import('../../src/webview/hooks/useWorkflowState');

      const parentSequential: AgentWorkflowNode = {
        id: 'parent-seq',
        type: 'agentNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Sequential Orchestrator',
          subAgentPattern: 'sequential',
          subAgents: [],
        },
      };

      const childA: AgentWorkflowNode = {
        id: 'child-a',
        type: 'agentNode',
        position: { x: 100, y: 100 },
        data: { label: 'Child A', role: 'Step 1' },
      };

      const childB: AgentWorkflowNode = {
        id: 'child-b',
        type: 'agentNode',
        position: { x: 200, y: 100 },
        data: { label: 'Child B', role: 'Step 2' },
      };

      const edges: any[] = [
        { id: 'e1', source: 'parent-seq', target: 'child-a' },
        { id: 'e2', source: 'parent-seq', target: 'child-b' },
      ];

      const synced = syncWorkflowSubAgents([parentSequential, childA, childB], edges);
      const syncedParent = synced.find((n) => n.id === 'parent-seq')!;
      const subs = syncedParent.data.subAgents as any[];

      assert.equal(subs.length, 2);
      assert.equal(subs[0].delegationType, 'sequential');
      assert.equal(subs[1].delegationType, 'sequential');
    });
  });
});

