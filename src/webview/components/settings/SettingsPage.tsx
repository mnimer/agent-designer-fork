/**
 * SettingsPage.tsx
 *
 * Main Plugin Settings screen with a 2-option left navigation sidebar:
 * 1. Models (`ModelsSettingsTab`): GCP Application Default Credentials (ADC) with
 *    Always-On Gemini models + Vertex AI Model Garden data table, or Direct Provider
 *    API Keys (Gemini API, Anthropic, OpenAI, Grok) with per-company and per-model toggles.
 * 2. Skills (`SkillsSettingsTab`): Global Skills Library & SKILL.md Editor.
 *
 * Author: Mike Nimer <mikenimer@google.com>
 */

import React, { useEffect } from 'react';
import {
  Cpu,
  BookOpen,
  RotateCcw,
  ArrowLeft,
  Settings,
} from 'lucide-react';
import { usePluginSettings, SettingsMenuOption } from '../../context/SettingsContext';
import { useWebviewBridge } from '../../hooks/useWebviewBridge';
import { ModelsSettingsTab } from './ModelsSettingsTab';
import { SkillsSettingsTab } from './SkillsSettingsTab';

export const SettingsPage: React.FC = () => {
  const {
    settings,
    enabledModels,
    resetSettings,
    openFlow,
    activeSettingsMenu,
    setActiveSettingsMenu,
  } = usePluginSettings();
  const bridge = useWebviewBridge();

  useEffect(() => {
    bridge.postMessage({ type: 'REQUEST_SETTINGS' });
  }, [bridge]);

  const menuOptions: {
    id: SettingsMenuOption;
    label: string;
    subtitle: string;
    badge: string;
    icon: React.ReactNode;
  }[] = [
    {
      id: 'models',
      label: 'Models',
      subtitle: 'ADC, Model Garden & API Keys',
      badge: `${enabledModels.length} Active`,
      icon: <Cpu className="w-4 h-4 text-blue-400" />,
    },
    {
      id: 'skills',
      label: 'Skills',
      subtitle: 'Global SKILL.md Library',
      badge: `${settings.globalSkills.length} Skills`,
      icon: <BookOpen className="w-4 h-4 text-purple-400" />,
    },
  ];

  return (
    <div
      className="flex-1 flex flex-col h-full bg-[var(--vscode-workbench-bg)] text-[var(--vscode-text-primary)] select-text overflow-hidden"
      data-testid="plugin-settings-page"
    >
      {/* Top Settings Header */}
      <div className="border-b border-[var(--vscode-border)] bg-[var(--vscode-workbench-bg)] px-6 py-4 shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Settings className="w-4 h-4 text-blue-500" />
          <span className="text-sm font-bold tracking-tight">
            Visual AI Agent Designer — Plugin Settings
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="reset-settings-defaults-btn"
            onClick={resetSettings}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 border border-rose-500/20 transition-colors cursor-pointer"
            title="Reset all settings to factory defaults"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Defaults</span>
          </button>
        </div>
      </div>

      {/* Main Body: Left Sidebar (2 Menu Options) + Active Page */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left Navigation Sidebar with 2 Menu Options */}
        <aside
          className="w-64 border-r border-[var(--vscode-border)] bg-[var(--vscode-activity-bar)] p-4 flex flex-col justify-between shrink-0 select-none"
          aria-label="Settings Sidebar Navigation"
          data-testid="settings-left-sidebar"
        >
          <div className="space-y-2">
            <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--vscode-text-muted)]">
              Settings Menu
            </div>

            {menuOptions.map((item) => {
              const isActive = activeSettingsMenu === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  data-testid={`settings-menu-${item.id}`}
                  onClick={() => setActiveSettingsMenu(item.id)}
                  className={`w-full text-left p-3 rounded-xl flex items-center justify-between transition-all cursor-pointer border ${
                    isActive
                      ? 'bg-blue-600/15 text-blue-400 font-semibold border-blue-500/40 shadow-sm'
                      : 'border-transparent text-[var(--vscode-text-secondary)] hover:bg-[var(--vscode-hover)] hover:text-[var(--vscode-text-primary)]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {item.icon}
                    <div className="min-w-0">
                      <div className="text-xs font-bold truncate">{item.label}</div>
                      <div className="text-[10px] text-[var(--vscode-text-muted)] truncate">
                        {item.subtitle}
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--vscode-workbench-bg)] border border-[var(--vscode-border)] shrink-0">
                    {item.badge}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="pt-4 border-t border-[var(--vscode-border)]">
            <button
              type="button"
              data-testid="back-to-canvas-btn"
              onClick={openFlow}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-sm transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Agent Canvas</span>
            </button>
          </div>
        </aside>

        {/* Active Settings Content Area */}
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-6xl mx-auto">
            {activeSettingsMenu === 'models' ? <ModelsSettingsTab /> : <SkillsSettingsTab />}
          </div>
        </main>
      </div>
    </div>
  );
};
