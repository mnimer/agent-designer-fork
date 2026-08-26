import React, { useState, useEffect } from 'react';
import { 
  Wrench, 
  X, 
  Sparkles, 
  Globe, 
  Terminal, 
  Database, 
  FileText, 
  Radio, 
  Code, 
  Key, 
  Plus, 
  Trash2, 
  Check, 
  Sliders, 
  FileCode,
  Save,
  Link,
  Bot,
  Server,
  Plug,
  Activity,
  CheckCircle2,
  RefreshCw,
  TerminalSquare,
  Globe2
} from 'lucide-react';
import { ToolDefinition, AgentData, McpToolConfig, McpTransportType } from '../../types';

interface ToolPropertyDrawerProps {
  tool: ToolDefinition | null;
  isOpen: boolean;
  onClose: () => void;
  onSaveTool: (updatedTool: ToolDefinition) => void;
  onDeleteTool?: (toolId: string) => void;
  selectedAgent?: AgentData | null;
  onAttachToAgent?: (agentId: string, tool: ToolDefinition) => void;
}

const getToolIcon = (type: ToolDefinition['type']) => {
  switch (type) {
    case 'mcp':
      return <Server className="w-4 h-4 text-purple-400" />;
    case 'search':
      return <Globe className="w-4 h-4 text-sky-400" />;
    case 'code':
      return <Terminal className="w-4 h-4 text-emerald-400" />;
    case 'db':
      return <Database className="w-4 h-4 text-amber-400" />;
    case 'rag':
      return <FileText className="w-4 h-4 text-purple-400" />;
    case 'api':
      return <Radio className="w-4 h-4 text-rose-400" />;
    default:
      return <Code className="w-4 h-4 text-indigo-400" />;
  }
};

