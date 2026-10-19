/**
 * Unit Tests for ADK Lifecycle Callbacks Configuration (TASK-239)
 *
 * Validates:
 * 1. ADK_CALLBACK_PRESETS catalog definitions (5 core presets).
 * 2. generateCallbackPythonSnippet logic for presets, workspace functions, and AI prompts.
 * 3. Typed ADK Python signatures across all 6 lifecycle hooks:
 *    before_agent, after_agent, before_model, after_model, before_tool, after_tool.
 * 4. Extension host callbacks folder recursive synchronization and bytecode filtering.
 * 5. Callbacks rule state management and AgentNodeData integration.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import {
  ADK_CALLBACK_PRESETS,
  generateCallbackPythonSnippet,
} from '../../../src/webview/components/inspector/CallbacksConfigSection';
import {
  AdkCallbackRule,
  AdkCallbackHookType,
  AgentNodeData,
} from '../../../src/shared/types';
import { AgentEditorProvider } from '../../../src/extension/AgentEditorProvider';

describe('ADK Lifecycle Callbacks Configuration (TASK-239)', () => {
  let tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) {
      if (fs.existsSync(dir)) {
        try {
          fs.rmSync(dir, { recursive: true, force: true });
        } catch {
          // ignore cleanup errors
        }
      }
    }
    tempDirs = [];
  });

  // Section 1: Presets Catalog
  it('should include all 5 declarative ADK callback presets in the catalog', () => {
    assert.equal(ADK_CALLBACK_PRESETS.length, 5);

    const presetTypes = ADK_CALLBACK_PRESETS.map((p) => p.type);
    assert.ok(presetTypes.includes('tool_arg_guardrail'));
    assert.ok(presetTypes.includes('tool_response_cache'));
    assert.ok(presetTypes.includes('pii_secret_redaction'));
    assert.ok(presetTypes.includes('turn_rate_limiter'));
    assert.ok(presetTypes.includes('state_initializer_audit'));
  });

  it('should define valid supported hooks and default configurations for presets', () => {
    const guardrail = ADK_CALLBACK_PRESETS.find((p) => p.type === 'tool_arg_guardrail');
    assert.ok(guardrail);
    assert.equal(guardrail?.defaultHook, 'before_tool');
    assert.ok(guardrail?.defaultConfig.blockedPatterns);

    const cache = ADK_CALLBACK_PRESETS.find((p) => p.type === 'tool_response_cache');
    assert.ok(cache);
    assert.ok(cache?.supportedHooks.includes('before_tool'));
    assert.ok(cache?.supportedHooks.includes('after_tool'));

    const pii = ADK_CALLBACK_PRESETS.find((p) => p.type === 'pii_secret_redaction');
    assert.ok(pii);
    assert.equal(pii?.defaultConfig.maskEmails, true);
  });

  // Section 2: Code Generation for Presets
  it('should generate typed before_tool guardrail Python snippet', () => {
    const rule: AdkCallbackRule = {
      id: 'cb_guard',
      name: 'enforce_tool_rbac',
      hookType: 'before_tool',
      mode: 'preset',
      presetType: 'tool_arg_guardrail',
      enabled: true,
    };

    const snippet = generateCallbackPythonSnippet(rule);
    assert.ok(snippet.includes('def enforce_tool_rbac(tool: BaseTool, args: dict, tool_context: ToolContext) -> Optional[dict]:'));
    assert.ok(snippet.includes('user_role'));
    assert.ok(snippet.includes('Permission denied'));
  });

  it('should generate typed turn rate limiter before_model Python snippet', () => {
    const rule: AdkCallbackRule = {
      id: 'cb_rate',
      name: 'rate_limiter',
      hookType: 'before_model',
      mode: 'preset',
      presetType: 'turn_rate_limiter',
      enabled: true,
    };

    const snippet = generateCallbackPythonSnippet(rule);
    assert.ok(snippet.includes('def rate_limiter(callback_context: CallbackContext, llm_request: LlmRequest) -> Optional[LlmResponse]:'));
    assert.ok(snippet.includes('turn_count'));
    assert.ok(snippet.includes('LlmResponse'));
  });

  // Section 3: Code Generation for Workspace Functions across Hooks
  it('should generate typed signatures for workspace functions across hooks', () => {
    const hooks: AdkCallbackHookType[] = [
      'before_agent',
      'after_agent',
      'before_model',
      'after_model',
      'before_tool',
      'after_tool',
    ];

    for (const hook of hooks) {
      const rule: AdkCallbackRule = {
        id: `cb_${hook}`,
        name: `custom_${hook}`,
        functionName: `on_${hook}`,
        hookType: hook,
        mode: 'workspace_function',
        workspaceFile: 'callbacks/custom_callbacks.py',
        enabled: true,
      };

      const snippet = generateCallbackPythonSnippet(rule);
      assert.ok(snippet.includes(`def on_${hook}`));
      assert.ok(snippet.includes('callbacks/custom_callbacks.py'));

      if (hook === 'before_agent' || hook === 'after_agent') {
        assert.ok(snippet.includes('callback_context: CallbackContext'));
      } else if (hook === 'before_model') {
        assert.ok(snippet.includes('llm_request: LlmRequest'));
      } else if (hook === 'after_model') {
        assert.ok(snippet.includes('llm_response: LlmResponse'));
      } else if (hook === 'before_tool') {
        assert.ok(snippet.includes('tool_context: ToolContext'));
      } else if (hook === 'after_tool') {
        assert.ok(snippet.includes('tool_response: Any'));
      }
    }
  });

  // Section 4: AI Prompt Interceptor Snippet Generation
  it('should generate callback template containing natural language prompt directive', () => {
    const rule: AdkCallbackRule = {
      id: 'cb_prompt',
      name: 'ai_fraud_check',
      hookType: 'before_tool',
      mode: 'ai_prompt',
      aiPrompt: 'Block any transaction above $10,000 without compliance officer sign-off',
      enabled: true,
    };

    const snippet = generateCallbackPythonSnippet(rule);
    assert.ok(snippet.includes('Block any transaction above $10,000'));
    assert.ok(snippet.includes('def ai_fraud_check'));
  });

  // Section 5: Extension Host Callbacks Directory Synchronization
  it('should recursively copy workspace callbacks directory and skip cache files', async () => {
    const mockContext: any = {
      extensionPath: path.resolve(__dirname, '../../..'),
      subscriptions: [],
    };
    const provider = new AgentEditorProvider(mockContext);

    const sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'source-cb-'));
    const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'target-cb-'));
    tempDirs.push(sourceDir, targetDir);

    const sourceCallbacks = path.join(sourceDir, 'callbacks');
    const pycache = path.join(sourceCallbacks, '__pycache__');
    fs.mkdirSync(pycache, { recursive: true });

    // Write valid callback script and cache file
    fs.writeFileSync(path.join(sourceCallbacks, 'security.py'), 'def check_auth(): pass', 'utf-8');
    fs.writeFileSync(path.join(pycache, 'security.cpython-313.pyc'), 'binary cache', 'utf-8');

    const mockDoc: any = {
      uri: { fsPath: path.join(sourceDir, 'sample.agent') },
    };

    const copied = await provider.copySampleCallbacksFiles(undefined, mockDoc, targetDir);

    assert.ok(copied.some((f) => f.includes('security.py')));
    assert.ok(!copied.some((f) => f.includes('.pyc')));
    assert.ok(fs.existsSync(path.join(targetDir, 'callbacks', 'security.py')));
  });

  it('should return empty array gracefully when callbacks directory does not exist', async () => {
    const mockContext: any = {
      extensionPath: path.resolve(__dirname, '../../..'),
      subscriptions: [],
    };
    const provider = new AgentEditorProvider(mockContext);

    const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'target-cb-empty-'));
    tempDirs.push(targetDir);

    const copied = await provider.copySampleCallbacksFiles(undefined, undefined, targetDir);
    assert.deepEqual(copied, []);
  });
});
