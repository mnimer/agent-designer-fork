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
    assert.ok(samples.length >= 5, `Expected at least 5 samples discovered from disk, got ${samples.length}`);

    const ids = samples.map((s) => s.id);
    assert.ok(ids.includes('code_reviewer'), 'Expected code_reviewer in discovered samples');
    assert.ok(ids.includes('company_verifier'), 'Expected company_verifier in discovered samples');
    assert.ok(ids.includes('travel_concierge'), 'Expected travel_concierge in discovered samples');
    assert.ok(ids.includes('kc_data_domain_builder'), 'Expected kc_data_domain_builder in discovered samples');
    assert.ok(ids.includes('a2ui_kitchen_sink'), 'Expected a2ui_kitchen_sink in discovered samples');

    // Verify display names for discovered samples
    const codeReviewerSample = samples.find((s) => s.id === 'code_reviewer');
    assert.equal(codeReviewerSample?.name, 'Code Reviewing Agent');
    const kitchenSinkSample = samples.find((s) => s.id === 'a2ui_kitchen_sink');
    assert.equal(kitchenSinkSample?.name, 'A2UI Kitchen Sink Agent');
    const travelSample = samples.find((s) => s.id === 'travel_concierge');
    assert.equal(travelSample?.name, 'Travel Concierge');
    const dataDomainSample = samples.find((s) => s.id === 'kc_data_domain_builder');
    assert.equal(dataDomainSample?.name, 'Data Domain Builder');

    // Verify removed samples are no longer present
    assert.ok(!ids.includes('retail_data_and_ai_demo'), 'retail_data_and_ai_demo should be removed');
    assert.ok(!ids.includes('airline_irops_a2ui'), 'airline_irops_a2ui should be removed');
    assert.ok(!ids.includes('wealth_rebalancing_a2ui'), 'wealth_rebalancing_a2ui should be removed');
    assert.ok(!ids.includes('clinical_trial_matching_a2ui'), 'clinical_trial_matching_a2ui should be removed');
    assert.ok(!ids.includes('cloud_finops_security_a2ui'), 'cloud_finops_security_a2ui should be removed');
    assert.ok(!ids.includes('merchandising_agent_a2ui'), 'merchandising_agent_a2ui should be removed');
    assert.ok(!ids.includes('retail_marketing_promo_a2ui'), 'retail_marketing_promo_a2ui should be removed');
    assert.ok(!ids.includes('retail_vendor_deal_desk_a2ui'), 'retail_vendor_deal_desk_a2ui should be removed');
    assert.ok(!ids.includes('retail_allocation_planner_a2ui'), 'retail_allocation_planner_a2ui should be removed');

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

  it('should enforce trigger handle bindings and 8pt-grid layout across all sample .agent blueprints', () => {
    const projectRoot = path.resolve(__dirname, '../../..');
    const mockContext: any = {
      extensionPath: projectRoot,
      subscriptions: [],
    };
    const provider = new AgentEditorProvider(mockContext);

    const samples = provider.discoverResourceSamples();
    assert.ok(samples.length >= 5, `Expected at least 5 samples, got ${samples.length}`);

    for (const sample of samples) {
      const nodes: any[] = sample.nodes || [];
      const edges: any[] = sample.edges || [];

      // Verify all nodes adhere to the 8pt grid
      for (const node of nodes) {
        assert.equal(
          node.position.x % 8,
          0,
          `Sample "${sample.id}" node "${node.id}" x=${node.position.x} must be a multiple of 8`
        );
        assert.equal(
          node.position.y % 8,
          0,
          `Sample "${sample.id}" node "${node.id}" y=${node.position.y} must be a multiple of 8`
        );
      }

      const triggerNodes = nodes.filter(
        (n) => n.type === 'triggerNode' || n.type === 'trigger'
      );
      assert.ok(
        triggerNodes.length >= 2,
        `Sample "${sample.id}" must have at least 2 trigger nodes (operational trigger + tester trigger)`
      );

      let hasTesterTrigger = false;
      let hasOperationalTrigger = false;

      for (const trigger of triggerNodes) {
        const triggerType =
          trigger.data?.triggerType || trigger.data?.triggerKind || trigger.data?.type;
        const triggerEdge = edges.find((e) => e.source === trigger.id);
        assert.ok(
          triggerEdge,
          `Sample "${sample.id}" trigger "${trigger.id}" must have an outgoing edge to the root agent`
        );

        const targetAgent = nodes.find((n) => n.id === triggerEdge.target);
        assert.ok(
          targetAgent,
          `Sample "${sample.id}" trigger "${trigger.id}" target root agent "${triggerEdge.target}" must exist`
        );

        if (triggerType === 'tester' || triggerType === 'test') {
          hasTesterTrigger = true;
          assert.equal(
            triggerEdge.sourceHandle,
            'trigger_out_right',
            `Sample "${sample.id}" tester trigger "${trigger.id}" must connect from right handle (trigger_out_right)`
          );
          assert.equal(
            triggerEdge.targetHandle,
            'input_left',
            `Sample "${sample.id}" tester trigger "${trigger.id}" must connect to root agent left handle (input_left)`
          );
          assert.ok(
            trigger.position.x < targetAgent.position.x,
            `Sample "${sample.id}" tester trigger "${trigger.id}" (x=${trigger.position.x}) must be positioned to the left of root agent "${targetAgent.id}" (x=${targetAgent.position.x})`
          );
        } else {
          hasOperationalTrigger = true;
          assert.equal(
            triggerEdge.sourceHandle,
            'trigger_out_bottom',
            `Sample "${sample.id}" trigger "${trigger.id}" (${triggerType}) must connect from bottom handle (trigger_out_bottom)`
          );
          assert.equal(
            triggerEdge.targetHandle,
            'input',
            `Sample "${sample.id}" trigger "${trigger.id}" (${triggerType}) must connect to root agent top handle (input)`
          );
          assert.ok(
            trigger.position.y < targetAgent.position.y,
            `Sample "${sample.id}" trigger "${trigger.id}" (y=${trigger.position.y}) must be positioned above root agent "${targetAgent.id}" (y=${targetAgent.position.y})`
          );
        }
      }

      assert.ok(hasTesterTrigger, `Sample "${sample.id}" must include a Test Runner trigger`);
      assert.ok(hasOperationalTrigger, `Sample "${sample.id}" must include an operational trigger`);
    }
  });
});
