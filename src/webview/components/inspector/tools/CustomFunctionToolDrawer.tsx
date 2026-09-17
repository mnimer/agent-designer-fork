/**
 * Custom Function Tool Drawer
 *
 * Dedicated inspector property panel for user-defined Python / TypeScript tools:
 * 1. Mode selection: "Local Python File" (.py) vs "AI Generated" (LLM synthesized).
 * 2. Local Python File picker: Browse button via VS Code file dialog, side-by-side file opening.
 * 3. Function signature inspector & auto-detected function dropdown.
 * 4. Docstring / tool-calling description (`codePrompt`) used by Gemini for tool selection.
 * 5. Interactive parameter schema manager (add, inspect, remove arguments).
 * 6. Code compilation preview.
 *
 * Author: Mike Nimer <mikenimer@google.com>
 */

import React, { useState, useEffect } from 'react';
import {
  Code,
  Sliders,
  Trash2,
  Plus,
  Sparkles,
  FileCode,
  FolderOpen,
  ExternalLink,
  Bot,
  FileCheck,
  RefreshCw,
} from 'lucide-react';
import { ToolDefinition, AgentData } from '../../../../types';
import { ToolDrawerShell } from './ToolDrawerShell';
import { useWebviewBridge } from '../../../hooks/useWebviewBridge';

export interface CustomFunctionToolDrawerProps {
  tool: ToolDefinition | null;
  isOpen: boolean;
  onClose: () => void;
  onSaveTool?: (updatedTool: ToolDefinition) => void;
  onUpdateTool?: (updatedTool: ToolDefinition) => void;
  onDeleteTool?: (toolId: string) => void;
  selectedAgent?: AgentData | null;
  onAttachToAgent?: (agentId: string, tool: ToolDefinition) => void;
  scope?: 'global' | 'agent';
  agentName?: string;
}

interface DetectedFunction {
  name: string;
  docstring?: string;
  parameters?: Record<string, string>;
}

