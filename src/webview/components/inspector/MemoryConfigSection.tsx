/**
 * MemoryConfigSection
 *
 * Dedicated configuration inspector section for Long-Term Cross-Session Memory (TASK-236)
 * and Artifact Storage Services (TASK-224) in the Visual Agent Designer.
 *
 * Job inside Application:
 * Provides user interface controls and Python ADK codegen snippets for:
 * 1. BaseMemoryService: Vertex AI Memory Bank, Vertex AI RAG Memory, and In-Memory Memory.
 * 2. BaseArtifactService: Google Cloud Storage (GCS) and In-Memory Artifacts with
 *    multimodal versioning and session vs. user namespace scoping.
 *
 * Architectural Decisions:
 * 1. Adheres to 8pt grid system for spacing (p-2, p-3, p-4, gap-2, gap-4).
 * 2. Pure unidirectional data flow ("props down, events up").
 * 3. Exports pure codegen helper functions for Python ADK service initialization.
 * 4. Namespace scoping conforms to ADK standard: user:filename for user scope, filename for session.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import React from 'react';
import {
  BrainCircuit,
  Database,
  Archive,
  Cloud,
  FileCode,
  Layers,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  HardDrive,
  Cpu,
  Info,
} from 'lucide-react';
import {
  AgentMemoryConfig,
  LongTermMemoryConfig,
  LongTermMemoryServiceType,
  ArtifactServiceConfig,
  ArtifactServiceType,
} from '../../../shared/agentSpec';

export interface MemoryConfigSectionProps {
  memoryConfig?: AgentMemoryConfig;
  onUpdateMemoryConfig: (config: AgentMemoryConfig) => void;
}

/**
 * Metadata and user-facing explanations for each Cross-Session Long-Term Memory provider.
 */
export const LONG_TERM_MEMORY_OPTION_DESCRIPTIONS: Record<
  LongTermMemoryServiceType,
  { title: string; badge: string; description: string; bestFor: string }
> = {
  none: {
    title: 'Disabled (Session-Only)',
    badge: 'Single Thread',
    description:
      'Each new conversation thread starts with a blank slate and cannot recall facts or conversations from previous sessions.',
    bestFor: 'Single-session workflows and stateless task execution.',
  },
  in_memory: {
    title: 'InMemoryMemoryService',
    badge: 'Local Dev RAM',
    description:
      'Stores completed sessions in local Python process RAM and performs basic keyword matching across sessions. Cleared when the process restarts.',
    bestFor: 'Local development, unit testing, and quick prototyping without cloud setup.',
  },
  vertex_ai_memory_bank: {
    title: 'VertexAiMemoryBankService',
    badge: 'Managed Fact Extraction',
    description:
      'Uses an LLM on Vertex AI Agent Engine to automatically distill durable user facts and preferences from completed sessions and recall them in future conversations.',
    bestFor: 'Personalized assistants that remember user preferences, profile facts, and recurring context.',
  },
  vertex_ai_rag: {
    title: 'VertexAiRagMemoryService',
    badge: 'Vector Transcript Search',
    description:
      'Embeds and indexes raw session transcripts into a Vertex AI RAG Corpus, performing semantic vector similarity search over past conversations.',
    bestFor: 'Deep historical recall across long technical, support, or research transcripts.',
  },
};

/**
 * Metadata and user-facing explanations for each Artifact Storage Service backend.
 */
export const ARTIFACT_SERVICE_OPTION_DESCRIPTIONS: Record<
  ArtifactServiceType,
  { title: string; badge: string; description: string; bestFor: string }
> = {
  none: {
    title: 'Disabled (No Artifact Storage)',
    badge: 'Text / State Only',
    description:
      'Binary file uploads and agent-generated document artifacts (PDFs, images, CSVs) are not persisted via an ADK ArtifactService.',
    bestFor: 'Conversational or structured-state agents that do not generate or store binary files.',
  },
  in_memory: {
    title: 'InMemoryArtifactService',
    badge: 'Local Dev RAM',
    description:
      'Stores uploaded and generated binary artifacts in local Python process RAM with automatic version numbers (v0, v1, ...). Cleared when the process restarts.',
    bestFor: 'Local development, unit testing, and ephemeral file processing.',
  },
  gcs: {
    title: 'GcsArtifactService',
    badge: 'Cloud Storage Bucket',
    description:
      'Persists multimodal files and binary outputs in a Google Cloud Storage bucket with version history and session-level or user-level (user:filename) scoping.',
    bestFor: 'Production agents generating or ingesting PDFs, charts, images, CSV exports, and audio.',
  },
};

