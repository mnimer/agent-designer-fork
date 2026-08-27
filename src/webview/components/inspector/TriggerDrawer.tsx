/**
 * TriggerDrawer Component
 *
 * Inspector sidebar drawer for editing Trigger Node properties:
 * - Trigger Label & Description
 * - Trigger Kind (test, chat, pubsub, scheduled, webhook)
 * - Test Suite QA scenarios builder with assertion constraints
 * - Pub/Sub topic presets & automatic subscription provisioning
 * - Cloud Scheduler cron presets & custom cron syntax
 * - GCP EventArc service categories & event selection
 *
 * Architectural Decisions:
 * 1. Implements bidirectional sync with the canvas state via onUpdateNode callback.
 * 2. Adheres to the 8pt grid system with TailwindCSS classes.
 * 3. Class documentation and method comments per .gemini/GEMINI.md.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import React, { useState, useEffect } from 'react';
import {
  X,
  Zap,
  MessageSquare,
  Radio,
  Clock,
  FlaskConical,
  Save,
  Trash2,
  Check,
  Plus,
  RotateCcw,
  Sparkles,
  Calendar,
  Clock3,
  Info,
} from 'lucide-react';
import {
  TriggerNodeData,
  TriggerKind,
  TestSuiteScenario,
} from '../../../shared/types';
import {
  CRON_PRESETS,
  PUBSUB_TOPIC_PRESETS,
  DEFAULT_MOCK_TEST_SCENARIOS,
} from '../../data/triggerDefinitions';

export interface TriggerDrawerProps {
  nodeId: string | null;
  triggerData: TriggerNodeData | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateTrigger: (nodeId: string, updatedData: Partial<TriggerNodeData>) => void;
  onDeleteTrigger?: (nodeId: string) => void;
}

const getTriggerIcon = (kind: TriggerKind) => {
  switch (kind) {
    case 'chat':
      return <MessageSquare className="w-4 h-4 text-emerald-400" />;
    case 'pubsub':
      return <Radio className="w-4 h-4 text-amber-400" />;
    case 'scheduled':
      return <Clock className="w-4 h-4 text-sky-400" />;
    case 'test':
      return <FlaskConical className="w-4 h-4 text-pink-400" />;
    case 'webhook':
      return <Zap className="w-4 h-4 text-purple-400" />;
    default:
      return <Zap className="w-4 h-4 text-amber-400" />;
  }
};

export const TriggerDrawer: React.FC<TriggerDrawerProps> = ({
  nodeId,
  triggerData,
  isOpen,
  onClose,
  onUpdateTrigger,
  onDeleteTrigger,
}) => {
  const [formData, setFormData] = useState<TriggerNodeData | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [isCustomTopic, setIsCustomTopic] = useState(false);
  const [customTopicInput, setCustomTopicInput] = useState('');

  // Sync local formData with incoming triggerData
  useEffect(() => {
    if (triggerData) {
      const config = { ...(triggerData.config || {}) };
      if (triggerData.triggerKind === 'pubsub' && config.topic) {
        const matchingPreset = PUBSUB_TOPIC_PRESETS.some((p) => p.topic === config.topic);
        if (!matchingPreset) {
          setIsCustomTopic(true);
          setCustomTopicInput(config.topic);
        } else {
          setIsCustomTopic(false);
        }
      }
      setFormData({ ...triggerData, config });
    }
  }, [triggerData]);

  if (!isOpen || !formData || !nodeId) return null;

  /**
   * Updates partial key-value attributes on the trigger configuration object.
   */
  const handleConfigChange = (partial: Record<string, any>) => {
    setFormData((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        config: {
          ...prev.config,
          ...partial,
        },
      };
    });
  };

  /**
   * Persists changes to the canvas state and shows saved animation.
   */
  const handleSave = () => {
    if (!formData || !nodeId) return;
    onUpdateTrigger(nodeId, formData);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
    }, 1500);
  };

  return (
    <div className="absolute top-0 right-0 bottom-0 z-40 w-96 backdrop-blur-2xl bg-[#161b22]/95 border-l border-[#30363d] shadow-2xl flex flex-col overflow-hidden text-[#c9d1d9] animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#161b22] border-b border-[#30363d] shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-1.5 rounded-lg bg-[#0d1117] border border-[#30363d] shrink-0">
            {getTriggerIcon(formData.triggerKind)}
          </div>
          <div className="min-w-0">
            <h3 className="text-xs font-bold text-white truncate">
              {formData.label || 'Workflow Trigger'}
            </h3>
            <span className="text-[10px] text-amber-400 font-mono">
              Entrypoint: {formData.triggerKind.toUpperCase()}
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
        {/* 1. Basic Metadata */}
        <div className="space-y-3 bg-[#0d1117] p-3 rounded-lg border border-[#30363d]">
          <div className="space-y-1">
            <label className="text-[11px] font-bold uppercase tracking-tight text-gray-400">
              Trigger Label
            </label>
            <input
              type="text"
              value={formData.label || ''}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, label: e.target.value })}
              placeholder="e.g., Nightly QA Runner"
              className="w-full px-3 py-1.5 bg-[#161b22] border border-[#30363d] focus:border-amber-500 rounded-lg text-xs text-white focus:outline-none"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-bold uppercase tracking-tight text-gray-400">
              Trigger Kind
            </label>
            <select
              value={formData.triggerKind}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFormData({ ...formData, triggerKind: e.target.value as TriggerKind })}
              className="w-full px-3 py-1.5 bg-[#161b22] border border-[#30363d] focus:border-amber-500 rounded-lg text-xs text-amber-300 font-mono font-bold focus:outline-none cursor-pointer"
            >
              <option value="test">🧪 Test Suite (QA & CI/CD)</option>
              <option value="chat">💬 Chat Trigger (Interactive UI)</option>
              <option value="pubsub">📻 Pub/Sub Topic Ingestion</option>
              <option value="scheduled">⏰ Cloud Scheduler (Cron Cadence)</option>
              <option value="webhook">⚡ Webhook / CloudEvent</option>
            </select>
          </div>
        </div>

        {/* 2. KIND-SPECIFIC CONFIGURATION */}

        {/* 2a. CHAT TRIGGER */}
        {formData.triggerKind === 'chat' && (
          <div className="space-y-3 bg-[#0d1117] p-3 rounded-lg border border-emerald-500/30">
            <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-xs">
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Interactive Chat Configuration</span>
            </div>

            <div className="p-2.5 bg-[#161b22] rounded-lg border border-[#30363d] text-[11px] text-gray-300 space-y-1.5">
              <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                <Info className="w-3.5 h-3.5" />
                <span>Conversational Interface</span>
              </div>
              <p className="text-gray-400 leading-relaxed">
                Connects an interactive chat session directly to the root agent with real-time token streaming.
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-gray-400">
                Initial Welcome Message
              </label>
              <textarea
                rows={2}
                value={formData.config?.initialMessage || ''}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => handleConfigChange({ initialMessage: e.target.value })}
                placeholder="Hello! I am your AI agent assistant. How can I help you today?"
                className="w-full px-2.5 py-1.5 bg-[#161b22] border border-[#30363d] focus:border-emerald-400 rounded text-xs text-gray-200 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-gray-300 font-medium">Real-time Token Streaming</span>
              <input
                type="checkbox"
                checked={formData.config?.streaming ?? true}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleConfigChange({ streaming: e.target.checked })}
                className="rounded bg-[#161b22] border-[#30363d] text-emerald-500 focus:ring-0 cursor-pointer"
              />
            </div>
          </div>
        )}

        {/* 2b. PUBSUB TRIGGER */}
        {formData.triggerKind === 'pubsub' && (
          <div className="space-y-3 bg-[#0d1117] p-3 rounded-lg border border-amber-500/30">
            <div className="flex items-center gap-1.5 text-amber-400 font-bold text-xs">
              <Radio className="w-3.5 h-3.5" />
              <span>Pub/Sub Ingestion Configuration</span>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold text-gray-400 flex items-center justify-between">
                <span>Select Pub/Sub Topic</span>
                <span className="text-[9px] text-amber-400 font-mono">Google Cloud Pub/Sub</span>
              </label>

              <select
                value={isCustomTopic ? '__custom__' : (formData.config?.topic || PUBSUB_TOPIC_PRESETS[0].topic)}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                  if (e.target.value === '__custom__') {
                    setIsCustomTopic(true);
                    if (customTopicInput) {
                      handleConfigChange({ topic: customTopicInput });
                    }
                  } else {
                    setIsCustomTopic(false);
                    handleConfigChange({
                      topic: e.target.value,
                      subscription: `${e.target.value.split('/').pop()}-sub-auto`,
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
                    value={formData.config?.topic || customTopicInput}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      setCustomTopicInput(e.target.value);
                      handleConfigChange({
                        topic: e.target.value,
                        subscription: `${e.target.value.split('/').pop() || 'agent'}-sub-auto`,
                      });
                    }}
                    placeholder="projects/my-gcp-project/topics/custom-agent-topic"
                    className="w-full px-2.5 py-1.5 bg-[#161b22] border border-amber-500/50 focus:border-amber-400 rounded text-[11px] font-mono text-amber-300 focus:outline-none"
                  />
                </div>
              )}
            </div>

            <div className="p-2.5 rounded-lg bg-amber-950/30 border border-amber-500/40 text-[11px] space-y-1">
              <div className="flex items-center gap-1.5 text-amber-300 font-semibold">
                <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>Automatic Subscription Provisioning</span>
              </div>
              <p className="text-amber-200/80 leading-relaxed text-[10.5px]">
                Registers a subscription to invoke the agent when messages are published.
              </p>
            </div>
          </div>
        )}

        {/* 2c. SCHEDULED / CRON TRIGGER */}
        {formData.triggerKind === 'scheduled' && (
          <div className="space-y-3 bg-[#0d1117] p-3 rounded-lg border border-sky-500/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-sky-400 font-bold text-xs">
                <Clock className="w-3.5 h-3.5" />
                <span>Schedule & Cron Configuration</span>
              </div>
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30">
                Cloud Scheduler
              </span>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold text-gray-400 flex items-center gap-1">
                <Calendar className="w-3 h-3 text-sky-400" />
                <span>Cadence Presets</span>
              </label>

              <div className="grid grid-cols-2 gap-1.5">
                {CRON_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      handleConfigChange({
                        cronExpression: preset.cron,
                        scheduleInterval: preset.label,
                      });
                    }}
                    className={`p-1.5 rounded text-left border transition-all cursor-pointer ${
                      formData.config?.cronExpression === preset.cron
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

            <div className="space-y-1 pt-1">
              <label className="text-[10px] uppercase font-bold text-gray-400 flex items-center justify-between">
                <span>Cron Expression</span>
                <span className="text-[9px] font-mono text-gray-400">min hour day month weekday</span>
              </label>
              <input
                type="text"
                value={formData.config?.cronExpression || '0 9 * * 1-5'}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleConfigChange({ cronExpression: e.target.value })}
                placeholder="0 9 * * 1-5"
                className="w-full px-2.5 py-1.5 bg-[#161b22] border border-[#30363d] focus:border-sky-400 rounded text-xs font-mono text-sky-300 focus:outline-none"
              />
            </div>

            <div className="space-y-1 pt-1">
              <label className="text-[10px] uppercase font-bold text-gray-400 flex items-center gap-1">
                <Clock3 className="w-3 h-3 text-sky-400" />
                <span>Timezone</span>
              </label>
              <select
                value={formData.config?.timezone || 'America/New_York'}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => handleConfigChange({ timezone: e.target.value })}
                className="w-full px-2.5 py-1.5 bg-[#161b22] border border-[#30363d] focus:border-sky-400 rounded text-xs text-gray-200 focus:outline-none cursor-pointer"
              >
                <option value="America/New_York">America/New_York (EST / EDT)</option>
                <option value="America/Chicago">America/Chicago (CST / CDT)</option>
                <option value="America/Los_Angeles">America/Los_Angeles (PST / PDT)</option>
                <option value="UTC">UTC (Coordinated Universal Time)</option>
                <option value="Europe/London">Europe/London (GMT / BST)</option>
                <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
              </select>
            </div>
          </div>
        )}

        {/* 2d. TEST SUITE TRIGGER */}
        {formData.triggerKind === 'test' && (
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
                    testScenarios: DEFAULT_MOCK_TEST_SCENARIOS,
                  });
                }}
                className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-white hover:underline cursor-pointer"
                title="Reset test scenarios to default mocks"
              >
                <RotateCcw className="w-2.5 h-2.5" />
                <span>Reset Mocks</span>
              </button>
            </div>

            <div className="space-y-2.5">
              {((formData.config?.testScenarios && formData.config.testScenarios.length > 0)
                ? formData.config.testScenarios
                : DEFAULT_MOCK_TEST_SCENARIOS
              ).map((scenario: TestSuiteScenario, idx: number) => {
                const currentScenarios: TestSuiteScenario[] = (formData.config?.testScenarios && formData.config.testScenarios.length > 0)
                  ? formData.config.testScenarios
                  : DEFAULT_MOCK_TEST_SCENARIOS;

                const updateScenario = (partialTest: Partial<TestSuiteScenario>) => {
                  const updated = currentScenarios.map((tc, i) =>
                    i === idx ? { ...tc, ...partialTest } : tc
                  );
                  handleConfigChange({ testScenarios: updated });
                };

                const removeScenario = () => {
                  const updated = currentScenarios.filter((_, i) => i !== idx);
                  handleConfigChange({ testScenarios: updated });
                };

                return (
                  <div
                    key={scenario.id || idx}
                    className="p-2.5 rounded-lg bg-[#161b22] border border-[#30363d] space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <input
                        type="text"
                        value={scenario.name || ''}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateScenario({ name: e.target.value })}
                        placeholder="Test Scenario Name"
                        className="font-bold text-xs text-white bg-transparent border-b border-transparent hover:border-[#30363d] focus:border-pink-500 focus:outline-none w-[180px]"
                      />
                      <button
                        type="button"
                        onClick={removeScenario}
                        className="p-0.5 text-gray-400 hover:text-rose-400 rounded hover:bg-rose-950/40 cursor-pointer"
                        title="Remove scenario"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] uppercase font-bold text-pink-400">
                        Input Query
                      </label>
                      <textarea
                        rows={2}
                        value={scenario.inputQuery || ''}
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => updateScenario({ inputQuery: e.target.value })}
                        placeholder="Prompt query sent to agent..."
                        className="w-full px-2 py-1 bg-[#0d1117] border border-[#30363d] focus:border-pink-400 rounded text-[10px] font-mono text-gray-200 focus:outline-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] uppercase font-bold text-emerald-400">
                        Expected Output Pattern
                      </label>
                      <input
                        type="text"
                        value={scenario.expectedOutputPattern || ''}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateScenario({ expectedOutputPattern: e.target.value })}
                        placeholder="e.g., regex pattern or expected keyword"
                        className="w-full px-2 py-1 bg-[#0d1117] border border-[#30363d] focus:border-emerald-400 rounded text-[10px] font-mono text-gray-300 focus:outline-none"
                      />
                    </div>
                  </div>
                );
              })}

              <button
                type="button"
                onClick={() => {
                  const current = (formData.config?.testScenarios && formData.config.testScenarios.length > 0)
                    ? formData.config.testScenarios
                    : DEFAULT_MOCK_TEST_SCENARIOS;
                  const newTest: TestSuiteScenario = {
                    id: `scenario_${Date.now()}`,
                    name: `Scenario #${current.length + 1}`,
                    inputQuery: '',
                    expectedOutputPattern: '',
                  };
                  handleConfigChange({ testScenarios: [...current, newTest] });
                }}
                className="w-full py-2 rounded-lg border border-dashed border-pink-500/40 hover:border-pink-400 hover:bg-pink-950/30 text-pink-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-pink-400" />
                <span>+ Add Test Scenario</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 bg-[#161b22] border-t border-[#30363d] shrink-0 flex items-center justify-between">
        {onDeleteTrigger ? (
          <button
            type="button"
            onClick={() => {
              if (confirm(`Are you sure you want to delete trigger "${formData.label}"?`)) {
                onDeleteTrigger(nodeId);
                onClose();
              }
            }}
            className="p-2 text-gray-400 hover:text-rose-400 rounded-lg hover:bg-rose-950/40 transition-colors cursor-pointer"
            title="Delete Trigger"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        ) : (
          <div />
        )}

        <div className="flex items-center gap-2">
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
    </div>
  );
};
