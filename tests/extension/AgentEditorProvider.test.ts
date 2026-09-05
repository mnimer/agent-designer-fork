/**
 * Unit Tests for AgentEditorProvider
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { AgentEditorProvider } from '../../src/extension/AgentEditorProvider';
import { AgentWorkflowDocument } from '../../src/shared/types';

describe('AgentEditorProvider', { concurrency: 1 }, () => {
  beforeEach(() => {
    vscode.resetAllMocks();
  });

  it('should register custom editor provider with VS Code', () => {
    const mockContext: any = {
      extensionPath: '/mock/extension/path',
      subscriptions: [],
    };
    const disposable = AgentEditorProvider.register(mockContext);
    assert.equal(vscode.window.registerCustomEditorProvider.calls.length > 0, true);
    assert.ok(disposable);
  });

  it('should create default workflow with single agent and test trigger', () => {
    const mockContext: any = { extensionPath: '/mock', subscriptions: [] };
    const provider = new AgentEditorProvider(mockContext);
    const mockUri = vscode.Uri.file('/mock/test_workflow.agent');
    const workflow = provider.createDefaultWorkflow(mockUri as any);

    assert.equal(workflow.name, 'test_workflow');
    assert.equal(workflow.framework, 'google-adk');
    assert.equal(workflow.language, 'python');
    assert.equal(workflow.nodes.length, 2);

    const triggerNode = workflow.nodes.find((n) => n.type === 'trigger');
    const agentNode = workflow.nodes.find((n) => n.type === 'agent');

    assert.ok(triggerNode);
    assert.ok(agentNode);
    assert.equal((agentNode?.data as any).agentKind, 'standard');
    assert.equal((agentNode?.data as any).standardConfig.tools.length, 0);
    assert.equal(workflow.edges.length, 1);
    assert.equal(workflow.edges[0].sourceHandle, 'trigger_out_right');
    assert.equal(workflow.edges[0].targetHandle, 'input_left');
  });

  it('should generate valid HTML for webview with CSP, nonce, and bootstrap script', () => {
    const mockContext: any = {
      extensionPath: '/mock/extension',
      extensionUri: vscode.Uri.file('/mock/extension'),
      subscriptions: [],
    };
    const provider = new AgentEditorProvider(mockContext);
    const mockWebview: any = {
      cspSource: 'vscode-webview:',
      asWebviewUri: (uri: any) => uri.toString(),
    };

    const html = provider.getHtmlForWebview(mockWebview);
    assert.equal(html.includes('<!DOCTYPE html>'), true);
    assert.equal(html.includes('Content-Security-Policy'), true);
    assert.equal(html.includes('nonce-'), true);
    assert.equal(html.includes('acquireVsCodeApi'), true);
  });

  it('should resolve custom text editor, set html, and handle READY message', async () => {
    const mockContext: any = {
      extensionPath: '/mock/extension',
      extensionUri: vscode.Uri.file('/mock/extension'),
      subscriptions: [],
    };
    const provider = new AgentEditorProvider(mockContext);

    const initialDoc: AgentWorkflowDocument = {
      version: '1.0.0',
      name: 'sample',
      description: 'Sample description',
      framework: 'google-adk',
      language: 'python',
      nodes: [],
      edges: [],
    };

    const mockDoc: any = {
      uri: vscode.Uri.file('/mock/sample.agent'),
      getText: () => JSON.stringify(initialDoc),
      positionAt: () => new vscode.Position(0, 0),
    };

    let messageCallback: ((msg: any) => Promise<void>) | null = null;
    const postedMessages: any[] = [];

    const mockPanel: any = {
      webview: {
        options: {},
        html: '',
        postMessage: async (msg: any) => {
          postedMessages.push(msg);
          return true;
        },
        onDidReceiveMessage: (cb: any) => {
          messageCallback = cb;
          return { dispose: () => {} };
        },
        cspSource: 'vscode-webview:',
        asWebviewUri: (uri: any) => uri.toString(),
      },
      onDidDispose: () => {},
    };

    await provider.resolveCustomTextEditor(mockDoc, mockPanel, {} as any);

    assert.equal(mockPanel.webview.options.enableScripts, true);
    assert.equal(mockPanel.webview.html.includes('<!DOCTYPE html>'), true);

    // Initial theme message posted
    assert.equal(
      postedMessages.some((m) => m.type === 'THEME_CHANGED'),
      true
    );

    // Simulate READY message from webview
    assert.ok(messageCallback);
    if (messageCallback) {
      await (messageCallback as any)({ type: 'READY' });
      await new Promise((resolve) => setTimeout(resolve, 10));
      const loadDocMsg = postedMessages.find((m) => m.type === 'LOAD_DOCUMENT');
      assert.ok(loadDocMsg);
      assert.equal(loadDocMsg.payload.document.name, 'sample');
      assert.ok(loadDocMsg.payload.filePath);
    }
  });

  it('should handle DOCUMENT_UPDATED message and apply workspace edit', async () => {
    const mockContext: any = {
      extensionPath: '/mock/extension',
      extensionUri: vscode.Uri.file('/mock/extension'),
      subscriptions: [],
    };
    const provider = new AgentEditorProvider(mockContext);

    const updatedDoc: AgentWorkflowDocument = {
      version: '1.0.0',
      name: 'updated',
      description: 'Updated description',
      framework: 'google-adk',
      language: 'python',
      nodes: [],
      edges: [],
    };

    const mockDoc: any = {
      uri: vscode.Uri.file('/mock/sample.agent'),
      getText: () => '{}',
      positionAt: () => new vscode.Position(0, 0),
    };

    let messageCallback: ((msg: any) => Promise<void>) | null = null;
    const postedMessages: any[] = [];

    const mockPanel: any = {
      webview: {
        options: {},
        html: '',
        postMessage: async (msg: any) => {
          postedMessages.push(msg);
          return true;
        },
        onDidReceiveMessage: (cb: any) => {
          messageCallback = cb;
          return { dispose: () => {} };
        },
        cspSource: 'vscode-webview:',
        asWebviewUri: (uri: any) => uri.toString(),
      },
      onDidDispose: () => {},
    };

    await provider.resolveCustomTextEditor(mockDoc, mockPanel, {} as any);

    if (messageCallback) {
      await (messageCallback as any)({
        type: 'DOCUMENT_UPDATED',
        payload: {
          document: updatedDoc,
          docVersion: 2,
        },
      });

      const savedMsg = postedMessages.find((m) => m.type === 'DOCUMENT_SAVED');
      assert.ok(savedMsg);
      assert.equal(savedMsg.payload.docVersion, 2);
    }
  });

  it('should delegate custom messages to registered message handlers', async () => {
    const mockContext: any = {
      extensionPath: '/mock/extension',
      extensionUri: vscode.Uri.file('/mock/extension'),
      subscriptions: [],
    };
    const provider = new AgentEditorProvider(mockContext);

    const mockDoc: any = {
      uri: vscode.Uri.file('/mock/sample.agent'),
      getText: () => '{}',
      positionAt: () => new vscode.Position(0, 0),
    };

    let messageCallback: ((msg: any) => Promise<void>) | null = null;
    const mockPanel: any = {
      webview: {
        options: {},
        html: '',
        postMessage: async () => true,
        onDidReceiveMessage: (cb: any) => {
          messageCallback = cb;
          return { dispose: () => {} };
        },
        cspSource: 'vscode-webview:',
        asWebviewUri: (uri: any) => uri.toString(),
      },
      onDidDispose: () => {},
    };

    let receivedMsg: any = null;
    provider.registerMessageHandler('CUSTOM_TEST_ACTION', (msg) => {
      receivedMsg = msg;
    });

    await provider.resolveCustomTextEditor(mockDoc, mockPanel, {} as any);

    if (messageCallback) {
      const customMsg = {
        type: 'CUSTOM_TEST_ACTION',
        payload: {
          foo: 'bar',
        },
      };
      await (messageCallback as any)(customMsg);
      assert.deepEqual(receivedMsg, customMsg);
    }
  });

  it('should handle GENERATE_CODE message, write files to disk and post CODE_GENERATED', async () => {
    const mockContext: any = {
      extensionPath: '/mock/extension',
      extensionUri: vscode.Uri.file('/mock/extension'),
      subscriptions: [],
    };
    const provider = new AgentEditorProvider(mockContext);

    // Mock CodeGenEngine response
    (provider as any).codeGenEngine = {
      generateCode: async () => ({
        success: true,
        files: [
          { path: 'agent_workflow.py', name: 'agent_workflow.py', description: 'Agent code', content: '# generated' },
          { path: 'main.py', name: 'main.py', description: 'Main CLI', content: '# cli' },
        ],
        modelUsed: 'gemini-flash-latest',
      }),
    };

    const mockDoc: any = {
      uri: vscode.Uri.file('/mock/workspace/sample.agent'),
      getText: () => '{}',
      positionAt: () => new vscode.Position(0, 0),
    };

    let messageCallback: ((msg: any) => Promise<void>) | null = null;
    const postedMessages: any[] = [];
    const mockPanel: any = {
      webview: {
        options: {},
        html: '',
        postMessage: async (msg: any) => {
          postedMessages.push(msg);
          return true;
        },
        onDidReceiveMessage: (cb: any) => {
          messageCallback = cb;
          return { dispose: () => {} };
        },
        cspSource: 'vscode-webview:',
        asWebviewUri: (uri: any) => uri.toString(),
      },
      onDidDispose: () => {},
    };

    await provider.resolveCustomTextEditor(mockDoc, mockPanel, {} as any);

    if (messageCallback) {
      await (messageCallback as any)({
        type: 'GENERATE_CODE',
        payload: {
          document: {
            version: '1.0.0',
            name: 'sample',
            framework: 'google-adk',
            language: 'python',
            nodes: [],
            edges: [],
          },
          targetFramework: 'google-adk',
          targetLanguage: 'python',
          outputFolder: '/mock/workspace/output',
        },
      });

      const codeGenMsg = postedMessages.find((m) => m.type === 'CODE_GENERATED');
      assert.ok(codeGenMsg);
      assert.equal(codeGenMsg.payload.success, true);
      assert.equal(codeGenMsg.payload.files.length, 2);
      assert.equal(codeGenMsg.payload.modelUsed, 'gemini-flash-latest');
      assert.ok(codeGenMsg.payload.targetDirectory);
    }
  });

  it('should clean target directory before generating and writing new code', async () => {
    const mockContext: any = {
      extensionPath: '/mock/extension',
      extensionUri: vscode.Uri.file('/mock/extension'),
      subscriptions: [],
    };
    const provider = new AgentEditorProvider(mockContext);

    const originalReadDir = vscode.workspace.fs.readDirectory;
    const originalDelete = vscode.workspace.fs.delete;

    const deletedPaths: string[] = [];
    (vscode.workspace.fs.readDirectory as any) = vscode.createSpy(async () => [
      ['old_file.py', 1],
      ['old_server.py', 1],
    ]);
    (vscode.workspace.fs.delete as any) = vscode.createSpy(async (uri: any) => {
      deletedPaths.push(uri.fsPath);
    });

    try {
      (provider as any).codeGenEngine = {
        generateCode: async () => ({
          success: true,
          files: [{ path: 'agent.py', name: 'agent.py', description: 'New Agent', content: '# new' }],
          modelUsed: 'gemini-flash-latest',
        }),
      };

      const mockDoc: any = {
        uri: vscode.Uri.file('/mock/workspace/sample.agent'),
        getText: () => '{}',
        positionAt: () => new vscode.Position(0, 0),
      };

      let messageCallback: any = null;
      const mockPanel: any = {
        webview: {
          options: {},
          html: '',
          postMessage: async () => true,
          onDidReceiveMessage: (cb: any) => {
            messageCallback = cb;
            return { dispose: () => {} };
          },
          cspSource: 'vscode-webview:',
          asWebviewUri: (uri: any) => uri.toString(),
        },
        onDidDispose: () => {},
      };

      await provider.resolveCustomTextEditor(mockDoc, mockPanel, {} as any);

      if (messageCallback) {
        await messageCallback({
          type: 'GENERATE_CODE',
          payload: {
            document: { version: '1.0.0', name: 'sample', nodes: [], edges: [] },
            targetFramework: 'google-adk',
            targetLanguage: 'python',
            outputFolder: '/mock/workspace/target_clean',
          },
        });

        assert.ok(deletedPaths.length >= 2);
        assert.ok(deletedPaths.some((p) => p.includes('old_file.py')));
        assert.ok(deletedPaths.some((p) => p.includes('old_server.py')));
      }
    } finally {
      (vscode.workspace.fs.readDirectory as any) = originalReadDir;
      (vscode.workspace.fs.delete as any) = originalDelete;
    }
  });

  it('should cleanly delete old code files and venv while preserving .agent and .git folders', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const mockContext: any = { extensionPath: '/mock', subscriptions: [] };
    const provider = new AgentEditorProvider(mockContext);

    const tmpCleanDir = `/tmp/test_clean_target_${Date.now()}`;
    fs.mkdirSync(path.join(tmpCleanDir, '.venv'), { recursive: true });
    fs.mkdirSync(path.join(tmpCleanDir, '.git'), { recursive: true });
    fs.writeFileSync(path.join(tmpCleanDir, 'old_agent.py'), '# old agent', 'utf-8');
    fs.writeFileSync(path.join(tmpCleanDir, 'server.py'), '# old server', 'utf-8');
    fs.writeFileSync(path.join(tmpCleanDir, 'my_workflow.agent'), '{"version":"1.0"}', 'utf-8');

    const mockDoc: any = {
      uri: vscode.Uri.file(path.join(tmpCleanDir, 'my_workflow.agent')),
    };

    const cleanupResult = await provider.cleanTargetDirectory(tmpCleanDir, mockDoc);

    assert.ok(cleanupResult.cleaned.includes('old_agent.py'));
    assert.ok(cleanupResult.cleaned.includes('server.py'));
    assert.ok(cleanupResult.cleaned.includes('.venv'));
    assert.ok(cleanupResult.preserved.includes('.git'));
    assert.ok(cleanupResult.preserved.includes('my_workflow.agent'));

    // Verify filesystem state
    assert.equal(fs.existsSync(path.join(tmpCleanDir, 'old_agent.py')), false);
    assert.equal(fs.existsSync(path.join(tmpCleanDir, 'server.py')), false);
    assert.equal(fs.existsSync(path.join(tmpCleanDir, '.venv')), false);
    assert.equal(fs.existsSync(path.join(tmpCleanDir, '.git')), true);
    assert.equal(fs.existsSync(path.join(tmpCleanDir, 'my_workflow.agent')), true);

    try {
      fs.rmSync(tmpCleanDir, { recursive: true, force: true });
    } catch {}
  });

  it('should load pre-existing generated files from disk cleanly', () => {
    const mockContext: any = { extensionPath: '/mock', subscriptions: [] };
    const provider = new AgentEditorProvider(mockContext);
    const files = provider.loadGeneratedFilesFromDisk('/tmp/nonexistent_test_folder');
    assert.deepEqual(files, []);
  });

  it('should resolve target directory matching .agent file path by default on READY without metadata.outputFolder', async () => {
    const mockContext: any = {
      extensionPath: '/mock/extension',
      extensionUri: vscode.Uri.file('/mock/extension'),
      subscriptions: [],
    };
    const provider = new AgentEditorProvider(mockContext);

    const docWithoutOutputFolder: AgentWorkflowDocument = {
      version: '1.0.0',
      name: 'scratch-agent',
      description: 'Scratch Agent',
      framework: 'google-adk',
      language: 'python',
      nodes: [],
      edges: [],
    };

    const mockDoc: any = {
      uri: vscode.Uri.file('/mock/workspace/agents/scratch/scratch-agent.agent'),
      getText: () => JSON.stringify(docWithoutOutputFolder),
      positionAt: () => new vscode.Position(0, 0),
    };

    let messageCallback: ((msg: any) => Promise<void>) | null = null;
    const postedMessages: any[] = [];

    const mockPanel: any = {
      webview: {
        options: {},
        html: '',
        postMessage: async (msg: any) => {
          postedMessages.push(msg);
          return true;
        },
        onDidReceiveMessage: (cb: any) => {
          messageCallback = cb;
          return { dispose: () => {} };
        },
        cspSource: 'vscode-webview:',
        asWebviewUri: (uri: any) => uri.toString(),
      },
      onDidDispose: () => {},
    };

    // Spy on loadGeneratedFilesFromDisk to verify target directory passed
    let loadedTargetDir = '';
    provider.loadGeneratedFilesFromDisk = (dir: string) => {
      loadedTargetDir = dir;
      return [{ name: 'server.py', path: 'server.py', content: '# code', description: 'Server' }];
    };

    await provider.resolveCustomTextEditor(mockDoc, mockPanel, {} as any);

    assert.ok(messageCallback);
    if (messageCallback) {
      await (messageCallback as any)({ type: 'READY' });
      await new Promise((resolve) => setTimeout(resolve, 10));

      const loadDocMsg = postedMessages.find((m) => m.type === 'LOAD_DOCUMENT');
      assert.ok(loadDocMsg);
      assert.equal(loadDocMsg.payload.document.name, 'scratch-agent');
      assert.equal(loadDocMsg.payload.generatedFiles.length, 1);
      // Ensure targetDir resolved to /agents/scratch/scratch-agent
      assert.ok(
        loadedTargetDir.includes('agents/scratch/scratch-agent'),
        `Expected targetDir to resolve to agents/scratch/scratch-agent but got: ${loadedTargetDir}`
      );
    }
  });

  it('should honor custom metadata.outputFolder when resolving target directory on READY', async () => {
    const mockContext: any = {
      extensionPath: '/mock/extension',
      extensionUri: vscode.Uri.file('/mock/extension'),
      subscriptions: [],
    };
    const provider = new AgentEditorProvider(mockContext);

    const docWithCustomOutputFolder: AgentWorkflowDocument = {
      version: '1.0.0',
      name: 'custom_workflow',
      description: 'Custom Workflow',
      framework: 'google-adk',
      language: 'python',
      nodes: [],
      edges: [],
      metadata: {
        outputFolder: './custom_agents_folder/',
      },
    };

    const mockDoc: any = {
      uri: vscode.Uri.file('/mock/workspace/custom_workflow.agent'),
      getText: () => JSON.stringify(docWithCustomOutputFolder),
      positionAt: () => new vscode.Position(0, 0),
    };

    let messageCallback: ((msg: any) => Promise<void>) | null = null;
    const postedMessages: any[] = [];

    const mockPanel: any = {
      webview: {
        options: {},
        html: '',
        postMessage: async (msg: any) => {
          postedMessages.push(msg);
          return true;
        },
        onDidReceiveMessage: (cb: any) => {
          messageCallback = cb;
          return { dispose: () => {} };
        },
        cspSource: 'vscode-webview:',
        asWebviewUri: (uri: any) => uri.toString(),
      },
      onDidDispose: () => {},
    };

    let loadedTargetDir = '';
    provider.loadGeneratedFilesFromDisk = (dir: string) => {
      loadedTargetDir = dir;
      return [];
    };

    await provider.resolveCustomTextEditor(mockDoc, mockPanel, {} as any);

    if (messageCallback) {
      await (messageCallback as any)({ type: 'READY' });
      await new Promise((resolve) => setTimeout(resolve, 10));

      assert.ok(
        loadedTargetDir.includes('custom_agents_folder'),
        `Expected targetDir to include custom_agents_folder but got: ${loadedTargetDir}`
      );
    }
  });

  it('should resolveTargetDirectory relative to document file directory matching filename', () => {
    const mockContext: any = { extensionPath: '/mock', subscriptions: [] };
    const provider = new AgentEditorProvider(mockContext);

    const mockDoc: any = {
      uri: vscode.Uri.file('/mock/workspace/agents/scratch/scratch-agent.agent'),
    };

    // 1. Default (undefined configuredFolder) -> folder name matches file name
    const defaultDir = provider.resolveTargetDirectory(mockDoc, undefined);
    assert.equal(defaultDir, '/mock/workspace/agents/scratch/scratch-agent');

    // 2. Relative folder './scratch-agent/' -> resolves to /mock/workspace/agents/scratch/scratch-agent
    const relativeDir = provider.resolveTargetDirectory(mockDoc, './scratch-agent/');
    assert.equal(relativeDir, '/mock/workspace/agents/scratch/scratch-agent');

    // 3. Relative subfolder './custom_out/'
    const customRelativeDir = provider.resolveTargetDirectory(mockDoc, './custom_out/');
    assert.equal(customRelativeDir, '/mock/workspace/agents/scratch/custom_out');

    // 4. Absolute folder
    const absDir = provider.resolveTargetDirectory(mockDoc, '/tmp/absolute/path');
    assert.equal(absDir, '/tmp/absolute/path');
  });
});

