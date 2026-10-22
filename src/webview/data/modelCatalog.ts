/**
 * modelCatalog.ts - Canonical Foundation Model & Vertex AI Model Garden Catalog
 *
 * Purpose:
 * Defines the always-on Google Gemini foundation models for GCP Application Default
 * Credentials (ADC), the GCP Vertex AI Model Garden catalog (Anthropic Claude, OpenAI,
 * Qwen, Meta Llama, Mistral, DeepSeek, Cohere), the 4 API Key provider catalogs
 * (Gemini API, Anthropic, OpenAI, Grok), and pure helper functions for sorting,
 * filtering, validation, and enabled-model resolution.
 *
 * Architectural Decisions:
 * - Strict DRY & Zero Magic Constants: Centralizes all model metadata, company badges,
 *   and validation logic in one shared module used across SettingsPage, ModelSelector,
 *   and CodePreviewTab.
 * - Enforces gemini-3.8-flash as the primary default model.
 * - Author: Mike Nimer <mikenimer@google.com>
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import {
  ApiKeyProviderConfig,
  ApiKeyProviderId,
  ModelAuthMode,
  ModelCatalogItem,
} from '../types';

export const DEFAULT_CODE_GEN_MODEL_ID = 'gemini-3.8-flash';

/**
 * Top section in ADC Mode: Always-On Google Gemini Foundation Models.
 * Their switches are permanently enabled and disabled from user toggling.
 */
export const ADC_CORE_GEMINI_MODELS: ModelCatalogItem[] = [
  {
    id: 'gemini-3.8-flash',
    name: 'Gemini 3.8 Flash',
    company: 'Google',
    description: 'Default • Next-gen hybrid reasoning & multi-agent orchestration (location="global")',
    alwaysOn: true,
    source: 'adc_gemini',
  },
  {
    id: 'gemini-3.7-flash',
    name: 'Gemini 3.7 Flash',
    company: 'Google',
    description: 'High-throughput adaptive thinking & low-latency tool execution (location="global")',
    alwaysOn: true,
    source: 'adc_gemini',
  },
  {
    id: 'gemini-4-argon',
    name: 'Gemini 4 Argon',
    company: 'Google',
    description: 'Frontier deep-reasoning & complex multi-agent synthesis model',
    alwaysOn: true,
    source: 'adc_gemini',
  },
];

/**
 * GCP Vertex AI Model Garden catalog entries available for toggling in ADC Mode.
 * Enabling a model triggers Vertex AI Model Garden enablement via the extension host.
 */
