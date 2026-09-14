/**
 * SecretsProvider.ts
 *
 * Secure secrets storage wrapper around VS Code's `SecretStorage` API.
 * Ensures that sensitive keys (like the Gemini API Key) are stored in the
 * OS Keychain instead of being exposed in plaintext settings.json files.
 *
 * Architectural Decisions:
 * 1. Singleton pattern ensures a single unified manager of secrets initialized during activation.
 * 2. Uses async VS Code SecretStorage API with platform-safe fallbacks.
 * 3. Supports automated global migration of legacy settings.json plain-text api key configuration.
 *
 * Author: Mike Nimer <mikenimer@google.com>
 */

import * as vscode from 'vscode';

export class SecretsProvider {
  /**
   * Singleton instance of the provider.
   */
  private static instance: SecretsProvider | undefined;

  /**
   * The underlying VS Code SecretStorage.
   */
  private secrets: vscode.SecretStorage;

  /**
   * The unique storage key used in SecretStorage for the Gemini API Key.
   */
  private static readonly GEMINI_API_KEY_STORAGE_KEY = 'agentFlow_geminiApiKey';

  /**
   * Private constructor to enforce Singleton pattern.
   *
   * @param secrets The VS Code SecretStorage instance
   */
  private constructor(secrets: vscode.SecretStorage) {
    this.secrets = secrets;
  }

  /**
   * Initializes the singleton instance with the extension context's SecretStorage.
   *
   * @param secrets VS Code SecretStorage
   */
  public static init(secrets: vscode.SecretStorage): SecretsProvider {
    if (this.instance) {
      throw new Error('SecretsProvider is already initialized.');
    }
    this.instance = new SecretsProvider(secrets);
    return this.instance;
  }

  /**
   * Returns the initialized singleton instance of the SecretsProvider.
   * Throws an error if called before initialization.
   */
  public static getInstance(): SecretsProvider {
    if (!this.instance) {
      throw new Error('SecretsProvider is not initialized yet. Call SecretsProvider.init() first.');
    }
    return this.instance;
  }

  /**
   * Securely retrieves the Gemini API Key from OS Keychain-backed SecretStorage.
   *
   * @returns A Promise resolving to the retrieved string, or undefined if not set.
   */
  public async getGeminiApiKey(): Promise<string | undefined> {
    // NOTE: VS Code SecretStorage.get returns string | undefined
    return await this.secrets.get(SecretsProvider.GEMINI_API_KEY_STORAGE_KEY);
  }

  /**
   * Checks whether a Gemini API Key is currently stored securely.
   *
   * @returns A Promise resolving to true if key is present, false otherwise.
   */
  public async hasGeminiApiKey(): Promise<boolean> {
    const key = await this.getGeminiApiKey();
    return typeof key === 'string' && key.trim().length > 0;
  }

  /**
   * Securely stores or updates the Gemini API Key in SecretStorage.
   *
   * @param key The plain-text Gemini API Key to store.
   */
  public async setGeminiApiKey(key: string): Promise<void> {
    // NOTE: VS Code SecretStorage.store stores key value securely
    await this.secrets.store(SecretsProvider.GEMINI_API_KEY_STORAGE_KEY, key);
  }

  /**
   * Securely deletes the Gemini API Key from SecretStorage.
   */
  public async deleteGeminiApiKey(): Promise<void> {
    // NOTE: VS Code SecretStorage.delete removes the stored value
    await this.secrets.delete(SecretsProvider.GEMINI_API_KEY_STORAGE_KEY);
  }

  /**
   * Migrates an existing plain-text API key configuration in workspace settings
   * to VS Code SecretStorage. If migrated, it clears the legacy config property.
   *
   * @param config The WorkspaceConfiguration for 'agentFlow'
   * @returns A Promise resolving to true if migration occurred, false otherwise.
   */
  public async migrateFromSettings(config: vscode.WorkspaceConfiguration): Promise<boolean> {
    // Check if the legacy setting exists (using get to lookup value)
    const legacyKey = config.get<string>('geminiApiKey');

    if (legacyKey && legacyKey.trim().length > 0) {
      // 1. Store securely in OS Keychain SecretStorage
      await this.setGeminiApiKey(legacyKey);

      // 2. Clear plain-text config setting from user configuration globally
      await config.update('geminiApiKey', undefined, vscode.ConfigurationTarget.Global);

      return true;
    }

    return false;
  }
}
