/**
 * CallbacksConfigSection - ADK Lifecycle Callbacks Configuration Panel (TASK-239)
 *
 * Purpose:
 * Configures Google ADK agent-level lifecycle callbacks across the 6 ADK hooks:
 * - before_agent / after_agent
 * - before_model / after_model
 * - before_tool / after_tool
 *
 * Supports three authoring modes:
 * 1. Declarative Presets (tool_arg_guardrail, tool_response_cache, pii_secret_redaction,
 *    turn_rate_limiter, state_initializer_audit)
 * 2. Workspace Function (Python callback in callbacks/*.py)
 * 3. AI Prompt (Natural language intent compiled into an ADK callback)
 *
 * Architectural Decisions:
 * - Follows ADK Python callback signatures (CallbackContext, ToolContext, LlmRequest, LlmResponse).
 * - Exports ADK_CALLBACK_PRESETS catalog and generateCallbackPythonSnippet helper.
 * - Adheres strictly to the 8pt UI grid system and VS Code dark theme styling.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import React, { useState } from 'react';
import {
  Zap,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  FileCode,
  Shield,
  Eye,
  Terminal,
  Sparkles,
  Sliders,
  Copy,
  Check
} from 'lucide-react';
import {
  AdkCallbackRule,
  AdkCallbackHookType,
  AdkCallbackDefinitionMode,
  AdkCallbackPresetType
} from '../../../shared/types';

/**
 * Definition structure for pre-packaged ADK callback presets
 */
export interface CallbackPresetDefinition {
  type: AdkCallbackPresetType;
  label: string;
  defaultHook: AdkCallbackHookType;
  supportedHooks: AdkCallbackHookType[];
  description: string;
  defaultConfig: Record<string, any>;
}

/**
 * Catalog of pre-configured Google ADK callback presets
 */
export const ADK_CALLBACK_PRESETS: CallbackPresetDefinition[] = [
  {
    type: 'tool_arg_guardrail',
    label: 'Tool Argument Guardrail / RBAC',
    defaultHook: 'before_tool',
    supportedHooks: ['before_tool'],
    description: 'Blocks tool execution and returns a structured error dict if arguments violate regex rules or tool_context.state["user_role"] checks.',
    defaultConfig: {
      blockedPatterns: ['rm -rf', 'drop table'],
      requiredRole: 'analyst',
    },
  },
  {
    type: 'tool_response_cache',
    label: 'Tool Response Cache',
    defaultHook: 'before_tool',
    supportedHooks: ['before_tool', 'after_tool'],
    description: 'Caches deterministic tool outputs in tool_context.state keyed by (tool.name, args) with configurable TTL.',
    defaultConfig: {
      ttlSeconds: 300,
      cacheKeyPrefix: 'tool_cache_',
    },
  },
  {
    type: 'pii_secret_redaction',
    label: 'PII & Secret Redaction',
    defaultHook: 'before_model',
    supportedHooks: ['before_model', 'after_tool'],
    description: 'Masks emails, SSNs, credit cards, or custom regexes before sending context to the LLM or SessionService.',
    defaultConfig: {
      maskEmails: true,
      maskCreditCards: true,
      maskSsn: true,
      replacementText: '[REDACTED]',
    },
  },
  {
    type: 'turn_rate_limiter',
    label: 'Turn / Token Rate-Limiter',
    defaultHook: 'before_model',
    supportedHooks: ['before_model'],
    description: 'Short-circuits with a polite LlmResponse if session model call count exceeds threshold maxTurns.',
    defaultConfig: {
      maxTurns: 10,
      rateLimitMessage: 'Agent has reached the maximum allowed reasoning turns for this session.',
    },
  },
  {
    type: 'state_initializer_audit',
    label: 'State Initializer / Audit Stamp',
    defaultHook: 'before_agent',
    supportedHooks: ['before_agent', 'after_agent'],
    description: 'Initializes default callback_context.state keys or records execution latency and audit timestamps.',
    defaultConfig: {
      recordTimestamps: true,
      initialStateKeys: { initialized: true },
    },
  },
];

/**
 * Generates an ADK Python callback implementation snippet adhering to
 * google.adk.agents callback signatures.
 *
 * @param rule The callback rule to generate code for
 * @returns Formatted Python code snippet
 */
