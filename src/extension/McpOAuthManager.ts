/**
 * McpOAuthManager
 *
 * Manages browser-based OAuth 2.0 / 2.1 authentication workflows for remote Model Context Protocol (MCP) servers.
 * Provides loopback callback listener on 127.0.0.1, opens the system browser, exchanges authorization codes
 * for Bearer tokens, securely persists credentials in VS Code SecretStorage, and synchronizes environment variables
 * to the local workspace .env file.
 *
 * Architectural Decisions:
 * 1. Ephemeral Local Loopback: Dynamically allocates an available port on 127.0.0.1 for redirect URI callbacks.
 *    Does not require registering custom OS URI schemes.
 * 2. Multi-tier Secret Persistence:
 *    - OS Keychain / SecretStorage: Persisted via VS Code `context.secrets` for persistent local runtime tests.
 *    - Workspace .env: Synchronized to workspace `.env` for agent child processes and runner tests.
 *    - Git Protection: Automatically ensures `.env` is listed in `.gitignore` to prevent accidental credential commits.
 * 3. Graceful Timeout & Cleanup: Ephemeral HTTP servers are destroyed immediately after callback resolution or on timeout.
 * 4. Token Exchange Fallback: Supports both direct token responses (implicit/fragment/query) and authorization code POST exchanges.
 *
 * Author: Mike Nimer <mikenimer@google.com>
 */

import * as vscode from 'vscode';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { URL } from 'url';

export interface OAuthFlowOptions {
  authUrl: string;
  tokenUrl?: string;
  clientId?: string;
  clientSecret?: string;
  scopes?: string[];
  secretName?: string;
  envVar?: string;
  workspaceDir?: string;
  timeoutMs?: number;
}

export interface OAuthFlowResult {
  success: boolean;
  bearerToken?: string;
  tokenPreview?: string;
  error?: string;
}

