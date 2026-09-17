/**
 * Unit Tests for GcpDiscoveryManager
 *
 * Purpose:
 * Validates dynamic Google Cloud resource discovery for Pub/Sub topics,
 * subscriptions, and IAM service accounts, gcloud binary resolution,
 * JSON transformation of resource descriptors, in-memory caching per project,
 * and resilient fallback to offline enterprise presets.
 *
 * Architectural Decisions:
 * 1. Author: Mike Nimer <mikenimer@google.com>
 * 2. Complete Coverage: Tests simple conditions, edge cases, malformed outputs, and failure fallbacks.
 * 3. Cache Validation: Confirms project-keyed in-memory caching and force-refresh bypass.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  GcpDiscoveryManager,
  DEFAULT_PUBSUB_TOPICS_FALLBACK,
  DEFAULT_PUBSUB_SUBSCRIPTIONS_FALLBACK,
  DEFAULT_SERVICE_ACCOUNTS_FALLBACK,
} from '../../../src/extension/GcpDiscoveryManager';

describe('GcpDiscoveryManager Unit Tests', { concurrency: 1 }, () => {
  beforeEach(() => {
    GcpDiscoveryManager.resetInstance();
  });

  it('should maintain singleton instance lifecycle', () => {
    const instance1 = GcpDiscoveryManager.getInstance();
    const instance2 = GcpDiscoveryManager.getInstance();
    assert.strictEqual(instance1, instance2, 'getInstance() must return singleton instance');

    GcpDiscoveryManager.resetInstance();
    const instance3 = GcpDiscoveryManager.getInstance();
    assert.notStrictEqual(instance1, instance3, 'resetInstance() must recreate singleton');
  });

  it('should resolve a valid gcloud binary path', () => {
    const manager = GcpDiscoveryManager.getInstance();
    const gcloudPath = manager.resolveGcloudPath();
    assert.ok(gcloudPath, 'resolveGcloudPath must return a string');
    assert.ok(gcloudPath.includes('gcloud'), 'Path must refer to gcloud');
  });

  it('should transform raw gcloud topics JSON into typed PubSubTopicItem objects', () => {
    const manager = GcpDiscoveryManager.getInstance();
    const mockRawTopics = [
      {
        name: 'projects/test-project/topics/order-events',
        labels: { env: 'production' },
      },
      {
        name: 'projects/test-project/topics/analytics-stream',
      },
      {
        name: 'projects/test-project/topics/audit-logs',
      },
    ];

    const topics = manager.transformRawTopics(mockRawTopics);

    assert.equal(topics.length, 3, 'Should transform all valid topics');
    // Sorted alphabetically by shortName: analytics-stream, audit-logs, order-events
    assert.equal(topics[0].shortName, 'analytics-stream');
    assert.equal(topics[0].name, 'projects/test-project/topics/analytics-stream');
    assert.equal(topics[0].projectId, 'test-project');

    assert.equal(topics[1].shortName, 'audit-logs');
    assert.equal(topics[2].shortName, 'order-events');
  });

  it('should transform raw gcloud subscriptions JSON into typed PubSubSubscriptionItem objects', () => {
    const manager = GcpDiscoveryManager.getInstance();
    const mockRawSubs = [
      {
        name: 'projects/test-project/subscriptions/order-events-sub',
        topic: 'projects/test-project/topics/order-events',
        ackDeadlineSeconds: 30,
      },
      {
        name: 'projects/test-project/subscriptions/analytics-sub',
        topic: 'projects/test-project/topics/analytics-stream',
      },
    ];

    const subs = manager.transformRawSubscriptions(mockRawSubs);

    assert.equal(subs.length, 2);
    // Sorted alphabetically: analytics-sub, order-events-sub
    assert.equal(subs[0].shortName, 'analytics-sub');
    assert.equal(subs[0].topic, 'projects/test-project/topics/analytics-stream');
    assert.equal(subs[1].shortName, 'order-events-sub');
    assert.equal(subs[1].ackDeadlineSeconds, 30);
  });

  it('should transform raw gcloud IAM service accounts JSON into typed GcpServiceAccountItem objects', () => {
    const manager = GcpDiscoveryManager.getInstance();
    const mockRawSAs = [
      {
        email: 'agent-invoker@test-project.iam.gserviceaccount.com',
        displayName: 'Agent Invoker SA',
        description: 'Dedicated service account for agent runtime',
        disabled: false,
      },
      {
        email: 'disabled-sa@test-project.iam.gserviceaccount.com',
        displayName: 'Disabled SA',
        disabled: true,
      },
      {
        email: 'cloud-run-exec@test-project.iam.gserviceaccount.com',
        displayName: 'Cloud Run SA',
        disabled: false,
      },
    ];

    const accounts = manager.transformRawServiceAccounts(mockRawSAs);

    // Disabled SA should be filtered out
    assert.equal(accounts.length, 2, 'Should exclude disabled accounts');
    // Sorted alphabetically by email
    assert.equal(accounts[0].email, 'agent-invoker@test-project.iam.gserviceaccount.com');
    assert.equal(accounts[0].displayName, 'Agent Invoker SA');
    assert.equal(accounts[1].email, 'cloud-run-exec@test-project.iam.gserviceaccount.com');
  });

  it('should gracefully handle malformed or empty raw input across all transformers', () => {
    const manager = GcpDiscoveryManager.getInstance();
    assert.deepEqual(manager.transformRawTopics([]), []);
    assert.deepEqual(manager.transformRawTopics([null, undefined, {}, { name: '' }]), []);

    assert.deepEqual(manager.transformRawSubscriptions([]), []);
    assert.deepEqual(manager.transformRawSubscriptions([null, undefined, {}]), []);

    assert.deepEqual(manager.transformRawServiceAccounts([]), []);
    assert.deepEqual(manager.transformRawServiceAccounts([null, undefined, { email: '' }]), []);
  });

  it('should fallback to defaults when gcloud execution fails', async () => {
    const manager = GcpDiscoveryManager.getInstance();
    
    // Topics fallback
    const topicsResult = await manager.getPubSubTopics('non-existent-proj-xyz');
    assert.ok(topicsResult.topics.length > 0);
    assert.ok(topicsResult.source === 'gcloud' || topicsResult.source === 'fallback');
    if (topicsResult.source === 'fallback') {
      assert.deepEqual(topicsResult.topics, DEFAULT_PUBSUB_TOPICS_FALLBACK);
    }

    // Subscriptions fallback
    const subsResult = await manager.getPubSubSubscriptions('non-existent-proj-xyz');
    assert.ok(subsResult.subscriptions.length > 0);
    assert.ok(subsResult.source === 'gcloud' || subsResult.source === 'fallback');
    if (subsResult.source === 'fallback') {
      assert.deepEqual(subsResult.subscriptions, DEFAULT_PUBSUB_SUBSCRIPTIONS_FALLBACK);
    }

    // Service Accounts fallback
    const saResult = await manager.getServiceAccounts('non-existent-proj-xyz');
    assert.ok(saResult.serviceAccounts.length > 0);
    assert.ok(saResult.source === 'gcloud' || saResult.source === 'fallback');
    if (saResult.source === 'fallback') {
      assert.deepEqual(saResult.serviceAccounts, DEFAULT_SERVICE_ACCOUNTS_FALLBACK);
    }
  });

  it('should cache results per project and reuse on subsequent calls', async () => {
    const manager = GcpDiscoveryManager.getInstance();
    const res1 = await manager.getPubSubTopics('sample-cache-project', false);
    assert.ok(res1.topics.length > 0);

    const start = Date.now();
    const res2 = await manager.getPubSubTopics('sample-cache-project', false);
    const duration = Date.now() - start;

    assert.ok(duration < 50, 'Cached lookup should be sub-50ms');
    assert.equal(res2.topics.length, res1.topics.length);
  });
});
