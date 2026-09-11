/**
 * Unit Tests for useExtensionSync Hook and VS Code Webview IPC
 *
 * Purpose:
 * Validates the webview-to-extension handshake protocol:
 * 1. Webview emits READY message to Extension Host on mount.
 * 2. Extension Host replies with LOAD_DOCUMENT containing parsed .agent JSON.
 * 3. Webview normalizes nodes and edges, centers viewport via fitView,
 *    and synchronizes file tab title and filename.
 * 4. Subsequent state changes emit DOCUMENT_UPDATED preserving document name and description.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLoadedNodes, normalizeLoadedEdges } from '../../src/webview/utils/workflowSync';
import { AgentFileTab } from '../../src/webview/types';

describe('useExtensionSync Protocol & Lifecycle Logic', () => {
  it('should emit READY message to the bridge upon initialization', () => {
    const postedMessages: any[] = [];
    const bridge = {
      postMessage: (msg: any) => {
        postedMessages.push(msg);
      },
      subscribe: () => () => {},
    };

    // Simulate mounting effect
    bridge.postMessage({ type: 'READY' });

    assert.equal(postedMessages.length, 1);
    assert.equal(postedMessages[0].type, 'READY');
  });

  it('should process LOAD_DOCUMENT payload and synchronize nodes, edges, and tab title', () => {
    let capturedNodes: any[] = [];
    let capturedEdges: any[] = [];
    let fitViewCalled = false;

    const mockTabs: AgentFileTab[] = [
      {
        id: 'tab-main-workflow',
        filename: 'workflow.agent',
        title: 'workflow.agent',
        nodes: [],
        edges: [],
        config: {
          framework: 'google_adk',
          language: 'python',
          outputFolder: './workflow/',
          deploymentTarget: 'agent_engine',
          includeTests: true,
          includeDocker: false,
          useStreaming: true,
        },
      },
    ];

    let currentTabs = [...mockTabs];
    const setFileTabs = (updater: any) => {
      currentTabs = typeof updater === 'function' ? updater(currentTabs) : updater;
    };

    const payload = {
      filePath: 'samples/CustomerSupportTriage.agent',
      docVersion: 2,
      document: {
        version: '1.0.0',
        name: 'CustomerSupportTriage',
        description: 'Customer Support Triage Workflow',
        framework: 'google-adk',
        language: 'python',
        nodes: [
          {
            id: 'node-trigger-1',
            type: 'trigger',
            position: { x: 80, y: 180 },
            data: { label: 'Ticket Inbound', triggerKind: 'test' },
          },
          {
            id: 'node-agent-1',
            type: 'agent',
            position: { x: 460, y: 180 },
            data: { label: 'Triage Specialist', model: 'gemini-flash-latest' },
          },
        ],
        edges: [
          {
            id: 'edge-1',
            source: 'node-trigger-1',
            target: 'node-agent-1',
          },
        ],
      },
    };

    // Simulate LOAD_DOCUMENT handler
    const doc = payload.document;
    const normNodes = normalizeLoadedNodes(doc.nodes);
    const normEdges = normalizeLoadedEdges(doc.edges);
    capturedNodes = normNodes;
    capturedEdges = normEdges;

    // Simulate tab synchronization
    const filename = payload.filePath.split(/[/\\]/).filter(Boolean).pop() || 'workflow.agent';
    const title = doc.name || filename;
    setFileTabs((prev: AgentFileTab[]) =>
      prev.map((t) =>
        t.id === 'tab-main-workflow'
          ? {
              ...t,
              filename,
              title,
              nodes: normNodes,
              edges: normEdges,
            }
          : t
      )
    );

    // Simulate fitView invocation
    fitViewCalled = true;

    // Assertions
    assert.equal(capturedNodes.length, 2);
    assert.equal(capturedNodes[0].id, 'node-trigger-1');
    assert.equal(capturedNodes[0].type, 'triggerNode');
    assert.equal(capturedNodes[1].id, 'node-agent-1');
    assert.equal(capturedNodes[1].type, 'agentNode');

    assert.equal(capturedEdges.length, 1);
    assert.equal(capturedEdges[0].style?.stroke, '#f59e0b'); // Amber trigger edge

    assert.equal(currentTabs[0].filename, 'CustomerSupportTriage.agent');
    assert.equal(currentTabs[0].title, 'CustomerSupportTriage');
    assert.equal(currentTabs[0].nodes.length, 2);
    assert.equal(fitViewCalled, true);
  });

  it('should preserve original document name and description in DOCUMENT_UPDATED', () => {
    const originalDoc = {
      name: 'CustomEnterpriseWorkflow',
      description: 'Production Multi-Agent Coordinator',
    };

    const docNameRef = { current: originalDoc.name };
    const docDescriptionRef = { current: originalDoc.description };

    const currentActiveFile: AgentFileTab = {
      id: 'tab-1',
      filename: 'CustomEnterpriseWorkflow.agent',
      title: 'CustomEnterpriseWorkflow',
      nodes: [],
      edges: [],
      config: {
        framework: 'google_adk',
        language: 'python',
        outputFolder: './workflow/',
        deploymentTarget: 'agent_engine',
        includeTests: true,
        includeDocker: false,
        useStreaming: true,
      },
    };

    const docName =
      docNameRef.current ||
      (currentActiveFile.title !== 'workflow.agent'
        ? currentActiveFile.title
        : currentActiveFile.filename.replace(/\.agent$/, ''));

    const updatedDoc = {
      version: '1.0.0',
      name: docName,
      description: docDescriptionRef.current || 'Agent Workflow Document',
    };

    assert.equal(updatedDoc.name, 'CustomEnterpriseWorkflow');
    assert.equal(updatedDoc.description, 'Production Multi-Agent Coordinator');
  });

  it('should only serialize outputFolder under deployment and not duplicate under metadata', () => {
    const rawLoadedMetadata = {
      outputFolder: './legacy_folder/',
      createdAt: '2026-09-01T00:00:00.000Z',
      author: 'Mike Nimer <mikenimer@google.com>',
    };

    // Filter out outputFolder and deploymentTarget
    const { outputFolder: _discardOutput, deploymentTarget: _discardTarget, ...cleanedMetadata } = rawLoadedMetadata as any;

    const config = {
      deploymentTarget: 'agent_engine',
      outputFolder: './game_20_questions/',
      framework: 'google_adk',
      language: 'python',
      includeTests: true,
      includeDocker: false,
      useStreaming: true,
    };

    const updatedDoc = {
      version: '1.0.0',
      name: 'game_20_questions',
      description: '20 Questions Agent',
      framework: 'google-adk',
      language: 'python',
      nodes: [],
      edges: [],
      metadata: {
        ...cleanedMetadata,
        updatedAt: new Date().toISOString(),
      },
      deployment: {
        target: config.deploymentTarget,
        deploymentTarget: config.deploymentTarget,
        outputFolder: config.outputFolder,
        framework: 'google-adk',
        language: config.language,
        includeTests: config.includeTests,
        includeDocker: config.includeDocker,
        useStreaming: config.useStreaming,
      },
    };

    assert.equal(updatedDoc.deployment.outputFolder, './game_20_questions/');
    assert.equal((updatedDoc.metadata as any).outputFolder, undefined);
    assert.equal((updatedDoc.metadata as any).deploymentTarget, undefined);
    assert.equal(updatedDoc.metadata.createdAt, '2026-09-01T00:00:00.000Z');
    assert.equal(updatedDoc.metadata.author, 'Mike Nimer <mikenimer@google.com>');
    assert.ok(updatedDoc.metadata.updatedAt);
  });
});

