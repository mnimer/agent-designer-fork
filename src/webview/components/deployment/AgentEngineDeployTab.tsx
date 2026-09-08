/**
 * AgentEngineDeployTab
 *
 * Dedicated webview component for Vertex AI Agent Engine (Agent Runtime) deployment,
 * configuration, real-time log monitoring, and live remote execution testing.
 *
 * Job in Application:
 * Provides an interactive UI for developers to configure GCP parameters (Project, Region,
 * Service Account, Network Attachment), deploy containers to Vertex AI Agent Runtime via ADK,
 * stream Cloud Build and runtime provisioning logs, view deployment metadata, and interact
 * directly with the live remote agent using the /api/run_sse HTTP passthrough.
 *
 * Architectural Decisions:
 * 1. Global Region Default: Defaults the deployment location to 'global' per Google Cloud
 *    Agent Engine best practices and workspace conventions, with selectable regional endpoints.
 * 2. In-Place Lifecycle Awareness: Displays existing deployment metadata (resource ID, timestamp)
 *    and enables safe in-place container updates or explicit new instance provisioning.
 * 3. Unified Terminal Telemetry: Integrates real-time streaming logs from `AGENT_ENGINE_DEPLOY_LOG`
 *    messages sent over WebviewBridge.
 * 4. Live Passthrough Testing: Includes an interactive testing console directly below the deployment
 *    summary to verify agent reasoning against the remote `/api/run_sse` passthrough without leaving the IDE.
 * 5. Strict 8pt Grid Layout: Adheres to multiples of 8px (p-2, p-4, gap-2, gap-4) and Tailwind CSS styling.
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
  Send,
  Key,
  Shield,
  Square,
  Globe,
  Sliders,
  Sparkles,
  Server,
  Layers,
  HelpCircle,
} from 'lucide-react';
import { AgentWorkflowDocument } from '../../../shared/types';
import { GeneratedFile } from '../../types';
import { useWebviewBridge } from '../../hooks/useWebviewBridge';
import { DeploymentMetadataRecord } from '../../../extension/AgentEngineDeployer';
import { validateTargetFolder } from '../../../shared/folderValidation';

export interface AgentEngineDeployTabProps {
  document?: AgentWorkflowDocument;
  generatedFiles?: GeneratedFile[];
  secrets?: Record<string, string>;
  onSecretChange?: (key: string, value: string) => void;
  targetDirectory?: string;
  onTargetDirectoryChange?: (targetDirectory: string) => void;
  sharedProjectId?: string;
  onProjectIdChange?: (projectId: string) => void;
}

export const AgentEngineDeployTab: React.FC<AgentEngineDeployTabProps> = ({
  document: workflowDoc,
  generatedFiles = [],
  secrets = {},
  onSecretChange,
  targetDirectory,
  onTargetDirectoryChange,
  sharedProjectId,
  onProjectIdChange,
}) => {
  const bridge = useWebviewBridge();

  // Target Agent Folder & Validation (Configured in Code Generation tab)
  const currentFolder = targetDirectory || './agent_app/';

  const folderValidation = useMemo(() => {
    return validateTargetFolder(currentFolder);
  }, [currentFolder]);

  // GCP Target Parameters - Sync with shared state, doc metadata, or localStorage
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
  const [serviceAccount, setServiceAccount] = useState<string>('');
  const [networkAttachment, setNetworkAttachment] = useState<string>('');
  const [stagingBucket, setStagingBucket] = useState<string>('');
  const [forceNew, setForceNew] = useState<boolean>(false);
  const [agentEngineId, setAgentEngineId] = useState<string>(() => {
    return (
      (workflowDoc as any)?.deployment?.deployedResourceId ||
      ''
    );
  });

  // Sync when sharedProjectId changes externally
  useEffect(() => {
    if (sharedProjectId && sharedProjectId !== projectId) {
      setProjectId(sharedProjectId);
    }
  }, [sharedProjectId]);

  // Sync agentEngineId with document metadata
  useEffect(() => {
    const docEngineId = (workflowDoc as any)?.deployment?.deployedResourceId;
    if (docEngineId && !agentEngineId) {
      setAgentEngineId(docEngineId);
    }
  }, [(workflowDoc as any)?.deployment?.deployedResourceId]);

  const handleProjectIdChange = (val: string) => {
    setProjectId(val);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('vad_gcp_project_id', val);
      }
    } catch {}
    if (onProjectIdChange) {
      onProjectIdChange(val);
    }
  };

  // Deployment Lifecycle State
  const [deployStatus, setDeployStatus] = useState<
    'idle' | 'packaging' | 'building' | 'deploying' | 'success' | 'error'
  >('idle');
  const [metadata, setMetadata] = useState<DeploymentMetadataRecord | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [logs, setLogs] = useState<Array<{ text: string; stream: string; timestamp: string }>>([]);

  // Copy Feedback
  const [copiedUrl, setCopiedUrl] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<boolean>(false);

  // Remote Testing Console State
  const [testQuery, setTestQuery] = useState<string>('Hello! What tools can you use?');
  const [testResponse, setTestResponse] = useState<string | null>(null);
  const [testDuration, setTestDuration] = useState<number | null>(null);
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [testError, setTestError] = useState<string | null>(null);

  const logsEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Request initial deployment status on mount or folder change
  useEffect(() => {
    if (bridge) {
      bridge.postMessage({
        type: 'GET_AGENT_ENGINE_STATUS',
        payload: { targetDirectory: currentFolder },
      });
    }
  }, [bridge, currentFolder]);

  // Subscribe to bridge events
  useEffect(() => {
    if (!bridge) return;

    // Handle incoming deploy log lines
    const unsubLog = bridge.subscribe('AGENT_ENGINE_DEPLOY_LOG', (payload) => {
      setLogs((prev) => [
        ...prev,
        {
          text: payload.text,
          stream: payload.stream,
          timestamp: payload.timestamp || new Date().toISOString(),
        },
      ]);
    });

    // Handle overall deployment status updates and replay buffered logs
    const unsubStatus = bridge.subscribe('AGENT_ENGINE_DEPLOY_STATUS', (payload) => {
      setDeployStatus(payload.status);
      if (payload.error) {
        setErrorMessage(payload.error);
      }
      if (payload.metadata) {
        setMetadata(payload.metadata);
        if (payload.metadata.remote_agent_runtime_id) {
          setAgentEngineId(payload.metadata.remote_agent_runtime_id);
        }
      } else if (payload.remoteRuntimeId) {
        setAgentEngineId(payload.remoteRuntimeId);
      }
      if (payload.logs && Array.isArray(payload.logs) && payload.logs.length > 0) {
        setLogs(
          payload.logs.map((item: any) =>
            typeof item === 'string'
              ? { text: item, stream: 'stdout', timestamp: new Date().toISOString() }
              : item
          )
        );
      }
    });

    // Handle remote test results
    const unsubTest = bridge.subscribe('AGENT_ENGINE_TEST_RESULT', (payload) => {
      setIsTesting(false);
      if (payload.success) {
        if (!payload.response || payload.response.trim().length === 0) {
          setTestError('Remote Reasoning Engine completed but returned an empty response body.');
          setTestResponse(null);
        } else {
          setTestResponse(payload.response);
          setTestError(null);
        }
        setTestDuration(payload.durationMs);
      } else {
        setTestError(payload.error || 'Failed to query remote agent');
        setTestDuration(payload.durationMs);
      }
    });

    return () => {
      unsubLog();
      unsubStatus();
      unsubTest();
    };
  }, [bridge]);

  const isProjectIdValid = Boolean(projectId && projectId.trim());

  /**
   * Initiates deployment or update to Vertex AI Agent Engine.
   *
   * Validates required parameters (GCP Project ID and valid Python module folder)
   * before dispatching the DEPLOY_TO_AGENT_ENGINE message to the extension host.
   */
  const handleDeploy = () => {
    if (!bridge) return;

    // Validate GCP Project ID requirement
    if (!isProjectIdValid) {
      setErrorMessage('GCP Project ID is required before initiating deployment.');
      return;
    }

    // Validate Python identifier folder name requirement
    if (!folderValidation.isValid) {
      setErrorMessage(
        folderValidation.error ||
          `Target folder '${folderValidation.folderBase}' is not a valid Python identifier. Vertex AI Agent Engine requires the agent directory to be a valid Python module name.`
      );
      return;
    }

    setErrorMessage(null);
    setDeployStatus('building');
    setLogs([]);

    bridge.postMessage({
      type: 'DEPLOY_TO_AGENT_ENGINE',
      payload: {
        document: workflowDoc,
        targetDirectory: currentFolder,
        projectId: projectId.trim(),
        region,
        serviceAccount: serviceAccount.trim() || undefined,
        networkAttachment: networkAttachment.trim() || undefined,
        stagingBucket: stagingBucket.trim() || undefined,
        forceNew,
        agentEngineId: agentEngineId.trim() || undefined,
        envVars: secrets,
      },
    });
  };

  /**
   * Cancels any active in-flight deployment.
   */
  const handleCancelDeploy = () => {
    if (!bridge) return;
    bridge.postMessage({
      type: 'CANCEL_AGENT_ENGINE_DEPLOY',
      payload: { targetDirectory: currentFolder },
    });
  };

  /**
   * Sends a test query to the remote deployed Agent Runtime.
   */
  const handleSendTestQuery = () => {
    if (!bridge || !testQuery.trim() || isTesting) return;

    setIsTesting(true);
    setTestError(null);
    setTestResponse(null);

    bridge.postMessage({
      type: 'TEST_REMOTE_AGENT_ENGINE',
      payload: {
        targetDirectory: currentFolder,
        query: testQuery,
        remoteRuntimeId: metadata?.remote_agent_runtime_id,
        serviceUrl: metadata?.service_url,
        location: region,
        projectId,
      },
    });
  };

  /**
   * Copies string content to clipboard.
   */
  const handleCopy = (text: string, type: 'url' | 'id') => {
    navigator.clipboard.writeText(text);
    if (type === 'url') {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } else {
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    }
  };

  const isDeploying = deployStatus === 'building' || deployStatus === 'deploying' || deployStatus === 'packaging';
  const hasExistingDeployment = Boolean(metadata?.remote_agent_runtime_id);

  return (
    <div className="flex-1 flex gap-4 p-4 overflow-hidden bg-[#0d1117] min-h-0">
      {/* LEFT 1/3: Configuration & Trigger Actions */}
      <div className="w-1/3 min-w-[320px] max-w-[400px] bg-[#161b22] border border-[#30363d] rounded-xl p-4 shadow-xl flex flex-col min-h-0 overflow-hidden">
        <div className="flex-1 overflow-y-auto pr-1 space-y-4 min-h-0">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[#30363d] pb-2">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-white">
              <Server className="w-4 h-4 text-emerald-400" />
              <span>Vertex AI Agent Engine</span>
            </div>
            <span
              className={`text-[10px] px-2 py-0.5 rounded font-mono border ${
                deployStatus === 'success'
                  ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/40'
                  : isDeploying
                  ? 'bg-amber-950/40 text-amber-400 border-amber-500/40'
                  : 'bg-[#0d1117] text-gray-400 border-[#30363d]'
              }`}
            >
              {deployStatus === 'success' ? 'Active' : isDeploying ? 'Deploying' : 'Ready'}
            </span>
          </div>

          {/* Configuration Form */}
          <div className="space-y-3 p-3 bg-[#0d1117] rounded-lg border border-[#30363d]">
            <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400 flex items-center justify-between">
              <span>Cloud Infrastructure</span>
              <span className="text-[10px] font-mono text-emerald-400">Google Cloud</span>
            </div>

            {/* GCP Project ID */}
            <div>
              <label className="text-[11px] text-gray-300 block mb-1 font-medium">
                GCP Project ID <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                value={projectId}
                onChange={(e) => handleProjectIdChange(e.target.value)}
                placeholder="e.g. my-production-project"
                className={`w-full bg-[#161b22] border text-xs text-white rounded px-2.5 py-1.5 focus:outline-none font-mono ${
                  !isProjectIdValid
                    ? 'border-amber-500/60 focus:border-amber-500'
                    : 'border-[#30363d] focus:border-emerald-500'
                }`}
              />
              {!isProjectIdValid && (
                <div className="text-[10px] text-amber-400/90 mt-1">
                  GCP Project ID is required to deploy.
                </div>
              )}
            </div>

            {/* Region / Location */}
            <div>
              <label className="text-[11px] text-gray-300 block mb-1 font-medium">
                Location / Region (Regional)
              </label>
              <select
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="w-full bg-[#161b22] border border-[#30363d] text-xs text-white rounded px-2.5 py-1.5 focus:outline-none focus:border-emerald-500 cursor-pointer font-sans"
              >
                <option value="us-central1">us-central1 (Iowa - Recommended)</option>
                <option value="us-east4">us-east4 (N. Virginia)</option>
                <option value="us-west1">us-west1 (Oregon)</option>
                <option value="europe-west1">europe-west1 (Belgium)</option>
                <option value="europe-west4">europe-west4 (Netherlands)</option>
                <option value="asia-northeast1">asia-northeast1 (Tokyo)</option>
              </select>
            </div>

            {/* Service Account */}
            <div>
              <label className="text-[11px] text-gray-300 block mb-1 font-medium">
                Service Account (Optional)
              </label>
              <input
                type="text"
                value={serviceAccount}
                onChange={(e) => setServiceAccount(e.target.value)}
                placeholder="agent-sa@project.iam.gserviceaccount.com"
                className="w-full bg-[#161b22] border border-[#30363d] text-xs text-white rounded px-2.5 py-1.5 focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>

            {/* Network Attachment */}
            <div>
              <label className="text-[11px] text-gray-300 block mb-1 font-medium">
                Network Attachment (PSC, Optional)
              </label>
              <input
                type="text"
                value={networkAttachment}
                onChange={(e) => setNetworkAttachment(e.target.value)}
                placeholder="projects/proj/regions/reg/networkAttachments/name"
                className="w-full bg-[#161b22] border border-[#30363d] text-xs text-white rounded px-2.5 py-1.5 focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>

            {/* Reasoning Engine Resource ID */}
            <div>
              <label className="text-[11px] text-gray-300 block mb-1 font-medium">
                Reasoning Engine Resource ID (Optional)
              </label>
              <input
                type="text"
                value={agentEngineId}
                onChange={(e) => setAgentEngineId(e.target.value)}
                placeholder="projects/.../locations/.../reasoningEngines/... or ID"
                className="w-full bg-[#161b22] border border-[#30363d] text-xs text-white rounded px-2.5 py-1.5 focus:outline-none focus:border-emerald-500 font-mono"
              />
              <span className="text-[10px] text-gray-500 mt-1 block">
                Existing instance to update in place. Auto-detected from deployment history or agent name.
              </span>
            </div>

            {/* Existing Deployment Override Option */}
            <div className="pt-2 border-t border-[#30363d]/60">
              <label className="flex items-center gap-2 cursor-pointer text-[11px] text-amber-300">
                <input
                  type="checkbox"
                  checked={forceNew}
                  onChange={(e) => setForceNew(e.target.checked)}
                  className="rounded bg-[#161b22] border-[#30363d] text-emerald-500 focus:ring-0"
                />
                <span>Provision new instance (ignore existing ID and create duplicate)</span>
              </label>
            </div>
          </div>

          {/* Action Button */}
          <div>
            {isDeploying ? (
              <div className="flex gap-2">
                <button
                  disabled
                  className="flex-1 py-2 rounded-lg text-xs font-bold bg-[#238636] opacity-70 text-white flex items-center justify-center gap-2 cursor-wait"
                >
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Deploying to Vertex AI...</span>
                </button>
                <button
                  onClick={handleCancelDeploy}
                  className="px-3 py-2 rounded-lg text-xs font-bold bg-rose-900/60 hover:bg-rose-800 text-rose-200 border border-rose-700/50 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={handleDeploy}
                disabled={!isProjectIdValid || !folderValidation.isValid}
                className={`w-full py-2.5 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-2 ${
                  isProjectIdValid && folderValidation.isValid
                    ? 'bg-[#238636] hover:bg-[#2ea043] text-white shadow-md cursor-pointer'
                    : 'bg-[#21262d] text-gray-500 border border-[#30363d] cursor-not-allowed opacity-60'
                }`}
                title={
                  !isProjectIdValid
                    ? 'Please enter a valid GCP Project ID'
                    : !folderValidation.isValid
                    ? folderValidation.error || 'Target folder must be a valid Python identifier'
                    : undefined
                }
              >
                <Rocket className="w-3.5 h-3.5" />
                <span>
                  {hasExistingDeployment && !forceNew
                    ? 'Update Agent Engine Instance'
                    : 'Deploy to Vertex AI Agent Engine'}
                </span>
              </button>
            )}
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-600/40 text-xs text-rose-200 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1 overflow-hidden break-words">{errorMessage}</div>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT 2/3: Live Telemetry, Endpoints, & Remote Testing Console */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#0d1117] border border-[#30363d] rounded-xl overflow-hidden shadow-xl">
        {/* Terminal Header */}
        <div className="flex items-center justify-between px-3 bg-[#161b22] border-b border-[#30363d] shrink-0 h-9">
          <div className="flex items-center gap-2">
            <Terminal className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-xs font-mono font-semibold text-white">
              Agent Engine Build & Provisioning Telemetry
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setLogs([])}
              className="px-2 py-1 text-[10px] rounded bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] text-gray-300 font-mono cursor-pointer"
            >
              Clear Logs
            </button>
          </div>
        </div>

        {/* Top Split: Live Logs */}
        <div className="h-64 p-3 overflow-auto bg-[#0d1117] border-b border-[#30363d] font-mono text-[11px] text-[#c9d1d9] space-y-1 select-text">
          {logs.length === 0 ? (
            <div className="h-full flex items-center justify-center text-gray-500 font-sans text-xs">
              Waiting for deployment trigger... Logs will stream here in real time.
            </div>
          ) : (
            logs.map((log, idx) => (
              <div key={idx} className="flex gap-2">
                <span className="text-gray-500 shrink-0">
                  {log.timestamp ? log.timestamp.split('T')[1].slice(0, 8) : '--:--:--'}
                </span>
                <span
                  className={
                    log.stream === 'stderr'
                      ? 'text-rose-400'
                      : log.stream === 'system'
                      ? 'text-emerald-400 font-semibold'
                      : 'text-gray-300'
                  }
                >
                  {log.text}
                </span>
              </div>
            ))
          )}
          <div ref={logsEndRef} />
        </div>

        {/* Bottom Split: Deployed Info & Interactive Remote Testing Console */}
        <div className="flex-1 p-4 overflow-y-auto space-y-4">
          {/* Active Deployment Details Banner */}
          {metadata && metadata.remote_agent_runtime_id ? (
            <div className="p-3 bg-[#161b22] border border-[#30363d] rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-bold text-white">Active Reasoning Engine</span>
                </div>
                {metadata.console_url && (
                  <a
                    href={metadata.console_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1 cursor-pointer font-medium"
                  >
                    <span>View in Cloud Console</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>

              {/* Resource ID */}
              <div className="flex items-center justify-between bg-[#0d1117] p-2 rounded border border-[#30363d] font-mono text-xs">
                <div className="truncate text-gray-300 mr-2">
                  <span className="text-gray-500">Resource: </span>
                  {metadata.remote_agent_runtime_id}
                </div>
                <button
                  onClick={() => handleCopy(metadata.remote_agent_runtime_id, 'id')}
                  className="px-1.5 py-0.5 text-[10px] rounded bg-[#21262d] hover:bg-[#30363d] text-gray-300 border border-[#30363d] cursor-pointer"
                >
                  {copiedId ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>

              {/* Service URL / Passthrough */}
              <div className="flex items-center justify-between bg-[#0d1117] p-2 rounded border border-[#30363d] font-mono text-xs">
                <div className="truncate text-gray-300 mr-2">
                  <span className="text-gray-500">Endpoint: </span>
                  {metadata.service_url}
                </div>
                <button
                  onClick={() => handleCopy(metadata.service_url, 'url')}
                  className="px-1.5 py-0.5 text-[10px] rounded bg-[#21262d] hover:bg-[#30363d] text-gray-300 border border-[#30363d] cursor-pointer"
                >
                  {copiedUrl ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
            </div>
          ) : (
            <div className="p-3 bg-[#161b22]/50 border border-[#30363d] rounded-lg text-xs text-gray-400 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Deploy to Agent Engine to obtain live HTTP passthrough credentials and endpoints.</span>
            </div>
          )}

          {/* Remote Query & Chat Console */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-300 flex items-center gap-1.5">
                <Send className="w-3.5 h-3.5 text-emerald-400" />
                <span>Live Remote Execution Test (/api/run_sse)</span>
              </span>
              {testDuration !== null && (
                <span className="text-[10px] font-mono text-gray-400">Latency: {testDuration}ms</span>
              )}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={testQuery}
                onChange={(e) => setTestQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSendTestQuery();
                }}
                placeholder="Ask the deployed agent a question or trigger a task..."
                disabled={isTesting}
                className="flex-1 bg-[#161b22] border border-[#30363d] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-sans"
              />
              <button
                onClick={handleSendTestQuery}
                disabled={isTesting || !testQuery.trim()}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-800 disabled:text-gray-500 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
              >
                {isTesting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                <span>Send</span>
              </button>
            </div>

            {/* Test Query Response Display */}
            {(testResponse || testError) && (
              <div
                className={`p-3 rounded-lg border font-mono text-xs select-text ${
                  testError
                    ? 'bg-rose-950/30 border-rose-600/40 text-rose-200'
                    : 'bg-[#161b22] border-[#30363d] text-emerald-300'
                }`}
              >
                <div className="text-[10px] uppercase font-bold text-gray-400 mb-1 font-sans">
                  {testError ? 'Execution Error' : 'Remote Agent Response'}
                </div>
                <div className="whitespace-pre-wrap">{testError || testResponse}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
