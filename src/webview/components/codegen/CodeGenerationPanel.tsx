import React, { useState, useMemo, useEffect, useRef } from 'react';
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
  Sliders,
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
  MessageSquare,
  AlertCircle,
  CheckCircle2,
  Search,
  Square,
} from 'lucide-react';
import { AgentData, FrameworkType, GeneratedFile, GenerationConfig, LanguageType, TestPrompt } from '../../types';
import { AgentWorkflowDocument } from '../../../shared/types';
import { DeploymentTab } from '../deployment/DeploymentTab';
import { TestRunnerTab } from '../testing/TestRunnerTab';
import { ChatRunnerTab } from '../chat/ChatRunnerTab';
import { validateTargetFolder } from '../../../shared/folderValidation';
import { getFileColorInfo } from './fileTypeColors';
import { FindInFilesBar } from './FindInFilesBar';

/**
 * CodeGenerationPanel
 *
 * Webview component for multi-agent code synthesis, preview, and export.
 * Follows 8pt grid spacing and matches plugin design specifications.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */
function renderHighlightedCode(
  content: string,
  query: string,
  isCaseSensitive: boolean,
  isWholeWord: boolean,
  activeMatchIndexInFile: number
) {
  if (!query || !query.trim()) {
    return content;
  }

  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = isWholeWord ? `\\b${escaped}\\b` : escaped;
  const flags = isCaseSensitive ? 'g' : 'gi';

  let regex: RegExp;
  try {
    regex = new RegExp(pattern, flags);
  } catch {
    return content;
  }

  const matches: { start: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(content)) !== null) {
    matches.push({ start: m.index, end: m.index + m[0].length });
    if (!m[0].length) break;
  }

  if (matches.length === 0) {
    return content;
  }

  const elements: React.ReactNode[] = [];
  let lastIdx = 0;

  matches.forEach((item, matchIdx) => {
    if (item.start > lastIdx) {
      elements.push(content.substring(lastIdx, item.start));
    }
    const isCurrent = matchIdx === activeMatchIndexInFile;
    elements.push(
      <mark
        key={matchIdx}
        id={isCurrent ? 'active-search-match' : undefined}
        className={
          isCurrent
            ? 'bg-amber-400 text-black font-bold rounded-xs px-0.5'
            : 'bg-yellow-500/40 text-yellow-100 rounded-xs px-0.5'
        }
      >
        {content.substring(item.start, item.end)}
      </mark>
    );
    lastIdx = item.end;
  });

  if (lastIdx < content.length) {
    elements.push(content.substring(lastIdx));
  }

  return elements;
}

interface CodeGenerationPanelProps {
  config: GenerationConfig;
  onChangeConfig: (newConfig: Partial<GenerationConfig>) => void;
  onGenerateCode: () => void;
  onStopGenerate?: () => void;
  generatedFiles: GeneratedFile[];
  isGenerating: boolean;
  onOpenMissingAdvisor?: () => void;
  hasTestSuite?: boolean;
  hasGeneratedCode?: boolean;
  testPrompts?: TestPrompt[];
  agents?: any[];
  isMaximized?: boolean;
  onToggleMaximize?: () => void;
  document?: AgentWorkflowDocument;
  hasChatTrigger?: boolean;
  chatConfig?: {
    initialMessage?: string;
    streaming?: boolean;
    sessionMemory?: string;
  };
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
 * - Supports Interactive Chat Runner tab when a Chat Trigger node is present on canvas.
 * - Color-coded source file tabs and badges based on file category and extension.
 * - Standard Find in Files toolbar with scope toggle (Current File vs. All Files), case/word filters, hit counts, next/prev navigation, and match highlights.
 * - Red Stop button taking 25% width next to the 75% width Generate Code button.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */
export const CodeGenerationPanel: React.FC<CodeGenerationPanelProps> = ({
  config,
  onChangeConfig,
  onGenerateCode,
  onStopGenerate,
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
  hasChatTrigger = false,
  chatConfig,
}) => {
  const [activeTab, setActiveTab] = useState<'codegen' | 'deployment' | 'test_runner' | 'chat'>('codegen');
  const [activeFileIndex, setActiveFileIndex] = useState<number>(0);
  const [copied, setCopied] = useState(false);
  const [isFolderPickerOpen, setIsFolderPickerOpen] = useState(false);

  // Find in files search state
  const [isFindOpen, setIsFindOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchScope, setSearchScope] = useState<'current' | 'all'>('current');
  const [isCaseSensitive, setIsCaseSensitive] = useState(false);
  const [isWholeWord, setIsWholeWord] = useState(false);
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);

