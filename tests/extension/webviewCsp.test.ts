/**
 * Unit Tests for Webview Content Security Policy (CSP) and Bootstrap Data Escaping.
 *
 * Purpose: Validates security boundaries, script nonces, CSP directives, and HTML escape hygiene.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { AgentEditorProvider } from '../../src/extension/AgentEditorProvider';

describe('Webview Content Security Policy & Inline Bootstrap Serialization', { concurrency: 1 }, () => {
  beforeEach(() => {
    vscode.resetAllMocks();
  });

  it('should generate a CSP that does NOT contain unsafe-inline in script-src directive', () => {
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
    
    // Extract the CSP content attribute value
    const cspMatch = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/);
    assert.ok(cspMatch, 'CSP meta tag not found');
    const cspContent = cspMatch[1];

    // Find script-src directive
    const scriptSrcMatch = cspContent.match(/script-src\s+([^;]+)/);
    assert.ok(scriptSrcMatch, 'script-src directive not found in CSP');
    const scriptSrc = scriptSrcMatch[1];

    // Ensure unsafe-inline and unsafe-eval are NOT in script-src
    assert.equal(scriptSrc.includes("'unsafe-inline'"), false, 'script-src must not contain unsafe-inline');
    assert.equal(scriptSrc.includes("'unsafe-eval'"), false, 'script-src must not contain unsafe-eval');
  });

  it('should generate a unique, non-constant nonce on every render call', () => {
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

    const html1 = provider.getHtmlForWebview(mockWebview);
    const html2 = provider.getHtmlForWebview(mockWebview);

    const nonce1Match = html1.match(/script-src\s+'nonce-([^']+)'/);
    const nonce2Match = html2.match(/script-src\s+'nonce-([^']+)'/);

    assert.ok(nonce1Match, 'Nonce not found in first render');
    assert.ok(nonce2Match, 'Nonce not found in second render');

    const nonce1 = nonce1Match[1];
    const nonce2 = nonce2Match[1];

    assert.notEqual(nonce1, nonce2, 'Nonces must be unique on separate renders');
    assert.equal(nonce1.length > 10, true, 'Nonce should be of substantial length');
  });

  it('should generate script tags with nonces matching the CSP nonce', () => {
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

    // Extract the CSP nonce
    const cspNonceMatch = html.match(/script-src\s+'nonce-([^']+)'/);
    assert.ok(cspNonceMatch, 'CSP nonce not found');
    const cspNonce = cspNonceMatch[1];

    // Find all <script ...> tags in the HTML
    const scriptTagMatches = html.match(/<script\s+([^>]+)>/g);
    assert.ok(scriptTagMatches, 'No script tags found');

    for (const tag of scriptTagMatches) {
      const nonceMatch = tag.match(/nonce="([^"]+)"/);
      assert.ok(nonceMatch, `Script tag lacks nonce attribute: ${tag}`);
      assert.equal(nonceMatch[1], cspNonce, `Script tag nonce does not match CSP nonce: ${tag}`);
    }
  });

  it('should serialize bootstrap data safely and escape script injection payloads completely', () => {
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

    // Construct a document with a malicious workflow document structure
    const maliciousDocContent = JSON.stringify({
      version: '1.0.0',
      name: 'Injection </script><script>alert("hacked")</script>',
      description: 'Breakout <img src=x onerror=alert(1)>',
      framework: 'google-adk',
      language: 'python',
      nodes: [],
      edges: [],
    });

    const mockTextDocument: any = {
      uri: vscode.Uri.file('/mock/injection.agent'),
      getText: () => maliciousDocContent,
    };

    const html = provider.getHtmlForWebview(mockWebview, mockTextDocument);

    // Verify bootstrap data script block exists
    assert.equal(html.includes('id="bootstrap-data"'), true, 'bootstrap-data element not found');

    // Find the content of the bootstrap-data script block
    const scriptBlockMatch = html.match(/<script type="application\/json" id="bootstrap-data"[^>]*>([\s\S]+?)<\/script>/);
    assert.ok(scriptBlockMatch, 'Could not locate bootstrap-data script block in HTML');
    const scriptBlockContent = scriptBlockMatch[1];

    // Ensure it does not contain unescaped "</script>" that can terminate the script tag prematurely
    assert.equal(scriptBlockContent.includes('</script>'), false, 'Escaped payload must not contain unescaped </script>');
    assert.equal(scriptBlockContent.includes('</script'), false, 'Escaped payload must not contain unescaped closing script prefixes');
    assert.equal(scriptBlockContent.includes('<script>'), false, 'Escaped payload must not contain unescaped script tag start');
    assert.equal(scriptBlockContent.includes('<img'), false, 'Escaped payload must not contain unescaped img tags');
    
    // Ensure '<' is fully replaced with unicode equivalents or escaped
    assert.equal(scriptBlockContent.includes('<'), false, 'Escaped payload must not contain raw less-than character');

    // Verify the contents can be successfully parsed after reverting the escape sequences (in client-side simulation)
    const clientSafeContent = scriptBlockContent
      .split('<\\/script').join('</script')
      .split('\\u003c').join('<');

    const parsed = JSON.parse(clientSafeContent);
    assert.ok(parsed, 'Re-hydrated client JSON should be valid');
    assert.equal(parsed.initialDoc.name, 'Injection </script><script>alert("hacked")</script>');
    assert.equal(parsed.initialDoc.description, 'Breakout <img src=x onerror=alert(1)>');
  });
});
