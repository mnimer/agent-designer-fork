/**
 * TriggerNode - Canvas Component for Workflow Triggers & Test Suites
 * 
 * Purpose:
 * Renders workflow entrypoint triggers including Chat, Pub/Sub, Cloud Scheduler Cron,
 * Eventarc, and Test Suite QA Runners.
 * 
 * Architectural Decisions:
 * - Author: Mike Nimer <mikenimer@google.com>
 * - Dynamic Handle Pruning: When connected to an agent, unused handles are removed from
 *   the DOM so the node can only maintain a single active connection to 1 root agent.
 *   If the connection is deleted, both handles are automatically restored.
 * - Handles: Provides right (horizontal) and bottom (vertical) output handles for flexible routing.
 * - Handles are styled uniformly in blue (!bg-blue-500) per visual guidelines.
 */

import React, { memo } from 'react';
import { Handle, Position, NodeProps, useNodeConnections } from '@xyflow/react';
import { 
  MessageSquare, 
  Radio, 
  Clock, 
  FlaskConical, 
  Sliders, 
  Trash2, 
  Zap, 
  Play,
  CheckCircle2,
  ListChecks,
  Check
} from 'lucide-react';
import { TriggerData, TriggerType, TestPrompt } from '../../../types';
import { DEFAULT_MOCK_TEST_PROMPTS } from '../../../data/triggerDefinitions';

const getTriggerIcon = (type: TriggerType) => {
  switch (type) {
    case 'chat':
      return <MessageSquare className="w-4 h-4 text-emerald-400" />;
    case 'pubsub':
      return <Radio className="w-4 h-4 text-amber-400" />;
    case 'scheduled':
      return <Clock className="w-4 h-4 text-sky-400" />;
    case 'tester':
      return <FlaskConical className="w-4 h-4 text-yellow-400" />;
    case 'eventarc':
      return <Zap className="w-4 h-4 text-purple-400" />;
    default:
      return <Zap className="w-4 h-4 text-amber-400" />;
  }
};

const getTriggerTheme = (type: TriggerType) => {
  switch (type) {
    case 'chat':
      return {
        border: 'border-emerald-500/60 hover:border-emerald-400 shadow-emerald-950/30',
        badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
        accent: 'text-emerald-400',
        glow: 'shadow-[0_0_15px_rgba(16,185,129,0.15)]',
      };
    case 'pubsub':
      return {
        border: 'border-amber-500/60 hover:border-amber-400 shadow-amber-950/30',
        badge: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
        accent: 'text-amber-400',
        glow: 'shadow-[0_0_15px_rgba(245,158,11,0.15)]',
      };
    case 'scheduled':
      return {
        border: 'border-sky-500/60 hover:border-sky-400 shadow-sky-950/30',
        badge: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
        accent: 'text-sky-400',
        glow: 'shadow-[0_0_15px_rgba(14,165,233,0.15)]',
      };
    case 'tester':
      return {
        border: 'border-yellow-500/60 hover:border-yellow-400 shadow-yellow-950/30',
        badge: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
        accent: 'text-yellow-400',
        glow: 'shadow-[0_0_15px_rgba(234,179,8,0.15)]',
      };
    case 'eventarc':
      return {
        border: 'border-purple-500/60 hover:border-purple-400 shadow-purple-950/30',
        badge: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
        accent: 'text-purple-400',
        glow: 'shadow-[0_0_15px_rgba(168,85,247,0.15)]',
      };
    default:
      return {
        border: 'border-amber-500/60 hover:border-amber-400 shadow-amber-950/30',
        badge: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
        accent: 'text-amber-400',
        glow: 'shadow-[0_0_15px_rgba(245,158,11,0.15)]',
      };
  }
};

