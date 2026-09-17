/**
 * Unit Tests for Editor Decomposition Components
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { DocumentSyncManager } from '../../../src/extension/editor/DocumentSyncManager';
import { WebviewMessageRouter } from '../../../src/extension/editor/WebviewMessageRouter';
import { getHtmlForWebview } from '../../../src/extension/editor/WebviewHtmlProvider';
import { AgentWorkflowDocument } from '../../../src/shared/types';
import { AgentEditorProvider } from '../../../src/extension/AgentEditorProvider';

describe('Editor Decomposition - Unit Tests', { concurrency: 1 }, () => {
  let mockContext: any;

  beforeEach(() => {
    vscode.resetAllMocks();
    mockContext = {
      extensionPath: '/mock/extension',
      extensionUri: vscode.Uri.file('/mock/extension'),
      subscriptions: [],
    };
  });

  describe('DocumentSyncManager', () => {
    it('should initialize versions, pending edits and parse errors correctly', () => {
      const manager = new DocumentSyncManager(undefined);
      const uriStr = 'file:///mock/test.agent';

      assert.equal(manager.getDocumentVersion(uriStr), 0);
      manager.setDocumentVersion(uriStr, 5);
      assert.equal(manager.getDocumentVersion(uriStr), 5);

      assert.equal(manager.getPendingEditsCount(uriStr), 0);
      manager.setPendingEditsCount(uriStr, 3);
      assert.equal(manager.getPendingEditsCount(uriStr), 3);

      assert.equal(manager.hasParseError(uriStr), false);
      manager.setParseError(uriStr, 'JSON Syntax Error');
      assert.equal(manager.hasParseError(uriStr), true);
      assert.equal(manager.getParseError(uriStr), 'JSON Syntax Error');

      manager.deleteParseError(uriStr);
      assert.equal(manager.hasParseError(uriStr), false);
    });

    it('should accurately detect webview-generated content changes to prevent echo resurrection loops', () => {
      const manager = new DocumentSyncManager(undefined);
      const uriStr = 'file:///mock/test.agent';
      const jsonContent = JSON.stringify({ version: '1.0.0', name: 'agent', nodes: [{ id: 'agent-1' }] }, null, 2);

      assert.equal(manager.isWebviewGeneratedChange(uriStr, jsonContent), false);
      manager.setLastAppliedContent(uriStr, jsonContent);
      assert.equal(manager.getLastAppliedContent(uriStr), jsonContent);
      assert.equal(manager.isWebviewGeneratedChange(uriStr, jsonContent), true);

      // Equivalent JSON formatting differences should still be recognized as webview-generated
      const minifiedJson = JSON.stringify({ version: '1.0.0', name: 'agent', nodes: [{ id: 'agent-1' }] });
      assert.equal(manager.isWebviewGeneratedChange(uriStr, minifiedJson), true);

      // Distinct content should NOT be flagged as webview-generated
      const externalChangeJson = JSON.stringify({ version: '1.0.0', name: 'agent', nodes: [{ id: 'agent-1' }, { id: 'trigger-1' }] }, null, 2);
      assert.equal(manager.isWebviewGeneratedChange(uriStr, externalChangeJson), false);
    });

    it('should report parse errors for invalid JSON documents', () => {
      const manager = new DocumentSyncManager(undefined);
      const mockDoc: any = {
        uri: vscode.Uri.parse('file:///mock/test.agent'),
        getText: () => '{ invalid json ',
      };

      const postedMessages: any[] = [];
      const mockBridge: any = {
        postMessage: async (msg: any) => {
          postedMessages.push(msg);
          return true;
        },
      };

      const hasError = manager.checkAndHandleParseError(mockDoc, mockBridge);
      assert.equal(hasError, true);
      assert.equal(manager.hasParseError(mockDoc.uri.toString()), true);
      assert.equal(postedMessages.length, 1);
      assert.equal(postedMessages[0].type, 'PARSE_ERROR');
    });

    it('should reject schema major versions higher than 1', () => {
      const manager = new DocumentSyncManager(undefined);
      const mockDoc: any = {
        uri: vscode.Uri.parse('file:///mock/test.agent'),
        getText: () => JSON.stringify({ version: '2.0.0', name: 'future' }),
      };

      const postedMessages: any[] = [];
      const mockBridge: any = {
        postMessage: async (msg: any) => {
          postedMessages.push(msg);
          return true;
        },
      };

      const hasError = manager.checkAndHandleParseError(mockDoc, mockBridge);
      assert.equal(hasError, true);
      assert.match(manager.getParseError(mockDoc.uri.toString())!, /Unsupported future schema version/);
      assert.equal(postedMessages[0].type, 'PARSE_ERROR');
    });

    it('should return default target directories based on document path', () => {
      const manager = new DocumentSyncManager(undefined);
      const mockDoc: any = {
        uri: vscode.Uri.file('/mock/workspace/sample-agent.agent'),
        getText: () => '{}',
      };

      const resolved = manager.resolveTargetDirectory(mockDoc, undefined);
      // sanitized basename
      assert.equal(resolved, '/mock/workspace/sample_agent');
    });

    it('should clean target directory successfully', async () => {
      const manager = new DocumentSyncManager(undefined);
      const tmpDir = `/tmp/test_clean_editor_${Date.now()}`;
      fs.mkdirSync(tmpDir, { recursive: true });
      fs.writeFileSync(path.join(tmpDir, 'server.py'), '# code');
      fs.writeFileSync(path.join(tmpDir, 'preserved.agent'), '{}');

      const mockDoc: any = {
        uri: vscode.Uri.file(path.join(tmpDir, 'preserved.agent')),
      };

      const res = await manager.cleanTargetDirectory(tmpDir, mockDoc);
      assert.ok(res.cleaned.includes('server.py'));
      assert.ok(res.preserved.includes('preserved.agent'));
      assert.equal(fs.existsSync(path.join(tmpDir, 'server.py')), false);
      assert.equal(fs.existsSync(path.join(tmpDir, 'preserved.agent')), true);

      fs.rmSync(tmpDir, { recursive: true, force: true });
    });
  });

  describe('WebviewHtmlProvider', () => {
    it('should render HTML containing CSP nonces and bootstrap data', () => {
      const mockWebview: any = {
        cspSource: 'vscode-resource:',
        asWebviewUri: (uri: any) => uri.toString(),
      };

      const html = getHtmlForWebview(mockWebview, mockContext);
      assert.ok(html.includes('<!DOCTYPE html>'));
      assert.ok(html.includes('Content-Security-Policy'));
      assert.ok(html.includes('id="bootstrap-data"'));
      assert.ok(html.includes('acquireVsCodeApi'));
    });
  });

  describe('WebviewMessageRouter', () => {
    it('should register handlers on the webview bridge', () => {
      const registeredTypes = new Set<string>();
      const mockBridge: any = {
        onMessage: (type: string) => {
          registeredTypes.add(type);
        },
      };

      const mockDoc: any = {
        uri: vscode.Uri.file('/mock/sample.agent'),
        getText: () => '{}',
      };

      const router = new WebviewMessageRouter(
        mockContext,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        new DocumentSyncManager(undefined),
        undefined
      );

      router.registerRoutes(mockBridge, mockDoc, new Map());

      assert.ok(registeredTypes.has('READY'));
      assert.ok(registeredTypes.has('DOCUMENT_UPDATED'));
      assert.ok(registeredTypes.has('GENERATE_CODE'));
      assert.ok(registeredTypes.has('DEPLOY_TO_AGENT_ENGINE'));
      assert.ok(registeredTypes.has('RUN_TESTS'));
    });
  });
});
