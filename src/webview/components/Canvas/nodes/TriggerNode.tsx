/**
 * TriggerNode Component
 *
 * Custom React Flow Node representing inbound workflow execution entry points.
 * Supports Test Suite Triggers, Webhooks, Scheduled Cron, Manual Triggers, and Chat.
 *
 * Architectural Decisions:
 * 1. Visual trigger kind badges (pink for Test, amber for Webhook, sky for Cron, emerald for Chat).
 * 2. Provides bottom and right connection handles for flexible graph topology routing.
 * 3. Highlights entrypoint status with an active glow animation.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import {
  FlaskConical,
  Radio,
  Clock,
  MessageSquare,
  Zap,
  Sliders,
  Trash2,
  Play,
  ListChecks,
} from 'lucide-react';
import { TriggerNodeData, TriggerKind, TestSuiteScenario } from '../../../../shared/types';

export interface TriggerNodeProps {
  id: string;
  data: TriggerNodeData;
  selected?: boolean;
}

const getTriggerIcon = (kind?: TriggerKind) => {
  switch (kind) {
    case 'test':
      return <FlaskConical className="w-4 h-4 text-pink-400" />;
    case 'webhook':
      return <Radio className="w-4 h-4 text-amber-400" />;
    case 'cron':
      return <Clock className="w-4 h-4 text-sky-400" />;
    case 'chat':
      return <MessageSquare className="w-4 h-4 text-emerald-400" />;
    case 'manual':
      return <Play className="w-4 h-4 text-emerald-400" />;
    default:
      return <Zap className="w-4 h-4 text-amber-400" />;
  }
};

const getTriggerTheme = (kind?: TriggerKind) => {
  switch (kind) {
    case 'test':
      return {
        border: 'border-pink-500/60 hover:border-pink-400 shadow-pink-950/30',
        badge: 'bg-pink-500/20 text-pink-300 border-pink-500/30',
        accent: 'text-pink-400',
        glow: 'shadow-[0_0_16px_rgba(236,72,153,0.15)]',
      };
    case 'webhook':
      return {
        border: 'border-amber-500/60 hover:border-amber-400 shadow-amber-950/30',
        badge: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
        accent: 'text-amber-400',
        glow: 'shadow-[0_0_16px_rgba(245,158,11,0.15)]',
      };
    case 'cron':
      return {
        border: 'border-sky-500/60 hover:border-sky-400 shadow-sky-950/30',
        badge: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
        accent: 'text-sky-400',
        glow: 'shadow-[0_0_16px_rgba(14,165,233,0.15)]',
      };
    case 'chat':
      return {
        border: 'border-emerald-500/60 hover:border-emerald-400 shadow-emerald-950/30',
        badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
        accent: 'text-emerald-400',
        glow: 'shadow-[0_0_16px_rgba(16,185,129,0.15)]',
      };
    default:
      return {
        border: 'border-amber-500/60 hover:border-amber-400 shadow-amber-950/30',
        badge: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
        accent: 'text-amber-400',
        glow: 'shadow-[0_0_16px_rgba(245,158,11,0.15)]',
      };
  }
};

const TriggerNodeComponent: React.FC<TriggerNodeProps> = ({ id, data = {} as TriggerNodeData, selected }) => {
  const kind = data?.triggerKind || 'test';
  const theme = getTriggerTheme(kind);
  const isTest = kind === 'test';
  const scenarios: TestSuiteScenario[] = isTest
    ? data?.testConfig?.testScenarios || (data as any)?.config?.testScenarios || []
    : [];

  return (
    <div
      id={`node-trigger-${id}`}
      className={`group relative ${
        isTest ? 'min-w-[320px] max-w-[360px]' : 'min-w-[256px] max-w-[288px]'
      } rounded-xl backdrop-blur-md bg-[#161b22]/95 border transition-all duration-200 shadow-2xl ${theme.glow} ${
        selected ? 'ring-2 ring-amber-400 border-transparent shadow-amber-500/30 scale-[1.02]' : theme.border
      }`}
    >
      {/* Node Header */}
      <div className="flex items-center justify-between px-4 py-3 rounded-t-xl bg-[#161b22] border-b border-[#30363d]">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-2 rounded-md bg-[#0d1117] border border-[#30363d] shrink-0 shadow-xs">
            {getTriggerIcon(kind)}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold text-xs text-white truncate max-w-[140px]">
                {data.label || 'Trigger'}
              </span>
              <span className={`text-[8px] uppercase tracking-wider px-2 py-0.5 rounded font-mono font-bold border ${theme.badge}`}>
                {kind}
              </span>
            </div>
            <div className="text-[10px] text-gray-400 truncate">
              {data.description || 'Workflow Entrypoint'}
            </div>
          </div>
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-1 shrink-0">
          {data.onEdit && (
            <button
              type="button"
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                data.onEdit?.(id);
              }}
              title="Configure Trigger Properties"
              className="p-1 rounded hover:bg-[#30363d] text-gray-400 hover:text-white transition-colors cursor-pointer"
            >
              <Sliders className="w-3.5 h-3.5" />
            </button>
          )}
          {data.onDelete && (
            <button
              type="button"
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                data.onDelete?.(id);
              }}
              title="Delete Trigger Node"
              className="p-1 rounded hover:bg-rose-500/20 text-gray-400 hover:text-rose-400 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Node Body */}
      <div className="p-3 space-y-2 text-xs text-gray-300">
        {/* Test Scenarios Preview for Test Trigger */}
        {isTest && scenarios.length > 0 && (
          <div className="space-y-2 bg-[#0d1117] p-2 rounded-lg border border-[#30363d]">
            <div className="flex items-center justify-between pb-1 border-b border-[#21262d]">
              <div className="flex items-center gap-1 text-[10px] font-bold text-pink-400 uppercase tracking-wider">
                <ListChecks className="w-3 h-3 text-pink-400" />
                <span>Test Scenarios ({scenarios.length})</span>
              </div>
              <span className="text-[8px] px-2 py-0.5 rounded font-mono font-bold bg-[#161b22] text-pink-300 border border-pink-500/30">
                QA Runner
              </span>
            </div>

            <div className="space-y-1 pt-1">
              {scenarios.slice(0, 2).map((scenario: TestSuiteScenario, idx: number) => (
                <div
                  key={scenario.id || idx}
                  className="p-2 rounded-md bg-[#161b22] border border-[#30363d]/80 text-[10px] space-y-1"
                >
                  <div className="font-semibold text-white truncate">
                    {idx + 1}. {scenario.name}
                  </div>
                  <div className="text-[9px] leading-tight text-gray-300 font-mono bg-[#0d1117] p-1 rounded border border-[#21262d] line-clamp-1">
                    <span className="text-pink-400 font-bold">Query: </span>
                    <span>{scenario.inputQuery}</span>
                  </div>
                </div>
              ))}
              {scenarios.length > 2 && (
                <div className="text-[9px] text-gray-400 text-center">
                  +{scenarios.length - 2} more scenarios
                </div>
              )}
            </div>
          </div>
        )}

        {/* Inbound Connection Status */}
        <div className="bg-[#0d1117] p-2 rounded-lg border border-[#30363d] flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <Play className={`w-3 h-3 ${theme.accent} shrink-0`} />
            <span className="text-[10px] text-gray-400">Entrypoint:</span>
            <span className="text-[10px] text-amber-300 font-bold font-mono truncate">
              Workflow Root
            </span>
          </div>
          <span className="text-[8px] text-gray-400 px-2 py-0.5 rounded bg-[#161b22] border border-[#30363d]">
            Inbound
          </span>
        </div>
      </div>

      {/* Output Handle (Right) */}
      <Handle
        type="source"
        position={Position.Right}
        id="trigger_out_right"
        className={`!w-3.5 !h-3.5 !-right-1.5 border-2 border-[#0d1117] transition-transform hover:scale-125 ${
          isTest ? '!bg-pink-500 ring-2 ring-pink-400/60' : '!bg-amber-400 ring-2 ring-amber-400/40'
        }`}
        title="Trigger Output (Connects to Agent Node)"
      />

      {/* Output Handle (Bottom) */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="trigger_out_bottom"
        className={`!w-3.5 !h-3.5 !-bottom-1.5 border-2 border-[#0d1117] transition-transform hover:scale-125 ${
          isTest ? '!bg-pink-500/80 ring-2 ring-pink-400/40' : '!bg-amber-400 ring-2 ring-amber-400/50'
        }`}
        title="Trigger Output (Bottom)"
      />
    </div>
  );
};

export const TriggerNode = memo(TriggerNodeComponent);