export const DEFAULT_MODEL_GARDEN_CATALOG: ModelCatalogItem[] = [
  // Anthropic Claude 5.x on Vertex AI Model Garden (Partner Models — require GCP Console Marketplace enablement)
  {
    id: 'claude-fable-5-1',
    name: 'Claude Fable 5.1',
    company: 'Anthropic',
    description: 'Frontier tier for most demanding reasoning, multi-step research & long-horizon agentic workflows (1M context)',
    source: 'model_garden',
    gardenPublisherModel: 'publishers/anthropic/models/claude-fable-5-1',
  },
  {
    id: 'claude-opus-5-5',
    name: 'Claude Opus 5.5',
    company: 'Anthropic',
    description: 'Flagship daily driver for long-running agentic coding, complex migrations & heavy knowledge work (1M context)',
    source: 'model_garden',
    gardenPublisherModel: 'publishers/anthropic/models/claude-opus-5-5',
  },
  {
    id: 'claude-sonnet-5-5',
    name: 'Claude Sonnet 5.5',
    company: 'Anthropic',
    description: 'Balanced speed and intelligence for everyday coding, writing & general automation on Vertex AI (1M context)',
    source: 'model_garden',
    gardenPublisherModel: 'publishers/anthropic/models/claude-sonnet-5-5',
  },
  {
    id: 'claude-haiku-5-5',
    name: 'Claude Haiku 5.5',
    company: 'Anthropic',
    description: 'Fastest, lowest-cost model for high-volume routing, classification & sub-agent pipelines on Vertex AI (1M context)',
    source: 'model_garden',
    gardenPublisherModel: 'publishers/anthropic/models/claude-haiku-5-5',
  },

  // Alibaba / Qwen Open-Weights Models in Vertex AI Model Garden (MaaS — self-service EULA)
  {
    id: 'qwen/qwen3-coder-480b-a35b-instruct-maas',
    name: 'Qwen 3 Coder 480B-A35B Instruct (MaaS)',
    company: 'Alibaba / Qwen',
    description: 'Serverless MaaS open-weights code generation, SQL synthesis & repository specialist',
    source: 'model_garden',
    gardenPublisherModel: 'publishers/qwen/models/qwen3-coder-480b-a35b-instruct-maas',
  },
  {
    id: 'qwen/qwen3-235b-a22b-instruct-2507-maas',
    name: 'Qwen 3 235B-A22B Instruct (MaaS)',
    company: 'Alibaba / Qwen',
    description: 'Flagship Mixture-of-Experts open-weights reasoning model on Vertex AI MaaS',
    source: 'model_garden',
    gardenPublisherModel: 'publishers/qwen/models/qwen3-235b-a22b-instruct-2507-maas',
  },
  {
    id: 'qwen/qwen-2.5-coder-32b-instruct',
    name: 'Qwen 2.5 Coder 32B Instruct',
    company: 'Alibaba / Qwen',
    description: 'Open-weights code generation, SQL synthesis & repository repair specialist',
    source: 'model_garden',
    gardenPublisherModel: 'publishers/qwen/models/qwen-2.5-coder-32b-instruct',
  },

  // DeepSeek Open-Weights Models on Vertex AI Model Garden (MaaS — self-service EULA)
  {
    id: 'deepseek-ai/deepseek-v3.2-maas',
    name: 'DeepSeek V3.2 (MaaS)',
    company: 'DeepSeek',
    description: 'High-efficiency MoE model for general synthesis and coding on Vertex AI MaaS',
    source: 'model_garden',
    gardenPublisherModel: 'publishers/deepseek-ai/models/deepseek-v3.2-maas',
  },
  {
    id: 'deepseek-ai/deepseek-r1-0528-maas',
    name: 'DeepSeek R1 0528 (MaaS)',
    company: 'DeepSeek',
    description: 'Reinforcement-learned chain-of-thought reasoning model on Vertex AI MaaS (us-central1)',
    source: 'model_garden',
    gardenPublisherModel: 'publishers/deepseek-ai/models/deepseek-r1-0528-maas',
  },

  // OpenAI on Vertex AI Model Garden / MaaS
  {
    id: 'openai/gpt-oss-120b-maas',
    name: 'OpenAI GPT-OSS 120B (MaaS)',
    company: 'OpenAI',
    description: 'Open-weights 120B model hosted on Vertex AI Serverless MaaS',
    source: 'model_garden',
    gardenPublisherModel: 'publishers/openai/models/gpt-oss-120b-maas',
  },

  // Meta Llama MaaS on Vertex AI Model Garden
  {
    id: 'meta/llama-3.3-70b-instruct-maas',
    name: 'Llama 3.3 70B Instruct (MaaS)',
    company: 'Meta',
    description: 'Serverless Model-as-a-Service open-weights instruction model on Vertex AI',
    source: 'model_garden',
    gardenPublisherModel: 'publishers/meta/models/llama-3.3-70b-instruct-maas',
  },
  {
    id: 'meta/llama-4-maverick-17b-128e-instruct-maas',
    name: 'Llama 4 Maverick 17B-128E (MaaS)',
    company: 'Meta',
    description: 'Multimodal MoE open-weights model on Vertex AI Model Garden',
    source: 'model_garden',
    gardenPublisherModel: 'publishers/meta/models/llama-4-maverick-17b-128e-instruct-maas',
  },

  // Mistral AI on Vertex AI Model Garden
  {
    id: 'mistralai/codestral-2',
    name: 'Codestral 2',
    company: 'Mistral AI',
    description: 'Low-latency code generation and fill-in-the-middle specialist on Vertex AI',
    source: 'model_garden',
    gardenPublisherModel: 'publishers/mistralai/models/codestral-2',
  },
  {
    id: 'mistralai/mistral-medium-3',
    name: 'Mistral Medium 3',
    company: 'Mistral AI',
    description: 'Dense reasoning and function-calling model in Vertex AI Model Garden',
    source: 'model_garden',
    gardenPublisherModel: 'publishers/mistralai/models/mistral-medium-3',
  },
];

export interface ApiKeyCompanyCatalogEntry {
  providerId: ApiKeyProviderId;
  companyName: string;
  badgeLabel: string;
  keyPlaceholder: string;
  envVarName: string;
  description: string;
  models: ModelCatalogItem[];
}

/**
 * The 4 API Key providers shown when Authentication Mode = 'api_keys'.
 * Each company has its own master On/Off switch, API key field, and nested list
 * of individual models with per-model On/Off switches and Code Gen Default radios.
 */
