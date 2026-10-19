/**
 * A2UIConfigSection Component
 *
 * Simplified Inspector drawer toggle card for Rich UI (A2UI).
 * Enables developers to turn on interactive A2UI surfaces for an agent with a single toggle,
 * automatically configuring the full 25-widget Gemini Enterprise Composite catalog and
 * deterministic State-to-UI Adapter pattern under the hood.
 *
 * Architectural Decisions:
 * 1. Single Toggle Simplicity: Replaces multi-section protocol configuration with a single
 *    "Enable Rich UI (A2UI)" toggle and automatically applies production-grade defaults
 *    (catalog: 'gemini_enterprise_composite_v09', generationMode: 'state_adapter').
 * 2. Single Source of Truth: Edits mutate the agent's a2uiConfig conforming to A2UIConfig in agentSpec.ts.
 * 3. Visual & Structural Consistency: Adheres to the 8pt grid system, matching dark mode styling
 *    (#161b22, #0d1117, #30363d) and Tailwind conventions of StandardAgentDrawer.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import React, { useMemo } from 'react';
import { Layers } from 'lucide-react';
import { A2UIConfig } from '../../../shared/types';
import { createDefaultA2UIConfig } from '../../data/a2uiCatalogRegistry';

export interface A2UIConfigSectionProps {
  a2uiConfig?: A2UIConfig;
  onChange: (updated: A2UIConfig) => void;
}

export const A2UIConfigSection: React.FC<A2UIConfigSectionProps> = ({
  a2uiConfig,
  onChange,
}) => {
  // Resolve active config with safe defaults
  const config: A2UIConfig = useMemo(() => {
    return a2uiConfig || createDefaultA2UIConfig();
  }, [a2uiConfig]);

  /**
   * Toggles A2UI support for the agent and ensures full composite widget catalog
   * and deterministic state_adapter defaults are active when enabled.
   */
  const handleToggleEnabled = (enabled: boolean) => {
    onChange({
      ...config,
      enabled,
      catalog: 'gemini_enterprise_composite_v09',
      generationMode: 'state_adapter',
      enableNonLlmUtilityActions: true,
    });
  };

  return (
    <div className="border border-[#30363d] rounded-lg bg-[#161b22] overflow-hidden my-2">
      {/* Header & Single Master Toggle */}
      <div className="flex items-center justify-between p-3 bg-[#161b22]">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-indigo-400 shrink-0" />
          <span className="text-sm font-semibold text-white">Rich UI (A2UI)</span>
          {config.enabled && (
            <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
              Active
            </span>
          )}
        </div>

        <label className="flex items-center gap-2 cursor-pointer select-none">
          <span className="text-[11px] text-gray-400">
            {config.enabled ? 'Enabled' : 'Disabled'}
          </span>
          <input
            type="checkbox"
            data-testid="a2ui-enable-toggle"
            checked={Boolean(config.enabled)}
            onChange={(e) => handleToggleEnabled(e.target.checked)}
            className="w-4 h-4 rounded border-[#30363d] bg-[#0d1117] text-indigo-500 focus:ring-indigo-500 focus:ring-offset-[#161b22] cursor-pointer"
          />
        </label>
      </div>

      {/* Concise Description */}
      <div className="px-3 pb-3 pt-2 bg-[#0d1117] border-t border-[#30363d]">
        <p className="text-[11px] text-gray-400 leading-relaxed">
          Enables this agent to render interactive UI cards, charts, maps, tables, and forms
          directly in chat using the A2UI widget catalog.
        </p>
      </div>
    </div>
  );
};

export default A2UIConfigSection;
