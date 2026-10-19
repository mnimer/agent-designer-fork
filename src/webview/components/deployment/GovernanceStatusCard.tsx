/**
 * GovernanceStatusCard
 *
 * Reusable Enterprise Agent Governance & Gemini Enterprise App publishing configuration
 * and post-deploy status card for Vertex AI Agent Engine and Google Cloud Run deployment tabs.
 *
 * Job in Application:
 * Renders the enterprise governance controls (TASK-217) and automated Gemini Enterprise App
 * publishing controls (TASK-218):
 * - Always-on indicators for Agent Registry (`agentregistry.googleapis.com`) and
 *   Agent Security Policies (`networksecurity.googleapis.com`).
 * - Checkbox (default: checked) for Shared Regional Agent Gateway + Model Armor Guardrails,
 *   with a dynamically populated Model Armor Template selector defaulting to
 *   `enterprise-baseline` ("Enterprise Baseline (Managed Default)").
 * - Checkbox (default: unchecked) for Post-Deploy Vertex AI Cloud Evaluation (`EvalTask`).
 * - Conditional Checkbox (ONLY visible when the workflow has a Chat Trigger node, and
 *   defaulting to checked when visible) for Publishing to a Gemini Enterprise App (`engine_id`).
 * - Post-deploy governance status summary including Evaluation Warning banners, blocked
 *   publishing notices, and "Open in Gemini Enterprise" deep links.
 *
 * Architectural Decisions:
 * 1. Chat-Trigger Gated Publishing: Per product requirements, publishing to Gemini Enterprise
 *    is only applicable to conversational agents with a Chat Trigger node on the canvas.
 * 2. Shared Regional Gateway Default: Uses `default-shared-agent-gateway` across deployments
 *    to avoid per-agent gateway sprawl while enforcing Model Armor guardrails at the edge.
 * 3. Evaluation Gate Safety: Surfaces evaluation warnings without rolling back the live runtime
 *    endpoint, while visually indicating when Gemini Enterprise App publishing was blocked.
 * 4. 8pt Grid System: Uses multiples of 8px (p-2, p-3, gap-2, gap-4) consistent with deployment tabs.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Shield,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  RefreshCw,
  Sparkles,
  Lock,
  FlaskConical,
  Building2,
} from 'lucide-react';
import {
  AgentWorkflowDocument,
  AgentGovernanceConfig,
  ModelArmorTemplateItem,
  GeminiEnterpriseAppItem,
} from '../../types';
import { useWebviewBridge } from '../../hooks/useWebviewBridge';

export const DEFAULT_SHARED_GATEWAY_ID = 'default-shared-agent-gateway';
export const DEFAULT_MODEL_ARMOR_TEMPLATE_ID = 'enterprise-baseline';
export const DEFAULT_GEMINI_ENTERPRISE_APP_ID = '';

const FALLBACK_MODEL_ARMOR_TEMPLATES: ModelArmorTemplateItem[] = [
  {
    name: 'projects/-/locations/global/templates/enterprise-baseline',
    templateId: 'enterprise-baseline',
    displayName: 'Enterprise Baseline (Managed Default)',
    description: 'Standard prompt injection, jailbreak, RAI, and sensitive data DLP guardrails',
  },
];

/**
 * Determines whether the workflow document contains a Chat Trigger node.
 */
export function hasChatTriggerNode(document?: AgentWorkflowDocument): boolean {
  const nodes = document?.nodes;
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return false;
  }
  return nodes.some((node: any) => {
    const data = node?.data || {};
    const triggerType = String(data.triggerType || '').toLowerCase();
    const triggerKind = String(data.triggerKind || '').toLowerCase();
    const nodeType = String(node?.type || '').toLowerCase();
    return (
      triggerType === 'chat' ||
      triggerKind === 'chat' ||
      nodeType === 'chat'
    );
  });
}

/**
 * Determines whether the workflow document contains a Test Suite Trigger node.
 */
export function hasTestSuiteTriggerNode(document?: AgentWorkflowDocument): boolean {
  const nodes = document?.nodes;
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return false;
  }
  return nodes.some((node: any) => {
    const data = node?.data || {};
    const triggerType = String(data.triggerType || '').toLowerCase();
    const triggerKind = String(data.triggerKind || '').toLowerCase();
    return (
      triggerType === 'tester' ||
      triggerType === 'test' ||
      triggerKind === 'test'
    );
  });
}

/**
 * Builds the default AgentGovernanceConfig for a workflow document.
 * - Shared Regional Agent Gateway + Model Armor: enabled by default (`enterprise-baseline`)
 * - Run Vertex AI Cloud Evaluation: disabled by default (`false`)
 * - Publish to Gemini Enterprise App: enabled by default (`true`) ONLY when a Chat Trigger exists
 */
