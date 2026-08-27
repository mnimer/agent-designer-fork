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
  public async resolvePythonEnvironment(): Promise<ResolvedPythonEnv> {
    // 1. Check VS Code settings
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

    // 2. Check VIRTUAL_ENV environment variable
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

    // 3. Scan workspace folders for standard venv directories
    if (this.workspaceRoot) {
      const candidates = ['.venv', 'venv', 'env', '.conda'];
      for (const candidate of candidates) {
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

    // 4. Fallback to system PATH
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
