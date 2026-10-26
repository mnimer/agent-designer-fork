/**
 * CodeGenerationPanel.tsx - Bottom Tab Panel Orchestrator
 *
 * Purpose:
 * Renders the bottom workbench split panel in the agent designer webview.
 * Coordinates tab selection between Code Generation, Deployment, Test Runner,
 * and Interactive Chat, delegating specific rendering to dedicated lazy-loaded sub-components.
 *
 * Architectural Decisions:
 * - Author: Mike Nimer <mikenimer@google.com>
 * - Modular design following "Props In, Events Up" paradigm.
 * - Spacing layout complies with 8pt grid system.
 * - Lazy-loads sub-tabs via React.lazy and Suspense to reduce initial bundle load time.
 */

import type { CodeGenProgressState } from '../../../shared/codegen/codeGenProgress';
import React, { useState, useEffect, Suspense } from 'react';
import {
  Code2,
  Server,
  FlaskConical,
  MessageSquare,
  Lock,
  Maximize2,
  Minimize2,
  Settings,
} from 'lucide-react';

import { AgentData, GeneratedFile, GenerationConfig } from '../../types';
import { AgentWorkflowDocument } from '../../../shared/types';
import { useOptionalPluginSettings } from '../../context/SettingsContext';

// Lazy-loaded Decomposed Sub-Tabs
const CodePreviewTab = React.lazy(() =>
  import('../tabs/CodePreviewTab').then((m) => ({ default: m.CodePreviewTab }))
);
const DeploymentTab = React.lazy(() =>
  import('../deployment/DeploymentTab').then((m) => ({ default: m.DeploymentTab }))
);
const ChatTab = React.lazy(() =>
  import('../tabs/ChatTab').then((m) => ({ default: m.ChatTab }))
);
const EvaluationTab = React.lazy(() =>
  import('../tabs/EvaluationTab').then((m) => ({ default: m.EvaluationTab }))
);

interface CodeGenerationPanelProps {
  config: GenerationConfig;
  onChangeConfig: (newConfig: Partial<GenerationConfig>) => void;
  onGenerateCode: () => void;
  onStopGenerate?: () => void;
  generatedFiles: GeneratedFile[];
  isGenerating: boolean;
  tokenUsage?: { inputTokens: number; outputTokens: number } | null;
  /** Live multi-agent code generation progress shown while generating. */
  codeGenProgress?: CodeGenProgressState;
  onOpenMissingAdvisor?: () => void;
  hasTestSuite?: boolean;
  hasGeneratedCode?: boolean;
  testPrompts?: any[];
  agents?: AgentData[];
  isMaximized?: boolean;
  onToggleMaximize?: () => void;
  onExpandPanel?: () => void;
  document?: AgentWorkflowDocument;
  hasChatTrigger?: boolean;
  chatConfig?: any;
}