export const API_KEY_PROVIDER_CATALOG: ApiKeyCompanyCatalogEntry[] = [
  {
    providerId: 'gemini',
    companyName: 'Gemini API',
    badgeLabel: 'Google AI Studio',
    keyPlaceholder: 'AIzaSy...',
    envVarName: 'GEMINI_API_KEY',
    description: 'Google Gemini API key authentication for Gemini 3.8, 3.7, and 4 Argon models.',
    models: [
      {
        id: 'gemini-3.8-flash',
        name: 'Gemini 3.8 Flash',
        company: 'Google',
        description: 'Recommended default for fast multi-agent orchestration & ADK code generation',
        source: 'api_key',
        providerId: 'gemini',
      },
      {
        id: 'gemini-3.7-flash',
        name: 'Gemini 3.7 Flash',
        company: 'Google',
        description: 'Adaptive reasoning budget and high-frequency tool calling',
        source: 'api_key',
        providerId: 'gemini',
      },
      {
        id: 'gemini-4-argon',
        name: 'Gemini 4 Argon',
        company: 'Google',
        description: 'Frontier deep-reasoning and complex multi-step synthesis',
        source: 'api_key',
        providerId: 'gemini',
      },
    ],
  },
  {
    providerId: 'anthropic',
    companyName: 'Anthropic',
    badgeLabel: 'Claude API',
    keyPlaceholder: 'sk-ant-api03-...',
    envVarName: 'ANTHROPIC_API_KEY',
    description: 'Direct Anthropic API key authentication for Claude 5.x models (Fable 5.1, Opus 5.5, Sonnet 5.5, Haiku 5.5).',
    models: [
      {
        id: 'claude-fable-5-1',
        name: 'Claude Fable 5.1',
        company: 'Anthropic',
        description: 'Frontier tier for most demanding reasoning, multi-step research & long-horizon agentic workflows (1M context)',
        source: 'api_key',
        providerId: 'anthropic',
      },
      {
        id: 'claude-opus-5-5',
        name: 'Claude Opus 5.5',
        company: 'Anthropic',
        description: 'Flagship daily driver for long-running agentic coding, complex software migrations & heavy knowledge work (1M context)',
        source: 'api_key',
        providerId: 'anthropic',
      },
      {
        id: 'claude-sonnet-5-5',
        name: 'Claude Sonnet 5.5',
        company: 'Anthropic',
        description: 'Optimal blend of speed and intelligence for everyday coding, writing & general automation (1M context)',
        source: 'api_key',
        providerId: 'anthropic',
      },
      {
        id: 'claude-haiku-5-5',
        name: 'Claude Haiku 5.5',
        company: 'Anthropic',
        description: 'Fastest, lowest-cost model for high-volume routing, classification & sub-agent pipelines (1M context)',
        source: 'api_key',
        providerId: 'anthropic',
      },
    ],
  },
  {
    providerId: 'openai',
    companyName: 'OpenAI',
    badgeLabel: 'OpenAI Platform',
    keyPlaceholder: 'sk-proj-...',
    envVarName: 'OPENAI_API_KEY',
    description: 'Direct OpenAI API key authentication for GPT-6.x models (GPT-6 Astra, GPT-6.1 Sol, GPT-6 Sol, GPT-6 Luna).',
    models: [
      {
        id: 'gpt-6-astra',
        name: 'GPT-6 Astra',
        company: 'OpenAI',
        description: 'Highest-intelligence flagship model for demanding reasoning, multi-step coding & deep research',
        source: 'api_key',
        providerId: 'openai',
      },
      {
        id: 'gpt-6.1-sol',
        name: 'GPT-6.1 Sol',
        company: 'OpenAI',
        description: 'Balanced intelligence, speed, and cost with near-Astra performance for agentic coding workflows',
        source: 'api_key',
        providerId: 'openai',
      },
      {
        id: 'gpt-6-sol',
        name: 'GPT-6 Sol',
        company: 'OpenAI',
        description: 'Balanced GPT-6 workload model for software engineering and multi-step tool orchestration',
        source: 'api_key',
        providerId: 'openai',
      },
      {
        id: 'gpt-6-luna',
        name: 'GPT-6 Luna',
        company: 'OpenAI',
        description: 'Fastest, most cost-effective GPT-6 model for high-volume, latency-sensitive tasks',
        source: 'api_key',
        providerId: 'openai',
      },
    ],
  },
  {
    providerId: 'grok',
    companyName: 'Grok',
    badgeLabel: 'xAI API',
    keyPlaceholder: 'xai-...',
    envVarName: 'XAI_API_KEY',
    description: 'Direct xAI API key authentication for Grok 4.7 frontier reasoning & coding.',
    models: [
      {
        id: 'grok-4.7',
        name: 'Grok 4.7',
        company: 'xAI',
        description: 'xAI flagship frontier model (500K context) for advanced coding, complex agentic tasks & knowledge work',
        source: 'api_key',
        providerId: 'grok',
      },
    ],
  },
];