export class McpOAuthManager {
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  /**
   * Starts a browser-based OAuth 2.0 flow:
   * 1. Starts local loopback HTTP server on 127.0.0.1 (ephemeral port).
   * 2. Builds authorization URL appending redirect_uri and client credentials.
   * 3. Opens the system browser via vscode.env.openExternal.
   * 4. Captures the authorization code or token from redirect.
   * 5. Exchanges code for token if tokenUrl is specified.
   * 6. Persists token into SecretStorage and workspace .env.
   */
  public async startOAuthFlow(options: OAuthFlowOptions): Promise<OAuthFlowResult> {
    if (!options.authUrl || !options.authUrl.trim()) {
      return {
        success: false,
        error: 'Authorization URL is required to launch browser OAuth flow.',
      };
    }

    const timeoutMs = options.timeoutMs || 120000; // 2 minutes default

    return new Promise<OAuthFlowResult>((resolve) => {
      let isCompleted = false;
      let server: http.Server | null = null;
      let timeoutTimer: NodeJS.Timeout | null = null;

      const finish = (result: OAuthFlowResult) => {
        if (isCompleted) return;
        isCompleted = true;
        if (timeoutTimer) clearTimeout(timeoutTimer);
        if (server) {
          try {
            server.close();
          } catch {
            // Ignore close errors
          }
          server = null;
        }
        resolve(result);
      };

      timeoutTimer = setTimeout(() => {
        finish({
          success: false,
          error: `OAuth authentication timed out after ${timeoutMs / 1000} seconds. Please try again.`,
        });
      }, timeoutMs);

      // Create loopback HTTP server
      server = http.createServer(async (req, res) => {
        try {
          const reqUrl = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
          if (reqUrl.pathname !== '/callback') {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not found');
            return;
          }

          // Check for errors in query string
          const errorParam = reqUrl.searchParams.get('error');
          if (errorParam) {
            const errorDesc = reqUrl.searchParams.get('error_description') || errorParam;
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(this.getHtmlErrorPage(errorDesc));
            finish({
              success: false,
              error: `Authorization rejected: ${errorDesc}`,
            });
            return;
          }

          // Extract token or authorization code
          let token = reqUrl.searchParams.get('access_token') || reqUrl.searchParams.get('token');
          const code = reqUrl.searchParams.get('code');

          // Exchange code for token if needed
          if (!token && code && options.tokenUrl) {
            try {
              token = await this.exchangeCodeForToken({
                code,
                tokenUrl: options.tokenUrl,
                clientId: options.clientId,
                clientSecret: options.clientSecret,
                redirectUri: `http://127.0.0.1:${(server?.address() as any)?.port}/callback`,
              });
            } catch (exchangeErr: any) {
              res.writeHead(500, { 'Content-Type': 'text/html' });
              res.end(this.getHtmlErrorPage(exchangeErr?.message || 'Token exchange failed'));
              finish({
                success: false,
                error: `Token exchange failed: ${exchangeErr?.message || exchangeErr}`,
              });
              return;
            }
          }

          // If code was provided but no tokenUrl, treat code itself as token if no other option
          if (!token && code) {
            token = code;
          }

          if (!token) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(this.getHtmlErrorPage('No access token or authorization code was received.'));
            finish({
              success: false,
              error: 'No access token or authorization code was returned by the authorization server.',
            });
            return;
          }

          // Success HTML response
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(this.getHtmlSuccessPage());

          // Persist token in SecretStorage & .env
          if (options.secretName && options.envVar) {
            await this.saveSecret(options.secretName, options.envVar, token, options.workspaceDir);
          }

          const tokenPreview = this.getRedactedPreview(token);
          finish({
            success: true,
            bearerToken: token,
            tokenPreview,
          });
        } catch (handlerErr: any) {
          res.writeHead(500, { 'Content-Type': 'text/html' });
          res.end(this.getHtmlErrorPage(handlerErr?.message || 'Unexpected server error'));
          finish({
            success: false,
            error: handlerErr?.message || String(handlerErr),
          });
        }
      });

      // Listen on ephemeral port
      server.listen(0, '127.0.0.1', async () => {
        try {
          const addr = server?.address();
          if (!addr || typeof addr === 'string') {
            throw new Error('Failed to acquire loopback address');
          }

          const port = addr.port;
          const redirectUri = `http://127.0.0.1:${port}/callback`;

          // Construct target URL with params
          let targetUrl = (options.authUrl || '').trim();
          if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
            targetUrl = `https://${targetUrl}`;
          }
          const authUrlObj = new URL(targetUrl);
          authUrlObj.searchParams.set('redirect_uri', redirectUri);
          authUrlObj.searchParams.set('response_type', 'code');
          if (options.clientId) {
            authUrlObj.searchParams.set('client_id', options.clientId);
          }
          if (options.scopes && options.scopes.length > 0) {
            authUrlObj.searchParams.set('scope', options.scopes.join(' '));
          }

          const finalUrl = authUrlObj.toString();

          // Open external browser via vscode.env.openExternal
          let opened = false;
          try {
            opened = await vscode.env.openExternal(vscode.Uri.parse(finalUrl));
          } catch {
            opened = false;
          }

          // If vscode.env.openExternal returned false or was blocked, invoke OS-level browser opener
          if (!opened) {
            try {
              const { exec } = await import('child_process');
              const cmd = process.platform === 'darwin'
                ? `open "${finalUrl}"`
                : process.platform === 'win32'
                ? `start "" "${finalUrl}"`
                : `xdg-open "${finalUrl}"`;
              exec(cmd);
            } catch {
              // Ignore fallback error and let user complete via URL
            }
          }
        } catch (openErr: any) {
          finish({
            success: false,
            error: `Failed to launch browser: ${openErr?.message || openErr}`,
          });
        }
      });

      server.on('error', (err: any) => {
        finish({
          success: false,
          error: `Loopback server error: ${err?.message || err}`,
        });
      });
    });
  }

  /**
   * Exchanges an authorization code for an OAuth access token via HTTP POST.
   */
  public async exchangeCodeForToken(params: {
    code: string;
    tokenUrl: string;
    clientId?: string;
    clientSecret?: string;
    redirectUri: string;
  }): Promise<string> {
    const postData = new URLSearchParams();
    postData.set('grant_type', 'authorization_code');
    postData.set('code', params.code);
    postData.set('redirect_uri', params.redirectUri);
    if (params.clientId) postData.set('client_id', params.clientId);
    if (params.clientSecret) postData.set('client_secret', params.clientSecret);

    const response = await fetch(params.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: postData.toString(),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Token endpoint responded with HTTP ${response.status}: ${errText.slice(0, 200)}`);
    }

    const data: any = await response.json();
    const token = data.access_token || data.token || data.bearer_token;
    if (!token) {
      throw new Error('Token endpoint did not return an access_token in the response JSON.');
    }
    return token;
  }

  /**
   * Saves a bearer token securely to VS Code SecretStorage and local workspace .env file.
   */
  public async saveSecret(
    secretName: string,
    envVar: string,
    token: string,
    workspaceDir?: string
  ): Promise<void> {
    // 1. Store in VS Code OS Keychain SecretStorage
    const storageKey = `mcp_secret_${secretName}`;
    await this.context.secrets.store(storageKey, token);

    // 2. Synchronize to workspace .env file
    const rootDir = workspaceDir || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (rootDir && fs.existsSync(rootDir)) {
      this.syncTokenToEnvFile(rootDir, envVar, token);
      this.ensureGitignoreHasEnv(rootDir);
    }
  }

  /**
   * Retrieves a secret token from VS Code SecretStorage or workspace .env file.
   */
  public async getSecret(secretName: string, envVar?: string, workspaceDir?: string): Promise<string | undefined> {
    // Check SecretStorage first
    const storageKey = `mcp_secret_${secretName}`;
    const tokenFromStorage = await this.context.secrets.get(storageKey);
    if (tokenFromStorage) {
      return tokenFromStorage;
    }

    // Check workspace .env file
    const rootDir = workspaceDir || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (rootDir && envVar) {
      const envPath = path.join(rootDir, '.env');
      if (fs.existsSync(envPath)) {
        try {
          const content = fs.readFileSync(envPath, 'utf-8');
          const lines = content.split('\n');
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith(`${envVar}=`)) {
              let val = trimmed.slice(envVar.length + 1).trim();
              if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                val = val.slice(1, -1);
              }
              return val;
            }
          }
        } catch {
          // Ignore read error
        }
      }
    }

    return undefined;
  }

  /**
   * Appends or updates an environment variable in a .env file.
   */
  public syncTokenToEnvFile(rootDir: string, envVar: string, token: string): void {
    const envPath = path.join(rootDir, '.env');
    let content = '';
    if (fs.existsSync(envPath)) {
      try {
        content = fs.readFileSync(envPath, 'utf-8');
      } catch {
        content = '';
      }
    }

    const lines = content.split('\n');
    let replaced = false;
    const newLines = lines.map((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith(`${envVar}=`)) {
        replaced = true;
        return `${envVar}="${token}"`;
      }
      return line;
    });

    if (!replaced) {
      if (newLines.length > 0 && newLines[newLines.length - 1].trim() !== '') {
        newLines.push('');
      }
      newLines.push(`${envVar}="${token}"`);
    }

    try {
      fs.writeFileSync(envPath, newLines.join('\n'), 'utf-8');
    } catch {
      // Ignore write errors if permissions fail
    }
  }

  /**
   * Ensures that .env is listed in .gitignore so tokens are never committed.
   */
  public ensureGitignoreHasEnv(rootDir: string): void {
    const gitignorePath = path.join(rootDir, '.gitignore');
    let content = '';
    if (fs.existsSync(gitignorePath)) {
      try {
        content = fs.readFileSync(gitignorePath, 'utf-8');
      } catch {
        return;
      }
    }

    const entries = content.split('\n').map((l) => l.trim());
    if (!entries.includes('.env') && !entries.includes('*.env')) {
      const addition = content.endsWith('\n') || content === '' ? '.env\n' : '\n.env\n';
      try {
        fs.appendFileSync(gitignorePath, addition, 'utf-8');
      } catch {
        // Ignore write error
      }
    }
  }

  /**
   * Generates a safe redacted preview of a token (e.g. "xoxp-...49a1").
   */
  public getRedactedPreview(token: string): string {
    if (!token || token.length < 8) return '••••••••';
    const start = token.slice(0, 4);
    const end = token.slice(-4);
    return `${start}...${end}`;
  }

  private getHtmlSuccessPage(): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>MCP Authorization Successful</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background-color: #f8fafc; color: #1e293b; }
    .card { background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1); max-width: 480px; text-align: center; }
    .icon { width: 48px; height: 48px; margin: 0 auto 16px; color: #16a34a; }
    h2 { margin: 0 0 12px; font-size: 20px; font-weight: 600; }
    p { margin: 0; color: #64748b; font-size: 14px; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">
    <svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
    </svg>
    <h2>Authorization Successful!</h2>
    <p>Your Model Context Protocol (MCP) Bearer Token has been securely captured by the Visual Agent Designer.</p>
    <p style="margin-top: 12px;">You can now close this browser tab and return to VS Code.</p>
  </div>
</body>
</html>`;
  }

  private getHtmlErrorPage(errorMessage: string): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>MCP Authorization Error</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background-color: #f8fafc; color: #1e293b; }
    .card { background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1); max-width: 480px; text-align: center; }
    .icon { width: 48px; height: 48px; margin: 0 auto 16px; color: #dc2626; }
    h2 { margin: 0 0 12px; font-size: 20px; font-weight: 600; color: #dc2626; }
    p { margin: 0; color: #64748b; font-size: 14px; line-height: 1.5; }
    .error-box { background: #fee2e2; color: #991b1b; padding: 12px; border-radius: 6px; margin-top: 16px; font-size: 13px; font-family: monospace; word-break: break-word; }
  </style>
</head>
<body>
  <div class="card">
    <svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
    </svg>
    <h2>Authorization Failed</h2>
    <p>The authorization server returned an error during the handshake.</p>
    <div class="error-box">${errorMessage}</div>
    <p style="margin-top: 16px;">Please return to VS Code to review configuration and retry.</p>
  </div>
</body>
</html>`;
  }
}