export const TriggerNode = memo(({ id, data, selected }: NodeProps & { data: TriggerData }) => {
  const theme = getTriggerTheme(data.triggerType);
  const isTester = data.triggerType === 'tester';
  const isEventArc = data.triggerType === 'eventarc';
  const isChat = data.triggerType === 'chat';

  // Track active outgoing connections from this trigger node
  const sourceConnections = useNodeConnections({ handleType: 'source' });
  const isConnected = sourceConnections.length > 0;
  const activeConnection = isConnected ? sourceConnections[0] : null;
  const connectedHandleId = activeConnection?.sourceHandle;

  // If connected via a specific handle, keep only that handle active.
  // If disconnected or if handleId is not explicitly matched, keep both visible and connectable.
  const isRightActive = isConnected && connectedHandleId === 'trigger_out_right';
  const isBottomActive = isConnected && connectedHandleId === 'trigger_out_bottom';

  const showRightHandle = !isConnected || isRightActive || (!isRightActive && !isBottomActive);
  const showBottomHandle = !isConnected || isBottomActive || (!isRightActive && !isBottomActive);

  const testPrompts: TestPrompt[] = isTester
    ? data.config?.testPrompts && data.config.testPrompts.length > 0
      ? data.config.testPrompts
      : DEFAULT_MOCK_TEST_PROMPTS
    : [];

  const getSummary = () => {
    switch (data.triggerType) {
      case 'chat':
        return 'Interactive Chat Session';
      case 'pubsub':
        return data.config?.topic ? `Topic: ${data.config.topic.split('/').pop()}` : 'PubSub Event Queue';
      case 'scheduled':
        return data.config?.cronExpression ? `Cron: ${data.config.cronExpression}` : 'Scheduled Cadence';
      case 'eventarc':
        return data.config?.eventarcEvent 
          ? `${data.config.eventarcCategory?.toUpperCase() || 'EVENT'}: ${data.config.eventarcEvent}` 
          : 'Cloud Event Routing';
      case 'tester':
        return `${testPrompts.length} Test Cases Defined`;
      default:
        return data.description || 'Workflow Trigger';
    }
  };

  const handleCardClick = (e: React.MouseEvent) => {
    // For chat trigger: user requested do nothing
    if (isChat) {
      return;
    }
    // For other triggers, trigger configuration edit
    data.onEdit?.(id);
  };

  return (
    <div
      id={`node-trigger-${id}`}
      onClick={handleCardClick}
      className={`group relative ${
        isTester ? 'min-w-[310px] max-w-[350px]' : isEventArc ? 'min-w-[270px] max-w-[300px]' : 'min-w-[240px] max-w-[270px]'
      } rounded-xl backdrop-blur-md bg-[#161b22]/95 border transition-all duration-200 shadow-2xl ${theme.glow} ${
        selected ? (isTester ? 'ring-2 ring-yellow-400 border-yellow-400 shadow-yellow-500/30 scale-[1.02]' : 'ring-2 ring-amber-400 border-transparent shadow-amber-500/30 scale-[1.02]') : theme.border
      } ${!isChat ? 'cursor-pointer' : 'cursor-default'}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 rounded-t-xl bg-[#161b22] border-b border-[#30363d]">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 rounded-md bg-[#0d1117] border border-[#30363d] shrink-0 shadow-xs">
            {getTriggerIcon(data.triggerType)}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-xs text-white truncate max-w-[130px]">
                {data.label === 'Tester Trigger' ? 'Test Suite' : data.label}
              </span>
              <span className={`text-[8px] uppercase tracking-wider px-1.5 py-0.2 rounded font-mono font-bold border ${theme.badge}`}>
                TRIGGER
              </span>
            </div>
            <div className="text-[10px] text-gray-400 truncate">
              {getSummary()}
            </div>
          </div>
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-1 shrink-0 ml-1">
          {data.onEdit && !isChat && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                data.onEdit?.(id);
              }}
              title="Configure Trigger Properties"
              className="p-1 rounded hover:bg-[#30363d] text-gray-400 hover:text-white transition-colors cursor-pointer"
            >
              <Sliders className="w-3 h-3" />
            </button>
          )}
          {data.onDelete && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                data.onDelete?.(id);
              }}
              title="Delete Trigger Node"
              className="p-1 rounded hover:bg-rose-500/20 text-gray-400 hover:text-rose-400 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="p-2.5 space-y-2 text-xs text-gray-300">
        {/* Test Prompts Section in Middle (for Test Suite Trigger) */}
        {isTester && (
          <div className="space-y-1.5 bg-[#0d1117] p-2 rounded-lg border border-[#30363d]">
            <div className="flex items-center justify-between pb-1 border-b border-[#21262d]">
              <div className="flex items-center gap-1 text-[10px] font-bold text-yellow-400 uppercase tracking-wider">
                <ListChecks className="w-3 h-3 text-yellow-400" />
                <span>Test Prompts ({testPrompts.length})</span>
              </div>
              <span className="text-[9px] px-1.5 py-0.2 rounded font-mono font-bold bg-[#161b22] text-yellow-300 border border-yellow-500/30">
                QA Suite
              </span>
            </div>

            <div className="space-y-1.5 pt-0.5">
              {testPrompts.slice(0, 3).map((tp, idx) => (
                <div
                  key={tp.id || idx}
                  className="p-1.5 rounded-md bg-[#161b22] border border-[#30363d]/80 text-[10px] space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-white truncate max-w-[200px]">
                      {idx + 1}. {tp.name}
                    </span>
                    <span className="text-[8px] font-mono px-1 py-0.2 rounded bg-[#0d1117] text-gray-400 border border-[#30363d]">
                      {tp.assertionType || 'contains'}
                    </span>
                  </div>
                  
                  {/* Prompt Text */}
                  <div className="text-[9.5px] leading-tight text-gray-300 font-mono bg-[#0d1117] p-1 rounded border border-[#21262d] line-clamp-2">
                    <span className="text-yellow-400 font-bold">Prompt: </span>
                    <span>{tp.prompt}</span>
                  </div>

                  {/* Expected Output */}
                  <div className="text-[9.5px] leading-tight text-gray-400 font-mono bg-[#0d1117] p-1 rounded border border-[#21262d] line-clamp-2">
                    <span className="text-emerald-400 font-bold">Expected: </span>
                    <span>{tp.expectedOutput}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Workflow Root Target Link */}
        <div className="bg-[#0d1117] p-2 rounded-lg border border-[#30363d] flex items-center justify-between">
          <div className="flex items-center gap-1.5 min-w-0">
            <Play className={`w-3 h-3 ${theme.accent} shrink-0`} />
            <span className="text-[10px] text-gray-400">Entrypoint:</span>
            <span className="text-[10px] text-amber-300 font-bold font-mono truncate">
              Workflow Root
            </span>
          </div>
          <span className="text-[9px] text-gray-400 px-1 py-0.2 rounded bg-[#161b22] border border-[#30363d]">
            Inbound
          </span>
        </div>
      </div>

      {/* Source Connection Handle (Right) */}
      {showRightHandle && (
        <Handle
          type="source"
          position={Position.Right}
          id="trigger_out_right"
          isConnectable={true}
          className={`!w-3.5 !h-3.5 !-right-1.5 border-2 border-[#0d1117] transition-transform hover:scale-125 z-20 cursor-crosshair ${
            isTester
              ? '!bg-yellow-500 ring-2 ring-yellow-400/50'
              : '!bg-blue-500 ring-2 ring-blue-400/50'
          }`}
          title="Trigger Output (Connects to Root Agent In Handle)"
        />
      )}

      {/* Source Connection Handle (Bottom) - Connects to Root Agent Top Handle */}
      {showBottomHandle && (
        <Handle
          type="source"
          position={Position.Bottom}
          id="trigger_out_bottom"
          isConnectable={true}
          className={`!w-3.5 !h-3.5 !-bottom-1.5 border-2 border-[#0d1117] transition-transform hover:scale-125 z-20 cursor-crosshair ${
            isTester
              ? '!bg-yellow-500 ring-2 ring-yellow-400/50'
              : '!bg-blue-500 ring-2 ring-blue-400/50'
          }`}
          title="Trigger Inbound Output (Connects directly to Root Agent In Handle)"
        />
      )}
    </div>
  );
});

TriggerNode.displayName = 'TriggerNode';

