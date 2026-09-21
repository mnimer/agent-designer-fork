/**
 * Unit Tests for AgentEditorProvider Samples Discovery
 *
 * Purpose:
 * Tests the dynamic discovery of .agent workflow blueprints from the extension resource/sample/
 * directory and ensures they are parsed into valid SampleWorkflowDefinition objects.
 *
 * Architectural Decisions:
 * - Author: Mike Nimer <mikenimer@google.com>
 * - Decision 1: Scans resource/sample/ recursively and converts .agent files into SampleWorkflowDefinition.
 * - Decision 2: Automatically maps test scenarios from trigger nodes.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as vscode from 'vscode';
import * as path from 'path';
import { AgentEditorProvider } from '../../../src/extension/AgentEditorProvider';

describe('AgentEditorProvider Samples Discovery (TASK-128)', { concurrency: 1 }, () => {
  beforeEach(() => {
    vscode.resetAllMocks();
  });

  it('should discover all physical .agent sample files in resource/samples/', () => {
    // Project root directory as extensionPath
    const projectRoot = path.resolve(__dirname, '../../..');
    const mockContext: any = {
      extensionPath: projectRoot,
      subscriptions: [],
    };
    const provider = new AgentEditorProvider(mockContext);

    const samples = provider.discoverResourceSamples();
    assert.ok(Array.isArray(samples), 'discoverResourceSamples must return an array');
    assert.strictEqual(samples.length, 3, `Expected exactly 3 samples discovered from disk, got ${samples.length}`);

    const ids = samples.map((s) => s.id);
    assert.ok(ids.includes('code_reviewer'), 'Expected code_reviewer in discovered samples');
    assert.ok(ids.includes('company_verifier'), 'Expected company_verifier in discovered samples');
    assert.ok(ids.includes('travel_concierge'), 'Expected travel_concierge in discovered samples');

    // Verify metadata properties are populated
    for (const sample of samples) {
      assert.ok(sample.id, 'Sample must have an id');
      assert.ok(sample.name, 'Sample must have a name');
      assert.ok(sample.description, 'Sample must have a description');
      assert.ok(sample.nodesCount > 0, `Sample ${sample.name} must have nodesCount > 0`);
      assert.ok(sample.nodes.length > 0, `Sample ${sample.name} must have nodes array`);
      assert.ok(sample.sourceFilePath, `Sample ${sample.name} must have sourceFilePath`);
    }
  });

  it('should correctly extract testPrompts from trigger nodes during discovery', () => {
    const projectRoot = path.resolve(__dirname, '../../..');
    const mockContext: any = {
      extensionPath: projectRoot,
      subscriptions: [],
    };
    const provider = new AgentEditorProvider(mockContext);

    const samples = provider.discoverResourceSamples();
    const travel = samples.find((s) => s.id === 'travel_concierge');
    assert.ok(travel, 'travel_concierge sample should be found');
    assert.ok(travel.testPrompts && travel.testPrompts.length > 0, 'travel_concierge should have testPrompts');
    assert.ok(
      travel.testPrompts.some((t) => t.prompt.toLowerCase().includes('flight') || t.prompt.toLowerCase().includes('americas') || t.name.toLowerCase().includes('americas')),
      'travel_concierge testPrompts should include flight or Americas test prompt'
    );
  });

  it('should handle CREATE_FILE_FROM_SAMPLE message and open new file in VS Code tab', async () => {
    const projectRoot = path.resolve(__dirname, '../../..');
    const mockContext: any = {
      extensionPath: projectRoot,
      extensionUri: vscode.Uri.file(projectRoot),
      subscriptions: [],
    };
    const provider = new AgentEditorProvider(mockContext);

    const mockDoc: any = {
      uri: vscode.Uri.file('/mock/workspace/current.agent'),
      getText: () => JSON.stringify({ name: 'current', nodes: [], edges: [] }),
      positionAt: () => new vscode.Position(0, 0),
    };

    let messageListener: ((msg: any) => Promise<void>) | null = null;
    const mockPanel: any = {
      webview: {
        options: {},
        html: '',
        onDidReceiveMessage: (cb: any) => {
          messageListener = cb;
          return { dispose: () => {} };
        },
        postMessage: async () => true,
        asWebviewUri: (uri: any) => uri.toString(),
        cspSource: 'vscode-webview:',
      },
      onDidDispose: () => ({ dispose: () => {} }),
      onDidChangeViewState: () => ({ dispose: () => {} }),
    };

    await provider.resolveCustomTextEditor(mockDoc, mockPanel, {} as any);
    assert.ok(messageListener, 'Message listener should be registered');

    // Trigger CREATE_FILE_FROM_SAMPLE
    const targetSaveUri = vscode.Uri.file('/mock/workspace/my_travel_concierge.agent');
    vscode.window.showSaveDialog = vscode.createSpy(async () => targetSaveUri);

    await (messageListener as any)({
      type: 'CREATE_FILE_FROM_SAMPLE',
      payload: {
        sampleId: 'travel_concierge',
        sampleName: 'Travel Concierge',
      },
    });

    // Verify Save Dialog was prompted
    assert.equal(vscode.window.showSaveDialog.calls.length, 1);

    // Verify File was written to target URI
    assert.equal(vscode.workspace.fs.writeFile.calls.length, 1);
    const [writtenUri, writtenBuffer] = vscode.workspace.fs.writeFile.calls[0];
    assert.equal(writtenUri.fsPath, targetSaveUri.fsPath);
    const writtenDoc = JSON.parse(writtenBuffer.toString('utf-8'));
    assert.ok(writtenDoc.nodes && writtenDoc.nodes.length > 0, 'Written document should contain sample nodes');

    // Verify vscode.openWith was called to open in a new tab
    assert.ok(
      vscode.commands.executeCommand.calls.some(
        (call: any[]) => call[0] === 'vscode.openWith' && call[1]?.fsPath === targetSaveUri.fsPath
      ),
      'vscode.openWith must be called with target file URI'
    );
  });

  it('should gracefully abort CREATE_FILE_FROM_SAMPLE when user cancels save dialog', async () => {
    const projectRoot = path.resolve(__dirname, '../../..');
    const mockContext: any = {
      extensionPath: projectRoot,
      extensionUri: vscode.Uri.file(projectRoot),
      subscriptions: [],
    };
    const provider = new AgentEditorProvider(mockContext);

    const mockDoc: any = {
      uri: vscode.Uri.file('/mock/workspace/current.agent'),
      getText: () => JSON.stringify({ name: 'current', nodes: [], edges: [] }),
      positionAt: () => new vscode.Position(0, 0),
    };

    let messageListener: ((msg: any) => Promise<void>) | null = null;
    const mockPanel: any = {
      webview: {
        options: {},
        html: '',
        onDidReceiveMessage: (cb: any) => {
          messageListener = cb;
          return { dispose: () => {} };
        },
        postMessage: async () => true,
        asWebviewUri: (uri: any) => uri.toString(),
        cspSource: 'vscode-webview:',
      },
      onDidDispose: () => ({ dispose: () => {} }),
      onDidChangeViewState: () => ({ dispose: () => {} }),
    };

    await provider.resolveCustomTextEditor(mockDoc, mockPanel, {} as any);

    // User cancels the save dialog
    vscode.window.showSaveDialog = vscode.createSpy(async () => undefined);

    await (messageListener as any)({
      type: 'CREATE_FILE_FROM_SAMPLE',
      payload: {
        sampleId: 'travel_concierge',
      },
    });

    assert.equal(vscode.window.showSaveDialog.calls.length, 1);
    assert.equal(vscode.workspace.fs.writeFile.calls.length, 0, 'Should not write file when canceled');
    assert.equal(
      vscode.commands.executeCommand.calls.some((call: any[]) => call[0] === 'vscode.openWith'),
      false,
      'Should not open editor when canceled'
    );
  });
});
