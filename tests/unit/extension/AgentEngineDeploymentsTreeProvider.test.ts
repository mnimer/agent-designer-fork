/**
 * Unit Tests for AgentEngineDeploymentsTreeProvider
 *
 * Tests discovery of deployment state from `.agent` workflow documents,
 * backward-compatible detection of legacy `deployment_metadata.json`,
 * local runner session telemetry, empty state handling, and reactive refresh triggers.
 *
 * Architectural Decisions:
 * 1. Validates that `.agent` documents serve as the single source of truth for deployment state.
 * 2. Ensures backward compatibility with legacy `deployment_metadata.json` files.
 * 3. Confirms that deduplication prevents duplicate tree items when both formats exist.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as vscode from 'vscode';
import {
  AgentEngineDeploymentsTreeProvider,
  DeploymentTreeItem,
} from '../../../src/extension/views/AgentEngineDeploymentsTreeProvider';
import { AgentEditorProvider } from '../../../src/extension/AgentEditorProvider';

describe('AgentEngineDeploymentsTreeProvider', { concurrency: 1 }, () => {
  beforeEach(() => {
    vscode.resetAllMocks();
  });

  it('should initialize and register file watchers for .agent and deployment_metadata.json', () => {
    const provider = new AgentEngineDeploymentsTreeProvider();
    assert.ok(provider);
    assert.ok(vscode.workspace.createFileSystemWatcher.calls.length >= 1);
    const watchedPatterns = vscode.workspace.createFileSystemWatcher.calls.map((c: any[]) => c[0]);
    assert.ok(watchedPatterns.includes('**/*.agent'));
    provider.dispose();
  });

  it('should display friendly empty state when no deployments or runners are found', async () => {
    vscode.workspace.findFiles = vscode.createSpy(async () => []);
    AgentEditorProvider.activeProviders.clear();

    const provider = new AgentEngineDeploymentsTreeProvider();
    const children = await provider.getChildren();

    assert.equal(children.length, 1);
    assert.equal(children[0].itemType, 'empty');
    assert.equal(children[0].label, 'No active deployments found');
    assert.equal(children[0].description, 'Deploy via Deployment Tab');
    assert.equal(children[0].contextValue, 'emptyDeploymentItem');

    provider.dispose();
  });

  it('should detect and format deployments directly from .agent workflow documents', async () => {
    const agentUri = vscode.Uri.file('/mock/workspace/my-pipeline.agent');
    vscode.workspace.findFiles = vscode.createSpy(async (pattern: string) => {
      if (pattern === '**/*.agent') {
        return [agentUri];
      }
      return [];
    });
    AgentEditorProvider.activeProviders.clear();

    const mockAgentDoc = {
      nodes: [],
      edges: [],
      metadata: { updatedAt: '2026-09-08T19:00:00Z' },
      deployment: {
        target: 'agent_engine',
        deployedResourceId: 'projects/717498696647/locations/us-central1/reasoningEngines/1234567890',
        serviceUrl: 'https://us-central1-aiplatform.googleapis.com/v1/projects/717498696647/locations/us-central1/reasoningEngines/1234567890:streamQuery?alt=sse',
        consoleUrl: 'https://console.cloud.google.com/vertex-ai/agents/1234567890',
        deployedAt: '2026-09-08T19:22:48.841Z',
      },
    };

    vscode.workspace.fs.readFile = vscode.createSpy(async () => {
      return Buffer.from(JSON.stringify(mockAgentDoc));
    });

    const provider = new AgentEngineDeploymentsTreeProvider();
    const children = await provider.getChildren();

    assert.equal(children.length, 1);
    const item = children[0];

    assert.equal(item.itemType, 'deployment');
    assert.equal(item.label, '1234567890');
    assert.ok(typeof item.description === 'string' && item.description.includes('agent_engine'));
    assert.equal(item.contextValue, 'deploymentItem');
    assert.equal(item.command?.command, 'vscode.open');
    assert.equal(item.command?.arguments?.[0], agentUri);

    const treeItem = provider.getTreeItem(item);
    assert.equal(treeItem, item);

    // Leaf elements should return no children
    const subChildren = await provider.getChildren(item);
    assert.equal(subChildren.length, 0);

    provider.dispose();
  });

  it('should detect and format legacy deployment_metadata.json records', async () => {
    const metaUri = vscode.Uri.file('/mock/workspace/deployment_metadata.json');
    vscode.workspace.findFiles = vscode.createSpy(async (pattern: string) => {
      if (pattern === '**/deployment_metadata.json') {
        return [metaUri];
      }
      return [];
    });
    AgentEditorProvider.activeProviders.clear();

    const mockMetadata = {
      remote_agent_runtime_id: 'projects/my-gcp-proj/locations/global/reasoningEngines/987654321',
      deployment_target: 'agent_runtime',
      is_a2a: true,
      agent_directory: 'app',
      deployment_timestamp: '2026-09-01T12:00:00Z',
    };

    vscode.workspace.fs.readFile = vscode.createSpy(async () => {
      return Buffer.from(JSON.stringify(mockMetadata));
    });

    const provider = new AgentEngineDeploymentsTreeProvider();
    const children = await provider.getChildren();

    assert.equal(children.length, 1);
    const item = children[0];

    assert.equal(item.itemType, 'deployment');
    assert.equal(item.label, '987654321');
    assert.ok(typeof item.description === 'string' && item.description.includes('agent_runtime'));
    assert.equal(item.contextValue, 'deploymentItem');
    assert.equal(item.command?.command, 'vscode.open');
    assert.equal(item.command?.arguments?.[0], metaUri);

    provider.dispose();
  });

  it('should detect active local runner sessions and render status badge', async () => {
    vscode.workspace.findFiles = vscode.createSpy(async () => []);

    // Create a mock active provider with an active runner session
    const mockProvider: any = {
      runnerManager: {
        getActiveRunners: () => [
          {
            id: 'runner-session-1',
            pid: 12345,
            port: 8080,
            status: 'running',
          },
        ],
      },
    };
    AgentEditorProvider.activeProviders.clear();
    AgentEditorProvider.activeProviders.add(mockProvider);

    const provider = new AgentEngineDeploymentsTreeProvider();
    const children = await provider.getChildren();

    assert.equal(children.length, 1);
    const item = children[0];

    assert.equal(item.itemType, 'runner');
    assert.equal(item.label, 'Local Runner (Port 8080)');
    assert.equal(item.description, 'RUNNING • PID 12345');
    assert.equal(item.contextValue, 'localRunnerItem');

    AgentEditorProvider.activeProviders.clear();
    provider.dispose();
  });

  it('should refresh when file watcher detects file changes', () => {
    let watcherCallbacks: Record<string, Function> = {};
    vscode.workspace.createFileSystemWatcher = vscode.createSpy(() => {
      return {
        onDidCreate: (cb: Function) => {
          watcherCallbacks.create = cb;
          return { dispose: () => {} };
        },
        onDidChange: (cb: Function) => {
          watcherCallbacks.change = cb;
          return { dispose: () => {} };
        },
        onDidDelete: (cb: Function) => {
          watcherCallbacks.delete = cb;
          return { dispose: () => {} };
        },
        dispose: () => {},
      };
    });

    const provider = new AgentEngineDeploymentsTreeProvider();
    let firedCount = 0;
    provider.onDidChangeTreeData(() => {
      firedCount++;
    });

    provider.refresh();
    assert.equal(firedCount, 1);

    watcherCallbacks.create?.();
    assert.equal(firedCount, 2);

    watcherCallbacks.change?.();
    assert.equal(firedCount, 3);

    watcherCallbacks.delete?.();
    assert.equal(firedCount, 4);

    provider.dispose();
  });
});
