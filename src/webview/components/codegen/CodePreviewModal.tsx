/**
 * CodePreviewModal Component
 *
 * Visual dialog displaying prompt-generated multi-file repositories synthesized
 * by Gemini for the active Agent Workflow. Provides tabbed file navigation,
 * copy-to-clipboard, framework/language selector, and workspace export capabilities.
 *
 * Architectural Decisions:
 * 1. Coordinates with Extension Host via BridgeContext (GENERATE_CODE, WRITE_FILES_TO_WORKSPACE).
 * 2. Visual file tabs with language badges and file descriptions.
 * 3. 8pt grid compliant spacing with TailwindCSS.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import React, { useState, useEffect } from 'react';
import {
  Code2,
  FileCode,
  Copy,
  Check,
  Download,
  X,
  Sparkles,
  RefreshCw,
  FolderDown,
  Layers,
} from 'lucide-react';
import { AgentWorkflowDocument, FrameworkTarget, LanguageTarget } from '../../../shared/types';
import { GeneratedFile } from '../../../shared/codegen/types';
import { useBridgeContext } from '../../context/BridgeContext';

export interface CodePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: AgentWorkflowDocument;
}

export const CodePreviewModal: React.FC<CodePreviewModalProps> = ({
  isOpen,
  onClose,
  document: workflowDoc,
}) => {
  const bridge = useBridgeContext();
  const [framework, setFramework] = useState<FrameworkTarget>(workflowDoc.framework || 'google-adk');
  const [language, setLanguage] = useState<LanguageTarget>(workflowDoc.language || 'python');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedFiles, setGeneratedFiles] = useState<GeneratedFile[]>([]);
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [copied, setCopied] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [modelUsed, setModelUsed] = useState<string>('');

  // Subscribe to RPC code generation and file written events
  useEffect(() => {
    const unsubGenerated = bridge.subscribe('CODE_GENERATED', (payload) => {
      setIsGenerating(false);
      if (payload?.files && payload.files.length > 0) {
        setGeneratedFiles(payload.files);
        setActiveFileIndex(0);
        if (payload.modelUsed) {
          setModelUsed(payload.modelUsed);
        }
      }
    });

    const unsubWritten = bridge.subscribe('FILES_WRITTEN', (payload) => {
      if (payload?.success) {
        setExportSuccess(true);
        setTimeout(() => setExportSuccess(false), 3000);
      }
    });

    const unsubExport = bridge.subscribe('EXPORT_COMPLETE', (payload) => {
      setIsGenerating(false);
      if (payload?.success) {
        setExportSuccess(true);
        setTimeout(() => setExportSuccess(false), 3000);
      }
    });

    return () => {
      unsubGenerated();
      unsubWritten();
      unsubExport();
    };
  }, [bridge]);

  // Trigger code generation when modal is opened if no files exist yet
  useEffect(() => {
    if (isOpen && generatedFiles.length === 0 && !isGenerating) {
      handleGenerate();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  /**
   * Dispatches code generation request to Extension Host
   */
  const handleGenerate = () => {
    setGeneratedFiles([]);
    setIsGenerating(true);
    bridge.postMessage({
      type: 'GENERATE_CODE',
      payload: {
        document: {
          ...workflowDoc,
          framework,
          language,
        },
        targetFramework: framework,
        targetLanguage: language,
      },
    });
  };

  /**
   * Writes all generated files into the user's active VS Code workspace
   */
  const handleWriteToWorkspace = () => {
    if (generatedFiles.length === 0) return;
    bridge.postMessage({
      type: 'WRITE_FILES_TO_WORKSPACE',
      payload: {
        files: generatedFiles,
      },
    });
  };

  /**
   * Copies active file content to user clipboard
   */
  const handleCopyCurrentFile = () => {
    const current = generatedFiles[activeFileIndex];
    if (!current) return;
    navigator.clipboard.writeText(current.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const currentFile = generatedFiles[activeFileIndex];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
      <div className="w-full max-w-5xl h-[85vh] backdrop-blur-2xl bg-[#161b22]/95 rounded-xl border border-[#30363d] shadow-2xl flex flex-col overflow-hidden text-[#c9d1d9]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#161b22] border-b border-[#30363d]">
          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded-lg bg-[#0d1117] border border-[#30363d]">
              <Sparkles className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-white">Gemini Code Generation</h2>
                {modelUsed && (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-[#21262d] text-cyan-300 font-mono border border-[#30363d]">
                    {modelUsed}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-gray-400">
                Synthesized multi-file repository powered by framework-specific prompt templates
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-md text-gray-400 hover:text-white hover:bg-[#30363d] transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Toolbar Controls */}
        <div className="px-4 py-2.5 bg-[#0d1117] border-b border-[#30363d] flex items-center justify-between gap-4 flex-wrap">
          {/* Framework & Language Selectors */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-400 font-medium">Framework:</span>
              <select
                value={framework}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFramework(e.target.value as FrameworkTarget)}
                className="bg-[#161b22] border border-[#30363d] text-xs text-white rounded px-2.5 py-1 focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="google-adk">Google ADK (google-genai)</option>
                <option value="langgraph">LangGraph (StateGraph)</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-400 font-medium">Language:</span>
              <select
                value={language}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setLanguage(e.target.value as LanguageTarget)}
                className="bg-[#161b22] border border-[#30363d] text-xs text-white rounded px-2.5 py-1 focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="python">Python 3.11+</option>
                <option value="typescript">TypeScript</option>
              </select>
            </div>

            <button
              type="button"
              onClick={handleGenerate}
              disabled={isGenerating}
              className="flex items-center gap-1.5 px-3 py-1 rounded bg-[#238636] hover:bg-[#2ea043] text-xs text-white font-bold transition-colors cursor-pointer disabled:opacity-50"
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Synthesizing...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Regenerate</span>
                </>
              )}
            </button>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyCurrentFile}
              disabled={!currentFile}
              className="flex items-center gap-1 px-3 py-1 text-xs rounded bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] text-gray-200 transition-colors cursor-pointer disabled:opacity-50"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy File</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleWriteToWorkspace}
              disabled={generatedFiles.length === 0}
              className="flex items-center gap-1.5 px-3.5 py-1 text-xs rounded bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-colors cursor-pointer shadow disabled:opacity-50"
            >
              {exportSuccess ? (
                <>
                  <Check className="w-3.5 h-3.5 text-white" />
                  <span>Exported to Workspace!</span>
                </>
              ) : (
                <>
                  <FolderDown className="w-3.5 h-3.5" />
                  <span>Write to Workspace</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Main Body with File Tabs and Code View */}
        <div className="flex-1 flex min-h-0 bg-[#0d1117]">
          {/* File Explorer Sidebar */}
          <div className="w-56 border-r border-[#30363d] bg-[#161b22] flex flex-col min-h-0 overflow-y-auto p-2 space-y-1">
            <div className="text-[10px] uppercase font-bold text-gray-400 px-2 py-1 tracking-wider">
              Generated Files ({generatedFiles.length})
            </div>
            {generatedFiles.map((file, idx) => (
              <button
                key={file.path}
                type="button"
                onClick={() => setActiveFileIndex(idx)}
                className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-mono transition-all flex items-center justify-between cursor-pointer ${
                  activeFileIndex === idx
                    ? 'bg-blue-500/20 text-white border border-blue-500/40 font-bold'
                    : 'text-gray-400 hover:bg-[#21262d] hover:text-gray-200'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FileCode className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  <span className="truncate">{file.path}</span>
                </div>
              </button>
            ))}
          </div>

          {/* Code Viewer Panel */}
          <div className="flex-1 flex flex-col min-h-0 bg-[#0d1117] overflow-hidden">
            {currentFile ? (
              <div className="flex-1 flex flex-col min-h-0">
                {/* File Metadata Bar */}
                <div className="px-4 py-2 bg-[#161b22] border-b border-[#30363d] flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-white">{currentFile.path}</span>
                    <span className="text-[10px] text-gray-400">— {currentFile.description}</span>
                  </div>
                  <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-[#0d1117] text-gray-400 font-mono border border-[#30363d]">
                    {currentFile.language || 'text'}
                  </span>
                </div>

                {/* File Content */}
                <div className="flex-1 p-4 overflow-auto font-mono text-xs text-[#c9d1d9] leading-relaxed select-text">
                  <pre className="whitespace-pre font-mono selection:bg-blue-900 selection:text-white">
                    {currentFile.content}
                  </pre>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-xs text-gray-500">
                {isGenerating ? 'Synthesizing repository files with Gemini...' : 'No files generated yet.'}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-4 py-2.5 bg-[#161b22] border-t border-[#30363d] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Layers className="w-3.5 h-3.5 text-cyan-400" />
            <span>Workflow: {workflowDoc.name || 'Untitled'}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1 text-xs rounded-lg bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] text-gray-300 hover:text-white cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