export const CustomFunctionToolDrawer: React.FC<CustomFunctionToolDrawerProps> = ({
  tool,
  isOpen,
  onClose,
  onSaveTool,
  onUpdateTool,
  onDeleteTool,
  selectedAgent,
  onAttachToAgent,
  scope = 'global',
  agentName,
}) => {
  const bridge = useWebviewBridge();
  const [formData, setFormData] = useState<ToolDefinition | null>(null);

  // Parameter state for manual adding
  const [newParamKey, setNewParamKey] = useState('');
  const [newParamVal, setNewParamVal] = useState('');

  // Detected functions from local python file
  const [detectedFunctions, setDetectedFunctions] = useState<DetectedFunction[]>([]);
  const [isParsingFile, setIsParsingFile] = useState(false);

  useEffect(() => {
    if (tool) {
      const mode = tool.sourceFile ? 'local_file' : (tool.toolMode || 'local_file');
      setFormData({
        ...tool,
        toolMode: mode,
      });

      if (tool.sourceFile) {
        bridge.postMessage({
          type: 'PARSE_PYTHON_TOOL_FILE',
          payload: { filePath: tool.sourceFile },
        });
      }
    }
  }, [tool, bridge]);

  // Listen for file pick and parse responses
  useEffect(() => {
    const unsubPicked = bridge.subscribe('LOCAL_PYTHON_TOOL_PICKED', (payload: any) => {
      if (payload && payload.success) {
        const filePath = payload.relativePath || payload.filePath;
        const funcs: DetectedFunction[] = payload.functions || [];
        setDetectedFunctions(funcs);

        setFormData((prev) => {
          if (!prev) return null;
          const patch: Partial<ToolDefinition> = {
            sourceFile: filePath,
            toolMode: 'local_file',
            availableFunctions: funcs.map((f) => f.name),
          };

          if (funcs.length > 0) {
            const first = funcs[0];
            patch.functionName = first.name;
            patch.name = first.name;
            if (first.docstring) patch.description = first.docstring;
            if (first.parameters && Object.keys(first.parameters).length > 0) {
              patch.parameters = first.parameters;
            }
          }
          const next = { ...prev, ...patch };
          (onUpdateTool || onSaveTool)?.(next);
          return next;
        });
      }
    });

    const unsubParsed = bridge.subscribe('PYTHON_TOOL_FILE_PARSED', (payload: any) => {
      setIsParsingFile(false);
      if (payload && payload.success) {
        const funcs: DetectedFunction[] = payload.functions || [];
        setDetectedFunctions(funcs);
        setFormData((prev) => {
          if (!prev) return null;
          const next = {
            ...prev,
            availableFunctions: funcs.map((f) => f.name),
          };
          (onUpdateTool || onSaveTool)?.(next);
          return next;
        });
      }
    });

    return () => {
      unsubPicked();
      unsubParsed();
    };
  }, [bridge, onUpdateTool, onSaveTool]);

  if (!isOpen || !formData) return null;

  const handleUpdate = (patch: Partial<ToolDefinition>) => {
    setFormData((prev) => {
      if (!prev) return null;
      const next = { ...prev, ...patch };
      (onUpdateTool || onSaveTool)?.(next);
      return next;
    });
  };

  const handleModeChange = (mode: 'local_file' | 'ai_generated') => {
    handleUpdate({ toolMode: mode });
  };

  const handleBrowseFile = () => {
    bridge.postMessage({
      type: 'PICK_LOCAL_PYTHON_TOOL',
    });
  };

  const handleOpenFileInEditor = () => {
    if (!formData.sourceFile) return;
    bridge.postMessage({
      type: 'OPEN_LOCAL_TOOL_FILE',
      payload: { filePath: formData.sourceFile },
    });
  };

  const handleRefreshFunctions = () => {
    if (!formData.sourceFile) return;
    setIsParsingFile(true);
    bridge.postMessage({
      type: 'PARSE_PYTHON_TOOL_FILE',
      payload: { filePath: formData.sourceFile },
    });
  };

  const handleSelectFunction = (funcName: string) => {
    const selected = detectedFunctions.find((f) => f.name === funcName);
    if (selected) {
      handleUpdate({
        functionName: selected.name,
        name: selected.name,
        description: selected.docstring || formData.description,
        parameters: selected.parameters || formData.parameters,
      });
    } else {
      handleUpdate({ functionName: funcName, name: funcName });
    }
  };

  const handleAddParam = () => {
    if (!newParamKey.trim()) return;
    const currentParams = formData.parameters || {};
    handleUpdate({
      parameters: {
        ...currentParams,
        [newParamKey.trim()]: newParamVal.trim() || 'string',
      },
    });
    setNewParamKey('');
    setNewParamVal('');
  };

  const handleRemoveParam = (paramName: string) => {
    const currentParams = { ...(formData.parameters || {}) };
    delete currentParams[paramName];
    handleUpdate({ parameters: currentParams });
  };

  const isAlreadyAttached =
    selectedAgent &&
    (selectedAgent.tools || []).some(
      (t) => t.id === formData.id || t.name.toLowerCase() === formData.name.toLowerCase()
    );

  const functionIdentifier = (formData.functionName || formData.name || 'custom_tool')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/^([0-9])/, '_$1');

  const isLocalFileMode = formData.toolMode !== 'ai_generated';

  return (
    <ToolDrawerShell
      isOpen={isOpen}
      onClose={onClose}
      toolName={formData.name}
      onChangeName={(name) => handleUpdate({ name, functionName: name })}
      namePlaceholder="Custom Function Tool"
      description={formData.description}
      onChangeDescription={(description) => handleUpdate({ description })}
      typeBadge={{
        label: isLocalFileMode ? 'LOCAL PYTHON TOOL' : 'AI GENERATED TOOL',
        subLabel: isLocalFileMode ? 'Linked .py file' : 'Synthesized in pipeline',
        color: 'text-indigo-400',
        bg: 'bg-indigo-500/10',
        border: 'border-indigo-500/30',
      }}
      toolIcon={<Code className="w-5 h-5 text-indigo-400" />}
      scope={scope}
      agentName={agentName}
      selectedAgent={selectedAgent}
      isAlreadyAttached={Boolean(isAlreadyAttached)}
      onAttachToAgent={
        selectedAgent && onAttachToAgent ? () => onAttachToAgent(selectedAgent.id, formData) : undefined
      }
      onDelete={
        onDeleteTool && (formData.id.startsWith('tool_custom_') || formData.id === 'tool_custom_function')
          ? () => onDeleteTool(formData.id)
          : undefined
      }
    >
      {/* Implementation Mode Toggle - 8pt grid compliant */}
      <div className="p-2 bg-[#0d1117] rounded-lg border border-[#30363d] space-y-2">
        <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
          Tool Implementation Mode
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => handleModeChange('local_file')}
            className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 border transition-colors cursor-pointer ${
              isLocalFileMode
                ? 'bg-indigo-600/30 border-indigo-500 text-indigo-200'
                : 'bg-[#161b22] border-[#30363d] text-gray-400 hover:text-white'
            }`}
          >
            <FileCode className="w-4 h-4 text-indigo-400" />
            <span>Local Python File</span>
          </button>
          <button
            type="button"
            onClick={() => handleModeChange('ai_generated')}
            className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 border transition-colors cursor-pointer ${
              !isLocalFileMode
                ? 'bg-purple-600/30 border-purple-500 text-purple-200'
                : 'bg-[#161b22] border-[#30363d] text-gray-400 hover:text-white'
            }`}
          >
            <Bot className="w-4 h-4 text-purple-400" />
            <span>AI Generated</span>
          </button>
        </div>
      </div>

      {/* Local Python File Configuration */}
      {isLocalFileMode ? (
        <div className="space-y-4 p-4 bg-[#0d1117] rounded-lg border border-indigo-500/30">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold uppercase tracking-tight text-indigo-300 flex items-center gap-1.5">
                <FolderOpen className="w-3.5 h-3.5 text-indigo-400" />
                Python Source File (.py)
              </label>
              {formData.sourceFile && (
                <button
                  type="button"
                  onClick={handleOpenFileInEditor}
                  className="text-[10px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer"
                  title="Open file side-by-side in VS Code"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span>Open in Editor</span>
                </button>
              )}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={formData.sourceFile || ''}
                onChange={(e) => handleUpdate({ sourceFile: e.target.value })}
                placeholder="./tools/my_tool.py"
                className="flex-1 px-3 py-2 bg-[#161b22] border border-[#30363d] focus:border-indigo-500 rounded-lg text-xs font-mono text-gray-200 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleBrowseFile}
                className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                <span>Browse...</span>
              </button>
            </div>
            <p className="text-[10px] text-gray-400">
              Copied automatically into the generated agent&#39;s <code className="text-gray-300">./tools/</code> folder upon code generation.
            </p>
          </div>

          {/* Function Selector Dropdown */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold uppercase tracking-tight text-indigo-300 flex items-center gap-1.5">
                <FileCheck className="w-3.5 h-3.5 text-indigo-400" />
                Tool Function in File
              </label>
              {formData.sourceFile && (
                <button
                  type="button"
                  onClick={handleRefreshFunctions}
                  disabled={isParsingFile}
                  className="text-[10px] text-gray-400 hover:text-white flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  title="Scan file for functions"
                >
                  <RefreshCw className={`w-3 h-3 ${isParsingFile ? 'animate-spin' : ''}`} />
                  <span>Rescan</span>
                </button>
              )}
            </div>

            {detectedFunctions.length > 0 ? (
              <select
                value={formData.functionName || formData.name || ''}
                onChange={(e) => handleSelectFunction(e.target.value)}
                className="w-full px-3 py-2 bg-[#161b22] border border-[#30363d] focus:border-indigo-500 rounded-lg text-xs font-mono text-indigo-300 focus:outline-none cursor-pointer"
              >
                {detectedFunctions.map((fn) => (
                  <option key={fn.name} value={fn.name}>
                    {fn.name}() {fn.docstring ? `— ${fn.docstring.slice(0, 40)}...` : ''}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={formData.functionName || formData.name || ''}
                onChange={(e) => handleUpdate({ functionName: e.target.value, name: e.target.value })}
                placeholder="function_name"
                className="w-full px-3 py-2 bg-[#161b22] border border-[#30363d] focus:border-indigo-500 rounded-lg text-xs font-mono text-gray-200 focus:outline-none"
              />
            )}
          </div>
        </div>
      ) : null}

      {/* Python Signature Preview */}
      <div className="space-y-2 bg-[#0d1117] p-4 rounded-lg border border-indigo-500/40 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-indigo-300 font-bold text-xs">
            <FileCode className="w-4 h-4 text-indigo-400" />
            <span>Function Signature</span>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-mono font-bold">
            def {functionIdentifier}()
          </span>
        </div>

        <div className="p-2.5 rounded bg-[#161b22] border border-[#30363d] font-mono text-[11px] text-gray-300 overflow-x-auto">
          <span className="text-purple-400">def </span>
          <span className="text-indigo-300 font-bold">{functionIdentifier}</span>(
          {Object.entries(formData.parameters || {}).map(([key, val], idx, arr) => (
            <span key={key}>
              <span className="text-emerald-300">{key}</span>: <span className="text-amber-300">str</span>
              {idx < arr.length - 1 ? ', ' : ''}
            </span>
          ))}
          ) -&gt; <span className="text-amber-300">dict</span>:
        </div>
      </div>

      {/* Tool Docstring & Instructions */}
      <div className="space-y-2 p-4 bg-[#0d1117] rounded-lg border border-[#30363d]">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-bold uppercase tracking-tight text-gray-400 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            {isLocalFileMode ? 'Docstring Description' : 'Tool Docstring & Execution Prompt'}
          </label>
        </div>
        <textarea
          rows={3}
          value={isLocalFileMode ? formData.description : (formData.codePrompt || formData.description || '')}
          onChange={(e) =>
            isLocalFileMode
              ? handleUpdate({ description: e.target.value })
              : handleUpdate({ codePrompt: e.target.value, description: e.target.value })
          }
          placeholder="Detailed instructions explaining to the LLM when to invoke this tool and what parameters to pass..."
          className="w-full min-h-[80px] max-h-[200px] px-3 py-2 bg-[#161b22] border border-[#30363d] focus:border-indigo-500 rounded-lg text-xs text-gray-200 focus:outline-none resize-y font-mono leading-relaxed"
        />
        <div className="text-[10px] text-gray-400 flex items-center justify-between">
          <span>Injected into the tool declaration docstring during code generation</span>
          <span className="text-[9px] font-mono text-gray-400">↕ Drag to resize</span>
        </div>
      </div>

      {/* Parameter Schema Manager */}
      <div className="space-y-3 p-4 bg-[#0d1117] rounded-lg border border-[#30363d]">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-bold uppercase tracking-tight text-gray-400 flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 text-indigo-400" />
            Function Parameters ({Object.keys(formData.parameters || {}).length})
          </label>
        </div>

        <div className="space-y-1.5 max-h-40 overflow-y-auto">
          {Object.entries(formData.parameters || {}).length === 0 ? (
            <div className="text-[11px] text-gray-500 italic p-2 text-center bg-[#161b22] rounded border border-dashed border-[#30363d]">
              No parameters defined yet. Add arguments below.
            </div>
          ) : (
            Object.entries(formData.parameters || {}).map(([paramName, paramDesc]) => (
              <div
                key={paramName}
                className="flex items-center justify-between bg-[#161b22] px-2.5 py-1.5 rounded border border-[#30363d] text-[11px] font-mono"
              >
                <div className="min-w-0">
                  <span className="text-emerald-300 font-bold">{paramName}</span>
                  <span className="text-gray-400 text-[10px] ml-2 truncate">({paramDesc})</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveParam(paramName)}
                  className="text-gray-400 hover:text-rose-400 cursor-pointer p-0.5"
                  title="Remove parameter"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Add Parameter Input Row */}
        <div className="flex gap-1.5 pt-1">
          <input
            type="text"
            value={newParamKey}
            onChange={(e) => setNewParamKey(e.target.value)}
            placeholder="Argument name (e.g. query)"
            className="flex-1 px-2.5 py-1.5 bg-[#161b22] border border-[#30363d] focus:border-indigo-500 rounded text-[10px] font-mono text-gray-200 focus:outline-none"
          />
          <input
            type="text"
            value={newParamVal}
            onChange={(e) => setNewParamVal(e.target.value)}
            placeholder="Type / Description"
            className="flex-1 px-2.5 py-1.5 bg-[#161b22] border border-[#30363d] focus:border-indigo-500 rounded text-[10px] font-mono text-gray-200 focus:outline-none"
          />
          <button
            type="button"
            onClick={handleAddParam}
            className="px-3 py-1.5 bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] rounded text-[10px] text-indigo-300 font-medium cursor-pointer flex items-center gap-1"
          >
            <Plus className="w-3 h-3" />
            <span>Add</span>
          </button>
        </div>
      </div>
    </ToolDrawerShell>
  );
};
