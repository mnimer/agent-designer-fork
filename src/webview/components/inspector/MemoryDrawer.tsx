/**
 * MemoryDrawer
 *
 * Dedicated property inspector drawer component for configuring agent session memory
 * and production checkpointer backends.
 *
 * Job inside Application:
 * Renders an intuitive UI for developers to select and configure memory backends (Stateless,
 * In-Memory Turn Buffer, Google Cloud Firestore, Google Cloud SQL, Google Cloud Spanner,
 * and Cloud Memorystore Redis). Emits configuration updates to parent.
 *
 * Architectural Decisions:
 * 1. Follows strict 8pt grid system for spacing (multiples of 8px).
 * 2. Unidirectional data flow: props down (memoryConfig), events up (onUpdateMemoryConfig).
 * 3. Specialized parameter forms for each checkpointer provider ensuring validation of mandatory fields.
 * 4. Rich metadata cards showcasing category, badge, description, and recommended use case.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import React from 'react';
import { 
  Brain, 
  Database, 
  Flame, 
  Zap, 
  Boxes, 
  Cpu, 
  Ban, 
  ShieldCheck, 
  AlertCircle 
} from 'lucide-react';
import { AgentMemoryConfig, AgentMemoryType } from '../../types';
import { MEMORY_OPTIONS, getMemoryOption } from '../../data/memoryOptions';
import { MemoryConfigSection } from './MemoryConfigSection';

export interface MemoryDrawerProps {
  memoryConfig?: AgentMemoryConfig;
  onUpdateMemoryConfig: (config: AgentMemoryConfig) => void;
  isRootNode?: boolean;
}

export const MemoryDrawer: React.FC<MemoryDrawerProps> = ({
  memoryConfig,
  onUpdateMemoryConfig,
  isRootNode = true,
}) => {
  // NOTE: Default to 'in_memory' turn buffer if undefined
  const currentType: AgentMemoryType = (memoryConfig?.type as AgentMemoryType) || 'in_memory';
  const currentOption = getMemoryOption(currentType);

  // NOTE: Handles switching memory provider and applying provider default parameters
  const handleTypeChange = (newType: AgentMemoryType) => {
    const optionDef = getMemoryOption(newType);
    const updated: AgentMemoryConfig = {
      ...optionDef.defaultConfig,
      ...memoryConfig,
      type: newType,
    };
    onUpdateMemoryConfig(updated);
  };

  // NOTE: Updates a single field in the memory configuration
  const handleFieldChange = (field: keyof AgentMemoryConfig, value: any) => {
    onUpdateMemoryConfig({
      ...(memoryConfig || { type: currentType }),
      [field]: value,
    });
  };

  return (
    <div className="space-y-3 pt-2 border-t border-[#30363d]" data-testid="memory-drawer">
      {/* Header */}
      <div className="flex items-center justify-between">
        <label className="text-[11px] font-bold uppercase tracking-tight text-cyan-400 flex items-center gap-1.5">
          <Brain className="w-3.5 h-3.5 text-cyan-400" />
          <span>Memory & Checkpointing</span>
        </label>
        {isRootNode && (
          <span className="text-[9px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
            Root Session Checkpointer
          </span>
        )}
      </div>

      <div className="bg-[#0d1117] p-3 rounded-lg border border-cyan-500/30 space-y-3">
        {/* Memory Provider Selection Dropdown */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold uppercase tracking-tight text-gray-300 flex items-center justify-between">
            <span>State Storage / Memory Provider</span>
            <span className="text-[9px] font-normal text-cyan-400 px-1.5 py-0.5 rounded bg-cyan-950/60 border border-cyan-500/30">
              {currentOption.badge}
            </span>
          </label>
          <select
            data-testid="memory-type-select"
            value={currentType}
            onChange={(e) => handleTypeChange(e.target.value as AgentMemoryType)}
            className="w-full px-2.5 py-1.5 bg-[#161b22] border border-cyan-500/40 focus:border-cyan-400 rounded-lg text-xs text-cyan-200 font-medium focus:outline-none cursor-pointer"
          >
            {MEMORY_OPTIONS.map((opt) => (
              <option key={opt.type} value={opt.type} className="bg-[#161b22] text-gray-200">
                {opt.name}
              </option>
            ))}
          </select>
        </div>

        {/* Provider Description & Metadata Card */}
        <div className="p-2.5 rounded-lg bg-[#161b22] border border-[#30363d] text-[11px] text-gray-300 leading-relaxed space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-cyan-300 font-semibold text-xs flex items-center gap-1.5">
              {currentOption.name}
            </span>
            <span className="text-[9px] uppercase tracking-wider text-gray-400 font-mono">
              {currentOption.category}
            </span>
          </div>
          <p className="text-gray-400 text-[10px]">
            {currentOption.description}
          </p>
          <div className="pt-1.5 border-t border-[#30363d] text-[9px] text-gray-400 flex items-start gap-1">
            <strong className="text-gray-300 shrink-0">Best for:</strong>
            <span>{currentOption.bestFor}</span>
          </div>
        </div>

        {/* ==================================================================== */}
        {/* Specialized Provider Form Fields */}
        {/* ==================================================================== */}

        {/* 1. In-Memory Turn Buffer */}
        {(currentType === 'in_memory' || currentType === 'langgraph_in_memory' || currentType === 'window_buffer') && (
          <div className="space-y-2.5 pt-2 border-t border-[#30363d]" data-testid="in-memory-form">
            <div className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1">
              <Cpu className="w-3 h-3" />
              <span>In-Memory Turn Buffer Configuration</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[10px] text-gray-400">Window Turns</label>
                <input
                  type="number"
                  data-testid="memory-window-turns"
                  value={memoryConfig?.windowTurns ?? 10}
                  onChange={(e) => handleFieldChange('windowTurns', parseInt(e.target.value, 10) || 10)}
                  placeholder="10"
                  className="w-full px-2.5 py-1 bg-[#161b22] border border-[#30363d] focus:border-cyan-500 rounded text-xs text-white font-mono"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-gray-400">Max Tokens</label>
                <input
                  type="number"
                  data-testid="memory-max-tokens"
                  value={memoryConfig?.maxTokens ?? 4096}
                  onChange={(e) => handleFieldChange('maxTokens', parseInt(e.target.value, 10) || 4096)}
                  placeholder="4096"
                  className="w-full px-2.5 py-1 bg-[#161b22] border border-[#30363d] focus:border-cyan-500 rounded text-xs text-white font-mono"
                />
              </div>
            </div>
          </div>
        )}

        {/* 2. Google Cloud Firestore Checkpointer */}
        {currentType === 'firestore' && (
          <div className="space-y-2.5 pt-2 border-t border-[#30363d]" data-testid="firestore-form">
            <div className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1">
              <Flame className="w-3 h-3 text-orange-400" />
              <span>Cloud Firestore Configuration</span>
            </div>
            <div className="space-y-2">
              <div className="space-y-1">
                <label className="text-[10px] text-gray-400">Collection Name</label>
                <input
                  type="text"
                  data-testid="memory-collection-name"
                  value={memoryConfig?.collectionName ?? 'agent_sessions'}
                  onChange={(e) => handleFieldChange('collectionName', e.target.value)}
                  placeholder="agent_sessions"
                  className="w-full px-2.5 py-1 bg-[#161b22] border border-[#30363d] focus:border-cyan-500 rounded text-xs text-white font-mono"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-gray-400">Database ID <span className="text-[9px] text-gray-500">(Optional)</span></label>
                <input
                  type="text"
                  data-testid="memory-database-id"
                  value={memoryConfig?.databaseId ?? '(default)'}
                  onChange={(e) => handleFieldChange('databaseId', e.target.value)}
                  placeholder="(default)"
                  className="w-full px-2.5 py-1 bg-[#161b22] border border-[#30363d] focus:border-cyan-500 rounded text-xs text-white font-mono"
                />
              </div>
            </div>
          </div>
        )}

        {/* 3. Google Cloud SQL (PostgreSQL / MySQL) */}
        {(currentType === 'postgres' || currentType === 'cloud_sql') && (
          <div className="space-y-2.5 pt-2 border-t border-[#30363d]" data-testid="cloud-sql-form">
            <div className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1">
              <Database className="w-3 h-3 text-blue-400" />
              <span>Cloud SQL (PostgreSQL) Configuration</span>
            </div>
            <div className="space-y-2">
              <div className="space-y-1">
                <label className="text-[10px] text-gray-400 flex items-center justify-between">
                  <span>Instance Connection Name <span className="text-red-400">*</span></span>
                  <span className="text-[9px] text-gray-500 font-mono">project:region:instance</span>
                </label>
                <input
                  type="text"
                  data-testid="memory-sql-instance"
                  value={memoryConfig?.instanceConnectionName ?? ''}
                  onChange={(e) => handleFieldChange('instanceConnectionName', e.target.value)}
                  placeholder="my-gcp-project:us-central1:agent-db-instance"
                  className="w-full px-2.5 py-1 bg-[#161b22] border border-[#30363d] focus:border-cyan-500 rounded text-xs text-white font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] text-gray-400">Database Name <span className="text-red-400">*</span></label>
                  <input
                    type="text"
                    data-testid="memory-sql-database"
                    value={memoryConfig?.databaseName ?? 'agent_sessions_db'}
                    onChange={(e) => handleFieldChange('databaseName', e.target.value)}
                    placeholder="agent_sessions_db"
                    className="w-full px-2.5 py-1 bg-[#161b22] border border-[#30363d] focus:border-cyan-500 rounded text-xs text-white font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-gray-400">Table Name</label>
                  <input
                    type="text"
                    data-testid="memory-sql-table"
                    value={memoryConfig?.tableName ?? 'agent_sessions'}
                    onChange={(e) => handleFieldChange('tableName', e.target.value)}
                    placeholder="agent_sessions"
                    className="w-full px-2.5 py-1 bg-[#161b22] border border-[#30363d] focus:border-cyan-500 rounded text-xs text-white font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-gray-400">Database Secret / Env Var <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  data-testid="memory-sql-secret"
                  value={memoryConfig?.databaseUrlSecret ?? 'DATABASE_URL'}
                  onChange={(e) => handleFieldChange('databaseUrlSecret', e.target.value)}
                  placeholder="DATABASE_URL"
                  className="w-full px-2.5 py-1 bg-[#161b22] border border-[#30363d] focus:border-cyan-500 rounded text-xs text-white font-mono"
                />
                <span className="text-[9px] text-gray-500">Secret Manager variable containing database credentials</span>
              </div>
            </div>
          </div>
        )}

        {/* 4. Google Cloud Spanner Enterprise Checkpointer */}
        {currentType === 'spanner' && (
          <div className="space-y-2.5 pt-2 border-t border-[#30363d]" data-testid="spanner-form">
            <div className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1">
              <Boxes className="w-3 h-3 text-emerald-400" />
              <span>Cloud Spanner Enterprise Configuration</span>
            </div>
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] text-gray-400">Spanner Instance ID <span className="text-red-400">*</span></label>
                  <input
                    type="text"
                    data-testid="memory-spanner-instance"
                    value={memoryConfig?.instanceId ?? ''}
                    onChange={(e) => handleFieldChange('instanceId', e.target.value)}
                    placeholder="spanner-instance-1"
                    className="w-full px-2.5 py-1 bg-[#161b22] border border-[#30363d] focus:border-cyan-500 rounded text-xs text-white font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-gray-400">Database ID <span className="text-red-400">*</span></label>
                  <input
                    type="text"
                    data-testid="memory-spanner-database"
                    value={memoryConfig?.databaseId ?? ''}
                    onChange={(e) => handleFieldChange('databaseId', e.target.value)}
                    placeholder="agent-sessions"
                    className="w-full px-2.5 py-1 bg-[#161b22] border border-[#30363d] focus:border-cyan-500 rounded text-xs text-white font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-gray-400">Table Name</label>
                <input
                  type="text"
                  data-testid="memory-spanner-table"
                  value={memoryConfig?.tableName ?? 'AgentSessions'}
                  onChange={(e) => handleFieldChange('tableName', e.target.value)}
                  placeholder="AgentSessions"
                  className="w-full px-2.5 py-1 bg-[#161b22] border border-[#30363d] focus:border-cyan-500 rounded text-xs text-white font-mono"
                />
              </div>
            </div>
          </div>
        )}

        {/* 5. Cloud Memorystore (Redis / Valkey) Checkpointer */}
        {currentType === 'redis' && (
          <div className="space-y-2.5 pt-2 border-t border-[#30363d]" data-testid="redis-form">
            <div className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1">
              <Zap className="w-3 h-3 text-yellow-400" />
              <span>Cloud Memorystore (Redis) Configuration</span>
            </div>
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2 space-y-1">
                  <label className="text-[10px] text-gray-400">Redis Host IP / DNS <span className="text-red-400">*</span></label>
                  <input
                    type="text"
                    data-testid="memory-redis-host"
                    value={memoryConfig?.redisHost ?? ''}
                    onChange={(e) => handleFieldChange('redisHost', e.target.value)}
                    placeholder="10.0.0.5"
                    className="w-full px-2.5 py-1 bg-[#161b22] border border-[#30363d] focus:border-cyan-500 rounded text-xs text-white font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-gray-400">Port <span className="text-red-400">*</span></label>
                  <input
                    type="number"
                    data-testid="memory-redis-port"
                    value={memoryConfig?.redisPort ?? 6379}
                    onChange={(e) => handleFieldChange('redisPort', parseInt(e.target.value, 10) || 6379)}
                    placeholder="6379"
                    className="w-full px-2.5 py-1 bg-[#161b22] border border-[#30363d] focus:border-cyan-500 rounded text-xs text-white font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] text-gray-400">Session TTL (Seconds)</label>
                  <input
                    type="number"
                    data-testid="memory-redis-ttl"
                    value={memoryConfig?.ttlSeconds ?? 86400}
                    onChange={(e) => handleFieldChange('ttlSeconds', parseInt(e.target.value, 10) || 86400)}
                    placeholder="86400"
                    className="w-full px-2.5 py-1 bg-[#161b22] border border-[#30363d] focus:border-cyan-500 rounded text-xs text-white font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-gray-400">AUTH Secret <span className="text-[9px] text-gray-500">(Optional)</span></label>
                  <input
                    type="text"
                    data-testid="memory-redis-secret"
                    value={memoryConfig?.authSecretName ?? ''}
                    onChange={(e) => handleFieldChange('authSecretName', e.target.value)}
                    placeholder="REDIS_AUTH_TOKEN"
                    className="w-full px-2.5 py-1 bg-[#161b22] border border-[#30363d] focus:border-cyan-500 rounded text-xs text-white font-mono"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Cross-Session Long-Term Memory (TASK-236) and Artifact Storage (TASK-224) */}
      <MemoryConfigSection
        memoryConfig={memoryConfig}
        onUpdateMemoryConfig={onUpdateMemoryConfig}
      />
    </div>
  );
};
