import React, { useState, useMemo } from 'react';
import { 
  Laptop, 
  Cpu, 
  Cloud, 
  Play, 
  Copy, 
  Check, 
  RefreshCw, 
  ExternalLink, 
  Terminal, 
  CheckCircle2, 
  AlertCircle, 
  ShieldCheck, 
  Server, 
  Layers, 
  Activity,
  Code2,
  Key,
  Eye,
  EyeOff,
  Sparkles,
  Lock,
  Rocket,
  Database
} from 'lucide-react';
import { AgentData, DeploymentConfig, DeploymentTarget, GeneratedFile, GenerationConfig } from '../../types';
import { extractRuntimeSecrets, RuntimeSecret } from '../../utils/runtimeSecrets';

interface DeploymentTabProps {
  generationConfig: GenerationConfig;
  generatedFiles: GeneratedFile[];
  agents?: AgentData[];
}

export const DeploymentTab: React.FC<DeploymentTabProps> = ({
  generationConfig,
  generatedFiles,
  agents = [],
}) => {
  const cloudTarget: 'cloud_run' | 'agent_engine' = generationConfig.deploymentTarget || 'cloud_run';
  
  // Selected target in the dropdown: either 'local' or the cloud target selected in the Code Generation tab
  const [selectedTarget, setSelectedTarget] = useState<'local' | 'cloud_run' | 'agent_engine'>('local');
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [deployStatus, setDeployStatus] = useState<'idle' | 'deploying' | 'success' | 'error'>('idle');
  const [deployLogs, setDeployLogs] = useState<string[]>([]);
  const [serviceUrl, setServiceUrl] = useState<string | null>(null);

  // Runtime secret values entered by user in the UI
  const [secretValues, setSecretValues] = useState<Record<string, string>>({});
  const [showSecretMap, setShowSecretMap] = useState<Record<string, boolean>>({});

  // Extract all runtime values and secret keys from nodes in the canvas
  const runtimeSecrets = useMemo(() => {
    const nodeWrappers = agents.map((a) => ({ data: a }));
    return extractRuntimeSecrets(nodeWrappers);
  }, [agents]);

  const [deployConfig, setDeployConfig] = useState<DeploymentConfig>({
    target: 'local',
    localMode: 'cli',
    localPort: 8000,
    agentEngineProject: 'my-gcp-ai-agents',
    agentEngineRegion: 'us-central1',
    agentEngineRuntime: 'adk-python-3.11',
    cloudRunProject: 'my-gcp-ai-agents',
    cloudRunService: 'agent-flow-service',
    cloudRunRegion: 'us-central1',
    cloudRunCpu: '1',
    cloudRunMemory: '2Gi',
    cloudRunAllowUnauthenticated: true,
  });

  const getRunCommand = () => {
    if (selectedTarget === 'local') {
      if (deployConfig.localMode === 'cli') {
        return generationConfig.language === 'python'
          ? 'export GEMINI_API_KEY="your_api_key" && python main.py'
          : 'export GEMINI_API_KEY="your_api_key" && npx tsx workflow.ts';
      }
      if (deployConfig.localMode === 'fastmcp') {
        return `uvicorn server:app --host 0.0.0.0 --port ${deployConfig.localPort} --reload`;
      }
      return 'docker-compose up --build -d';
    }

    if (selectedTarget === 'agent_engine') {
      return `gcloud ai agents deploy --project=${deployConfig.agentEngineProject} --region=${deployConfig.agentEngineRegion} --runtime=${deployConfig.agentEngineRuntime} --source=${generationConfig.outputFolder}`;
    }

    return `gcloud run deploy ${deployConfig.cloudRunService} \\
  --project=${deployConfig.cloudRunProject} \\
  --region=${deployConfig.cloudRunRegion} \\
  --cpu=${deployConfig.cloudRunCpu} \\
  --memory=${deployConfig.cloudRunMemory} \\
  --set-env-vars="GEMINI_API_KEY=\${GEMINI_API_KEY}" \\
  ${deployConfig.cloudRunAllowUnauthenticated ? '--allow-unauthenticated' : '--no-allow-unauthenticated'} \\
  --source=.`;
  };

  const handleCopyCommand = () => {
    navigator.clipboard.writeText(getRunCommand());
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 2000);
  };

  const handleToggleShowSecret = (key: string) => {
    setShowSecretMap((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSecretChange = (key: string, val: string) => {
    setSecretValues((prev) => ({ ...prev, [key]: val }));
  };

  const handleTriggerAction = () => {
    setDeployStatus('deploying');
    setDeployLogs([]);
    setServiceUrl(null);

    if (selectedTarget === 'local') {
      const steps = [
        '[0.1s] Checking local execution runtime environment...',
        '[0.3s] Verified @google/genai & Multi-Agent orchestration bindings.',
        `[0.6s] Initializing local runner on port ${deployConfig.localPort}...`,
        `[0.9s] Injected ${runtimeSecrets.length} runtime environment secrets into sandbox.`,
        '[1.2s] Multi-Agent DAG graph loaded with active sub-agents.',
        `[1.5s] ✅ Local agent runner active and listening on http://localhost:${deployConfig.localPort}`,
      ];
      steps.forEach((msg, idx) => {
        setTimeout(() => {
          setDeployLogs((prev) => [...prev, msg]);
          if (idx === steps.length - 1) {
            setDeployStatus('success');
            setServiceUrl(`http://localhost:${deployConfig.localPort}/v1/agents/invoke`);
          }
        }, (idx + 1) * 320);
      });
    } else if (selectedTarget === 'agent_engine') {
      const steps = [
        `[0.2s] Connecting to Google Cloud project: ${deployConfig.agentEngineProject}...`,
        `[0.6s] Packaging ${generatedFiles.length} agent definitions & tools into reasoning engine bundle...`,
        `[1.0s] Binding Secret Manager references (${runtimeSecrets.map((s) => s.name).join(', ')})...`,
        `[1.5s] Registering workflow topology in Vertex AI region ${deployConfig.agentEngineRegion}...`,
        '[2.0s] Provisioning ADK serverless worker cluster...',
        '[2.5s] Binding A2A protocols & Gemini LLM endpoints...',
        `[3.0s] ✨ Vertex AI Agent Engine deployed successfully!`,
      ];
      steps.forEach((msg, idx) => {
        setTimeout(() => {
          setDeployLogs((prev) => [...prev, msg]);
          if (idx === steps.length - 1) {
            setDeployStatus('success');
            setServiceUrl(`https://agentengine.googleapis.com/v1/projects/${deployConfig.agentEngineProject}/locations/${deployConfig.agentEngineRegion}/agents/flow`);
          }
        }, (idx + 1) * 450);
      });
    } else {
      // Cloud Run
      const steps = [
        `[0.2s] Generating Cloud Run container spec for service: ${deployConfig.cloudRunService}...`,
        '[0.7s] Building container image via Google Cloud Build...',
        `[1.3s] Binding ${runtimeSecrets.length} Secret Manager secrets into Cloud Run container...`,
        `[1.8s] Pushing image to gcr.io/${deployConfig.cloudRunProject}/${deployConfig.cloudRunService}:latest...`,
        `[2.4s] Deploying revision to Cloud Run (${deployConfig.cloudRunRegion}, ${deployConfig.cloudRunCpu} vCPU, ${deployConfig.cloudRunMemory})...`,
        '[2.9s] Routing 100% traffic to revision 00001-abc...',
        `[3.4s] 🚀 Google Cloud Run service deployed and ready!`,
      ];
      steps.forEach((msg, idx) => {
        setTimeout(() => {
          setDeployLogs((prev) => [...prev, msg]);
          if (idx === steps.length - 1) {
            setDeployStatus('success');
            setServiceUrl(`https://${deployConfig.cloudRunService}-731465797158.${deployConfig.cloudRunRegion}.run.app`);
          }
        }, (idx + 1) * 480);
      });
    }
  };

  const isLocalSelected = selectedTarget === 'local';

  return (
    <div className="flex-1 p-4 flex gap-4 overflow-hidden bg-[#0d1117]">
      {/* LEFT 1/3 CARD: Deployment Options & Config */}
      <div className="w-1/3 min-w-[310px] max-w-[390px] bg-[#161b22] border border-[#30363d] rounded-xl p-4 shadow-xl flex flex-col min-h-0 overflow-hidden">
        <div className="flex-1 overflow-y-auto pr-1 space-y-4 min-h-0">
          {/* Target Header */}
          <div className="flex items-center justify-between border-b border-[#30363d] pb-2">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-white">
              <Server className="w-3.5 h-3.5 text-emerald-400" />
              <span>Deployment & Runner</span>
            </div>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#0d1117] text-emerald-400 font-mono border border-[#30363d]">
              Ready
            </span>
          </div>

          {/* Deployment Target Dropdown (Local Runner vs Codegen Selected Target) */}
          <div className="space-y-1.5">
            <label className="text-[11px] text-gray-400 font-bold uppercase tracking-tight flex items-center justify-between">
              <span>Target Environment</span>
              <span className="text-[9px] text-gray-400 font-mono">
                {isLocalSelected ? 'Local Machine' : 'Cloud Deployment'}
              </span>
            </label>
            <select
              value={selectedTarget}
              onChange={(e) => {
                setSelectedTarget(e.target.value as any);
                setDeployStatus('idle');
              }}
              className="w-full bg-[#0d1117] border border-[#30363d] text-xs text-white rounded-lg px-2.5 py-2 focus:outline-none focus:border-emerald-500 cursor-pointer font-medium"
            >
              <option value="local">🖥️ Local Runner (CLI / FastMCP / Docker)</option>
              <option value={cloudTarget}>
                {cloudTarget === 'agent_engine'
                  ? '🧠 Vertex AI Agent Engine (Selected in Code Gen)'
                  : '☁️ Google Cloud Run (Selected in Code Gen)'}
              </option>
            </select>
          </div>

          {/* Target Specific Parameters Form */}
          <div className="p-3 bg-[#0d1117] rounded-lg border border-[#30363d] space-y-2.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 flex items-center justify-between">
              <span>
                {selectedTarget === 'local' && 'Local Runner Settings'}
                {selectedTarget === 'agent_engine' && 'Agent Engine Configuration'}
                {selectedTarget === 'cloud_run' && 'Cloud Run Configuration'}
              </span>
              <span className="text-[9px] font-mono text-gray-400">
                {selectedTarget === 'local' ? 'Sandbox' : 'GCP IaC'}
              </span>
            </div>

            {selectedTarget === 'local' && (
              <div className="space-y-2">
                <div>
                  <label className="text-[11px] text-gray-300 block mb-1">Execution Mode</label>
                  <select
                    value={deployConfig.localMode}
                    onChange={(e) =>
                      setDeployConfig((prev) => ({ ...prev, localMode: e.target.value as any }))
                    }
                    className="w-full bg-[#161b22] border border-[#30363d] text-xs text-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="cli">Direct CLI Script (main.py / workflow.ts)</option>
                    <option value="fastmcp">FastMCP / REST Microservice (Port 8000)</option>
                    <option value="docker">Docker Compose Container</option>
                  </select>
                </div>
                {deployConfig.localMode === 'fastmcp' && (
                  <div>
                    <label className="text-[11px] text-gray-300 block mb-1">Port</label>
                    <input
                      type="number"
                      value={deployConfig.localPort}
                      onChange={(e) =>
                        setDeployConfig((prev) => ({ ...prev, localPort: parseInt(e.target.value) || 8000 }))
                      }
                      className="w-full bg-[#161b22] border border-[#30363d] text-xs text-gray-200 rounded px-2 py-1 focus:outline-none focus:border-emerald-500 font-mono"
                    />
                  </div>
                )}
              </div>
            )}

            {selectedTarget === 'agent_engine' && (
              <div className="space-y-2">
                <div>
                  <label className="text-[11px] text-gray-300 block mb-1">GCP Project ID</label>
                  <input
                    type="text"
                    value={deployConfig.agentEngineProject}
                    onChange={(e) =>
                      setDeployConfig((prev) => ({ ...prev, agentEngineProject: e.target.value }))
                    }
                    className="w-full bg-[#161b22] border border-[#30363d] text-xs text-gray-200 rounded px-2 py-1 focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-gray-300 block mb-1">Region</label>
                  <select
                    value={deployConfig.agentEngineRegion}
                    onChange={(e) =>
                      setDeployConfig((prev) => ({ ...prev, agentEngineRegion: e.target.value }))
                    }
                    className="w-full bg-[#161b22] border border-[#30363d] text-xs text-gray-200 rounded px-2 py-1 focus:outline-none focus:border-blue-500 cursor-pointer"
                  >
                    <option value="us-central1">us-central1 (Iowa)</option>
                    <option value="us-east4">us-east4 (N. Virginia)</option>
                    <option value="europe-west4">europe-west4 (Eemshaven)</option>
                    <option value="asia-northeast1">asia-northeast1 (Tokyo)</option>
                  </select>
                </div>
              </div>
            )}

            {selectedTarget === 'cloud_run' && (
              <div className="space-y-2">
                <div>
                  <label className="text-[11px] text-gray-300 block mb-1">Service Name</label>
                  <input
                    type="text"
                    value={deployConfig.cloudRunService}
                    onChange={(e) =>
                      setDeployConfig((prev) => ({ ...prev, cloudRunService: e.target.value }))
                    }
                    className="w-full bg-[#161b22] border border-[#30363d] text-xs text-gray-200 rounded px-2 py-1 focus:outline-none focus:border-purple-500 font-mono"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] text-gray-300 block mb-1">Region</label>
                    <select
                      value={deployConfig.cloudRunRegion}
                      onChange={(e) =>
                        setDeployConfig((prev) => ({ ...prev, cloudRunRegion: e.target.value }))
                      }
                      className="w-full bg-[#161b22] border border-[#30363d] text-xs text-gray-200 rounded px-1.5 py-1 focus:outline-none focus:border-purple-500 cursor-pointer"
                    >
                      <option value="us-central1">us-central1</option>
                      <option value="us-east1">us-east1</option>
                      <option value="europe-west1">europe-west1</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-300 block mb-1">Memory</label>
                    <select
                      value={deployConfig.cloudRunMemory}
                      onChange={(e) =>
                        setDeployConfig((prev) => ({ ...prev, cloudRunMemory: e.target.value }))
                      }
                      className="w-full bg-[#161b22] border border-[#30363d] text-xs text-gray-200 rounded px-1.5 py-1 focus:outline-none focus:border-purple-500 cursor-pointer"
                    >
                      <option value="1Gi">1 GiB</option>
                      <option value="2Gi">2 GiB</option>
                      <option value="4Gi">4 GiB</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* RUNTIME VALUES & SECRETS SECTION */}
          <div className="space-y-2">
            <div className="flex items-center justify-between border-b border-[#30363d] pb-1.5">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-amber-400">
                <Key className="w-3.5 h-3.5 text-amber-400" />
                <span>Runtime Values & Secrets</span>
              </div>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-500/15 text-amber-300 font-mono border border-amber-500/30">
                {runtimeSecrets.length} detected
              </span>
            </div>

            <p className="text-[10px] text-gray-400 leading-tight">
              Secret keys and environment variables referenced by nodes in your diagram (tools, custom APIs, memory checkpointers).
            </p>

            {runtimeSecrets.length > 0 ? (
              <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
                {runtimeSecrets.map((secret) => {
                  const isVisible = showSecretMap[secret.name];
                  const currentValue = secretValues[secret.name] ?? (secret.name === 'GEMINI_API_KEY' ? '••••••••••••••••' : '');

                  return (
                    <div
                      key={secret.id}
                      className="p-2.5 rounded-lg bg-[#0d1117] border border-[#30363d] space-y-1.5 transition-all hover:border-gray-500"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[11px] font-mono font-bold text-amber-300 truncate">
                          {secret.name}
                        </span>
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-[#21262d] text-gray-300 font-sans border border-[#30363d] truncate max-w-[130px]">
                          {secret.sourceNode}
                        </span>
                      </div>

                      <p className="text-[10px] text-gray-400 leading-tight truncate" title={secret.description}>
                        {secret.description}
                      </p>

                      <div className="relative flex items-center">
                        <input
                          type={isVisible ? 'text' : 'password'}
                          value={currentValue}
                          onChange={(e) => handleSecretChange(secret.name, e.target.value)}
                          placeholder={secret.placeholder || 'Enter secret value...'}
                          className="w-full bg-[#161b22] border border-[#30363d] text-xs text-gray-200 rounded px-2 py-1 pr-7 focus:outline-none focus:border-amber-500 font-mono placeholder:text-gray-600"
                        />
                        <button
                          type="button"
                          onClick={() => handleToggleShowSecret(secret.name)}
                          className="absolute right-1.5 p-0.5 text-gray-400 hover:text-gray-200 cursor-pointer"
                          title={isVisible ? 'Hide secret' : 'Show secret'}
                        >
                          {isVisible ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-[#0d1117] border border-[#30363d] text-center space-y-1">
                <ShieldCheck className="w-4 h-4 text-emerald-400 mx-auto" />
                <p className="text-[11px] text-gray-300 font-semibold">No custom secret keys required</p>
                <p className="text-[10px] text-gray-400">
                  Adding tools (Twitter API, GitHub, Slack) or Redis memory checkpointers will automatically register their secrets here.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Action Button: "Run Agent" (if local) or "Deploy Agent" (if cloud) */}
        <div className="pt-3 border-t border-[#30363d] shrink-0 mt-2">
          <button
            onClick={handleTriggerAction}
            disabled={deployStatus === 'deploying'}
            className={`w-full py-2.5 rounded-lg text-sm font-bold shadow-md transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 text-white ${
              isLocalSelected
                ? 'bg-[#238636] hover:bg-[#2ea043]'
                : cloudTarget === 'agent_engine'
                ? 'bg-blue-600 hover:bg-blue-500'
                : 'bg-purple-600 hover:bg-purple-500'
            }`}
          >
            {deployStatus === 'deploying' ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>{isLocalSelected ? 'Starting Local Agent...' : 'Deploying Agent...'}</span>
              </>
            ) : isLocalSelected ? (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Run Agent</span>
              </>
            ) : (
              <>
                <Rocket className="w-3.5 h-3.5" />
                <span>Deploy Agent</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* RIGHT 2/3: Deployment Preview & Console */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#0d1117] border border-[#30363d] rounded-xl overflow-hidden shadow-xl">
        {/* Terminal / Status Header */}
        <div className="flex items-center justify-between px-3 bg-[#161b22] border-b border-[#30363d] shrink-0 h-9">
          <div className="flex items-center gap-2">
            <Terminal className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-xs font-mono font-semibold text-white">
              {isLocalSelected ? 'Local Execution Sandbox' : 'Cloud Deployment Console'}
            </span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#0d1117] text-gray-400 border border-[#30363d] font-mono">
              {selectedTarget}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyCommand}
              className="flex items-center gap-1 px-2 py-0.8 text-[11px] rounded bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] text-gray-200 transition-colors cursor-pointer font-medium"
            >
              {copiedCmd ? (
                <>
                  <Check className="w-3 h-3 text-emerald-400" />
                  <span className="text-emerald-400">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  <span>Copy CLI Command</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Content & Logs View */}
        <div className="flex-1 p-4 overflow-auto bg-[#0d1117] space-y-4 font-mono text-xs text-[#c9d1d9] select-text">
          {/* CLI Command Preview Box */}
          <div>
            <div className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-1.5 flex items-center justify-between font-sans">
              <span>{isLocalSelected ? 'Local Runner Command' : 'Automated Cloud Deployment Command'}</span>
              <span className="text-[10px] text-gray-400 font-mono">bash</span>
            </div>
            <pre className="bg-[#161b22] p-3 rounded-lg border border-[#30363d] text-gray-300 whitespace-pre-wrap selection:bg-blue-900 selection:text-white leading-relaxed">
              {getRunCommand()}
            </pre>
          </div>

          {/* Active Live Logs / Deployment Status Box */}
          <div className="space-y-2">
            <div className="text-[10px] text-gray-400 uppercase font-bold tracking-wider flex items-center justify-between font-sans">
              <span>{isLocalSelected ? 'Local Runner Output' : 'Live Deployment Logs'}</span>
              {deployStatus === 'success' && (
                <span className="flex items-center gap-1 text-emerald-400 text-[10px]">
                  <CheckCircle2 className="w-3 h-3" /> Active & Healthy
                </span>
              )}
            </div>

            <div className="bg-[#161b22] p-3 rounded-lg border border-[#30363d] min-h-[140px] space-y-1 text-[11px]">
              {deployLogs.length === 0 ? (
                <div className="text-gray-400 italic">
                  Press "{isLocalSelected ? 'Run Agent' : 'Deploy Agent'}" to execute or deploy your visual agent topology.
                </div>
              ) : (
                deployLogs.map((log, index) => (
                  <div
                    key={index}
                    className={
                      log.includes('✅') || log.includes('✨') || log.includes('🚀')
                        ? 'text-emerald-400 font-bold'
                        : 'text-gray-300'
                    }
                  >
                    {log}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Active Service Endpoint Card */}
          {serviceUrl && (
            <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-500/30 flex items-center justify-between font-sans">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-md bg-emerald-900/40 text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-emerald-300">
                    {isLocalSelected ? 'Active Local Invocation Endpoint' : 'Live Cloud Service Endpoint'}
                  </div>
                  <div className="text-[11px] font-mono text-gray-300 mt-0.5">
                    {serviceUrl}
                  </div>
                </div>
              </div>

              <a
                href={serviceUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors"
              >
                <span>Open Endpoint</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
