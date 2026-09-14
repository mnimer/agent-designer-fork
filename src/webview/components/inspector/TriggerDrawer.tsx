/**
 * TriggerDrawer - Property Inspector Drawer for Workflow Triggers & QA Suites
 *
 * Purpose:
 * Slide-out inspector drawer allowing users to inspect and configure parameters for all
 * workflow triggers (Conversational Chat, Pub/Sub, Cloud Scheduler, Eventarc, and Test Suite QA).
 *
 * Architectural Decisions:
 * 1. Author: Mike Nimer <mikenimer@google.com>
 * 2. Visual Alignment: Unified orange/amber styling across all trigger types to match canvas nodes and palette cards.
 * 3. Reactive State Updates: Form changes notify parent container via onUpdateTrigger callback on every edit.
 * 4. Root Reconnection: Direct actions to associate the trigger with the primary workflow root agent.
 */

import React, { useState, useEffect } from 'react';
import { 
  X, 
  Zap, 
  MessageSquare, 
  Radio, 
  Clock, 
  FlaskConical, 
  Bot, 
  Save, 
  Trash2, 
  Check, 
  Play, 
  Plus, 
  ListChecks, 
  CheckCircle2, 
  RotateCcw,
  Sparkles,
  Sliders,
  Layers,
  Info,
  Calendar,
  Clock3,
  Webhook
} from 'lucide-react';
import { TriggerData, TriggerType, AgentData, TestPrompt, EventArcCategory } from '../../types';
import { 
  DEFAULT_MOCK_TEST_PROMPTS, 
  EVENTARC_CATEGORIES, 
  PUBSUB_TOPIC_PRESETS,
  GCP_PROJECT_SERVICE_ACCOUNTS
} from '../../data/triggerDefinitions';
import { useWebviewBridge } from '../../hooks/useWebviewBridge';

interface TriggerDrawerProps {
  trigger: TriggerData | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateTrigger: (updatedTrigger: Partial<TriggerData>) => void;
  onDeleteTrigger?: (triggerId: string) => void;
  agents?: AgentData[];
  availableAgents?: AgentData[];
  onSetRootAgent?: (agentId: string) => void;
  onReconnectToRoot?: (rootAgentId: string) => void;
}

/**
 * Resolves trigger icon component.
 * NOTE: All triggers use uniform orange styling (text-orange-400).
 */
const getTriggerIcon = (type: TriggerType) => {
  switch (type) {
    case 'chat':
      return <MessageSquare className="w-4 h-4 text-orange-400" />;
    case 'pubsub':
      return <Radio className="w-4 h-4 text-orange-400" />;
    case 'scheduled':
      return <Clock className="w-4 h-4 text-orange-400" />;
    case 'tester':
      return <FlaskConical className="w-4 h-4 text-orange-400" />;
    case 'eventarc':
      return <Zap className="w-4 h-4 text-orange-400" />;
    case 'webhook':
      return <Webhook className="w-4 h-4 text-orange-400" />;
    default:
      return <Zap className="w-4 h-4 text-orange-400" />;
  }
};

const CRON_PRESETS = [
  { label: 'Weekdays @ 9AM', cron: '0 9 * * 1-5', desc: 'Monday through Friday at 09:00' },
  { label: 'Daily @ 9AM', cron: '0 9 * * *', desc: 'Every day at 09:00' },
  { label: 'Hourly', cron: '0 * * * *', desc: 'At minute 0 of every hour' },
  { label: 'Every 15m', cron: '*/15 * * * *', desc: 'Every 15 minutes' },
  { label: 'Every 30m', cron: '*/30 * * * *', desc: 'Every 30 minutes' },
  { label: 'Weekly (Sun @ 8AM)', cron: '0 8 * * 0', desc: 'Every Sunday morning at 08:00' },
  { label: 'Monthly (1st @ Midnight)', cron: '0 0 1 * *', desc: 'On day 1 of every month' },
];

