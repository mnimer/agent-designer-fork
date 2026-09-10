/**
 * FindInFilesBar
 *
 * Provides a standard code search and find-in-files toolbar for generated codebases,
 * supporting search across the current active file or all generated source files,
 * case sensitivity, whole word matching, match counts, and next/previous cycling.
 *
 * Architectural Decisions:
 * 1. Follows standard IDE search widget behavior (Cmd+F / Ctrl+F toggle, Enter for next, Shift+Enter for prev, Esc to close).
 * 2. Supports two search scopes: 'current' (active file) and 'all' (all generated files).
 * 3. In 'all' scope, renders clickable file pills with hit counts to switch active files quickly.
 * 4. Adheres strictly to the 8pt UI grid system for all padding, margins, and sizing.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import React, { useEffect, useRef } from 'react';
import { 
  Search, 
  ChevronUp, 
  ChevronDown, 
  X, 
  Files, 
  FileText 
} from 'lucide-react';
import { GeneratedFile } from '../../types';

export interface SearchMatch {
  fileIndex: number;
  fileName: string;
  line: number;
  startIndex: number;
  endIndex: number;
}

export interface FindInFilesBarProps {
  isOpen: boolean;
  onClose: () => void;
  query: string;
  onQueryChange: (query: string) => void;
  scope: 'current' | 'all';
  onScopeChange: (scope: 'current' | 'all') => void;
  isCaseSensitive: boolean;
  onToggleCaseSensitive: () => void;
  isWholeWord: boolean;
  onToggleWholeWord: () => void;
  currentMatchIndex: number;
  totalMatchesInFile: number;
  totalMatchesAllFiles: number;
  filesWithMatches: { fileIndex: number; fileName: string; matchCount: number }[];
  onNextMatch: () => void;
  onPrevMatch: () => void;
  onSelectFile: (fileIndex: number) => void;
  activeFileIndex: number;
}

export const FindInFilesBar: React.FC<FindInFilesBarProps> = ({
  isOpen,
  onClose,
  query,
  onQueryChange,
  scope,
  onScopeChange,
  isCaseSensitive,
  onToggleCaseSensitive,
  isWholeWord,
  onToggleWholeWord,
  currentMatchIndex,
  totalMatchesInFile,
  totalMatchesAllFiles,
  filesWithMatches,
  onNextMatch,
  onPrevMatch,
  onSelectFile,
  activeFileIndex,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        onPrevMatch();
      } else {
        onNextMatch();
      }
    }
  };

  return (
    <div 
      data-testid="find-in-files-bar"
      className="bg-[#161b22] border-b border-[#30363d] p-2 flex flex-col gap-2 shrink-0 select-none shadow-md"
    >
      <div className="flex items-center gap-2">
        {/* Search input container */}
        <div className="flex items-center flex-1 min-w-[200px] max-w-[400px] bg-[#0d1117] border border-[#30363d] focus-within:border-blue-500 rounded-md px-2 py-1 text-xs">
          <Search className="w-3.5 h-3.5 text-gray-400 mr-1.5 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={scope === 'current' ? 'Find in current file...' : 'Find in all generated files...'}
            className="w-full bg-transparent text-gray-200 placeholder-gray-500 focus:outline-none font-mono text-xs"
          />

          {/* Case Sensitive Toggle */}
          <button
            type="button"
            onClick={onToggleCaseSensitive}
            title="Match Case (Alt+C)"
            className={`px-1 py-0.5 rounded text-[10px] font-mono font-bold transition-colors cursor-pointer ${
              isCaseSensitive 
                ? 'bg-blue-600 text-white' 
                : 'text-gray-400 hover:text-gray-200 hover:bg-[#21262d]'
            }`}
          >
            Aa
          </button>

          {/* Whole Word Toggle */}
          <button
            type="button"
            onClick={onToggleWholeWord}
            title="Match Whole Word (Alt+W)"
            className={`px-1 py-0.5 ml-1 rounded text-[10px] font-mono font-bold transition-colors cursor-pointer ${
              isWholeWord 
                ? 'bg-blue-600 text-white' 
                : 'text-gray-400 hover:text-gray-200 hover:bg-[#21262d]'
            }`}
          >
            \b
          </button>
        </div>

        {/* Scope Toggle: Current File vs All Files */}
        <div className="flex items-center rounded-md bg-[#0d1117] border border-[#30363d] p-0.5 text-[11px]">
          <button
            type="button"
            onClick={() => onScopeChange('current')}
            className={`flex items-center gap-1 px-2 py-0.5 rounded font-medium transition-colors cursor-pointer ${
              scope === 'current'
                ? 'bg-[#21262d] text-white shadow-xs'
                : 'text-gray-400 hover:text-gray-200'
            }`}
            title="Search in current file"
          >
            <FileText className="w-3 h-3" />
            <span>File</span>
          </button>
          <button
            type="button"
            onClick={() => onScopeChange('all')}
            className={`flex items-center gap-1 px-2 py-0.5 rounded font-medium transition-colors cursor-pointer ${
              scope === 'all'
                ? 'bg-[#21262d] text-white shadow-xs'
                : 'text-gray-400 hover:text-gray-200'
            }`}
            title="Search across all generated files"
          >
            <Files className="w-3 h-3" />
            <span>All Files</span>
          </button>
        </div>

        {/* Match Count Display */}
        <div className="text-[11px] font-mono text-gray-400 px-1 min-w-[70px]">
          {query.trim() === '' ? (
            <span className="text-gray-500">No query</span>
          ) : scope === 'current' ? (
            totalMatchesInFile > 0 ? (
              <span className="text-gray-300">
                {currentMatchIndex + 1} of {totalMatchesInFile}
              </span>
            ) : (
              <span className="text-rose-400">No matches</span>
            )
          ) : (
            <span className={totalMatchesAllFiles > 0 ? 'text-gray-300' : 'text-rose-400'}>
              {totalMatchesAllFiles} results ({filesWithMatches.length} files)
            </span>
          )}
        </div>

        {/* Previous Match */}
        <button
          type="button"
          onClick={onPrevMatch}
          disabled={!query.trim() || (scope === 'current' ? totalMatchesInFile === 0 : totalMatchesAllFiles === 0)}
          title="Previous Match (Shift+Enter)"
          className="p-1 rounded text-gray-400 hover:text-white hover:bg-[#21262d] disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed cursor-pointer"
        >
          <ChevronUp className="w-3.5 h-3.5" />
        </button>

        {/* Next Match */}
        <button
          type="button"
          onClick={onNextMatch}
          disabled={!query.trim() || (scope === 'current' ? totalMatchesInFile === 0 : totalMatchesAllFiles === 0)}
          title="Next Match (Enter)"
          className="p-1 rounded text-gray-400 hover:text-white hover:bg-[#21262d] disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed cursor-pointer"
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>

        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          title="Close (Escape)"
          className="p-1 rounded text-gray-400 hover:text-white hover:bg-[#21262d] ml-auto cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* When scope is 'all' and there are matches, show clickable file pills */}
      {scope === 'all' && query.trim() !== '' && filesWithMatches.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pt-1 border-t border-[#21262d] text-[10px]">
          <span className="text-gray-500 font-medium shrink-0">Matching Files:</span>
          {filesWithMatches.map((item) => (
            <button
              key={item.fileIndex}
              type="button"
              onClick={() => onSelectFile(item.fileIndex)}
              className={`px-2 py-0.5 rounded-full font-mono flex items-center gap-1 shrink-0 transition-colors cursor-pointer ${
                activeFileIndex === item.fileIndex
                  ? 'bg-blue-600/30 text-blue-300 border border-blue-500/50 font-semibold'
                  : 'bg-[#21262d] text-gray-400 hover:text-gray-200 border border-[#30363d]'
              }`}
            >
              <span>{item.fileName}</span>
              <span className="px-1 rounded-full bg-[#0d1117] text-[9px] text-gray-300">
                {item.matchCount}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
