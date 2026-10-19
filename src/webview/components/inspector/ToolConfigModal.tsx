/**
 * ToolConfigModal.tsx - Unified Configuration Modal for Advanced ADK Toolsets
 *
 * Purpose:
 * Renders dedicated inspector forms and Python ADK code previews for all advanced
 * ADK toolsets and control flow tools:
 * 1. ApplicationIntegrationToolset (`application_integration` - TASK-228)
 * 2. VertexAiRagRetrieval Tool (`vertex_ai_rag_retrieval` - TASK-229)
 * 3. BigQueryToolset (`bigquery_toolset` - TASK-230)
 * 4. SpannerToolset (`spanner_toolset` - TASK-231)
 * 5. ComputerUseToolset (`computer_use` - TASK-232)
 * 6. MCP Toolbox for Databases (`toolbox_databases` - TASK-233)
 *
 * Architectural Decisions:
 * 1. 8pt Grid System: All spacing, margins, paddings, and sizing in multiples of 8px.
 * 2. Pure Generation Preview: Live updates of the target Python ADK code configuration.
 * 3. Safety Rails: Defaults BigQuery write mode to `BLOCKED` and Spanner to `readOnly: true`.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import React, { useState, useMemo } from 'react';
import {
  X,
  Check,
  Code,
  Database,
  Radio,
  BarChart3,
  Terminal,
  Shield,
  Copy,
  Layers,
} from 'lucide-react';
import {
  ToolDefinition,
  ApplicationIntegrationConfig,
  VertexAiRagRetrievalConfig,
  BigQueryToolsetConfig,
  BigQueryToolsetWriteMode,
  BigQueryToolsetToolName,
  SpannerToolsetConfig,
  SpannerToolsetToolName,
  ComputerUseConfig,
  ComputerUseEnvironmentType,
  ToolboxDatabaseConfig,
  ToolboxDatabaseKind,
} from '../../types';
import {
  ENTERPRISE_CONNECTOR_PRESETS,
  BIGQUERY_TOOLSET_TOOLS,
  SPANNER_TOOLSET_TOOLS,
  generateApplicationIntegrationPythonCode,
  generateVertexAiRagRetrievalPythonCode,
  generateBigQueryToolsetPythonCode,
  generateSpannerToolsetPythonCode,
  generateComputerUseToolsetPythonCode,
  generateToolboxToolsYaml,
  generateToolboxDatabasePythonCode,
} from '../../data/builtinToolsRegistry';

export interface ToolConfigModalProps {
  tool: ToolDefinition | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedTool: ToolDefinition) => void;
}

export const ToolConfigModal: React.FC<ToolConfigModalProps> = ({
  tool,
  isOpen,
  onClose,
  onSave,
}) => {
  if (!isOpen || !tool) return null;

  const toolType = tool.builtinType;

  // Active view tab: config vs python preview (or yaml preview for toolbox)
  const [activeTab, setActiveTab] = useState<'config' | 'code'>('config');
  const [toolName, setToolName] = useState<string>(tool.name);

  // 1. Application Integration State
  const [appIntConfig, setAppIntConfig] = useState<ApplicationIntegrationConfig>(
    tool.applicationIntegrationConfig || {
      mode: 'connector',
      project: '',
      location: 'global',
      connection: 'salesforce',
      entityOperations: {
        Account: ['GET', 'LIST', 'CREATE'],
      },
      actions: ['execute_soql'],
    }
  );

  // 2. Vertex AI RAG Retrieval State
  const [ragConfig, setRagConfig] = useState<VertexAiRagRetrievalConfig>(
    tool.vertexAiRagRetrievalConfig || {
      ragCorpora: ['projects/MY_PROJECT/locations/global/ragCorpora/MY_CORPUS'],
      similarityTopK: 5,
      vectorDistanceThreshold: 0.5,
      location: 'global',
    }
  );
  const [corporaInput, setCorporaInput] = useState<string>(
    (tool.vertexAiRagRetrievalConfig?.ragCorpora || []).join('\n')
  );

  // 3. BigQuery Toolset State
  const [bqConfig, setBqConfig] = useState<BigQueryToolsetConfig>(
    tool.bigQueryToolsetConfig || {
      projectId: '',
      location: 'US',
      writeMode: 'BLOCKED',
      enabledTools: [...BIGQUERY_TOOLSET_TOOLS],
      maxQueryResultRows: 100,
    }
  );

  // 4. Spanner Toolset State
  const [spannerConfig, setSpannerConfig] = useState<SpannerToolsetConfig>(
    tool.spannerToolsetConfig || {
      projectId: '',
      instanceId: '',
      databaseId: '',
      readOnly: true,
      enabledTools: [...SPANNER_TOOLSET_TOOLS],
    }
  );

  // 5. Computer Use State
  const [cuConfig, setCuConfig] = useState<ComputerUseConfig>(
    tool.computerUseConfig || {
      environment: 'playwright_chromium',
      screenWidth: 1440,
      screenHeight: 900,
      headless: true,
      allowedDomains: [],
      requireConfirmationOnPurchases: true,
    }
  );
  const [domainsInput, setDomainsInput] = useState<string>(
    (tool.computerUseConfig?.allowedDomains || []).join('\n')
  );

  // 6. MCP Toolbox for Databases State
  const [toolboxConfig, setToolboxConfig] = useState<ToolboxDatabaseConfig>(
    tool.toolboxDatabaseConfig || {
      serverUrl: 'http://localhost:5000',
      toolsetName: 'database_tools',
      dbKind: 'alloydb',
    }
  );

  // Code previews computed on the fly
  const generatedCode = useMemo(() => {
    switch (toolType) {
      case 'application_integration':
        return generateApplicationIntegrationPythonCode(appIntConfig);
      case 'vertex_ai_rag_retrieval':
        return generateVertexAiRagRetrievalPythonCode(ragConfig);
      case 'bigquery_toolset':
        return generateBigQueryToolsetPythonCode(bqConfig);
      case 'spanner_toolset':
        return generateSpannerToolsetPythonCode(spannerConfig);
      case 'computer_use':
        return generateComputerUseToolsetPythonCode(cuConfig);
      case 'toolbox_databases':
        return generateToolboxDatabasePythonCode(toolboxConfig);
      default:
        return '# No code generator mapped for this tool.';
    }
  }, [toolType, appIntConfig, ragConfig, bqConfig, spannerConfig, cuConfig, toolboxConfig]);

  const toolboxYamlPreview = useMemo(() => {
    if (toolType === 'toolbox_databases') {
      return generateToolboxToolsYaml(toolboxConfig);
    }
    return '';
  }, [toolType, toolboxConfig]);

  const handleSave = () => {
    const updated: ToolDefinition = {
      ...tool,
      name: toolName,
    };

    switch (toolType) {
      case 'application_integration':
        updated.applicationIntegrationConfig = appIntConfig;
        break;
      case 'vertex_ai_rag_retrieval':
        updated.vertexAiRagRetrievalConfig = {
          ...ragConfig,
          ragCorpora: corporaInput.split('\n').map((s) => s.trim()).filter(Boolean),
        };
        break;
      case 'bigquery_toolset':
        updated.bigQueryToolsetConfig = bqConfig;
        break;
      case 'spanner_toolset':
        updated.spannerToolsetConfig = spannerConfig;
        break;
      case 'computer_use':
        updated.computerUseConfig = {
          ...cuConfig,
          allowedDomains: domainsInput.split('\n').map((s) => s.trim()).filter(Boolean),
        };
        break;
      case 'toolbox_databases':
        updated.toolboxDatabaseConfig = toolboxConfig;
        break;
    }

    onSave(updated);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-750 rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden text-slate-100">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/80">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              {toolType === 'bigquery_toolset' && <BarChart3 className="w-5 h-5 text-emerald-400" />}
              {toolType === 'spanner_toolset' && <Database className="w-5 h-5 text-blue-400" />}
              {toolType === 'vertex_ai_rag_retrieval' && <Database className="w-5 h-5 text-amber-400" />}
              {toolType === 'application_integration' && <Radio className="w-5 h-5 text-indigo-400" />}
              {toolType === 'computer_use' && <Terminal className="w-5 h-5 text-purple-400" />}
              {toolType === 'toolbox_databases' && <Database className="w-5 h-5 text-cyan-400" />}
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Configure {tool.name}</h2>
              <p className="text-xs text-slate-400">
                Google ADK Toolset Configuration & Parametrization
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-slate-800 bg-slate-950/40 px-6 gap-2 pt-2">
          <button
            onClick={() => setActiveTab('config')}
            className={`px-4 py-2 text-xs font-medium rounded-t-lg transition-colors border-b-2 flex items-center gap-2 ${
              activeTab === 'config'
                ? 'border-indigo-500 text-indigo-400 bg-slate-800/40'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Parameters
          </button>
          <button
            onClick={() => setActiveTab('code')}
            className={`px-4 py-2 text-xs font-medium rounded-t-lg transition-colors border-b-2 flex items-center gap-2 ${
              activeTab === 'code'
                ? 'border-indigo-500 text-indigo-400 bg-slate-800/40'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Code className="w-3.5 h-3.5" />
            Python ADK Preview
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300">Tool Display Name</label>
            <input
              type="text"
              value={toolName}
              onChange={(e) => setToolName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {activeTab === 'config' && (
            <>
              {/* 1. APPLICATION INTEGRATION */}
              {toolType === 'application_integration' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-300">Integration Mode</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setAppIntConfig({ ...appIntConfig, mode: 'connector' })}
                        className={`p-3 rounded-lg border text-left text-xs ${
                          appIntConfig.mode === 'connector'
                            ? 'border-indigo-500 bg-indigo-500/10 text-white font-semibold'
                            : 'border-slate-800 bg-slate-950/60 text-slate-400'
                        }`}
                      >
                        Enterprise Connector (SaaS)
                      </button>
                      <button
                        type="button"
                        onClick={() => setAppIntConfig({ ...appIntConfig, mode: 'integration_trigger' })}
                        className={`p-3 rounded-lg border text-left text-xs ${
                          appIntConfig.mode === 'integration_trigger'
                            ? 'border-indigo-500 bg-indigo-500/10 text-white font-semibold'
                            : 'border-slate-800 bg-slate-950/60 text-slate-400'
                        }`}
                      >
                        GCP Application Integration Flow
                      </button>
                    </div>
                  </div>

                  {appIntConfig.mode === 'connector' && (
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-300">SaaS Connector Preset</label>
                      <div className="grid grid-cols-3 gap-2">
                        {ENTERPRISE_CONNECTOR_PRESETS.map((preset) => (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() =>
                              setAppIntConfig({
                                ...appIntConfig,
                                connection: preset.id,
                                entityOperations: preset.defaultEntityOperations,
                                actions: preset.defaultActions,
                              })
                            }
                            className={`p-2.5 rounded-lg border text-left text-xs ${
                              appIntConfig.connection === preset.id
                                ? 'border-indigo-500 bg-indigo-500/10 text-white font-semibold'
                                : 'border-slate-800 bg-slate-950/40 text-slate-400 hover:border-slate-700'
                            }`}
                          >
                            {preset.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-300">GCP Project</label>
                      <input
                        type="text"
                        value={appIntConfig.project}
                        onChange={(e) => setAppIntConfig({ ...appIntConfig, project: e.target.value })}
                        className="w-full text-xs font-mono bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500"
                        placeholder="my-gcp-project"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-300">Region / Location</label>
                      <input
                        type="text"
                        value={appIntConfig.location}
                        onChange={(e) => setAppIntConfig({ ...appIntConfig, location: e.target.value })}
                        className="w-full text-xs font-mono bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500"
                        placeholder="us-central1"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* 2. VERTEX AI RAG RETRIEVAL */}
              {toolType === 'vertex_ai_rag_retrieval' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-300">
                      RAG Corpora Resource Names (one per line)
                    </label>
                    <textarea
                      rows={4}
                      value={corporaInput}
                      onChange={(e) => setCorporaInput(e.target.value)}
                      className="w-full font-mono text-xs bg-slate-950 border border-slate-700 rounded-lg p-3 text-slate-100 focus:outline-none focus:border-indigo-500"
                      placeholder="projects/PROJECT_ID/locations/LOCATION/ragCorpora/CORPUS_ID"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-300">Similarity Top K</label>
                      <input
                        type="number"
                        min={1}
                        max={50}
                        value={ragConfig.similarityTopK || 5}
                        onChange={(e) =>
                          setRagConfig({ ...ragConfig, similarityTopK: parseInt(e.target.value, 10) })
                        }
                        className="w-full text-xs font-mono bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-300">
                        Vector Distance Threshold (0.0 - 1.0)
                      </label>
                      <input
                        type="number"
                        step={0.05}
                        min={0}
                        max={1}
                        value={ragConfig.vectorDistanceThreshold || 0.5}
                        onChange={(e) =>
                          setRagConfig({
                            ...ragConfig,
                            vectorDistanceThreshold: parseFloat(e.target.value),
                          })
                        }
                        className="w-full text-xs font-mono bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* 3. BIGQUERY TOOLSET */}
              {toolType === 'bigquery_toolset' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-300">
                      Write Mode (Data Safety Policy)
                    </label>
                    <div className="grid grid-cols-3 gap-3">
                      {(['BLOCKED', 'PROTECTED', 'ALLOWED'] as BigQueryToolsetWriteMode[]).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setBqConfig({ ...bqConfig, writeMode: mode })}
                          className={`p-3 rounded-lg border text-left text-xs ${
                            bqConfig.writeMode === mode
                              ? mode === 'BLOCKED'
                                ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300 font-bold'
                                : mode === 'PROTECTED'
                                ? 'border-amber-500 bg-amber-500/10 text-amber-300 font-bold'
                                : 'border-rose-500 bg-rose-500/10 text-rose-300 font-bold'
                              : 'border-slate-800 bg-slate-950/60 text-slate-400'
                          }`}
                        >
                          <div className="flex items-center gap-1.5">
                            <Shield className="w-3.5 h-3.5" />
                            <span>{mode}</span>
                          </div>
                          <div className="text-[10px] mt-1 font-normal opacity-80">
                            {mode === 'BLOCKED'
                              ? 'Read-only queries'
                              : mode === 'PROTECTED'
                              ? 'Prompt before DDL/DML'
                              : 'Permit direct writes'}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-300">Enabled Sub-Tools</label>
                    <div className="grid grid-cols-2 gap-2">
                      {BIGQUERY_TOOLSET_TOOLS.map((tName) => {
                        const isEnabled = (bqConfig.enabledTools || []).includes(tName);
                        return (
                          <div
                            key={tName}
                            onClick={() => {
                              const current = bqConfig.enabledTools || [];
                              const updated = isEnabled
                                ? current.filter((x) => x !== tName)
                                : [...current, tName];
                              setBqConfig({ ...bqConfig, enabledTools: updated });
                            }}
                            className={`p-2.5 rounded-lg border flex items-center justify-between text-xs font-mono cursor-pointer ${
                              isEnabled
                                ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300'
                                : 'border-slate-800 bg-slate-950/40 text-slate-500'
                            }`}
                          >
                            <span>{tName}</span>
                            {isEnabled && <Check className="w-3.5 h-3.5" />}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* 4. SPANNER TOOLSET */}
              {toolType === 'spanner_toolset' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-300">Project ID</label>
                      <input
                        type="text"
                        value={spannerConfig.projectId}
                        onChange={(e) =>
                          setSpannerConfig({ ...spannerConfig, projectId: e.target.value })
                        }
                        className="w-full text-xs font-mono bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100"
                        placeholder="my-gcp-project"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-300">Instance ID</label>
                      <input
                        type="text"
                        value={spannerConfig.instanceId}
                        onChange={(e) =>
                          setSpannerConfig({ ...spannerConfig, instanceId: e.target.value })
                        }
                        className="w-full text-xs font-mono bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100"
                        placeholder="spanner-instance-1"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-300">Database ID</label>
                      <input
                        type="text"
                        value={spannerConfig.databaseId}
                        onChange={(e) =>
                          setSpannerConfig({ ...spannerConfig, databaseId: e.target.value })
                        }
                        className="w-full text-xs font-mono bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100"
                        placeholder="app_db"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-3 bg-slate-950/60 border border-slate-800 rounded-lg">
                    <input
                      type="checkbox"
                      id="spannerReadOnly"
                      checked={spannerConfig.readOnly ?? true}
                      onChange={(e) =>
                        setSpannerConfig({ ...spannerConfig, readOnly: e.target.checked })
                      }
                      className="rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-0"
                    />
                    <label htmlFor="spannerReadOnly" className="text-xs text-slate-300">
                      Enforce Read-Only Mode (blocks INSERT/UPDATE/DELETE mutations)
                    </label>
                  </div>
                </div>
              )}

              {/* 5. COMPUTER USE */}
              {toolType === 'computer_use' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-300">Automation Environment</label>
                    <div className="grid grid-cols-2 gap-3">
                      {(['playwright_chromium', 'browserbase'] as ComputerUseEnvironmentType[]).map((env) => (
                        <button
                          key={env}
                          type="button"
                          onClick={() => setCuConfig({ ...cuConfig, environment: env })}
                          className={`p-3 rounded-lg border text-left text-xs ${
                            cuConfig.environment === env
                              ? 'border-indigo-500 bg-indigo-500/10 text-white font-semibold'
                              : 'border-slate-800 bg-slate-950/60 text-slate-400'
                          }`}
                        >
                          {env === 'playwright_chromium' ? 'Playwright (Chromium)' : 'Browserbase Cloud'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-300">Screen Width</label>
                      <input
                        type="number"
                        value={cuConfig.screenWidth || 1440}
                        onChange={(e) =>
                          setCuConfig({ ...cuConfig, screenWidth: parseInt(e.target.value, 10) })
                        }
                        className="w-full text-xs font-mono bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-300">Screen Height</label>
                      <input
                        type="number"
                        value={cuConfig.screenHeight || 900}
                        onChange={(e) =>
                          setCuConfig({ ...cuConfig, screenHeight: parseInt(e.target.value, 10) })
                        }
                        className="w-full text-xs font-mono bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-300">
                      Allowed Navigation Domains (one per line)
                    </label>
                    <textarea
                      rows={3}
                      value={domainsInput}
                      onChange={(e) => setDomainsInput(e.target.value)}
                      className="w-full font-mono text-xs bg-slate-950 border border-slate-700 rounded-lg p-3 text-slate-100"
                      placeholder="*.google.com&#10;cloud.google.com"
                    />
                  </div>
                </div>
              )}

              {/* 6. MCP TOOLBOX FOR DATABASES */}
              {toolType === 'toolbox_databases' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-300">Toolbox Server URL</label>
                      <input
                        type="text"
                        value={toolboxConfig.serverUrl}
                        onChange={(e) =>
                          setToolboxConfig({ ...toolboxConfig, serverUrl: e.target.value })
                        }
                        className="w-full text-xs font-mono bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100"
                        placeholder="http://localhost:5000"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-300">Toolset Name</label>
                      <input
                        type="text"
                        value={toolboxConfig.toolsetName || ''}
                        onChange={(e) =>
                          setToolboxConfig({ ...toolboxConfig, toolsetName: e.target.value })
                        }
                        className="w-full text-xs font-mono bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100"
                        placeholder="database_tools"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-300">Target Database Kind</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(
                        ['alloydb', 'cloud_sql_pg', 'cloud_sql_mysql', 'spanner', 'neo4j', 'bigquery'] as ToolboxDatabaseKind[]
                      ).map((k) => (
                        <button
                          key={k}
                          type="button"
                          onClick={() => setToolboxConfig({ ...toolboxConfig, dbKind: k })}
                          className={`p-2 rounded-lg border text-left text-xs ${
                            toolboxConfig.dbKind === k
                              ? 'border-indigo-500 bg-indigo-500/10 text-white font-semibold'
                              : 'border-slate-800 bg-slate-950/40 text-slate-400'
                          }`}
                        >
                          {k}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-300">
                      Generated Toolbox tools.yaml Specification
                    </label>
                    <pre className="p-3 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-cyan-300 overflow-x-auto whitespace-pre">
                      {toolboxYamlPreview}
                    </pre>
                  </div>
                </div>
              )}
            </>
          )}

          {activeTab === 'code' && (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300">
                Generated Python ADK Initialization Code
              </label>
              <pre className="p-4 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-indigo-300 overflow-x-auto whitespace-pre">
                {generatedCode}
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-900/80 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-lg shadow-indigo-600/20 transition-colors flex items-center gap-1.5"
          >
            <Check className="w-4 h-4" />
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};
