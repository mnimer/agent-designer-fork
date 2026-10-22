/**
 * ModelsSettingsTab.tsx
 *
 * Page 1 of the Plugin Settings screen: Model Authentication & Catalog Management.
 * Supports switching between:
 * 1. GCP Application Default Credentials (ADC):
 *    - Always-On Google Gemini Foundation Models (`gemini-3.8-flash`, `gemini-3.7-flash`, `gemini-4-argon`)
 *      with disabled toggle switches and right-aligned Code Gen Default radio selection.
 *    - GCP Vertex AI Model Garden Data Table with search input, sortable Company & Model Name
 *      columns, pagination for hundreds of models, per-model On/Off switch (which triggers
 *      Vertex AI Model Garden enablement via RPC), and right-aligned Code Gen Default radio button.
 * 2. Direct Provider API Keys:
 *    - 4 full-width (100% width) stacked provider cards (`Gemini API`, `Anthropic`, `OpenAI`, `Grok`),
 *      each with a masked API Key text field, company-level master On/Off switch, and individual
 *      per-model On/Off switches + right-aligned Code Gen Default radio buttons.
 *
 * Author: Mike Nimer <mikenimer@google.com>
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  Cloud,
  Key,
  Search,
  RefreshCw,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Lock,
  CheckCircle2,
  AlertTriangle,
  Eye,
  EyeOff,
  Sparkles,
  ExternalLink,
  X,
} from 'lucide-react';
import { usePluginSettings } from '../../context/SettingsContext';
import { useWebviewBridge } from '../../hooks/useWebviewBridge';
import {
  ADC_CORE_GEMINI_MODELS,
  DEFAULT_MODEL_GARDEN_CATALOG,
  API_KEY_PROVIDER_CATALOG,
  deduplicateModelGardenCatalog,
  filterAndSortModelGarden,
  validateAdcModelSettings,
  validateApiKeyModelSettings,
  ModelGardenSortColumn,
  SortDirection,
} from '../../data/modelCatalog';
import { ApiKeyProviderId, ModelAuthMode, ModelCatalogItem } from '../../types';

export const ModelsSettingsTab: React.FC = () => {
  const {
    settings,
    updateSettings,
    toggleGardenModel,
    setCodeGenDefaultModel,
    updateApiKeyProvider,
    toggleApiKeyModel,
  } = usePluginSettings();
  const bridge = useWebviewBridge();

  // Pending auth mode tab view so user can inspect/configure API Keys before saving the switch
  const [viewMode, setViewMode] = useState<ModelAuthMode>(settings.authMode);
  const [gardenCatalog, setGardenCatalog] = useState<ModelCatalogItem[]>(
    deduplicateModelGardenCatalog(DEFAULT_MODEL_GARDEN_CATALOG)
  );
  const [isSyncingGarden, setIsSyncingGarden] = useState(false);
  const [gardenSyncSource, setGardenSyncSource] = useState<'gcloud' | 'fallback'>('fallback');
  const [verifyingGardenModelId, setVerifyingGardenModelId] = useState<string | null>(null);
  const [lastEnabledGardenBanner, setLastEnabledGardenBanner] = useState<string | null>(null);
  const [lastGardenErrorBanner, setLastGardenErrorBanner] = useState<{
    modelId: string;
    publisherModel?: string;
    message: string;
    consoleUrl?: string;
  } | null>(null);

  // Model Garden Data Table state (search + sorting)
  const [gardenSearchQuery, setGardenSearchQuery] = useState('');
  const [sortField, setSortField] = useState<ModelGardenSortColumn>('company');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // API Key visibility state
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});

  // Sync viewMode if settings.authMode changes externally
  useEffect(() => {
    setViewMode(settings.authMode);
  }, [settings.authMode]);

  // Listen for Model Garden catalog & enablement responses from Extension Host
  useEffect(() => {
    const unsubCatalog = bridge.onMessage('MODEL_GARDEN_MODELS_RESPONSE', (payload: any) => {
      setIsSyncingGarden(false);
      if (payload && Array.isArray(payload.models) && payload.models.length > 0) {
        setGardenCatalog(deduplicateModelGardenCatalog(payload.models));
        setGardenSyncSource(payload.source === 'gcloud' ? 'gcloud' : 'fallback');
      }
    });

    const unsubEnabled = bridge.onMessage('MODEL_GARDEN_MODEL_ENABLED', (payload: any) => {
      setVerifyingGardenModelId(null);
      if (!payload || !payload.modelId) return;

      if (payload.success && payload.enabled) {
        setLastGardenErrorBanner(null);
        toggleGardenModel(payload.modelId, true);
        setLastEnabledGardenBanner(
          `Verified & Enabled "${payload.modelId}" in GCP Vertex AI Model Garden (${payload.publisherModel || 'publishers/vertex-ai'})`
        );
        setTimeout(() => setLastEnabledGardenBanner(null), 5000);
      } else if (payload.error || payload.success === false) {
        // Model failed live GCP verification — revert toggle switch back to OFF and show popup dialog
        toggleGardenModel(payload.modelId, false);
        setLastEnabledGardenBanner(null);
        setLastGardenErrorBanner({
          modelId: payload.modelId,
          publisherModel: payload.publisherModel,
          message:
            payload.error ||
            `Model "${payload.modelId}" failed verification in GCP Vertex AI Model Garden. You may need to accept the EULA or enable this model in the Google Cloud Console.`,
          consoleUrl:
            payload.consoleUrl ||
            'https://console.cloud.google.com/vertex-ai/model-garden',
        });
      }
    });

    return () => {
      unsubCatalog();
      unsubEnabled();
    };
  }, [bridge, toggleGardenModel]);

  const handleSyncModelGarden = () => {
    setIsSyncingGarden(true);
    bridge.postMessage({
      type: 'FETCH_MODEL_GARDEN_MODELS',
      payload: {
        projectId: settings.defaultGcpProject || undefined,
        forceRefresh: true,
      },
    });
  };

  const handleSortColumn = (field: ModelGardenSortColumn) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleToggleGardenModelWithRpc = (model: ModelCatalogItem, enabled: boolean) => {
    setLastGardenErrorBanner(null);
    if (enabled) {
      setVerifyingGardenModelId(model.id);
    }
    toggleGardenModel(model.id, enabled);
    bridge.postMessage({
      type: 'ENABLE_MODEL_GARDEN_MODEL',
      payload: {
        modelId: model.id,
        publisherModel: model.gardenPublisherModel,
        enabled,
        projectId: settings.defaultGcpProject || undefined,
      },
    });
  };

  const handleOpenExternalUrl = (url?: string) => {
    if (!url) return;
    bridge.postMessage({
      type: 'OPEN_EXTERNAL_URL',
      payload: { url },
    });
  };

  // Filtered and sorted Model Garden rows (deduplicated & rendered in a single table)
  const filteredAndSortedGarden = useMemo(
    () => filterAndSortModelGarden(gardenCatalog, gardenSearchQuery, sortField, sortDirection),
    [gardenCatalog, gardenSearchQuery, sortField, sortDirection]
  );

  // Validation states for ADC and API Keys
  const adcValidation = useMemo(
    () =>
      validateAdcModelSettings(
        settings.adcEnabledGardenModels,
        settings.codeGenDefaultModel,
        gardenCatalog
      ),
    [settings.adcEnabledGardenModels, settings.codeGenDefaultModel, gardenCatalog]
  );

  const apiKeyValidation = useMemo(
    () => validateApiKeyModelSettings(settings.apiKeyProviders, settings.codeGenDefaultModel),
    [settings.apiKeyProviders, settings.codeGenDefaultModel]
  );

  const syncApiKeySettingsToHost = (
    overrides?: Partial<Record<ApiKeyProviderId, { apiKey?: string; enabled?: boolean }>>,
    defaultModelOverride?: string
  ) => {
    const geminiKey =
      overrides?.gemini?.apiKey !== undefined
        ? overrides.gemini.apiKey
        : settings.apiKeyProviders.gemini?.apiKey || '';
    const anthropicKey =
      overrides?.anthropic?.apiKey !== undefined
        ? overrides.anthropic.apiKey
        : settings.apiKeyProviders.anthropic?.apiKey || '';
    const openaiKey =
      overrides?.openai?.apiKey !== undefined
        ? overrides.openai.apiKey
        : settings.apiKeyProviders.openai?.apiKey || '';
    const grokKey =
      overrides?.grok?.apiKey !== undefined
        ? overrides.grok.apiKey
        : settings.apiKeyProviders.grok?.apiKey || '';

    bridge.postMessage({
      type: 'UPDATE_SETTINGS',
      payload: {
        authMode: 'api_keys',
        codeGenDefaultModel: defaultModelOverride || settings.codeGenDefaultModel,
        geminiApiKey: geminiKey,
        anthropicApiKey: anthropicKey,
        openaiApiKey: openaiKey,
        grokApiKey: grokKey,
      },
    });
  };

  const handleActivateAdcMode = () => {
    setViewMode('adc');
    updateSettings({ authMode: 'adc' });
    bridge.postMessage({
      type: 'UPDATE_SETTINGS',
      payload: {
        authMode: 'adc',
        codeGenDefaultModel: settings.codeGenDefaultModel,
      },
    });
  };

  const handleActivateApiKeysMode = () => {
    setViewMode('api_keys');
    updateSettings({ authMode: 'api_keys' });
    syncApiKeySettingsToHost();
  };

  const toggleShowKey = (providerId: ApiKeyProviderId) => {
    setVisibleKeys((prev) => ({ ...prev, [providerId]: !prev[providerId] }));
  };

  return (
    <div className="space-y-6" data-testid="models-settings-tab">
      {/* Page Title & Active Auth Mode Summary */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[var(--vscode-border)] pb-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-blue-500" />
            <span>Model Authentication &amp; Provider Catalog</span>
          </h2>
          <p className="text-xs text-[var(--vscode-text-muted)] mt-1">
            Configure GCP Application Default Credentials (ADC) with Vertex AI Model Garden or direct provider API Keys.
            Enabled models populate Agent/A2A Inspector dropdowns and the Code Generation tab.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] font-mono px-2.5 py-1 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/30">
            Active Mode: {settings.authMode === 'adc' ? 'GCP ADC (Vertex AI)' : 'Direct API Keys'}
          </span>
          <span className="text-[11px] font-mono px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            Code Gen Default: {settings.codeGenDefaultModel}
          </span>
        </div>
      </div>

      {/* Authentication Mode Segmented Switcher */}
      <div
        className="grid grid-cols-1 md:grid-cols-2 gap-2 p-2 rounded-xl bg-[var(--vscode-canvas-bg)] border border-[var(--vscode-border)]"
        role="tablist"
        aria-label="Model Authentication Mode"
      >
        <button
          type="button"
          role="tab"
          aria-selected={viewMode === 'adc'}
          data-testid="auth-mode-adc-btn"
          onClick={handleActivateAdcMode}
          className={`flex items-center justify-between px-4 py-3 rounded-lg text-left transition-all cursor-pointer border ${
            viewMode === 'adc'
              ? 'bg-blue-600/20 border-blue-500 text-[var(--vscode-text-primary)] shadow-sm'
              : 'bg-transparent border-transparent text-[var(--vscode-text-secondary)] hover:bg-[var(--vscode-hover)]'
          }`}
        >
          <div className="flex items-center gap-3">
            <Cloud className={`w-4 h-4 ${viewMode === 'adc' ? 'text-blue-400' : 'text-[var(--vscode-text-muted)]'}`} />
            <div>
              <div className="text-xs font-bold">GCP Application Default Credentials (ADC)</div>
              <div className="text-[11px] text-[var(--vscode-text-muted)]">
                Always-on Gemini models + Vertex AI Model Garden (Claude, OpenAI, Qwen, Llama)
              </div>
            </div>
          </div>
          {settings.authMode === 'adc' && (
            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/40">
              Active
            </span>
          )}
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={viewMode === 'api_keys'}
          data-testid="auth-mode-apikeys-btn"
          onClick={handleActivateApiKeysMode}
          className={`flex items-center justify-between px-4 py-3 rounded-lg text-left transition-all cursor-pointer border ${
            viewMode === 'api_keys'
              ? 'bg-blue-600/20 border-blue-500 text-[var(--vscode-text-primary)] shadow-sm'
              : 'bg-transparent border-transparent text-[var(--vscode-text-secondary)] hover:bg-[var(--vscode-hover)]'
          }`}
        >
          <div className="flex items-center gap-3">
            <Key className={`w-4 h-4 ${viewMode === 'api_keys' ? 'text-amber-400' : 'text-[var(--vscode-text-muted)]'}`} />
            <div>
              <div className="text-xs font-bold">API Keys (Direct Provider Access)</div>
              <div className="text-[11px] text-[var(--vscode-text-muted)]">
                Configure Gemini API, Anthropic, OpenAI, and Grok keys with per-model toggles
              </div>
            </div>
          </div>
          {settings.authMode === 'api_keys' && (
            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/40">
              Active
            </span>
          )}
        </button>
      </div>

      {/* =====================================================================
          MODE 1: GCP APPLICATION DEFAULT CREDENTIALS (ADC)
         ===================================================================== */}
      {viewMode === 'adc' && (
        <div className="space-y-6" data-testid="adc-mode-section">
          {/* ADC Validation Banner */}
          <div
            data-testid="adc-validation-banner"
            className={`flex items-center justify-between px-4 py-2.5 rounded-lg border text-xs ${
              adcValidation.isValid
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
            }`}
          >
            <div className="flex items-center gap-2">
              {adcValidation.isValid ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              )}
              <span>
                {adcValidation.isValid
                  ? `Validation Passed: ${adcValidation.enabledModelsCount} models enabled (${ADC_CORE_GEMINI_MODELS.length} Always-On Gemini + ${settings.adcEnabledGardenModels.length} Model Garden) • Code Gen Default set to "${settings.codeGenDefaultModel}"`
                  : adcValidation.errors.join(' ')}
              </span>
            </div>
          </div>

          {lastEnabledGardenBanner && (
            <div
              data-testid="model-garden-enabled-toast"
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500/15 border border-blue-500/40 text-blue-300 text-xs"
            >
              <CheckCircle2 className="w-4 h-4 text-blue-400 shrink-0" />
              <span>{lastEnabledGardenBanner}</span>
            </div>
          )}

          {lastGardenErrorBanner && (
            <div
              data-testid="model-garden-error-toast"
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 rounded-lg bg-rose-500/15 border border-rose-500/40 text-rose-200 text-xs"
            >
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-rose-300">
                    Model Not Enabled in Your GCP Project
                  </div>
                  <div className="text-[11px] text-rose-200/90 mt-0.5">
                    {lastGardenErrorBanner.message}
                  </div>
                </div>
              </div>
              {lastGardenErrorBanner.consoleUrl && (
                <button
                  type="button"
                  onClick={() => handleOpenExternalUrl(lastGardenErrorBanner.consoleUrl)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-rose-500/25 hover:bg-rose-500/40 border border-rose-400/40 text-rose-100 font-semibold text-[11px] shrink-0 transition-colors cursor-pointer"
                >
                  <span>Open in Browser (Accept EULA)</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {/* Section 1A: Always-On Google Gemini Foundation Models */}
          <div className="rounded-xl border border-[var(--vscode-border)] bg-[var(--vscode-canvas-bg)] overflow-hidden">
            <div className="px-4 py-3 bg-[var(--vscode-activity-bar)] border-b border-[var(--vscode-border)] flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-blue-400">
                  Google Gemini Foundation Models (Always On)
                </h3>
                <p className="text-[11px] text-[var(--vscode-text-muted)] mt-0.5">
                  Core Gemini models are always enabled under ADC. Their On/Off switches are locked.
                </p>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                <Lock className="w-3 h-3" /> Always Enabled
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs" data-testid="adc-gemini-table">
                <thead>
                  <tr className="border-b border-[var(--vscode-border)] text-[10px] font-bold uppercase tracking-wider text-[var(--vscode-text-muted)] bg-[var(--vscode-workbench-bg)]">
                    <th className="py-2.5 px-4 w-36">Status (Always On)</th>
                    <th className="py-2.5 px-4">Model ID &amp; Name</th>
                    <th className="py-2.5 px-4">Description</th>
                    <th
                      className="py-2.5 px-4 text-right w-44"
                      data-testid="adc-gemini-codegen-header"
                    >
                      Code Gen Default
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--vscode-border)]">
                  {ADC_CORE_GEMINI_MODELS.map((model) => {
                    const isDefault = settings.codeGenDefaultModel === model.id;
                    return (
                      <tr
                        key={model.id}
                        data-testid={`adc-gemini-row-${model.id}`}
                        className="hover:bg-[var(--vscode-hover)] transition-colors"
                      >
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              role="switch"
                              aria-checked={true}
                              aria-disabled={true}
                              disabled={true}
                              data-testid={`adc-gemini-switch-${model.id}`}
                              title="Core Gemini models are always enabled and cannot be turned off"
                              className="w-9 h-5 rounded-full bg-emerald-600/50 border border-emerald-500/50 relative cursor-not-allowed opacity-65 transition-colors"
                            >
                              <span className="block w-3.5 h-3.5 rounded-full bg-white translate-x-4 transition-transform" />
                            </button>
                            <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
                              <Lock className="w-2.5 h-2.5" /> Always On
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-[var(--vscode-text-primary)]">
                              {model.id}
                            </span>
                            {model.id === 'gemini-3.8-flash' && (
                              <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
                                Default
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-[var(--vscode-text-muted)]">{model.name}</div>
                        </td>
                        <td className="py-3 px-4 text-[11px] text-[var(--vscode-text-secondary)]">
                          {model.description}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <input
                              type="radio"
                              name="adc-codegen-default-model"
                              data-testid={`codegen-radio-${model.id}`}
                              checked={isDefault}
                              onChange={() => setCodeGenDefaultModel(model.id)}
                              className="w-4 h-4 accent-blue-500 cursor-pointer"
                              aria-label={`Set ${model.id} as Code Generation Default`}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 1B: GCP Vertex AI Model Garden Sortable Data Table */}
          <div className="rounded-xl border border-[var(--vscode-border)] bg-[var(--vscode-canvas-bg)] overflow-hidden">
            <div className="px-4 py-3 bg-[var(--vscode-activity-bar)] border-b border-[var(--vscode-border)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-purple-400">
                  GCP Vertex AI Model Garden Catalog
                </h3>
                <p className="text-[11px] text-[var(--vscode-text-muted)] mt-0.5">
                  Toggle models ON to enable them in Vertex AI Model Garden and add them to Agent &amp; Code Gen dropdowns.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-[var(--vscode-text-muted)]">
                  Source: {gardenSyncSource === 'gcloud' ? 'Live GCP Project' : 'Vertex AI Catalog'}
                </span>
                <button
                  type="button"
                  data-testid="sync-model-garden-btn"
                  onClick={handleSyncModelGarden}
                  disabled={isSyncingGarden}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--vscode-button-secondary)] hover:bg-[var(--vscode-hover)] border border-[var(--vscode-border)] text-xs font-medium cursor-pointer transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncingGarden ? 'animate-spin text-blue-400' : ''}`} />
                  <span>{isSyncingGarden ? 'Syncing...' : 'Sync Model Garden'}</span>
                </button>
              </div>
            </div>

            {/* Search Textfield Only (No filter buttons per user request) */}
            <div className="p-4 border-b border-[var(--vscode-border)] bg-[var(--vscode-workbench-bg)] flex items-center justify-between gap-4">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-[var(--vscode-text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  data-testid="model-garden-search-input"
                  value={gardenSearchQuery}
                  onChange={(e) => {
                    setGardenSearchQuery(e.target.value);
                  }}
                  placeholder="Search hundreds of Model Garden models by company (Anthropic, OpenAI, Alibaba / Qwen, Meta) or model name..."
                  className="w-full pl-9 pr-8 py-2 bg-[var(--vscode-canvas-bg)] border border-[var(--vscode-border)] focus:border-blue-500 rounded-lg text-xs text-[var(--vscode-text-primary)] placeholder-[var(--vscode-text-muted)] focus:outline-none"
                />
              </div>
              <div className="text-[11px] font-mono text-[var(--vscode-text-muted)] shrink-0">
                Showing {filteredAndSortedGarden.length} of {gardenCatalog.length} models
              </div>
            </div>

            {/* Sortable Data Table (All Models in a Single Table) */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs" data-testid="model-garden-table">
                <thead>
                  <tr className="border-b border-[var(--vscode-border)] text-[10px] font-bold uppercase tracking-wider text-[var(--vscode-text-muted)] bg-[var(--vscode-workbench-bg)]">
                    <th className="py-2.5 px-4 w-28">Enable</th>
                    <th className="py-2.5 px-4 w-44">
                      <button
                        type="button"
                        data-testid="sort-by-company-btn"
                        onClick={() => handleSortColumn('company')}
                        className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-[var(--vscode-text-muted)] hover:text-[var(--vscode-text-primary)] cursor-pointer"
                      >
                        <span>Model Company</span>
                        {sortField === 'company' ? (
                          sortDirection === 'asc' ? (
                            <ArrowUp className="w-3.5 h-3.5 text-blue-400" />
                          ) : (
                            <ArrowDown className="w-3.5 h-3.5 text-blue-400" />
                          )
                        ) : (
                          <ArrowUpDown className="w-3.5 h-3.5 opacity-50" />
                        )}
                      </button>
                    </th>
                    <th className="py-2.5 px-4">
                      <button
                        type="button"
                        data-testid="sort-by-name-btn"
                        onClick={() => handleSortColumn('name')}
                        className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-[var(--vscode-text-muted)] hover:text-[var(--vscode-text-primary)] cursor-pointer"
                      >
                        <span>Model Name &amp; ID</span>
                        {sortField === 'name' ? (
                          sortDirection === 'asc' ? (
                            <ArrowUp className="w-3.5 h-3.5 text-blue-400" />
                          ) : (
                            <ArrowDown className="w-3.5 h-3.5 text-blue-400" />
                          )
                        ) : (
                          <ArrowUpDown className="w-3.5 h-3.5 opacity-50" />
                        )}
                      </button>
                    </th>
                    <th className="py-2.5 px-4">Publisher Endpoint</th>
                    <th
                      className="py-2.5 px-4 text-right w-44"
                      data-testid="model-garden-codegen-header"
                    >
                      Code Gen Default
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--vscode-border)]">
                  {filteredAndSortedGarden.map((model) => {
                    const isEnabled = settings.adcEnabledGardenModels.includes(model.id);
                    const isDefault = settings.codeGenDefaultModel === model.id;
                    return (
                      <tr
                        key={model.id}
                        data-testid={`garden-row-${model.id}`}
                        className="hover:bg-[var(--vscode-hover)] transition-colors"
                      >
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              role="switch"
                              aria-checked={isEnabled}
                              data-testid={`garden-switch-${model.id}`}
                              onClick={() => handleToggleGardenModelWithRpc(model, !isEnabled)}
                              className={`w-9 h-5 rounded-full relative transition-colors cursor-pointer border ${
                                isEnabled
                                  ? 'bg-blue-600 border-blue-500'
                                  : 'bg-zinc-700/60 border-zinc-600'
                              }`}
                            >
                              <span
                                className={`block w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                                  isEnabled ? 'translate-x-4' : 'translate-x-0.5'
                                }`}
                              />
                            </button>
                            {verifyingGardenModelId === model.id && (
                              <span className="text-[10px] font-mono text-blue-400 animate-pulse">
                                Verifying...
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-purple-500/15 text-purple-300 border border-purple-500/30">
                            {model.company}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-[var(--vscode-text-primary)]">{model.name}</div>
                          <div className="text-[11px] font-mono text-[var(--vscode-text-muted)]">{model.id}</div>
                        </td>
                        <td className="py-3 px-4 text-[11px] font-mono text-[var(--vscode-text-muted)]">
                          {model.gardenPublisherModel || `publishers/vertex-ai/models/${model.id}`}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <input
                              type="radio"
                              name="adc-codegen-default-model"
                              data-testid={`codegen-radio-${model.id}`}
                              checked={isDefault}
                              onChange={() => {
                                if (!isEnabled) {
                                  handleToggleGardenModelWithRpc(model, true);
                                }
                                setCodeGenDefaultModel(model.id);
                              }}
                              className="w-4 h-4 accent-blue-500 cursor-pointer"
                              aria-label={`Set ${model.name} as Code Generation Default`}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredAndSortedGarden.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-[var(--vscode-text-muted)]">
                        No Model Garden models match &ldquo;{gardenSearchQuery}&rdquo;.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODE 2: DIRECT PROVIDER API KEYS (100% Width Stacked Company Rows)
         ===================================================================== */}
      {viewMode === 'api_keys' && (
        <div className="space-y-6" data-testid="api-keys-mode-section">
          {/* API Keys Validation Banner */}
          <div
            data-testid="api-keys-validation-banner"
            className={`flex items-center justify-between px-4 py-2.5 rounded-lg border text-xs ${
              apiKeyValidation.isValid
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
            }`}
          >
            <div className="flex items-center gap-2">
              {apiKeyValidation.isValid ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              )}
              <span>
                {apiKeyValidation.isValid
                  ? `Validation Passed: ${apiKeyValidation.enabledModelsCount} model(s) enabled • Code Gen Default set to "${settings.codeGenDefaultModel}"`
                  : apiKeyValidation.errors.join(' ')}
              </span>
            </div>
          </div>

          {/* 4 Full-Width (100% width) Stacked Company Cards */}
          <div className="flex flex-col space-y-4 w-full" data-testid="api-keys-company-list">
            {API_KEY_PROVIDER_CATALOG.map((company) => {
              const providerCfg = settings.apiKeyProviders[company.providerId];
              const isCompanyEnabled = Boolean(providerCfg?.enabled);
              const enabledModelSet = new Set(providerCfg?.enabledModels || []);
              const showKey = Boolean(visibleKeys[company.providerId]);

              return (
                <div
                  key={company.providerId}
                  data-testid={`api-key-provider-card-${company.providerId}`}
                  className="w-full rounded-xl border border-[var(--vscode-border)] bg-[var(--vscode-canvas-bg)] overflow-hidden"
                >
                  {/* Top Row: Company Header + Master On/Off Switch + API Key Input */}
                  <div className="p-4 bg-[var(--vscode-activity-bar)] border-b border-[var(--vscode-border)] space-y-3">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={isCompanyEnabled}
                          data-testid={`provider-switch-${company.providerId}`}
                          onClick={() => {
                            const nextEnabled = !isCompanyEnabled;
                            updateApiKeyProvider(company.providerId, {
                              enabled: nextEnabled,
                            });
                            syncApiKeySettingsToHost({
                              [company.providerId]: { enabled: nextEnabled },
                            });
                          }}
                          className={`w-10 h-5 rounded-full relative transition-colors cursor-pointer border ${
                            isCompanyEnabled
                              ? 'bg-blue-600 border-blue-500'
                              : 'bg-zinc-700/60 border-zinc-600'
                          }`}
                          title={`Enable or disable all ${company.companyName} models`}
                        >
                          <span
                            className={`block w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                              isCompanyEnabled ? 'translate-x-5' : 'translate-x-0.5'
                            }`}
                          />
                        </button>
                        <div>
                          <div className="text-sm font-bold text-[var(--vscode-text-primary)]">
                            {company.companyName}
                          </div>
                          <div className="text-[11px] font-mono text-[var(--vscode-text-muted)]">
                            Environment Variable: {company.envVarName}
                          </div>
                        </div>
                      </div>

                      <span
                        className={`text-[10px] font-mono px-2.5 py-0.5 rounded border ${
                          isCompanyEnabled
                            ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                            : 'bg-zinc-500/10 text-[var(--vscode-text-muted)] border-[var(--vscode-border)]'
                        }`}
                      >
                        {isCompanyEnabled
                          ? `${company.models.filter((m) => enabledModelSet.has(m.id)).length} of ${company.models.length} Models Enabled`
                          : 'Company Disabled'}
                      </span>
                    </div>

                    {/* Full-Width API Key Input Row */}
                    <div className="flex items-center gap-2 w-full">
                      <div className="relative flex-1">
                        <Key className="w-3.5 h-3.5 text-[var(--vscode-text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type={showKey ? 'text' : 'password'}
                          data-testid={`provider-apikey-input-${company.providerId}`}
                          value={providerCfg?.apiKey || ''}
                          onChange={(e) => {
                            const nextKey = e.target.value;
                            updateApiKeyProvider(company.providerId, { apiKey: nextKey });
                            syncApiKeySettingsToHost({
                              [company.providerId]: { apiKey: nextKey },
                            });
                          }}
                          placeholder={company.placeholder}
                          className="w-full pl-9 pr-9 py-2 rounded-lg bg-[var(--vscode-workbench-bg)] border border-[var(--vscode-border)] focus:border-blue-500 text-xs font-mono text-[var(--vscode-text-primary)] focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => toggleShowKey(company.providerId)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--vscode-text-muted)] hover:text-[var(--vscode-text-primary)] cursor-pointer"
                          aria-label={showKey ? 'Hide API Key' : 'Show API Key'}
                        >
                          {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Second Row (100% width): Per-Model On/Off Switches & Right-Aligned Code Gen Default Radios */}
                  <div className="w-full overflow-x-auto">
                    <table
                      className="w-full text-left border-collapse text-xs"
                      data-testid={`provider-models-table-${company.providerId}`}
                    >
                      <thead>
                        <tr className="border-b border-[var(--vscode-border)] text-[10px] font-bold uppercase tracking-wider text-[var(--vscode-text-muted)] bg-[var(--vscode-workbench-bg)]">
                          <th className="py-2 px-4 w-28">Model On/Off</th>
                          <th className="py-2 px-4">Model Name &amp; ID</th>
                          <th className="py-2 px-4">Description</th>
                          <th className="py-2 px-4 text-right w-44">Code Gen Default</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--vscode-border)]">
                        {company.models.map((model) => {
                          const isModelEnabled = enabledModelSet.has(model.id);
                          const isModelActive = isCompanyEnabled && isModelEnabled;
                          const isDefault = settings.codeGenDefaultModel === model.id;
                          return (
                            <tr
                              key={model.id}
                              data-testid={`provider-model-row-${company.providerId}-${model.id}`}
                              className={`transition-colors ${
                                isCompanyEnabled
                                  ? 'hover:bg-[var(--vscode-hover)]'
                                  : 'opacity-50'
                              }`}
                            >
                              <td className="py-2.5 px-4">
                                <button
                                  type="button"
                                  role="switch"
                                  aria-checked={isModelEnabled}
                                  data-testid={`provider-model-switch-${company.providerId}-${model.id}`}
                                  onClick={() => {
                                    toggleApiKeyModel(
                                      company.providerId,
                                      model.id,
                                      !isModelEnabled
                                    );
                                    syncApiKeySettingsToHost();
                                  }}
                                  className={`w-9 h-5 rounded-full relative transition-colors cursor-pointer border ${
                                    isModelEnabled
                                      ? 'bg-blue-600 border-blue-500'
                                      : 'bg-zinc-700/60 border-zinc-600'
                                  }`}
                                >
                                  <span
                                    className={`block w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                                      isModelEnabled ? 'translate-x-4' : 'translate-x-0.5'
                                    }`}
                                  />
                                </button>
                              </td>
                              <td className="py-2.5 px-4">
                                <div className="font-semibold text-[var(--vscode-text-primary)]">
                                  {model.name}
                                </div>
                                <div className="text-[11px] font-mono text-[var(--vscode-text-muted)]">
                                  {model.id}
                                </div>
                              </td>
                              <td className="py-2.5 px-4 text-[11px] text-[var(--vscode-text-secondary)]">
                                {model.description}
                              </td>
                              <td className="py-2.5 px-4 text-right">
                                <div className="flex items-center justify-end">
                                  <input
                                    type="radio"
                                    name="apikeys-codegen-default-model"
                                    data-testid={`apikey-codegen-radio-${model.id}`}
                                    checked={isDefault}
                                    disabled={!isModelActive}
                                    onChange={() => {
                                      setCodeGenDefaultModel(model.id);
                                      syncApiKeySettingsToHost(undefined, model.id);
                                    }}
                                    className="w-4 h-4 accent-blue-500 cursor-pointer disabled:opacity-40"
                                    aria-label={`Set ${model.name} as Code Generation Default`}
                                  />
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Centered Modal Dialog Popup when Model Garden Verification Fails */}
      {lastGardenErrorBanner && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="model-garden-verification-modal-title"
          data-testid="model-garden-verification-modal"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
        >
          <div className="w-full max-w-lg rounded-2xl border border-rose-500/40 bg-[var(--vscode-canvas-bg)] shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-rose-500/15 border-b border-rose-500/30 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-rose-500/20 border border-rose-500/40 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5 text-rose-400" />
                </div>
                <div>
                  <h3
                    id="model-garden-verification-modal-title"
                    className="text-sm font-bold text-rose-200"
                  >
                    Model Verification Failed
                  </h3>
                  <p className="text-[11px] font-mono text-rose-300/80">
                    {lastGardenErrorBanner.modelId}
                    {lastGardenErrorBanner.publisherModel
                      ? ` • ${lastGardenErrorBanner.publisherModel}`
                      : ''}
                  </p>
                </div>
              </div>
              <button
                type="button"
                data-testid="verification-modal-close-icon-btn"
                onClick={() => setLastGardenErrorBanner(null)}
                className="p-1.5 rounded-lg text-[var(--vscode-text-muted)] hover:text-[var(--vscode-text-primary)] hover:bg-[var(--vscode-hover)] cursor-pointer transition-colors"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4 text-xs">
              <div className="p-3.5 rounded-lg bg-[var(--vscode-workbench-bg)] border border-[var(--vscode-border)] text-[var(--vscode-text-primary)] leading-relaxed">
                {lastGardenErrorBanner.message}
              </div>

              <div className="space-y-2">
                <div className="font-semibold text-[var(--vscode-text-secondary)]">
                  You need to accept the EULA / Partner Terms or enable this model in Google Cloud Model Garden:
                </div>
                <ol className="list-decimal list-inside space-y-1 text-[11px] text-[var(--vscode-text-muted)]">
                  <li>
                    Click <strong className="text-[var(--vscode-text-primary)]">Open in Browser</strong> below to open this model in Google Cloud Console.
                  </li>
                  <li>
                    Click <strong className="text-[var(--vscode-text-primary)]">Enable</strong> or accept the Publisher EULA / Partner Terms for your GCP project.
                  </li>
                  <li>
                    Return here and click <strong className="text-[var(--vscode-text-primary)]">Retry Verification</strong> (or toggle the switch ON again).
                  </li>
                </ol>
              </div>

              {lastGardenErrorBanner.consoleUrl && (
                <div className="space-y-1.5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--vscode-text-muted)]">
                    GCP Model Garden EULA / Enablement URL
                  </div>
                  <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-[var(--vscode-workbench-bg)] border border-[var(--vscode-border)]">
                    <span
                      data-testid="verification-modal-url-text"
                      className="text-[11px] font-mono text-blue-400 break-all select-all"
                    >
                      {lastGardenErrorBanner.consoleUrl}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-[var(--vscode-activity-bar)] border-t border-[var(--vscode-border)] flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                data-testid="verification-modal-dismiss-btn"
                onClick={() => setLastGardenErrorBanner(null)}
                className="px-4 py-2 rounded-lg border border-[var(--vscode-border)] bg-[var(--vscode-workbench-bg)] hover:bg-[var(--vscode-hover)] text-xs font-medium text-[var(--vscode-text-secondary)] cursor-pointer transition-colors"
              >
                Close
              </button>
              <button
                type="button"
                data-testid="verification-modal-retry-btn"
                onClick={() => {
                  const targetModel =
                    gardenCatalog.find((m) => m.id === lastGardenErrorBanner.modelId) || {
                      id: lastGardenErrorBanner.modelId,
                      name: lastGardenErrorBanner.modelId,
                      company: 'Vertex AI',
                      description: '',
                      gardenPublisherModel: lastGardenErrorBanner.publisherModel,
                    };
                  handleToggleGardenModelWithRpc(targetModel, true);
                }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-blue-500/40 bg-blue-500/15 hover:bg-blue-500/25 text-xs font-semibold text-blue-300 cursor-pointer transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry Verification</span>
              </button>
              {lastGardenErrorBanner.consoleUrl && (
                <button
                  type="button"
                  data-testid="verification-modal-open-browser-btn"
                  onClick={() => handleOpenExternalUrl(lastGardenErrorBanner.consoleUrl)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white shadow-sm cursor-pointer transition-colors"
                >
                  <span>Open in Browser (Accept EULA)</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
