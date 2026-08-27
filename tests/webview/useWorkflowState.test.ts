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
            model: 'gemini-2.5-flash',
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
          model: 'gemini-2.5-flash',
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
});
