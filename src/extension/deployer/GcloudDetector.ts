/**
 * GcloudDetector
 *
 * Locates the `gcloud` binary path across multiple candidate directories,
 * performs Application Default Credentials (ADC) validation, and manages
 * cached OAuth access tokens.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';

export class GcloudDetector {
  private _cachedAccessToken: string | null = null;
  private _cachedAccessTokenExpiresAt = 0;
  private _cachedIdentityToken: string | null = null;
  private _cachedIdentityTokenExpiresAt = 0;
  private resolvedGcloudPath?: string;

  constructor(private deployer?: any) {}

  private get cachedAccessToken(): string | null {
    return this.deployer ? this.deployer.cachedAccessToken : this._cachedAccessToken;
  }

  private set cachedAccessToken(val: string | null) {
    if (this.deployer) {
      this.deployer.cachedAccessToken = val;
    } else {
      this._cachedAccessToken = val;
    }
  }

  private get cachedAccessTokenExpiresAt(): number {
    return this.deployer ? this.deployer.cachedAccessTokenExpiresAt : this._cachedAccessTokenExpiresAt;
  }

  private set cachedAccessTokenExpiresAt(val: number) {
    if (this.deployer) {
      this.deployer.cachedAccessTokenExpiresAt = val;
    } else {
      this._cachedAccessTokenExpiresAt = val;
    }
  }

  /**
   * Generates process environment with augmented PATH to ensure gcloud,
   * Python, virtual environments, and Homebrew/system paths are included
   * even when spawned from GUI VS Code.
   *
   * @param extraEnv Optional additional environment variables to merge
   * @param targetDirectory Optional agent target directory to prioritize its local .venv/bin
   * @returns ProcessEnv with augmented PATH
   */
  public getExtendedEnv(extraEnv?: NodeJS.ProcessEnv, targetDirectory?: string): NodeJS.ProcessEnv {
    const home = process.env.HOME || '';
    const binFolder = process.platform === 'win32' ? 'Scripts' : 'bin';
    const venvPaths: string[] = [];

    if (targetDirectory) {
      venvPaths.push(
        path.join(targetDirectory, '.venv', binFolder),
        path.join(targetDirectory, 'venv', binFolder),
        path.join(targetDirectory, 'env', binFolder)
      );
    }

    if (process.env.VIRTUAL_ENV) {
      venvPaths.push(path.join(process.env.VIRTUAL_ENV, binFolder));
    }

    venvPaths.push(
      path.join(process.cwd(), '.venv', binFolder),
      path.join(home, '.local', 'pipx', 'venvs', 'google-adk', binFolder)
    );

    const extraPaths = [
      ...venvPaths,
      path.join(home, '.local', 'bin'),
      path.join(home, '.cargo', 'bin'),
      path.join(home, 'Development', 'libraries', 'google-cloud-sdk', 'bin'),
      path.join(home, 'google-cloud-sdk', 'bin'),
      path.join(home, '.google-cloud-sdk', 'bin'),
      path.join(home, 'Applications', 'google-cloud-sdk', 'bin'),
      '/opt/homebrew/bin',
      '/opt/homebrew/Caskroom/google-cloud-sdk/latest/google-cloud-sdk/bin',
      '/usr/local/bin',
      '/usr/local/Caskroom/google-cloud-sdk/latest/google-cloud-sdk/bin',
      '/usr/bin',
      '/bin',
    ];

    if (this.resolvedGcloudPath && this.resolvedGcloudPath !== 'gcloud') {
      const gcloudDir = path.dirname(this.resolvedGcloudPath);
      if (!extraPaths.includes(gcloudDir)) {
        extraPaths.unshift(gcloudDir);
      }
    }

    const currentPath = process.env.PATH || '';
    const existingParts = currentPath.split(path.delimiter);
    const combinedPaths: string[] = [];

    for (const p of extraPaths) {
      if (!existingParts.includes(p) && !combinedPaths.includes(p) && fs.existsSync(p)) {
        combinedPaths.push(p);
      }
    }
    combinedPaths.push(...existingParts);

    // NOTE: PYTHONUNBUFFERED=1 forces Python to flush stdout/stderr line-by-line,
    // ensuring build and deployment progress streams to the UI in real time.
    return {
      ...process.env,
      PATH: combinedPaths.join(path.delimiter),
      PYTHONUNBUFFERED: '1',
      ...(extraEnv || {}),
    };
  }

  /**
   * Resolves the path to the `gcloud` binary across PATH, common SDK directories,
   * or by querying the user's interactive login shell on macOS/Linux.
   *
   * @returns Executable path for gcloud (e.g. '/path/to/gcloud' or 'gcloud')
   */
  public async resolveGcloudPath(): Promise<string> {
    if (this.resolvedGcloudPath && (this.resolvedGcloudPath === 'gcloud' || fs.existsSync(this.resolvedGcloudPath))) {
      return this.resolvedGcloudPath;
    }

    const home = process.env.HOME || '';
    const candidatePaths = [
      path.join(home, 'Development', 'libraries', 'google-cloud-sdk', 'bin', 'gcloud'),
      path.join(home, 'google-cloud-sdk', 'bin', 'gcloud'),
      path.join(home, '.google-cloud-sdk', 'bin', 'gcloud'),
      path.join(home, 'Applications', 'google-cloud-sdk', 'bin', 'gcloud'),
      '/opt/homebrew/Caskroom/google-cloud-sdk/latest/google-cloud-sdk/bin/gcloud',
      '/opt/homebrew/bin/gcloud',
      '/usr/local/Caskroom/google-cloud-sdk/latest/google-cloud-sdk/bin/gcloud',
      '/usr/local/bin/gcloud',
    ];

    for (const candidate of candidatePaths) {
      if (fs.existsSync(candidate)) {
        this.resolvedGcloudPath = candidate;
        return candidate;
      }
    }

    // Try detecting via PATH with extendedEnv
    if (this.hasBinary('gcloud')) {
      this.resolvedGcloudPath = 'gcloud';
      return 'gcloud';
    }

    // Fallback on macOS/Linux: query login shell with user profile
    if (process.platform !== 'win32') {
      try {
        const shell = process.env.SHELL || '/bin/zsh';
        const { execFile } = require('child_process');
        const trimmed = await new Promise<string>((resolve) => {
          execFile(shell, ['-lc', 'which gcloud'], { timeout: 4000 }, (err: any, stdout: string) => {
            resolve(err ? '' : (stdout || '').trim());
          });
        });
        if (trimmed && fs.existsSync(trimmed)) {
          this.resolvedGcloudPath = trimmed;
          return trimmed;
        }
      } catch {}
    }

    return 'gcloud';
  }

  /**
   * Public hasBinary method that delegates to deployer if overridden.
   *
   * @param binaryName Name of executable binary to check
   * @param targetDirectory Optional agent target directory to include local .venv/bin
   * @returns true if executable exists
   */
  public hasBinary(binaryName: string, targetDirectory?: string): boolean {
    if (this.deployer && this.deployer.hasBinary !== AgentEngineDeployer.prototype.hasBinary) {
      return this.deployer.hasBinary(binaryName, targetDirectory);
    }
    return this.hasBinaryInternal(binaryName, targetDirectory);
  }

  /**
   * Internal hasBinary method with actual detection across extended PATH and local virtualenvs.
   *
   * @param binaryName Name of executable binary to check
   * @param targetDirectory Optional agent target directory to include local .venv/bin
   * @returns true if executable exists
   */
  public hasBinaryInternal(binaryName: string, targetDirectory?: string): boolean {
    return this.resolveBinaryPath(binaryName, targetDirectory) !== null;
  }

  /**
   * Resolves the full file system path of an executable binary across extended PATH and local virtualenvs.
   *
   * @param binaryName Name of executable binary to locate
   * @param targetDirectory Optional agent target directory to include local .venv/bin
   * @returns Full path to the executable if found, otherwise null
   */
  public resolveBinaryPath(binaryName: string, targetDirectory?: string): string | null {
    try {
      const extendedEnv = this.getExtendedEnv(undefined, targetDirectory);
      const pathValue = extendedEnv.PATH || extendedEnv.Path || process.env.PATH || '';
      if (!pathValue) return null;

      const dirs = pathValue.split(path.delimiter);
      const isWin = process.platform === 'win32';

      // On Windows, try appending common executable extensions if not already present
      const candidates = isWin
        ? [binaryName, `${binaryName}.exe`, `${binaryName}.cmd`, `${binaryName}.bat`]
        : [binaryName];

      for (const dir of dirs) {
        if (!dir) continue;
        for (const candidate of candidates) {
          const fullPath = path.join(dir, candidate);
          if (fs.existsSync(fullPath)) {
            try {
              const stat = fs.statSync(fullPath);
              if (stat.isFile()) {
                return fullPath;
              }
            } catch {
              // Ignore stat failures
            }
          }
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Public getAccessTokenHeader that delegates to deployer if overridden.
   */
  public async getAccessTokenHeader(): Promise<string> {
    if (this.deployer && this.deployer.getAccessTokenHeader !== AgentEngineDeployer.prototype.getAccessTokenHeader) {
      return this.deployer.getAccessTokenHeader();
    }
    return this.getAccessTokenHeaderInternal();
  }

  /**
   * Internal implementation of active Google Cloud ADC access token fetcher.
   */
  public async getAccessTokenHeaderInternal(): Promise<string> {
    const now = Date.now();
    // Cache token for 10 minutes (access tokens typically expire in 60 minutes)
    if (this.cachedAccessToken && this.cachedAccessTokenExpiresAt > now) {
      return `Bearer ${this.cachedAccessToken}`;
    }

    // 1. Check environment variable token overrides
    const envToken = process.env.GOOGLE_OAUTH_ACCESS_TOKEN || process.env.CLOUDSDK_AUTH_ACCESS_TOKEN;
    if (envToken && envToken.trim().length > 0) {
      this.cachedAccessToken = envToken.trim();
      this.cachedAccessTokenExpiresAt = now + 10 * 60 * 1000;
      return `Bearer ${this.cachedAccessToken}`;
    }

    const gcloudBinary = await this.resolveGcloudPath();
    const extendedEnv = this.getExtendedEnv();

    const fetchToken = async (args: string[]): Promise<string> => {
      return new Promise<string>((resolve, reject) => {
        const cp = spawn(gcloudBinary, args, {
          env: extendedEnv,
          stdio: ['ignore', 'pipe', 'ignore'],
        });
        let stdout = '';
        cp.stdout.on('data', (d) => {
          stdout += d.toString();
        });
        cp.on('error', reject);
        cp.on('close', (code) => {
          if (code === 0 && stdout.trim().length > 0) {
            resolve(stdout.trim());
          } else {
            reject(new Error(`${gcloudBinary} ${args.join(' ')} exited with code ${code}`));
          }
        });
        // 15 second timeout to allow OAuth token refresh flows to complete without premature timeouts
        const timer = setTimeout(() => {
          try {
            cp.kill('SIGTERM');
          } catch {}
          reject(new Error(`gcloud token command timed out: ${args.join(' ')}`));
        }, 15000);
        cp.on('close', () => clearTimeout(timer));
      });
    };

    // 2. Try user credentials ('gcloud auth print-access-token')
    try {
      const token = await fetchToken(['auth', 'print-access-token']);
      if (token && token.length > 0) {
        this.cachedAccessToken = token;
        this.cachedAccessTokenExpiresAt = now + 10 * 60 * 1000; // 10 minutes
        return `Bearer ${token}`;
      }
    } catch {}

    // 3. Fall back to Application Default Credentials ('gcloud auth application-default print-access-token')
    try {
      const token = await fetchToken(['auth', 'application-default', 'print-access-token']);
      if (token && token.length > 0) {
        this.cachedAccessToken = token;
        this.cachedAccessTokenExpiresAt = now + 10 * 60 * 1000; // 10 minutes
        return `Bearer ${token}`;
      }
    } catch {}

    return '';
  }

  /**
   * Public getIdentityTokenHeader that delegates to deployer if overridden.
   * Cloud Run (*.run.app) IAM authentication requires an OIDC Identity Token
   * rather than an OAuth2 access token.
   */
  public async getIdentityTokenHeader(): Promise<string> {
    if (this.deployer && this.deployer.getIdentityTokenHeader && this.deployer.getIdentityTokenHeader !== AgentEngineDeployer.prototype.getIdentityTokenHeader) {
      return this.deployer.getIdentityTokenHeader();
    }
    return this.getIdentityTokenHeaderInternal();
  }

  /**
   * Internal implementation of Google Cloud OIDC identity token fetcher (`gcloud auth print-identity-token`).
   */
  public async getIdentityTokenHeaderInternal(): Promise<string> {
    const now = Date.now();
    if (this._cachedIdentityToken && this._cachedIdentityTokenExpiresAt > now) {
      return `Bearer ${this._cachedIdentityToken}`;
    }

    const envIdToken = process.env.GOOGLE_IDENTITY_TOKEN || process.env.CLOUDSDK_AUTH_IDENTITY_TOKEN;
    if (envIdToken && envIdToken.trim().length > 0) {
      this._cachedIdentityToken = envIdToken.trim();
      this._cachedIdentityTokenExpiresAt = now + 10 * 60 * 1000;
      return `Bearer ${this._cachedIdentityToken}`;
    }

    const gcloudBinary = await this.resolveGcloudPath();
    const extendedEnv = this.getExtendedEnv();

    try {
      const token = await new Promise<string>((resolve, reject) => {
        const cp = spawn(gcloudBinary, ['auth', 'print-identity-token'], {
          env: extendedEnv,
          stdio: ['ignore', 'pipe', 'ignore'],
        });
        let stdout = '';
        cp.stdout.on('data', (d) => {
          stdout += d.toString();
        });
        cp.on('error', reject);
        const timer = setTimeout(() => {
          try {
            cp.kill('SIGTERM');
          } catch {}
          reject(new Error('gcloud auth print-identity-token timed out'));
        }, 15000);
        cp.on('close', (code) => {
          clearTimeout(timer);
          if (code === 0 && stdout.trim().length > 0) {
            resolve(stdout.trim());
          } else {
            reject(new Error(`${gcloudBinary} auth print-identity-token exited with code ${code}`));
          }
        });
      });

      if (token && token.length > 0) {
        this._cachedIdentityToken = token;
        this._cachedIdentityTokenExpiresAt = now + 10 * 60 * 1000;
        return `Bearer ${token}`;
      }
    } catch {}

    return '';
  }
}

// Forward reference import to break circular dependency typechecks
import { AgentEngineDeployer } from '../AgentEngineDeployer';