  // Global shortcut for Find in files (Ctrl+F / Cmd+F)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setIsFindOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const folderValidation = validateTargetFolder(config.outputFolder || '');

  const sampleFolders = [
    './',
    './backend/workflows/',
    './workspace/agent_team/',
    './lib/genai_orchestration/',
    './app/ai/agents/',
  ];

  const currentFile = generatedFiles[activeFileIndex] || generatedFiles[0];

  // Compute search matches per file
  const fileSearchStats = useMemo(() => {
    if (!searchQuery.trim() || !generatedFiles.length) {
      return {
        currentFileMatchesCount: 0,
        totalMatchesAllFiles: 0,
        filesWithMatches: [],
      };
    }

    const escaped = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = isWholeWord ? `\\b${escaped}\\b` : escaped;
    const flags = isCaseSensitive ? 'g' : 'gi';

    let regex: RegExp;
    try {
      regex = new RegExp(pattern, flags);
    } catch {
      return { currentFileMatchesCount: 0, totalMatchesAllFiles: 0, filesWithMatches: [] };
    }

    let totalMatchesAllFiles = 0;
    const filesWithMatches: { fileIndex: number; fileName: string; matchCount: number }[] = [];

    generatedFiles.forEach((file, fIdx) => {
      const matches = file.content.match(regex);
      const count = matches ? matches.length : 0;
      if (count > 0) {
        totalMatchesAllFiles += count;
        filesWithMatches.push({
          fileIndex: fIdx,
          fileName: file.name,
          matchCount: count,
        });
      }
    });

    const currentCount = currentFile ? (currentFile.content.match(regex) || []).length : 0;

    return {
      currentFileMatchesCount: currentCount,
      totalMatchesAllFiles,
      filesWithMatches,
    };
  }, [searchQuery, generatedFiles, currentFile, isCaseSensitive, isWholeWord]);

