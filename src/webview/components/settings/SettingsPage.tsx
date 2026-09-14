import React, { useState, useMemo, useEffect } from 'react';
import { 
  Key, 
  Settings, 
  Sliders, 
  Cpu, 
  Layers, 
  Server, 
  Cloud, 
  Eye, 
  EyeOff, 
  Search, 
  Check, 
  Copy, 
  RotateCcw, 
  FileCode, 
  ShieldCheck, 
  Sparkles, 
  Code2, 
  Database, 
  Zap, 
  LayoutGrid, 
  HelpCircle,
  ExternalLink,
  Bot,
  CheckCircle2,
  FolderOpen
} from 'lucide-react';
import { usePluginSettings, DEFAULT_SETTINGS, PluginSettings } from '../../context/SettingsContext';
import { useWebviewBridge } from '../../hooks/useWebviewBridge';
import { FrameworkType, LanguageType, DelegationPattern, AgentMemoryType } from '../../types';

const SUPPORTED_MODELS = [
  { id: 'gemini-3.7-flash', name: 'Gemini 3.7 Flash (Recommended - Global Region)', provider: 'Google' },
  { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash', provider: 'Google' },
];

const MEMORY_CHOICES: { id: AgentMemoryType; label: string; desc: string }[] = [
  { id: 'none', label: 'None (Stateless)', desc: 'Pure execution without thread persistence' },
];

const PATTERN_CHOICES: { id: DelegationPattern; label: string; desc: string }[] = [
  { id: 'parallel', label: 'Parallel Fan-Out', desc: 'Concurrent async sub-agent execution' },
  { id: 'sequential', label: 'Sequential Pipeline', desc: 'Step-by-step handoff between sub-agents' },
];

type SettingsSection = 'all' | 'api_keys' | 'framework_defaults' | 'agent_defaults' | 'cloud_defaults' | 'editor_defaults' | 'json_view';

export const SettingsPage: React.FC = () => {
  const { settings, updateSettings, resetSettings, exportSettingsJson, openFlow } = usePluginSettings();
  const bridge = useWebviewBridge();
  const [geminiApiKeySet, setGeminiApiKeySet] = useState(false);
  const [geminiInputValue, setGeminiInputValue] = useState('');

  useEffect(() => {
    // Subscribe to settings sync events from extension
    const unsubscribe = bridge.onMessage('SETTINGS_SYNC', (payload) => {
      if (payload) {
        setGeminiApiKeySet(payload.geminiApiKeySet);
      }
    });

    // Request settings immediately upon loading SettingsPage
    bridge.postMessage({ type: 'REQUEST_SETTINGS' });

    return unsubscribe;
  }, [bridge]);

  const handleSaveGeminiKey = (value: string) => {
    // Post to extension via RPC to update the secure SecretStorage
    bridge.postMessage({
      type: 'UPDATE_SETTINGS',
      payload: {
        geminiApiKey: value,
      },
    });
    setGeminiInputValue('');
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 1500);
  };

  const [activeSection, setActiveSection] = useState<SettingsSection>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showKeys, setShowKeys] = useState<{ [key: string]: boolean }>({});
  const [copiedJson, setCopiedJson] = useState(false);
  const [savedToast, setSavedToast] = useState(false);

  const toggleKeyVisibility = (key: string) => {
    setShowKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleUpdate = (partial: Partial<PluginSettings>) => {
    updateSettings(partial);
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 1500);
  };

  const handleCopyJson = () => {
    navigator.clipboard.writeText(exportSettingsJson(geminiApiKeySet));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  const isFiltered = (text: string, tags: string[] = []) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      text.toLowerCase().includes(q) ||
      tags.some((t) => t.toLowerCase().includes(q))
    );
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[var(--vscode-workbench-bg)] text-[var(--vscode-text-primary)] select-text overflow-hidden">
      {/* VS Code Settings Header */}
      <div className="border-b border-[var(--vscode-border)] bg-[var(--vscode-workbench-bg)] px-6 py-4 shrink-0 transition-colors">
        {/* Scope & Actions */}
        <div className="flex items-center justify-between mb-3 text-xs">
          <div className="flex items-center gap-1.5 text-[var(--vscode-text-muted)] font-mono text-[11px]">
            <span className="text-blue-500 font-semibold">Visual Studio Code Agent Flow Settings</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveSection('json_view')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono border transition-colors cursor-pointer ${
                activeSection === 'json_view'
                  ? 'bg-blue-500/20 text-blue-400 border-blue-500/40'
                  : 'bg-[var(--vscode-button-secondary)] border-[var(--vscode-border)] text-[var(--vscode-text-secondary)] hover:text-[var(--vscode-text-primary)]'
              }`}
              title="Open settings.json editor"
            >
              <FileCode className="w-3.5 h-3.5" />
              <span>Open settings.json</span>
            </button>

            <button
              onClick={resetSettings}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 border border-rose-500/20 transition-colors cursor-pointer"
              title="Reset all settings to factory defaults"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Defaults</span>
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative max-w-2xl">
          <Search className="w-4 h-4 text-[var(--vscode-text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search settings (e.g. @ext:agent-flow, api key, framework, memory, temperature)..."
            className="w-full pl-9 pr-8 py-1.5 bg-[var(--vscode-canvas-bg)] border border-[var(--vscode-border)] focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg text-xs text-[var(--vscode-text-primary)] placeholder-[var(--vscode-text-muted)] focus:outline-none shadow-xs"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-[var(--vscode-text-muted)] hover:text-[var(--vscode-text-primary)] p-0.5"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Settings Body with Side Navigation & Settings List */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left Category Navigation Bar */}
        <div className="w-64 border-r border-[var(--vscode-border)] bg-[var(--vscode-activity-bar)] p-3 space-y-1 overflow-y-auto shrink-0 transition-colors text-xs select-none">
          <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--vscode-text-muted)]">
            Settings Categories
          </div>

          <button
            type="button"
            onClick={() => setActiveSection('all')}
            className={`w-full text-left px-3 py-2 rounded-lg flex items-center justify-between transition-colors cursor-pointer ${
              activeSection === 'all'
                ? 'bg-blue-500/15 text-blue-500 font-semibold border border-blue-500/30'
                : 'text-[var(--vscode-text-secondary)] hover:bg-[var(--vscode-hover)] hover:text-[var(--vscode-text-primary)]'
            }`}
          >
            <div className="flex items-center gap-2">
              <Settings className="w-3.5 h-3.5" />
              <span>All Settings</span>
            </div>
            <span className="text-[10px] opacity-70">12</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection('api_keys')}
            className={`w-full text-left px-3 py-2 rounded-lg flex items-center justify-between transition-colors cursor-pointer ${
              activeSection === 'api_keys'
                ? 'bg-blue-500/15 text-blue-500 font-semibold border border-blue-500/30'
                : 'text-[var(--vscode-text-secondary)] hover:bg-[var(--vscode-hover)] hover:text-[var(--vscode-text-primary)]'
            }`}
          >
            <div className="flex items-center gap-2">
              <Key className="w-3.5 h-3.5 text-amber-500" />
              <span>Model API Keys</span>
            </div>
            <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-500 border border-amber-500/30 font-mono">
              4 Keys
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection('framework_defaults')}
            className={`w-full text-left px-3 py-2 rounded-lg flex items-center justify-between transition-colors cursor-pointer ${
              activeSection === 'framework_defaults'
                ? 'bg-blue-500/15 text-blue-500 font-semibold border border-blue-500/30'
                : 'text-[var(--vscode-text-secondary)] hover:bg-[var(--vscode-hover)] hover:text-[var(--vscode-text-primary)]'
            }`}
          >
            <div className="flex items-center gap-2">
              <Code2 className="w-3.5 h-3.5 text-blue-500" />
              <span>Framework & Code Gen</span>
            </div>
            <span className="text-[9px] text-[var(--vscode-text-muted)] font-mono">ADK / LangGraph</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection('agent_defaults')}
            className={`w-full text-left px-3 py-2 rounded-lg flex items-center justify-between transition-colors cursor-pointer ${
              activeSection === 'agent_defaults'
                ? 'bg-blue-500/15 text-blue-500 font-semibold border border-blue-500/30'
                : 'text-[var(--vscode-text-secondary)] hover:bg-[var(--vscode-hover)] hover:text-[var(--vscode-text-primary)]'
            }`}
          >
            <div className="flex items-center gap-2">
              <Bot className="w-3.5 h-3.5 text-emerald-500" />
              <span>Agent Node Defaults</span>
            </div>
            <span className="text-[9px] text-[var(--vscode-text-muted)] font-mono">Model / Temp</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection('cloud_defaults')}
            className={`w-full text-left px-3 py-2 rounded-lg flex items-center justify-between transition-colors cursor-pointer ${
              activeSection === 'cloud_defaults'
                ? 'bg-blue-500/15 text-blue-500 font-semibold border border-blue-500/30'
                : 'text-[var(--vscode-text-secondary)] hover:bg-[var(--vscode-hover)] hover:text-[var(--vscode-text-primary)]'
            }`}
          >
            <div className="flex items-center gap-2">
              <Cloud className="w-3.5 h-3.5 text-sky-500" />
              <span>GCP & Deployment</span>
            </div>
            <span className="text-[9px] text-[var(--vscode-text-muted)] font-mono">Cloud Run</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection('editor_defaults')}
            className={`w-full text-left px-3 py-2 rounded-lg flex items-center justify-between transition-colors cursor-pointer ${
              activeSection === 'editor_defaults'
                ? 'bg-blue-500/15 text-blue-500 font-semibold border border-blue-500/30'
                : 'text-[var(--vscode-text-secondary)] hover:bg-[var(--vscode-hover)] hover:text-[var(--vscode-text-primary)]'
            }`}
          >
            <div className="flex items-center gap-2">
              <LayoutGrid className="w-3.5 h-3.5 text-purple-500" />
              <span>Canvas & Editor</span>
            </div>
            <span className="text-[9px] text-[var(--vscode-text-muted)] font-mono">Layout</span>
          </button>

          <div className="border-t border-[var(--vscode-border)] pt-2 mt-2">
            <button
              type="button"
              onClick={() => setActiveSection('json_view')}
              className={`w-full text-left px-3 py-2 rounded-lg flex items-center justify-between transition-colors cursor-pointer ${
                activeSection === 'json_view'
                  ? 'bg-blue-500/15 text-blue-500 font-semibold border border-blue-500/30'
                  : 'text-[var(--vscode-text-secondary)] hover:bg-[var(--vscode-hover)] hover:text-[var(--vscode-text-primary)]'
              }`}
            >
              <div className="flex items-center gap-2">
                <FileCode className="w-3.5 h-3.5 text-amber-400" />
                <span>Raw settings.json</span>
              </div>
              <span className="text-[9px] font-mono opacity-70">JSON</span>
            </button>
          </div>

          {/* Quick return button */}
          <div className="pt-4">
            <button
              type="button"
              onClick={openFlow}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-md transition-colors cursor-pointer"
            >
              <Bot className="w-3.5 h-3.5" />
              <span>Back to Agent Canvas</span>
            </button>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8 max-w-4xl">
          {/* TOAST SAVED NOTIFICATION */}
          {savedToast && (
            <div className="fixed bottom-10 right-10 bg-emerald-950/90 border border-emerald-500/50 text-emerald-300 text-xs px-3.5 py-2 rounded-lg shadow-xl flex items-center gap-2 z-50 animate-in fade-in duration-150">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Settings automatically saved to VS Code storage</span>
            </div>
          )}

          {/* RAW JSON VIEW */}
          {activeSection === 'json_view' ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-[var(--vscode-border)] pb-3">
                <div>
                  <h2 className="text-base font-bold text-[var(--vscode-text-primary)] flex items-center gap-2">
                    <FileCode className="w-5 h-5 text-blue-500" />
                    <span>User settings.json (Agent Flow Extension)</span>
                  </h2>
                  <p className="text-xs text-[var(--vscode-text-secondary)] mt-0.5">
                    Configurations stored in VS Code workspace configuration.
                  </p>
                </div>

                <button
                  onClick={handleCopyJson}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                >
                  {copiedJson ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedJson ? 'Copied!' : 'Copy JSON'}</span>
                </button>
              </div>

              <div className="p-4 rounded-xl bg-[var(--vscode-canvas-bg)] border border-[var(--vscode-border)] font-mono text-xs text-[var(--vscode-text-primary)] overflow-x-auto shadow-inner">
                <pre>{exportSettingsJson(geminiApiKeySet)}</pre>
              </div>
            </div>
          ) : (
            <>
              {/* SECTION 1: MODEL API KEYS */}
              {(activeSection === 'all' || activeSection === 'api_keys') && isFiltered('model api keys gemini claude openai grok credentials', ['api', 'key', 'auth', 'secret']) && (
                <div className="space-y-4">
                  <div className="border-b border-[var(--vscode-border)] pb-2 flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-bold text-[var(--vscode-text-primary)] uppercase tracking-wider flex items-center gap-2">
                        <Key className="w-4 h-4 text-amber-500" />
                        <span>Model API Keys & Credentials</span>
                      </h2>
                      <p className="text-xs text-[var(--vscode-text-secondary)] mt-0.5">
                        API keys are securely stored in VS Code SecretStorage and injected into generated code at runtime.
                      </p>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-500 border border-amber-500/30 font-mono">
                      agentFlow.apiKeys.*
                    </span>
                  </div>

                  <div className="space-y-4">
                    {/* Gemini API Key */}
                    <div className="p-4 rounded-xl bg-[var(--vscode-card-bg)] border border-[var(--vscode-border)] space-y-2">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-[var(--vscode-text-primary)]">Gemini API Key</span>
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-400 font-mono border border-blue-500/30">
                              agentFlow.apiKeys.gemini
                            </span>
                          </div>
                          <p className="text-xs text-[var(--vscode-text-secondary)] mt-1">
                            API keys are securely stored in VS Code SecretStorage. <strong className="text-blue-400 font-normal">If not defined, will automatically fall back to Google Cloud application-default credentials (gcloud auth).</strong>
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          {geminiApiKeySet ? (
                            <span className="text-[10px] text-emerald-400 bg-emerald-950/40 border border-emerald-500/30 px-2 py-0.5 rounded-md font-mono flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                              Key Configured
                            </span>
                          ) : (
                            <span className="text-[10px] text-blue-400 bg-blue-950/40 border border-blue-500/30 px-2 py-0.5 rounded-md font-mono flex items-center gap-1">
                              <Sparkles className="w-3 h-3 text-blue-400" />
                              Using gcloud ADC
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="relative flex items-center max-w-xl">
                        <input
                          type={showKeys['gemini'] ? 'text' : 'password'}
                          value={geminiInputValue}
                          onChange={(e) => setGeminiInputValue(e.target.value)}
                          onBlur={() => handleSaveGeminiKey(geminiInputValue)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleSaveGeminiKey(geminiInputValue);
                            }
                          }}
                          placeholder={geminiApiKeySet ? "•••••••• (configured securely in SecretStorage)" : "AIzaSy... (leave blank to use gcloud application-default)"}
                          className="w-full pr-20 pl-3 py-1.5 bg-[var(--vscode-canvas-bg)] border border-[var(--vscode-border)] focus:border-blue-500 rounded-lg text-xs font-mono text-[var(--vscode-text-primary)] focus:outline-none"
                        />
                        <div className="absolute right-2 flex items-center gap-1 text-[var(--vscode-text-muted)]">
                          <button
                            type="button"
                            onClick={() => toggleKeyVisibility('gemini')}
                            className="p-1 hover:text-[var(--vscode-text-primary)] cursor-pointer"
                            title={showKeys['gemini'] ? 'Hide key' : 'Show key'}
                          >
                            {showKeys['gemini'] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Claude API Key */}
                    <div className="p-4 rounded-xl bg-[var(--vscode-card-bg)] border border-[var(--vscode-border)] space-y-2">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-[var(--vscode-text-primary)]">Claude API Key</span>
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-400 font-mono border border-purple-500/30">
                              agentFlow.apiKeys.claude
                            </span>
                          </div>
                          <p className="text-xs text-[var(--vscode-text-secondary)] mt-1">
                            Anthropic API key for Claude 3.7 Sonnet, Claude 3.5 Sonnet, and Claude Opus models.
                          </p>
                        </div>
                        <div className="shrink-0">
                          {settings.claudeApiKey ? (
                            <span className="text-[10px] text-emerald-400 bg-emerald-950/40 border border-emerald-500/30 px-2 py-0.5 rounded-md font-mono flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                              Key Configured
                            </span>
                          ) : (
                            <span className="text-[10px] text-gray-400 bg-[#0d1117] border border-[#30363d] px-2 py-0.5 rounded-md font-mono">
                              Not Set
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="relative flex items-center max-w-xl">
                        <input
                          type={showKeys['claude'] ? 'text' : 'password'}
                          value={settings.claudeApiKey}
                          onChange={(e) => handleUpdate({ claudeApiKey: e.target.value })}
                          placeholder="sk-ant-api03-..."
                          className="w-full pr-10 pl-3 py-1.5 bg-[var(--vscode-canvas-bg)] border border-[var(--vscode-border)] focus:border-blue-500 rounded-lg text-xs font-mono text-[var(--vscode-text-primary)] focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => toggleKeyVisibility('claude')}
                          className="absolute right-2 text-[var(--vscode-text-muted)] hover:text-[var(--vscode-text-primary)] p-1 cursor-pointer"
                        >
                          {showKeys['claude'] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    {/* OpenAI API Key */}
                    <div className="p-4 rounded-xl bg-[var(--vscode-card-bg)] border border-[var(--vscode-border)] space-y-2">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-[var(--vscode-text-primary)]">OpenAI API Key</span>
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 font-mono border border-emerald-500/30">
                              agentFlow.apiKeys.openai
                            </span>
                          </div>
                          <p className="text-xs text-[var(--vscode-text-secondary)] mt-1">
                            OpenAI API key for GPT-4o, o3-mini, and omni models.
                          </p>
                        </div>
                        <div className="shrink-0">
                          {settings.openaiApiKey ? (
                            <span className="text-[10px] text-emerald-400 bg-emerald-950/40 border border-emerald-500/30 px-2 py-0.5 rounded-md font-mono flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                              Key Configured
                            </span>
                          ) : (
                            <span className="text-[10px] text-gray-400 bg-[#0d1117] border border-[#30363d] px-2 py-0.5 rounded-md font-mono">
                              Not Set
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="relative flex items-center max-w-xl">
                        <input
                          type={showKeys['openai'] ? 'text' : 'password'}
                          value={settings.openaiApiKey}
                          onChange={(e) => handleUpdate({ openaiApiKey: e.target.value })}
                          placeholder="sk-proj-..."
                          className="w-full pr-10 pl-3 py-1.5 bg-[var(--vscode-canvas-bg)] border border-[var(--vscode-border)] focus:border-blue-500 rounded-lg text-xs font-mono text-[var(--vscode-text-primary)] focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => toggleKeyVisibility('openai')}
                          className="absolute right-2 text-[var(--vscode-text-muted)] hover:text-[var(--vscode-text-primary)] p-1 cursor-pointer"
                        >
                          {showKeys['openai'] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    {/* Grok API Key */}
                    <div className="p-4 rounded-xl bg-[var(--vscode-card-bg)] border border-[var(--vscode-border)] space-y-2">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-[var(--vscode-text-primary)]">Grok API Key</span>
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-400 font-mono border border-sky-500/30">
                              agentFlow.apiKeys.grok
                            </span>
                          </div>
                          <p className="text-xs text-[var(--vscode-text-secondary)] mt-1">
                            xAI Grok API key for Grok-3 and reasoning agents.
                          </p>
                        </div>
                        <div className="shrink-0">
                          {settings.grokApiKey ? (
                            <span className="text-[10px] text-emerald-400 bg-emerald-950/40 border border-emerald-500/30 px-2 py-0.5 rounded-md font-mono flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                              Key Configured
                            </span>
                          ) : (
                            <span className="text-[10px] text-gray-400 bg-[#0d1117] border border-[#30363d] px-2 py-0.5 rounded-md font-mono">
                              Not Set
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="relative flex items-center max-w-xl">
                        <input
                          type={showKeys['grok'] ? 'text' : 'password'}
                          value={settings.grokApiKey}
                          onChange={(e) => handleUpdate({ grokApiKey: e.target.value })}
                          placeholder="xai-..."
                          className="w-full pr-10 pl-3 py-1.5 bg-[var(--vscode-canvas-bg)] border border-[var(--vscode-border)] focus:border-blue-500 rounded-lg text-xs font-mono text-[var(--vscode-text-primary)] focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => toggleKeyVisibility('grok')}
                          className="absolute right-2 text-[var(--vscode-text-muted)] hover:text-[var(--vscode-text-primary)] p-1 cursor-pointer"
                        >
                          {showKeys['grok'] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* SECTION 2: FRAMEWORK & CODE GENERATION DEFAULTS */}
              {(activeSection === 'all' || activeSection === 'framework_defaults') && isFiltered('framework code generation language output folder docker streaming google adk langgraph', ['codegen', 'framework', 'defaults']) && (
                <div className="space-y-4">
                  <div className="border-b border-[var(--vscode-border)] pb-2 flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-bold text-[var(--vscode-text-primary)] uppercase tracking-wider flex items-center gap-2">
                        <Code2 className="w-4 h-4 text-blue-500" />
                        <span>Default Target Framework & Code Gen</span>
                      </h2>
                      <p className="text-xs text-[var(--vscode-text-secondary)] mt-0.5">
                        Defaults applied when initializing new agent workflows or generating source code.
                      </p>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-500 border border-blue-500/30 font-mono">
                      agentFlow.defaults.*
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Default Target Framework */}
                    <div className="p-4 rounded-xl bg-[var(--vscode-card-bg)] border border-[var(--vscode-border)] space-y-2">
                      <label className="text-xs font-bold text-[var(--vscode-text-primary)] block">
                        Default Framework
                      </label>
                      <p className="text-xs text-[var(--vscode-text-secondary)]">
                        Primary agent orchestration engine for generated workflows.
                      </p>
                      <select
                        value={settings.defaultFramework}
                        onChange={(e) => handleUpdate({ defaultFramework: e.target.value as FrameworkType })}
                        className="w-full px-3 py-1.5 bg-[var(--vscode-canvas-bg)] border border-[var(--vscode-border)] rounded-lg text-xs text-[var(--vscode-text-primary)] focus:outline-none cursor-pointer"
                      >
                        <option value="google_adk">Google ADK (GenAI SDK)</option>
                        <option value="langgraph">LangGraph (StateGraph)</option>
                      </select>
                    </div>

                    {/* Default Target Language */}
                    <div className="p-4 rounded-xl bg-[var(--vscode-card-bg)] border border-[var(--vscode-border)] space-y-2">
                      <label className="text-xs font-bold text-[var(--vscode-text-primary)] block">
                        Default Programming Language
                      </label>
                      <p className="text-xs text-[var(--vscode-text-secondary)]">
                        Target language for exported agent source files.
                      </p>
                      <select
                        value={settings.defaultLanguage}
                        onChange={(e) => handleUpdate({ defaultLanguage: e.target.value as LanguageType })}
                        className="w-full px-3 py-1.5 bg-[var(--vscode-canvas-bg)] border border-[var(--vscode-border)] rounded-lg text-xs text-[var(--vscode-text-primary)] focus:outline-none cursor-pointer"
                      >
                        <option value="python">Python (3.10+)</option>
                        <option value="typescript">TypeScript (Node.js/ESM)</option>
                      </select>
                    </div>

                    {/* Default Output Folder */}
                    <div className="p-4 rounded-xl bg-[var(--vscode-card-bg)] border border-[var(--vscode-border)] space-y-2">
                      <label className="text-xs font-bold text-[var(--vscode-text-primary)] block">
                        Default Output Folder Path
                      </label>
                      <p className="text-xs text-[var(--vscode-text-secondary)]">
                        Relative workspace destination for generated agent files.
                      </p>
                      <div className="relative">
                        <FolderOpen className="w-3.5 h-3.5 text-[var(--vscode-text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={settings.defaultOutputFolder}
                          onChange={(e) => handleUpdate({ defaultOutputFolder: e.target.value })}
                          className="w-full pl-9 pr-3 py-1.5 bg-[var(--vscode-canvas-bg)] border border-[var(--vscode-border)] rounded-lg text-xs font-mono text-[var(--vscode-text-primary)] focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* Default Deployment Target */}
                    <div className="p-4 rounded-xl bg-[var(--vscode-card-bg)] border border-[var(--vscode-border)] space-y-2">
                      <label className="text-xs font-bold text-[var(--vscode-text-primary)] block">
                        Default Deployment Target
                      </label>
                      <p className="text-xs text-[var(--vscode-text-secondary)]">
                        Target runtime infrastructure for one-click deployment.
                      </p>
                      <select
                        value={settings.defaultDeploymentTarget}
                        onChange={(e) => handleUpdate({ defaultDeploymentTarget: e.target.value as any })}
                        className="w-full px-3 py-1.5 bg-[var(--vscode-canvas-bg)] border border-[var(--vscode-border)] rounded-lg text-xs text-[var(--vscode-text-primary)] focus:outline-none cursor-pointer"
                      >
                        <option value="cloud_run">Google Cloud Run (Serverless Container)</option>
                        <option value="agent_engine">Google Agent Engine (Managed)</option>
                        <option value="local">Local FastMCP / Docker CLI</option>
                      </select>
                    </div>
                  </div>

                  {/* Checkbox options */}
                  <div className="p-4 rounded-xl bg-[var(--vscode-card-bg)] border border-[var(--vscode-border)] space-y-3">
                    <div className="text-xs font-bold text-[var(--vscode-text-primary)] uppercase tracking-tight">
                      Code Generation Inclusions
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <label className="flex items-center gap-2 cursor-pointer text-xs text-[var(--vscode-text-secondary)] hover:text-[var(--vscode-text-primary)]">
                        <input
                          type="checkbox"
                          checked={settings.defaultIncludeTests}
                          onChange={(e) => handleUpdate({ defaultIncludeTests: e.target.checked })}
                          className="accent-blue-500 rounded"
                        />
                        <span>Generate pytest / Jest test suite</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer text-xs text-[var(--vscode-text-secondary)] hover:text-[var(--vscode-text-primary)]">
                        <input
                          type="checkbox"
                          checked={settings.defaultIncludeDocker}
                          onChange={(e) => handleUpdate({ defaultIncludeDocker: e.target.checked })}
                          className="accent-blue-500 rounded"
                        />
                        <span>Include Dockerfile & Compose</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer text-xs text-[var(--vscode-text-secondary)] hover:text-[var(--vscode-text-primary)]">
                        <input
                          type="checkbox"
                          checked={settings.defaultUseStreaming}
                          onChange={(e) => handleUpdate({ defaultUseStreaming: e.target.checked })}
                          className="accent-blue-500 rounded"
                        />
                        <span>Enable Server-Sent Events (Streaming)</span>
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* SECTION 3: AGENT NODE DEFAULTS */}
              {(activeSection === 'all' || activeSection === 'agent_defaults') && isFiltered('agent node defaults model temperature memory checkpointer delegation pattern iterations', ['model', 'temperature', 'memory']) && (
                <div className="space-y-4">
                  <div className="border-b border-[var(--vscode-border)] pb-2 flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-bold text-[var(--vscode-text-primary)] uppercase tracking-wider flex items-center gap-2">
                        <Bot className="w-4 h-4 text-emerald-500" />
                        <span>Default Agent Node Properties</span>
                      </h2>
                      <p className="text-xs text-[var(--vscode-text-secondary)] mt-0.5">
                        Default parameters assigned when dropping or creating new Agent nodes on the canvas.
                      </p>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 font-mono">
                      agentFlow.nodeDefaults.*
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Default Model */}
                    <div className="p-4 rounded-xl bg-[var(--vscode-card-bg)] border border-[var(--vscode-border)] space-y-2">
                      <label className="text-xs font-bold text-[var(--vscode-text-primary)] flex items-center gap-1.5">
                        <Cpu className="w-3.5 h-3.5 text-blue-400" />
                        Default Underlying LLM Engine
                      </label>
                      <p className="text-xs text-[var(--vscode-text-secondary)]">
                        Default foundation model assigned to newly spawned agents.
                      </p>
                      <select
                        value={settings.defaultModel}
                        onChange={(e) => handleUpdate({ defaultModel: e.target.value })}
                        className="w-full px-3 py-1.5 bg-[var(--vscode-canvas-bg)] border border-[var(--vscode-border)] rounded-lg text-xs text-[var(--vscode-text-primary)] focus:outline-none cursor-pointer"
                      >
                        {SUPPORTED_MODELS.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name} ({m.provider})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Default Temperature */}
                    <div className="p-4 rounded-xl bg-[var(--vscode-card-bg)] border border-[var(--vscode-border)] space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-[var(--vscode-text-primary)] flex items-center gap-1.5">
                          <Sliders className="w-3.5 h-3.5 text-emerald-400" />
                          Default Temperature / Creativity
                        </label>
                        <span className="font-mono text-xs text-emerald-400 font-bold">
                          {settings.defaultTemperature}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--vscode-text-secondary)]">
                        Controls determinism (0.0) vs creative exploration (1.0).
                      </p>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={settings.defaultTemperature}
                        onChange={(e) => handleUpdate({ defaultTemperature: parseFloat(e.target.value) })}
                        className="w-full accent-emerald-500 cursor-pointer"
                      />
                      <div className="flex justify-between text-[9px] text-[var(--vscode-text-muted)] font-mono">
                        <span>Deterministic (0.0)</span>
                        <span>Creative (1.0)</span>
                      </div>
                    </div>

                    {/* Default Memory Checkpointer */}
                    <div className="p-4 rounded-xl bg-[var(--vscode-card-bg)] border border-[var(--vscode-border)] space-y-2">
                      <label className="text-xs font-bold text-[var(--vscode-text-primary)] flex items-center gap-1.5">
                        <Database className="w-3.5 h-3.5 text-amber-400" />
                        Default Memory / State Checkpointer
                      </label>
                      <p className="text-xs text-[var(--vscode-text-secondary)]">
                        Default memory persistence backend for multi-turn threads.
                      </p>
                      <select
                        value={settings.defaultMemoryType}
                        onChange={(e) => handleUpdate({ defaultMemoryType: e.target.value as AgentMemoryType })}
                        className="w-full px-3 py-1.5 bg-[var(--vscode-canvas-bg)] border border-[var(--vscode-border)] rounded-lg text-xs text-[var(--vscode-text-primary)] focus:outline-none cursor-pointer"
                      >
                        {MEMORY_CHOICES.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Default Sub-Agent Pattern */}
                    <div className="p-4 rounded-xl bg-[var(--vscode-card-bg)] border border-[var(--vscode-border)] space-y-2">
                      <label className="text-xs font-bold text-[var(--vscode-text-primary)] flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-purple-400" />
                        Default Sub-Agent Pattern
                      </label>
                      <p className="text-xs text-[var(--vscode-text-secondary)]">
                        Default orchestration topology when creating composite agents.
                      </p>
                      <select
                        value={settings.defaultSubAgentPattern}
                        onChange={(e) => handleUpdate({ defaultSubAgentPattern: e.target.value as DelegationPattern })}
                        className="w-full px-3 py-1.5 bg-[var(--vscode-canvas-bg)] border border-[var(--vscode-border)] rounded-lg text-xs text-[var(--vscode-text-primary)] focus:outline-none cursor-pointer"
                      >
                        {PATTERN_CHOICES.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* SECTION 4: GCP & CLOUD DEFAULTS */}
              {(activeSection === 'all' || activeSection === 'cloud_defaults') && isFiltered('gcp google cloud project id region deployment cloud run', ['gcp', 'cloud', 'deployment']) && (
                <div className="space-y-4">
                  <div className="border-b border-[var(--vscode-border)] pb-2 flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-bold text-[var(--vscode-text-primary)] uppercase tracking-wider flex items-center gap-2">
                        <Cloud className="w-4 h-4 text-sky-500" />
                        <span>Google Cloud Platform Defaults</span>
                      </h2>
                      <p className="text-xs text-[var(--vscode-text-secondary)] mt-0.5">
                        Default project and compute zone for Cloud Run and Vertex AI deployments.
                      </p>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-500 border border-sky-500/30 font-mono">
                      agentFlow.gcp.*
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl bg-[var(--vscode-card-bg)] border border-[var(--vscode-border)] space-y-2">
                      <label className="text-xs font-bold text-[var(--vscode-text-primary)] block">
                        Default GCP Project ID
                      </label>
                      <p className="text-xs text-[var(--vscode-text-secondary)]">
                        Target Google Cloud project for automated provisioning.
                      </p>
                      <input
                        type="text"
                        value={settings.defaultGcpProject}
                        onChange={(e) => handleUpdate({ defaultGcpProject: e.target.value })}
                        placeholder="my-gcp-ai-agents"
                        className="w-full px-3 py-1.5 bg-[var(--vscode-canvas-bg)] border border-[var(--vscode-border)] rounded-lg text-xs font-mono text-[var(--vscode-text-primary)] focus:outline-none"
                      />
                    </div>

                    <div className="p-4 rounded-xl bg-[var(--vscode-card-bg)] border border-[var(--vscode-border)] space-y-2">
                      <label className="text-xs font-bold text-[var(--vscode-text-primary)] block">
                        Default GCP Compute Region
                      </label>
                      <p className="text-xs text-[var(--vscode-text-secondary)]">
                        Primary region for Cloud Run and low-latency API hosting.
                      </p>
                      <select
                        value={settings.defaultGcpRegion}
                        onChange={(e) => handleUpdate({ defaultGcpRegion: e.target.value })}
                        className="w-full px-3 py-1.5 bg-[var(--vscode-canvas-bg)] border border-[var(--vscode-border)] rounded-lg text-xs text-[var(--vscode-text-primary)] focus:outline-none cursor-pointer"
                      >
                        <option value="global">global (Vertex AI Global Endpoint)</option>
                        <option value="us-central1">us-central1 (Iowa)</option>
                        <option value="us-east1">us-east1 (South Carolina)</option>
                        <option value="us-west1">us-west1 (Oregon)</option>
                        <option value="europe-west1">europe-west1 (Belgium)</option>
                        <option value="asia-northeast1">asia-northeast1 (Tokyo)</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* SECTION 5: CANVAS & EDITOR PREFERENCES */}
              {(activeSection === 'all' || activeSection === 'editor_defaults') && isFiltered('canvas editor auto layout direction minimap grid snapping', ['canvas', 'editor', 'layout']) && (
                <div className="space-y-4">
                  <div className="border-b border-[var(--vscode-border)] pb-2 flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-bold text-[var(--vscode-text-primary)] uppercase tracking-wider flex items-center gap-2">
                        <LayoutGrid className="w-4 h-4 text-purple-500" />
                        <span>Canvas & Editor Preferences</span>
                      </h2>
                      <p className="text-xs text-[var(--vscode-text-secondary)] mt-0.5">
                        Visual Studio Code React Flow visual designer settings.
                      </p>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-500 border border-purple-500/30 font-mono">
                      agentFlow.editor.*
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 rounded-xl bg-[var(--vscode-card-bg)] border border-[var(--vscode-border)] space-y-2">
                      <label className="text-xs font-bold text-[var(--vscode-text-primary)] block">
                        Auto-Layout Direction
                      </label>
                      <p className="text-xs text-[var(--vscode-text-secondary)]">
                        Dagre hierarchical graph orientation.
                      </p>
                      <select
                        value={settings.autoLayoutDirection}
                        onChange={(e) => handleUpdate({ autoLayoutDirection: e.target.value as 'TB' | 'LR' })}
                        className="w-full px-3 py-1.5 bg-[var(--vscode-canvas-bg)] border border-[var(--vscode-border)] rounded-lg text-xs text-[var(--vscode-text-primary)] focus:outline-none cursor-pointer"
                      >
                        <option value="TB">Top to Bottom (Vertical Pipeline)</option>
                        <option value="LR">Left to Right (Horizontal Flow)</option>
                      </select>
                    </div>

                    <div className="p-4 rounded-xl bg-[var(--vscode-card-bg)] border border-[var(--vscode-border)] space-y-2">
                      <label className="text-xs font-bold text-[var(--vscode-text-primary)] block">
                        MiniMap Navigation Box
                      </label>
                      <p className="text-xs text-[var(--vscode-text-secondary)]">
                        Display overview radar in the top-right corner.
                      </p>
                      <label className="flex items-center gap-2 cursor-pointer text-xs text-[var(--vscode-text-primary)] pt-1">
                        <input
                          type="checkbox"
                          checked={settings.showMiniMap}
                          onChange={(e) => handleUpdate({ showMiniMap: e.target.checked })}
                          className="accent-purple-500 rounded"
                        />
                        <span>Enable canvas MiniMap</span>
                      </label>
                    </div>

                    <div className="p-4 rounded-xl bg-[var(--vscode-card-bg)] border border-[var(--vscode-border)] space-y-2">
                      <label className="text-xs font-bold text-[var(--vscode-text-primary)] block">
                        Grid Snapping
                      </label>
                      <p className="text-xs text-[var(--vscode-text-secondary)]">
                        Snap nodes to dot grid while dragging.
                      </p>
                      <label className="flex items-center gap-2 cursor-pointer text-xs text-[var(--vscode-text-primary)] pt-1">
                        <input
                          type="checkbox"
                          checked={settings.snapToGrid}
                          onChange={(e) => handleUpdate({ snapToGrid: e.target.checked })}
                          className="accent-purple-500 rounded"
                        />
                        <span>Snap nodes to 15px grid</span>
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