export function createDefaultGovernanceConfig(
  document?: AgentWorkflowDocument
): AgentGovernanceConfig {
  const savedGov = (document as any)?.deployment?.governance as Partial<AgentGovernanceConfig> | undefined;
  const chatTriggerPresent = hasChatTriggerNode(document);

  return {
    enableAgentGateway: savedGov?.enableAgentGateway ?? true,
    agentGatewayId: savedGov?.agentGatewayId || DEFAULT_SHARED_GATEWAY_ID,
    modelArmorTemplateId: savedGov?.modelArmorTemplateId || DEFAULT_MODEL_ARMOR_TEMPLATE_ID,
    runCloudEvaluation: savedGov?.runCloudEvaluation ?? false,
    publishToGeminiEnterprise: chatTriggerPresent
      ? (savedGov?.publishToGeminiEnterprise ?? true)
      : false,
    geminiEnterpriseAppId: savedGov?.geminiEnterpriseAppId || DEFAULT_GEMINI_ENTERPRISE_APP_ID,
    geminiEnterpriseLocation: savedGov?.geminiEnterpriseLocation || 'global',
    geminiEnterpriseBindGateway: savedGov?.geminiEnterpriseBindGateway ?? true,
  };
}

export interface GovernanceMetadataSummary {
  agent_registry_id?: string;
  agent_registry_resource?: string;
  security_policy_resource?: string;
  agent_gateway_url?: string;
  agent_gateway_resource?: string;
  model_armor_template_id?: string;
  eval_gate_status?: 'passed' | 'warning' | 'skipped';
  eval_experiment_url?: string;
  eval_task_experiment_url?: string;
  eval_failed_cases?: string[];
  eval_warnings?: string[];
  gemini_enterprise_app_id?: string;
  gemini_enterprise_url?: string;
  gemini_enterprise_console_url?: string;
  gemini_enterprise_agent_id?: string;
  gemini_enterprise_agent_uri?: string;
  gemini_enterprise_blocked_by_eval?: boolean;
}

export interface GovernanceStatusCardProps {
  document?: AgentWorkflowDocument;
  projectId?: string;
  region?: string;
  value: AgentGovernanceConfig;
  onChange: (next: AgentGovernanceConfig) => void;
  metadata?: GovernanceMetadataSummary | null;
}

