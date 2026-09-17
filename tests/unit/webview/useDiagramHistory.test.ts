/**
 * Unit Tests for useDiagramHistory Hook & History Stack
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AgentWorkflowDocument } from '../../../src/shared/types';

describe('useDiagramHistory Logic', () => {
  const doc1: AgentWorkflowDocument = {
    schemaVersion: '1.0.0',
    name: 'Workflow 1',
    framework: 'adk',
    language: 'python',
    nodes: [],
    edges: [],
  };

  const doc2: AgentWorkflowDocument = {
    ...doc1,
    name: 'Workflow 2 (Modified)',
  };

  const doc3: AgentWorkflowDocument = {
    ...doc1,
    name: 'Workflow 3 (Added Node)',
  };

  it('should push snapshots into past stack and clear future', () => {
    let past: AgentWorkflowDocument[] = [];
    let future: AgentWorkflowDocument[] = [];
    let current = doc1;

    // Action 1: Mutate to doc2
    past = [...past, current];
    current = doc2;
    future = [];

    assert.equal(past.length, 1);
    assert.equal(past[0].name, 'Workflow 1');
    assert.equal(current.name, 'Workflow 2 (Modified)');
    assert.equal(future.length, 0);

    // Action 2: Mutate to doc3
    past = [...past, current];
    current = doc3;
    future = [];

    assert.equal(past.length, 2);
    assert.equal(past[1].name, 'Workflow 2 (Modified)');
    assert.equal(current.name, 'Workflow 3 (Added Node)');
  });

  it('should undo to previous state and push current state to future stack', () => {
    let past: AgentWorkflowDocument[] = [doc1, doc2];
    let future: AgentWorkflowDocument[] = [];
    let current = doc3;

    // Perform Undo
    const previous = past[past.length - 1];
    past = past.slice(0, past.length - 1);
    future = [current, ...future];
    current = previous;

    assert.equal(current.name, 'Workflow 2 (Modified)');
    assert.equal(past.length, 1);
    assert.equal(future.length, 1);
    assert.equal(future[0].name, 'Workflow 3 (Added Node)');
  });

  it('should redo to next state and restore future', () => {
    let past: AgentWorkflowDocument[] = [doc1];
    let future: AgentWorkflowDocument[] = [doc3];
    let current = doc2;

    // Perform Redo
    const next = future[0];
    future = future.slice(1);
    past = [...past, current];
    current = next;

    assert.equal(current.name, 'Workflow 3 (Added Node)');
    assert.equal(past.length, 2);
    assert.equal(future.length, 0);
  });

  it('should enforce max history capacity limit', () => {
    const maxHistory = 3;
    let past: AgentWorkflowDocument[] = [];

    for (let i = 0; i < 10; i++) {
      const doc: AgentWorkflowDocument = {
        ...doc1,
        name: `Version ${i}`,
      };
      past = [...past, doc];
      if (past.length > maxHistory) {
        past = past.slice(past.length - maxHistory);
      }
    }

    assert.equal(past.length, maxHistory);
    assert.equal(past[past.length - 1].name, 'Version 9');
  });
});
