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
   * Ensures that required runtime packages (fastapi, uvicorn, google-genai, requirements.txt)
   * are installed within the target virtual environment.
   *
   * Logic Flow:
   * 1. Tests if core dependencies (fastapi, uvicorn) can be imported by the python binary.
   * 2. If import succeeds, returns immediately to maintain low latency on startup.
   * 3. If import fails, checks for 'requirements.txt' in target directory and runs 'pip install -r requirements.txt'.
   * 4. If requirements.txt is absent, installs core fallback packages (fastapi, uvicorn, google-genai, pydantic).
   * 5. Streams real-time progress logs via the optional onLog callback.
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
    try {
      // Step 1: Quick import check
      await execFileAsync(pythonBin, ['-c', 'import fastapi, uvicorn'], { cwd: targetDir });
      return; // All required packages are already installed
    } catch {
      // Step 2: Dependencies need to be installed
      const reqPath = path.join(targetDir, 'requirements.txt');
      const hasReqs = fs.existsSync(reqPath);

      if (onLog) {
        await onLog(
          hasReqs
            ? `[Local Runner] Installing dependencies from requirements.txt into .venv...`
            : `[Local Runner] Installing core dependencies (fastapi, uvicorn, google-genai) into .venv...`,
          'system'
        );
      }

      try {
        if (hasReqs) {
          await execFileAsync(pythonBin, ['-m', 'pip', 'install', '-r', reqPath], { cwd: targetDir });
        } else {
          await execFileAsync(
            pythonBin,
            ['-m', 'pip', 'install', 'fastapi', 'uvicorn', 'google-genai', 'pydantic'],
            { cwd: targetDir }
          );
        }

        if (onLog) {
          await onLog(`[Local Runner] Dependencies installed successfully.`, 'system');
        }
      } catch (installErr: any) {
        if (onLog) {
          await onLog(
            `[Local Runner Warning] Failed to install dependencies via pip: ${installErr?.message || installErr}`,
            'stderr'
          );
        }
      }
    }
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