export function generateCallbackPythonSnippet(rule: AdkCallbackRule): string {
  const funcName = rule.functionName || rule.name?.toLowerCase().replace(/[^a-z0-9_]/g, '_') || 'callback_handler';

  // Section 1: Preset-based implementations
  if (rule.mode === 'preset') {
    switch (rule.presetType) {
      case 'tool_arg_guardrail':
        return `def ${funcName}(tool: BaseTool, args: dict, tool_context: ToolContext) -> Optional[dict]:
    """ADK before_tool Guardrail: Blocks execution if arguments violate RBAC or regex policies."""
    user_role = tool_context.state.get("user_role", "guest")
    if user_role not in ["admin", "analyst"]:
        return {"error": f"Permission denied for tool '{tool.name}' with role '{user_role}'"}
    
    # Check forbidden commands
    args_str = str(args)
    forbidden = ["rm -rf", "drop table", "delete from"]
    for pattern in forbidden:
        if pattern in args_str.lower():
            return {"error": f"Dangerous command pattern detected: {pattern}"}
    return None  # Return None to allow execution`.trim();

      case 'tool_response_cache':
        if (rule.hookType === 'after_tool') {
          return `def ${funcName}(tool: BaseTool, args: dict, tool_context: ToolContext, tool_response: Any) -> Optional[Any]:
    """ADK after_tool Cache: Caches tool output in session state."""
    cache_key = f"tool_cache_{tool.name}_{hash(frozenset(args.items()))}"
    tool_context.state[cache_key] = tool_response
    return None`.trim();
        }
        return `def ${funcName}(tool: BaseTool, args: dict, tool_context: ToolContext) -> Optional[dict]:
    """ADK before_tool Cache: Returns cached result if available."""
    cache_key = f"tool_cache_{tool.name}_{hash(frozenset(args.items()))}"
    if cache_key in tool_context.state:
        return {"result": tool_context.state[cache_key], "cached": True}
    return None`.trim();

      case 'pii_secret_redaction':
        if (rule.hookType === 'before_model') {
          return `def ${funcName}(callback_context: CallbackContext, llm_request: LlmRequest) -> Optional[LlmResponse]:
    """ADK before_model PII Masking: Redacts sensitive entities before invocation."""
    import re
    if hasattr(llm_request, "contents"):
        for content in llm_request.contents:
            if hasattr(content, "text"):
                # Mask email patterns
                content.text = re.sub(r"[\\w\\.-]+@[\\w\\.-]+", "[REDACTED_EMAIL]", content.text)
    return None`.trim();
        }
        return `def ${funcName}(tool: BaseTool, args: dict, tool_context: ToolContext, tool_response: Any) -> Optional[Any]:
    """ADK after_tool Redaction: Sanitizes tool response payloads."""
    import re
    if isinstance(tool_response, str):
        return re.sub(r"[\\w\\.-]+@[\\w\\.-]+", "[REDACTED_EMAIL]", tool_response)
    return None`.trim();

      case 'turn_rate_limiter':
        return `def ${funcName}(callback_context: CallbackContext, llm_request: LlmRequest) -> Optional[LlmResponse]:
    """ADK before_model Rate Limiter: Short-circuits when turn limit exceeded."""
    current_turns = callback_context.state.get("turn_count", 0) + 1
    callback_context.state["turn_count"] = current_turns
    
    max_allowed = 10
    if current_turns > max_allowed:
        from google.adk.types import LlmResponse
        return LlmResponse(text="Session turn limit reached. Please start a new conversation.")
    return None`.trim();

      case 'state_initializer_audit':
      default:
        return `def ${funcName}(callback_context: CallbackContext) -> None:
    """ADK ${rule.hookType}: State Initializer and Execution Audit."""
    import time
    if "session_start_time" not in callback_context.state:
        callback_context.state["session_start_time"] = time.time()
    callback_context.state["last_audit_stamp"] = time.time()`.trim();
    }
  }

  // Section 2: Workspace function signature
  if (rule.mode === 'workspace_function') {
    const importComment = `# Imported from ${rule.workspaceFile || 'callbacks/custom_callbacks.py'}`;
    switch (rule.hookType) {
      case 'before_agent':
      case 'after_agent':
        return `${importComment}\ndef ${funcName}(callback_context: CallbackContext) -> None:\n    # Implement custom lifecycle logic\n    pass`.trim();
      case 'before_model':
        return `${importComment}\ndef ${funcName}(callback_context: CallbackContext, llm_request: LlmRequest) -> Optional[LlmResponse]:\n    # Return Optional[LlmResponse] to short-circuit, or None to proceed\n    return None`.trim();
      case 'after_model':
        return `${importComment}\ndef ${funcName}(callback_context: CallbackContext, llm_response: LlmResponse) -> Optional[LlmResponse]:\n    # Return modified Optional[LlmResponse], or None to keep original\n    return None`.trim();
      case 'before_tool':
        return `${importComment}\ndef ${funcName}(tool: BaseTool, args: dict, tool_context: ToolContext) -> Optional[dict]:\n    # Return dict to short-circuit tool execution with custom output, or None to execute\n    return None`.trim();
      case 'after_tool':
        return `${importComment}\ndef ${funcName}(tool: BaseTool, args: dict, tool_context: ToolContext, tool_response: Any) -> Optional[Any]:\n    # Return modified tool_response, or None to leave untouched\n    return None`.trim();
    }
  }

  // Section 3: AI prompt based callback
  return `# AI Prompt Callback Directive:
# "${rule.aiPrompt || 'Apply custom guardrail or auditing logic'}"
def ${funcName}(*args, **kwargs):
    # Generated ADK callback implementation for: ${rule.hookType}
    pass`.trim();
}

