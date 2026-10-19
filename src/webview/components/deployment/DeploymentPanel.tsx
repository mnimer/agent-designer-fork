/**
 * DeploymentPanel
 *
 * Webview component providing configuration controls for:
 * 1. Google Kubernetes Engine (GKE Autopilot) deployment target (TASK-237).
 * 2. Multi-language target selection supporting Go and Java ADK SDKs (TASK-238).
 * 3. ADK Runner-Level Plugins (`google.adk.plugins`) configuration and code generation (TASK-240).
 *
 * Architectural Decisions:
 * 1. Strict DRY & Zero Magic Constants: Standard catalogs for plugins and multi-language SDKs.
 * 2. Visual & Structural Consistency: Adheres to the 8pt grid system (p-2, p-4, gap-2, gap-4) and Tailwind CSS dark theme.
 * 3. Pure Code Synthesis: Generates idiomatic Python code for Runner plugins without procedural hacks.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import React, { useState } from 'react';
import {
  Server,
  Layers,
  Code2,
  Sliders,
  CheckCircle2,
  Copy,
  Check,
  Plus,
  Trash2,
  Cpu,
  Database,
  ShieldCheck,
  Sparkles,
  HelpCircle,
  FolderGit2,
} from 'lucide-react';
import {
  AdkBuiltinPluginType,
  AdkRunnerPluginConfig,
  DeploymentConfig,
  LanguageTarget,
} from '../../../shared/agentSpec';

// ============================================================================
// 1. ADK Runner Plugin Catalog & Code Generator (TASK-240)
// ============================================================================

export interface AdkRunnerPluginCatalogItem {
  id: AdkBuiltinPluginType;
  name: string;
  className: string;
  description: string;
  defaultConfig: Partial<AdkRunnerPluginConfig>;
}

export const ADK_RUNNER_PLUGIN_CATALOG: AdkRunnerPluginCatalogItem[] = [
  {
    id: 'reflect_and_retry_tool',
    name: 'Reflect & Retry Tool Plugin',
    className: 'ReflectAndRetryToolPlugin',
    description: 'Intercepts tool execution failures and prompts the model to reflect and retry automatically.',
    defaultConfig: {
      pluginType: 'reflect_and_retry_tool',
      name: 'Reflect & Retry Tool',
      enabled: true,
      maxRetries: 3,
    },
  },
  {
    id: 'bigquery_agent_analytics',
    name: 'BigQuery Agent Analytics Plugin',
    className: 'BigQueryAgentAnalyticsPlugin',
    description: 'Streams operational agent turn, tool, and latency telemetry directly into BigQuery.',
    defaultConfig: {
      pluginType: 'bigquery_agent_analytics',
      name: 'BigQuery Analytics',
      enabled: true,
      bqProjectId: '',
      bqDatasetId: 'agent_analytics',
      bqTableId: 'telemetry_events',
    },
  },
  {
    id: 'context_filter',
    name: 'Context Filter Plugin',
    className: 'ContextFilterPlugin',
    description: 'Bounds context window payloads sent to the model by pruning historical messages and tokens.',
    defaultConfig: {
      pluginType: 'context_filter',
      name: 'Context Filter',
      enabled: true,
      maxContextMessages: 30,
      maxContextTokens: 8192,
    },
  },
  {
    id: 'save_files_as_artifacts',
    name: 'Save Files as Artifacts Plugin',
    className: 'SaveFilesAsArtifactsPlugin',
    description: 'Automatically persists incoming user file attachments into the configured ArtifactService.',
    defaultConfig: {
      pluginType: 'save_files_as_artifacts',
      name: 'Save Files as Artifacts',
      enabled: true,
    },
  },
  {
    id: 'debug_logging',
    name: 'Debug Logging Plugin',
    className: 'DebugLoggingPlugin',
    description: 'Structured ADK event & tool trace logging for in-depth local troubleshooting.',
    defaultConfig: {
      pluginType: 'debug_logging',
      name: 'Debug Logging',
      enabled: true,
    },
  },
  {
    id: 'custom_plugin',
    name: 'Custom Plugin (BasePlugin)',
    className: 'CustomPlugin',
    description: 'Custom user-defined plugin extending BasePlugin with custom lifecycle hooks.',
    defaultConfig: {
      pluginType: 'custom_plugin',
      name: 'Custom BasePlugin',
      enabled: true,
      customClassName: 'CustomAuditPlugin',
      customModulePath: 'plugins.audit_plugin',
    },
  },
];

/**
 * Generates the Python import statements and plugin instantiation list
 * for passing to Google ADK Runner(..., plugins=[...]) or App(..., plugins=[...]).
 *
 * @param plugins Array of runner plugin configurations
 * @returns Clean, formatted Python source code
 */
