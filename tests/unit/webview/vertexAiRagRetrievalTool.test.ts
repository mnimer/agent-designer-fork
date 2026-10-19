/**
 * Unit Tests for ADK VertexAiRagRetrieval Tool Integration (TASK-229)
 *
 * Validates:
 * 1. Factory helper `createVertexAiRagRetrievalToolDefinition`.
 * 2. Top-K and vector distance threshold defaults.
 * 3. Defensive copy behavior for corpora lists.
 * 4. Python ADK code generation with `from vertexai.preview import rag` and `RagResource`.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createVertexAiRagRetrievalToolDefinition,
  generateVertexAiRagRetrievalPythonCode,
} from '../../../src/webview/data/builtinToolsRegistry';
import { VertexAiRagRetrievalConfig } from '../../../src/shared/agentSpec';

describe('TASK-229: ADK VertexAiRagRetrieval Tool Integration', () => {
  const sampleConfig: VertexAiRagRetrievalConfig = {
    ragCorpora: [
      'projects/my-project/locations/global/ragCorpora/retail-kb-1',
      'projects/my-project/locations/global/ragCorpora/retail-kb-2',
    ],
    similarityTopK: 10,
    vectorDistanceThreshold: 0.35,
    location: 'global',
    project: 'my-project',
  };

  it('should create a VertexAiRagRetrieval ToolDefinition with proper defaults', () => {
    const toolDef = createVertexAiRagRetrievalToolDefinition(sampleConfig, 'Retail Knowledge RAG');
    assert.ok(toolDef.id.startsWith('builtin_vertex_rag_'));
    assert.equal(toolDef.name, 'Retail Knowledge RAG');
    assert.equal(toolDef.builtinType, 'vertex_ai_rag_retrieval');
    assert.equal(toolDef.category, 'enterprise_search');
    assert.equal(toolDef.type, 'rag');
    assert.ok(toolDef.vertexAiRagRetrievalConfig);
    assert.equal(toolDef.vertexAiRagRetrievalConfig.similarityTopK, 10);
    assert.equal(toolDef.vertexAiRagRetrievalConfig.vectorDistanceThreshold, 0.35);
    assert.equal(toolDef.vertexAiRagRetrievalConfig.ragCorpora.length, 2);
  });

  it('should apply fallback defaults when similarity parameters are omitted', () => {
    const minimalConfig: VertexAiRagRetrievalConfig = {
      ragCorpora: ['projects/p/locations/global/ragCorpora/c1'],
    };

    const toolDef = createVertexAiRagRetrievalToolDefinition(minimalConfig);
    assert.equal(toolDef.vertexAiRagRetrievalConfig?.similarityTopK, 5);
    assert.equal(toolDef.vertexAiRagRetrievalConfig?.vectorDistanceThreshold, 0.5);
    assert.equal(toolDef.vertexAiRagRetrievalConfig?.location, 'global');
  });

  it('should generate valid Python ADK initialization code using rag.RagResource', () => {
    const code = generateVertexAiRagRetrievalPythonCode(sampleConfig);
    assert.ok(code.includes('from google.adk.tools.retrieval.vertex_ai_rag_retrieval import VertexAiRagRetrieval'));
    assert.ok(code.includes('from vertexai.preview import rag'));
    assert.ok(code.includes('rag.RagResource(rag_corpus="projects/my-project/locations/global/ragCorpora/retail-kb-1")'));
    assert.ok(code.includes('rag.RagResource(rag_corpus="projects/my-project/locations/global/ragCorpora/retail-kb-2")'));
    assert.ok(code.includes('similarity_top_k=10'));
    assert.ok(code.includes('vector_distance_threshold=0.35'));
  });
});