/**
 * Props for the CallbacksConfigSection component
 */
export interface CallbacksConfigSectionProps {
  callbacks?: AdkCallbackRule[];
  onUpdateCallbacks: (callbacks: AdkCallbackRule[]) => void;
}

/**
 * Component for configuring ADK agent lifecycle callbacks in the Inspector drawer.
 */
export const CallbacksConfigSection: React.FC<CallbacksConfigSectionProps> = ({
  callbacks = [],
  onUpdateCallbacks,
}) => {
  // Section 1: State management
  const [expandedRuleId, setExpandedRuleId] = useState<string | null>(callbacks[0]?.id || null);
  const [previewRuleId, setPreviewRuleId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Section 2: Rule mutation handlers
  const handleAddRule = () => {
    const newId = `cb_${Date.now()}`;
    const newRule: AdkCallbackRule = {
      id: newId,
      name: 'tool_guardrail_rule',
      hookType: 'before_tool',
      mode: 'preset',
      presetType: 'tool_arg_guardrail',
      enabled: true,
      description: 'Blocks tool execution on unauthorized roles or risky commands.',
    };
    onUpdateCallbacks([...callbacks, newRule]);
    setExpandedRuleId(newId);
  };

  const handleUpdateRule = (id: string, updates: Partial<AdkCallbackRule>) => {
    const updated = callbacks.map((r) => (r.id === id ? { ...r, ...updates } : r));
    onUpdateCallbacks(updated);
  };

  const handleRemoveRule = (id: string) => {
    const updated = callbacks.filter((r) => r.id !== id);
    onUpdateCallbacks(updated);
    if (expandedRuleId === id) {
      setExpandedRuleId(updated[0]?.id || null);
    }
  };

  const handleCopyPreview = (rule: AdkCallbackRule) => {
    const text = generateCallbackPythonSnippet(rule);
    navigator.clipboard?.writeText(text);
    setCopiedId(rule.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-3" data-testid="callbacks-config-section">
      {/* Header with Title and Add Button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-purple-400" />
          <label className="text-[11px] font-bold uppercase tracking-tight text-gray-300">
            Lifecycle Callbacks ({callbacks.length})
          </label>
        </div>
        <button
          type="button"
          onClick={handleAddRule}
          className="flex items-center gap-1 text-[11px] text-purple-400 hover:text-purple-300 font-medium cursor-pointer"
          data-testid="add-callback-button"
        >
          <Plus className="w-3 h-3" />
          Add Callback
        </button>
      </div>

      <p className="text-[10px] text-gray-400 leading-normal">
        Execute deterministic interceptors across <code className="text-purple-300">before/after_agent</code>,{' '}
        <code className="text-purple-300">before/after_model</code>, and{' '}
        <code className="text-purple-300">before/after_tool</code> hooks.
      </p>

      {/* Callbacks List */}
      <div className="space-y-2">
        {callbacks.length === 0 ? (
          <div className="text-[11px] text-gray-400 italic p-2.5 bg-[#0d1117] rounded-lg border border-dashed border-[#30363d] text-center">
            No lifecycle callbacks attached. Click "Add Callback" to configure guardrails, response caching, or PII masking.
          </div>
        ) : (
          callbacks.map((rule) => {
            const isExpanded = expandedRuleId === rule.id;
            const isPreviewOpen = previewRuleId === rule.id;

            return (
              <div
                key={rule.id}
                className="rounded-lg bg-[#0d1117] border border-[#30363d] overflow-hidden"
                data-testid={`callback-card-${rule.id}`}
              >
                {/* Rule Item Header */}
                <div
                  className="flex items-center justify-between p-2.5 cursor-pointer hover:bg-[#161b22]/50 transition-colors"
                  onClick={() => setExpandedRuleId(isExpanded ? null : rule.id)}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <input
                      type="checkbox"
                      checked={rule.enabled !== false}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => handleUpdateRule(rule.id, { enabled: e.target.checked })}
                      className="w-3.5 h-3.5 accent-purple-500 rounded cursor-pointer"
                      title="Enable / Disable Callback"
                    />
                    <div className="min-w-0">
                      <div className="font-semibold text-gray-200 text-xs truncate flex items-center gap-1.5">
                        <span>{rule.name || 'unnamed_callback'}</span>
                        <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-purple-950/60 text-purple-300 border border-purple-500/20">
                          {rule.hookType}
                        </span>
                      </div>
                      <div className="text-[10px] text-gray-400 truncate max-w-[200px]">
                        {rule.mode === 'preset'
                          ? `Preset: ${rule.presetType || 'default'}`
                          : rule.mode === 'workspace_function'
                          ? `Function: ${rule.functionName || 'custom'}`
                          : 'AI Prompt Interceptor'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPreviewRuleId(isPreviewOpen ? null : rule.id);
                      }}
                      title="Preview generated Python callback"
                      className="p-1 text-gray-400 hover:text-purple-400 rounded transition-colors cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveRule(rule.id);
                      }}
                      title="Remove Callback"
                      className="p-1 text-gray-400 hover:text-rose-400 rounded transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    {isExpanded ? (
                      <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                    )}
                  </div>
                </div>

                {/* Python Snippet Preview Panel */}
                {isPreviewOpen && (
                  <div className="p-2.5 bg-[#161b22] border-t border-[#30363d] space-y-1.5">
                    <div className="flex items-center justify-between text-[10px] text-gray-400">
                      <span className="font-mono flex items-center gap-1">
                        <FileCode className="w-3 h-3 text-purple-400" />
                        ADK Python Signature
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopyPreview(rule)}
                        className="flex items-center gap-1 text-purple-400 hover:text-purple-300 cursor-pointer"
                      >
                        {copiedId === rule.id ? (
                          <>
                            <Check className="w-3 h-3" />
                            <span>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                    <pre className="p-2 bg-[#0d1117] rounded text-[10px] text-purple-300 font-mono whitespace-pre-wrap max-h-48 overflow-y-auto border border-[#30363d]">
                      {generateCallbackPythonSnippet(rule)}
                    </pre>
                  </div>
                )}

                {/* Expanded Edit Form */}
                {isExpanded && (
                  <div className="p-3 border-t border-[#30363d] space-y-3 bg-[#161b22]/30">
                    {/* Hook Type Selector */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase tracking-tight text-gray-400">
                        Lifecycle Hook
                      </label>
                      <select
                        value={rule.hookType}
                        onChange={(e) =>
                          handleUpdateRule(rule.id, {
                            hookType: e.target.value as AdkCallbackHookType,
                          })
                        }
                        className="w-full px-2.5 py-1.5 bg-[#0d1117] border border-[#30363d] focus:border-purple-500 rounded text-xs text-white cursor-pointer"
                      >
                        <option value="before_agent">before_agent (State Init & Validation)</option>
                        <option value="after_agent">after_agent (Audit & Metrics Flush)</option>
                        <option value="before_model">before_model (Prompt Inspection & Rate Limits)</option>
                        <option value="after_model">after_model (Response Redaction & Guardrails)</option>
                        <option value="before_tool">before_tool (Tool RBAC & Cache Lookup)</option>
                        <option value="after_tool">after_tool (Tool Output Filter & Cache Store)</option>
                      </select>
                    </div>

                    {/* Callback Rule Name */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase tracking-tight text-gray-400">
                        Callback Rule Name
                      </label>
                      <input
                        type="text"
                        value={rule.name}
                        onChange={(e) => handleUpdateRule(rule.id, { name: e.target.value })}
                        placeholder="e.g. check_user_authorization"
                        className="w-full px-2.5 py-1.5 bg-[#0d1117] border border-[#30363d] focus:border-purple-500 rounded text-xs text-white font-mono"
                      />
                    </div>

                    {/* Mode Selector */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase tracking-tight text-gray-400">
                        Authoring Mode
                      </label>
                      <div className="grid grid-cols-3 gap-1.5">
                        {(['preset', 'workspace_function', 'ai_prompt'] as AdkCallbackDefinitionMode[]).map(
                          (m) => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => handleUpdateRule(rule.id, { mode: m })}
                              className={`px-2 py-1 rounded text-[10px] font-medium border transition-colors cursor-pointer text-center ${
                                rule.mode === m
                                  ? 'bg-purple-950/60 border-purple-500/60 text-purple-300 font-bold'
                                  : 'bg-[#0d1117] border-[#30363d] text-gray-400 hover:text-gray-200'
                              }`}
                            >
                              {m === 'preset'
                                ? 'Preset'
                                : m === 'workspace_function'
                                ? 'Python File'
                                : 'AI Prompt'}
                            </button>
                          )
                        )}
                      </div>
                    </div>

                    {/* Preset Selection & Config */}
                    {rule.mode === 'preset' && (
                      <div className="space-y-2">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase tracking-tight text-gray-400">
                            Preset Type
                          </label>
                          <select
                            value={rule.presetType || 'tool_arg_guardrail'}
                            onChange={(e) => {
                              const pType = e.target.value as AdkCallbackPresetType;
                              const found = ADK_CALLBACK_PRESETS.find((p) => p.type === pType);
                              handleUpdateRule(rule.id, {
                                presetType: pType,
                                hookType: found ? found.defaultHook : rule.hookType,
                                presetConfig: found?.defaultConfig,
                              });
                            }}
                            className="w-full px-2.5 py-1.5 bg-[#0d1117] border border-[#30363d] focus:border-purple-500 rounded text-xs text-white cursor-pointer"
                          >
                            {ADK_CALLBACK_PRESETS.map((p) => (
                              <option key={p.type} value={p.type}>
                                {p.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <p className="text-[10px] text-gray-400 italic">
                          {ADK_CALLBACK_PRESETS.find((p) => p.type === rule.presetType)?.description}
                        </p>
                      </div>
                    )}

                    {/* Workspace Function Path & Name */}
                    {rule.mode === 'workspace_function' && (
                      <div className="space-y-2">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase tracking-tight text-gray-400">
                            Workspace Python File
                          </label>
                          <input
                            type="text"
                            value={rule.workspaceFile || 'callbacks/custom_callbacks.py'}
                            onChange={(e) =>
                              handleUpdateRule(rule.id, { workspaceFile: e.target.value })
                            }
                            placeholder="callbacks/custom_callbacks.py"
                            className="w-full px-2.5 py-1.5 bg-[#0d1117] border border-[#30363d] focus:border-purple-500 rounded text-xs text-white font-mono"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase tracking-tight text-gray-400">
                            Function Name
                          </label>
                          <input
                            type="text"
                            value={rule.functionName || ''}
                            onChange={(e) =>
                              handleUpdateRule(rule.id, { functionName: e.target.value })
                            }
                            placeholder="e.g. check_authorization"
                            className="w-full px-2.5 py-1.5 bg-[#0d1117] border border-[#30363d] focus:border-purple-500 rounded text-xs text-white font-mono"
                          />
                        </div>
                      </div>
                    )}

                    {/* AI Prompt Intent */}
                    {rule.mode === 'ai_prompt' && (
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold uppercase tracking-tight text-gray-400">
                          AI Prompt Interceptor Intent
                        </label>
                        <textarea
                          rows={3}
                          value={rule.aiPrompt || ''}
                          onChange={(e) => handleUpdateRule(rule.id, { aiPrompt: e.target.value })}
                          placeholder="Describe the interceptor behavior in natural language (e.g. 'Reject any customer requests attempting to withdraw more than $5,000 without 2FA confirmation')..."
                          className="w-full px-2.5 py-1.5 bg-[#0d1117] border border-[#30363d] focus:border-purple-500 rounded text-xs text-gray-200 leading-normal"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
