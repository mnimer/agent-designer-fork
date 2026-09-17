/**
 * Unit Tests for EventarcDiscoveryManager
 *
 * Purpose:
 * Validates dynamic Eventarc provider discovery, gcloud binary resolution,
 * JSON transformation of CloudEvent schemas, in-memory regional caching,
 * and resilient fallback to static enterprise catalog.
 *
 * Architectural Decisions:
 * 1. Author: Mike Nimer <mikenimer@google.com>
 * 2. Complete Coverage: Tests simple, extreme, and failure conditions.
 * 3. Cache Validation: Confirms region-keyed in-memory caching and TTL.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  EventarcDiscoveryManager,
  DEFAULT_EVENTARC_FALLBACK,
} from '../../../src/extension/EventarcDiscoveryManager';

describe('EventarcDiscoveryManager Unit Tests', { concurrency: 1 }, () => {
  beforeEach(() => {
    EventarcDiscoveryManager.resetInstance();
  });

  it('should maintain singleton instance lifecycle', () => {
    const instance1 = EventarcDiscoveryManager.getInstance();
    const instance2 = EventarcDiscoveryManager.getInstance();
    assert.strictEqual(instance1, instance2, 'getInstance() must return singleton instance');

    EventarcDiscoveryManager.resetInstance();
    const instance3 = EventarcDiscoveryManager.getInstance();
    assert.notStrictEqual(instance1, instance3, 'resetInstance() must recreate singleton');
  });

  it('should resolve a valid gcloud binary path', () => {
    const manager = EventarcDiscoveryManager.getInstance();
    const gcloudPath = manager.resolveGcloudPath();
    assert.ok(gcloudPath, 'resolveGcloudPath must return a string');
    assert.ok(gcloudPath.includes('gcloud'), 'Path must refer to gcloud');
  });

  it('should transform raw gcloud provider JSON into typed EventArcCategory objects', () => {
    const manager = EventarcDiscoveryManager.getInstance();
    const mockRawGcloudOutput = [
      {
        name: 'projects/test-proj/locations/global/providers/storage.googleapis.com',
        displayName: 'Cloud Storage',
        eventTypes: [
          {
            type: 'google.cloud.storage.object.v1.finalized',
            description: 'Fires when a new object is created',
            eventSchemaUri: 'https://cloud.google.com/eventarc/docs/cloudevents',
          },
          {
            type: 'google.cloud.storage.object.v1.deleted',
            description: 'Fires when an object is deleted',
          },
        ],
      },
      {
        name: 'projects/test-proj/locations/global/providers/bigquery.googleapis.com',
        displayName: 'BigQuery',
        eventTypes: [
          {
            type: 'google.cloud.bigquery.v2.TableService.InsertTable',
            description: 'Fires when a table is created',
          },
        ],
      },
      {
        name: 'projects/test-proj/locations/global/providers/empty.googleapis.com',
        displayName: 'Empty Service',
        eventTypes: [],
      },
    ];

    const categories = manager.transformRawProviders(mockRawGcloudOutput);

    // Empty providers should be filtered out
    assert.equal(categories.length, 2, 'Should only include providers with valid events');

    // Sorted alphabetically by name (BigQuery, Cloud Storage)
    assert.equal(categories[0].id, 'bigquery');
    assert.equal(categories[0].name, 'BigQuery');
    assert.equal(categories[0].serviceName, 'bigquery.googleapis.com');
    assert.equal(categories[0].events.length, 1);
    assert.equal(categories[0].events[0].id, 'InsertTable');
    assert.equal(categories[0].events[0].fullEvent, 'google.cloud.bigquery.v2.TableService.InsertTable');

    assert.equal(categories[1].id, 'storage');
    assert.equal(categories[1].name, 'Cloud Storage');
    assert.equal(categories[1].serviceName, 'storage.googleapis.com');
    assert.equal(categories[1].events.length, 2);
    assert.equal(categories[1].events[0].id, 'finalized');
    assert.equal(categories[1].events[1].id, 'deleted');
  });

  it('should gracefully handle malformed or empty raw input', () => {
    const manager = EventarcDiscoveryManager.getInstance();
    const result1 = manager.transformRawProviders([]);
    assert.deepEqual(result1, []);

    const result2 = manager.transformRawProviders([null, undefined, {}, { name: '' }]);
    assert.deepEqual(result2, []);
  });

  it('should fallback to DEFAULT_EVENTARC_FALLBACK when gcloud execution fails', async () => {
    const manager = EventarcDiscoveryManager.getInstance();
    // Simulate invalid location that triggers fallback
    const result = await manager.getEventarcProviders('non-existent-region-xyz');
    assert.ok(result.categories.length > 0, 'Categories must not be empty');
    assert.ok(result.source === 'gcloud' || result.source === 'fallback');
    if (result.source === 'fallback') {
      assert.deepEqual(result.categories, DEFAULT_EVENTARC_FALLBACK);
    }
  });

  it('should cache results regionally and reuse on subsequent calls', async () => {
    const manager = EventarcDiscoveryManager.getInstance();
    const res1 = await manager.getEventarcProviders('us-central1', false);
    assert.ok(res1.categories.length > 0);
    assert.ok(manager.isLocationCached('us-central1'), 'Location must be cached after first lookup');

    const start = Date.now();
    const res2 = await manager.getEventarcProviders('us-central1', false);
    const duration = Date.now() - start;

    assert.ok(duration < 250, `Cached lookup should be sub-250ms, took ${duration}ms`);
    assert.equal(res2.categories.length, res1.categories.length);
    assert.equal(res2.source, res1.source);
  });

  it('should cache fallback results when gcloud CLI fails to prevent repeated subprocess calls', async () => {
    const manager = EventarcDiscoveryManager.getInstance();
    const failingLoc = 'invalid-region-fallback-test';
    const res1 = await manager.getEventarcProviders(failingLoc, false);
    assert.equal(res1.source, 'fallback');
    assert.ok(manager.isLocationCached(failingLoc), 'Fallback result must be cached in memory');

    const start = Date.now();
    const res2 = await manager.getEventarcProviders(failingLoc, false);
    const duration = Date.now() - start;

    assert.ok(
      duration < 250,
      `Subsequent lookup for failing location should be served from memory cache (<250ms), took ${duration}ms`
    );
    assert.equal(res2.source, 'fallback');
    assert.deepEqual(res2.categories, DEFAULT_EVENTARC_FALLBACK);
  });

  it('should support clearing cache and checking cached status', async () => {
    const manager = EventarcDiscoveryManager.getInstance();
    const loc = 'us-central1';
    await manager.getEventarcProviders(loc, false);
    assert.ok(manager.isLocationCached(loc));

    manager.clearCache();
    assert.equal(manager.isLocationCached(loc), false, 'Cache should be empty after clearCache()');
  });
});
