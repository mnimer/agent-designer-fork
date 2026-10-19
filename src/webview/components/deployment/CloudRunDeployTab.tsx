/**
 * CloudRunDeployTab
 *
 * Dedicated webview component for Google Cloud Run (v2 service) deployment,
 * configuration, and real-time log monitoring.
 *
 * Job in Application:
 * Provides an interactive UI for developers to configure GCP parameters (Project ID, Region,
 * Service Name, CPU/Memory, Auto-scaling, Public Access, PSC Network Attachment), trigger container builds
 * and deployments to Google Cloud Run, and monitor live terminal logs. Developers can test the agent
 * via the Interactive Chat or Test Suite tabs.
 *
 * Architectural Decisions:
 * 1. Unified Deployment Experience: Aligns with Agent Engine deployment tab pattern, providing a
 *    single consolidated view for service configuration, container builds, deployments, and live log
 *    streaming. Terraform IaC is generated during the primary code generation pass.
 * 2. Automated Secret Detection: Automatically extracts runtime secrets (e.g. GEMINI_API_KEY, tool tokens,
 *    database URLs) from canvas nodes and maps them into Secret Manager resources with zero manual config.
 * 3. Decoupled Container Architecture: Aligns with Google ADK patterns; Terraform manages infrastructure
 *    while Cloud Build / gcloud run deploy handles fast container updates.
 * 4. Real-Time Streaming Terminal: Displays live stdout/stderr streams from Cloud Build and Cloud Run with
 *    color-coded log levels, status badges, and auto-scroll capability.
 * 5. 8pt Grid Adherence: Strictly follows the 8pt grid system for spacing (multiples of 8px) with Tailwind CSS.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Rocket,
  RefreshCw,
  Terminal,
  ExternalLink,
  Copy,
  Check,
  AlertCircle,
  CheckCircle2,
  Key,
  Shield,
  Square,
  Globe,
  Sliders,
  Server,
  Layers,
} from 'lucide-react';
import { AgentWorkflowDocument } from '../../../shared/types';
import { GeneratedFile, AgentGovernanceConfig } from '../../types';
import { useWebviewBridge } from '../../hooks/useWebviewBridge';
import { CloudRunDeploymentMetadataRecord } from '../../../extension/CloudRunDeployer';
import { extractRuntimeSecrets } from '../../utils/runtimeSecrets';
import { validateWorkflowMemory } from '../../../shared/memoryValidation';
import {
  GovernanceStatusCard,
  createDefaultGovernanceConfig,
} from './GovernanceStatusCard';

export interface CloudRunDeployTabProps {
  document?: AgentWorkflowDocument;
  generatedFiles?: GeneratedFile[];
  secrets?: Record<string, string>;
  onSecretChange?: (key: string, value: string) => void;
  targetDirectory?: string;
  onTargetDirectoryChange?: (targetDirectory: string) => void;
  sharedProjectId?: string;
  onProjectIdChange?: (projectId: string) => void;
}

export const CloudRunDeployTab: React.FC<CloudRunDeployTabProps> = ({
  document: workflowDoc,
  secrets = {},
  onSecretChange,
  targetDirectory,
  sharedProjectId,
  onProjectIdChange,
}) => {
  const bridge = useWebviewBridge();
  const currentFolder = targetDirectory || './agent_app/';

  // GCP Target Parameters
  const [projectId, setProjectId] = useState<string>(() => {
    return (
      sharedProjectId ||
      workflowDoc?.metadata?.settings?.customFields?.gcpProjectId ||
      (typeof localStorage !== 'undefined' ? localStorage.getItem('vad_gcp_project_id') : null) ||
      ''
    );
  });

  const [region, setRegion] = useState<string>(() => {
    return workflowDoc?.metadata?.settings?.customFields?.gcpRegion || 'us-central1';
  });

  const [serviceName, setServiceName] = useState<string>(() => {
    const raw = workflowDoc?.name || 'agent-service';
    return raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'agent-service';
  });

  const [cpu, setCpu] = useState<string>('1');
  const [memory, setMemory] = useState<string>('2Gi');
  const [minInstances, setMinInstances] = useState<number>(0);
  const [maxInstances, setMaxInstances] = useState<number>(10);
  const [concurrency, setConcurrency] = useState<number>(80);
  const [allowUnauthenticated, setAllowUnauthenticated] = useState<boolean>(false);
  const [networkAttachment, setNetworkAttachment] = useState<string>('');
  const [governance, setGovernance] = useState<AgentGovernanceConfig>(() =>
    createDefaultGovernanceConfig(workflowDoc)
  );

  // Deployment Lifecycle State
  const [deployStatus, setDeployStatus] = useState<
    'idle' | 'packaging' | 'building' | 'deploying' | 'success' | 'error'
  >('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [logs, setLogs] = useState<Array<{ text: string; stream: string; timestamp: string }>>([]);
  const [deploymentMetadata, setDeploymentMetadata] = useState<CloudRunDeploymentMetadataRecord | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const logsEndRef = useRef<HTMLDivElement>(null);

  // Extract runtime secrets from canvas nodes
  const detectedSecrets = useMemo(() => {
    return extractRuntimeSecrets((workflowDoc?.nodes as any) || []);
  }, [workflowDoc?.nodes]);

  // Validate agent session memory checkpointer configuration
  const memoryValidation = useMemo(() => {
    return validateWorkflowMemory(workflowDoc);
  }, [workflowDoc]);

  // Sync Project ID updates with shared props and localStorage
  const handleProjectIdChange = (val: string) => {
    setProjectId(val);
    if (onProjectIdChange) {
      onProjectIdChange(val);
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('vad_gcp_project_id', val);
    }
  };

  // Request initial deployment status on mount
  useEffect(() => {
    if (bridge) {
      bridge.postMessage({
        type: 'GET_CLOUD_RUN_STATUS',
        payload: { targetDirectory: currentFolder },
      });
    }
  }, [bridge, currentFolder]);

  // Listen for deployment events from Extension Host
  useEffect(() => {
    if (!bridge) return;

    const unsubLog = bridge.onMessage('CLOUD_RUN_DEPLOY_LOG', (payload: any) => {
      setLogs((prev) => [
        ...prev,
        {
          text: payload.text,
          stream: payload.stream || 'stdout',
          timestamp: payload.timestamp || new Date().toISOString(),
        },
      ]);
    });

    const unsubStatus = bridge.onMessage('CLOUD_RUN_DEPLOY_STATUS', (payload: any) => {
      setDeployStatus(payload.status);
      if (payload.error) {
        setErrorMessage(payload.error);
      }
      if (payload.logs && Array.isArray(payload.logs)) {
        setLogs(
          payload.logs.map((l: string) => ({
            text: l,
            stream: 'stdout',
            timestamp: new Date().toISOString(),
          }))
        );
      }
      if (payload.metadata) {
        setDeploymentMetadata(payload.metadata);
      }
    });

    return () => {
      unsubLog();
      unsubStatus();
    };
  }, [bridge]);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Action: Trigger Cloud Run Deployment
  const handleDeploy = () => {
    if (!projectId.trim()) {
      setErrorMessage('Please provide a Google Cloud Project ID.');
      return;
    }

    if (!memoryValidation.isValid) {
      setErrorMessage(`Cannot deploy: ${memoryValidation.errors.join(' ')}`);
      return;
    }

    setErrorMessage(null);
    setDeployStatus('building');
    setLogs([]);

    if (bridge) {
      bridge.postMessage({
        type: 'DEPLOY_TO_CLOUD_RUN',
        payload: {
          document: workflowDoc,
          targetDirectory: currentFolder,
          projectId: projectId.trim(),
          region: region.trim(),
          serviceName: serviceName.trim(),
          cpu,
          memory,
          minInstances,
          maxInstances,
          concurrency,
          allowUnauthenticated,
          networkAttachment: networkAttachment.trim() || undefined,
          envVars: secrets,
          governance,
        },
      });
    }
  };

  // Action: Cancel ongoing deployment
  const handleCancel = () => {
    if (bridge) {
      bridge.postMessage({
        type: 'CANCEL_CLOUD_RUN_DEPLOY',
        payload: { targetDirectory: currentFolder },
      });
    }
    setDeployStatus('idle');
  };

  const copyToClipboard = (text: string, key: string) => {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    }
  };

  const isDeploying = deployStatus === 'packaging' || deployStatus === 'building' || deployStatus === 'deploying';

  return (
    <div className="flex flex-col h-full bg-[#0d1117] text-[#c9d1d9] overflow-hidden select-none font-sans">
      {/* Top Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-[#30363d] bg-[#161b22]">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#388bfd]/10 text-[#58a6ff]">
            <Server className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              Google Cloud Run & Shared GCP Resources
              <span className="text-[10px] font-normal px-2 py-0.5 rounded-full bg-[#1f6feb]/20 text-[#58a6ff] border border-[#1f6feb]/30">
                v2 Service
              </span>
            </h2>
            <p className="text-xs text-[#8b949e]">
              Deploy containerized agent runtimes with Cloud Build & Terraform IaC
            </p>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Left Column: Configuration Drawer */}
        <div className="w-full md:w-[380px] border-r border-[#30363d] bg-[#161b22] flex flex-col overflow-y-auto p-4 gap-4">
          {/* Target Folder Confirmation */}
          <div className="p-3 bg-[#0d1117] rounded-lg border border-[#30363d]">
            <div className="flex items-center justify-between text-xs text-[#8b949e] mb-1">
              <span>Agent Source Directory</span>
              <span className="font-mono text-[11px] text-[#58a6ff]">{currentFolder}</span>
            </div>
          </div>

          {/* GCP Target Configuration */}
          <div className="flex flex-col gap-3">
            <h3 className="text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-2">
              <Sliders className="w-3.5 h-3.5 text-[#58a6ff]" />
              Service Parameters
            </h3>

            {/* Project ID */}
            <div>
              <label className="block text-xs font-medium text-[#c9d1d9] mb-1">
                GCP Project ID <span className="text-[#f85149]">*</span>
              </label>
              <input
                type="text"
                value={projectId}
                onChange={(e) => handleProjectIdChange(e.target.value)}
                placeholder="my-agent-project-123"
                className="w-full px-3 py-1.5 bg-[#0d1117] border border-[#30363d] rounded-md text-xs text-white placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff]"
              />
            </div>

            {/* Region */}
            <div>
              <label className="block text-xs font-medium text-[#c9d1d9] mb-1">
                Region <span className="text-[#f85149]">*</span>
              </label>
              <select
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="w-full px-3 py-1.5 bg-[#0d1117] border border-[#30363d] rounded-md text-xs text-white focus:outline-none focus:border-[#58a6ff]"
              >
                <option value="us-central1">us-central1 (Iowa)</option>
                <option value="us-east1">us-east1 (S. Carolina)</option>
                <option value="us-west1">us-west1 (Oregon)</option>
                <option value="europe-west1">europe-west1 (Belgium)</option>
                <option value="asia-northeast1">asia-northeast1 (Tokyo)</option>
              </select>
            </div>

            {/* Service Name */}
            <div>
              <label className="block text-xs font-medium text-[#c9d1d9] mb-1">Service Name</label>
              <input
                type="text"
                value={serviceName}
                onChange={(e) => setServiceName(e.target.value)}
                placeholder="agent-service"
                className="w-full px-3 py-1.5 bg-[#0d1117] border border-[#30363d] rounded-md text-xs text-white placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff]"
              />
            </div>

            {/* Resources: CPU & Memory */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-[#c9d1d9] mb-1">CPU Cores</label>
                <select
                  value={cpu}
                  onChange={(e) => setCpu(e.target.value)}
                  className="w-full px-2 py-1.5 bg-[#0d1117] border border-[#30363d] rounded-md text-xs text-white focus:outline-none focus:border-[#58a6ff]"
                >
                  <option value="1">1 CPU</option>
                  <option value="2">2 CPU</option>
                  <option value="4">4 CPU</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#c9d1d9] mb-1">Memory</label>
                <select
                  value={memory}
                  onChange={(e) => setMemory(e.target.value)}
                  className="w-full px-2 py-1.5 bg-[#0d1117] border border-[#30363d] rounded-md text-xs text-white focus:outline-none focus:border-[#58a6ff]"
                >
                  <option value="512Mi">512 MiB</option>
                  <option value="1Gi">1 GiB</option>
                  <option value="2Gi">2 GiB</option>
                  <option value="4Gi">4 GiB</option>
                  <option value="8Gi">8 GiB</option>
                </select>
              </div>
            </div>

            {/* Auto-scaling: Min / Max Instances */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-[#c9d1d9] mb-1">Min Instances</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={minInstances}
                  onChange={(e) => setMinInstances(parseInt(e.target.value) || 0)}
                  className="w-full px-2 py-1.5 bg-[#0d1117] border border-[#30363d] rounded-md text-xs text-white focus:outline-none focus:border-[#58a6ff]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#c9d1d9] mb-1">Max Instances</label>
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={maxInstances}
                  onChange={(e) => setMaxInstances(parseInt(e.target.value) || 10)}
                  className="w-full px-2 py-1.5 bg-[#0d1117] border border-[#30363d] rounded-md text-xs text-white focus:outline-none focus:border-[#58a6ff]"
                />
              </div>
            </div>

            {/* Public Access Toggle */}
            <div className="flex items-center justify-between p-2.5 bg-[#0d1117] rounded-md border border-[#30363d]">
              <div>
                <span className="text-xs font-medium text-white block">Allow Public Access</span>
                <span className="text-[11px] text-[#8b949e]">Grants roles/run.invoker to allUsers</span>
              </div>
              <input
                type="checkbox"
                checked={allowUnauthenticated}
                onChange={(e) => setAllowUnauthenticated(e.target.checked)}
                className="w-4 h-4 rounded text-[#1f6feb] bg-[#161b22] border-[#30363d] focus:ring-0 cursor-pointer"
              />
            </div>

            {/* Optional PSC Network Attachment */}
            <div>
              <label className="block text-xs font-medium text-[#c9d1d9] mb-1">
                VPC / PSC Network Attachment <span className="text-[10px] text-[#8b949e]">(Optional)</span>
              </label>
              <input
                type="text"
                value={networkAttachment}
                onChange={(e) => setNetworkAttachment(e.target.value)}
                placeholder="projects/my-prj/regions/us-central1/networkAttachments/my-attachment"
                className="w-full px-3 py-1.5 bg-[#0d1117] border border-[#30363d] rounded-md text-xs text-white placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff]"
              />
            </div>
          </div>

          {/* Enterprise Agent Governance & Gemini Enterprise Publishing Card */}
          <GovernanceStatusCard
            document={workflowDoc}
            projectId={projectId}
            region={region}
            value={governance}
            onChange={setGovernance}
            metadata={deploymentMetadata}
          />

          {/* Runtime Secrets Card */}
          {detectedSecrets.length > 0 && (
            <div className="flex flex-col gap-2 pt-2 border-t border-[#30363d]">
              <h3 className="text-xs font-semibold text-white uppercase tracking-wider flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-[#e3b341]" />
                  Runtime Secrets ({detectedSecrets.length})
                </span>
                <span className="text-[10px] lowercase text-[#8b949e]">Secret Manager</span>
              </h3>
              <div className="flex flex-col gap-2 max-h-40 overflow-y-auto">
                {detectedSecrets.map((sec) => (
                  <div key={sec.id} className="p-2 bg-[#0d1117] border border-[#30363d] rounded">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-[11px] text-[#58a6ff]">{sec.name}</span>
                      <span className="text-[10px] text-[#8b949e]">{sec.sourceNode}</span>
                    </div>
                    <input
                      type="password"
                      value={secrets[sec.name] || ''}
                      onChange={(e) => onSecretChange?.(sec.name, e.target.value)}
                      placeholder={sec.placeholder || 'Value for Secret Manager'}
                      className="w-full px-2 py-1 bg-[#161b22] border border-[#30363d] rounded text-[11px] text-white focus:outline-none focus:border-[#58a6ff]"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="mt-auto pt-4 flex flex-col gap-2">
            {!memoryValidation.isValid && (
              <div className="p-2.5 bg-[#f85149]/10 border border-[#f85149]/30 rounded text-xs text-[#f85149] flex flex-col gap-1">
                <div className="flex items-center gap-1.5 font-semibold">
                  <AlertCircle className="w-4 h-4 shrink-0 text-[#f85149]" />
                  <span>Session Memory Configuration Required</span>
                </div>
                {memoryValidation.errors.map((err, idx) => (
                  <p key={idx} className="text-[11px] leading-tight text-gray-300 ml-5">
                    • {err}
                  </p>
                ))}
              </div>
            )}

            {memoryValidation.warnings.length > 0 && memoryValidation.isValid && (
              <div className="p-2.5 bg-[#d29922]/10 border border-[#d29922]/30 rounded text-xs text-[#d29922] flex flex-col gap-1">
                <div className="flex items-center gap-1.5 font-semibold">
                  <AlertCircle className="w-4 h-4 shrink-0 text-[#d29922]" />
                  <span>Memory Configuration Notice</span>
                </div>
                {memoryValidation.warnings.map((warn, idx) => (
                  <p key={idx} className="text-[11px] leading-tight text-gray-300 ml-5">
                    • {warn}
                  </p>
                ))}
              </div>
            )}

            {isDeploying ? (
              <button
                onClick={handleCancel}
                className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-md bg-[#da3633] text-white text-xs font-medium hover:bg-[#b62324] transition-colors"
              >
                <Square className="w-3.5 h-3.5" />
                Cancel Deployment
              </button>
            ) : (
              <button
                onClick={handleDeploy}
                disabled={!memoryValidation.isValid}
                title={!memoryValidation.isValid ? memoryValidation.errors.join(' ') : undefined}
                className={`w-full flex items-center justify-center gap-2 py-2 px-4 rounded-md text-white text-xs font-medium transition-colors shadow-sm ${
                  !memoryValidation.isValid
                    ? 'bg-gray-700 opacity-50 cursor-not-allowed'
                    : 'bg-[#238636] hover:bg-[#2ea043] cursor-pointer'
                }`}
              >
                <Rocket className="w-3.5 h-3.5" />
                Deploy to Cloud Run
              </button>
            )}

            {errorMessage && (
              <div className="p-2.5 bg-[#f85149]/10 border border-[#f85149]/30 rounded text-xs text-[#f85149] flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Terminal, Status & Remote Test Console */}
        <div className="flex-1 flex flex-col bg-[#0d1117] overflow-hidden">
          {/* Active Endpoint Card */}
          {deploymentMetadata?.service_url && (
            <div className="p-4 m-4 mb-2 bg-[#161b22] border border-[#388bfd]/30 rounded-lg flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#3fb950]" />
                  <span className="text-xs font-semibold text-white">Active Cloud Run Service</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#238636]/20 text-[#3fb950] border border-[#238636]/30">
                    Live
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => copyToClipboard(deploymentMetadata.service_url!, 'service_url')}
                    className="flex items-center gap-1 text-[11px] text-[#58a6ff] hover:underline"
                  >
                    {copiedKey === 'service_url' ? (
                      <Check className="w-3 h-3 text-[#3fb950]" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                    Copy URL
                  </button>
                  <a
                    href={deploymentMetadata.service_url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-[11px] text-[#58a6ff] hover:underline"
                  >
                    Open <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>

              <div className="font-mono text-xs text-[#58a6ff] bg-[#0d1117] p-2 rounded border border-[#30363d] break-all">
                {deploymentMetadata.service_url}
              </div>

              {/* cURL snippet */}
              <div className="mt-1 flex items-center justify-between p-2 bg-[#0d1117] rounded border border-[#30363d]">
                <code className="text-[10px] font-mono text-[#8b949e] truncate flex-1">
                  curl -X POST {deploymentMetadata.service_url}/run_sse -H &quot;Content-Type: application/json&quot; -d &apos;{JSON.stringify({ message: "Hello" })}&apos;
                </code>
                <button
                  onClick={() =>
                    copyToClipboard(
                      `curl -X POST ${deploymentMetadata.service_url}/run_sse -H "Content-Type: application/json" -d '{"message":"Hello"}'`,
                      'curl'
                    )
                  }
                  className="ml-2 text-[#8b949e] hover:text-white p-1"
                >
                  {copiedKey === 'curl' ? (
                    <Check className="w-3.5 h-3.5 text-[#3fb950]" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Terminal View */}
          <div className="flex-1 flex flex-col m-4 mt-0 bg-[#090d13] border border-[#30363d] rounded-lg overflow-hidden">
            <div className="px-3 py-2 bg-[#161b22] border-b border-[#30363d] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="w-3.5 h-3.5 text-[#58a6ff]" />
                <span className="text-xs font-medium text-white">Deployment Log Stream</span>
                {isDeploying && (
                  <span className="flex items-center gap-1 text-[11px] text-[#e3b341]">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    {deployStatus}...
                  </span>
                )}
              </div>
              <button
                onClick={() => setLogs([])}
                className="text-[11px] text-[#8b949e] hover:text-[#c9d1d9]"
              >
                Clear Logs
              </button>
            </div>

            <div className="flex-1 p-3 overflow-y-auto font-mono text-[11px] leading-relaxed text-[#c9d1d9] space-y-1">
              {logs.length === 0 ? (
                <div className="text-[#8b949e] italic py-4 text-center">
                  Ready to build and deploy. Terminal logs from Cloud Build and Cloud Run will stream here in real time.
                </div>
              ) : (
                logs.map((log, idx) => (
                  <div
                    key={idx}
                    className={`whitespace-pre-wrap break-all ${
                      log.stream === 'stderr'
                        ? 'text-[#f85149]'
                        : log.stream === 'system'
                        ? 'text-[#58a6ff]'
                        : 'text-[#c9d1d9]'
                    }`}
                  >
                    {log.text}
                  </div>
                ))
              )}
              <div ref={logsEndRef} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
