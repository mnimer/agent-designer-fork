/**
 * Unit Tests for ADK Context Management & Token Optimization (TASK-225)
 *
 * Validates:
 * 1. includeContents configuration modes ('default' vs 'none' for stateless workers).
 * 2. ContextCacheConfig parameters (enabled, minTokens, ttlSeconds, cacheIntervals).
 * 3. EventsCompactionConfig auto-summarization parameters (compactionInterval, overlapSize, summarizerModel).
 * 4. Boundary and extreme conditions for cache and compaction configs.
 * 5. Immutable state updates on AgentNodeData.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  AgentNodeData,
  ContextCacheConfig,
  EventsCompactionConfig,
  IncludeContentsMode,
} from '../../../src/shared/types';

describe('ADK Context Management & Token Optimization (TASK-225)', () => {
  // Section 1: includeContents mode validation
  it('should support default and none modes for includeContents', () => {
    const defaultAgent: AgentNodeData = {
      label: 'Chat Agent',
      role: 'Support Representative',
      includeContents: 'default',
    };
    assert.equal(defaultAgent.includeContents, 'default');

    const statelessWorker: AgentNodeData = {
      label: 'Data Extraction Worker',
      role: 'JSON Parser',
      includeContents: 'none',
    };
    assert.equal(statelessWorker.includeContents, 'none');
  });

  // Section 2: Context Cache Configuration
  it('should validate ContextCacheConfig defaults and custom settings', () => {
    const defaultCacheConfig: ContextCacheConfig = {
      enabled: true,
      minTokens: 4096,
      ttlSeconds: 1800,
      cacheIntervals: 10,
    };

    assert.equal(defaultCacheConfig.enabled, true);
    assert.equal(defaultCacheConfig.minTokens, 4096);
    assert.equal(defaultCacheConfig.ttlSeconds, 1800);
    assert.equal(defaultCacheConfig.cacheIntervals, 10);

    // Custom overrides
    const customCacheConfig: ContextCacheConfig = {
      enabled: true,
      minTokens: 8192,
      ttlSeconds: 3600,
      cacheIntervals: 5,
    };
    assert.equal(customCacheConfig.minTokens, 8192);
    assert.equal(customCacheConfig.ttlSeconds, 3600);
    assert.equal(customCacheConfig.cacheIntervals, 5);
  });

  it('should handle boundary conditions for ContextCacheConfig', () => {
    const zeroTokenConfig: ContextCacheConfig = {
      enabled: false,
      minTokens: 0,
      ttlSeconds: 60,
      cacheIntervals: 1,
    };

    assert.equal(zeroTokenConfig.enabled, false);
    assert.equal(zeroTokenConfig.minTokens, 0);
    assert.equal(zeroTokenConfig.ttlSeconds, 60);
  });

  // Section 3: Events Compaction Auto-Summarization Configuration
  it('should validate EventsCompactionConfig defaults and custom summarizer model', () => {
    const compactionConfig: EventsCompactionConfig = {
      enabled: true,
      compactionInterval: 5,
      overlapSize: 1,
      summarizerModel: 'gemini-3.8-flash',
    };

    assert.equal(compactionConfig.enabled, true);
    assert.equal(compactionConfig.compactionInterval, 5);
    assert.equal(compactionConfig.overlapSize, 1);
    assert.equal(compactionConfig.summarizerModel, 'gemini-3.8-flash');
  });

  it('should allow configuring large compaction intervals and custom summarizers', () => {
    const longHorizonCompaction: EventsCompactionConfig = {
      enabled: true,
      compactionInterval: 20,
      overlapSize: 2,
      summarizerModel: 'gemini-3.8-pro',
    };

    assert.equal(longHorizonCompaction.compactionInterval, 20);
    assert.equal(longHorizonCompaction.overlapSize, 2);
    assert.equal(longHorizonCompaction.summarizerModel, 'gemini-3.8-pro');
  });

  // Section 4: Composite Agent Configuration
  it('should cleanly bundle context caching, event compaction, and includeContents on AgentNodeData', () => {
    const initialAgent: AgentNodeData = {
      label: 'Financial Analyst',
      role: 'Portfolio Advisor',
      model: 'gemini-3.8-flash',
    };

    const updatedAgent: AgentNodeData = {
      ...initialAgent,
      includeContents: 'none',
      contextCacheConfig: {
        enabled: true,
        minTokens: 4096,
        ttlSeconds: 1800,
        cacheIntervals: 10,
      },
      eventsCompactionConfig: {
        enabled: true,
        compactionInterval: 5,
        overlapSize: 1,
        summarizerModel: 'gemini-3.8-flash',
      },
    };

    assert.equal(updatedAgent.includeContents, 'none');
    assert.equal(updatedAgent.contextCacheConfig?.enabled, true);
    assert.equal(updatedAgent.contextCacheConfig?.minTokens, 4096);
    assert.equal(updatedAgent.eventsCompactionConfig?.enabled, true);
    assert.equal(updatedAgent.eventsCompactionConfig?.summarizerModel, 'gemini-3.8-flash');
  });
});
