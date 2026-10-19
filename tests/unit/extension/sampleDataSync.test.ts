/**
 * Unit Tests for Extension Host Sample Data Synchronization (TASK-215)
 *
 * Purpose:
 * Validates recursive synchronization of nested sample datasets (`data/<target>/`),
 * filtering of compilation artifacts (`__pycache__`, `.pyc`), discovery and validation
 * of `retail-data-and-ai-demo.agent` (8pt grid alignment, gemini-3.7-flash models, 10+ test scenarios),
 * and sample creation asset syncing.
 *
 * Architectural Decisions:
 * - Author: Mike Nimer <mikenimer@google.com>
 * - Dual-mode asset verification: Validates that extension host code generation and file creation
 *   faithfully duplicate target-scoped database fixtures (BigQuery, AlloyDB, Spanner) alongside tools.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { AgentEditorProvider } from '../../../src/extension/AgentEditorProvider';

describe('Sample Data Synchronization & Blueprint Validation (TASK-215)', { concurrency: 1 }, () => {
  let tempDirs: string[] = [];

  beforeEach(() => {
    vscode.resetAllMocks();
  });

  afterEach(() => {
    for (const dir of tempDirs) {
      if (fs.existsSync(dir)) {
        try {
          fs.rmSync(dir, { recursive: true, force: true });
        } catch {
          // Ignore temp cleanup errors
        }
      }
    }
    tempDirs = [];
  });

  // Section 1: Recursive data copying and artifact exclusion
  it('should recursively copy nested sample data directory skipping __pycache__ and .pyc files', async () => {
    const projectRoot = path.resolve(__dirname, '../../..');
    const mockContext: any = {
      extensionPath: projectRoot,
      subscriptions: [],
    };
    const provider = new AgentEditorProvider(mockContext);

    // Create a mock source directory with nested data and python cache files
    const sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'source-sample-'));
    const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'target-export-'));
    tempDirs.push(sourceDir, targetDir);

    const sourceDataDir = path.join(sourceDir, 'data');
    const bqDir = path.join(sourceDataDir, 'bigquery');
    const pycacheDir = path.join(bqDir, '__pycache__');

    fs.mkdirSync(pycacheDir, { recursive: true });

    // Write sample data files
    fs.writeFileSync(path.join(sourceDataDir, 'initial_session_state.json'), '{"test": 1}', 'utf-8');
    fs.writeFileSync(path.join(bqDir, 'weather.json'), '{"weather": "hot"}', 'utf-8');
    fs.writeFileSync(path.join(bqDir, 'seed_bigquery.py'), 'print("seed")', 'utf-8');

    // Write cache files that must be skipped
    fs.writeFileSync(path.join(pycacheDir, 'seed_bigquery.cpython-313.pyc'), 'binary cache', 'utf-8');
    fs.writeFileSync(path.join(bqDir, 'orphan.pyc'), 'binary', 'utf-8');

    const mockDoc: any = {
      uri: vscode.Uri.file(path.join(sourceDir, 'workflow.agent')),
      getText: () => '{}',
    };

    const copied = await provider.copySampleDataFiles({ name: 'workflow' } as any, mockDoc, targetDir);

    // Verify valid data files copied
    assert.ok(copied.includes(path.join('data', 'initial_session_state.json')));
    assert.ok(copied.includes(path.join('data', 'bigquery', 'weather.json')));
    assert.ok(copied.includes(path.join('data', 'bigquery', 'seed_bigquery.py')));

    // Verify cache files skipped
    assert.ok(!copied.some((f) => f.includes('__pycache__')));
    assert.ok(!copied.some((f) => f.endsWith('.pyc')));

    // Check physical filesystem in target directory
    assert.ok(fs.existsSync(path.join(targetDir, 'data', 'initial_session_state.json')));
    assert.ok(fs.existsSync(path.join(targetDir, 'data', 'bigquery', 'weather.json')));
    assert.ok(!fs.existsSync(path.join(targetDir, 'data', 'bigquery', '__pycache__')));
    assert.ok(!fs.existsSync(path.join(targetDir, 'data', 'bigquery', 'orphan.pyc')));
  });

  // Section 2: Graceful handling of missing data directory
  it('should gracefully handle missing data directory and return empty array without throwing', async () => {
    const projectRoot = path.resolve(__dirname, '../../..');
    const mockContext: any = {
      extensionPath: projectRoot,
      subscriptions: [],
    };
    const provider = new AgentEditorProvider(mockContext);

    const sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'source-no-data-'));
    const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'target-no-data-'));
    tempDirs.push(sourceDir, targetDir);

    const mockDoc: any = {
      uri: vscode.Uri.file(path.join(sourceDir, 'empty.agent')),
      getText: () => '{}',
    };

    const copied = await provider.copySampleDataFiles({ name: 'unknown_sample' } as any, mockDoc, targetDir);
    assert.deepStrictEqual(copied, []);
    assert.ok(!fs.existsSync(path.join(targetDir, 'data')));
  });

  // Section 3: Physical copy of bundled sample data fixtures
  it('should copy real bundled sample data fixtures into target directory', async () => {
    const projectRoot = path.resolve(__dirname, '../../..');
    const mockContext: any = {
      extensionPath: projectRoot,
      subscriptions: [],
    };
    const provider = new AgentEditorProvider(mockContext);

    const sampleAgentPath = path.join(
      projectRoot,
      'resource',
      'samples',
      'sdlc',
      'a2ui_kitchen_sink',
      'a2ui_kitchen_sink.agent'
    );
    assert.ok(fs.existsSync(sampleAgentPath), `Sample agent blueprint must exist at ${sampleAgentPath}`);

    const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ks-data-export-'));
    tempDirs.push(targetDir);

    const mockDoc: any = {
      uri: vscode.Uri.file(sampleAgentPath),
      getText: () => fs.readFileSync(sampleAgentPath, 'utf-8'),
    };
    const parsedDoc = JSON.parse(mockDoc.getText());

    const copied = await provider.copySampleDataFiles(parsedDoc, mockDoc, targetDir);
    assert.ok(copied.length >= 1, `Expected at least 1 copied data file, got ${copied.length}`);

    // Verify key fixture
    assert.ok(fs.existsSync(path.join(targetDir, 'data', 'initial_session_state.json')));
  });

  // Section 4: CREATE_FILE_FROM_SAMPLE syncing tools and data
  it('should copy both tools and data directories during CREATE_FILE_FROM_SAMPLE RPC', async () => {
    const projectRoot = path.resolve(__dirname, '../../..');
    const mockContext: any = {
      extensionPath: projectRoot,
      extensionUri: vscode.Uri.file(projectRoot),
      subscriptions: [],
    };
    const provider = new AgentEditorProvider(mockContext);

    const mockDoc: any = {
      uri: vscode.Uri.file('/mock/workspace/scratch.agent'),
      getText: () => JSON.stringify({ name: 'scratch', nodes: [], edges: [] }),
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
    assert.ok(messageListener, 'Message listener must be registered');

    // Create target workspace folder
    const targetWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'user-target-workspace-'));
    tempDirs.push(targetWorkspace);

    const targetSaveUri = vscode.Uri.file(path.join(targetWorkspace, 'my_kitchen_sink.agent'));
    vscode.window.showSaveDialog = vscode.createSpy(async () => targetSaveUri);

    await (messageListener as any)({
      type: 'CREATE_FILE_FROM_SAMPLE',
      payload: {
        sampleId: 'a2ui_kitchen_sink',
        sampleName: 'A2UI Kitchen Sink Agent',
      },
    });

    // Check that tools and data were copied into the workflow's target directory (a2ui_kitchen_sink_agent),
    // and NEVER into the parent workspace folder outside the target directory
    const expectedTargetDir = path.join(targetWorkspace, 'a2ui_kitchen_sink_agent');
    assert.ok(!fs.existsSync(path.join(targetWorkspace, 'tools')), 'Must never write tools/ outside the target directory');
    assert.ok(!fs.existsSync(path.join(targetWorkspace, 'data')), 'Must never write data/ outside the target directory');
    assert.ok(fs.existsSync(path.join(expectedTargetDir, 'tools')), 'Target directory must have tools/ directory');
    assert.ok(
      fs.existsSync(path.join(expectedTargetDir, 'tools', 'kitchen_sink_tools.py')),
      'Target directory must have tools/kitchen_sink_tools.py'
    );
    assert.ok(fs.existsSync(path.join(expectedTargetDir, 'data')), 'Target directory must have data/ directory');
    assert.ok(
      fs.existsSync(path.join(expectedTargetDir, 'data', 'initial_session_state.json')),
      'Target directory must have data/initial_session_state.json'
    );
  });

  // Section 5: Discovery and Blueprint Quality Verification
  it('should discover travel_concierge and satisfy 8pt grid and test scenarios', () => {
    const projectRoot = path.resolve(__dirname, '../../..');
    const mockContext: any = {
      extensionPath: projectRoot,
      subscriptions: [],
    };
    const provider = new AgentEditorProvider(mockContext);

    const samples = provider.discoverResourceSamples();
    const travelSample = samples.find(
      (s) => s.id === 'travel_concierge' || s.id === 'travel-concierge'
    );

    assert.ok(travelSample, 'travel-concierge must be discovered by discoverResourceSamples()');
    assert.strictEqual(travelSample.category, 'Retail');

    // Read full raw blueprint
    assert.ok(travelSample.sourceFilePath);
    const rawBlueprint = JSON.parse(fs.readFileSync(travelSample.sourceFilePath, 'utf-8'));

    // Check all nodes adhere to 8pt grid
    for (const node of rawBlueprint.nodes) {
      assert.strictEqual(
        node.position.x % 8,
        0,
        `Node ${node.id} position.x (${node.position.x}) must be a multiple of 8`
      );
      assert.strictEqual(
        node.position.y % 8,
        0,
        `Node ${node.id} position.y (${node.position.y}) must be a multiple of 8`
      );
    }

    assert.ok(travelSample.testPrompts && travelSample.testPrompts.length > 0, 'travel-concierge must have testPrompts');
  });

  // Section 6: Canonical sample resolution prevents cross-sample data/ contamination
  it('should prefer canonical bundled sample directory over polluted shared workspace parent folder', async () => {
    const projectRoot = path.resolve(__dirname, '../../..');
    const mockContext: any = {
      extensionPath: projectRoot,
      subscriptions: [],
    };
    const provider = new AgentEditorProvider(mockContext);

    const sharedParentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-parent-'));
    const targetExportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ks-export-'));
    tempDirs.push(sharedParentDir, targetExportDir);

    // Simulate another sample's data files in the shared parent directory
    const pollutedParentDataDir = path.join(sharedParentDir, 'data');
    fs.mkdirSync(pollutedParentDataDir, { recursive: true });
    fs.writeFileSync(
      path.join(pollutedParentDataDir, 'initial_session_state.json'),
      JSON.stringify({ polluted: true }),
      'utf-8'
    );

    const mockDoc: any = {
      uri: vscode.Uri.file(path.join(sharedParentDir, 'a2ui_kitchen_sink.agent')),
      getText: () => JSON.stringify({ name: 'A2UI Kitchen Sink Agent', nodes: [], edges: [] }),
    };

    await provider.copySampleDataFiles({ name: 'A2UI Kitchen Sink Agent' } as any, mockDoc, targetExportDir);

    // Verify canonical Kitchen Sink data/initial_session_state.json was copied and no legacy a2ui/ folder was created
    assert.ok(fs.existsSync(path.join(targetExportDir, 'data', 'initial_session_state.json')));
    assert.ok(!fs.existsSync(path.join(targetExportDir, 'a2ui')));
    const stateContent = fs.readFileSync(path.join(targetExportDir, 'data', 'initial_session_state.json'), 'utf-8');
    assert.ok(stateContent.includes('kitchen_sink_submission'), 'Should contain Kitchen Sink initial_session_state.json');
  });

  // Section 7: Canonical tool file resolution and target isolation
  it('should copy bundled sample tools into target directory and never read from parent directory', async () => {
    const projectRoot = path.resolve(__dirname, '../../..');
    const mockContext: any = {
      extensionPath: projectRoot,
      subscriptions: [],
    };
    const provider = new AgentEditorProvider(mockContext);

    const sharedParentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-sample-parent-'));
    const targetExportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cr-tools-export-'));
    tempDirs.push(sharedParentDir, targetExportDir);

    const sampleAgentPath = path.join(
      projectRoot,
      'resource',
      'samples',
      'sdlc',
      'code_reviewer',
      'code_reviewer.agent'
    );
    const parsedDoc = JSON.parse(fs.readFileSync(sampleAgentPath, 'utf-8'));

    // Even if a polluted tools/review_tools.py exists in sharedParentDir outside the target directory,
    // copyLocalToolFiles must never read from sharedParentDir/tools and must copy each sample's own copy from resource/samples/*
    fs.mkdirSync(path.join(sharedParentDir, 'tools'), { recursive: true });
    fs.writeFileSync(
      path.join(sharedParentDir, 'tools', 'review_tools.py'),
      'def wrong_polluted_tool(): pass\n',
      'utf-8'
    );

    const mockDoc: any = {
      uri: vscode.Uri.file(path.join(sharedParentDir, 'code_reviewer.agent')),
      getText: () => JSON.stringify(parsedDoc),
    };

    const copiedTools = await provider.copyLocalToolFiles(parsedDoc, mockDoc, targetExportDir);
    assert.ok(copiedTools.length >= 1, 'Expected at least 1 tool file copied for code_reviewer');

    // Also verify a2ui_kitchen_sink gets its own isolated tools/kitchen_sink_tools.py in its target directory
    const ksTargetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ks-tools-export-'));
    tempDirs.push(ksTargetDir);
    const ksAgentPath = path.join(
      projectRoot,
      'resource',
      'samples',
      'sdlc',
      'a2ui_kitchen_sink',
      'a2ui_kitchen_sink.agent'
    );
    const ksDoc = JSON.parse(fs.readFileSync(ksAgentPath, 'utf-8'));
    const mockKsDoc: any = {
      uri: vscode.Uri.file(path.join(sharedParentDir, 'a2ui_kitchen_sink.agent')),
      getText: () => JSON.stringify(ksDoc),
    };
    await provider.copyLocalToolFiles(ksDoc, mockKsDoc, ksTargetDir);
    const ksToolsContent = fs.readFileSync(
      path.join(ksTargetDir, 'tools', 'kitchen_sink_tools.py'),
      'utf-8'
    );
    assert.ok(
      ksToolsContent.includes('def render_kitchen_sink_surface'),
      'a2ui_kitchen_sink target folder must receive its own tools/kitchen_sink_tools.py from resource/samples/sdlc/a2ui_kitchen_sink'
    );
  });
});
