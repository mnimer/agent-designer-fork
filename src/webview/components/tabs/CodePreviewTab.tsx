/**
 * CodePreviewTab.tsx - Code Generation Settings and Preview Panel
 *
 * Purpose:
 * Renders the code generation control panel on the left and the side-by-side
 * file tree / source code preview panel with Find in Files functionality on the right.
 *
 * Architectural Decisions:
 * - Author: Mike Nimer <mikenimer@google.com>
 * - Modular design following "Props In, Events Up" paradigm.
 * - Spacing layout complies with 8pt grid system.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Settings2,
  Folder,
  FolderOpen,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Cloud,
  RefreshCw,
  Play,
  Square,
  FileCode,
  Search,
  Copy,
  Check,
  Download,
  Code2,
} from 'lucide-react';

import { GeneratedFile, GenerationConfig } from '../../types';
import { AgentWorkflowDocument } from '../../../shared/types';
import { validateTargetFolder } from '../../../shared/folderValidation';
import { getFileColorInfo } from '../codegen/fileTypeColors';
import { FindInFilesBar } from '../codegen/FindInFilesBar';

/**
 * Renders file text with highlighted search occurrences.
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

interface CodePreviewTabProps {
  config: GenerationConfig;
  onChangeConfig: (newConfig: Partial<GenerationConfig>) => void;
  onGenerateCode: () => void;
  onStopGenerate?: () => void;
  generatedFiles: GeneratedFile[];
  isGenerating: boolean;
  onOpenMissingAdvisor?: () => void;
}

export const CodePreviewTab: React.FC<CodePreviewTabProps> = ({
  config,
  onChangeConfig,
  onGenerateCode,
  onStopGenerate,
  generatedFiles,
  isGenerating,
  onOpenMissingAdvisor,
}) => {
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

  const handleCopyCode = () => {
    if (!currentFile) return;
    navigator.clipboard.writeText(currentFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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
    <div className="flex-1 p-4 flex gap-4 overflow-hidden bg-[#0d1117] h-full">
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
                    Google Agent Development Kit & Gemini tools.
                  </p>
                </div>
              </label>

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
                placeholder="./"
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

          {/* Deployment Target Selection */}
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
              onChange={(e) => onChangeConfig({ deploymentTarget: e.target.value as any })}
              className="w-full bg-[#0d1117] border border-[#30363d] text-xs text-gray-200 rounded px-2.5 py-1.5 focus:outline-none focus:border-emerald-500 cursor-pointer font-medium"
            >
              <option value="agent_engine">🧠 Google Agent Runtime (Managed ADK)</option>
              <option value="cloud_run">☁️ Google Cloud Run (Containerized Microservice)</option>
            </select>
          </div>
        </div>

        {/* Generate Code & Stop Buttons */}
        <div className="pt-3 border-t border-[#30363d] flex items-center gap-2 shrink-0 mt-2">
          <button
            type="button"
            onClick={onGenerateCode}
            disabled={isGenerating}
            title="Synthesize production repository using Gemini LLM"
            className={`w-3/4 py-2.5 rounded-lg text-sm font-bold border transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg ${
              isGenerating
                ? 'bg-blue-600/40 text-blue-200 border-blue-500/50 cursor-wait'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-400 hover:shadow-emerald-500/20 active:scale-[0.98]'
            }`}
          >
            {isGenerating ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-blue-200" />
                <span>Generating...</span>
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
            onClick={onStopGenerate}
            disabled={!isGenerating}
            className="w-1/4 py-2.5 rounded-lg text-sm font-bold border transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-lg bg-rose-600 hover:bg-rose-500 text-white border-rose-500 hover:shadow-rose-500/20 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Square className="w-3.5 h-3.5 fill-current" />
            <span>Stop</span>
          </button>
        </div>
      </div>

      {/* RIGHT 2/3: Code Preview Editor */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#0d1117] border border-[#30363d] rounded-xl overflow-hidden shadow-xl">
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

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setIsFindOpen((prev) => !prev)}
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
                className="flex items-center gap-1 px-2.5 py-1 text-xs rounded bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] text-gray-200 transition-colors cursor-pointer font-medium"
              >
                <Download className="w-3 h-3" />
                <span>Download</span>
              </button>
            </div>
          </div>
        )}

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
  );
};
