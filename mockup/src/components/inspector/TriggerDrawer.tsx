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
  Clock3
} from 'lucide-react';
import { TriggerData, TriggerType, AgentData, TestPrompt } from '../../types';
import { 
  DEFAULT_MOCK_TEST_PROMPTS, 
  EVENTARC_CATEGORIES, 
  PUBSUB_TOPIC_PRESETS,
  GCP_PROJECT_SERVICE_ACCOUNTS
} from '../../data/triggerDefinitions';

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

const getTriggerIcon = (type: TriggerType) => {
  switch (type) {
    case 'chat':
      return <MessageSquare className="w-4 h-4 text-emerald-400" />;
    case 'pubsub':
      return <Radio className="w-4 h-4 text-amber-400" />;
    case 'scheduled':
      return <Clock className="w-4 h-4 text-sky-400" />;
    case 'tester':
      return <FlaskConical className="w-4 h-4 text-pink-400" />;
    case 'eventarc':
      return <Zap className="w-4 h-4 text-purple-400" />;
    default:
      return <Zap className="w-4 h-4 text-amber-400" />;
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
  const [formData, setFormData] = useState<TriggerData | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [isCustomTopic, setIsCustomTopic] = useState(false);
  const [customTopicInput, setCustomTopicInput] = useState('');

  useEffect(() => {
    if (trigger) {
      const config = { ...(trigger.config || {}) };
      // Defaults for EventArc if empty
      if (trigger.triggerType === 'eventarc') {
        if (!config.eventarcCategory) config.eventarcCategory = 'bigquery';
        if (!config.eventarcEvent) config.eventarcEvent = 'TableCreate';
        if (!config.eventarcServiceName) config.eventarcServiceName = 'bigquery.googleapis.com';
      }
      // Check if PubSub topic is in preset list
      if (trigger.triggerType === 'pubsub' && config.topic) {
        const matchingPreset = PUBSUB_TOPIC_PRESETS.some((p) => p.topic === config.topic);
        if (!matchingPreset) {
          setIsCustomTopic(true);
          setCustomTopicInput(config.topic);
        } else {
          setIsCustomTopic(false);
        }
      }
      setFormData({ ...trigger, config });
    }
  }, [trigger]);

  if (!isOpen || !formData) return null;

  const handleConfigChange = (partial: Record<string, any>) => {
    setFormData((prev) => {
      if (!prev) return null;
      const next = {
        ...prev,
        config: {
          ...prev.config,
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

  // EventArc category and events selection helper
  const currentCategory = EVENTARC_CATEGORIES.find(
    (c) => c.id === (formData.config.eventarcCategory || 'bigquery')
  ) || EVENTARC_CATEGORIES[0];

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-[420px] bg-[#161b22] border-l border-[#30363d] shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200 text-[#c9d1d9] font-sans">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5 bg-[#161b22] border-b border-[#30363d] shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-1.5 rounded-lg bg-[#0d1117] border border-[#30363d] shrink-0 shadow-xs">
            {getTriggerIcon(formData.triggerType)}
          </div>
          <div className="min-w-0">
            <h3 className="text-xs font-bold text-white truncate max-w-[200px]">
              {formData.label}
            </h3>
            <span className="text-[10px] text-amber-400 font-mono flex items-center gap-1">
              Workflow Entrypoint Trigger
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-md text-gray-400 hover:text-white hover:bg-[#30363d] transition-colors cursor-pointer"
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
              Trigger Type
            </label>
            <div className="px-3 py-1.5 bg-[#161b22] border border-[#30363d] rounded-lg text-xs text-amber-400 font-mono font-bold uppercase flex items-center justify-between">
              <span>{formData.triggerType}</span>
              <span className="text-[10px] text-gray-400 font-normal">Entrypoint Invoker</span>
            </div>
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
          <div className="space-y-3 bg-[#0d1117] p-3 rounded-lg border border-emerald-500/30">
            <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-xs">
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Chat Trigger Properties</span>
            </div>

            <div className="p-2.5 bg-[#161b22] rounded-lg border border-[#30363d] text-[11px] text-gray-300 space-y-1.5">
              <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
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
                className="w-full px-2.5 py-1.5 bg-[#161b22] border border-[#30363d] focus:border-emerald-400 rounded text-xs text-gray-200 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-gray-300 font-medium">Real-time Token Streaming</span>
              <input
                type="checkbox"
                checked={formData.config.streaming ?? true}
                onChange={(e) => handleConfigChange({ streaming: e.target.checked })}
                className="rounded bg-[#161b22] border-[#30363d] text-emerald-500 focus:ring-0 cursor-pointer"
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
              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                GCP EventArc
              </span>
            </div>

            <p className="text-[11px] text-gray-400 leading-relaxed">
              Triggers the root agent upon receiving CloudEvents routed from Google Cloud services and Audit Logs.
            </p>

            {/* Dropdown 1: Category Selection */}
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-purple-300">
                1. Select Service Category
              </label>
              <select
                value={formData.config.eventarcCategory || 'bigquery'}
                onChange={(e) => {
                  const newCategory = EVENTARC_CATEGORIES.find((c) => c.id === e.target.value) || EVENTARC_CATEGORIES[0];
                  handleConfigChange({
                    eventarcCategory: newCategory.id,
                    eventarcServiceName: newCategory.serviceName,
                    eventarcEvent: newCategory.events[0]?.id || 'TableCreate',
                  });
                }}
                className="w-full px-2.5 py-1.5 bg-[#161b22] border border-[#30363d] focus:border-purple-400 rounded text-xs text-white focus:outline-none cursor-pointer"
              >
                {EVENTARC_CATEGORIES.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name} ({cat.serviceName})
                  </option>
                ))}
              </select>
            </div>

            {/* Dropdown 2: Event Selection for selected category */}
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-purple-300">
                2. Select Event
              </label>
              <select
                value={formData.config.eventarcEvent || currentCategory.events[0]?.id}
                onChange={(e) => handleConfigChange({ eventarcEvent: e.target.value })}
                className="w-full px-2.5 py-1.5 bg-[#161b22] border border-[#30363d] focus:border-purple-400 rounded text-xs text-white focus:outline-none cursor-pointer font-mono"
              >
                {currentCategory.events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.name}
                  </option>
                ))}
              </select>

              {/* Event Description */}
              {(() => {
                const selectedEv = currentCategory.events.find(
                  (ev) => ev.id === (formData.config.eventarcEvent || currentCategory.events[0]?.id)
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
            </div>
          </div>
        )}

        {/* 5. TESTER TRIGGER (Test Suite & Add More Tests) */}
        {formData.triggerType === 'tester' && (
          <div className="space-y-3 bg-[#0d1117] p-3 rounded-lg border border-pink-500/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-pink-400 font-bold text-xs">
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
              {((formData.config.testPrompts && formData.config.testPrompts.length > 0)
                ? formData.config.testPrompts
                : DEFAULT_MOCK_TEST_PROMPTS
              ).map((testCase, idx) => {
                const currentPrompts = (formData.config.testPrompts && formData.config.testPrompts.length > 0)
                  ? formData.config.testPrompts
                  : DEFAULT_MOCK_TEST_PROMPTS;

                const updateTestCase = (partialTest: Partial<TestPrompt>) => {
                  const updated = currentPrompts.map((tc, i) =>
                    i === idx ? { ...tc, ...partialTest } : tc
                  );
                  handleConfigChange({ testPrompts: updated });
                };

                const removeTestCase = () => {
                  const updated = currentPrompts.filter((_, i) => i !== idx);
                  handleConfigChange({ testPrompts: updated });
                };

                return (
                  <div
                    key={testCase.id || idx}
                    className="p-2.5 rounded-lg bg-[#161b22] border border-[#30363d] space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <input
                        type="text"
                        value={testCase.name}
                        onChange={(e) => updateTestCase({ name: e.target.value })}
                        placeholder="Test Name"
                        className="font-bold text-xs text-white bg-transparent border-b border-transparent hover:border-[#30363d] focus:border-pink-500 focus:outline-none w-[180px]"
                      />
                      <div className="flex items-center gap-1">
                        <select
                          value={testCase.assertionType || 'contains'}
                          onChange={(e) => updateTestCase({ assertionType: e.target.value as any })}
                          className="px-1.5 py-0.5 bg-[#0d1117] border border-[#30363d] rounded text-[9px] text-pink-300 font-mono focus:outline-none cursor-pointer"
                        >
                          <option value="contains">contains</option>
                          <option value="exact">exact match</option>
                          <option value="json_schema">json schema</option>
                          <option value="llm_eval">llm eval</option>
                        </select>
                        <button
                          type="button"
                          onClick={removeTestCase}
                          className="p-0.5 text-gray-400 hover:text-rose-400 rounded hover:bg-rose-950/40 cursor-pointer"
                          title="Remove test case"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] uppercase font-bold text-pink-400">
                        Test Prompt
                      </label>
                      <textarea
                        rows={2}
                        value={testCase.prompt}
                        onChange={(e) => updateTestCase({ prompt: e.target.value })}
                        placeholder="Prompt to send to agent pipeline..."
                        className="w-full px-2 py-1 bg-[#0d1117] border border-[#30363d] focus:border-pink-400 rounded text-[10px] font-mono text-gray-200 focus:outline-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] uppercase font-bold text-emerald-400">
                        Expected Output / Assertion
                      </label>
                      <textarea
                        rows={2}
                        value={testCase.expectedOutput}
                        onChange={(e) => updateTestCase({ expectedOutput: e.target.value })}
                        placeholder="Expected outcome, structure, or assertion constraint..."
                        className="w-full px-2 py-1 bg-[#0d1117] border border-[#30363d] focus:border-emerald-400 rounded text-[10px] font-mono text-gray-300 focus:outline-none"
                      />
                    </div>
                  </div>
                );
              })}

              {/* Add More Tests Button */}
              <button
                type="button"
                onClick={() => {
                  const current = (formData.config.testPrompts && formData.config.testPrompts.length > 0)
                    ? formData.config.testPrompts
                    : DEFAULT_MOCK_TEST_PROMPTS;
                  const newTest: TestPrompt = {
                    id: `test_prompt_${Date.now()}`,
                    name: `Test Case #${current.length + 1}`,
                    prompt: '',
                    expectedOutput: '',
                    assertionType: 'contains',
                  };
                  handleConfigChange({ testPrompts: [...current, newTest] });
                }}
                className="w-full py-2 rounded-lg border border-dashed border-pink-500/40 hover:border-pink-400 hover:bg-pink-950/30 text-pink-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-pink-400" />
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
