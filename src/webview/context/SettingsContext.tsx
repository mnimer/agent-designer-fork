/**
 * SettingsContext.tsx - Global Settings State Provider
 *
 * Purpose:
 * Provides application-wide configuration settings for Models (ADC vs. API Keys,
 * Always-On Gemini Foundation Models, GCP Vertex AI Model Garden toggles, per-company
 * and per-model API Key toggles, Code Generation Default model selection) and Global
 * Skills (Claude Desktop / Antigravity style SKILL.md library), with persistence
 * to localStorage.
 *
 * Architectural Decisions:
 * - Author: Mike Nimer <mikenimer@google.com>
 * - Guards against corrupt or non-string serialized localStorage entries and deep-merges
 *   nested provider configurations so newly added catalog providers/skills hydrate cleanly.
 * - Exposes `useOptionalPluginSettings()` for unit-tested leaf components (like ModelSelector)
 *   that may be mounted outside of a SettingsProvider.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import {
  FrameworkType,
  LanguageType,
  DelegationPattern,
  AgentMemoryType,
  ModelAuthMode,
  ApiKeyProviderId,
  ApiKeyProviderConfig,
  ModelCatalogItem,
  AgentSkillDefinition,
} from '../types';
import {
  API_KEY_PROVIDER_CATALOG,
  DEFAULT_CODE_GEN_MODEL_ID,
  getEnabledModelsForSettings,
  resolveEffectiveCodeGenDefault,
} from '../data/modelCatalog';
import { DEFAULT_GLOBAL_SKILLS } from '../data/defaultSkills';

export interface PluginSettings {
  // 1. Model Authentication Mode & Selection
  authMode: ModelAuthMode;
  codeGenDefaultModel: string;
  adcEnabledGardenModels: string[];
  apiKeyProviders: Record<ApiKeyProviderId, ApiKeyProviderConfig>;

  // Legacy flat API Key fields kept in sync for backward compatibility
  geminiApiKey: string;
  claudeApiKey: string;
  openaiApiKey: string;
  grokApiKey: string;

  // 2. Global Skills Library (Settings -> Skills page)
  globalSkills: AgentSkillDefinition[];

  // 3. Default Framework & Code Generation Preferences
  defaultFramework: FrameworkType;
  defaultLanguage: LanguageType;
  defaultOutputFolder: string;
  defaultDeploymentTarget: 'cloud_run' | 'agent_engine' | 'local';
  defaultIncludeTests: boolean;
  defaultIncludeDocker: boolean;
  defaultUseStreaming: boolean;

  // 4. Default Agent Node Properties
  defaultModel: string;
  defaultTemperature: number;
  defaultMemoryType: AgentMemoryType;
  defaultSubAgentPattern: DelegationPattern;
  defaultMaxIterations: number;

  // 5. Cloud & GCP Defaults
  defaultGcpProject: string;
  defaultGcpRegion: string;

  // 6. Canvas & Editor Preferences
  autoLayoutDirection: 'TB' | 'LR';
  snapToGrid: boolean;
  showMiniMap: boolean;
  defaultAgentTheme?: string;
  useStreamingByDefault?: boolean;
  [key: string]: any;
}

export const DEFAULT_API_KEY_PROVIDERS: Record<ApiKeyProviderId, ApiKeyProviderConfig> = {
  gemini: {
    providerId: 'gemini',
    enabled: true,
    apiKey: '',
    enabledModels: ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-4-argon'],
  },
  anthropic: {
    providerId: 'anthropic',
    enabled: false,
    apiKey: '',
    enabledModels: [
      'claude-fable-5-1',
      'claude-opus-5-5',
      'claude-sonnet-5-5',
      'claude-haiku-5-5',
    ],
  },
  openai: {
    providerId: 'openai',
    enabled: false,
    apiKey: '',
    enabledModels: ['gpt-6-astra', 'gpt-6.1-sol', 'gpt-6-sol', 'gpt-6-luna'],
  },
  grok: {
    providerId: 'grok',
    enabled: false,
    apiKey: '',
    enabledModels: ['grok-4.7'],
  },
};

export const DEFAULT_SETTINGS: PluginSettings = {
  authMode: 'adc',
  codeGenDefaultModel: DEFAULT_CODE_GEN_MODEL_ID,
  // Model Garden models are OFF by default until verified/enabled in the user's GCP project
  adcEnabledGardenModels: [],
  adcGardenVerified: true,
  apiKeyProviders: DEFAULT_API_KEY_PROVIDERS,
  geminiApiKey: '',
  claudeApiKey: '',
  openaiApiKey: '',
  grokApiKey: '',
  globalSkills: DEFAULT_GLOBAL_SKILLS,
  defaultFramework: 'google_adk',
  defaultLanguage: 'python',
  defaultOutputFolder: './',
  defaultDeploymentTarget: 'agent_engine',
  defaultIncludeTests: true,
  defaultIncludeDocker: true,
  defaultUseStreaming: true,
  defaultModel: DEFAULT_CODE_GEN_MODEL_ID,
  defaultTemperature: 0.7,
  defaultMemoryType: 'in_memory',
  defaultSubAgentPattern: 'parallel',
  defaultMaxIterations: 10,
  defaultGcpProject: '',
  defaultGcpRegion: 'global',
  autoLayoutDirection: 'TB',
  snapToGrid: true,
  showMiniMap: true,
};

const STORAGE_KEY = 'vscode_agent_flow_plugin_settings_v1';

export interface SettingsContextType {
  settings: PluginSettings;
  enabledModels: ModelCatalogItem[];
  updateSettings: (partial: Partial<PluginSettings>) => void;
  resetSettings: () => void;
  exportSettingsJson: (geminiSet?: boolean) => string;
  toggleGardenModel: (modelId: string, enabled?: boolean) => void;
  setCodeGenDefaultModel: (modelId: string) => void;
  updateApiKeyProvider: (
    providerId: ApiKeyProviderId,
    partial: Partial<ApiKeyProviderConfig>
  ) => void;
  toggleApiKeyModel: (
    providerId: ApiKeyProviderId,
    modelId: string,
    enabled?: boolean
  ) => void;
  saveGlobalSkill: (skill: AgentSkillDefinition) => void;
  deleteGlobalSkill: (skillId: string) => void;
  activeEditorTab: 'flow' | 'settings';
  setActiveEditorTab: (tab: 'flow' | 'settings') => void;
  activeSettingsMenu: 'models' | 'skills';
  setActiveSettingsMenu: (menu: 'models' | 'skills') => void;
  openSettings: (menu?: 'models' | 'skills') => void;
  openFlow: () => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

function mergeHydratedSettings(parsed: Record<string, any>): PluginSettings {
  const mergedProviders: Record<ApiKeyProviderId, ApiKeyProviderConfig> = {
    gemini: {
      ...DEFAULT_API_KEY_PROVIDERS.gemini,
      ...(parsed.apiKeyProviders?.gemini || {}),
    },
    anthropic: {
      ...DEFAULT_API_KEY_PROVIDERS.anthropic,
      ...(parsed.apiKeyProviders?.anthropic || {}),
    },
    openai: {
      ...DEFAULT_API_KEY_PROVIDERS.openai,
      ...(parsed.apiKeyProviders?.openai || {}),
    },
    grok: {
      ...DEFAULT_API_KEY_PROVIDERS.grok,
      ...(parsed.apiKeyProviders?.grok || {}),
    },
  };

  // Ensure hydrated enabledModels only reference valid current catalog IDs
  for (const company of API_KEY_PROVIDER_CATALOG) {
    const validCatalogIds = new Set(company.models.map((m) => m.id));
    const currentProvider = mergedProviders[company.providerId];
    if (currentProvider && Array.isArray(currentProvider.enabledModels)) {
      const validSaved = currentProvider.enabledModels.filter((id) => validCatalogIds.has(id));
      currentProvider.enabledModels =
        validSaved.length > 0
          ? validSaved
          : [...DEFAULT_API_KEY_PROVIDERS[company.providerId].enabledModels];
    }
  }

  // Sync legacy flat keys if present
  if (parsed.geminiApiKey && !mergedProviders.gemini.apiKey) {
    mergedProviders.gemini.apiKey = parsed.geminiApiKey;
  }
  if (parsed.claudeApiKey && !mergedProviders.anthropic.apiKey) {
    mergedProviders.anthropic.apiKey = parsed.claudeApiKey;
  }
  if (parsed.openaiApiKey && !mergedProviders.openai.apiKey) {
    mergedProviders.openai.apiKey = parsed.openaiApiKey;
  }
  if (parsed.grokApiKey && !mergedProviders.grok.apiKey) {
    mergedProviders.grok.apiKey = parsed.grokApiKey;
  }

  // Strip legacy unverified hardcoded default Model Garden IDs if adcGardenVerified was not set
  const hydratedGardenModels =
    parsed.adcGardenVerified === true && Array.isArray(parsed.adcEnabledGardenModels)
      ? parsed.adcEnabledGardenModels
      : [];

  const merged: PluginSettings = {
    ...DEFAULT_SETTINGS,
    ...parsed,
    adcGardenVerified: true,
    apiKeyProviders: mergedProviders,
    adcEnabledGardenModels: hydratedGardenModels,
    globalSkills: Array.isArray(parsed.globalSkills)
      ? parsed.globalSkills
      : DEFAULT_GLOBAL_SKILLS,
  };
  const nextEnabled = getEnabledModelsForSettings(merged);
  merged.codeGenDefaultModel = resolveEffectiveCodeGenDefault(
    nextEnabled,
    merged.codeGenDefaultModel
  );
  return merged;
}

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<PluginSettings>(() => {
    try {
      if (typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved && saved !== 'undefined' && saved !== 'null') {
          const parsed = JSON.parse(saved);
          if (typeof parsed === 'object' && parsed !== null) {
            return mergeHydratedSettings(parsed);
          }
        }
      }
    } catch (e) {
      console.warn('Failed to parse saved settings:', e);
    }
    return DEFAULT_SETTINGS;
  });

  const [activeEditorTab, setActiveEditorTab] = useState<'flow' | 'settings'>('flow');
  const [activeSettingsMenu, setActiveSettingsMenu] = useState<'models' | 'skills'>('models');

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
      console.warn('Failed to persist settings:', e);
    }
  }, [settings]);

  const enabledModels = useMemo(() => getEnabledModelsForSettings(settings), [settings]);

  const updateSettings = useCallback((partial: Partial<PluginSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      const nextEnabled = getEnabledModelsForSettings(next);
      next.codeGenDefaultModel = resolveEffectiveCodeGenDefault(
        nextEnabled,
        next.codeGenDefaultModel
      );
      next.defaultModel = next.codeGenDefaultModel;
      return next;
    });
  }, []);

  const toggleGardenModel = useCallback((modelId: string, explicitEnabled?: boolean) => {
    setSettings((prev) => {
      const currentSet = new Set(prev.adcEnabledGardenModels || []);
      const shouldEnable =
        explicitEnabled !== undefined ? explicitEnabled : !currentSet.has(modelId);
      if (shouldEnable) {
        currentSet.add(modelId);
      } else {
        currentSet.delete(modelId);
      }
      const nextGarden = Array.from(currentSet);
      const nextState: PluginSettings = {
        ...prev,
        adcEnabledGardenModels: nextGarden,
      };
      const nextEnabled = getEnabledModelsForSettings(nextState);
      nextState.codeGenDefaultModel = resolveEffectiveCodeGenDefault(
        nextEnabled,
        prev.codeGenDefaultModel
      );
      return nextState;
    });
  }, []);

  const setCodeGenDefaultModel = useCallback((modelId: string) => {
    setSettings((prev) => {
      const nextState: PluginSettings = {
        ...prev,
        codeGenDefaultModel: modelId,
        defaultModel: modelId,
      };
      // If in ADC mode and user picks a Model Garden model as Code Gen Default, ensure it is enabled
      if (
        prev.authMode === 'adc' &&
        !['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-4-argon'].includes(modelId) &&
        !prev.adcEnabledGardenModels.includes(modelId)
      ) {
        nextState.adcEnabledGardenModels = [...prev.adcEnabledGardenModels, modelId];
      }
      return nextState;
    });
  }, []);

  const updateApiKeyProvider = useCallback(
    (providerId: ApiKeyProviderId, partial: Partial<ApiKeyProviderConfig>) => {
      setSettings((prev) => {
        const existing = prev.apiKeyProviders[providerId] || DEFAULT_API_KEY_PROVIDERS[providerId];
        const updatedProvider: ApiKeyProviderConfig = {
          ...existing,
          ...partial,
          providerId,
        };

        // If enabling a provider that currently has 0 enabled models, enable its first model by default
        if (partial.enabled === true && updatedProvider.enabledModels.length === 0) {
          const catalogEntry = API_KEY_PROVIDER_CATALOG.find((c) => c.providerId === providerId);
          if (catalogEntry && catalogEntry.models.length > 0) {
            updatedProvider.enabledModels = [catalogEntry.models[0].id];
          }
        }

        const nextProviders = {
          ...prev.apiKeyProviders,
          [providerId]: updatedProvider,
        };

        const nextState: PluginSettings = {
          ...prev,
          apiKeyProviders: nextProviders,
          geminiApiKey:
            providerId === 'gemini' && partial.apiKey !== undefined
              ? partial.apiKey
              : prev.geminiApiKey,
          claudeApiKey:
            providerId === 'anthropic' && partial.apiKey !== undefined
              ? partial.apiKey
              : prev.claudeApiKey,
          openaiApiKey:
            providerId === 'openai' && partial.apiKey !== undefined
              ? partial.apiKey
              : prev.openaiApiKey,
          grokApiKey:
            providerId === 'grok' && partial.apiKey !== undefined
              ? partial.apiKey
              : prev.grokApiKey,
        };

        const nextEnabled = getEnabledModelsForSettings(nextState);
        nextState.codeGenDefaultModel = resolveEffectiveCodeGenDefault(
          nextEnabled,
          prev.codeGenDefaultModel
        );
        return nextState;
      });
    },
    []
  );

  const toggleApiKeyModel = useCallback(
    (providerId: ApiKeyProviderId, modelId: string, explicitEnabled?: boolean) => {
      setSettings((prev) => {
        const existing = prev.apiKeyProviders[providerId] || DEFAULT_API_KEY_PROVIDERS[providerId];
        const set = new Set(existing.enabledModels || []);
        const shouldEnable =
          explicitEnabled !== undefined ? explicitEnabled : !set.has(modelId);
        if (shouldEnable) {
          set.add(modelId);
        } else {
          set.delete(modelId);
        }
        const updatedModels = Array.from(set);
        const nextProviders = {
          ...prev.apiKeyProviders,
          [providerId]: {
            ...existing,
            enabled: updatedModels.length > 0 ? existing.enabled : false,
            enabledModels: updatedModels,
          },
        };
        const nextState: PluginSettings = {
          ...prev,
          apiKeyProviders: nextProviders,
        };
        const nextEnabled = getEnabledModelsForSettings(nextState);
        nextState.codeGenDefaultModel = resolveEffectiveCodeGenDefault(
          nextEnabled,
          prev.codeGenDefaultModel
        );
        return nextState;
      });
    },
    []
  );

  const saveGlobalSkill = useCallback((skill: AgentSkillDefinition) => {
    setSettings((prev) => {
      const normalized: AgentSkillDefinition = {
        ...skill,
        scope: 'global',
        updatedAt: new Date().toISOString(),
      };
      const existsIdx = prev.globalSkills.findIndex(
        (s) => s.id === normalized.id || s.name === normalized.name
      );
      let nextSkills: AgentSkillDefinition[];
      if (existsIdx >= 0) {
        nextSkills = prev.globalSkills.map((s, idx) =>
          idx === existsIdx ? { ...s, ...normalized } : s
        );
      } else {
        nextSkills = [
          ...prev.globalSkills,
          { ...normalized, createdAt: normalized.createdAt || new Date().toISOString() },
        ];
      }
      return {
        ...prev,
        globalSkills: nextSkills,
      };
    });
  }, []);

  const deleteGlobalSkill = useCallback((skillId: string) => {
    setSettings((prev) => ({
      ...prev,
      globalSkills: prev.globalSkills.filter((s) => s.id !== skillId && s.name !== skillId),
    }));
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.warn('Failed to reset settings storage:', e);
    }
  }, []);

  const exportSettingsJson = useCallback(
    (geminiSet?: boolean) => {
      const exported = {
        'agentFlow.authMode': settings.authMode,
        'agentFlow.codeGenDefaultModel': settings.codeGenDefaultModel,
        'agentFlow.adcEnabledGardenModels': settings.adcEnabledGardenModels,
        'agentFlow.apiKeys': {
          gemini:
            (geminiSet !== undefined ? geminiSet : !!settings.apiKeyProviders.gemini?.apiKey)
              ? '***'
              : 'gcloud application-default',
          anthropic: settings.apiKeyProviders.anthropic?.apiKey ? '***' : '',
          openai: settings.apiKeyProviders.openai?.apiKey ? '***' : '',
          grok: settings.apiKeyProviders.grok?.apiKey ? '***' : '',
        },
        'agentFlow.globalSkills': settings.globalSkills.map((s) => ({
          name: s.name,
          title: s.title,
          description: s.description,
        })),
        'agentFlow.defaults': {
          framework: settings.defaultFramework,
          language: settings.defaultLanguage,
          outputFolder: settings.defaultOutputFolder,
          deploymentTarget: settings.defaultDeploymentTarget,
          includeTests: settings.defaultIncludeTests,
          includeDocker: settings.defaultIncludeDocker,
          useStreaming: settings.defaultUseStreaming,
          model: settings.codeGenDefaultModel || settings.defaultModel,
          temperature: settings.defaultTemperature,
          memoryType: settings.defaultMemoryType,
          subAgentPattern: settings.defaultSubAgentPattern,
          maxIterations: settings.defaultMaxIterations,
          gcpProject: settings.defaultGcpProject,
          gcpRegion: settings.defaultGcpRegion,
        },
      };
      return JSON.stringify(exported, null, 2);
    },
    [settings]
  );

  const openSettings = useCallback((menu?: 'models' | 'skills') => {
    if (menu) {
      setActiveSettingsMenu(menu);
    }
    setActiveEditorTab('settings');
  }, []);

  const openFlow = useCallback(() => {
    setActiveEditorTab('flow');
  }, []);

  return (
    <SettingsContext.Provider
      value={{
        settings,
        enabledModels,
        updateSettings,
        resetSettings,
        exportSettingsJson,
        toggleGardenModel,
        setCodeGenDefaultModel,
        updateApiKeyProvider,
        toggleApiKeyModel,
        saveGlobalSkill,
        deleteGlobalSkill,
        activeEditorTab,
        setActiveEditorTab,
        activeSettingsMenu,
        setActiveSettingsMenu,
        openSettings,
        openFlow,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
};

export const usePluginSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('usePluginSettings must be used within a SettingsProvider');
  }
  return context;
};

/**
 * Safe optional hook for components (such as ModelSelector or CodePreviewTab) that may
 * be rendered standalone in unit tests without a wrapping SettingsProvider.
 */
export const useOptionalPluginSettings = (): SettingsContextType | undefined => {
  return useContext(SettingsContext);
};