export type ModelGardenSortColumn = 'company' | 'name' | 'id';
export type SortDirection = 'asc' | 'desc';

/**
 * Deduplicates Model Garden catalog entries by canonical model ID, publisher model path,
 * and (company, display name) tuple, while excluding Always-On Core Gemini models.
 * Prevents duplicate rows when `gcloud ai model-garden models list` returns multiple
 * `versionId` entries for the same publisher model (e.g., `publishers/qwen/models/qwen2`).
 */
export function deduplicateModelGardenCatalog(models: ModelCatalogItem[]): ModelCatalogItem[] {
  if (!Array.isArray(models)) {
    return [];
  }

  const coreGeminiIds = new Set(ADC_CORE_GEMINI_MODELS.map((m) => m.id.toLowerCase()));
  const seenIds = new Set<string>();
  const seenPublisherModels = new Set<string>();
  const seenCompanyNames = new Set<string>();
  const uniqueModels: ModelCatalogItem[] = [];

  for (const model of models) {
    if (!model || typeof model !== 'object') continue;
    const idKey = (model.id || '').trim().toLowerCase();
    if (!idKey || coreGeminiIds.has(idKey)) continue;

    const pubKey = (model.gardenPublisherModel || '').trim().toLowerCase();
    const companyNameKey = `${(model.company || '').trim().toLowerCase()}::${(model.name || '').trim().toLowerCase()}`;

    if (
      seenIds.has(idKey) ||
      (pubKey && seenPublisherModels.has(pubKey)) ||
      seenCompanyNames.has(companyNameKey)
    ) {
      continue;
    }

    seenIds.add(idKey);
    if (pubKey) {
      seenPublisherModels.add(pubKey);
    }
    seenCompanyNames.add(companyNameKey);
    uniqueModels.push(model);
  }

  return uniqueModels;
}

/**
 * Filters and sorts the Vertex AI Model Garden catalog by search query and column,
 * automatically deduplicating any repeated model versions.
 */
export function filterAndSortModelGarden(
  models: ModelCatalogItem[],
  searchQuery: string,
  sortColumn: ModelGardenSortColumn = 'company',
  sortDirection: SortDirection = 'asc'
): ModelCatalogItem[] {
  const uniqueModels = deduplicateModelGardenCatalog(models);
  const trimmed = (searchQuery || '').trim().toLowerCase();

  const filtered = trimmed
    ? uniqueModels.filter(
        (m) =>
          m.name.toLowerCase().includes(trimmed) ||
          m.id.toLowerCase().includes(trimmed) ||
          m.company.toLowerCase().includes(trimmed) ||
          (m.description && m.description.toLowerCase().includes(trimmed))
      )
    : [...uniqueModels];

  filtered.sort((a, b) => {
    let comparison = 0;
    if (sortColumn === 'company') {
      comparison = a.company.localeCompare(b.company);
      if (comparison === 0) {
        comparison = a.name.localeCompare(b.name);
      }
    } else if (sortColumn === 'name') {
      comparison = a.name.localeCompare(b.name);
    } else {
      comparison = a.id.localeCompare(b.id);
    }
    return sortDirection === 'asc' ? comparison : -comparison;
  });

  return filtered;
}

export interface ModelsValidationResult {
  isValid: boolean;
  enabledModelsCount: number;
  hasValidDefault: boolean;
  errors: string[];
}

/**
 * Validates ADC Mode model configuration:
 * Ensures at least 1 model is enabled and 1 enabled model is set as Code Gen Default.
 */