export const TriggerDrawer: React.FC<TriggerDrawerProps> = ({
  trigger,
  isOpen,
  onClose,
  onUpdateTrigger,
  onDeleteTrigger,
  agents = [],
  availableAgents,
  onSetRootAgent,
  onReconnectToRoot,
}) => {
  const activeAgentList = (availableAgents && availableAgents.length > 0) ? availableAgents : (agents || []);
  const bridge = useWebviewBridge();
  const [formData, setFormData] = useState<TriggerData | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [isCustomTopic, setIsCustomTopic] = useState(false);
  const [customTopicInput, setCustomTopicInput] = useState('');
  const [eventarcCategories, setEventarcCategories] = useState<EventArcCategory[]>(EVENTARC_CATEGORIES);
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);
  const [categoriesSource, setCategoriesSource] = useState<'static' | 'gcloud'>('static');

  const fetchEventarcCategories = async (region?: string, forceRefresh: boolean = false) => {
    setIsLoadingCategories(true);
    try {
      const targetRegion = region || formData?.config?.eventarcRegion || 'us-central1';
      const response = await bridge.sendRequestWithReply<
        { type: 'FETCH_EVENTARC_PROVIDERS'; payload?: { location?: string; forceRefresh?: boolean } },
        { type: 'EVENTARC_PROVIDERS_RESPONSE'; payload: { categories: EventArcCategory[]; source: 'gcloud' | 'fallback'; location: string; error?: string } }
      >(
        {
          type: 'FETCH_EVENTARC_PROVIDERS',
          payload: { location: targetRegion, forceRefresh },
        },
        'EVENTARC_PROVIDERS_RESPONSE',
        10000
      );

      const replyPayload = (response as any)?.categories ? (response as any) : (response as any)?.payload;
      if (replyPayload?.categories && Array.isArray(replyPayload.categories) && replyPayload.categories.length > 0) {
        setEventarcCategories(replyPayload.categories);
        setCategoriesSource(replyPayload.source === 'gcloud' ? 'gcloud' : 'static');
      }
    } catch {
      // Keep static fallback gracefully
    } finally {
      setIsLoadingCategories(false);
    }
  };

  useEffect(() => {
    if (trigger) {
      const rawType =
        trigger.triggerType ||
        ((trigger as any).triggerKind === 'test' ? 'tester' : (trigger as any).triggerKind) ||
        (trigger as any).type ||
        'eventarc';
      const effectiveType: TriggerType =
        rawType === 'test' ? 'tester' : (rawType as TriggerType);

      const config = { ...(trigger.config || {}) };
      // Defaults for EventArc if empty
      if (effectiveType === 'eventarc') {
        if (!config.eventarcCategory) config.eventarcCategory = 'bigquery';
        if (!config.eventarcEvent) config.eventarcEvent = 'TableCreate';
        if (!config.eventarcServiceName) config.eventarcServiceName = 'bigquery.googleapis.com';
        if (!config.eventarcServiceAccount) config.eventarcServiceAccount = GCP_PROJECT_SERVICE_ACCOUNTS[0].email;
        if (!config.eventarcRegion) config.eventarcRegion = 'us-central1';
        // Trigger live gcloud discovery
        fetchEventarcCategories(config.eventarcRegion, false);
      }
      // Defaults for Webhook if empty
      if (effectiveType === 'webhook') {
        if (!config.webhookPath) config.webhookPath = '/webhook';
        if (!config.httpMethod) config.httpMethod = 'POST';
        if (!config.authType) config.authType = 'bearer_token';
        if (!config.secretHeaderName) config.secretHeaderName = 'X-Webhook-Secret';
        if (!config.payloadDescription) config.payloadDescription = 'JSON object containing request parameters and payload';
      }
      // Defaults for Scheduled if empty
      if (effectiveType === 'scheduled') {
        if (!config.cronExpression) config.cronExpression = '0 9 * * 1-5';
        if (!config.timezone) config.timezone = 'America/New_York';
        if (!config.scheduledPrompt) config.scheduledPrompt = 'Execute scheduled batch processing and workflow execution.';
      }
      // Check if PubSub topic is in preset list
      if (effectiveType === 'pubsub' && config.topic) {
        const matchingPreset = PUBSUB_TOPIC_PRESETS.some((p) => p.topic === config.topic);
        if (!matchingPreset) {
          setIsCustomTopic(true);
          setCustomTopicInput(config.topic);
        } else {
          setIsCustomTopic(false);
        }
      }
      setFormData({ ...trigger, triggerType: effectiveType, config });
    }
  }, [trigger, isOpen]);

  if (!isOpen || !formData) return null;

  const handleConfigChange = (partial: Record<string, any>) => {
    setFormData((prev) => {
      if (!prev) return null;
      const next = {
        ...prev,
        config: {
          ...(prev.config || {}),
          ...partial,
        },
      };
      onUpdateTrigger(next);
      return next;
    });
  };

  const handleSave = () => {
    if (!formData) return;
    onUpdateTrigger(formData);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 500);
  };

  const rootAgent = activeAgentList.find((a) => a.isStartNode) || activeAgentList[0];

  // EventArc category and events selection helper from dynamic or fallback catalog
  const currentCategory = eventarcCategories.find(
    (c) => c.id === (formData.config?.eventarcCategory || 'bigquery') || c.serviceName === formData.config?.eventarcServiceName
  ) || eventarcCategories[0] || EVENTARC_CATEGORIES[0];

  return (
    <div className="fixed inset-y-0 right-0 w-[420px] bg-[#161b22] border-l border-[#30363d] shadow-2xl z-50 flex flex-col font-sans animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="px-5 py-4 bg-[#0d1117] border-b border-[#30363d] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-[#161b22] border border-[#30363d] rounded-lg">
            {getTriggerIcon(formData.triggerType || 'eventarc')}
          </div>
          <div>
            <h3 className="font-bold text-sm text-white flex items-center gap-2">
              <span>{formData.label || 'Trigger Config'}</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-[#21262d] text-gray-300 border border-[#30363d]">
                {(formData.triggerType || 'trigger').toUpperCase()}
              </span>
            </h3>
            <p className="text-[11px] text-gray-400">Configure entrypoint invocation rules and payload handlers</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 text-gray-400 hover:text-white hover:bg-[#21262d] rounded-lg transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 p-4 space-y-4 overflow-y-auto text-xs text-gray-300">
        {/* Basic Trigger Info */}
        <div className="space-y-3 bg-[#0d1117] p-3 rounded-lg border border-[#30363d]">
          <div className="space-y-1">
            <label className="text-[11px] font-bold uppercase tracking-tight text-gray-400">
              Trigger Label
            </label>
            <input
              type="text"
              value={formData.label}
              onChange={(e) => {
                const next = { ...formData, label: e.target.value };
                setFormData(next);
                onUpdateTrigger(next);
              }}
              className="w-full px-3 py-1.5 bg-[#161b22] border border-[#30363d] focus:border-amber-500 rounded-lg text-xs text-white focus:outline-none"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-bold uppercase tracking-tight text-gray-400">
              Description
            </label>
            <input
              type="text"
              value={formData.description || ''}
              onChange={(e) => {
                const next = { ...formData, description: e.target.value };
                setFormData(next);
                onUpdateTrigger(next);
              }}
              className="w-full px-3 py-1.5 bg-[#161b22] border border-[#30363d] focus:border-amber-500 rounded-lg text-xs text-gray-300 focus:outline-none"
            />
          </div>
        </div>

        {/* ================= TYPE SPECIFIC CONFIGURATIONS ================= */}

        {/* 1. CHAT TRIGGER (Informational - Do Nothing / Standard Interactive) */}
        {formData.triggerType === 'chat' && (
          <div className="space-y-3 bg-[#0d1117] p-3 rounded-lg border border-amber-500/30">
            <div className="flex items-center gap-1.5 text-amber-400 font-bold text-xs">
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Chat Trigger Properties</span>
            </div>

            <div className="p-2.5 bg-[#161b22] rounded-lg border border-[#30363d] text-[11px] text-gray-300 space-y-1.5">
              <div className="flex items-center gap-1.5 text-amber-400 font-semibold">
                <Info className="w-3.5 h-3.5" />
                <span>Standard Interactive Chat Interface</span>
              </div>
              <p className="text-gray-400 leading-relaxed">
                The Chat trigger provisions a conversational frontend session directly attached to the root agent. No additional infrastructure parameters are required.
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-gray-400">
                Initial Welcome Message
              </label>
              <textarea
                rows={2}
                value={formData.config.initialMessage || ''}
                onChange={(e) => handleConfigChange({ initialMessage: e.target.value })}
                placeholder="Hello! I am your AI agent assistant. How can I help you today?"
                className="w-full px-2.5 py-1.5 bg-[#161b22] border border-[#30363d] focus:border-amber-400 rounded text-xs text-gray-200 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-gray-300 font-medium">Real-time Token Streaming</span>
              <input
                type="checkbox"
                checked={formData.config.streaming ?? true}
                onChange={(e) => handleConfigChange({ streaming: e.target.checked })}
                className="rounded bg-[#161b22] border-[#30363d] text-amber-500 focus:ring-0 cursor-pointer"
              />
            </div>
          </div>
        )}

        {/* 2. PUBSUB INVOCATION TRIGGER */}
        {formData.triggerType === 'pubsub' && (
          <div className="space-y-3 bg-[#0d1117] p-3 rounded-lg border border-amber-500/30">
            <div className="flex items-center gap-1.5 text-amber-400 font-bold text-xs">
              <Radio className="w-3.5 h-3.5" />
              <span>PubSub Invocation Configuration</span>
            </div>

            {/* Topic Drop Down */}
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold text-gray-400 flex items-center justify-between">
                <span>Select PubSub Topic</span>
                <span className="text-[9px] text-amber-400/80 font-mono">Google Cloud Pub/Sub</span>
              </label>
              
              <select
                value={isCustomTopic ? '__custom__' : (formData.config.topic || PUBSUB_TOPIC_PRESETS[0].topic)}
                onChange={(e) => {
                  if (e.target.value === '__custom__') {
                    setIsCustomTopic(true);
                    if (customTopicInput) {
                      handleConfigChange({ topic: customTopicInput });
                    }
                  } else {
                    setIsCustomTopic(false);
                    handleConfigChange({ 
                      topic: e.target.value,
                      subscription: `${e.target.value.split('/').pop()}-sub-auto`
                    });
                  }
                }}
                className="w-full px-2.5 py-1.5 bg-[#161b22] border border-[#30363d] focus:border-amber-400 rounded text-xs text-white focus:outline-none cursor-pointer"
              >
                {PUBSUB_TOPIC_PRESETS.map((preset) => (
                  <option key={preset.topic} value={preset.topic}>
                    {preset.label}
                  </option>
                ))}
                <option value="__custom__">➕ Custom Topic Path...</option>
              </select>

              {isCustomTopic && (
                <div className="pt-1">
                  <input
                    type="text"
                    value={formData.config.topic || customTopicInput}
                    onChange={(e) => {
                      setCustomTopicInput(e.target.value);
                      handleConfigChange({ 
                        topic: e.target.value,
                        subscription: `${e.target.value.split('/').pop() || 'agent'}-sub-auto`
                      });
                    }}
                    placeholder="projects/my-gcp-project/topics/custom-agent-topic"
                    className="w-full px-2.5 py-1.5 bg-[#161b22] border border-amber-500/50 focus:border-amber-400 rounded text-[11px] font-mono text-amber-300 focus:outline-none"
                  />
                </div>
              )}
            </div>

            {/* Auto Subscription Registration Note */}
            <div className="p-2.5 rounded-lg bg-amber-950/30 border border-amber-500/40 text-[11px] space-y-1">
              <div className="flex items-center gap-1.5 text-amber-300 font-semibold">
                <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>Automatic Subscription Provisioning</span>
              </div>
              <p className="text-amber-200/80 leading-relaxed text-[10.5px]">
                Will auto register a subscription that invokes the agent on deployment.
              </p>
              <div className="pt-1 font-mono text-[10px] text-gray-300 flex items-center gap-1">
                <span className="text-gray-400">Subscription:</span>
                <span className="text-amber-300 font-bold truncate">
                  {formData.config.subscription || `${(formData.config.topic || 'agent-tasks').split('/').pop()}-sub-auto`}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-gray-400">
                  Message Format
                </label>
                <select
                  value={formData.config.messageFormat || 'json'}
                  onChange={(e) => handleConfigChange({ messageFormat: e.target.value })}
                  className="w-full px-2 py-1 bg-[#161b22] border border-[#30363d] rounded text-xs text-gray-200 focus:outline-none"
                >
                  <option value="json">JSON</option>
                  <option value="protobuf">Protobuf</option>
                  <option value="text">Plain Text</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-gray-400">
                  Ack Deadline (s)
                </label>
                <input
                  type="number"
                  value={formData.config.ackDeadlineSeconds || 60}
                  onChange={(e) => handleConfigChange({ ackDeadlineSeconds: parseInt(e.target.value) || 60 })}
                  className="w-full px-2 py-1 bg-[#161b22] border border-[#30363d] rounded text-xs text-gray-200 focus:outline-none"
                />
              </div>
            </div>
          </div>
        )}

        {/* 3. SCHEDULED TRIGGER (Time / Cron Config) */}
        {formData.triggerType === 'scheduled' && (
          <div className="space-y-3 bg-[#0d1117] p-3 rounded-lg border border-sky-500/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-sky-400 font-bold text-xs">
                <Clock className="w-3.5 h-3.5" />
                <span>Schedule & Cron Configuration</span>
              </div>
              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30">
                Cloud Scheduler
              </span>
            </div>

            {/* Preset Schedule Dropdown / Quick Pick */}
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold text-gray-400 flex items-center gap-1">
                <Calendar className="w-3 h-3 text-sky-400" />
                <span>Time / Cadence Presets</span>
              </label>
              
              <div className="grid grid-cols-2 gap-1.5">
                {CRON_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      handleConfigChange({ 
                        cronExpression: preset.cron,
                        scheduleInterval: preset.label 
                      });
                    }}
                    className={`p-1.5 rounded text-left border transition-all cursor-pointer ${
                      formData.config.cronExpression === preset.cron
                        ? 'bg-sky-500/20 border-sky-400 text-white shadow-xs'
                        : 'bg-[#161b22] hover:bg-[#21262d] border-[#30363d] text-gray-300 hover:text-white'
                    }`}
                  >
                    <div className="font-semibold text-[10.5px] truncate">{preset.label}</div>
                    <div className="font-mono text-[9px] text-sky-400/90 truncate">{preset.cron}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Cron Expression Input */}
            <div className="space-y-1 pt-1">
              <label className="text-[10px] uppercase font-bold text-gray-400 flex items-center justify-between">
                <span>Cron Expression</span>
                <span className="text-[9px] font-mono text-gray-400">min hour day month weekday</span>
              </label>
              <input
                type="text"
                value={formData.config.cronExpression || '0 9 * * 1-5'}
                onChange={(e) => handleConfigChange({ cronExpression: e.target.value })}
                placeholder="0 9 * * 1-5"
                className="w-full px-2.5 py-1.5 bg-[#161b22] border border-[#30363d] focus:border-sky-400 rounded text-xs font-mono text-sky-300 focus:outline-none"
              />
            </div>

            {/* Timezone */}
            <div className="space-y-1 pt-1">
              <label className="text-[10px] uppercase font-bold text-gray-400 flex items-center gap-1">
                <Clock3 className="w-3 h-3 text-sky-400" />
                <span>Timezone</span>
              </label>
              <select
                value={formData.config.timezone || 'America/New_York'}
                onChange={(e) => handleConfigChange({ timezone: e.target.value })}
                className="w-full px-2.5 py-1.5 bg-[#161b22] border border-[#30363d] focus:border-sky-400 rounded text-xs text-gray-200 focus:outline-none cursor-pointer"
              >
                <option value="America/New_York">America/New_York (EST / EDT)</option>
                <option value="America/Chicago">America/Chicago (CST / CDT)</option>
                <option value="America/Denver">America/Denver (MST / MDT)</option>
                <option value="America/Los_Angeles">America/Los_Angeles (PST / PDT)</option>
                <option value="UTC">UTC (Coordinated Universal Time)</option>
                <option value="Europe/London">Europe/London (GMT / BST)</option>
                <option value="Europe/Frankfurt">Europe/Frankfurt (CET / CEST)</option>
                <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
                <option value="Asia/Singapore">Asia/Singapore (SGT)</option>
              </select>
            </div>

            {/* Scheduled Prompt / Input Payload */}
            <div className="space-y-1 pt-1">
              <label className="text-[10px] uppercase font-bold text-gray-400 flex items-center justify-between">
                <span>Scheduled Prompt / Turn Input</span>
                <span className="text-[9px] text-sky-400 font-sans">Sent on schedule tick</span>
              </label>
              <textarea
                rows={2}
                value={formData.config.scheduledPrompt || ''}
                onChange={(e) => handleConfigChange({ scheduledPrompt: e.target.value })}
                placeholder="e.g. Execute scheduled batch compliance audit on pending transaction records"
                className="w-full px-2.5 py-1.5 bg-[#161b22] border border-[#30363d] focus:border-sky-400 rounded text-xs text-white focus:outline-none resize-none font-sans"
              />
            </div>

            {/* Retry Count */}
            <div className="space-y-1 pt-1">
              <label className="text-[10px] uppercase font-bold text-gray-400 flex items-center justify-between">
                <span>Retry Count</span>
                <span className="text-[9px] font-mono text-gray-500">Max execution retries</span>
              </label>
              <input
                type="number"
                min={0}
                max={10}
                value={formData.config.retryCount ?? 3}
                onChange={(e) => handleConfigChange({ retryCount: parseInt(e.target.value, 10) || 0 })}
                className="w-full px-2.5 py-1.5 bg-[#161b22] border border-[#30363d] focus:border-sky-400 rounded text-xs font-mono text-white focus:outline-none"
              />
            </div>
          </div>
        )}

        {/* 4. WEBHOOK TRIGGER (HTTP Endpoint & Auth Config) */}
        {formData.triggerType === 'webhook' && (
          <div className="space-y-3 bg-[#0d1117] p-3 rounded-lg border border-amber-500/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-amber-400 font-bold text-xs">
                <Webhook className="w-3.5 h-3.5" />
                <span>Webhook Trigger Configuration</span>
              </div>
              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                HTTP REST / Webhook
              </span>
            </div>

            <p className="text-[11px] text-gray-400 leading-relaxed">
              Exposes an HTTP webhook endpoint to invoke the Root Agent on incoming POST/PUT JSON events from external systems.
            </p>

            {/* Endpoint Route / Path */}
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-gray-400 flex items-center justify-between">
                <span>Webhook Path</span>
                <span className="text-[9px] font-mono text-gray-500">Relative URL route</span>
              </label>
              <input
                type="text"
                value={formData.config.webhookPath || '/webhook'}
                onChange={(e) => handleConfigChange({ webhookPath: e.target.value })}
                placeholder="/webhook"
                className="w-full px-2.5 py-1.5 bg-[#161b22] border border-[#30363d] focus:border-amber-400 rounded text-xs font-mono text-amber-300 focus:outline-none"
              />
            </div>

            {/* HTTP Method */}
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-gray-400">
                HTTP Method
              </label>
              <select
                value={formData.config.httpMethod || 'POST'}
                onChange={(e) => handleConfigChange({ httpMethod: e.target.value as any })}
                className="w-full px-2.5 py-1.5 bg-[#161b22] border border-[#30363d] focus:border-amber-400 rounded text-xs text-white focus:outline-none cursor-pointer font-mono"
              >
                <option value="POST">POST (Standard Webhook Payload)</option>
                <option value="PUT">PUT (Resource Update Webhook)</option>
                <option value="GET">GET (Query String Trigger)</option>
              </select>
            </div>

            {/* Authentication Mechanism */}
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-gray-400">
                Authentication Mode
              </label>
              <select
                value={formData.config.authType || 'bearer_token'}
                onChange={(e) => handleConfigChange({ authType: e.target.value as any })}
                className="w-full px-2.5 py-1.5 bg-[#161b22] border border-[#30363d] focus:border-amber-400 rounded text-xs text-white focus:outline-none cursor-pointer font-mono"
              >
                <option value="bearer_token">Bearer Token (Authorization: Bearer &lt;token&gt;)</option>
                <option value="api_key">Custom Secret Header (API Key)</option>
                <option value="hmac_sha256">HMAC SHA-256 Signature Verification</option>
                <option value="none">None (Public Unauthenticated)</option>
              </select>
            </div>

            {/* Secret Header Name (shown if auth is not none) */}
            {formData.config.authType && formData.config.authType !== 'none' && (
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-gray-400 flex items-center justify-between">
                  <span>Secret / Signature Header</span>
                  <span className="text-[9px] font-mono text-gray-500">Header name</span>
                </label>
                <input
                  type="text"
                  value={
                    formData.config.secretHeaderName ||
                    (formData.config.authType === 'bearer_token'
                      ? 'Authorization'
                      : formData.config.authType === 'hmac_sha256'
                      ? 'X-Hub-Signature-256'
                      : 'X-Webhook-Secret')
                  }
                  onChange={(e) => handleConfigChange({ secretHeaderName: e.target.value })}
                  placeholder="X-Webhook-Secret"
                  className="w-full px-2.5 py-1.5 bg-[#161b22] border border-[#30363d] focus:border-amber-400 rounded text-xs font-mono text-amber-300 focus:outline-none"
                />
              </div>
            )}

            {/* Expected Payload Description */}
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-gray-400 flex items-center justify-between">
                <span>Expected Payload Description</span>
                <span className="text-[9px] text-gray-500 font-sans">For agent reasoning context</span>
              </label>
              <textarea
                rows={2}
                value={formData.config.payloadDescription || ''}
                onChange={(e) => handleConfigChange({ payloadDescription: e.target.value })}
                placeholder="e.g. JSON object containing { event: 'invoice_created', invoice_id: '123', amount: 500 }"
                className="w-full px-2.5 py-1.5 bg-[#161b22] border border-[#30363d] focus:border-amber-400 rounded text-xs text-white focus:outline-none resize-none font-sans"
              />
            </div>

            {/* Integration Tip */}
            <div className="p-2 bg-[#161b22] rounded border border-[#30363d] text-[10.5px] text-gray-400 space-y-1">
              <div className="text-amber-300 font-semibold flex items-center gap-1">
                <Info className="w-3 h-3" />
                <span>ADK Integration Pattern</span>
              </div>
              <p className="text-[9.5px] leading-normal text-gray-400">
                The generated FastAPI server / Reasoning Engine adapter exposes this route and automatically translates the incoming JSON body into user turns for the Root Agent.
              </p>
            </div>
          </div>
        )}

        {/* 4. EVENTARC TRIGGER (Category Dropdown + Event Dropdown) */}
        {formData.triggerType === 'eventarc' && (
          <div className="space-y-3 bg-[#0d1117] p-3 rounded-lg border border-purple-500/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-purple-400 font-bold text-xs">
                <Zap className="w-3.5 h-3.5" />
                <span>EventArc Trigger Configuration</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${
                  categoriesSource === 'gcloud'
                    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                    : 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                }`}>
                  {categoriesSource === 'gcloud' ? '● Live GCP' : 'Offline Catalog'}
                </span>
                <button
                  type="button"
                  title="Refresh providers via gcloud"
                  disabled={isLoadingCategories}
                  onClick={() => fetchEventarcCategories(formData.config.eventarcRegion || 'us-central1', true)}
                  className="p-1 rounded bg-[#161b22] hover:bg-[#21262d] text-gray-400 hover:text-purple-300 border border-[#30363d] cursor-pointer disabled:opacity-50"
                >
                  <RotateCcw className={`w-3 h-3 ${isLoadingCategories ? 'animate-spin text-purple-400' : ''}`} />
                </button>
              </div>
            </div>

            <p className="text-[11px] text-gray-400 leading-relaxed">
              Triggers the root agent upon receiving CloudEvents routed from Google Cloud services and Audit Logs.
            </p>

            {/* Dropdown 1: Category Selection */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[10px] uppercase font-bold text-purple-300">
                  1. Select Service / Provider
                </label>
                <span className="text-[9px] text-gray-500 font-mono">
                  {eventarcCategories.length} providers
                </span>
              </div>
              <select
                value={formData.config.eventarcCategory || 'bigquery'}
                onChange={(e) => {
                  const newCategory = eventarcCategories.find((c) => c.id === e.target.value) || eventarcCategories[0];
                  if (newCategory) {
                    handleConfigChange({
                      eventarcCategory: newCategory.id,
                      eventarcServiceName: newCategory.serviceName,
                      eventarcEvent: newCategory.events[0]?.id || '',
                    });
                  }
                }}
                className="w-full px-2.5 py-1.5 bg-[#161b22] border border-[#30363d] focus:border-purple-400 rounded text-xs text-white focus:outline-none cursor-pointer"
              >
                {eventarcCategories.map((cat) => (
                  <option key={cat.id || cat.serviceName} value={cat.id}>
                    {cat.name} ({cat.serviceName})
                  </option>
                ))}
              </select>
            </div>

            {/* Dropdown 2: Event Selection for selected category */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[10px] uppercase font-bold text-purple-300">
                  2. Select Event
                </label>
                <span className="text-[9px] text-gray-500 font-mono">
                  {currentCategory?.events?.length || 0} events
                </span>
              </div>
              <select
                value={formData.config.eventarcEvent || currentCategory?.events?.[0]?.id || ''}
                onChange={(e) => handleConfigChange({ eventarcEvent: e.target.value })}
                className="w-full px-2.5 py-1.5 bg-[#161b22] border border-[#30363d] focus:border-purple-400 rounded text-xs text-white focus:outline-none cursor-pointer font-mono"
              >
                {currentCategory?.events?.map((ev) => (
                  <option key={ev.id || ev.fullEvent} value={ev.id}>
                    {ev.name}
                  </option>
                ))}
              </select>

              {/* Event Description */}
              {(() => {
                const selectedEv = currentCategory?.events?.find(
                  (ev) => ev.id === (formData.config.eventarcEvent || currentCategory?.events?.[0]?.id)
                );
                return selectedEv ? (
                  <div className="p-2 bg-[#161b22] rounded border border-[#30363d] text-[10px] text-gray-300 font-mono mt-1 space-y-0.5">
                    <div className="text-purple-300 font-semibold truncate">{selectedEv.fullEvent}</div>
                    <div className="text-gray-400 text-[9.5px] font-sans">{selectedEv.description}</div>
                  </div>
                ) : null;
              })()}
            </div>

            {/* Invoker Service Account Dropdown */}
            <div className="space-y-1 pt-1">
              <label className="text-[10px] uppercase font-bold text-gray-400">
                Invoker Service Account
              </label>
              <select
                value={formData.config.eventarcServiceAccount || GCP_PROJECT_SERVICE_ACCOUNTS[0].email}
                onChange={(e) => handleConfigChange({ eventarcServiceAccount: e.target.value })}
                className="w-full px-2.5 py-1.5 bg-[#161b22] border border-[#30363d] focus:border-purple-400 rounded text-xs text-white focus:outline-none cursor-pointer font-mono"
              >
                {GCP_PROJECT_SERVICE_ACCOUNTS.map((sa) => (
                  <option key={sa.email} value={sa.email}>
                    {sa.name} ({sa.email.split('@')[0]})
                  </option>
                ))}
              </select>

              {/* Service Account Details & IAM Roles Badge */}
              {(() => {
                const selectedSA = GCP_PROJECT_SERVICE_ACCOUNTS.find(
                  (sa) => sa.email === (formData.config.eventarcServiceAccount || GCP_PROJECT_SERVICE_ACCOUNTS[0].email)
                );
                return selectedSA ? (
                  <div className="p-2 bg-[#161b22] rounded border border-[#30363d] text-[10px] text-gray-300 font-mono mt-1 space-y-1">
                    <div className="text-purple-300 font-semibold truncate text-[9.5px]">
                      {selectedSA.email}
                    </div>
                    <div className="text-gray-400 text-[9px] font-sans flex items-center gap-1">
                      <span className="text-gray-400">IAM Roles:</span>
                      <span className="text-purple-300/90 font-mono text-[8.5px] bg-[#0d1117] px-1.5 py-0.5 rounded border border-[#30363d]">
                        {selectedSA.roles}
                      </span>
                    </div>
                  </div>
                ) : null;
              })()}

              {/* Eventarc Region Selection */}
              <div className="space-y-1 pt-1">
                <label className="text-[10px] uppercase font-bold text-gray-400">
                  Eventarc Region
                </label>
                <select
                  value={formData.config.eventarcRegion || 'us-central1'}
                  onChange={(e) => {
                    const newRegion = e.target.value;
                    handleConfigChange({ eventarcRegion: newRegion });
                    fetchEventarcCategories(newRegion, false);
                  }}
                  className="w-full px-2.5 py-1.5 bg-[#161b22] border border-[#30363d] focus:border-purple-400 rounded text-xs text-white focus:outline-none cursor-pointer font-mono"
                >
                  <option value="us-central1">us-central1 (Iowa)</option>
                  <option value="us-west1">us-west1 (Oregon)</option>
                  <option value="europe-west1">europe-west1 (Belgium)</option>
                  <option value="asia-northeast1">asia-northeast1 (Tokyo)</option>
                  <option value="global">global (Multi-region)</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* 5. TESTER TRIGGER (Test Suite & Add More Tests) */}
        {formData.triggerType === 'tester' && (
          <div className="space-y-3 bg-[#0d1117] p-3 rounded-lg border border-yellow-500/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-yellow-400 font-bold text-xs">
                <FlaskConical className="w-3.5 h-3.5" />
                <span>Test Prompts & Mock Cases</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  handleConfigChange({
                    testPrompts: DEFAULT_MOCK_TEST_PROMPTS,
                  });
                }}
                className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-white hover:underline cursor-pointer"
                title="Reset test prompts to default mocks"
              >
                <RotateCcw className="w-2.5 h-2.5" />
                <span>Reset Mocks</span>
              </button>
            </div>

            {/* Test Prompts List */}
            <div className="space-y-2.5">
              {(() => {
                const rawPrompts = (formData.config.testPrompts && formData.config.testPrompts.length > 0)
                  ? formData.config.testPrompts
                  : ((formData.config as any).testScenarios && (formData.config as any).testScenarios.length > 0)
                  ? (formData.config as any).testScenarios
                  : DEFAULT_MOCK_TEST_PROMPTS;

                const currentPrompts: TestPrompt[] = rawPrompts.map((tc: any, i: number) => ({
                  id: tc.id || `test_prompt_${i + 1}`,
                  name: tc.name || `Test Case #${i + 1}`,
                  prompt: tc.prompt || tc.inputQuery || '',
                  expectedOutput: tc.expectedOutput || tc.expectedOutputPattern || '',
                  assertionType: tc.assertionType || 'contains',
                }));

                const updateTestCase = (idx: number, partialTest: Partial<TestPrompt>) => {
                  const updated = currentPrompts.map((tc, i) =>
                    i === idx ? { ...tc, ...partialTest } : tc
                  );
                  handleConfigChange({ testPrompts: updated, testScenarios: updated });
                };

                const removeTestCase = (idx: number) => {
                  const updated = currentPrompts.filter((_, i) => i !== idx);
                  handleConfigChange({ testPrompts: updated, testScenarios: updated });
                };

                return currentPrompts.map((testCase, idx) => {
                  return (
                    <div
                      key={testCase.id || idx}
                      className="p-2.5 rounded-lg bg-[#161b22] border border-[#30363d] space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <input
                          type="text"
                          value={testCase.name}
                          onChange={(e) => updateTestCase(idx, { name: e.target.value })}
                          placeholder="Test Name"
                          className="font-bold text-xs text-white bg-transparent border-b border-transparent hover:border-[#30363d] focus:border-yellow-500 focus:outline-none w-[180px]"
                        />
                        <div className="flex items-center gap-1">
                          <select
                            value={testCase.assertionType || 'contains'}
                            onChange={(e) => updateTestCase(idx, { assertionType: e.target.value as any })}
                            className="px-1.5 py-0.5 bg-[#0d1117] border border-[#30363d] rounded text-[9px] text-yellow-300 font-mono focus:outline-none cursor-pointer"
                          >
                            <option value="contains">contains</option>
                            <option value="exact">exact match</option>
                            <option value="json_schema">json schema</option>
                            <option value="llm_eval">llm eval</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => removeTestCase(idx)}
                            className="p-0.5 text-gray-400 hover:text-rose-400 rounded hover:bg-rose-950/40 cursor-pointer"
                            title="Remove test case"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[9px] uppercase font-bold text-yellow-400">
                          Test Prompt
                        </label>
                        <textarea
                          rows={2}
                          value={testCase.prompt || (testCase as any).inputQuery || ''}
                          onChange={(e) => updateTestCase(idx, { prompt: e.target.value })}
                          placeholder="Prompt to send to agent pipeline..."
                          className="w-full px-2 py-1 bg-[#0d1117] border border-[#30363d] focus:border-yellow-400 rounded text-[10px] font-mono text-gray-200 focus:outline-none"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[9px] uppercase font-bold text-emerald-400">
                          Expected Output / Assertion
                        </label>
                        <textarea
                          rows={2}
                          value={testCase.expectedOutput || (testCase as any).expectedOutputPattern || ''}
                          onChange={(e) => updateTestCase(idx, { expectedOutput: e.target.value })}
                          placeholder="Expected outcome, structure, or assertion constraint..."
                          className="w-full px-2 py-1 bg-[#0d1117] border border-[#30363d] focus:border-emerald-400 rounded text-[10px] font-mono text-gray-300 focus:outline-none"
                        />
                      </div>
                    </div>
                  );
                });
              })()}

              {/* Add More Tests Button */}
              <button
                type="button"
                onClick={() => {
                  const rawPrompts = (formData.config.testPrompts && formData.config.testPrompts.length > 0)
                    ? formData.config.testPrompts
                    : ((formData.config as any).testScenarios && (formData.config as any).testScenarios.length > 0)
                    ? (formData.config as any).testScenarios
                    : DEFAULT_MOCK_TEST_PROMPTS;
                  const newTest: TestPrompt = {
                    id: `test_prompt_${Date.now()}`,
                    name: `Test Case #${rawPrompts.length + 1}`,
                    prompt: '',
                    expectedOutput: '',
                    assertionType: 'contains',
                  };
                  handleConfigChange({ testPrompts: [...rawPrompts, newTest], testScenarios: [...rawPrompts, newTest] });
                }}
                className="w-full py-2 rounded-lg border border-dashed border-yellow-500/40 hover:border-yellow-400 hover:bg-yellow-950/30 text-yellow-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-yellow-400" />
                <span>+ Add More Tests</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 bg-[#161b22] border-t border-[#30363d] shrink-0 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 text-xs rounded-lg bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] text-gray-300 hover:text-white cursor-pointer"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          className="px-4 py-1.5 text-xs font-bold rounded-lg bg-amber-600 hover:bg-amber-500 text-white transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
        >
          {savedSuccess ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
          <span>{savedSuccess ? 'Saved!' : 'Save Trigger'}</span>
        </button>
      </div>
    </div>
  );
};
