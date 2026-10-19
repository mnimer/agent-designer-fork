/**
 * ModelSelector - Modular drop-down model selector with reasoning budget controls.
 *
 * This component standardizes model picking and exposes specialized controls 
 * such as collapsible temperature, token budgets, and adaptive thinking (reasoning budget)
 * for advanced models like Gemini 3.8 and Gemini 3.7 Flash.
 *
 * Architectural Decisions:
 * 1. Cohesive AI Parameters: Group model-specific switches within the same container.
 * 2. 8pt Grid Compliant: Utilizes gap-4 (16px), space-y-4 (16px), and p-3 (12px) spacings.
 * 3. Collapsible Creative Temperature: Collapsed by default since users rarely adjust it,
 *    while displaying the active value badge in the header.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import React, { useState } from 'react';
import { Cpu, Sliders, ChevronDown, ChevronRight } from 'lucide-react';
import { DrawerField } from './DrawerField';

/**
 * ModelSelectorProps - Properties for the ModelSelector primitive component
 */
export interface ModelSelectorProps {
  selectedModel?: string;
  value?: string;
  onChangeModel?: (model: string) => void;
  onChange?: (model: string) => void;
  temperature?: number;
  onChangeTemperature?: (temp: number) => void;
  thinkingBudget?: number;
  onChangeThinkingBudget?: (budget: number) => void;
  className?: string;
}