export const ToolPropertyDrawer: React.FC<ToolPropertyDrawerProps> = ({
  tool,
  isOpen,
  onClose,
  onSaveTool,
  onDeleteTool,
  selectedAgent,
  onAttachToAgent,
}) => {
  const [formData, setFormData] = useState<ToolDefinition | null>(null);
  const [newParamKey, setNewParamKey] = useState('');
  const [newParamVal, setNewParamVal] = useState('');
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [mcpTestStatus, setMcpTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [mcpDiscoveredTools, setMcpDiscoveredTools] = useState<string[]>([]);
  const [mcpLatencyMs, setMcpLatencyMs] = useState<number>(0);
  const [newEnvKey, setNewEnvKey] = useState('');
  const [newEnvVal, setNewEnvVal] = useState('');

  useEffect(() => {
    if (tool) {
      setFormData({ 
        ...tool, 
        parameters: { ...(tool.parameters || {}) },
        mcpConfig: tool.mcpConfig ? {
          ...tool.mcpConfig,
          args: [...(tool.mcpConfig.args || [])],
          envVars: { ...(tool.mcpConfig.envVars || {}) },
          headers: { ...(tool.mcpConfig.headers || {}) },
          exposedTools: [...(tool.mcpConfig.exposedTools || ['*'])],
        } : (tool.type === 'mcp' ? {
          serverName: 'mcp-server',
          transport: 'stdio',
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem', './workspace'],
          envVars: {},
          exposedTools: ['*'],
          timeoutSeconds: 30,
        } : undefined)
      });
      setMcpTestStatus('idle');
      setMcpDiscoveredTools([]);
    }
  }, [tool]);

  if (!isOpen || !formData) return null;

  const handleUpdate = (partial: Partial<ToolDefinition>) => {
    setFormData((prev) => {
      if (!prev) return null;
      const next = { ...prev, ...partial };
      // If switched to MCP and no mcpConfig exists, initialize default
      if (next.type === 'mcp' && !next.mcpConfig) {
        next.mcpConfig = {
          serverName: next.name.toLowerCase().replace(/[^a-z0-9_-]/g, '-') || 'mcp-server',
          transport: 'stdio',
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem', './workspace'],
          envVars: {},
          exposedTools: ['*'],
          timeoutSeconds: 30,
        };
      }
      return next;
    });
  };

  const handleUpdateMcpConfig = (partial: Partial<McpToolConfig>) => {
    if (!formData) return;
    const currentMcp: McpToolConfig = formData.mcpConfig || {
      serverName: 'mcp-server',
      transport: 'stdio',
      command: 'npx',
      args: [],
      envVars: {},
      exposedTools: ['*'],
      timeoutSeconds: 30,
    };
    handleUpdate({
      mcpConfig: {
        ...currentMcp,
        ...partial,
      }
    });
  };

  const handleAddParam = () => {
    if (!newParamKey.trim()) return;
    const params = { ...(formData.parameters || {}) };
    params[newParamKey.trim()] = newParamVal.trim() || 'string';
    handleUpdate({ parameters: params });
    setNewParamKey('');
    setNewParamVal('');
  };

  const handleRemoveParam = (key: string) => {
    const params = { ...(formData.parameters || {}) };
    delete params[key];
    handleUpdate({ parameters: params });
  };

  const handleAddMcpEnv = () => {
    if (!newEnvKey.trim()) return;
    const envs = { ...(formData.mcpConfig?.envVars || {}) };
    envs[newEnvKey.trim()] = newEnvVal.trim();
    handleUpdateMcpConfig({ envVars: envs });
    setNewEnvKey('');
    setNewEnvVal('');
  };

  const handleRemoveMcpEnv = (key: string) => {
    const envs = { ...(formData.mcpConfig?.envVars || {}) };
    delete envs[key];
    handleUpdateMcpConfig({ envVars: envs });
  };

  const handleTestMcpConnection = () => {
    setMcpTestStatus('testing');
    setTimeout(() => {
      const isSse = formData.mcpConfig?.transport === 'sse';
      const cmd = formData.mcpConfig?.command || 'npx';
      const argsJoined = (formData.mcpConfig?.args || []).join(' ');
      
      let mockTools = ['execute_action', 'get_status'];
      if (argsJoined.includes('github') || formData.name.toLowerCase().includes('github')) {
        mockTools = ['search_repositories', 'get_file_contents', 'create_issue', 'list_pull_requests', 'create_pull_request'];
      } else if (argsJoined.includes('filesystem') || formData.name.toLowerCase().includes('file')) {
        mockTools = ['read_file', 'write_file', 'list_directory', 'move_file', 'search_files'];
      } else if (argsJoined.includes('postgres') || formData.name.toLowerCase().includes('sql') || formData.name.toLowerCase().includes('postgres')) {
        mockTools = ['query_read_only', 'describe_table', 'list_tables', 'explain_query'];
      } else if (argsJoined.includes('brave') || formData.name.toLowerCase().includes('brave') || formData.name.toLowerCase().includes('search')) {
        mockTools = ['brave_web_search', 'brave_local_search'];
      } else if (argsJoined.includes('memory') || formData.name.toLowerCase().includes('memory')) {
        mockTools = ['create_entities', 'create_relations', 'add_observations', 'read_graph', 'search_nodes'];
      } else if (isSse) {
        mockTools = ['remote_invoke_agent', 'query_knowledge_base', 'dispatch_webhook'];
      }

      setMcpDiscoveredTools(mockTools);
      setMcpLatencyMs(Math.floor(Math.random() * 45) + 12);
      setMcpTestStatus('success');
    }, 600);
  };

  const handleSave = () => {
    if (!formData) return;
    onSaveTool(formData);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 800);
  };

  const isAlreadyAttached = selectedAgent?.tools?.some((t) => t.id === formData.id);

  return (
    <div className="absolute top-0 right-0 bottom-0 z-40 w-96 backdrop-blur-2xl bg-[#161b22]/95 border-l border-[#30363d] shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200 text-[#c9d1d9]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5 bg-[#161b22] border-b border-[#30363d] shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`p-1.5 rounded-lg bg-[#0d1117] border shrink-0 shadow-xs ${formData.type === 'mcp' ? 'border-purple-500/50' : 'border-[#30363d]'}`}>
            {getToolIcon(formData.type)}
          </div>
          <div className="min-w-0">
            <h3 className="text-xs font-bold text-white truncate max-w-[200px]">
              {formData.name || (formData.type === 'mcp' ? 'MCP Server Tool' : 'Custom Tool')}
            </h3>
            <span className={`text-[10px] font-mono flex items-center gap-1 ${formData.type === 'mcp' ? 'text-purple-400' : 'text-green-400'}`}>
              {formData.type === 'mcp' ? 'Model Context Protocol (MCP) Server' : 'Tool Definition & Directive'}
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-md text-gray-400 hover:text-white hover:bg-[#30363d] transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 p-4 space-y-4 overflow-y-auto text-xs text-gray-300">
        {/* Tool Name & Category */}
        <div className="space-y-3 bg-[#0d1117] p-3 rounded-lg border border-[#30363d]">
          <div className="space-y-1">
            <label className="text-[11px] font-bold uppercase tracking-tight text-gray-400">
              Tool Name
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => handleUpdate({ name: e.target.value })}
              placeholder={formData.type === 'mcp' ? 'e.g. GitHub MCP Server' : 'e.g. Twitter / X API Search'}
              className="w-full px-3 py-1.5 bg-[#161b22] border border-[#30363d] focus:border-purple-500 rounded-lg text-xs text-white focus:outline-none"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-bold uppercase tracking-tight text-gray-400">
              Tool Category / Type
            </label>
            <select
              value={formData.type}
              onChange={(e) => handleUpdate({ type: e.target.value as any })}
              className="w-full px-3 py-1.5 bg-[#161b22] border border-[#30363d] focus:border-purple-500 rounded-lg text-xs text-white focus:outline-none cursor-pointer"
            >
              <option value="mcp">MCP Server (Model Context Protocol - GitHub, Postgres, Local/Remote)</option>
              <option value="api">REST API Client (Twitter, GitHub, Slack, Custom Webhooks)</option>
              <option value="search">Search Engine / Grounding Retrieval</option>
              <option value="code">Code Interpreter / Python Sandbox</option>
              <option value="db">Database SQL / Relational Queries</option>
              <option value="rag">Knowledge Base Vector RAG</option>
              <option value="custom">Custom Python/TypeScript Logic</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-bold uppercase tracking-tight text-gray-400">
              Short Description
            </label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => handleUpdate({ description: e.target.value })}
              placeholder="Brief summary of what this tool provides to the agent"
              className="w-full px-3 py-1.5 bg-[#161b22] border border-[#30363d] focus:border-purple-500 rounded-lg text-xs text-gray-200 focus:outline-none"
            />
          </div>
        </div>

        {/* MCP SERVER DEDICATED CONFIGURATION */}
        {formData.type === 'mcp' && (
          <div className="space-y-3.5 bg-[#0d1117] p-3.5 rounded-lg border border-purple-500/40 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-purple-300 font-bold text-xs">
                <Plug className="w-4 h-4 text-purple-400" />
                <span>MCP Server Configuration</span>
              </div>
              <span className="text-[9px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 font-mono font-bold">
                MCP v1.0
              </span>
            </div>

            {/* Transport Protocol Toggle */}
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold tracking-tight text-gray-400">
                Transport Protocol
              </label>
              <div className="grid grid-cols-2 gap-1.5 bg-[#161b22] p-1 rounded-lg border border-[#30363d]">
                <button
                  type="button"
                  onClick={() => handleUpdateMcpConfig({ transport: 'stdio' })}
                  className={`py-1 px-2 rounded text-[11px] font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    formData.mcpConfig?.transport === 'stdio'
                      ? 'bg-purple-600 text-white shadow-xs font-bold'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  <TerminalSquare className="w-3.5 h-3.5" />
                  <span>stdio (Local Process)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleUpdateMcpConfig({ transport: 'sse' })}
                  className={`py-1 px-2 rounded text-[11px] font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    formData.mcpConfig?.transport === 'sse' || formData.mcpConfig?.transport === 'http'
                      ? 'bg-purple-600 text-white shadow-xs font-bold'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  <Globe2 className="w-3.5 h-3.5" />
                  <span>SSE (Remote HTTP)</span>
                </button>
              </div>
            </div>

            {/* Server Identifier Name */}
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold tracking-tight text-gray-400">
                MCP Server Identifier
              </label>
              <input
                type="text"
                value={formData.mcpConfig?.serverName || ''}
                onChange={(e) => handleUpdateMcpConfig({ serverName: e.target.value })}
                placeholder="e.g. github-mcp or filesystem-mcp"
                className="w-full px-2.5 py-1.5 bg-[#161b22] border border-[#30363d] focus:border-purple-400 rounded text-[11px] font-mono text-purple-200 focus:outline-none"
              />
            </div>

            {/* STDIO Transport Details */}
            {formData.mcpConfig?.transport === 'stdio' && (
              <div className="space-y-2.5 pt-2 border-t border-[#30363d]">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold tracking-tight text-gray-400">
                    CLI Command Executable
                  </label>
                  <div className="grid grid-cols-4 gap-1">
                    {['npx', 'uvx', 'python', 'docker'].map((cmd) => (
                      <button
                        key={cmd}
                        type="button"
                        onClick={() => handleUpdateMcpConfig({ command: cmd })}
                        className={`px-2 py-1 rounded text-[10px] font-mono border transition-colors cursor-pointer ${
                          formData.mcpConfig?.command === cmd
                            ? 'bg-purple-900/50 border-purple-400 text-purple-200 font-bold'
                            : 'bg-[#161b22] border-[#30363d] text-gray-400 hover:text-white'
                        }`}
                      >
                        {cmd}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold tracking-tight text-gray-400">
                    Process Arguments (args)
                  </label>
                  <input
                    type="text"
                    value={(formData.mcpConfig?.args || []).join(' ')}
                    onChange={(e) => handleUpdateMcpConfig({ args: e.target.value.split(' ').filter(Boolean) })}
                    placeholder="-y @modelcontextprotocol/server-filesystem ./workspace"
                    className="w-full px-2.5 py-1.5 bg-[#161b22] border border-[#30363d] focus:border-purple-400 rounded text-[11px] font-mono text-gray-200 focus:outline-none"
                  />
                  <div className="text-[9px] text-gray-400 font-mono">
                    Space-separated CLI flags and package names
                  </div>
                </div>

                {/* Environment Variables for MCP Server Process */}
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold tracking-tight text-gray-400 flex items-center justify-between">
                    <span>Server Environment Variables ({Object.keys(formData.mcpConfig?.envVars || {}).length})</span>
                  </label>
                  <div className="space-y-1 max-h-24 overflow-y-auto">
                    {Object.entries(formData.mcpConfig?.envVars || {}).map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between bg-[#161b22] px-2 py-1 rounded border border-[#30363d] text-[10px] font-mono">
                        <span className="text-amber-300 font-bold">{k}</span>
                        <span className="text-gray-400 truncate max-w-[120px]">{v}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveMcpEnv(k)}
                          className="text-gray-400 hover:text-rose-400 cursor-pointer p-0.5"
                        >
                          <Trash2 className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-1">
                    <input
                      type="text"
                      value={newEnvKey}
                      onChange={(e) => setNewEnvKey(e.target.value)}
                      placeholder="GITHUB_PERSONAL_ACCESS_TOKEN"
                      className="flex-1 px-2 py-1 bg-[#161b22] border border-[#30363d] focus:border-purple-400 rounded text-[10px] font-mono text-amber-300 focus:outline-none"
                    />
                    <input
                      type="text"
                      value={newEnvVal}
                      onChange={(e) => setNewEnvVal(e.target.value)}
                      placeholder="${GITHUB_TOKEN}"
                      className="flex-1 px-2 py-1 bg-[#161b22] border border-[#30363d] focus:border-purple-400 rounded text-[10px] font-mono text-gray-200 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleAddMcpEnv}
                      className="px-2 py-1 bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] rounded text-[10px] text-purple-300 font-medium cursor-pointer"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* SSE / HTTP Transport Details */}
            {(formData.mcpConfig?.transport === 'sse' || formData.mcpConfig?.transport === 'http') && (
              <div className="space-y-2.5 pt-2 border-t border-[#30363d]">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold tracking-tight text-gray-400">
                    Remote MCP SSE Endpoint URL
                  </label>
                  <input
                    type="text"
                    value={formData.mcpConfig?.serverUrl || formData.endpointUrl || ''}
                    onChange={(e) => {
                      handleUpdateMcpConfig({ serverUrl: e.target.value });
                      handleUpdate({ endpointUrl: e.target.value });
                    }}
                    placeholder="http://localhost:8000/sse"
                    className="w-full px-2.5 py-1.5 bg-[#161b22] border border-[#30363d] focus:border-purple-400 rounded text-[11px] font-mono text-cyan-300 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold tracking-tight text-gray-400">
                    Authorization Header / Secret Key
                  </label>
                  <input
                    type="text"
                    value={formData.authKeyEnv || ''}
                    onChange={(e) => handleUpdate({ authKeyEnv: e.target.value })}
                    placeholder="MCP_SERVER_BEARER_TOKEN"
                    className="w-full px-2.5 py-1.5 bg-[#161b22] border border-[#30363d] focus:border-purple-400 rounded text-[11px] font-mono text-amber-300 focus:outline-none"
                  />
                </div>
              </div>
            )}

            {/* Exposed Tools Filter */}
            <div className="space-y-1 pt-2 border-t border-[#30363d]">
              <label className="text-[10px] uppercase font-bold tracking-tight text-gray-400">
                Exposed Tool Scope Filter
              </label>
              <input
                type="text"
                value={(formData.mcpConfig?.exposedTools || ['*']).join(', ')}
                onChange={(e) => handleUpdateMcpConfig({ 
                  exposedTools: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) 
                })}
                placeholder="* (All tools) or read_file, write_file, list_directory"
                className="w-full px-2.5 py-1.5 bg-[#161b22] border border-[#30363d] focus:border-purple-400 rounded text-[11px] font-mono text-gray-200 focus:outline-none"
              />
              <div className="text-[9px] text-gray-400 font-mono">
                Use <code className="text-purple-300">*</code> to auto-expose all tools discovered from the MCP server
              </div>
            </div>

            {/* Test Connection & Discover Tools Simulator */}
            <div className="pt-2 border-t border-[#30363d] space-y-2">
              <button
                type="button"
                onClick={handleTestMcpConnection}
                disabled={mcpTestStatus === 'testing'}
                className="w-full py-1.5 bg-purple-950/60 hover:bg-purple-900/80 border border-purple-500/40 text-purple-200 rounded text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              >
                {mcpTestStatus === 'testing' ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-purple-300" />
                    <span>Connecting to MCP Server...</span>
                  </>
                ) : (
                  <>
                    <Activity className="w-3.5 h-3.5 text-purple-400" />
                    <span>Test MCP Handshake & List Tools</span>
                  </>
                )}
              </button>

              {mcpTestStatus === 'success' && (
                <div className="p-2.5 bg-[#161b22] rounded border border-green-500/40 space-y-1.5 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1 text-green-400 font-bold">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Handshake Connected (v1.0)</span>
                    </div>
                    <span className="text-[10px] font-mono text-gray-400">{mcpLatencyMs}ms latency</span>
                  </div>
                  <div className="text-[10px] text-gray-300">
                    Discovered <span className="text-purple-300 font-bold font-mono">{mcpDiscoveredTools.length} tools</span>:
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {mcpDiscoveredTools.map((t) => (
                      <span key={t} className="px-1.5 py-0.5 rounded bg-purple-950 text-purple-200 border border-purple-500/30 text-[9px] font-mono">
                        {t}()
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* What the Code in the Tool Should Do (Prompt / Code Directive) */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-bold uppercase tracking-tight text-green-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-green-400" />
              <span>What the Code in the Tool Should Do</span>
            </label>
            <span className="text-[10px] text-gray-400 font-mono">Prompt / Code Directive</span>
          </div>

          <div className="relative group">
            <textarea
              rows={5}
              value={formData.codePrompt || ''}
              onChange={(e) => handleUpdate({ codePrompt: e.target.value })}
              placeholder={formData.type === 'mcp' 
                ? "Describe which MCP tools should be called, default arguments, or routing behavior (e.g. 'Use github-mcp to search repositories and inspect recent pull request diffs.')"
                : "Describe what the code in the tool should do (e.g. 'Call the Twitter API endpoint https://api.twitter.com/2/tweets/search/recent with query parameters `query` to get a list of recent tweets.')"
              }
              className="w-full min-h-[110px] max-h-[300px] px-3 py-2 bg-[#0d1117] border border-[#30363d] focus:border-green-400 rounded-lg text-xs text-gray-200 focus:outline-none resize-y font-mono leading-relaxed selection:bg-green-900 selection:text-white"
            />
            <div className="text-[10px] text-gray-400 mt-1 flex items-center justify-between">
              <span>Used during LLM tool-calling & code generation</span>
              <span className="text-[9px] font-mono text-gray-400">↕ Drag to resize</span>
            </div>
          </div>
        </div>

        {/* API Endpoint & Auth Environment Variable (for REST API) */}
        {formData.type === 'api' && (
          <div className="space-y-3 bg-[#0d1117] p-3 rounded-lg border border-[#30363d]">
            <div className="flex items-center gap-1 text-green-400 font-bold text-xs">
              <Link className="w-3.5 h-3.5" />
              <span>API Endpoint & Credentials</span>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold tracking-tight text-gray-400">
                Target Endpoint URL
              </label>
              <input
                type="text"
                value={formData.endpointUrl || ''}
                onChange={(e) => handleUpdate({ endpointUrl: e.target.value })}
                placeholder="https://api.twitter.com/2/tweets/search/recent"
                className="w-full px-2.5 py-1.5 bg-[#161b22] border border-[#30363d] focus:border-green-400 rounded text-[11px] font-mono text-green-300 focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold tracking-tight text-gray-400 flex items-center gap-1">
                <Key className="w-3 h-3 text-amber-400" />
                API Key / Secret Environment Variable
              </label>
              <input
                type="text"
                value={formData.authKeyEnv || ''}
                onChange={(e) => handleUpdate({ authKeyEnv: e.target.value })}
                placeholder="TWITTER_BEARER_TOKEN"
                className="w-full px-2.5 py-1.5 bg-[#161b22] border border-[#30363d] focus:border-green-400 rounded text-[11px] font-mono text-amber-300 focus:outline-none"
              />
            </div>
          </div>
        )}

        {/* Input Parameters / Arguments Schema */}
        <div className="space-y-2 p-3 bg-[#0d1117] rounded-lg border border-[#30363d]">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-bold uppercase tracking-tight text-gray-400 flex items-center gap-1">
              <Sliders className="w-3 h-3 text-blue-400" />
              Tool Parameters ({Object.keys(formData.parameters || {}).length})
            </label>
          </div>

          <div className="space-y-1.5 max-h-32 overflow-y-auto">
            {Object.entries(formData.parameters || {}).map(([paramName, paramDesc]) => (
              <div
                key={paramName}
                className="flex items-center justify-between bg-[#161b22] px-2 py-1.5 rounded border border-[#30363d] text-[11px] font-mono"
              >
                <div className="min-w-0">
                  <span className="text-green-300 font-bold">{paramName}</span>
                  <span className="text-gray-400 text-[10px] ml-1.5 truncate">({paramDesc})</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveParam(paramName)}
                  className="text-gray-400 hover:text-rose-400 cursor-pointer p-0.5"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex gap-1 pt-1">
            <input
              type="text"
              value={newParamKey}
              onChange={(e) => setNewParamKey(e.target.value)}
              placeholder="Param name (e.g. query)"
              className="flex-1 px-2 py-1 bg-[#161b22] border border-[#30363d] focus:border-green-400 rounded text-[10px] font-mono text-gray-200 focus:outline-none"
            />
            <input
              type="text"
              value={newParamVal}
              onChange={(e) => setNewParamVal(e.target.value)}
              placeholder="Type / Description"
              className="flex-1 px-2 py-1 bg-[#161b22] border border-[#30363d] focus:border-green-400 rounded text-[10px] font-mono text-gray-200 focus:outline-none"
            />
            <button
              type="button"
              onClick={handleAddParam}
              className="px-2.5 py-1 bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] rounded text-[10px] text-green-300 font-medium cursor-pointer"
            >
              Add
            </button>
          </div>
        </div>

        {/* Attach to Selected Agent Shortcut (if agent selected) */}
        {selectedAgent && onAttachToAgent && (
          <div className="p-3 bg-blue-950/30 rounded-lg border border-blue-500/30 space-y-2">
            <div className="flex items-center gap-1.5 text-blue-300 font-bold text-xs">
              <Bot className="w-3.5 h-3.5 text-blue-400" />
              <span>Target Agent: {selectedAgent.label}</span>
            </div>
            {isAlreadyAttached ? (
              <div className="text-[10px] text-emerald-400 flex items-center gap-1">
                <Check className="w-3 h-3" />
                <span>This tool is currently attached to {selectedAgent.label}</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onAttachToAgent(selectedAgent.id, formData)}
                className="w-full py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Attach to {selectedAgent.label}</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Footer Controls */}
      <div className="px-4 py-3 bg-[#161b22] border-t border-[#30363d] shrink-0 flex items-center justify-between">
        {onDeleteTool && (formData.id.startsWith('tool_custom_') || formData.id.startsWith('tool_mcp_')) ? (
          <button
            type="button"
            onClick={() => {
              onDeleteTool(formData.id);
              onClose();
            }}
            className="px-2.5 py-1.5 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 rounded border border-rose-500/30 transition-colors cursor-pointer flex items-center gap-1"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete</span>
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
            className={`px-4 py-1.5 text-xs font-bold rounded-lg text-white transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm ${
              formData.type === 'mcp'
                ? 'bg-purple-600 hover:bg-purple-500'
                : 'bg-green-600 hover:bg-green-500'
            }`}
          >
            {savedSuccess ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
            <span>{savedSuccess ? 'Saved!' : 'Save Tool'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