/**
 * Common standard MIME types supported for ADK artifact file uploads and outputs.
 */
export const DEFAULT_ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'text/csv',
  'audio/wav',
  'application/json',
  'text/plain',
];

/**
 * Formats an artifact namespace key according to its scope.
 * ADK specification rules:
 * - Scope 'user': 'user:{filename}' (persistent across all sessions for the user)
 * - Scope 'session': '{filename}' (scoped to current conversation thread)
 *
 * @param filename File name of the artifact
 * @param scope Namespace scope ('session' | 'user')
 * @returns Formatted namespace key string
 */
export function formatArtifactNamespaceKey(filename: string, scope: 'session' | 'user'): string {
  // NOTE: Prepend user: prefix when user scope is active
  if (scope === 'user') {
    return `user:${filename}`;
  }
  return filename;
}

/**
 * Builds the Python ADK initialization code snippet for Long-Term Cross-Session Memory.
 *
 * @param config Long-term memory configuration
 * @returns Executable Python ADK code string
 */
export function buildLongTermMemoryCodeSnippet(config?: LongTermMemoryConfig): string {
  // Section 1: Validation and Disabled Guard
  if (!config || config.serviceType === 'none') {
    return '# Long-term cross-session memory is disabled';
  }

  // Section 2: In-Memory Testing Service
  if (config.serviceType === 'in_memory') {
    return `from google.adk.memory import InMemoryMemoryService

# In-memory long-term memory service for local testing
memory_service = InMemoryMemoryService()`;
  }

  // Section 3: Vertex AI Memory Bank Service
  if (config.serviceType === 'vertex_ai_memory_bank') {
    const engineIdParam = config.agentEngineId
      ? `"${config.agentEngineId}"`
      : 'os.environ.get("VERTEX_AI_AGENT_ENGINE_ID")';

    let code = `from google.adk.memory import VertexAiMemoryBankService

# Vertex AI Memory Bank for managed user fact extraction & recall
memory_service = VertexAiMemoryBankService(
    agent_engine_id=${engineIdParam},
)`;

    if (config.autoSaveSessionToMemory) {
      code += `\n\ndef after_agent_callback(callback_context):
    """Auto-saves completed session turns to Vertex AI Memory Bank."""
    memory_service.add_session_to_memory(callback_context.session)`;
    }
    return code;
  }

  // Section 4: Vertex AI RAG Memory Service
  if (config.serviceType === 'vertex_ai_rag') {
    const corpusIdParam = config.ragCorpusId
      ? `"${config.ragCorpusId}"`
      : 'os.environ.get("VERTEX_AI_RAG_CORPUS_ID")';
    const topK = config.similarityTopK ?? 5;
    const threshold = config.vectorDistanceThreshold ?? 0.7;

    let code = `from google.adk.memory import VertexAiRagMemoryService

# Vertex AI RAG memory service for semantic corpus session recall
memory_service = VertexAiRagMemoryService(
    rag_corpus_id=${corpusIdParam},
    similarity_top_k=${topK},
    vector_distance_threshold=${threshold},
)`;

    if (config.autoSaveSessionToMemory) {
      code += `\n\ndef after_agent_callback(callback_context):
    """Auto-saves completed session turns to Vertex AI RAG memory corpus."""
    memory_service.add_session_to_memory(callback_context.session)`;
    }
    return code;
  }

  return '# Unsupported long-term memory service type';
}

/**
 * Builds the Python ADK initialization code snippet for Artifact Storage.
 *
 * @param config Artifact service configuration
 * @returns Executable Python ADK code string
 */