export function generateRunnerPluginsPythonCode(plugins: AdkRunnerPluginConfig[] = []): string {
  // Section: Filter enabled plugins
  const activePlugins = plugins.filter((p) => p.enabled !== false);
  if (activePlugins.length === 0) {
    return '# No runner plugins configured\nrunner_plugins = []\n';
  }

  const builtinImports = new Set<string>();
  const customImports: string[] = [];
  const pluginInstantiations: string[] = [];

  // Section: Process each plugin into imports and constructors
  for (const plugin of activePlugins) {
    switch (plugin.pluginType) {
      case 'reflect_and_retry_tool': {
        builtinImports.add('ReflectAndRetryToolPlugin');
        const maxRetries = plugin.maxRetries ?? 3;
        pluginInstantiations.push(`    ReflectAndRetryToolPlugin(max_retries=${maxRetries})`);
        break;
      }
      case 'bigquery_agent_analytics': {
        builtinImports.add('BigQueryAgentAnalyticsPlugin');
        const bqProject = plugin.bqProjectId
          ? `"${plugin.bqProjectId}"`
          : 'os.getenv("GOOGLE_CLOUD_PROJECT", "YOUR_PROJECT_ID")';
        const bqDataset = plugin.bqDatasetId ? `"${plugin.bqDatasetId}"` : '"agent_analytics"';
        const bqTable = plugin.bqTableId ? `"${plugin.bqTableId}"` : '"telemetry_events"';
        pluginInstantiations.push(
          `    BigQueryAgentAnalyticsPlugin(project_id=${bqProject}, dataset_id=${bqDataset}, table_id=${bqTable})`
        );
        break;
      }
      case 'context_filter': {
        builtinImports.add('ContextFilterPlugin');
        const maxMessages = plugin.maxContextMessages ?? 50;
        const maxTokens = plugin.maxContextTokens ?? 8192;
        pluginInstantiations.push(`    ContextFilterPlugin(max_messages=${maxMessages}, max_tokens=${maxTokens})`);
        break;
      }
      case 'save_files_as_artifacts': {
        builtinImports.add('SaveFilesAsArtifactsPlugin');
        pluginInstantiations.push(`    SaveFilesAsArtifactsPlugin()`);
        break;
      }
      case 'debug_logging': {
        builtinImports.add('DebugLoggingPlugin');
        pluginInstantiations.push(`    DebugLoggingPlugin()`);
        break;
      }
      case 'custom_plugin': {
        const className = plugin.customClassName || 'CustomPlugin';
        const modulePath = plugin.customModulePath || 'custom_plugins';
        customImports.push(`from ${modulePath} import ${className}`);
        pluginInstantiations.push(`    ${className}()`);
        break;
      }
      default:
        break;
    }
  }

  // Section: Assemble code blocks
  const lines: string[] = [];
  if (builtinImports.size > 0) {
    const sortedImports = Array.from(builtinImports).sort().join(', ');
    lines.push(`from google.adk.plugins import ${sortedImports}`);
  }
  for (const cImport of customImports) {
    lines.push(cImport);
  }
  lines.push('');
  lines.push('runner_plugins = [');
  lines.push(pluginInstantiations.join(',\n'));
  lines.push(']');
  lines.push('');

  return lines.join('\n');
}

