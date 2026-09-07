import React, { useState } from 'react';
import { 
  Code2, 
  Folder, 
  Play, 
  Copy, 
  Check, 
  Download, 
  Sparkles, 
  FileCode, 
  FolderOpen,
  RefreshCw,
  Cpu,
  Layers,
  Settings2,
  ExternalLink,
  ChevronRight,
  Server,
  Rocket,
  FlaskConical,
  Lock,
  ListChecks,
  Maximize2,
  Minimize2,
  Cloud,
  Key,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { AgentData, FrameworkType, GeneratedFile, GenerationConfig, LanguageType, TestPrompt } from '../../types';
import { AgentWorkflowDocument } from '../../../shared/types';
import { DeploymentTab } from '../deployment/DeploymentTab';
import { TestRunnerTab } from '../testing/TestRunnerTab';
import { validateTargetFolder } from '../../../shared/folderValidation';

interface CodeGenerationPanelProps {
  config: GenerationConfig;
  onChangeConfig: (newConfig: Partial<GenerationConfig>) => void;
  onGenerateCode: () => void;
  generatedFiles: GeneratedFile[];
  isGenerating: boolean;
  onOpenMissingAdvisor?: () => void;
  hasTestSuite?: boolean;
  hasGeneratedCode?: boolean;
  testPrompts?: TestPrompt[];
  agents?: AgentData[];
  isMaximized?: boolean;
  onToggleMaximize?: () => void;
  document?: AgentWorkflowDocument;
}

/**
 * CodeGenerationPanel
 *
 * Provides the user interface for generator settings, deployment target selection,
 * target folder configuration, and code preview tabs.
 *
 * Architectural Decisions:
 * - Google Agent Engine is set as the default deployment target.
 * - LangGraph and TypeScript options are currently disabled in this version.
 * - Generate Code button is disabled.
 * - Mocked file tabs are hidden when no generated files are present.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */
export const CodeGenerationPanel: React.FC<CodeGenerationPanelProps> = ({
  config,
  onChangeConfig,
  onGenerateCode,
  generatedFiles,
  isGenerating,
  onOpenMissingAdvisor,
  hasTestSuite = false,
  hasGeneratedCode = false,
  testPrompts = [],
  agents = [],
  isMaximized = false,
  onToggleMaximize,
  document: workflowDoc,
}) => {
  const [activeTab, setActiveTab] = useState<'codegen' | 'deployment' | 'test_runner'>('codegen');
  const [activeFileIndex, setActiveFileIndex] = useState<number>(0);
  const [copied, setCopied] = useState(false);
  const [isFolderPickerOpen, setIsFolderPickerOpen] = useState(false);

  const folderValidation = validateTargetFolder(config.outputFolder || '');

  const sampleFolders = [
    './src/agents/',
    './backend/workflows/',
    './workspace/agent_team/',
    './lib/genai_orchestration/',
    './app/ai/agents/',
  ];

  const currentFile = generatedFiles[activeFileIndex] || generatedFiles[0];

  /**
   * Copies current generated file content to the system clipboard.
   */
  const handleCopyCode = () => {
    if (!currentFile) return;
    navigator.clipboard.writeText(currentFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  /**
   * Downloads current generated file as a text file.
   */
  const handleDownloadAll = () => {
    if (!generatedFiles.length || !currentFile) return;
    const element = document.createElement('a');
    const file = new Blob([currentFile.content], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = currentFile.name || currentFile.path || 'file.txt';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <div className="h-full flex flex-col bg-[#0d1117] border-t border-[#30363d] text-[#c9d1d9]">
      {/* VS Code Bottom Tab Bar */}
      <div className="flex items-center justify-between px-4 bg-[#161b22] border-b border-[#30363d] select-none shrink-0 h-10">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab('codegen')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'codegen'
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

          <button
            onClick={() => setActiveTab('deployment')}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'deployment'
                ? 'border-emerald-500 text-emerald-400 bg-[#0d1117]/60'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Server className="w-3.5 h-3.5 text-emerald-400" />
            <span>Deployment</span>
            <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              {config.deploymentTarget === 'cloud_run' ? 'Cloud Run' : 'Google Agent Engine'}
            </span>
          </button>

          {/* 3rd TAB: Test Runner (conditionally shown if a Test Suite is attached to the agents) */}
          {hasTestSuite && (
            <div className="relative group/tab">
              <button
                type="button"
                onClick={() => {
                  if (hasGeneratedCode) {
                    setActiveTab('test_runner');
                  }
                }}
                disabled={!hasGeneratedCode}
                title={
                  !hasGeneratedCode
                    ? 'Generate code first in the Code Generation tab to run unit tests locally.'
                    : 'Run unit test suite against generated agent workflow'
                }
                className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold border-b-2 transition-all ${
                  !hasGeneratedCode
                    ? 'border-transparent text-gray-500 bg-[#161b22]/40 cursor-not-allowed opacity-60'
                    : activeTab === 'test_runner'
                    ? 'border-pink-500 text-pink-400 bg-[#0d1117]/60 cursor-pointer'
                    : 'border-transparent text-gray-400 hover:text-pink-300 cursor-pointer'
                }`}
              >
                <FlaskConical className={`w-3.5 h-3.5 ${hasGeneratedCode ? 'text-pink-400' : 'text-gray-500'}`} />
                <span>Test Runner</span>
                {!hasGeneratedCode ? (
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

              {/* Tooltip on hover if disabled */}
              {!hasGeneratedCode && (
                <div className="absolute top-full left-0 mt-1 hidden group-hover/tab:flex flex-col z-50 px-2.5 py-1.5 rounded-md bg-[#21262d] border border-[#30363d] text-[10px] text-amber-300 shadow-xl whitespace-nowrap">
                  <span>⚠️ Code generation is required to unlock unit test runner</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {onToggleMaximize && (
            <button
              type="button"
              onClick={onToggleMaximize}
              title={isMaximized ? "Collapse panel to 1/3 height" : "Expand panel to full size"}
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
      <div className={activeTab === 'codegen' ? 'flex-1 p-4 flex gap-4 overflow-hidden bg-[#0d1117]' : 'hidden'}>
        {/* LEFT 1/3 CARD: Generation Controls */}
        <div className="w-1/3 min-w-[280px] max-w-[360px] bg-[#161b22] border border-[#30363d] rounded-xl p-4 shadow-xl flex flex-col min-h-0 overflow-hidden">
            <div className="flex-1 overflow-y-auto pr-1 space-y-3.5 min-h-0">
              {/* Card Header */}
              <div className="flex items-center justify-between border-b border-[#30363d] pb-2">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-white">
                  <Settings2 className="w-3.5 h-3.5 text-blue-400" />
                  <span>Generator Settings</span>
                </div>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#0d1117] text-gray-400 font-mono border border-[#30363d]">
                  v2.4
                </span>
              </div>

              {/* Radio Group: Google ADK vs LangGraph */}
              <div className="space-y-1.5">
                <p className="text-[11px] text-gray-400 font-bold uppercase tracking-tight">
                  Target Framework
                </p>
                <div className="space-y-1.5">
                  {/* Google ADK Option */}
                  <label
                    className={`flex items-start gap-2.5 p-2 rounded-lg border transition-all cursor-pointer group ${
                      config.framework === 'google_adk'
                        ? 'bg-[#21262d] border-blue-500 shadow-sm'
                        : 'bg-[#0d1117] border-[#30363d] hover:bg-[#21262d]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="framework"
                      value="google_adk"
                      checked={config.framework === 'google_adk'}
                      onChange={() => onChangeConfig({ framework: 'google_adk' })}
                      className="mt-0.5 accent-blue-500"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-gray-200 group-hover:text-white">Google ADK</span>
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-300 font-mono border border-blue-500/30">
                          GenAI SDK
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        Google Agent Development Kit & Gemini 2.5 tools.
                      </p>
                    </div>
                  </label>

                  {/* LangGraph Option (Disabled) */}
                  <label
                    title="LangGraph option is currently disabled"
                    className="flex items-start gap-2.5 p-2 rounded-lg border transition-all opacity-50 cursor-not-allowed bg-[#0d1117] border-[#30363d]"
                  >
                    <input
                      type="radio"
                      name="framework"
                      value="langgraph"
                      disabled={true}
                      checked={false}
                      className="mt-0.5 accent-purple-500 cursor-not-allowed"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-gray-400">LangGraph</span>
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-purple-500/10 text-purple-400 font-mono border border-purple-500/20">
                          Disabled
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-500 mt-0.5">
                        Cyclic StateGraph orchestration with shared memory.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Target Language Toggle */}
              <div className="space-y-1">
                <p className="text-[11px] text-gray-400 font-bold uppercase tracking-tight flex items-center justify-between">
                  <span>Language</span>
                  <span className="text-[10px] text-gray-400 font-mono">{config.language.toUpperCase()}</span>
                </p>
                <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#0d1117] rounded-lg border border-[#30363d]">
                  <button
                    type="button"
                    onClick={() => onChangeConfig({ language: 'python' })}
                    className={`py-1 text-xs font-medium rounded transition-colors cursor-pointer ${
                      config.language === 'python'
                        ? 'bg-[#21262d] text-white border border-[#30363d] shadow'
                        : 'text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    🐍 Python
                  </button>
                  <button
                    type="button"
                    disabled={true}
                    title="TypeScript option is currently disabled"
                    className="py-1 text-xs font-medium rounded transition-colors opacity-50 cursor-not-allowed text-gray-500 bg-[#0d1117]"
                  >
                    🔷 TypeScript
                  </button>
                </div>
              </div>

              {/* Folder Selector for Generated Code */}
              <div className="space-y-1.5">
                <label className="text-[11px] text-gray-400 font-bold uppercase tracking-tight flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Folder className="w-3 h-3 text-amber-400" />
                    Target Folder
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsFolderPickerOpen(!isFolderPickerOpen)}
                    className="text-[10px] text-blue-400 hover:underline cursor-pointer font-normal"
                  >
                    {isFolderPickerOpen ? 'Hide' : 'Paths'}
                  </button>
                </label>

                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={config.outputFolder}
                    onChange={(e) => onChangeConfig({ outputFolder: e.target.value })}
                    placeholder="./src/agents/"
                    className={`flex-1 px-3 py-1.5 bg-[#0d1117] border rounded text-xs font-mono text-gray-300 focus:outline-none ${
                      !folderValidation.isValid
                        ? 'border-amber-500/80 focus:border-amber-500'
                        : 'border-[#30363d] focus:border-blue-500'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setIsFolderPickerOpen(!isFolderPickerOpen)}
                    title="Choose folder location"
                    className="bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] rounded px-2.5 text-gray-400 hover:text-white transition-colors cursor-pointer flex items-center justify-center"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Character Validation Message & Quick Fix */}
                {!folderValidation.isValid ? (
                  <div className="mt-2 p-2 bg-amber-950/40 border border-amber-600/40 rounded text-[11px] text-amber-200 space-y-2">
                    <div className="flex items-start gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                      <div className="leading-tight">{folderValidation.error}</div>
                    </div>
                    {folderValidation.hasHyphens && (
                      <div className="flex items-center justify-between pt-1 border-t border-amber-800/40">
                        <span className="text-[10px] text-gray-300">
                          Replace <code className="text-amber-300 font-mono">-</code> with <code className="text-emerald-300 font-mono">_</code>:
                        </span>
                        <button
                          type="button"
                          onClick={() => onChangeConfig({ outputFolder: folderValidation.sanitizedPath })}
                          className="px-2 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded text-[10px] font-medium transition-colors cursor-pointer"
                        >
                          Use '{folderValidation.sanitizedBase}'
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mt-1 flex items-center gap-1 text-[10px] text-emerald-400/90 font-mono">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    <span>Valid Python package name: {folderValidation.folderBase}</span>
                  </div>
                )}

                {isFolderPickerOpen && (
                  <div className="p-1.5 rounded-lg bg-[#0d1117] border border-[#30363d] space-y-1 animate-in fade-in">
                    <div className="text-[9px] uppercase tracking-wider text-gray-400 px-1">
                      Quick Workspace Paths:
                    </div>
                    {sampleFolders.map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => {
                          onChangeConfig({ outputFolder: f });
                          setIsFolderPickerOpen(false);
                        }}
                        className={`w-full text-left px-2 py-1 rounded text-[11px] font-mono transition-colors flex items-center justify-between cursor-pointer ${
                          config.outputFolder === f
                            ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                            : 'text-gray-400 hover:bg-[#21262d] hover:text-gray-200'
                        }`}
                      >
                        <span>{f}</span>
                        <ChevronRight className="w-2.5 h-2.5 text-gray-400" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Deployment Target Selection (Terraform IaC Target) */}
              <div className="space-y-1.5">
                <label className="text-[11px] text-gray-400 font-bold uppercase tracking-tight flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-gray-300">
                    <Cloud className="w-3.5 h-3.5 text-emerald-400" />
                    Deployment Target
                  </span>
                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-300 font-mono border border-emerald-500/30">
                    Terraform IaC
                  </span>
                </label>
                <select
                  value={config.deploymentTarget || 'agent_engine'}
                  onChange={(e) => onChangeConfig({ deploymentTarget: e.target.value as 'cloud_run' | 'agent_engine' })}
                  className="w-full bg-[#0d1117] border border-[#30363d] text-xs text-gray-200 rounded px-2.5 py-1.5 focus:outline-none focus:border-emerald-500 cursor-pointer font-medium"
                >
                  <option value="agent_engine">🧠 Google Agent Engine (Managed ADK)</option>
                  <option value="cloud_run">☁️ Google Cloud Run (Containerized Microservice)</option>
                </select>
                <p className="text-[10px] text-gray-400 leading-tight">
                  Tells the generator how to construct the <code className="text-gray-300 font-mono">main.tf</code> terraform script and deployment spec.
                </p>
              </div>
            </div>

            {/* Generate Code Button */}
            <div className="pt-3 border-t border-[#30363d] space-y-1.5 shrink-0 mt-2">
              <button
                type="button"
                onClick={onGenerateCode}
                disabled={isGenerating}
                title="Synthesize production repository using Gemini LLM"
                className={`w-full py-2.5 rounded-lg text-sm font-bold border transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg ${
                  isGenerating
                    ? 'bg-blue-600/40 text-blue-200 border-blue-500/50 cursor-wait'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-400 hover:shadow-emerald-500/20 active:scale-[0.98]'
                }`}
              >
                {isGenerating ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-blue-200" />
                    <span>Generating Code...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-current text-white" />
                    <span>Generate Code</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* RIGHT 2/3: Code Preview Editor */}
          <div className="flex-1 flex flex-col min-w-0 bg-[#0d1117] border border-[#30363d] rounded-xl overflow-hidden shadow-xl">
            {/* File Tabs (Only shown if generatedFiles exists and not actively generating) */}
            {!isGenerating && generatedFiles.length > 0 && (
              <div className="flex items-center justify-between px-3 bg-[#161b22] border-b border-[#30363d] overflow-x-auto shrink-0 h-9">
                <div className="flex items-center gap-1">
                  {generatedFiles.map((file, idx) => (
                    <button
                      key={file.name}
                      onClick={() => setActiveFileIndex(idx)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono rounded-t transition-colors cursor-pointer ${
                        activeFileIndex === idx
                          ? 'bg-[#0d1117] text-white border-t-2 border-blue-400 font-semibold'
                          : 'text-gray-400 hover:text-gray-200 hover:bg-[#21262d]'
                      }`}
                    >
                      <FileCode className="w-3 h-3 text-blue-400" />
                      <span>{file.name}</span>
                    </button>
                  ))}
                </div>

                {/* Code actions */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={handleCopyCode}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs rounded bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] text-gray-200 transition-colors cursor-pointer font-medium"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span className="text-emerald-400">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                  <button
                    onClick={handleDownloadAll}
                    title="Download file"
                    className="flex items-center gap-1 px-2.5 py-1 text-xs rounded bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] text-gray-200 transition-colors cursor-pointer font-medium"
                  >
                    <Download className="w-3 h-3" />
                    <span>Download</span>
                  </button>
                </div>
              </div>
            )}

            {/* Code Content View */}
            <div className="flex-1 p-4 overflow-auto bg-[#0d1117] font-mono text-xs text-[#c9d1d9] select-text leading-relaxed relative">
              <div className="absolute top-2 right-3 text-[10px] text-gray-400 uppercase font-bold tracking-wider pointer-events-none">
                {isGenerating ? 'Generating' : 'Preview'}
              </div>
              {isGenerating ? (
                <div className="h-full flex flex-col items-center justify-center text-blue-400 gap-3 py-12">
                  <RefreshCw className="w-8 h-8 animate-spin text-blue-400" />
                  <span className="text-sm font-semibold text-gray-200">Generating code with Gemini...</span>
                  <span className="text-xs text-gray-400 font-sans">Cleaning target directory & synthesizing agent files</span>
                </div>
              ) : generatedFiles.length > 0 && currentFile ? (
                <div className="relative">
                  <div className="text-[10px] text-gray-400 mb-2 pb-1 border-b border-[#21262d] flex items-center justify-between font-sans">
                    <span>{currentFile.description}</span>
                    <span className="font-mono text-gray-400">{config.outputFolder}{currentFile.name}</span>
                  </div>
                  <pre className="text-gray-300 whitespace-pre font-mono selection:bg-blue-900 selection:text-white">
                    {currentFile.content}
                  </pre>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-gray-500 gap-2">
                  <Code2 className="w-8 h-8 text-gray-600" />
                  <span className="text-sm font-medium">No generated files in target folder</span>
                </div>
              )}
            </div>
          </div>
        </div>

      {/* Deployment Tab */}
      <div className={activeTab === 'deployment' ? 'flex-1 flex flex-col h-full overflow-hidden' : 'hidden'}>
        <DeploymentTab
          generationConfig={config}
          generatedFiles={generatedFiles}
          agents={agents}
          document={workflowDoc}
          onUpdateGenerationConfig={onChangeConfig}
        />
      </div>

      {/* Test Runner Tab */}
      <div className={activeTab === 'test_runner' ? 'flex-1 flex flex-col h-full overflow-hidden' : 'hidden'}>
        <TestRunnerTab
          testPrompts={testPrompts}
          agents={agents}
          config={config}
          document={workflowDoc}
          onNavigateToDeployment={() => setActiveTab('deployment')}
        />
      </div>
    </div>
  );
};

