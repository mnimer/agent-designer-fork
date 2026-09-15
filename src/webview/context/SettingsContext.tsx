/**
 * SettingsContext.tsx - Global Settings State Provider
 *
 * Purpose:
 * Provides application-wide configuration settings with persistence to localStorage.
 *
 * Architectural Decisions:
 * - Author: Mike Nimer <mikenimer@google.com>
 * - Guards against corrupt or non-string serialized localStorage entries.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { FrameworkType, LanguageType, DelegationPattern, AgentMemoryType } from '../types';

export interface PluginSettings {
  // 1. Model API Keys
  geminiApiKey: string;
  claudeApiKey: string;
  openaiApiKey: string;
  grokApiKey: string;

  // 2. Default Framework & Code Generation Preferences
  defaultFramework: FrameworkType;
  defaultLanguage: LanguageType;
  defaultOutputFolder: string;
  defaultDeploymentTarget: 'cloud_run' | 'agent_engine' | 'local';
  defaultIncludeTests: boolean;
  defaultIncludeDocker: boolean;
  defaultUseStreaming: boolean;

  // 3. Default Agent Node Properties
  defaultModel: string;
  defaultTemperature: number;
  defaultMemoryType: AgentMemoryType;
  defaultSubAgentPattern: DelegationPattern;
  defaultMaxIterations: number;

  // 4. Cloud & GCP Defaults
  defaultGcpProject: string;
  defaultGcpRegion: string;

  // 5. Canvas & Editor Preferences
  autoLayoutDirection: 'TB' | 'LR';
  snapToGrid: boolean;
  showMiniMap: boolean;
  defaultAgentTheme?: string;
  useStreamingByDefault?: boolean;
  [key: string]: any;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  geminiApiKey: '',
  claudeApiKey: '',
  openaiApiKey: '',
  grokApiKey: '',
  defaultFramework: 'google_adk',
  defaultLanguage: 'python',
  defaultOutputFolder: './',
  defaultDeploymentTarget: 'agent_engine',
  defaultIncludeTests: true,
  defaultIncludeDocker: true,
  defaultUseStreaming: true,
  defaultModel: 'gemini-3.8-flash',
  defaultTemperature: 0.7,
  defaultMemoryType: 'none',
  defaultSubAgentPattern: 'parallel',
  defaultMaxIterations: 10,
  defaultGcpProject: 'my-gcp-ai-agents',
  defaultGcpRegion: 'global',
  autoLayoutDirection: 'TB',
  snapToGrid: true,
  showMiniMap: true,
};

const STORAGE_KEY = 'vscode_agent_flow_plugin_settings_v1';

interface SettingsContextType {
  settings: PluginSettings;
  updateSettings: (partial: Partial<PluginSettings>) => void;
  resetSettings: () => void;
  exportSettingsJson: (geminiSet?: boolean) => string;
  activeEditorTab: 'flow' | 'settings';
  setActiveEditorTab: (tab: 'flow' | 'settings') => void;
  openSettings: () => void;
  openFlow: () => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<PluginSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && saved !== 'undefined' && saved !== 'null') {
        const parsed = JSON.parse(saved);
        if (typeof parsed === 'object' && parsed !== null) {
          return { ...DEFAULT_SETTINGS, ...parsed };
        }
      }
    } catch (e) {
      console.warn('Failed to parse saved settings:', e);
    }
    return DEFAULT_SETTINGS;
  });

  const [activeEditorTab, setActiveEditorTab] = useState<'flow' | 'settings'>('flow');

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
      console.warn('Failed to persist settings:', e);
    }
  }, [settings]);

  const updateSettings = useCallback((partial: Partial<PluginSettings>) => {
    setSettings((prev) => ({ ...prev, ...partial }));
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.warn('Failed to reset settings storage:', e);
    }
  }, []);

  const exportSettingsJson = useCallback((geminiSet?: boolean) => {
    const exported = {
      "agentFlow.apiKeys": {
        "gemini": (geminiSet !== undefined ? geminiSet : !!settings.geminiApiKey) ? "***" : "gcloud application-default",
        "claude": settings.claudeApiKey ? "***" : "",
        "openai": settings.openaiApiKey ? "***" : "",
        "grok": settings.grokApiKey ? "***" : "",
      },
      "agentFlow.defaults": {
        "framework": settings.defaultFramework,
        "language": settings.defaultLanguage,
        "outputFolder": settings.defaultOutputFolder,
        "deploymentTarget": settings.defaultDeploymentTarget,
        "includeTests": settings.defaultIncludeTests,
        "includeDocker": settings.defaultIncludeDocker,
        "useStreaming": settings.defaultUseStreaming,
        "model": settings.defaultModel,
        "temperature": settings.defaultTemperature,
        "memoryType": settings.defaultMemoryType,
        "subAgentPattern": settings.defaultSubAgentPattern,
        "maxIterations": settings.defaultMaxIterations,
        "gcpProject": settings.defaultGcpProject,
        "gcpRegion": settings.defaultGcpRegion,
      },
      "agentFlow.editor": {
        "autoLayoutDirection": settings.autoLayoutDirection,
        "snapToGrid": settings.snapToGrid,
        "showMiniMap": settings.showMiniMap,
      }
    };
    return JSON.stringify(exported, null, 2);
  }, [settings]);

  const openSettings = useCallback(() => {
    setActiveEditorTab('settings');
  }, []);

  const openFlow = useCallback(() => {
    setActiveEditorTab('flow');
  }, []);

  return (
    <SettingsContext.Provider
      value={{
        settings,
        updateSettings,
        resetSettings,
        exportSettingsJson,
        activeEditorTab,
        setActiveEditorTab,
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
