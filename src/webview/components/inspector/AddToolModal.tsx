import React from 'react';
import { 
  Globe, 
  Terminal, 
  Database, 
  FileText, 
  Radio, 
  Code, 
  Check, 
  Plus, 
  X,
  Wrench
} from 'lucide-react';
import { ToolDefinition } from '../../types';
import { AVAILABLE_TOOLS } from '../../data/defaultTools';

interface AddToolModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTool: (tool: ToolDefinition) => void;
  existingToolIds: string[];
}

const getIcon = (type: ToolDefinition['type']) => {
  switch (type) {
    case 'search':
      return <Globe className="w-4 h-4 text-sky-400" />;
    case 'code':
      return <Terminal className="w-4 h-4 text-emerald-400" />;
    case 'db':
      return <Database className="w-4 h-4 text-amber-400" />;
    case 'rag':
      return <FileText className="w-4 h-4 text-purple-400" />;
    case 'api':
      return <Radio className="w-4 h-4 text-rose-400" />;
    default:
      return <Code className="w-4 h-4 text-indigo-400" />;
  }
};

export const AddToolModal: React.FC<AddToolModalProps> = ({
  isOpen,
  onClose,
  onSelectTool,
  existingToolIds,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
      <div className="w-full max-w-md backdrop-blur-2xl bg-[#161b22]/95 rounded-xl border border-[#30363d] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 text-[#c9d1d9]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 bg-[#161b22] border-b border-[#30363d]">
          <div className="flex items-center gap-2">
            <Wrench className="w-4 h-4 text-green-400" />
            <h3 className="text-sm font-bold text-white">Attach Tool to Agent</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-gray-400 hover:text-white hover:bg-[#30363d] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tools Catalog */}
        <div className="p-4 space-y-2 max-h-96 overflow-y-auto">
          {AVAILABLE_TOOLS.map((tool) => {
            const isAlreadyAdded = existingToolIds.includes(tool.id);
            return (
              <div
                key={tool.id}
                onClick={() => {
                  if (!isAlreadyAdded) {
                    onSelectTool(tool);
                    onClose();
                  }
                }}
                className={`flex items-start justify-between p-3 rounded-lg border transition-all ${
                  isAlreadyAdded
                    ? 'bg-[#0d1117]/60 border-[#30363d] opacity-50 cursor-not-allowed'
                    : 'bg-[#21262d] border-[#30363d] hover:border-blue-500/60 hover:bg-[#30363d] cursor-pointer shadow-sm'
                }`}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="p-2 rounded-md bg-[#0d1117] border border-[#30363d] shrink-0 mt-0.5">
                    {getIcon(tool.type)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white">{tool.name}</span>
                      <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-[#0d1117] text-gray-400 font-mono border border-[#30363d]">
                        {tool.type}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">
                      {tool.description}
                    </p>
                  </div>
                </div>

                <div className="ml-2 shrink-0">
                  {isAlreadyAdded ? (
                    <span className="flex items-center gap-1 text-[10px] text-green-400 bg-[#0d1117] px-2 py-1 rounded border border-green-500/30">
                      <Check className="w-3 h-3" />
                      Attached
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="flex items-center gap-1 px-2.5 py-1 text-xs rounded bg-[#238636] hover:bg-[#2ea043] text-white font-bold shadow-sm transition-colors cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      Add
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 bg-[#0d1117] border-t border-[#30363d] flex justify-end">
          <button
            onClick={onClose}
            className="px-3.5 py-1 text-xs font-medium rounded-lg bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] text-gray-300 hover:text-white cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
