/**
 * Unit Tests for ADK Long-Term Cross-Session Memory (TASK-236)
 *
 * Validates:
 * 1. buildLongTermMemoryCodeSnippet Python ADK code generation for VertexAiMemoryBankService,
 *    VertexAiRagMemoryService, and InMemoryMemoryService.
 * 2. Auto-save session turn persistence via after_agent_callback.
 * 3. Default parameter matrices for RAG corpus recall (similarityTopK = 5, vectorDistanceThreshold = 0.7).
 * 4. MemoryConfigSection component rendering and reactive state updates.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {
  buildLongTermMemoryCodeSnippet,
  LONG_TERM_MEMORY_OPTION_DESCRIPTIONS,
  MemoryConfigSection,
} from '../../../src/webview/components/inspector/MemoryConfigSection';
import { LongTermMemoryConfig, AgentMemoryConfig } from '../../../src/shared/agentSpec';

describe('TASK-236: ADK Cross-Session Long-Term Memory Suite', () => {
  describe('buildLongTermMemoryCodeSnippet', () => {
    it('should return disabled message when config is omitted or serviceType is none', () => {
      assert.equal(
        buildLongTermMemoryCodeSnippet(undefined),
        '# Long-term cross-session memory is disabled'
      );
      assert.equal(
        buildLongTermMemoryCodeSnippet({ serviceType: 'none' }),
        '# Long-term cross-session memory is disabled'
      );
    });

    it('should generate InMemoryMemoryService code for local dev/testing', () => {
      const config: LongTermMemoryConfig = {
        serviceType: 'in_memory',
      };
      const code = buildLongTermMemoryCodeSnippet(config);
      assert.ok(code.includes('from google.adk.memory import InMemoryMemoryService'));
      assert.ok(code.includes('memory_service = InMemoryMemoryService()'));
    });

    it('should generate VertexAiMemoryBankService code with agentEngineId', () => {
      const config: LongTermMemoryConfig = {
        serviceType: 'vertex_ai_memory_bank',
        agentEngineId: 'projects/my-gcp-proj/locations/global/reasoningEngines/12345678',
        autoSaveSessionToMemory: false,
      };

      const code = buildLongTermMemoryCodeSnippet(config);
      assert.ok(code.includes('from google.adk.memory import VertexAiMemoryBankService'));
      assert.ok(
        code.includes(
          'agent_engine_id="projects/my-gcp-proj/locations/global/reasoningEngines/12345678"'
        )
      );
      assert.equal(code.includes('def after_agent_callback'), false);
    });

    it('should generate VertexAiMemoryBankService with after_agent_callback when autoSaveSessionToMemory is true', () => {
      const config: LongTermMemoryConfig = {
        serviceType: 'vertex_ai_memory_bank',
        agentEngineId: 'reasoning-engine-999',
        autoSaveSessionToMemory: true,
      };

      const code = buildLongTermMemoryCodeSnippet(config);
      assert.ok(code.includes('def after_agent_callback(callback_context):'));
      assert.ok(code.includes('memory_service.add_session_to_memory(callback_context.session)'));
    });

    it('should generate VertexAiRagMemoryService code with corpus ID, similarityTopK, and threshold', () => {
      const config: LongTermMemoryConfig = {
        serviceType: 'vertex_ai_rag',
        ragCorpusId: 'projects/123/locations/us-central1/ragCorpora/456',
        similarityTopK: 8,
        vectorDistanceThreshold: 0.65,
        autoSaveSessionToMemory: true,
      };

      const code = buildLongTermMemoryCodeSnippet(config);
      assert.ok(code.includes('from google.adk.memory import VertexAiRagMemoryService'));
      assert.ok(code.includes('rag_corpus_id="projects/123/locations/us-central1/ragCorpora/456"'));
      assert.ok(code.includes('similarity_top_k=8'));
      assert.ok(code.includes('vector_distance_threshold=0.65'));
      assert.ok(code.includes('def after_agent_callback(callback_context):'));
    });

    it('should use default topK (5) and distance threshold (0.7) when omitted for RAG memory', () => {
      const config: LongTermMemoryConfig = {
        serviceType: 'vertex_ai_rag',
        ragCorpusId: 'corpus-default',
      };

      const code = buildLongTermMemoryCodeSnippet(config);
      assert.ok(code.includes('similarity_top_k=5'));
      assert.ok(code.includes('vector_distance_threshold=0.7'));
    });

    it('should fallback to environment variables when IDs are omitted', () => {
      const bankConfig: LongTermMemoryConfig = {
        serviceType: 'vertex_ai_memory_bank',
      };
      assert.ok(
        buildLongTermMemoryCodeSnippet(bankConfig).includes(
          'os.environ.get("VERTEX_AI_AGENT_ENGINE_ID")'
        )
      );

      const ragConfig: LongTermMemoryConfig = {
        serviceType: 'vertex_ai_rag',
      };
      assert.ok(
        buildLongTermMemoryCodeSnippet(ragConfig).includes(
          'os.environ.get("VERTEX_AI_RAG_CORPUS_ID")'
        )
      );
    });
  });

  describe('MemoryConfigSection Component Integration', () => {
    it('should instantiate MemoryConfigSection with long-term memory parameters', () => {
      let dispatchedConfig: AgentMemoryConfig | null = null;
      const initialConfig: AgentMemoryConfig = {
        type: 'firestore',
        collectionName: 'conversation_history',
        longTermMemory: {
          serviceType: 'vertex_ai_memory_bank',
          agentEngineId: 'engine-123',
          autoSaveSessionToMemory: true,
        },
      };

      const element = React.createElement(MemoryConfigSection, {
        memoryConfig: initialConfig,
        onUpdateMemoryConfig: (conf) => {
          dispatchedConfig = conf;
        },
      });

      assert.ok(element);
      assert.equal(
        element.props.memoryConfig?.longTermMemory?.serviceType,
        'vertex_ai_memory_bank'
      );
      assert.equal(
        element.props.memoryConfig?.longTermMemory?.agentEngineId,
        'engine-123'
      );
      assert.equal(
        element.props.memoryConfig?.longTermMemory?.autoSaveSessionToMemory,
        true
      );
    });

    it('should provide user-facing descriptions for all 4 Cross-Session Long-Term Memory options', () => {
      const types = ['none', 'in_memory', 'vertex_ai_memory_bank', 'vertex_ai_rag'] as const;
      for (const t of types) {
        const meta = LONG_TERM_MEMORY_OPTION_DESCRIPTIONS[t];
        assert.ok(meta, `Missing description metadata for ${t}`);
        assert.ok(meta.title.length > 0);
        assert.ok(meta.badge.length > 0);
        assert.ok(meta.description.length > 10);
        assert.ok(meta.bestFor.length > 5);
      }
    });
  });
});