export const CodeGenerationPanel: React.FC<CodeGenerationPanelProps> = ({
  config,
  onChangeConfig,
  onGenerateCode,
  onStopGenerate,
  generatedFiles,
  isGenerating,
  tokenUsage,
  codeGenProgress,
  onOpenMissingAdvisor,
  hasTestSuite = false,
  hasGeneratedCode = false,
  testPrompts = [],
  agents = [],
  isMaximized = false,
  onToggleMaximize,
  onExpandPanel,
  document: workflowDoc,
  hasChatTrigger = false,
  chatConfig,
}) => {
  const [activeTab, setActiveTab] = useState<'codegen' | 'deployment' | 'test_runner' | 'chat'>('codegen');
  const settingsCtx = useOptionalPluginSettings();
  const [pendingChatPrompt, setPendingChatPrompt] = useState<{ text: string; timestamp: number } | null>(null);

  /**
   * Selects a bottom tab and expands the bottom panel to 2/3rd of available space.
   */
  const handleSelectTab = (tab: 'codegen' | 'deployment' | 'test_runner' | 'chat') => {
    setActiveTab(tab);
    onExpandPanel?.();
  };

  /**
   * Switches to the Interactive Chat tab and populates the user input field
   * with the selected prompt from the Test Runner tab.
   */
  const handleOpenPromptInChat = (promptText: string) => {
    setPendingChatPrompt({ text: promptText, timestamp: Date.now() });
    setActiveTab('chat');
    onExpandPanel?.();
  };

  // Auto-switch tabs based on lifecycle events
  useEffect(() => {
    if (isGenerating) {
      setActiveTab('codegen');
      onExpandPanel?.();
    }
  }, [isGenerating, onExpandPanel]);

  useEffect(() => {
    if (hasGeneratedCode && activeTab === 'codegen' && !isGenerating && generatedFiles.length > 0) {
      // Stay on codegen but can unlock other options
    }
  }, [hasGeneratedCode, isGenerating, generatedFiles.length]);

  return (
    <div className="h-full flex flex-col bg-[#0d1117] border-t border-[#30363d] text-[#c9d1d9] select-none">
      {/* VS Code Bottom Tab Bar */}
      <div className="flex items-center justify-between px-4 bg-[#161b22] border-b border-[#30363d] shrink-0 h-10">
        <div className="flex items-center gap-1">
          {/* 1st TAB: Code Generation */}
          <button
            type="button"
            onClick={() => handleSelectTab('codegen')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'codegen' && isMaximized
                ? 'border-[#f78166] text-[#f78166] bg-[#0d1117]/60'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Code2 className="w-3.5 h-3.5 text-[#f78166]" />
            <span>Code Generation</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-[#21262d] text-gray-300 border border-[#30363d]">
              {generatedFiles.length} files
            </span>
          </button>

          {/* 2nd TAB: Deployment */}
          <button
            type="button"
            onClick={() => handleSelectTab('deployment')}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'deployment' && isMaximized
                ? 'border-emerald-500 text-emerald-400 bg-[#0d1117]/60'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Server className="w-3.5 h-3.5 text-emerald-400" />
            <span>Deployment</span>
            <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              {config.deploymentTarget === 'cloud_run' ? 'Cloud Run' : 'Google Agent Runtime'}
            </span>
          </button>

          {/* 3rd TAB: Test Runner (Test Scenarios) */}
          {hasTestSuite && (
            <div className="relative group/tab">
              <button
                type="button"
                onClick={() => {
                  if (hasGeneratedCode && !isGenerating) {
                    handleSelectTab('test_runner');
                  }
                }}
                disabled={!hasGeneratedCode || isGenerating}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold border-b-2 transition-all ${
                  !hasGeneratedCode || isGenerating
                    ? 'border-transparent text-gray-500 bg-[#161b22]/40 cursor-not-allowed opacity-60'
                    : activeTab === 'test_runner' && isMaximized
                    ? 'border-pink-500 text-pink-400 bg-[#0d1117]/60 cursor-pointer'
                    : 'border-transparent text-gray-400 hover:text-pink-300 cursor-pointer'
                }`}
              >
                <FlaskConical className={`w-3.5 h-3.5 ${hasGeneratedCode && !isGenerating ? 'text-pink-400' : 'text-gray-500'}`} />
                <span>Test Runner</span>
                {!hasGeneratedCode || isGenerating ? (
                  <span className="text-[9px] px-1.5 py-0.2 rounded font-mono bg-[#21262d] text-gray-400 border border-[#30363d] flex items-center gap-0.5">
                    <Lock className="w-2.5 h-2.5" />
                    Locked
                  </span>
                ) : (
                  <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-pink-500/20 text-pink-300 border border-pink-500/30">
                    {testPrompts.length} tests
                  </span>
                )}
              </button>

              {(!hasGeneratedCode || isGenerating) && (
                <div className="absolute top-full left-0 mt-1 hidden group-hover/tab:flex flex-col z-50 px-2.5 py-1.5 rounded-md bg-[#21262d] border border-[#30363d] text-[10px] text-amber-300 shadow-xl whitespace-nowrap">
                  <span>{isGenerating ? '⚠️ Code generation in progress...' : '⚠️ Code generation is required to unlock unit test runner'}</span>
                </div>
              )}
            </div>
          )}

          {/* 4th TAB: Interactive Chat Runner */}
          {hasChatTrigger && (
            <div className="relative group/tab">
              <button
                type="button"
                onClick={() => {
                  if (hasGeneratedCode && !isGenerating) {
                    handleSelectTab('chat');
                  }
                }}
                disabled={!hasGeneratedCode || isGenerating}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold border-b-2 transition-all ${
                  !hasGeneratedCode || isGenerating
                    ? 'border-transparent text-gray-500 bg-[#161b22]/40 cursor-not-allowed opacity-60'
                    : activeTab === 'chat' && isMaximized
                    ? 'border-emerald-500 text-emerald-400 bg-[#0d1117]/60 cursor-pointer'
                    : 'border-transparent text-gray-400 hover:text-emerald-300 cursor-pointer'
                }`}
              >
                <MessageSquare className={`w-3.5 h-3.5 ${hasGeneratedCode && !isGenerating ? 'text-emerald-400' : 'text-gray-500'}`} />
                <span>Interactive Chat</span>
                {!hasGeneratedCode || isGenerating ? (
                  <span className="text-[9px] px-1.5 py-0.2 rounded font-mono bg-[#21262d] text-gray-400 border border-[#30363d] flex items-center gap-0.5">
                    <Lock className="w-2.5 h-2.5" />
                    Locked
                  </span>
                ) : (
                  <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Live
                  </span>
                )}
              </button>

              {(!hasGeneratedCode || isGenerating) && (
                <div className="absolute top-full left-0 mt-1 hidden group-hover/tab:flex flex-col z-50 px-2.5 py-1.5 rounded-md bg-[#21262d] border border-[#30363d] text-[10px] text-amber-300 shadow-xl whitespace-nowrap">
                  <span>{isGenerating ? '⚠️ Code generation in progress...' : '⚠️ Code generation is required to unlock interactive chat'}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Panel Resizing & Settings Window Actions */}
        <div className="flex items-center gap-2">
          {settingsCtx && (
            <button
              type="button"
              onClick={() => settingsCtx.openSettings('models')}
              title="Open Plugin Settings (Models & Skills)"
              data-testid="bottom-panel-settings-button"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] text-xs font-semibold text-gray-300 hover:text-white transition-colors cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5 text-blue-400" />
              <span>Settings</span>
            </button>
          )}
          {onToggleMaximize && (
            <button
              type="button"
              onClick={onToggleMaximize}
              title={isMaximized ? 'Collapse to tab bar' : 'Expand panel (2/3)'}
              className="flex items-center justify-center p-1.5 rounded-lg bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] text-gray-300 hover:text-white transition-colors cursor-pointer"
            >
              {isMaximized ? (
                <Minimize2 className="w-3.5 h-3.5 text-blue-400" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5 text-gray-400 hover:text-white" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Main Tab Content */}
      <div className="flex-1 overflow-hidden relative min-h-0 w-full">
        <Suspense fallback={null}>
          {/* Code Generation Tab */}
          <div className={activeTab === 'codegen' ? 'h-full w-full' : 'hidden'}>
            <CodePreviewTab
              config={config}
              onChangeConfig={onChangeConfig}
              onGenerateCode={onGenerateCode}
              onStopGenerate={onStopGenerate}
              generatedFiles={generatedFiles}
              isGenerating={isGenerating}
              tokenUsage={tokenUsage}
              codeGenProgress={codeGenProgress}
              onOpenMissingAdvisor={onOpenMissingAdvisor}
            />
          </div>

          {/* Deployment Tab */}
          <div className={activeTab === 'deployment' ? 'h-full w-full flex flex-col min-h-0' : 'hidden'}>
            <DeploymentTab
              generationConfig={config}
              generatedFiles={generatedFiles}
              agents={agents}
              document={workflowDoc}
              onUpdateGenerationConfig={onChangeConfig}
            />
          </div>

          {/* Test Runner Tab */}
          <div className={activeTab === 'test_runner' ? 'h-full w-full' : 'hidden'}>
            <EvaluationTab
              testPrompts={testPrompts}
              agents={agents}
              config={config}
              document={workflowDoc}
              onNavigateToDeployment={() => handleSelectTab('deployment')}
              hasChatTrigger={hasChatTrigger}
              onOpenPromptInChat={handleOpenPromptInChat}
            />
          </div>

          {/* Interactive Chat Tab */}
          <div className={activeTab === 'chat' ? 'h-full w-full' : 'hidden'}>
            <ChatTab
              document={workflowDoc}
              config={config}
              chatConfig={chatConfig}
              agents={agents}
              onNavigateToDeployment={() => handleSelectTab('deployment')}
              externalPrompt={pendingChatPrompt}
            />
          </div>
        </Suspense>
      </div>
    </div>
  );
};
