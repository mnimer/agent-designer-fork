import React from 'react';
import { Cpu, Sliders, Info } from 'lucide-react';
import { DrawerField } from './DrawerField';

/**
 * ModelSelectorProps - Properties for the ModelSelector primitive component
 *
 * @author Mike Nimer <mikenimer@google.com>
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
    desc: 'Next-gen hybrid reasoning with adaptive thinking on Vertex AI (location="global")' 
  },
  { 
    id: 'gemini-3.7-flash', 
    name: 'Gemini 3.7 Flash', 
    desc: 'Hybrid reasoning with adaptive thinking on Vertex AI (location="global")' 
  },
  { 
    id: 'gemini-3.6-flash', 
    name: 'Gemini 3.6 Flash', 
    desc: 'Advanced multimodal reasoning on Vertex AI' 
  },
  { 
    id: 'gemini-3.5-flash', 
    name: 'Gemini 3.5 Flash', 
    desc: 'Fast, lightweight multimodal reasoning on Vertex AI' 
  },
];

/**
 * ModelSelector - Modular drop-down model selector with reasoning budget controls.
 *
 * This component standardizes model picking and exposes specialized controls 
 * such as temperature, token budgets, and adaptive thinking (reasoning budget)
 * for advanced models like Gemini 3.8 and Gemini 3.7 Flash.
 *
 * Architectural Decisions:
 * 1. Cohesive AI Parameters: Group model-specific switches within the same container.
 * 2. 8pt Grid Compliant: Utilizes gap-4 (16px), space-y-4 (16px), and p-3 (12px) spacings.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */
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
    <div className={`space-y-4 ${className}`}>
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

      {/* Model Description Box */}
      <div className="p-3 bg-emerald-950/10 border border-emerald-500/10 rounded-lg flex gap-2">
        <Info className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
        <p className="text-[10px] text-gray-400 leading-relaxed">
          {SUPPORTED_MODELS.find(m => m.id === currentModel)?.desc || 'Custom selected LLM foundation engine.'}
        </p>
      </div>

      {/* 2. Reasoning / Thinking Budget Panel (only visible for Gemini 3.7) */}
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

      {/* 3. Creative Temperature Slider */}
      {onChangeTemperature && (
        <DrawerField 
          label="Creative Temperature" 
          subLabel="Controls creative randomness. Lower is more predictable, higher is more creative."
          tooltip="A value of 0.0 is deterministic and ideal for routine coding or analytics, 1.0 is standard."
        >
          <div className="space-y-1.5 pt-1" data-testid="temp-container">
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
        </DrawerField>
      )}
    </div>
  );
};