export function buildArtifactServiceCodeSnippet(config?: ArtifactServiceConfig): string {
  // Section 1: Validation and Disabled Guard
  if (!config || config.type === 'none') {
    return '# Artifact service is disabled';
  }

  // Section 2: In-Memory Artifact Service
  if (config.type === 'in_memory') {
    return `from google.adk.artifacts import InMemoryArtifactService

# Ephemeral in-memory artifact storage for session files and binaries
artifact_service = InMemoryArtifactService()`;
  }

  // Section 3: Google Cloud Storage (GCS) Artifact Service
  if (config.type === 'gcs') {
    const bucketParam = config.gcsBucketName
      ? `"${config.gcsBucketName}"`
      : 'os.environ.get("GCS_ARTIFACTS_BUCKET")';
    const versioningComment = config.enableVersioning
      ? '\n# Versioning enabled: automatic increment v1, v2, ...'
      : '';
    const scopeComment = config.defaultScope
      ? `\n# Default namespace scope: ${config.defaultScope} (use user:filename for cross-session artifacts)`
      : '';
    const mimeComment =
      config.allowedMimeTypes && config.allowedMimeTypes.length > 0
        ? `\n# Allowed MIME types: ${config.allowedMimeTypes.join(', ')}`
        : '';

    return `from google.adk.artifacts import GcsArtifactService

# Google Cloud Storage Artifact Service for persistent versioned binaries${versioningComment}${scopeComment}${mimeComment}
artifact_service = GcsArtifactService(
    bucket_name=${bucketParam},
)`;
  }

  return '# Unsupported artifact service type';
}

/**
 * MemoryConfigSection Component
 *
 * Renders drawer sections for:
 * 1. Long-Term Cross-Session Memory (TASK-236)
 * 2. Artifact Storage Service (TASK-224)
 */