// ============================================================================
// 2. React Components
// ============================================================================

export interface MultiLanguageSelectorCardProps {
  selectedLanguage: LanguageTarget;
  onLanguageChange: (lang: LanguageTarget) => void;
}

/**
 * Multi-Language Target Selector Card (TASK-238).
 */
export const MultiLanguageSelectorCard: React.FC<MultiLanguageSelectorCardProps> = ({
  selectedLanguage,
  onLanguageChange,
}) => {
  const languageOptions: Array<{
    id: LanguageTarget;
    label: string;
    sdkBadge: string;
    description: string;
  }> = [
    {
      id: 'python',
      label: 'Python',
      sdkBadge: 'Google ADK Python',
      description: 'Official Python SDK for Vertex AI Agent Runtime, Cloud Run, and GKE.',
    },
    {
      id: 'go',
      label: 'Go',
      sdkBadge: 'ADK Go SDK 1.23+',
      description: 'Idiomatic Go 1.23+ with google.golang.org/adk and native Cloud Run deployment.',
    },
    {
      id: 'java',
      label: 'Java',
      sdkBadge: 'ADK Java SDK 21',
      description: 'Enterprise Java 21 with com.google.adk and Maven container build.',
    },
    {
      id: 'typescript',
      label: 'TypeScript',
      sdkBadge: 'LangGraph / Node.js',
      description: 'Modern TypeScript orchestration with full type safety.',
    },
  ];

  return (
    <div className="p-4 bg-[#161b22] border border-[#30363d] rounded-xl shadow-md space-y-3">
      <div className="flex items-center justify-between border-b border-[#30363d] pb-2">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-white">
          <Code2 className="w-4 h-4 text-blue-400" />
          <span>Programming Language Target</span>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded bg-[#0d1117] text-blue-400 font-mono border border-[#30363d]">
          ADK Multi-Language
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {languageOptions.map((opt) => {
          const isSelected = selectedLanguage === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onLanguageChange(opt.id)}
              className={`p-3 rounded-lg border text-left transition-all cursor-pointer flex flex-col justify-between ${
                isSelected
                  ? 'bg-blue-950/40 border-blue-500 text-white shadow-sm'
                  : 'bg-[#0d1117] border-[#30363d] text-gray-300 hover:border-gray-500'
              }`}
            >
              <div className="flex items-center justify-between gap-1 mb-1">
                <span className="text-xs font-bold text-white">{opt.label}</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#21262d] text-blue-300 font-mono">
                  {opt.sdkBadge}
                </span>
              </div>
              <p className="text-[10px] text-gray-400 leading-tight">{opt.description}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export interface GkeDeploymentConfigCardProps {
  clusterName: string;
  onClusterNameChange: (val: string) => void;
  location: string;
  onLocationChange: (val: string) => void;
  namespace: string;
  onNamespaceChange: (val: string) => void;
  replicas: number;
  onReplicasChange: (val: number) => void;
  enableWorkloadIdentity: boolean;
  onWorkloadIdentityToggle: (val: boolean) => void;
  projectId: string;
}

/**
 * GKE Autopilot Deployment Configuration Card (TASK-237).
 */
export const GkeDeploymentConfigCard: React.FC<GkeDeploymentConfigCardProps> = ({
  clusterName,
  onClusterNameChange,
  location,
  onLocationChange,
  namespace,
  onNamespaceChange,
  replicas,
  onReplicasChange,
  enableWorkloadIdentity,
  onWorkloadIdentityToggle,
  projectId,
}) => {
  const [copied, setCopied] = useState(false);
  const deployCmd = `adk deploy gke --project=${projectId || 'YOUR_PROJECT'} --cluster=${clusterName} --location=${location} --namespace=${namespace}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(deployCmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-4 bg-[#161b22] border border-[#30363d] rounded-xl shadow-md space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#30363d] pb-2">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-white">
          <Server className="w-4 h-4 text-cyan-400" />
          <span>Google Kubernetes Engine (GKE Autopilot)</span>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-950/40 text-cyan-300 font-mono border border-cyan-800/40">
          Autopilot Mode
        </span>
      </div>

      <p className="text-[11px] text-gray-400 leading-tight">
        Deploys your agent microservice into a Google Kubernetes Engine (GKE) Autopilot cluster with automated node provisioning, autoscaling, and Workload Identity Federation.
      </p>

      {/* Inputs Form */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] text-gray-300 font-medium block mb-1">Cluster Name</label>
          <input
            type="text"
            value={clusterName}
            onChange={(e) => onClusterNameChange(e.target.value)}
            placeholder="agent-autopilot-cluster"
            className="w-full bg-[#0d1117] border border-[#30363d] text-xs text-white rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-cyan-500 font-mono"
          />
        </div>

        <div>
          <label className="text-[11px] text-gray-300 font-medium block mb-1">GCP Location</label>
          <select
            value={location}
            onChange={(e) => onLocationChange(e.target.value)}
            className="w-full bg-[#0d1117] border border-[#30363d] text-xs text-white rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-cyan-500 cursor-pointer"
          >
            <option value="us-central1">us-central1 (Iowa)</option>
            <option value="us-east4">us-east4 (N. Virginia)</option>
            <option value="europe-west4">europe-west4 (Eemshaven)</option>
            <option value="asia-northeast1">asia-northeast1 (Tokyo)</option>
          </select>
        </div>

        <div>
          <label className="text-[11px] text-gray-300 font-medium block mb-1">Kubernetes Namespace</label>
          <input
            type="text"
            value={namespace}
            onChange={(e) => onNamespaceChange(e.target.value)}
            placeholder="default"
            className="w-full bg-[#0d1117] border border-[#30363d] text-xs text-white rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-cyan-500 font-mono"
          />
        </div>

        <div>
          <label className="text-[11px] text-gray-300 font-medium block mb-1">Pod Replicas</label>
          <input
            type="number"
            min={1}
            max={20}
            value={replicas}
            onChange={(e) => onReplicasChange(parseInt(e.target.value, 10) || 1)}
            className="w-full bg-[#0d1117] border border-[#30363d] text-xs text-white rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-cyan-500 font-mono"
          />
        </div>
      </div>

      {/* Workload Identity Checkbox */}
      <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-[#0d1117] border border-[#30363d] cursor-pointer select-none">
        <input
          type="checkbox"
          checked={enableWorkloadIdentity}
          onChange={(e) => onWorkloadIdentityToggle(e.target.checked)}
          className="mt-0.5 rounded border-[#30363d] bg-[#161b22] text-cyan-500 focus:ring-0 cursor-pointer"
        />
        <div className="text-[11px] text-gray-300">
          <span className="font-semibold text-white block">Enable Workload Identity Federation</span>
          <span className="text-[10px] text-gray-400 block leading-tight">
            Binds Kubernetes Service Account (KSA) to Google Cloud Service Account (GSA) with least-privilege IAM roles (roles/iam.workloadIdentityUser). Eliminates stored service account keys.
          </span>
        </div>
      </label>

      {/* CLI Command Snippet */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[10px] text-gray-400">
          <span>Deployment CLI Command</span>
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
        <div className="p-2 rounded bg-[#0d1117] border border-[#30363d] text-[11px] font-mono text-cyan-300 overflow-x-auto">
          {deployCmd}
        </div>
      </div>
    </div>
  );
};

export interface AdkRunnerPluginsPanelProps {
  plugins: AdkRunnerPluginConfig[];
  onPluginsChange: (plugins: AdkRunnerPluginConfig[]) => void;
}

/**
 * ADK Runner-Level Plugins Configuration Panel (TASK-240).
 */
export const AdkRunnerPluginsPanel: React.FC<AdkRunnerPluginsPanelProps> = ({
  plugins,
  onPluginsChange,
}) => {
  const [showCodePreview, setShowCodePreview] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Section: Helper to toggle plugin enabled state
  const handleTogglePlugin = (pluginId: string) => {
    const updated = plugins.map((p) =>
      p.id === pluginId ? { ...p, enabled: !p.enabled } : p
    );
    onPluginsChange(updated);
  };

  // Section: Helper to update plugin field
  const handleUpdatePluginField = (pluginId: string, updates: Partial<AdkRunnerPluginConfig>) => {
    const updated = plugins.map((p) =>
      p.id === pluginId ? { ...p, ...updates } : p
    );
    onPluginsChange(updated);
  };

  // Section: Helper to add a plugin from catalog if not already present
  const handleAddPlugin = (catalogItem: AdkRunnerPluginCatalogItem) => {
    if (plugins.some((p) => p.pluginType === catalogItem.id)) {
      return;
    }
    const newPlugin: AdkRunnerPluginConfig = {
      id: `plugin-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      pluginType: catalogItem.id,
      name: catalogItem.name,
      enabled: true,
      ...catalogItem.defaultConfig,
    };
    onPluginsChange([...plugins, newPlugin]);
  };

  // Section: Helper to remove plugin
  const handleRemovePlugin = (pluginId: string) => {
    onPluginsChange(plugins.filter((p) => p.id !== pluginId));
  };

  const generatedPythonCode = generateRunnerPluginsPythonCode(plugins);

  return (
    <div className="p-4 bg-[#161b22] border border-[#30363d] rounded-xl shadow-md space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#30363d] pb-2">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-white">
          <Layers className="w-4 h-4 text-emerald-400" />
          <span>ADK Runner Plugins ({plugins.length})</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowCodePreview(!showCodePreview)}
            className="text-[10px] px-2 py-0.5 rounded bg-[#0d1117] text-emerald-400 border border-[#30363d] hover:border-emerald-500 cursor-pointer transition-colors"
          >
            {showCodePreview ? 'Hide Python Code' : 'View Python Code'}
          </button>
        </div>
      </div>

      <p className="text-[11px] text-gray-400 leading-tight">
        Runner-level plugins intercept execution lifecycles to provide automatic error reflection, BigQuery telemetry streaming, and context compaction.
      </p>

      {/* Code Preview Drawer */}
      {showCodePreview && (
        <div className="p-3 bg-[#0d1117] rounded-lg border border-[#30363d] space-y-2">
          <div className="flex items-center justify-between text-[10px] text-gray-400">
            <span className="font-mono text-emerald-400">Python Initialization Code</span>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(generatedPythonCode);
                setCopiedCode(true);
                setTimeout(() => setCopiedCode(false), 2000);
              }}
              className="flex items-center gap-1 text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer"
            >
              {copiedCode ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              <span>{copiedCode ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
          <pre className="text-[11px] font-mono text-gray-300 overflow-x-auto p-2 bg-[#161b22] rounded border border-[#30363d]">
            {generatedPythonCode}
          </pre>
        </div>
      )}

      {/* Configured Plugins List */}
      <div className="space-y-2.5">
        {plugins.map((plugin) => {
          const catalogItem = ADK_RUNNER_PLUGIN_CATALOG.find((c) => c.id === plugin.pluginType);
          return (
            <div
              key={plugin.id}
              className={`p-3 rounded-lg border transition-all ${
                plugin.enabled
                  ? 'bg-[#0d1117] border-[#30363d]'
                  : 'bg-[#161b22]/50 border-[#30363d]/50 opacity-60'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={plugin.enabled}
                    onChange={() => handleTogglePlugin(plugin.id)}
                    className="rounded border-[#30363d] bg-[#161b22] text-emerald-500 focus:ring-0 cursor-pointer"
                  />
                  <span className="text-xs font-bold text-white">
                    {plugin.name || catalogItem?.name || plugin.pluginType}
                  </span>
                </label>
                <button
                  type="button"
                  onClick={() => handleRemovePlugin(plugin.id)}
                  title="Remove Plugin"
                  className="p-1 text-gray-400 hover:text-red-400 cursor-pointer transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <p className="text-[10px] text-gray-400 mb-2 leading-tight">
                {catalogItem?.description}
              </p>

              {/* Plugin-specific configuration fields */}
              {plugin.pluginType === 'reflect_and_retry_tool' && (
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[#30363d]/50">
                  <div>
                    <label className="text-[10px] text-gray-400 block mb-0.5">Max Retries</label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={plugin.maxRetries ?? 3}
                      onChange={(e) =>
                        handleUpdatePluginField(plugin.id, {
                          maxRetries: parseInt(e.target.value, 10) || 3,
                        })
                      }
                      className="w-full bg-[#161b22] border border-[#30363d] text-xs text-white rounded px-2 py-1 font-mono"
                    />
                  </div>
                </div>
              )}

              {plugin.pluginType === 'bigquery_agent_analytics' && (
                <div className="grid grid-cols-3 gap-2 pt-1 border-t border-[#30363d]/50">
                  <div>
                    <label className="text-[10px] text-gray-400 block mb-0.5">GCP Project ID</label>
                    <input
                      type="text"
                      placeholder="Default project"
                      value={plugin.bqProjectId ?? ''}
                      onChange={(e) =>
                        handleUpdatePluginField(plugin.id, { bqProjectId: e.target.value })
                      }
                      className="w-full bg-[#161b22] border border-[#30363d] text-xs text-white rounded px-2 py-1 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 block mb-0.5">Dataset ID</label>
                    <input
                      type="text"
                      placeholder="agent_analytics"
                      value={plugin.bqDatasetId ?? ''}
                      onChange={(e) =>
                        handleUpdatePluginField(plugin.id, { bqDatasetId: e.target.value })
                      }
                      className="w-full bg-[#161b22] border border-[#30363d] text-xs text-white rounded px-2 py-1 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 block mb-0.5">Table ID</label>
                    <input
                      type="text"
                      placeholder="telemetry_events"
                      value={plugin.bqTableId ?? ''}
                      onChange={(e) =>
                        handleUpdatePluginField(plugin.id, { bqTableId: e.target.value })
                      }
                      className="w-full bg-[#161b22] border border-[#30363d] text-xs text-white rounded px-2 py-1 font-mono"
                    />
                  </div>
                </div>
              )}

              {plugin.pluginType === 'context_filter' && (
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[#30363d]/50">
                  <div>
                    <label className="text-[10px] text-gray-400 block mb-0.5">Max Messages</label>
                    <input
                      type="number"
                      min={5}
                      max={200}
                      value={plugin.maxContextMessages ?? 30}
                      onChange={(e) =>
                        handleUpdatePluginField(plugin.id, {
                          maxContextMessages: parseInt(e.target.value, 10) || 30,
                        })
                      }
                      className="w-full bg-[#161b22] border border-[#30363d] text-xs text-white rounded px-2 py-1 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 block mb-0.5">Max Tokens</label>
                    <input
                      type="number"
                      min={1024}
                      max={128000}
                      step={1024}
                      value={plugin.maxContextTokens ?? 8192}
                      onChange={(e) =>
                        handleUpdatePluginField(plugin.id, {
                          maxContextTokens: parseInt(e.target.value, 10) || 8192,
                        })
                      }
                      className="w-full bg-[#161b22] border border-[#30363d] text-xs text-white rounded px-2 py-1 font-mono"
                    />
                  </div>
                </div>
              )}

              {plugin.pluginType === 'custom_plugin' && (
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[#30363d]/50">
                  <div>
                    <label className="text-[10px] text-gray-400 block mb-0.5">Class Name</label>
                    <input
                      type="text"
                      placeholder="CustomAuditPlugin"
                      value={plugin.customClassName ?? ''}
                      onChange={(e) =>
                        handleUpdatePluginField(plugin.id, { customClassName: e.target.value })
                      }
                      className="w-full bg-[#161b22] border border-[#30363d] text-xs text-white rounded px-2 py-1 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 block mb-0.5">Module Path</label>
                    <input
                      type="text"
                      placeholder="plugins.audit_plugin"
                      value={plugin.customModulePath ?? ''}
                      onChange={(e) =>
                        handleUpdatePluginField(plugin.id, { customModulePath: e.target.value })
                      }
                      className="w-full bg-[#161b22] border border-[#30363d] text-xs text-white rounded px-2 py-1 font-mono"
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add Plugin Button Dropdown */}
      <div className="pt-2 border-t border-[#30363d] flex items-center gap-2">
        <span className="text-[10px] text-gray-400 uppercase font-bold">Add Plugin:</span>
        <div className="flex flex-wrap gap-1.5">
          {ADK_RUNNER_PLUGIN_CATALOG.filter(
            (c) => !plugins.some((p) => p.pluginType === c.id)
          ).map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => handleAddPlugin(c)}
              className="text-[10px] px-2 py-1 rounded bg-[#0d1117] text-gray-300 border border-[#30363d] hover:border-emerald-500 hover:text-white cursor-pointer transition-colors flex items-center gap-1"
            >
              <Plus className="w-3 h-3 text-emerald-400" />
              <span>{c.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export interface DeploymentPanelProps {
  deploymentConfig: DeploymentConfig;
  onDeploymentConfigChange: (config: DeploymentConfig) => void;
  selectedLanguage: LanguageTarget;
  onLanguageChange: (lang: LanguageTarget) => void;
  projectId: string;
}

/**
 * Top-level DeploymentPanel combining GKE configuration, Multi-Language SDK selector,
 * and ADK Runner Plugins.
 */
export const DeploymentPanel: React.FC<DeploymentPanelProps> = ({
  deploymentConfig,
  onDeploymentConfigChange,
  selectedLanguage,
  onLanguageChange,
  projectId,
}) => {
  return (
    <div className="space-y-4">
      {/* 1. Multi-Language SDK Selector */}
      <MultiLanguageSelectorCard
        selectedLanguage={selectedLanguage}
        onLanguageChange={onLanguageChange}
      />

      {/* 2. GKE Autopilot Target Card (When GKE is active target) */}
      {deploymentConfig.target === 'gke' && (
        <GkeDeploymentConfigCard
          clusterName={deploymentConfig.gkeClusterName || 'agent-autopilot-cluster'}
          onClusterNameChange={(val) =>
            onDeploymentConfigChange({ ...deploymentConfig, gkeClusterName: val })
          }
          location={deploymentConfig.gkeLocation || 'us-central1'}
          onLocationChange={(val) =>
            onDeploymentConfigChange({ ...deploymentConfig, gkeLocation: val })
          }
          namespace={deploymentConfig.gkeNamespace || 'default'}
          onNamespaceChange={(val) =>
            onDeploymentConfigChange({ ...deploymentConfig, gkeNamespace: val })
          }
          replicas={deploymentConfig.gkeReplicas || 2}
          onReplicasChange={(val) =>
            onDeploymentConfigChange({ ...deploymentConfig, gkeReplicas: val })
          }
          enableWorkloadIdentity={deploymentConfig.enableWorkloadIdentity ?? true}
          onWorkloadIdentityToggle={(val) =>
            onDeploymentConfigChange({ ...deploymentConfig, enableWorkloadIdentity: val })
          }
          projectId={projectId}
        />
      )}

      {/* 3. ADK Runner Plugins Configuration */}
      <AdkRunnerPluginsPanel
        plugins={deploymentConfig.plugins || []}
        onPluginsChange={(plugins) =>
          onDeploymentConfigChange({ ...deploymentConfig, plugins })
        }
      />
    </div>
  );
};
