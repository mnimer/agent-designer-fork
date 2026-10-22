/**
 * PythonEnvResolver
 *
 * Discovers and validates local Python runtime environments and virtualenvs
 * within the active VS Code workspace, supporting pytest and agent execution.
 *
 * Job in Application:
 * Locates the most appropriate Python binary (virtualenv, Conda, or system interpreter)
 * for the AgentRunnerManager to execute synthesized multi-agent workflows and test suites.
 *
 * Architectural Decisions:
 * 1. Priority Resolution Order:
 *    a. Active VS Code configuration (`python.defaultInterpreterPath`)
 *    b. Environment variable (`VIRTUAL_ENV`)
 *    c. Standard workspace local folders (`.venv`, `venv`, `env`, `.conda`)
 *    d. System PATH binaries (`python3`, `python`)
 * 2. Cross-platform path handling for POSIX (`bin/python`) and Windows (`Scripts/python.exe`).
 * 3. Graceful fallback to system PATH if no virtual environment is present.
 * 4. Automatic A2A protocol detection and dependency provisioning (a2a-sdk, google-adk[a2a]).
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface ResolvedPythonEnv {
  path: string;
  isVirtualEnv: boolean;
  version?: string;
  source: 'vscode-config' | 'virtualenv-env' | 'workspace-folder' | 'system-path';
}

export class PythonEnvResolver {
  private workspaceRoot?: string;

  /**
   * Constructs the PythonEnvResolver instance.
   *
   * @param workspaceRoot Optional workspace root directory path
   */
  constructor(workspaceRoot?: string) {
    this.workspaceRoot =
      workspaceRoot ||
      (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
        ? vscode.workspace.workspaceFolders[0].uri.fsPath
        : undefined);
  }

  /**
   * Discovers the best available Python interpreter in the workspace.
   *
   * Logic Flow:
   * 1. Checks VS Code configuration for python interpreter path.
   * 2. Checks VIRTUAL_ENV environment variable.
   * 3. Scans workspace directory for local venv candidates (.venv, venv, env).
   * 4. Validates interpreter executable existence and queries version string.
   * 5. Falls back to system 'python3' or 'python'.
   *
   * @returns ResolvedPythonEnv object
   */
  /**
   * Discovers or resolves the best available Python interpreter, prioritizing local virtual environments.
   *
   * @param targetDir Optional specific directory to check for a local virtual environment first
   * @returns ResolvedPythonEnv object
   */
  public async resolvePythonEnvironment(targetDir?: string): Promise<ResolvedPythonEnv> {
    const candidateFolders = ['.venv', 'venv', 'env', '.conda'];

    // 1. Check targetDir for a local virtual environment
    if (targetDir) {
      for (const candidate of candidateFolders) {
        const candidateDir = path.join(targetDir, candidate);
        const candidateBin = this.getPythonBinPath(candidateDir);
        if (this.isFileExecutable(candidateBin)) {
          const version = await this.queryPythonVersion(candidateBin);
          return {
            path: candidateBin,
            isVirtualEnv: true,
            version,
            source: 'workspace-folder',
          };
        }
      }
    }

    // 2. Scan workspace root for standard venv directories
    if (this.workspaceRoot) {
      for (const candidate of candidateFolders) {
        const candidateDir = path.join(this.workspaceRoot, candidate);
        const candidateBin = this.getPythonBinPath(candidateDir);
        if (this.isFileExecutable(candidateBin)) {
          const version = await this.queryPythonVersion(candidateBin);
          return {
            path: candidateBin,
            isVirtualEnv: true,
            version,
            source: 'workspace-folder',
          };
        }
      }
    }

    // 3. Check VIRTUAL_ENV environment variable
    if (process.env.VIRTUAL_ENV) {
      const venvBin = this.getPythonBinPath(process.env.VIRTUAL_ENV);
      if (this.isFileExecutable(venvBin)) {
        const version = await this.queryPythonVersion(venvBin);
        return {
          path: venvBin,
          isVirtualEnv: true,
          version,
          source: 'virtualenv-env',
        };
      }
    }

    // 4. Check VS Code settings
    const configuredPath = vscode.workspace
      .getConfiguration('python')
      .get<string>('defaultInterpreterPath');

    if (configuredPath && configuredPath !== 'python') {
      const resolvedConfigured = this.resolveAbsolutePath(configuredPath);
      if (this.isFileExecutable(resolvedConfigured)) {
        const version = await this.queryPythonVersion(resolvedConfigured);
        return {
          path: resolvedConfigured,
          isVirtualEnv: this.detectIsVirtualEnv(resolvedConfigured),
          version,
          source: 'vscode-config',
        };
      }
    }

    // 5. Fallback to system PATH interpreter
    const systemPython = process.platform === 'win32' ? 'python.exe' : 'python3';
    const systemVersion = await this.queryPythonVersion(systemPython);

    return {
      path: systemPython,
      isVirtualEnv: false,
      version: systemVersion,
      source: 'system-path',
    };
  }

  /**
   * Ensures an isolated virtual environment (.venv) is present in the target directory
   * or workspace root, automatically creating one if only a global interpreter was found.
   *
   * @param targetDir Target folder path
   * @returns ResolvedPythonEnv pointing to an isolated virtual environment
   */
  public async ensureVirtualEnvironment(targetDir?: string): Promise<ResolvedPythonEnv> {
    // 1. Check if target directory already has an isolated virtual environment
    if (targetDir) {
      const targetVenvBin = this.getPythonBinPath(path.join(targetDir, '.venv'));
      if (this.isFileExecutable(targetVenvBin)) {
        const version = await this.queryPythonVersion(targetVenvBin);
        return {
          path: targetVenvBin,
          isVirtualEnv: true,
          version,
          source: 'workspace-folder',
        };
      }
    }

    // 2. If target directory is specified, create .venv directly inside it for full agent isolation
    if (targetDir && fs.existsSync(targetDir)) {
      const venvDir = path.join(targetDir, '.venv');
      const venvBin = this.getPythonBinPath(venvDir);
      const systemPython = process.platform === 'win32' ? 'python.exe' : 'python3';

      try {
        await execFileAsync(systemPython, ['-m', 'venv', venvDir]);
        if (this.isFileExecutable(venvBin)) {
          const version = await this.queryPythonVersion(venvBin);
          return {
            path: venvBin,
            isVirtualEnv: true,
            version,
            source: 'workspace-folder',
          };
        }
      } catch {}
    }

    // 3. Fallback to existing workspace virtual environment or system interpreter
    const current = await this.resolvePythonEnvironment(targetDir);
    if (current.isVirtualEnv) {
      return current;
    }

    const hostDir = targetDir || this.workspaceRoot || process.cwd();
    const venvDir = path.join(hostDir, '.venv');
    const venvBin = this.getPythonBinPath(venvDir);

    if (this.isFileExecutable(venvBin)) {
      const version = await this.queryPythonVersion(venvBin);
      return {
        path: venvBin,
        isVirtualEnv: true,
        version,
        source: 'workspace-folder',
      };
    }

    // Create a new .venv using the system python
    try {
      await execFileAsync(current.path, ['-m', 'venv', venvDir]);
      const version = await this.queryPythonVersion(venvBin);
      return {
        path: venvBin,
        isVirtualEnv: true,
        version,
        source: 'workspace-folder',
      };
    } catch {
      // If venv creation fails, return current interpreter
      return current;
    }
  }

  /**
   * Ensures that all dependencies declared in `requirements.txt` (plus any 3rd-party model SDKs
   * required by `agent.py`) are installed within the target virtual environment on every run.
   *
   * Because `.venv` is preserved across code regenerations for performance, running
   * `pip install -r requirements.txt` on every startup guarantees that any newly added packages
   * (such as `anthropic[vertex]`, `openai`, database drivers, or A2A extras when switching models
   * or tools) are always installed while already-installed packages are satisfied quickly from cache.
   *
   * Logic Flow:
   * 1. Validates that `requirements.txt` exists in `targetDir` (failing fast if missing).
   * 2. Validates that A2A dependencies are declared in `requirements.txt` when A2A is used.
   * 3. Runs `pip install -r requirements.txt` (appending `anthropic[vertex]`, `openai`, or `litellm`
   *    if referenced in `agent.py` but omitted from `requirements.txt`).
   * 4. Streams real-time progress logs via the optional `onLog` callback.
   *
   * @param pythonBin Path to python binary inside virtual environment
   * @param targetDir Target workspace or agent directory
   * @param onLog Optional callback for streaming runner log events
   */
  public async ensureDependenciesInstalled(
    pythonBin: string,
    targetDir: string,
    onLog?: (msg: string, stream?: 'stdout' | 'stderr' | 'system') => Promise<void> | void
  ): Promise<void> {
    const needsA2A = this.requiresA2ADependencies(targetDir);
    const needsAnthropic = this.requiresAnthropicDependencies(targetDir);
    const needsOpenAi = this.requiresOpenAiDependencies(targetDir);
    const needsLiteLlm = this.requiresLiteLlmDependencies(targetDir);

    const reqPath = path.join(targetDir, 'requirements.txt');
    const hasReqs = fs.existsSync(reqPath);

    if (!hasReqs) {
      // FAIL FAST: Never fall back to guessing or installing packages without requirements.txt
      throw new Error(
        `[Validation Error] 'requirements.txt' not found in ${targetDir}. All agent projects must have a valid requirements.txt before running or deploying.`
      );
    }

    const reqText = fs.readFileSync(reqPath, 'utf-8');

    // FAIL FAST: If A2A is required, verify requirements.txt explicitly declares A2A packages
    if (needsA2A) {
      if (!reqText.includes('google-adk[a2a]') && !reqText.includes('a2a-sdk')) {
        throw new Error(
          `[Validation Error] Agent-to-Agent (A2A) protocol detected in agent code, but 'requirements.txt' is missing required A2A dependencies ('google-adk[a2a]' and/or 'a2a-sdk[http-server]'). Failing fast before run or deployment.`
        );
      }
    }

    if (onLog) {
      await onLog(`[Local Runner] Installing dependencies from requirements.txt into .venv...`, 'system');
    }

    const pipArgs = ['-m', 'pip', 'install', '-r', reqPath];
    if (needsAnthropic && !/\banthropic\b/i.test(reqText)) {
      pipArgs.push('anthropic[vertex]>=0.49.0');
    }
    if (needsOpenAi && !/\bopenai\b/i.test(reqText)) {
      pipArgs.push('openai>=1.60.0');
    }
    if (needsLiteLlm && !/\blitellm\b/i.test(reqText)) {
      pipArgs.push('litellm>=1.75.5');
    }

    try {
      await execFileAsync(pythonBin, pipArgs, { cwd: targetDir });

      if (onLog) {
        await onLog(`[Local Runner] Dependencies installed successfully into .venv.`, 'system');
      }
    } catch (installErr: any) {
      const errorMsg = `[Local Runner Warning] Failed to install dependencies via pip: ${installErr?.message || installErr}`;
      if (onLog) {
        await onLog(errorMsg, 'stderr');
      }
      throw new Error(errorMsg);
    }
  }

  /**
   * Computes the complete list of Python import module names required by the target directory
   * based on `requirements.txt` and `agent.py` (including 3rd-party model SDKs like `anthropic`,
   * `openai`, and `litellm`, plus database/session drivers).
   * Ensures that when `.venv` is preserved across code regenerations and a user switches an agent
   * or sub-agent to a 3rd-party model (e.g., Claude, DeepSeek, Qwen, Llama, OpenAI, Grok),
   * `ensureDependenciesInstalled` detects the missing SDK and installs `requirements.txt`.
   *
   * @param targetDir Target workspace directory
   * @returns Deduplicated array of Python module names to verify via `import`
   */
  public getRequiredImportModules(targetDir: string): string[] {
    const modules = new Set<string>(['fastapi', 'uvicorn', 'pydantic', 'google.genai']);

    if (this.requiresAdkDependencies(targetDir)) {
      modules.add('google.adk');
    }
    if (this.requiresA2ADependencies(targetDir)) {
      modules.add('a2a');
    }
    if (this.requiresAnthropicDependencies(targetDir)) {
      modules.add('anthropic');
    }
    if (this.requiresOpenAiDependencies(targetDir)) {
      modules.add('openai');
    }
    if (this.requiresLiteLlmDependencies(targetDir)) {
      modules.add('litellm');
    }

    try {
      const reqPath = path.join(targetDir, 'requirements.txt');
      if (fs.existsSync(reqPath)) {
        const reqContent = fs.readFileSync(reqPath, 'utf-8');
        const packageToImportMap: Array<[RegExp, string]> = [
          [/^\s*anthropic(?:\[.*?\])?(?:[><=~!]|$)/im, 'anthropic'],
          [/^\s*openai(?:\[.*?\])?(?:[><=~!]|$)/im, 'openai'],
          [/^\s*litellm(?:\[.*?\])?(?:[><=~!]|$)/im, 'litellm'],
          [/^\s*google-cloud-firestore(?:\[.*?\])?(?:[><=~!]|$)/im, 'google.cloud.firestore'],
          [/^\s*google-cloud-spanner(?:\[.*?\])?(?:[><=~!]|$)/im, 'google.cloud.spanner'],
          [/^\s*google-cloud-bigquery(?:\[.*?\])?(?:[><=~!]|$)/im, 'google.cloud.bigquery'],
          [/^\s*psycopg2(?:-binary)?(?:[><=~!]|$)/im, 'psycopg2'],
          [/^\s*sqlalchemy(?:\[.*?\])?(?:[><=~!]|$)/im, 'sqlalchemy'],
          [/^\s*redis(?:\[.*?\])?(?:[><=~!]|$)/im, 'redis'],
        ];
        for (const [pattern, importName] of packageToImportMap) {
          if (pattern.test(reqContent)) {
            modules.add(importName);
          }
        }
      }
    } catch {}

    return Array.from(modules);
  }

  /**
   * Scans target directory to detect if Anthropic Claude (`anthropic[vertex]`) dependencies are required
   * by any root agent or sub-agent in the project.
   *
   * @param targetDir Target workspace directory
   * @returns boolean true if `anthropic` package is required
   */
  public requiresAnthropicDependencies(targetDir: string): boolean {
    try {
      const reqPath = path.join(targetDir, 'requirements.txt');
      if (fs.existsSync(reqPath)) {
        const reqContent = fs.readFileSync(reqPath, 'utf-8');
        if (/\banthropic\b/i.test(reqContent)) {
          return true;
        }
      }

      const pyFiles = ['agent.py', 'server.py', 'agent_workflow.py', 'main.py'];
      for (const file of pyFiles) {
        const filePath = path.join(targetDir, file);
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf-8');
          if (
            /\bclaude-[a-z0-9._@-]+/i.test(content) ||
            /\bpublishers\/anthropic\/models\//i.test(content) ||
            /\bfrom\s+anthropic\b|\bimport\s+anthropic\b|\bAnthropicLlm\b|\bClaude\b/.test(content)
          ) {
            return true;
          }
        }
      }
    } catch {}
    return false;
  }

  /**
   * Scans target directory to detect if OpenAI / Vertex AI OpenMaaS / xAI Grok (`openai`) dependencies
   * are required by any root agent or sub-agent in the project (`OpenAILlm`, `deepseek-ai/*`, `qwen/*`,
   * `meta/llama*`, `mistralai/*`, `openai/*`, `gpt-*`, `o1-*`, `o3-*`, `grok-*`).
   *
   * @param targetDir Target workspace directory
   * @returns boolean true if `openai` package is required
   */
  public requiresOpenAiDependencies(targetDir: string): boolean {
    try {
      const reqPath = path.join(targetDir, 'requirements.txt');
      if (fs.existsSync(reqPath)) {
        const reqContent = fs.readFileSync(reqPath, 'utf-8');
        if (/^\s*openai(?:\[.*?\])?(?:[><=~!\s]|$)/im.test(reqContent)) {
          return true;
        }
      }

      const pyFiles = ['agent.py', 'server.py', 'agent_workflow.py', 'main.py'];
      for (const file of pyFiles) {
        const filePath = path.join(targetDir, file);
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf-8');
          if (
            /\bOpenAILlm\b|\bfrom\s+openai\b|\bimport\s+openai\b/.test(content) ||
            /["'](?:deepseek-ai|qwen|meta|mistralai|openai)\/[a-z0-9._-]+["']/i.test(content) ||
            /["'](?:gpt-\d|o[134]-|grok-)[a-z0-9._-]*["']/i.test(content)
          ) {
            return true;
          }
        }
      }
    } catch {}
    return false;
  }

  /**
   * Scans target directory to detect if LiteLLM (`litellm`) dependencies are required.
   *
   * @param targetDir Target workspace directory
   * @returns boolean true if `litellm` package is required
   */
  public requiresLiteLlmDependencies(targetDir: string): boolean {
    try {
      const reqPath = path.join(targetDir, 'requirements.txt');
      if (fs.existsSync(reqPath)) {
        const reqContent = fs.readFileSync(reqPath, 'utf-8');
        if (/\blitellm\b/i.test(reqContent)) {
          return true;
        }
      }

      const pyFiles = ['agent.py', 'server.py', 'agent_workflow.py', 'main.py'];
      for (const file of pyFiles) {
        const filePath = path.join(targetDir, file);
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf-8');
          if (/\bLiteLlm\b|\bfrom\s+litellm\b|\bimport\s+litellm\b/.test(content)) {
            return true;
          }
        }
      }
    } catch {}
    return false;
  }

  /**
   * Scans target directory to detect if Google ADK (`google-adk` / `google.adk`) dependencies are required.
   *
   * Logic Flow:
   * 1. Inspects requirements.txt for references to 'google-adk'.
   * 2. Scans agent.py for 'google.adk' imports.
   *
   * @param targetDir Target workspace directory
   * @returns boolean true if ADK dependencies are required
   */
  public requiresAdkDependencies(targetDir: string): boolean {
    try {
      const reqPath = path.join(targetDir, 'requirements.txt');
      if (fs.existsSync(reqPath)) {
        const reqContent = fs.readFileSync(reqPath, 'utf-8');
        if (reqContent.includes('google-adk')) {
          return true;
        }
      }

      const agentPyPath = path.join(targetDir, 'agent.py');
      if (fs.existsSync(agentPyPath)) {
        const content = fs.readFileSync(agentPyPath, 'utf-8');
        if (content.includes('google.adk')) {
          return true;
        }
      }
    } catch {}
    return false;
  }

  /**
   * Scans target directory to detect if Agent-to-Agent (A2A) dependencies are needed.
   *
   * Logic Flow:
   * 1. Inspects requirements.txt for references to 'a2a' or 'a2a-sdk'.
   * 2. Scans agent source files (agent.py, server.py, agent_workflow.py, etc.) for A2A imports.
   * 3. Scans tools/ subdirectory for A2A references.
   *
   * @param targetDir Target workspace directory
   * @returns boolean true if A2A dependencies are required
   */
  public requiresA2ADependencies(targetDir: string): boolean {
    try {
      const reqPath = path.join(targetDir, 'requirements.txt');
      if (fs.existsSync(reqPath)) {
        const reqContent = fs.readFileSync(reqPath, 'utf-8');
        if (reqContent.includes('a2a')) {
          return true;
        }
      }

      const stripCommentsAndDocstrings = (src: string): string =>
        src
          .replace(/"""[\s\S]*?"""|'''[\s\S]*?'''/g, '')
          .replace(/#.*$/gm, '');

      const hasA2APackageImport = (src: string): boolean => {
        const cleaned = stripCommentsAndDocstrings(src);
        return (
          /^\s*(?:import\s+a2a\b|from\s+a2a\b)/m.test(cleaned) ||
          cleaned.includes('RemoteA2aAgent') ||
          cleaned.includes('google.adk.a2a') ||
          /\bto_a2a\s*\(/.test(cleaned)
        );
      };

      // Check common python entrypoints
      const pyFiles = ['agent.py', 'server.py', 'agent_workflow.py', 'main.py', '_agent_test_runner.py'];
      for (const file of pyFiles) {
        const filePath = path.join(targetDir, file);
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf-8');
          if (hasA2APackageImport(content)) {
            return true;
          }
        }
      }

      // Check tools subdirectory
      const toolsDir = path.join(targetDir, 'tools');
      if (fs.existsSync(toolsDir) && fs.statSync(toolsDir).isDirectory()) {
        const files = fs.readdirSync(toolsDir);
        for (const file of files) {
          if (file.endsWith('.py')) {
            const content = fs.readFileSync(path.join(toolsDir, file), 'utf-8');
            if (hasA2APackageImport(content)) {
              return true;
            }
          }
        }
      }
    } catch {}
    return false;
  }

  /**
   * Resolves relative path to absolute against the workspace root.
   *
   * @param targetPath Configured or relative file path
   * @returns Absolute file path string
   */
  private resolveAbsolutePath(targetPath: string): string {
    if (path.isAbsolute(targetPath)) {
      return targetPath;
    }
    return this.workspaceRoot ? path.resolve(this.workspaceRoot, targetPath) : path.resolve(targetPath);
  }

  /**
   * Returns standard platform-specific python binary path inside a virtual environment directory.
   *
   * @param envDir Root directory of virtualenv
   * @returns Absolute path to python executable
   */
  public getPythonBinPath(envDir: string): string {
    if (process.platform === 'win32') {
      return path.join(envDir, 'Scripts', 'python.exe');
    }
    return path.join(envDir, 'bin', 'python');
  }

  /**
   * Checks synchronously if file exists and is accessible.
   *
   * @param filePath Path to file
   * @returns boolean
   */
  public isFileExecutable(filePath: string): boolean {
    try {
      if (!fs.existsSync(filePath)) return false;
      fs.accessSync(filePath, fs.constants.X_OK);
      return true;
    } catch {
      // If access check fails or on Windows where X_OK behaves differently, check existence
      return fs.existsSync(filePath);
    }
  }

  /**
   * Queries Python version string by executing 'python --version'.
   *
   * @param pythonExecutable Path or command of python binary
   * @returns Python version string (e.g. 'Python 3.11.4') or undefined
   */
  public async queryPythonVersion(pythonExecutable: string): Promise<string | undefined> {
    try {
      const { stdout, stderr } = await execFileAsync(pythonExecutable, ['--version']);
      const output = (stdout || stderr || '').trim();
      return output.length > 0 ? output : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Heuristically determines if a python path belongs to a virtualenv.
   *
   * @param pythonPath Path to python binary
   * @returns boolean
   */
  private detectIsVirtualEnv(pythonPath: string): boolean {
    const normalized = pythonPath.toLowerCase();
    return (
      normalized.includes('.venv') ||
      normalized.includes('venv') ||
      normalized.includes('env') ||
      normalized.includes('conda')
    );
  }
}