export function validateAdcModelSettings(
  enabledGardenModelIds: string[],
  codeGenDefaultModel: string,
  gardenCatalog: ModelCatalogItem[] = DEFAULT_MODEL_GARDEN_CATALOG
): ModelsValidationResult {
  const alwaysOnIds = ADC_CORE_GEMINI_MODELS.map((m) => m.id);
  const validGardenIds = enabledGardenModelIds.filter((id) =>
    gardenCatalog.some((g) => g.id === id)
  );
  const allEnabledIds = Array.from(new Set([...alwaysOnIds, ...validGardenIds]));

  const errors: string[] = [];
  if (allEnabledIds.length === 0) {
    errors.push('At least 1 model must be enabled.');
  }

  const hasValidDefault = Boolean(
    codeGenDefaultModel && allEnabledIds.includes(codeGenDefaultModel)
  );
  if (!hasValidDefault) {
    errors.push('Exactly 1 enabled model must be selected as the Code Generation Default.');
  }

  return {
    isValid: errors.length === 0,
    enabledModelsCount: allEnabledIds.length,
    hasValidDefault,
    errors,
  };
}

/**
 * Validates API Keys Mode configuration:
 * Requires at least 1 company enabled with a non-empty API key, at least 1 model enabled,
 * and 1 enabled model selected as the Code Generation Default.
 */
export function validateApiKeyModelSettings(
  providers: Record<ApiKeyProviderId, ApiKeyProviderConfig>,
  codeGenDefaultModel: string
): ModelsValidationResult {
  const errors: string[] = [];
  const enabledModelIds: string[] = [];
  let enabledProvidersWithKey = 0;

  for (const company of API_KEY_PROVIDER_CATALOG) {
    const cfg = providers?.[company.providerId];
    if (cfg && cfg.enabled) {
      if (!cfg.apiKey || !cfg.apiKey.trim()) {
        errors.push(`${company.companyName} is enabled but is missing an API Key.`);
      } else {
        enabledProvidersWithKey += 1;
        for (const model of company.models) {
          if (cfg.enabledModels.includes(model.id)) {
            enabledModelIds.push(model.id);
          }
        }
      }
    }
  }

  if (enabledProvidersWithKey === 0) {
    errors.push('Error: No API Keys defined. At least 1 provider must be enabled with a valid API Key.');
  }

  if (enabledModelIds.length === 0) {
    errors.push('At least 1 model must be enabled under an active API Key provider.');
  }

  const hasValidDefault = Boolean(
    codeGenDefaultModel && enabledModelIds.includes(codeGenDefaultModel)
  );
  if (!hasValidDefault) {
    errors.push('At least 1 enabled model must be selected as the Code Generation Default.');
  }

  return {
    isValid: errors.length === 0,
    enabledModelsCount: enabledModelIds.length,
    hasValidDefault,
    errors,
  };
}

/**
 * Computes the active list of enabled models based on the current PluginSettings
 * (either ADC mode: 3 always-on Gemini models + enabled Model Garden models,
 * or API Keys mode: enabled models from enabled companies with configured keys).
 */
export function getEnabledModelsForSettings(
  settings?: {
    authMode?: ModelAuthMode;
    adcEnabledGardenModels?: string[];
    apiKeyProviders?: Record<ApiKeyProviderId, ApiKeyProviderConfig>;
    codeGenDefaultModel?: string;
  },
  gardenCatalog: ModelCatalogItem[] = DEFAULT_MODEL_GARDEN_CATALOG
): ModelCatalogItem[] {
  if (!settings || settings.authMode !== 'api_keys') {
    const enabledGardenSet = new Set(settings?.adcEnabledGardenModels || []);
    const enabledGardenModels = gardenCatalog.filter((m) => enabledGardenSet.has(m.id));
    return [...ADC_CORE_GEMINI_MODELS, ...enabledGardenModels];
  }

  // API Keys mode: collect enabled models for enabled companies
  const results: ModelCatalogItem[] = [];
  const providers = settings.apiKeyProviders;
  if (providers) {
    for (const company of API_KEY_PROVIDER_CATALOG) {
      const providerConfig = providers[company.providerId];
      if (providerConfig && providerConfig.enabled) {
        const enabledSet = new Set(providerConfig.enabledModels || []);
        for (const model of company.models) {
          if (enabledSet.has(model.id)) {
            results.push(model);
          }
        }
      }
    }
  }

  // Guarantee at least the default Gemini 3.8 Flash model if none are enabled yet
  if (results.length === 0) {
    return [...ADC_CORE_GEMINI_MODELS];
  }

  return results;
}

/**
 * Ensures the Code Gen Default model is always a valid enabled model.
 */
export function resolveEffectiveCodeGenDefault(
  enabledModels: ModelCatalogItem[],
  preferredDefault?: string
): string {
  if (preferredDefault && enabledModels.some((m) => m.id === preferredDefault)) {
    return preferredDefault;
  }
  return enabledModels[0]?.id || DEFAULT_CODE_GEN_MODEL_ID;
}
