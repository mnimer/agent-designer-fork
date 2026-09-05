/**
 * Unit Tests for Extension Lifecycle & Commands
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { activate, deactivate } from '../../src/extension/extension';
import { AgentEditorProvider } from '../../src/extension/AgentEditorProvider';

describe('Extension Lifecycle', { concurrency: 1 }, () => {
  beforeEach(() => {
    vscode.resetAllMocks();
  });

  it('should activate extension, register custom editor and commands', () => {
    const mockContext: any = {
      subscriptions: [],
      extensionPath: '/mock/extension',
    };

    activate(mockContext);

    assert.equal(vscode.window.registerCustomEditorProvider.calls.length > 0, true);
    assert.equal(vscode.window.registerTreeDataProvider.calls.length, 2);

    // Verify view IDs registered
    const registeredViews = vscode.window.registerTreeDataProvider.calls.map((c: any[]) => c[0]);
    assert.ok(registeredViews.includes('agentFlow.views.workflows'));
    assert.ok(registeredViews.includes('agentFlow.views.deployments'));

    // Verify sidebar commands registered
    const registeredCmds = vscode.commands.registerCommand.calls.map((c: any[]) => c[0]);
    assert.ok(registeredCmds.includes('agentFlow.sidebar.newWorkflow'));
    assert.ok(registeredCmds.includes('agentFlow.sidebar.refreshWorkflows'));
    assert.ok(registeredCmds.includes('agentFlow.sidebar.duplicateWorkflow'));
    assert.ok(registeredCmds.includes('agentFlow.sidebar.deleteWorkflow'));
    assert.ok(registeredCmds.includes('agentFlow.sidebar.refreshDeployments'));
    assert.ok(registeredCmds.includes('agentFlow.createWorkflow'));
    assert.ok(registeredCmds.includes('agentFlow.generateCode'));
    assert.ok(registeredCmds.includes('agentFlow.runTests'));

    assert.equal(vscode.commands.registerCommand.calls.length >= 8, true);
    assert.equal(mockContext.subscriptions.length >= 10, true);
  });

  it('should execute createWorkflow command and invoke vscode.openWith', async () => {
    const mockContext: any = {
      subscriptions: [],
      extensionPath: '/mock/extension',
    };

    activate(mockContext);

    const createCmdCall = vscode.commands.registerCommand.calls.find(
      (call: any[]) => call[0] === 'agentFlow.createWorkflow'
    );
    assert.ok(createCmdCall);

    if (createCmdCall) {
      const handler = createCmdCall[1];
      await handler();
      assert.equal(vscode.commands.executeCommand.calls.length > 0, true);
    }
  });

  it('should deactivate cleanly without throwing errors', () => {
    assert.doesNotThrow(() => deactivate());
  });
});
