/**
 * Unit Tests for SecretsProvider & Secure Secrets Storage
 *
 * Verifies:
 * 1. Singleton pattern and initialization.
 * 2. Secure storage, retrieval, presence checks, and deletion of keys.
 * 3. Successful configuration-to-SecretStorage migration with plain-text cleanup.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { SecretsProvider } from '../../src/extension/security/SecretsProvider';

/**
 * Mock implementation of VS Code SecretStorage
 */
class MockSecretStorage {
  private secrets = new Map<string, string>();

  async get(key: string): Promise<string | undefined> {
    return this.secrets.get(key);
  }

  async store(key: string, value: string): Promise<void> {
    this.secrets.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.secrets.delete(key);
  }

  onDidChange = () => ({ dispose: () => {} });
}

describe('SecretsProvider', () => {
  let mockSecrets: MockSecretStorage;

  beforeEach(() => {
    vscode.resetAllMocks();
    mockSecrets = new MockSecretStorage();
    // Reset the singleton instance between tests
    (SecretsProvider as any).instance = undefined;
  });

  it('should initialize and follow the singleton pattern', () => {
    const provider = SecretsProvider.init(mockSecrets as any);
    assert.ok(provider);
    assert.strictEqual(SecretsProvider.getInstance(), provider);

    // Verify initializing again throws an error to prevent multiple bindings
    assert.throws(() => {
      SecretsProvider.init(mockSecrets as any);
    }, /SecretsProvider is already initialized/);
  });

  it('should throw when trying to fetch instance before initialization', () => {
    assert.throws(() => {
      SecretsProvider.getInstance();
    }, /SecretsProvider is not initialized yet/);
  });

  it('should securely store, retrieve, check presence and delete Gemini API key', async () => {
    const provider = SecretsProvider.init(mockSecrets as any);

    // Verify initial empty state
    assert.strictEqual(await provider.getGeminiApiKey(), undefined);
    assert.strictEqual(await provider.hasGeminiApiKey(), false);

    // Set key
    await provider.setGeminiApiKey('AIzaSySecureGeminiToken123');
    assert.strictEqual(await provider.getGeminiApiKey(), 'AIzaSySecureGeminiToken123');
    assert.strictEqual(await provider.hasGeminiApiKey(), true);

    // Delete key
    await provider.deleteGeminiApiKey();
    assert.strictEqual(await provider.getGeminiApiKey(), undefined);
    assert.strictEqual(await provider.hasGeminiApiKey(), false);
  });

  it('should perform migration when plain-text legacy key exists', async () => {
    const provider = SecretsProvider.init(mockSecrets as any);

    const mockConfig: any = {
      legacyKey: 'legacy-api-key-value',
      get(key: string) {
        if (key === 'geminiApiKey') {
          return this.legacyKey;
        }
        return undefined;
      },
      async update(key: string, value: any, target: boolean) {
        if (key === 'geminiApiKey') {
          this.legacyKey = value;
        }
      }
    };

    // Perform migration
    const migrated = await provider.migrateFromSettings(mockConfig);
    assert.strictEqual(migrated, true);

    // Verify key was saved to SecretStorage
    assert.strictEqual(await provider.getGeminiApiKey(), 'legacy-api-key-value');

    // Verify key was cleaned up from legacy plain-text workspace config
    assert.strictEqual(mockConfig.legacyKey, undefined);
  });

  it('should not migrate when no legacy key exists', async () => {
    const provider = SecretsProvider.init(mockSecrets as any);

    const mockConfig: any = {
      legacyKey: undefined,
      get(key: string) {
        return this.legacyKey;
      },
      async update(key: string, value: any, target: boolean) {
        this.legacyKey = value;
      }
    };

    // Perform migration
    const migrated = await provider.migrateFromSettings(mockConfig);
    assert.strictEqual(migrated, false);

    // Verify no secret stored
    assert.strictEqual(await provider.getGeminiApiKey(), undefined);
  });
});
