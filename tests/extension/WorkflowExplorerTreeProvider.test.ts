/**
 * Unit Tests for WorkflowExplorerTreeProvider
 *
 * Tests tree hierarchy resolution, workspace file discovery, metadata parsing,
 * reactivity via file system watchers, and workflow lifecycle operations (new, duplicate, delete).
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as vscode from 'vscode';
import {
  WorkflowExplorerTreeProvider,
  WorkflowTreeItem,
} from '../../src/extension/views/WorkflowExplorerTreeProvider';

describe('WorkflowExplorerTreeProvider', { concurrency: 1 }, () => {
  beforeEach(() => {
    vscode.resetAllMocks();
  });

  it('should construct provider and establish file system watcher', () => {
    const provider = new WorkflowExplorerTreeProvider();
    assert.ok(provider);
    assert.equal(vscode.workspace.createFileSystemWatcher.calls.length, 1);
    assert.equal(
      vscode.workspace.createFileSystemWatcher.calls[0][0],
      '**/*.agent'
    );
    provider.dispose();
  });

  it('should return empty list when no .agent files exist in workspace', async () => {
    vscode.workspace.findFiles = vscode.createSpy(async () => []);

    const provider = new WorkflowExplorerTreeProvider();
    const children = await provider.getChildren();

    assert.equal(children.length, 0);
    provider.dispose();
  });

  it('should discover and parse multiple .agent workflow files with metadata', async () => {
    const uri1 = vscode.Uri.file('/mock/workspace/customer_support.agent');
    const uri2 = vscode.Uri.file('/mock/workspace/data_analyst.agent');

    vscode.workspace.findFiles = vscode.createSpy(async () => [uri1, uri2]);

    const workflowDoc1 = {
      name: 'Customer Support Flow',
      framework: 'google-adk',
      nodes: [{ id: '1' }, { id: '2' }, { id: '3' }],
      description: 'Handles support inquiries',
    };

    const workflowDoc2 = {
      name: 'Data Analyst Pipeline',
      framework: 'langgraph',
      nodes: [{ id: 'node_1' }],
      description: 'BigQuery data analytics pipeline',
    };

    vscode.workspace.fs.readFile = vscode.createSpy(async (uri: any) => {
      if (uri.fsPath.includes('customer_support')) {
        return Buffer.from(JSON.stringify(workflowDoc1));
      }
      return Buffer.from(JSON.stringify(workflowDoc2));
    });

    const provider = new WorkflowExplorerTreeProvider();
    const children = await provider.getChildren();

    assert.equal(children.length, 2);

    // uri1: customer_support.agent
    const item1 = children.find((c) => c.workflowName === 'Customer Support Flow');
    assert.ok(item1);
    assert.equal(item1.label, 'Customer Support Flow');
    assert.equal(item1.nodeCount, 3);
    assert.equal(item1.framework, 'google-adk');
    assert.equal(item1.description, '3 nodes • google-adk');
    assert.equal(item1.contextValue, 'workflowItem');
    assert.equal(item1.command?.command, 'vscode.openWith');
    assert.equal(item1.command?.arguments?.[1], 'agentFlow.editor');

    // uri2: data_analyst.agent
    const item2 = children.find((c) => c.workflowName === 'Data Analyst Pipeline');
    assert.ok(item2);
    assert.equal(item2.label, 'Data Analyst Pipeline');
    assert.equal(item2.nodeCount, 1);
    assert.equal(item2.framework, 'langgraph');
    assert.equal(item2.description, '1 node • langgraph');

    // Check getTreeItem
    const treeItem = provider.getTreeItem(item1);
    assert.equal(treeItem, item1);

    // Leaf nodes should have no children
    const grandChildren = await provider.getChildren(item1);
    assert.equal(grandChildren.length, 0);

    provider.dispose();
  });

  it('should gracefully handle corrupt or empty workflow files with fallback labels', async () => {
    const corruptUri = vscode.Uri.file('/mock/workspace/corrupt.agent');
    vscode.workspace.findFiles = vscode.createSpy(async () => [corruptUri]);
    vscode.workspace.fs.readFile = vscode.createSpy(async () => {
      return Buffer.from('INVALID_NOT_JSON');
    });

    const provider = new WorkflowExplorerTreeProvider();
    const children = await provider.getChildren();

    assert.equal(children.length, 1);
    assert.equal(children[0].label, 'corrupt');
    assert.equal(children[0].nodeCount, 0);
    assert.equal(children[0].descriptionText, 'Unparsed workflow');

    provider.dispose();
  });

  it('should trigger onDidChangeTreeData when refresh is called or file watcher fires', (done) => {
    let watcherCallbacks: Record<string, Function> = {};
    vscode.workspace.createFileSystemWatcher = vscode.createSpy((pattern: string) => {
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

    const provider = new WorkflowExplorerTreeProvider();
    let firedCount = 0;
    provider.onDidChangeTreeData(() => {
      firedCount++;
    });

    provider.refresh();
    assert.equal(firedCount, 1);

    // Trigger watcher events
    watcherCallbacks.create?.();
    assert.equal(firedCount, 2);

    watcherCallbacks.change?.();
    assert.equal(firedCount, 3);

    watcherCallbacks.delete?.();
    assert.equal(firedCount, 4);

    provider.dispose();
  });

  it('should create new workflow file and open in custom editor', async () => {
    vscode.window.showInputBox = vscode.createSpy(async () => 'finance_advisor');

    const provider = new WorkflowExplorerTreeProvider();
    const targetUri = await provider.newWorkflow();

    assert.ok(targetUri);
    assert.ok(targetUri.fsPath.endsWith('finance_advisor.agent'));
    assert.equal(vscode.workspace.fs.writeFile.calls.length, 1);
    assert.equal(vscode.commands.executeCommand.calls.length, 1);
    assert.equal(vscode.commands.executeCommand.calls[0][0], 'vscode.openWith');
    assert.equal(vscode.commands.executeCommand.calls[0][2], 'agentFlow.editor');

    provider.dispose();
  });

  it('should handle cancellation when user cancels new workflow input box', async () => {
    vscode.window.showInputBox = vscode.createSpy(async () => undefined);

    const provider = new WorkflowExplorerTreeProvider();
    const result = await provider.newWorkflow();

    assert.equal(result, undefined);
    assert.equal(vscode.workspace.fs.writeFile.calls.length, 0);

    provider.dispose();
  });

  it('should avoid overwriting existing files by incrementing counter when creating new workflow', async () => {
    vscode.window.showInputBox = vscode.createSpy(async () => 'existing_flow');

    // First call to stat resolves (file exists), second call rejects (free name found)
    let callCount = 0;
    vscode.workspace.fs.stat = vscode.createSpy(async () => {
      callCount++;
      if (callCount === 1) {
        return { type: 1 };
      }
      throw new Error('Not found');
    });

    const provider = new WorkflowExplorerTreeProvider();
    const targetUri = await provider.newWorkflow();

    assert.ok(targetUri);
    assert.ok(targetUri.fsPath.endsWith('existing_flow_1.agent'));
    assert.equal(vscode.workspace.fs.writeFile.calls.length, 1);

    provider.dispose();
  });

  it('should duplicate workflow and update its internal name', async () => {
    const srcUri = vscode.Uri.file('/mock/workspace/travel_agent.agent');
    const item = new WorkflowTreeItem(srcUri, 'Travel Agent', 2, 'google-adk');

    vscode.workspace.fs.readFile = vscode.createSpy(async () => {
      return Buffer.from(
        JSON.stringify({
          name: 'Travel Agent',
          framework: 'google-adk',
          nodes: [{ id: '1' }, { id: '2' }],
        })
      );
    });

    vscode.window.showInputBox = vscode.createSpy(async () => 'travel_agent_v2');

    const provider = new WorkflowExplorerTreeProvider();
    const dupUri = await provider.duplicateWorkflow(item);

    assert.ok(dupUri);
    assert.ok(dupUri.fsPath.endsWith('travel_agent_v2.agent'));
    assert.equal(vscode.workspace.fs.writeFile.calls.length, 1);

    // Verify written JSON has updated name
    const writtenBytes = vscode.workspace.fs.writeFile.calls[0][1];
    const writtenDoc = JSON.parse(Buffer.from(writtenBytes).toString('utf-8'));
    assert.equal(writtenDoc.name, 'travel_agent_v2');

    assert.equal(vscode.commands.executeCommand.calls.length, 1);
    assert.equal(vscode.commands.executeCommand.calls[0][0], 'vscode.openWith');

    provider.dispose();
  });

  it('should abort duplication when user cancels input', async () => {
    const srcUri = vscode.Uri.file('/mock/workspace/travel_agent.agent');
    const item = new WorkflowTreeItem(srcUri, 'Travel Agent', 2, 'google-adk');

    vscode.workspace.fs.readFile = vscode.createSpy(async () => Buffer.from('{}'));
    vscode.window.showInputBox = vscode.createSpy(async () => undefined);

    const provider = new WorkflowExplorerTreeProvider();
    const result = await provider.duplicateWorkflow(item);

    assert.equal(result, undefined);
    assert.equal(vscode.workspace.fs.writeFile.calls.length, 0);

    provider.dispose();
  });

  it('should prompt confirmation and delete workflow when confirmed', async () => {
    const delUri = vscode.Uri.file('/mock/workspace/deprecated.agent');
    const item = new WorkflowTreeItem(delUri, 'Deprecated Flow', 1, 'google-adk');

    vscode.window.showWarningMessage = vscode.createSpy(async () => 'Delete');

    const provider = new WorkflowExplorerTreeProvider();
    const deleted = await provider.deleteWorkflow(item);

    assert.equal(deleted, true);
    assert.equal(vscode.workspace.fs.delete.calls.length, 1);
    assert.equal(vscode.workspace.fs.delete.calls[0][0], delUri);
    assert.deepEqual(vscode.workspace.fs.delete.calls[0][1], {
      recursive: false,
      useTrash: true,
    });

    provider.dispose();
  });

  it('should cancel delete operation when user does not confirm', async () => {
    const delUri = vscode.Uri.file('/mock/workspace/safe.agent');
    const item = new WorkflowTreeItem(delUri, 'Safe Flow', 1, 'google-adk');

    vscode.window.showWarningMessage = vscode.createSpy(async () => 'Cancel');

    const provider = new WorkflowExplorerTreeProvider();
    const deleted = await provider.deleteWorkflow(item);

    assert.equal(deleted, false);
    assert.equal(vscode.workspace.fs.delete.calls.length, 0);

    provider.dispose();
  });
});