const SUPPORTED_MODELS = [
  { 
    id: 'gemini-3.8-flash', 
    name: 'Gemini 3.8 Flash (Recommended)', 
    desc: 'Next-gen hybrid reasoning with adaptive thinking (location="global")' 
  },
  { 
    id: 'gemini-3.7-flash', 
    name: 'Gemini 3.7 Flash', 
    desc: 'Hybrid reasoning with adaptive thinking (location="global")' 
  },
  { 
    id: 'gemini-3.6-flash', 
    name: 'Gemini 3.6 Flash', 
    desc: 'Advanced multimodal reasoning' 
  },
  { 
    id: 'gemini-3.5-flash', 
    name: 'Gemini 3.5 Flash', 
    desc: 'Fast, lightweight multimodal reasoning' 
  },
];

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  selectedModel,
  value,
  onChangeModel,
  onChange,
  temperature = 1.0,
  onChangeTemperature,
  thinkingBudget,
  onChangeThinkingBudget,
  className = '',
}) => {
  const [isTempExpanded, setIsTempExpanded] = useState(false);
  const currentModel = selectedModel || value || 'gemini-3.7-flash';
  const handleModelChangeCallback = onChangeModel || onChange || (() => {});

  // Determine if the current model supports a reasoning budget (e.g., Gemini 3.8, Gemini 3.7)
  const supportsReasoning = Boolean(currentModel && (currentModel.includes('3.8') || currentModel.includes('3.7')));
  const isReasoningEnabled = thinkingBudget !== undefined && thinkingBudget > 0;

  const handleReasoningToggle = (enabled: boolean) => {
    if (onChangeThinkingBudget) {
      // Default to 1024 tokens if enabled, 0 (disabled) if turned off
      onChangeThinkingBudget(enabled ? 1024 : 0);
    }
  };

  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextModel = e.target.value;
    handleModelChangeCallback(nextModel);
    
    // Automatically disable reasoning budget if moving to a model that does not support it
    if (!nextModel.includes('3.8') && !nextModel.includes('3.7') && onChangeThinkingBudget) {
      onChangeThinkingBudget(0);
    }
  };

  return (
    <div className={`space-y-3 ${className}`}>
      {/* 1. Model Dropdown Select */}
      <DrawerField 
        label="AI Foundation Model" 
        subLabel="The foundational Gemini model used for reasoning and orchestration."
        tooltip="Gemini 3.8 Flash is recommended for its powerful multi-agent coordination capabilities."
      >
        <div className="relative">
          <Cpu className="absolute left-3 top-2.5 w-4 h-4 text-emerald-500 pointer-events-none" />
          <select
            value={currentModel}
            onChange={handleModelChange}
            className="w-full pl-9 pr-8 py-2 bg-[#161b22] border border-[#30363d] rounded text-xs text-gray-200 focus:outline-none focus:border-emerald-500 appearance-none font-mono cursor-pointer"
            data-testid="model-select"
          >
            {SUPPORTED_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-gray-500">
            <Sliders className="w-3.5 h-3.5" />
          </div>
        </div>
      </DrawerField>

      {/* 2. Reasoning / Thinking Budget Panel (only visible when onChangeThinkingBudget is passed) */}
      {supportsReasoning && onChangeThinkingBudget && (
        <div 
          className="p-3.5 bg-[#161b22] border border-[#30363d] rounded-lg space-y-3"
          data-testid="reasoning-panel"
        >
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <label className="text-[11px] font-bold text-gray-300">
                Reasoning / Adaptive Thinking
              </label>
              <p className="text-[9px] text-gray-400 leading-none">
                Allows the model to think before responding
              </p>
            </div>
            <input
              type="checkbox"
              checked={isReasoningEnabled}
              onChange={(e) => handleReasoningToggle(e.target.checked)}
              className="w-3.5 h-3.5 rounded bg-[#0d1117] border-[#30363d] text-emerald-500 focus:ring-emerald-500 cursor-pointer focus:ring-offset-[#161b22]"
              data-testid="reasoning-toggle"
            />
          </div>

          {isReasoningEnabled && (
            <div className="space-y-2 animate-fade-in" data-testid="budget-container">
              <div className="flex items-center justify-between text-[10px] font-mono">
                <span className="text-gray-400">Thinking Budget Limit</span>
                <span className="text-emerald-400 font-bold">{thinkingBudget} tokens</span>
              </div>
              <input
                type="range"
                min={1024}
                max={16384}
                step={512}
                value={thinkingBudget}
                onChange={(e) => onChangeThinkingBudget(parseInt(e.target.value, 10))}
                className="w-full accent-emerald-500 cursor-pointer h-1.5 rounded-lg bg-gray-700"
                data-testid="budget-slider"
              />
              <div className="flex justify-between text-[9px] text-gray-500 font-mono">
                <span>1K (Low budget)</span>
                <span>16K (Deep thinking)</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. Creative Temperature Slider (Collapsed by Default) */}
      {onChangeTemperature && (
        <div className="rounded-lg border border-[#30363d] bg-[#0d1117] overflow-hidden" data-testid="temp-collapsible-section">
          <button
            type="button"
            onClick={() => setIsTempExpanded((prev) => !prev)}
            className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-[#161b22] transition-colors cursor-pointer"
            data-testid="temp-toggle-button"
          >
            <div className="flex items-center gap-1.5">
              {isTempExpanded ? (
                <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
              )}
              <span className="text-[11px] font-bold uppercase tracking-tight text-gray-300">
                Creative Temperature
              </span>
            </div>
            <span className="text-[10px] font-mono font-semibold text-emerald-400 bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-500/20">
              {temperature.toFixed(1)}
            </span>
          </button>

          {isTempExpanded && (
            <div className="px-3 pb-3 pt-1 border-t border-[#21262d] space-y-2" data-testid="temp-container">
              <p className="text-[10px] text-gray-400 leading-normal">
                Controls creative randomness. Lower is more predictable (0.0), higher is more creative (2.0).
              </p>
              <div className="flex justify-between text-[10px] font-mono">
                <span className="text-gray-400">Value Threshold</span>
                <span className="text-emerald-400 font-semibold">{temperature.toFixed(1)}</span>
              </div>
              <input
                type="range"
                min={0.0}
                max={2.0}
                step={0.1}
                value={temperature}
                onChange={(e) => onChangeTemperature(parseFloat(e.target.value))}
                className="w-full accent-emerald-500 cursor-pointer h-1.5 rounded-lg bg-gray-700"
                data-testid="temp-slider"
              />
              <div className="flex justify-between text-[9px] text-gray-500 font-mono">
                <span>0.0 (Deterministic)</span>
                <span>1.0 (Balanced)</span>
                <span>2.0 (Creative)</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