export const MemoryConfigSection: React.FC<MemoryConfigSectionProps> = ({
  memoryConfig,
  onUpdateMemoryConfig,
}) => {
  // Section 1: Extract configurations with sensible defaults
  const longTermConfig: LongTermMemoryConfig = memoryConfig?.longTermMemory || {
    serviceType: 'none',
    similarityTopK: 5,
    vectorDistanceThreshold: 0.7,
    autoSaveSessionToMemory: false,
  };

  const artifactConfig: ArtifactServiceConfig = memoryConfig?.artifactConfig || {
    type: 'none',
    defaultScope: 'session',
    enableVersioning: false,
    allowedMimeTypes: [...DEFAULT_ALLOWED_MIME_TYPES],
  };

  // Section 2: Handlers for Long-Term Memory changes
  const handleLongTermFieldChange = (updates: Partial<LongTermMemoryConfig>) => {
    const updatedLongTerm: LongTermMemoryConfig = {
      ...longTermConfig,
      ...updates,
    };
    onUpdateMemoryConfig({
      ...(memoryConfig || { type: 'in_memory' }),
      longTermMemory: updatedLongTerm,
    });
  };

  const handleLongTermServiceTypeChange = (serviceType: LongTermMemoryServiceType) => {
    handleLongTermFieldChange({
      serviceType,
      similarityTopK: longTermConfig.similarityTopK ?? 5,
      vectorDistanceThreshold: longTermConfig.vectorDistanceThreshold ?? 0.7,
    });
  };

  // Section 3: Handlers for Artifact Storage changes
  const handleArtifactFieldChange = (updates: Partial<ArtifactServiceConfig>) => {
    const updatedArtifact: ArtifactServiceConfig = {
      ...artifactConfig,
      ...updates,
    };
    onUpdateMemoryConfig({
      ...(memoryConfig || { type: 'in_memory' }),
      artifactConfig: updatedArtifact,
    });
  };

  const handleArtifactTypeChange = (type: ArtifactServiceType) => {
    handleArtifactFieldChange({
      type,
      defaultScope: artifactConfig.defaultScope ?? 'session',
      enableVersioning: artifactConfig.enableVersioning ?? false,
      allowedMimeTypes: artifactConfig.allowedMimeTypes ?? [...DEFAULT_ALLOWED_MIME_TYPES],
    });
  };

  const handleToggleMimeType = (mime: string) => {
    const currentList = artifactConfig.allowedMimeTypes || [];
    const updatedList = currentList.includes(mime)
      ? currentList.filter((m) => m !== mime)
      : [...currentList, mime];
    handleArtifactFieldChange({ allowedMimeTypes: updatedList });
  };

  return (
    <div className="space-y-4 pt-3 border-t border-[#30363d]" data-testid="memory-config-section">
      {/* ==================================================================== */}
      {/* LAYER 2: LONG-TERM CROSS-SESSION MEMORY (TASK-236)                  */}
      {/* ==================================================================== */}
      <div className="space-y-3 bg-[#0d1117] p-3 rounded-lg border border-purple-500/30">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-bold uppercase tracking-tight text-purple-400 flex items-center gap-1.5">
            <BrainCircuit className="w-3.5 h-3.5 text-purple-400" />
            <span>Cross-Session Long-Term Memory (ADK)</span>
          </label>
          <span className="text-[9px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-bold border border-purple-500/30">
            BaseMemoryService
          </span>
        </div>

        <p className="text-[10px] text-gray-400 leading-relaxed">
          Preserves knowledge and facts across multiple user sessions. Automatically recalls prior
          interactions and injects relevant context into the root agent.
        </p>

        {/* Service Type Selector */}
        <div className="space-y-2">
          <label className="text-[10px] font-bold uppercase tracking-tight text-gray-300">
            Memory Service Provider
          </label>
          <select
            data-testid="long-term-memory-service-select"
            value={longTermConfig.serviceType}
            onChange={(e) =>
              handleLongTermServiceTypeChange(e.target.value as LongTermMemoryServiceType)
            }
            className="w-full px-2.5 py-1.5 bg-[#161b22] border border-purple-500/40 focus:border-purple-400 rounded-lg text-xs text-purple-200 font-medium focus:outline-none cursor-pointer"
          >
            <option value="none" className="bg-[#161b22] text-gray-400">
              None (Disabled)
            </option>
            <option value="in_memory" className="bg-[#161b22] text-gray-200">
              InMemoryMemoryService (Local Dev / Testing)
            </option>
            <option value="vertex_ai_memory_bank" className="bg-[#161b22] text-gray-200">
              VertexAiMemoryBankService (Managed Fact Extraction &amp; Recall)
            </option>
            <option value="vertex_ai_rag" className="bg-[#161b22] text-gray-200">
              VertexAiRagMemoryService (Semantic Corpus Session Recall)
            </option>
          </select>

          {/* Dynamic Description Card for Selected Long-Term Memory Provider */}
          {(() => {
            const currentMeta =
              LONG_TERM_MEMORY_OPTION_DESCRIPTIONS[longTermConfig.serviceType] ||
              LONG_TERM_MEMORY_OPTION_DESCRIPTIONS.none;
            return (
              <div
                className="p-2.5 rounded-lg bg-[#161b22] border border-[#30363d] text-[10px] text-gray-400 leading-relaxed space-y-1.5"
                data-testid="long-term-memory-description-card"
              >
                <div className="flex items-center justify-between">
                  <span className="text-purple-300 font-semibold text-[11px]">
                    {currentMeta.title}
                  </span>
                  <span className="text-[9px] uppercase tracking-wider text-purple-300/80 font-mono bg-purple-950/50 px-1.5 py-0.5 rounded border border-purple-500/20">
                    {currentMeta.badge}
                  </span>
                </div>
                <p>{currentMeta.description}</p>
                <div className="pt-1 border-t border-[#30363d] text-[9px] text-gray-400 flex items-start gap-1">
                  <strong className="text-gray-300 shrink-0">Best for:</strong>
                  <span>{currentMeta.bestFor}</span>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Vertex AI Memory Bank Parameters */}
        {longTermConfig.serviceType === 'vertex_ai_memory_bank' && (
          <div
            className="space-y-2.5 pt-2 border-t border-[#30363d]"
            data-testid="vertex-ai-memory-bank-form"
          >
            <div className="space-y-1">
              <label className="text-[10px] text-gray-300 font-medium">
                Agent Engine / Reasoning Engine ID
              </label>
              <input
                type="text"
                data-testid="agent-engine-id-input"
                value={longTermConfig.agentEngineId ?? ''}
                onChange={(e) => handleLongTermFieldChange({ agentEngineId: e.target.value })}
                placeholder="projects/123/locations/global/reasoningEngines/456"
                className="w-full px-2.5 py-1.5 bg-[#161b22] border border-[#30363d] focus:border-purple-400 rounded text-xs text-white font-mono"
              />
              <span className="text-[9px] text-gray-500">
                Leave blank to resolve automatically from VERTEX_AI_AGENT_ENGINE_ID environment variable.
              </span>
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-gray-300 font-medium">
                Auto-save Session Turns to Memory
              </span>
              <input
                type="checkbox"
                data-testid="auto-save-session-checkbox"
                checked={longTermConfig.autoSaveSessionToMemory ?? false}
                onChange={(e) =>
                  handleLongTermFieldChange({ autoSaveSessionToMemory: e.target.checked })
                }
                className="rounded bg-[#161b22] border-[#30363d] text-purple-500 focus:ring-0 cursor-pointer"
              />
            </div>
            <p className="text-[9px] text-gray-400">
              Invokes <code className="text-purple-300">after_agent_callback</code> to persist session
              facts into Vertex AI Memory Bank upon turn completion.
            </p>
          </div>
        )}

        {/* Vertex AI RAG Memory Parameters */}
        {longTermConfig.serviceType === 'vertex_ai_rag' && (
          <div
            className="space-y-2.5 pt-2 border-t border-[#30363d]"
            data-testid="vertex-ai-rag-form"
          >
            <div className="space-y-1">
              <label className="text-[10px] text-gray-300 font-medium">
                Vertex AI RAG Corpus Resource ID <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                data-testid="rag-corpus-id-input"
                value={longTermConfig.ragCorpusId ?? ''}
                onChange={(e) => handleLongTermFieldChange({ ragCorpusId: e.target.value })}
                placeholder="projects/123/locations/us-central1/ragCorpora/789"
                className="w-full px-2.5 py-1.5 bg-[#161b22] border border-[#30363d] focus:border-purple-400 rounded text-xs text-white font-mono"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[10px] text-gray-400">Similarity Top-K</label>
                <input
                  type="number"
                  data-testid="similarity-top-k-input"
                  min={1}
                  max={20}
                  value={longTermConfig.similarityTopK ?? 5}
                  onChange={(e) =>
                    handleLongTermFieldChange({
                      similarityTopK: parseInt(e.target.value, 10) || 5,
                    })
                  }
                  className="w-full px-2.5 py-1 bg-[#161b22] border border-[#30363d] focus:border-purple-400 rounded text-xs text-white font-mono"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-gray-400">Distance Threshold</label>
                <input
                  type="number"
                  data-testid="vector-distance-threshold-input"
                  min={0}
                  max={1}
                  step={0.05}
                  value={longTermConfig.vectorDistanceThreshold ?? 0.7}
                  onChange={(e) =>
                    handleLongTermFieldChange({
                      vectorDistanceThreshold: parseFloat(e.target.value) || 0.7,
                    })
                  }
                  className="w-full px-2.5 py-1 bg-[#161b22] border border-[#30363d] focus:border-purple-400 rounded text-xs text-white font-mono"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-gray-300 font-medium">
                Auto-save Session Turns to Memory
              </span>
              <input
                type="checkbox"
                data-testid="auto-save-session-checkbox"
                checked={longTermConfig.autoSaveSessionToMemory ?? false}
                onChange={(e) =>
                  handleLongTermFieldChange({ autoSaveSessionToMemory: e.target.checked })
                }
                className="rounded bg-[#161b22] border-[#30363d] text-purple-500 focus:ring-0 cursor-pointer"
              />
            </div>
          </div>
        )}
      </div>

      {/* ==================================================================== */}
      {/* LAYER 3: ARTIFACT STORAGE SERVICE (TASK-224)                         */}
      {/* ==================================================================== */}
      <div className="space-y-3 bg-[#0d1117] p-3 rounded-lg border border-teal-500/30">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-bold uppercase tracking-tight text-teal-400 flex items-center gap-1.5">
            <Archive className="w-3.5 h-3.5 text-teal-400" />
            <span>Artifact Storage Service (ADK)</span>
          </label>
          <span className="text-[9px] px-2 py-0.5 rounded bg-teal-500/20 text-teal-300 font-bold border border-teal-500/30">
            BaseArtifactService
          </span>
        </div>

        <p className="text-[10px] text-gray-400 leading-relaxed">
          Provides multimodal binary and document storage (PDFs, images, CSVs) generated or
          ingested by the agent with versioning and scoping.
        </p>

        {/* Service Type Selector */}
        <div className="space-y-2">
          <label className="text-[10px] font-bold uppercase tracking-tight text-gray-300">
            Artifact Service Backend
          </label>
          <select
            data-testid="artifact-service-type-select"
            value={artifactConfig.type}
            onChange={(e) => handleArtifactTypeChange(e.target.value as ArtifactServiceType)}
            className="w-full px-2.5 py-1.5 bg-[#161b22] border border-teal-500/40 focus:border-teal-400 rounded-lg text-xs text-teal-200 font-medium focus:outline-none cursor-pointer"
          >
            <option value="none" className="bg-[#161b22] text-gray-400">
              None (Disabled)
            </option>
            <option value="in_memory" className="bg-[#161b22] text-gray-200">
              InMemoryArtifactService (Ephemeral Session Binaries)
            </option>
            <option value="gcs" className="bg-[#161b22] text-gray-200">
              GcsArtifactService (Persistent Google Cloud Storage Bucket)
            </option>
          </select>

          {/* Dynamic Description Card for Selected Artifact Service Backend */}
          {(() => {
            const currentArtifactMeta =
              ARTIFACT_SERVICE_OPTION_DESCRIPTIONS[artifactConfig.type] ||
              ARTIFACT_SERVICE_OPTION_DESCRIPTIONS.none;
            return (
              <div
                className="p-2.5 rounded-lg bg-[#161b22] border border-[#30363d] text-[10px] text-gray-400 leading-relaxed space-y-1.5"
                data-testid="artifact-service-description-card"
              >
                <div className="flex items-center justify-between">
                  <span className="text-teal-300 font-semibold text-[11px]">
                    {currentArtifactMeta.title}
                  </span>
                  <span className="text-[9px] uppercase tracking-wider text-teal-300/80 font-mono bg-teal-950/50 px-1.5 py-0.5 rounded border border-teal-500/20">
                    {currentArtifactMeta.badge}
                  </span>
                </div>
                <p>{currentArtifactMeta.description}</p>
                <div className="pt-1 border-t border-[#30363d] text-[9px] text-gray-400 flex items-start gap-1">
                  <strong className="text-gray-300 shrink-0">Best for:</strong>
                  <span>{currentArtifactMeta.bestFor}</span>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Contextual Artifact Service Parameters */}
        {(artifactConfig.type === 'in_memory' || artifactConfig.type === 'gcs') && (
          <div className="space-y-2.5 pt-2 border-t border-[#30363d]" data-testid="artifact-config-form">
            {/* GCS Bucket Name */}
            {artifactConfig.type === 'gcs' && (
              <div className="space-y-1">
                <label className="text-[10px] text-gray-300 font-medium">
                  GCS Bucket Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  data-testid="gcs-bucket-name-input"
                  value={artifactConfig.gcsBucketName ?? ''}
                  onChange={(e) => handleArtifactFieldChange({ gcsBucketName: e.target.value })}
                  placeholder="my-agent-artifacts-bucket"
                  className="w-full px-2.5 py-1.5 bg-[#161b22] border border-[#30363d] focus:border-teal-400 rounded text-xs text-white font-mono"
                />
              </div>
            )}

            {/* Default Scope */}
            <div className="space-y-1">
              <label className="text-[10px] text-gray-300 font-medium">
                Default Namespace Scope
              </label>
              <select
                data-testid="artifact-default-scope-select"
                value={artifactConfig.defaultScope ?? 'session'}
                onChange={(e) =>
                  handleArtifactFieldChange({
                    defaultScope: e.target.value as 'session' | 'user',
                  })
                }
                className="w-full px-2.5 py-1 bg-[#161b22] border border-[#30363d] focus:border-teal-400 rounded text-xs text-teal-200 cursor-pointer"
              >
                <option value="session">Session (filename — thread local)</option>
                <option value="user">User (user:filename — cross-session user persistent)</option>
              </select>
            </div>

            {/* Enable Versioning Toggle */}
            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-gray-300 font-medium">
                Automatic Versioning (v1, v2, ...)
              </span>
              <input
                type="checkbox"
                data-testid="artifact-enable-versioning-toggle"
                checked={artifactConfig.enableVersioning ?? false}
                onChange={(e) =>
                  handleArtifactFieldChange({ enableVersioning: e.target.checked })
                }
                className="rounded bg-[#161b22] border-[#30363d] text-teal-500 focus:ring-0 cursor-pointer"
              />
            </div>

            {/* Allowed MIME Types Selection Chips */}
            <div className="space-y-1.5 pt-1">
              <label className="text-[10px] text-gray-300 font-medium">
                Allowed Multimodal MIME Types
              </label>
              <div
                className="flex flex-wrap gap-1.5"
                data-testid="artifact-allowed-mime-types"
              >
                {DEFAULT_ALLOWED_MIME_TYPES.map((mime) => {
                  const isSelected = (artifactConfig.allowedMimeTypes || []).includes(mime);
                  return (
                    <button
                      type="button"
                      key={mime}
                      onClick={() => handleToggleMimeType(mime)}
                      className={`text-[9px] font-mono px-2 py-0.5 rounded border transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-teal-500/20 text-teal-300 border-teal-500/40'
                          : 'bg-[#161b22] text-gray-400 border-[#30363d] hover:border-gray-500'
                      }`}
                    >
                      {mime}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