  // Scroll active match into view when index or file changes
  useEffect(() => {
    if (isFindOpen && searchQuery.trim()) {
      const el = document.getElementById('active-search-match');
      if (el) {
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [activeMatchIndex, searchQuery, isFindOpen, activeFileIndex]);

  const handleNextMatch = () => {
    const max = searchScope === 'current' ? fileSearchStats.currentFileMatchesCount : fileSearchStats.totalMatchesAllFiles;
    if (max === 0) return;
    setActiveMatchIndex((prev) => (prev + 1) % max);
  };

  const handlePrevMatch = () => {
    const max = searchScope === 'current' ? fileSearchStats.currentFileMatchesCount : fileSearchStats.totalMatchesAllFiles;
    if (max === 0) return;
    setActiveMatchIndex((prev) => (prev - 1 + max) % max);
  };

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
                ? 'border-white text-white bg-[#0d1117]/60'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>Code Generation</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#21262d] text-gray-300 border border-[#30363d] font-mono">
              {generatedFiles.length} files
            </span>
          </button>

          <button
            onClick={() => setActiveTab('deployment')}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'deployment'
                ? 'border-white text-white bg-[#0d1117]/60'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            <span>Deployment</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#21262d] text-emerald-400 border border-emerald-500/30 font-mono">
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
                    ? 'border-white text-white bg-[#0d1117]/60 cursor-pointer'
                    : 'border-transparent text-gray-400 hover:text-gray-200 cursor-pointer'
                }`}
              >
                <FlaskConical className="w-3.5 h-3.5" />
                <span>Test Runner</span>
                {!hasGeneratedCode ? (
                  <span className="text-[9px] px-1.5 py-0.5 rounded font-mono bg-[#21262d] text-gray-400 border border-[#30363d] flex items-center gap-0.5">
                    <Lock className="w-2.5 h-2.5" />
                    Locked
                  </span>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#21262d] text-pink-400 border border-pink-500/30 font-mono">
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

          {/* 4th TAB: Interactive Chat Runner (shown if a Chat Trigger is attached) */}
          {hasChatTrigger && (
            <button
              type="button"
              onClick={() => setActiveTab('chat')}
              title="Interactive live streaming chat runner"
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer ${
                activeTab === 'chat'
                  ? 'border-white text-white bg-[#0d1117]/60'
                  : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Interactive Chat</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#21262d] text-emerald-400 border border-emerald-500/30 font-mono">
                Live
              </span>
            </button>
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
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-white">
                  <Sliders className="w-4 h-4 text-sky-400" />
                  <span>GENERATOR SETTINGS</span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded bg-[#0d1117] text-gray-400 font-mono border border-[#30363d]">
                  v2.4
                </span>
              </div>

              {/* Radio Group: Google ADK vs LangGraph */}
              <div className="space-y-1.5">
                <p className="text-[11px] text-gray-400 font-bold uppercase tracking-wider">
                  TARGET FRAMEWORK
                </p>
                <div className="space-y-1.5">
                  {/* Google ADK Option */}
                  <label
                    className={`flex items-start gap-3 p-3 rounded-lg border transition-all cursor-pointer group ${
                      config.framework === 'google_adk'
                        ? 'bg-[#0d1117] border-[#388bfd] shadow-sm'
                        : 'bg-[#0d1117] border-[#30363d] hover:bg-[#161b22]'
                    }`}
                  >
                    <div className="pt-0.5">
                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${
                        config.framework === 'google_adk' ? 'border-[#388bfd] bg-[#388bfd]' : 'border-gray-500'
                      }`}>
                        {config.framework === 'google_adk' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white">Google ADK</span>
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-300 font-mono border border-blue-500/30">
                          GenAI SDK
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-400 mt-0.5 leading-snug">
                        Google Agent Development Kit & Gemini tools.
                      </p>
                    </div>
                  </label>

                  {/* LangGraph Option (Disabled) */}
                  <label
                    title="LangGraph option is currently disabled"
                    className="flex items-start gap-3 p-3 rounded-lg border transition-all opacity-50 cursor-not-allowed bg-[#0d1117] border-[#30363d]"
                  >
                    <div className="pt-0.5">
                      <div className="w-4 h-4 rounded-full border border-gray-600 flex items-center justify-center bg-gray-800" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-gray-400">LangGraph</span>
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-purple-900/30 text-purple-400 font-mono border border-purple-700/40">
                          Disabled
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-500 mt-0.5 leading-snug">
                        Cyclic StateGraph orchestration with shared memory.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Target Language Toggle */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-gray-400 font-bold uppercase tracking-wider">LANGUAGE</span>
                  <span className="text-[10px] text-gray-400 font-mono uppercase">{config.language}</span>
                </div>
                <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#0d1117] rounded-lg border border-[#30363d]">
                  <button
                    type="button"
                    onClick={() => onChangeConfig({ language: 'python' })}
                    className={`py-1.5 px-3 text-xs font-medium rounded transition-colors cursor-pointer flex items-center justify-center gap-2 ${
                      config.language === 'python'
                        ? 'bg-[#21262d] text-white border border-[#30363d] shadow-sm'
                        : 'text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    <span>🐍</span>
                    <span>Python</span>
                  </button>
                  <button
                    type="button"
                    disabled={true}
                    title="TypeScript option is currently disabled"
                    className="py-1.5 px-3 text-xs font-medium rounded transition-colors opacity-50 cursor-not-allowed text-gray-500 bg-[#0d1117] flex items-center justify-center gap-2"
                  >
                    <span className="text-blue-500">🔷</span>
                    <span>TypeScript</span>
                  </button>
                </div>
              </div>

              {/* Folder Selector for Generated Code */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-[11px] text-gray-300 font-bold uppercase tracking-wider">
                    <Folder className="w-3.5 h-3.5 text-amber-400" />
                    TARGET FOLDER
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsFolderPickerOpen(!isFolderPickerOpen)}
                    className="text-[11px] text-blue-400 hover:underline cursor-pointer font-normal"
                  >
                    {isFolderPickerOpen ? 'Hide' : 'Paths'}
                  </button>
                </div>

                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={config.outputFolder}
                    onChange={(e) => onChangeConfig({ outputFolder: e.target.value })}
                    placeholder="./"
                    className={`flex-1 px-3 py-2 bg-[#0d1117] border rounded-lg text-xs font-mono text-gray-200 focus:outline-none ${
                      !folderValidation.isValid
                        ? 'border-amber-500/80 focus:border-amber-500'
                        : 'border-[#30363d] focus:border-blue-500'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setIsFolderPickerOpen(!isFolderPickerOpen)}
                    title="Choose folder location"
                    className="bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] rounded-lg px-2.5 text-gray-400 hover:text-white transition-colors cursor-pointer flex items-center justify-center"
                  >
                    <FolderOpen className="w-4 h-4" />
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
                  <div className="mt-1 flex items-center gap-1 text-[11px] text-emerald-400 font-mono">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
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
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-[11px] text-gray-300 font-bold uppercase tracking-wider">
                    <Cloud className="w-3.5 h-3.5 text-emerald-400" />
                    DEPLOYMENT TARGET
                  </span>
                  <span className="text-[9px] px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-mono border border-emerald-500/30">
                    TERRAFORM IAC
                  </span>
                </div>
                <select
                  value={config.deploymentTarget || 'agent_engine'}
                  onChange={(e) => onChangeConfig({ deploymentTarget: e.target.value as 'cloud_run' | 'agent_engine' })}
                  className="w-full bg-[#0d1117] border border-[#30363d] text-xs text-white rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500 cursor-pointer font-medium"
                >
                  <option value="agent_engine">🧠 Google Agent Engine (Managed ADK)</option>
                  <option value="cloud_run">☁️ Google Cloud Run (Containerized Microservice)</option>
                </select>
                <p className="text-[10px] text-gray-400 leading-normal">
                  Tells the generator how to construct the <code className="text-gray-300 font-mono">main.tf</code> terraform script and deployment spec.
                </p>
              </div>
            </div>

            {/* Generate Code & Stop Buttons */}
            <div className="pt-3 border-t border-[#30363d] flex items-center gap-2 shrink-0 mt-2">
              <button
                type="button"
                onClick={onGenerateCode}
                disabled={isGenerating}
                title="Synthesize production repository using Gemini LLM"
                className={`w-3/4 py-2.5 rounded-lg text-sm font-bold shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  isGenerating
                    ? 'bg-emerald-600/50 text-white cursor-wait'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white active:scale-[0.99]'
                }`}
              >
                {isGenerating ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-white" />
                    <span>Generating Code...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-current text-white" />
                    <span>Generate Code</span>
                  </>
                )}
              </button>

              <button
                type="button"
                data-testid="stop-codegen-button"
                onClick={onStopGenerate}
                title={isGenerating ? 'Stop active code generation' : 'Stop code generation'}
                className={`w-1/4 py-2.5 rounded-lg text-sm font-bold border transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-md text-white border-[#da3633]/40 active:scale-[0.99] ${
                  isGenerating
                    ? 'bg-[#a42036] hover:bg-[#c92a43] ring-2 ring-red-500/50 animate-pulse'
                    : 'bg-[#85182a] hover:bg-[#a42036]'
                }`}
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>Stop</span>
              </button>
            </div>
          </div>

          {/* RIGHT 2/3: Code Preview Editor */}
          <div className="flex-1 flex flex-col min-w-0 bg-[#0d1117] border border-[#30363d] rounded-xl overflow-hidden shadow-xl">
            {/* File Tabs (Only shown if generatedFiles exists and not actively generating) */}
            {!isGenerating && generatedFiles.length > 0 && (
              <div className="flex items-center justify-between px-3 bg-[#161b22] border-b border-[#30363d] overflow-x-auto shrink-0 h-9">
                <div className="flex items-center gap-1">
                  {generatedFiles.map((file, idx) => {
                    const colorInfo = getFileColorInfo(file.name);
                    const isActive = activeFileIndex === idx;

                    return (
                      <button
                        key={file.name}
                        onClick={() => {
                          setActiveFileIndex(idx);
                          setActiveMatchIndex(0);
                        }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono rounded-t transition-colors cursor-pointer group ${
                          isActive
                            ? colorInfo.tabActiveClass
                            : 'text-gray-400 hover:text-gray-200 hover:bg-[#21262d]'
                        }`}
                      >
                        <FileCode className={`w-3.5 h-3.5 ${colorInfo.iconColor}`} />
                        <span>{file.name}</span>
                        <span className={`text-[9px] px-1 py-0.2 rounded uppercase font-mono border ${colorInfo.badgeClass}`}>
                          {colorInfo.badgeLabel}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Code actions: Find, Copy, Download */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsFindOpen((prev) => !prev)}
                    title="Find in Files (Ctrl+F / Cmd+F)"
                    className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded border transition-colors cursor-pointer font-medium ${
                      isFindOpen
                        ? 'bg-blue-600 text-white border-blue-500'
                        : 'bg-[#21262d] hover:bg-[#30363d] border-[#30363d] text-gray-200'
                    }`}
                  >
                    <Search className="w-3 h-3" />
                    <span>Find</span>
                  </button>

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

            {/* Find in Files Bar */}
            <FindInFilesBar
              isOpen={isFindOpen && !isGenerating && generatedFiles.length > 0}
              onClose={() => setIsFindOpen(false)}
              query={searchQuery}
              onQueryChange={(q) => {
                setSearchQuery(q);
                setActiveMatchIndex(0);
              }}
              scope={searchScope}
              onScopeChange={(s) => {
                setSearchScope(s);
                setActiveMatchIndex(0);
              }}
              isCaseSensitive={isCaseSensitive}
              onToggleCaseSensitive={() => {
                setIsCaseSensitive((prev) => !prev);
                setActiveMatchIndex(0);
              }}
              isWholeWord={isWholeWord}
              onToggleWholeWord={() => {
                setIsWholeWord((prev) => !prev);
                setActiveMatchIndex(0);
              }}
              currentMatchIndex={activeMatchIndex}
              totalMatchesInFile={fileSearchStats.currentFileMatchesCount}
              totalMatchesAllFiles={fileSearchStats.totalMatchesAllFiles}
              filesWithMatches={fileSearchStats.filesWithMatches}
              onNextMatch={handleNextMatch}
              onPrevMatch={handlePrevMatch}
              onSelectFile={(fIdx) => {
                setActiveFileIndex(fIdx);
                setActiveMatchIndex(0);
              }}
              activeFileIndex={activeFileIndex}
            />

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
                  {(() => {
                    const fileColor = getFileColorInfo(currentFile.name);
                    return (
                      <div className="text-[10px] text-gray-400 mb-2 pb-1 border-b border-[#21262d] flex items-center justify-between font-sans">
                        <div className="flex items-center gap-2">
                          <span className={`text-[9px] font-mono uppercase px-1.5 py-0.2 rounded border ${fileColor.badgeClass}`}>
                            {fileColor.badgeLabel}
                          </span>
                          <span>{currentFile.description}</span>
                        </div>
                        <span className="font-mono text-gray-400">{config.outputFolder}{currentFile.name}</span>
                      </div>
                    );
                  })()}
                  <pre className="text-gray-300 whitespace-pre font-mono selection:bg-blue-900 selection:text-white">
                    {renderHighlightedCode(
                      currentFile.content,
                      isFindOpen ? searchQuery : '',
                      isCaseSensitive,
                      isWholeWord,
                      activeMatchIndex
                    )}
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

      {/* Interactive Chat Tab */}
      <div className={activeTab === 'chat' ? 'flex-1 flex flex-col h-full overflow-hidden' : 'hidden'}>
        <ChatRunnerTab
          document={workflowDoc}
          config={config}
          chatConfig={chatConfig}
          agents={agents}
          onNavigateToDeployment={() => setActiveTab('deployment')}
        />
      </div>
    </div>
  );
};