export const GovernanceStatusCard: React.FC<GovernanceStatusCardProps> = ({
  document: workflowDoc,
  projectId,
  region = 'us-central1',
  value,
  onChange,
  metadata,
}) => {
  const bridge = useWebviewBridge();

  const chatTriggerPresent = useMemo(() => hasChatTriggerNode(workflowDoc), [workflowDoc]);
  const testTriggerPresent = useMemo(() => hasTestSuiteTriggerNode(workflowDoc), [workflowDoc]);

  const [modelArmorTemplates, setModelArmorTemplates] = useState<ModelArmorTemplateItem[]>(
    FALLBACK_MODEL_ARMOR_TEMPLATES
  );
  const [geminiApps, setGeminiApps] = useState<GeminiEnterpriseAppItem[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState<boolean>(false);
  const [loadingApps, setLoadingApps] = useState<boolean>(false);

  // Sync publishToGeminiEnterprise when a Chat Trigger is added or removed on the canvas
  useEffect(() => {
    if (!chatTriggerPresent && value.publishToGeminiEnterprise) {
      onChange({
        ...value,
        publishToGeminiEnterprise: false,
      });
    }
  }, [chatTriggerPresent]);

  // Subscribe to discovery responses from the extension host
  useEffect(() => {
    if (!bridge) return;
    const subscribeFn = (bridge as any).subscribe || (bridge as any).onMessage;
    if (typeof subscribeFn !== 'function') return;

    const unsubTemplates = subscribeFn.call(
      bridge,
      'MODEL_ARMOR_TEMPLATES_RESPONSE',
      (payload: any) => {
        setLoadingTemplates(false);
        if (Array.isArray(payload?.templates) && payload.templates.length > 0) {
          setModelArmorTemplates(payload.templates);
        }
      }
    );

    const unsubApps = subscribeFn.call(
      bridge,
      'GEMINI_ENTERPRISE_APPS_RESPONSE',
      (payload: any) => {
        setLoadingApps(false);
        const apps: GeminiEnterpriseAppItem[] = Array.isArray(payload?.apps) ? payload.apps : [];
        setGeminiApps(apps);
        if (apps.length > 0 && !value.geminiEnterpriseAppId) {
          onChange({
            ...value,
            geminiEnterpriseAppId: apps[0].engineId,
          });
        } else if (apps.length === 0 && value.geminiEnterpriseAppId) {
          onChange({
            ...value,
            geminiEnterpriseAppId: '',
          });
        }
      }
    );

    return () => {
      if (typeof unsubTemplates === 'function') unsubTemplates();
      if (typeof unsubApps === 'function') unsubApps();
    };
  }, [bridge, value, onChange]);

  // Request Model Armor templates and Gemini Enterprise apps when project/region changes
  useEffect(() => {
    if (!bridge || typeof bridge.postMessage !== 'function') return;
    bridge.postMessage({
      type: 'FETCH_MODEL_ARMOR_TEMPLATES',
      payload: {
        projectId: projectId?.trim() || undefined,
        location: region,
      },
    });
    if (chatTriggerPresent) {
      bridge.postMessage({
        type: 'FETCH_GEMINI_ENTERPRISE_APPS',
        payload: {
          projectId: projectId?.trim() || undefined,
          location: value.geminiEnterpriseLocation || 'global',
        },
      });
    }
  }, [bridge, projectId, region, chatTriggerPresent, value.geminiEnterpriseLocation]);

  const handleRefreshTemplates = () => {
    if (!bridge) return;
    setLoadingTemplates(true);
    bridge.postMessage({
      type: 'FETCH_MODEL_ARMOR_TEMPLATES',
      payload: {
        projectId: projectId?.trim() || undefined,
        location: region,
        forceRefresh: true,
      },
    });
  };

  const handleRefreshGeminiApps = () => {
    if (!bridge) return;
    setLoadingApps(true);
    bridge.postMessage({
      type: 'FETCH_GEMINI_ENTERPRISE_APPS',
      payload: {
        projectId: projectId?.trim() || undefined,
        location: value.geminiEnterpriseLocation || 'global',
        forceRefresh: true,
      },
    });
  };

  return (
    <div
      className="space-y-3 p-3 bg-[#0d1117] rounded-lg border border-[#30363d]"
      data-testid="governance-status-card"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-bold uppercase tracking-wider text-gray-300 flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5 text-emerald-400" />
          <span>Agent Governance &amp; Security</span>
        </div>
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950/40 text-emerald-400 border border-emerald-500/30">
          Best Practice
        </span>
      </div>

      {/* Section 1: Always-Automatic Governance Policies */}
      <div className="p-2 bg-[#161b22] rounded border border-[#30363d] space-y-1.5">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
          Always Enforced Automatically
        </div>
        <div className="flex items-center justify-between text-[11px] text-gray-300">
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>Agent Registry Discovery</span>
          </span>
          <span className="font-mono text-[10px] text-emerald-400">agentregistry.googleapis.com</span>
        </div>
        <div className="flex items-center justify-between text-[11px] text-gray-300">
          <span className="flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>Least-Privilege Security Policies</span>
          </span>
          <span className="font-mono text-[10px] text-emerald-400">IAM + AuthzPolicy</span>
        </div>
      </div>

      {/* Section 2: Shared Regional Agent Gateway + Model Armor (Default: Checked) */}
      <div className="pt-2 border-t border-[#30363d]/60 space-y-2">
        <label className="flex items-start gap-2 cursor-pointer text-xs text-white font-medium">
          <input
            type="checkbox"
             data-testid="checkbox-enable-agent-gateway"
            checked={value.enableAgentGateway}
            onChange={(e) =>
              onChange({
                ...value,
                enableAgentGateway: e.target.checked,
              })
            }
            className="mt-0.5 rounded bg-[#161b22] border-[#30363d] text-emerald-500 focus:ring-0 cursor-pointer"
          />
          <div className="flex-1">
            <span className="block text-[11px] text-white font-medium">
              Enable Shared Regional Agent Gateway + Model Armor
            </span>
            <span className="block text-[10px] text-gray-400">
              Routes traffic through shared regional gateway ({value.agentGatewayId || DEFAULT_SHARED_GATEWAY_ID}) with runtime prompt/response sanitization.
            </span>
          </div>
        </label>

        {value.enableAgentGateway && (
          <div className="pl-5 space-y-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="model-armor-template-select"
                className="text-[11px] text-gray-300 font-medium"
              >
                Model Armor Template
              </label>
              <button
                type="button"
                onClick={handleRefreshTemplates}
                title="Refresh Model Armor Templates"
                className="text-[10px] text-gray-400 hover:text-white flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${loadingTemplates ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>
            <select
              id="model-armor-template-select"
              data-testid="select-model-armor-template"
              value={value.modelArmorTemplateId || DEFAULT_MODEL_ARMOR_TEMPLATE_ID}
              onChange={(e) =>
                onChange({
                  ...value,
                  modelArmorTemplateId: e.target.value,
                })
              }
              className="w-full bg-[#161b22] border border-[#30363d] text-xs text-white rounded px-2.5 py-1.5 focus:outline-none focus:border-emerald-500 cursor-pointer"
            >
              {modelArmorTemplates.map((tpl) => (
                <option key={tpl.templateId} value={tpl.templateId}>
                  {tpl.displayName} ({tpl.templateId})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Section 3: Post-Deploy Vertex AI Cloud Evaluation (Default: Unchecked) */}
      {(testTriggerPresent || value.runCloudEvaluation) && (
        <div className="pt-2 border-t border-[#30363d]/60 space-y-1">
          <label className="flex items-start gap-2 cursor-pointer text-xs text-white font-medium">
            <input
              type="checkbox"
              data-testid="checkbox-run-cloud-eval"
              checked={value.runCloudEvaluation}
              onChange={(e) =>
                onChange({
                  ...value,
                  runCloudEvaluation: e.target.checked,
                })
              }
              className="mt-0.5 rounded bg-[#161b22] border-[#30363d] text-emerald-500 focus:ring-0 cursor-pointer"
            />
            <div className="flex-1">
              <span className="flex items-center gap-1.5 text-[11px] text-white font-medium">
                <FlaskConical className="w-3.5 h-3.5 text-blue-400" />
                <span>Run Cloud Evaluation Post-Deploy</span>
              </span>
              <span className="block text-[10px] text-gray-400">
                Executes <code className="font-mono text-gray-300">eval_dataset.jsonl</code> against the deployed endpoint. Failures mark deploy as Succeeded with Evaluation Warnings and block Gemini Enterprise publishing.
              </span>
            </div>
          </label>
        </div>
      )}

      {/* Section 4: Publish to Gemini Enterprise App (ONLY visible when Chat Trigger exists; Default: Checked) */}
      {chatTriggerPresent && (
        <div
          className="pt-2 border-t border-[#30363d]/60 space-y-2"
          data-testid="gemini-enterprise-publish-section"
        >
          <label className="flex items-start gap-2 cursor-pointer text-xs text-white font-medium">
            <input
              type="checkbox"
              data-testid="checkbox-publish-gemini-enterprise"
              checked={value.publishToGeminiEnterprise}
              onChange={(e) =>
                onChange({
                  ...value,
                  publishToGeminiEnterprise: e.target.checked,
                })
              }
              className="mt-0.5 rounded bg-[#161b22] border-[#30363d] text-emerald-500 focus:ring-0 cursor-pointer"
            />
            <div className="flex-1">
              <span className="flex items-center gap-1.5 text-[11px] text-white font-medium">
                <Building2 className="w-3.5 h-3.5 text-purple-400" />
                <span>Publish to Gemini Enterprise App</span>
              </span>
              <span className="block text-[10px] text-gray-400">
                Registers this conversational agent in Discovery Engine so business users can invoke it in Gemini Enterprise.
              </span>
            </div>
          </label>

          {value.publishToGeminiEnterprise && (
            <div className="pl-5 space-y-2">
              {/* Target Gemini Enterprise App Selector */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label
                    htmlFor="gemini-enterprise-app-select"
                    className="text-[11px] text-gray-300 font-medium"
                  >
                    Gemini Enterprise App (Engine ID)
                  </label>
                  <button
                    type="button"
                    onClick={handleRefreshGeminiApps}
                    title="Refresh Gemini Enterprise Apps"
                    className="text-[10px] text-gray-400 hover:text-white flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className={`w-3 h-3 ${loadingApps ? 'animate-spin' : ''}`} />
                    <span>Refresh</span>
                  </button>
                </div>
                <select
                  id="gemini-enterprise-app-select"
                  data-testid="select-gemini-enterprise-app"
                  disabled={geminiApps.length === 0}
                  value={value.geminiEnterpriseAppId || DEFAULT_GEMINI_ENTERPRISE_APP_ID}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      geminiEnterpriseAppId: e.target.value,
                    })
                  }
                  className="w-full bg-[#161b22] border border-[#30363d] text-xs text-white rounded px-2.5 py-1.5 focus:outline-none focus:border-emerald-500 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {geminiApps.length === 0 ? (
                    <option value="">
                      {loadingApps
                        ? 'Loading Gemini Enterprise Apps...'
                        : 'No Gemini Enterprise Apps found in project'}
                    </option>
                  ) : (
                    geminiApps.map((app) => (
                      <option key={app.engineId} value={app.engineId}>
                        {app.displayName} ({app.engineId})
                      </option>
                    ))
                  )}
                </select>
                {!loadingApps && geminiApps.length === 0 && (
                  <p className="mt-1 text-[10px] text-amber-300/90 flex items-center justify-between gap-2">
                    <span>No Gemini Enterprise Apps found in this project/location.</span>
                    <a
                      href={`https://console.cloud.google.com/gen-app-builder/engines${projectId ? `?project=${projectId}` : ''}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-purple-300 hover:underline inline-flex items-center gap-0.5 shrink-0"
                    >
                      <span>Create App</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </p>
                )}
              </div>

              {/* Discovery Engine Multi-Region Location */}
              <div>
                <label
                  htmlFor="gemini-enterprise-location-select"
                  className="text-[11px] text-gray-300 block mb-1 font-medium"
                >
                  Discovery Engine Location
                </label>
                <select
                  id="gemini-enterprise-location-select"
                  data-testid="select-gemini-enterprise-location"
                  value={value.geminiEnterpriseLocation || 'global'}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      geminiEnterpriseLocation: e.target.value as 'global' | 'us' | 'eu',
                    })
                  }
                  className="w-full bg-[#161b22] border border-[#30363d] text-xs text-white rounded px-2.5 py-1.5 focus:outline-none focus:border-emerald-500 cursor-pointer"
                >
                  <option value="global">global (Multi-Region Default)</option>
                  <option value="us">us (United States Multi-Region)</option>
                  <option value="eu">eu (European Union Multi-Region)</option>
                </select>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Section 5: Post-Deploy Governance & Evaluation Gate Status Summary */}
      {metadata &&
        (metadata.agent_registry_id ||
          metadata.agent_registry_resource ||
          metadata.eval_gate_status === 'warning' ||
          metadata.gemini_enterprise_url ||
          metadata.gemini_enterprise_console_url) && (
          <div
            className="pt-2 border-t border-[#30363d] space-y-2"
            data-testid="post-deploy-governance-summary"
          >
            {metadata.eval_gate_status === 'warning' && (
              <div
                className="p-2.5 bg-amber-950/40 border border-amber-500/40 rounded text-xs text-amber-200 space-y-1"
                data-testid="eval-warning-banner"
              >
                <div className="flex items-center justify-between font-semibold text-amber-300">
                  <span className="flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>Succeeded with Evaluation Warnings</span>
                  </span>
                  {(metadata.eval_experiment_url || metadata.eval_task_experiment_url) && (
                    <a
                      href={metadata.eval_experiment_url || metadata.eval_task_experiment_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[10px] text-amber-300 hover:underline flex items-center gap-1"
                    >
                      <span>Evaluation Experiment</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
                {(metadata.eval_failed_cases || metadata.eval_warnings) &&
                  (metadata.eval_failed_cases || metadata.eval_warnings)!.length > 0 && (
                    <p className="text-[10px] text-amber-200/90">
                      Failed threshold cases:{' '}
                      {(metadata.eval_failed_cases || metadata.eval_warnings)!.join(', ')}
                    </p>
                  )}
                {metadata.gemini_enterprise_blocked_by_eval && (
                  <p
                    className="text-[10px] font-semibold text-rose-300"
                    data-testid="gemini-publish-blocked-notice"
                  >
                    Publishing to Gemini Enterprise App was blocked due to evaluation gate failures.
                  </p>
                )}
              </div>
            )}

            {(metadata.gemini_enterprise_url || metadata.gemini_enterprise_console_url) &&
              !metadata.gemini_enterprise_blocked_by_eval && (
                <div
                  className="p-2 bg-purple-950/30 border border-purple-500/30 rounded flex items-center justify-between text-xs"
                  data-testid="gemini-enterprise-published-badge"
                >
                  <span className="flex items-center gap-1.5 text-purple-200 font-medium text-[11px]">
                    <Sparkles className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                    <span>
                      Published to Gemini Enterprise (
                      {metadata.gemini_enterprise_app_id ||
                        value.geminiEnterpriseAppId ||
                        DEFAULT_GEMINI_ENTERPRISE_APP_ID}
                      )
                    </span>
                  </span>
                  <a
                    href={metadata.gemini_enterprise_url || metadata.gemini_enterprise_console_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-purple-300 hover:text-purple-200 flex items-center gap-1 font-medium"
                  >
                    <span>Open in Gemini Enterprise</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
          </div>
        )}
    </div>
  );
};
