/**
 * AgentEngineDeployer
 *
 * Native Google Cloud Vertex AI Agent Engine (Agent Runtime) deployment and lifecycle manager.
 * Orchestrates packaging of agent project directories, invoking native deployment via Google ADK
 * `agents-cli deploy` (or `python deploy.py`), persisting `deployment_metadata.json`, streaming build
 * and container logs in real time via WebviewBridge, and enabling remote execution testing.
 *
 * Job in Application:
 * Serves as the extension-side orchestrator for Google Cloud Agent Engine deployments from the visual designer.
 * Manages deployment state transitions, in-place updates vs. initial creates, and live HTTP passthrough testing.
 *
 * Architectural Decisions:
 * 1. Dual Deployment Path Alignment: Implements deployment conforming to the official Google ADK
 *    documentation at https://adk.dev/deploy/agent-runtime/. When `adk` is available, uses the standard
 *    `adk deploy agent_engine --project <project> --region <region> ... .` approach. When `agents-cli` is
 *    present, supports accelerated deployment via `agents-cli deploy --no-confirm-project ...`.
 * 2. Immutable Lifecycle Tracking: Detects and persists `deployment_metadata.json` in the target agent directory.
 *    Subsequent deployments recognize existing resource IDs to perform safe in-place container updates
 *    (via `--agent_engine_id` in `adk`).
 * 3. Real-Time Telemetry Streaming: Pipes stdout/stderr from Cloud Build and deployment subprocesses directly
 *    into the VS Code webview terminal via WebviewBridge (`AGENT_ENGINE_DEPLOY_LOG`).
 * 4. Passthrough Remote Invocations: Connects directly to the deployed reasoning engine's `:streamQuery?alt=sse`
 *    HTTP streaming endpoint (`https://{location}-aiplatform.googleapis.com/v1/{resourceId}:streamQuery?alt=sse`),
 *    enabling one-click streaming and conversational verification without requiring local runner infrastructure.
 * 5. Resilient Environment & Fallbacks: Augments child execution environment with extended PATH resolution
 *    (~/.local/bin, /opt/homebrew/bin, etc.) to ensure tools installed via uv/pipx are reliably discovered,
 *    and falls back cleanly to `deploy.py` if CLI binaries are not detected.
 * 6. Strict Failure & Resource ID Verification: Does not rely solely on process exit code (which can be 0 even
 *    when CLI tools catch exceptions and print errors). Scans output for explicit failure patterns (Deploy failed,
 *    PERMISSION_DENIED, etc.) and strictly requires a genuine Reasoning Engine resource ID from the CLI before
 *    declaring deployment success, preventing false success reports and bogus metadata.
 * 7. Ignore Files Safeguard: Automatically provisions `.gcloudignore`, `.gitignore`, and `.ae_ignore`
 *    files ensuring large artifacts (such as local `.venv/` virtual environments, build caches, and
 *    temporary files) are never packaged during deployment. This prevents deployments from exceeding
 *    the strict 8 MiB (8388608 bytes) Vertex AI API request payload ceiling.
 * 8. Resilient Session State & Background Execution: Subprocesses run asynchronously in the extension host
 *    Node process. An in-memory `activeDeployments` registry persists lifecycle status and full log
 *    history across webview tab switches and reloads, seamlessly replaying buffered logs.
 * 9. Python Identifier Direct In-Place Validation: Python ADK strictly mandates valid Python identifiers
 *    (matching `^[a-zA-Z_][a-zA-Z0-9_]*$`) for agent directory names when generating `--gemini_enterprise_app_name`
 *    and executing `load_agent`. The deployer validates that the target folder adheres to valid Python identifier naming
 *    and deploys in place without creating duplicate sibling directories, preventing repository clutter.
 * 10. Agent Submodule Path Resolution: ADK container runtimes (`adk api_server`) mount `/app/agents` and load agents
 *    as submodules (`importlib.import_module(f"{agent_name}.agent")`), which does not include the agent subdirectory
 *    in `sys.path`. The deployer ensures `agent.py` prepends its directory to `sys.path`, allowing local sibling module
 * 11. Process Lifecycle, Signal & Stream Telemetry: Process execution sets PYTHONUNBUFFERED=1 for instantaneous
 *     line-by-line CLI streaming, tracks intentional cancellations via cancelledDirectories to transition status to 'idle'
 *     without spurious errors, and handles OS termination signals gracefully without confusing 'exit code null' messages.
 * 12. Model Selection & Global Region Mandate: Gemini 1.x and 2.x models (including gemini-2.5-flash) are deprecated.
 *     gemini-3.7-flash is the primary model for Vertex AI, but requires the global region (location='global' or
 *     GOOGLE_CLOUD_LOCATION='global'). Regional endpoints return 404 NOT_FOUND for gemini-3.7-flash publisher models.
 *     Generated code and runtime environments must configure global location for model inference.
 * 13. Stale Deployment Auto-Recovery: When an existing reasoning engine has been deleted in Google Cloud Console
 *     (returning 404 NOT_FOUND / "Reasoning Engine [...] is not found"), the deployer automatically catches this error,
 *     purges stale deployment_metadata.json from disk and memory, and immediately triggers a fresh deployment with
 *     forceNew: true to create a new Reasoning Engine instance seamlessly without requiring manual user intervention.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import * as vscode from 'vscode';
import { ChildProcess, spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as https from 'https';
import * as http from 'http';
import { WebviewBridge } from './WebviewBridge';
import { PythonEnvResolver } from './PythonEnvResolver';
import { AgentWorkflowDocument } from '../shared/types';
import { validateTargetFolder, sanitizeFolderBaseName } from '../shared/folderValidation';

/**
 * Persisted schema for `deployment_metadata.json`.
 */
export interface DeploymentMetadataRecord {
  remote_agent_runtime_id: string;
  deployment_target: 'agent_runtime';
  is_a2a: boolean;
  agent_directory: string;
  deployment_timestamp: string;
  service_url: string;
  console_url?: string;
  project_id: string;
  region: string;
  service_account?: string;
  network_attachment?: string;
  staging_bucket?: string;
  status: 'ACTIVE' | 'DEPLOYING' | 'FAILED' | 'READY';
}

/**
 * In-memory active deployment state tracked across UI navigation.
 */
export interface ActiveDeploymentRecord {
  targetDirectory: string;
  status: 'idle' | 'packaging' | 'building' | 'deploying' | 'success' | 'error';
  logs: Array<{ text: string; stream: 'stdout' | 'stderr' | 'system'; timestamp: string }>;
  startTime?: number;
  error?: string;
  metadata?: DeploymentMetadataRecord | null;
  remoteRuntimeId?: string;
  serviceUrl?: string;
  consoleUrl?: string;
  isExistingDeployment?: boolean;
}

/**
 * Options passed to `AgentEngineDeployer.deploy()`.
 */
export interface AgentEngineDeployOptions {
  targetDirectory: string;
  projectId: string;
  region?: string;
  serviceAccount?: string;
  networkAttachment?: string;
  stagingBucket?: string;
  forceNew?: boolean;
  displayName?: string;
  agentEngineId?: string;
  document?: any;
  envVars?: Record<string, string>;
  bridge?: WebviewBridge;
}

/**
 * Result returned by `AgentEngineDeployer.deploy()`.
 */
export interface AgentEngineDeployResult {
  success: boolean;
  remoteRuntimeId?: string;
  serviceUrl?: string;
  consoleUrl?: string;
  metadata?: DeploymentMetadataRecord;
  error?: string;
}

/**
 * Options for `AgentEngineDeployer.testRemoteAgentRuntime()`.
 */
export interface AgentEngineTestOptions {
  targetDirectory: string;
  query: string;
  bridge?: WebviewBridge;
}

/**
 * Result returned by `AgentEngineDeployer.testRemoteAgentRuntime()`.
 */
export interface AgentEngineTestResult {
  success: boolean;
  query: string;
  response?: string;
  durationMs: number;
  error?: string;
}

export class AgentEngineDeployer implements vscode.Disposable {
  private activeProcesses: Map<string, ChildProcess> = new Map();
  private activeDeployments: Map<string, ActiveDeploymentRecord> = new Map();
  private cancelledDirectories: Set<string> = new Set();
  private pythonResolver: PythonEnvResolver;

  /**
   * Initializes the AgentEngineDeployer.
   *
   * @param pythonResolver Optional Python environment resolver instance
   */
  constructor(pythonResolver?: PythonEnvResolver) {
    this.pythonResolver = pythonResolver || new PythonEnvResolver();
  }

  /**
   * Ensures that essential ignore files (.gcloudignore, .gitignore, .ae_ignore) exist
   * in the target directory and exclude large artifacts like .venv/, __pycache__/, .git/, etc.
   *
   * Crucial Fix: ADK packages directories using `shutil.ignore_patterns`. Without proper ignore files,
   * local virtualenvs (.venv, 100MB-800MB) get packaged and sent to the Vertex AI Agent Platform REST API,
   * exceeding the strict 8 MiB (8388608 bytes) API payload limit and causing 400 INVALID_ARGUMENT failures.
   *
   * @param targetDirectory Target folder containing agent code
   */
  public ensureIgnoreFiles(targetDirectory: string): void {
    const requiredPatterns = [
      '.venv',
      '.venv/',
      '.venv*',
      'venv',
      'venv/',
      'env',
      'env/',
      '__pycache__',
      '__pycache__/',
      '*.pyc',
      '.pytest_cache',
      '.pytest_cache/',
      '.coverage',
      'htmlcov',
      '.uv',
      '.uv/',
      '*.tmp',
      '*.log',
      '.git',
      '.git/',
      '.DS_Store',
      'node_modules',
      'node_modules/',
    ];

    const defaultContent = `# Google Cloud & ADK deployment ignore patterns
# Prevents large virtual environments and build artifacts from exceeding the 8MB API payload limit
${requiredPatterns.join('\n')}
`;

    const filenames = ['.gcloudignore', '.gitignore', '.ae_ignore'];
    for (const filename of filenames) {
      const filePath = path.join(targetDirectory, filename);
      if (!fs.existsSync(filePath)) {
        try {
          fs.writeFileSync(filePath, defaultContent, 'utf8');
        } catch {
          // Graceful fallback
        }
      } else {
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          const rawLines = content.split('\n');
          // Crucial: ADK's _get_ignore_patterns_func passes lines directly to Python shutil.ignore_patterns.
          // shutil.ignore_patterns does NOT support negation (!) and a bare '*' will cause ALL files to be ignored!
          // We must filter out bare '*' and negation '!' lines to prevent 0 files from being copied.
          const cleanedLines = rawLines.filter((l) => {
            const trimmed = l.trim();
            if (trimmed === '*' || trimmed === '/*' || trimmed.startsWith('!')) {
              return false;
            }
            return true;
          });
          const existingTrimmed = new Set(cleanedLines.map((l) => l.trim()));
          const missing = requiredPatterns.filter((pat) => !existingTrimmed.has(pat));
          const updatedContent =
            cleanedLines.join('\n') +
            (missing.length > 0
              ? '\n# Added to prevent exceeding 8MB payload limit\n' + missing.join('\n') + '\n'
              : '');
          fs.writeFileSync(filePath, updatedContent, 'utf8');
        } catch {
          // Graceful fallback
        }
      }
    }
  }

  /**
   * Cleans up orphaned temporary staging directories created by ADK CLI (e.g. <app_name>_tmpYYYYMMDD_HHMMSS).
   * ADK's cli_deploy creates these temporary folders in the parent folder of the agent, and does not remove
   * them when an error occurs or on exit.
   *
   * @param targetDirectory The agent's target folder
   * @param deployStartTime The timestamp when deployment was initiated
   */
  public cleanupAdkTempDirectories(targetDirectory: string, deployStartTime?: number): void {
    try {
      const parentDir = path.dirname(targetDirectory);
      const folderBase = path.basename(targetDirectory);
      if (!fs.existsSync(parentDir)) return;

      const entries = fs.readdirSync(parentDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.startsWith(`${folderBase}_tmp`)) {
          const tempPath = path.join(parentDir, entry.name);
          try {
            if (deployStartTime) {
              const stat = fs.statSync(tempPath);
              // Only delete if created around or after deployment start (with 60s tolerance)
              if (stat.mtimeMs < deployStartTime - 60000) {
                continue;
              }
            }
            fs.rmSync(tempPath, { recursive: true, force: true });
          } catch {
            // Graceful ignore
          }
        }
      }
    } catch {
      // Graceful ignore
    }
  }

  /**
   * Resolves whether the deployment target directory contains generated agent code
   * and adheres to Python identifier naming requirements for Agent Engine.
   *
   * @param targetDir Path to target agent directory
   * @returns Object indicating whether directory is valid, any missing files, and naming error if invalid
   */
  public validateTargetDirectory(targetDir: string): {
    valid: boolean;
    missingFiles: string[];
    nameError?: string;
  } {
    // NOTE: Validate folder name against Python identifier requirements for Agent Engine
    const folderValidation = validateTargetFolder(targetDir);
    if (!folderValidation.isValid) {
      return {
        valid: false,
        missingFiles: [],
        nameError: folderValidation.error,
      };
    }

    // NOTE: Checking for essential ADK entry points
    const requiredFiles = ['agent.py'];
    const missing: string[] = [];

    if (!fs.existsSync(targetDir)) {
      return { valid: false, missingFiles: ['directory_not_found'] };
    }

    for (const file of requiredFiles) {
      if (!fs.existsSync(path.join(targetDir, file))) {
        missing.push(file);
      }
    }

    return {
      valid: missing.length === 0,
      missingFiles: missing,
    };
  }

  /**
   * Evaluates whether a deployment failure message or build logs indicate that the targeted
   * Reasoning Engine resource was deleted in the Google Cloud Console or does not exist on Vertex AI (404 NOT_FOUND).
   *
   * Matches patterns such as:
   * - "Failed to deploy to Agent Platform: 404 NOT_FOUND. {'error': {'code': 404, 'message': 'Reasoning Engine [...] is not found.', 'status': 'NOT_FOUND'}}"
   * - "Deploy failed: 404 NOT_FOUND. {'error': {'code': 404, 'message': 'Reasoning Engine [...] is not found.'"
   * - "NotFound: 404 Resource 'projects/.../reasoningEngines/...' was not found"
   *
   * @param message Primary error message or detected failure line
   * @param logs Optional stream logs accumulated during deployment
   * @returns true if the failure corresponds to an engine not found error on Vertex AI
   */
  public isReasoningEngineNotFoundError(message?: string, logs: string[] = []): boolean {
    const combined = ((message || '') + ' ' + logs.join(' ')).toLowerCase();
    const hasNotFound = combined.includes('not found') || combined.includes('not_found');
    const has404 = combined.includes('404');
    const hasReasoningContext =
      combined.includes('reasoning engine') ||
      combined.includes('agent engine') ||
      combined.includes('reasoningengine') ||
      combined.includes('reasoningengines');

    if (combined.includes('is not found') && hasReasoningContext) {
      return true;
    }
    if (has404 && hasNotFound && hasReasoningContext) {
      return true;
    }
    if (hasNotFound && combined.includes('reasoningengines/')) {
      return true;
    }
    return false;
  }

  /**
   * Reads existing deployment metadata if present.
   *
   * @param targetDir Path to agent directory
   * @returns Parsed deployment metadata record or null
   */
  public readDeploymentMetadata(targetDir: string): DeploymentMetadataRecord | null {
    const metaPath = path.join(targetDir, 'deployment_metadata.json');
    if (!fs.existsSync(metaPath)) {
      return null;
    }

    try {
      const raw = fs.readFileSync(metaPath, 'utf8');
      const meta = JSON.parse(raw) as DeploymentMetadataRecord;
      // NOTE: Normalize obsolete /api/run_sse path to official Vertex AI :streamQuery?alt=sse route
      if (meta && meta.service_url && meta.service_url.includes('/api/run_sse')) {
        try {
          const u = new URL(meta.service_url);
          if (u.pathname.includes('/reasoningEngines/')) {
            u.pathname = u.pathname.replace(/\/api\/run_sse\b/, ':streamQuery');
            if (!u.searchParams.has('alt')) {
              u.searchParams.set('alt', 'sse');
            }
            meta.service_url = u.toString();
          }
        } catch {}
      }
      return meta;
    } catch (err) {
      console.warn(`[AgentEngineDeployer] Failed to read ${metaPath}:`, err);
      return null;
    }
  }

  /**
   * Writes or updates deployment metadata file on disk.
   *
   * @param targetDir Target directory
   * @param meta Deployment metadata record to persist
   */
  public writeDeploymentMetadata(targetDir: string, meta: DeploymentMetadataRecord): void {
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // NOTE: Normalize obsolete /api/run_sse path to official Vertex AI :streamQuery?alt=sse route
    if (meta.service_url && meta.service_url.includes('/api/run_sse')) {
      try {
        const u = new URL(meta.service_url);
        if (u.pathname.includes('/reasoningEngines/')) {
          u.pathname = u.pathname.replace(/\/api\/run_sse\b/, ':streamQuery');
          if (!u.searchParams.has('alt')) {
            u.searchParams.set('alt', 'sse');
          }
          meta.service_url = u.toString();
        }
      } catch {}
    }

    const metaPath = path.join(targetDir, 'deployment_metadata.json');
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');
  }

  /**
   * Alias for writeDeploymentMetadata to persist updated deployment state.
   */
  public saveDeploymentMetadata(targetDir: string, meta: DeploymentMetadataRecord): void {
    this.writeDeploymentMetadata(targetDir, meta);
  }

  /**
   * Constructs the Google Cloud Console URL for a given Vertex AI Agent Runtime resource.
   *
   * @param location Region or 'global'
   * @param projectId GCP Project ID
   * @param resourceId Reasoning engine resource ID or full path
   * @returns Formatted Cloud Console URL
   */
  public resolveConsoleUrl(location: string, projectId: string, resourceId: string): string {
    const shortId = resourceId.split('/').pop() || resourceId;
    return `https://console.cloud.google.com/vertex-ai/reasoning-engines/locations/${location}/reasoning-engines/${shortId}?project=${projectId}`;
  }

  /**
   * Constructs the live HTTP streaming URL for invoking the deployed Agent Runtime.
   * Vertex AI Agent Engine (Reasoning Engine) resources are invoked via the standard
   * `:streamQuery?alt=sse` REST streaming endpoint.
   *
   * @param location Region or 'global'
   * @param projectId GCP Project ID
   * @param resourceId Reasoning engine resource ID or full resource name
   * @returns Formatted streaming endpoint URL
   */
  public resolveEndpointUrl(location: string, projectId: string, resourceId: string): string {
    const isFullResource = resourceId.startsWith('projects/');
    const resourcePath = isFullResource
      ? resourceId
      : `projects/${projectId}/locations/${location}/reasoningEngines/${resourceId}`;
    // NOTE: Vertex AI Reasoning Engine REST API streamQuery method
    return `https://${location}-aiplatform.googleapis.com/v1/${resourcePath}:streamQuery?alt=sse`;
  }

  /**
   * Ensures an agents-cli-manifest.yaml file is present in the target directory.
   * Vertex AI Agent Engine deployments via `agents-cli deploy` read configuration
   * from this manifest file (including deployment_target: agent_runtime).
   *
   * @param targetDirectory Target folder containing agent code
   * @param options Deployment configuration options
   */
  public ensureManifestFile(targetDirectory: string, options: AgentEngineDeployOptions): void {
    const manifestPath = path.join(targetDirectory, 'agents-cli-manifest.yaml');
    const region = options.region && options.region !== 'global' ? options.region : 'us-central1';
    // NOTE: Python agent identifiers must not contain hyphens
    const projectName = path.basename(targetDirectory).replace(/[^a-zA-Z0-9_]/g, '_') || 'adk_agent';

    if (!fs.existsSync(manifestPath)) {
      const manifestContent = `name: ${projectName}
agent_directory: .
region: ${region}
create_params:
  deployment_target: agent_runtime
  is_a2a: false
`;
      fs.writeFileSync(manifestPath, manifestContent, 'utf8');
    } else {
      // If manifest exists, verify deployment_target is configured as agent_runtime
      try {
        let content = fs.readFileSync(manifestPath, 'utf8');
        if (!content.includes('agent_runtime')) {
          if (content.includes('deployment_target:')) {
            content = content.replace(/deployment_target:\s*['"]?[a-zA-Z0-9_-]+['"]?/, 'deployment_target: agent_runtime');
          } else if (content.includes('create_params:')) {
            content = content.replace('create_params:', 'create_params:\n  deployment_target: agent_runtime');
          } else {
            content += '\ncreate_params:\n  deployment_target: agent_runtime\n  is_a2a: false\n';
          }
          fs.writeFileSync(manifestPath, content, 'utf8');
        }
      } catch {
        // Fallback silently if manifest is binary or unreadable
      }
    }
  }

  /**
   * Ensures a pyproject.toml file is present in the target directory.
   * `agents-cli deploy` uses `uv sync` to generate `uv.lock` and introspect the agent,
   * which strictly requires a valid `pyproject.toml` file.
   *
   * @param targetDirectory Target folder containing agent code
   * @param options Deployment configuration options
   */
  public ensurePyProjectToml(targetDirectory: string, options: AgentEngineDeployOptions): void {
    const pyprojectPath = path.join(targetDirectory, 'pyproject.toml');
    if (fs.existsSync(pyprojectPath)) {
      try {
        let existing = fs.readFileSync(pyprojectPath, 'utf8');
        if (!existing.includes('[tool.uv]')) {
          existing += '\n[tool.uv]\npackage = false\n';
          fs.writeFileSync(pyprojectPath, existing, 'utf8');
        }
      } catch {
        // Fallback gracefully if file read/write fails
      }
      return;
    }

    const projectName = path.basename(targetDirectory).replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase() || 'adk_agent';
    const requirementsPath = path.join(targetDirectory, 'requirements.txt');
    const dependencies: string[] = [];

    if (fs.existsSync(requirementsPath)) {
      try {
        const lines = fs.readFileSync(requirementsPath, 'utf8').split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('-')) {
            dependencies.push(trimmed);
          }
        }
      } catch {
        // Fallback to default dependencies below
      }
    }

    if (dependencies.length === 0) {
      dependencies.push(
        'google-adk>=2.0.0',
        'google-cloud-aiplatform[evaluation,agent-engines]>=1.150.0',
        'google-genai>=1.0.0',
        'fastapi>=0.110.0',
        'uvicorn>=0.28.0',
        'pydantic>=2.0.0',
        'cloudpickle>=3.0.0',
        'python-dotenv>=1.0.0'
      );
    }

    const formattedDeps = dependencies.map((dep) => `    "${dep}",`).join('\n');
    const content = `[project]
name = "${projectName}"
version = "0.1.0"
description = "Vertex AI Agent Engine Service"
dependencies = [
${formattedDeps}
]
requires-python = ">=3.11"

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.uv]
package = false
`;

    fs.writeFileSync(pyprojectPath, content, 'utf8');
  }

  /**
   * Ensures agent_runtime_app.py is present in the target directory.
   * `agents-cli deploy` introspects `agent_runtime_app.agent_runtime` via subprocess
   * to extract the class methods and schemas required by Vertex AI Agent Engine.
   *
   * @param targetDirectory Target folder containing agent code
   */
  public ensureAgentRuntimeApp(targetDirectory: string): void {
    const runtimeAppPath = path.join(targetDirectory, 'agent_runtime_app.py');
    if (fs.existsSync(runtimeAppPath)) {
      return;
    }

    const content = `import os
from dotenv import load_dotenv
from google.adk.artifacts import GcsArtifactService, InMemoryArtifactService
from vertexai.agent_engines.templates.adk import AdkApp

load_dotenv()

try:
    from agent import root_agent
except ImportError:
    from agent import app as root_agent

logs_bucket_name = os.environ.get("LOGS_BUCKET_NAME")

agent_runtime = AdkApp(
    agent=root_agent,
    artifact_service_builder=lambda: (
        GcsArtifactService(bucket_name=logs_bucket_name)
        if logs_bucket_name
        else InMemoryArtifactService()
    ),
)
`;

    fs.writeFileSync(runtimeAppPath, content, 'utf8');
  }

  /**
   * Ensures agent.py explicitly adds its directory to sys.path if not already present.
   * In containerized environments like Vertex AI Agent Engine, ADK api_server mounts /app/agents
   * and loads agents as submodules (e.g. `importlib.import_module(f"{agent_name}.agent")`),
   * which does not include the agent subdirectory in sys.path. Adding the directory to sys.path
   * ensures top-level imports of local sibling modules (e.g. pydantic_models.py, tools/*.py) succeed.
   *
   * @param targetDirectory Target folder containing agent code
   * @author Mike Nimer <mikenimer@google.com>
   */
  public ensureAgentImports(targetDirectory: string): void {
    // 1. Check if agent.py exists in target directory
    const agentPyPath = path.join(targetDirectory, 'agent.py');
    if (!fs.existsSync(agentPyPath)) {
      return;
    }

    try {
      // 2. Read content and verify whether sys.path patch is already included
      let content = fs.readFileSync(agentPyPath, 'utf8');
      let modified = false;

      // NOTE: Strip invalid/deprecated AgentBase import if present in generated code
      if (content.includes('from google.adk.agents.agent_base import AgentBase') || content.includes('AgentBase')) {
        content = content
          .replace(/from google\.adk\.agents\.agent_base import AgentBase\r?\n?/g, '')
          .replace(/:\s*AgentBase/g, '');
        modified = true;
      }

      if (!content.includes('sys.path.insert') && !content.includes('sys.path.append')) {
        // NOTE: Prepend sys.path resolution so sibling modules like pydantic_models can be imported cleanly
        const pathPatch = `# Ensure agent directory is in sys.path for local module imports (e.g. pydantic_models, tools)
import os
import sys
from pathlib import Path

_agent_dir = str(Path(__file__).parent.resolve())
if _agent_dir not in sys.path:
    sys.path.insert(0, _agent_dir)

`;
        content = pathPatch + content;
        modified = true;
      }

      if (modified) {
        fs.writeFileSync(agentPyPath, content, 'utf8');
      }
    } catch (err) {
      console.warn('[AgentEngineDeployer] Failed to patch sys.path in agent.py:', err);
    }
  }

  /**
   * Copies agent source files from a source directory to a staged directory,
   * skipping heavy/virtual environment directories like .venv, .git, and __pycache__
   * to guarantee payloads remain well below the 8MB Vertex AI request limit.
   *
   * @param src Source directory
   * @param dest Destination directory
   * @author Mike Nimer <mikenimer@google.com>
   */
  public stageAgentDirectory(src: string, dest: string): void {
    // 1. Create destination directory if it does not exist
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }

    // 2. Define ignored folder names that should never be staged
    const ignoredFolders = new Set(['.venv', 'venv', '.git', '__pycache__', 'node_modules', '.pytest_cache']);

    // 3. Recursively copy files and directories while filtering ignored folders
    const copyRecursive = (currentSrc: string, currentDest: string) => {
      const entries = fs.readdirSync(currentSrc, { withFileTypes: true });
      for (const entry of entries) {
        if (ignoredFolders.has(entry.name)) {
          continue;
        }
        const srcPath = path.join(currentSrc, entry.name);
        const destPath = path.join(currentDest, entry.name);

        if (entry.isDirectory()) {
          if (!fs.existsSync(destPath)) {
            fs.mkdirSync(destPath, { recursive: true });
          }
          copyRecursive(srcPath, destPath);
        } else if (entry.isFile()) {
          fs.copyFileSync(srcPath, destPath);
        }
      }
    };

    copyRecursive(src, dest);
  }

  /**
   * Constructs the command arguments array for the deployment execution.
   * Note: agents-cli deploy reads the deployment target from `agents-cli-manifest.yaml`
   * and does not accept a `--deployment-target` or `--resource-name` CLI flag.
   *
   * @param options Deployment configuration options
   * @param existingMetadata Previously persisted deployment metadata if available
   * @returns Formatted CLI argument list
   */
  public buildDeployArgs(
    options: AgentEngineDeployOptions,
    existingMetadata?: DeploymentMetadataRecord | null
  ): string[] {
    const args: string[] = ['deploy', '--no-confirm-project'];

    // GCP Project ID
    args.push('--project', options.projectId);

    // GCP Region / Location (Agent Runtime requires a regional endpoint, e.g. us-central1)
    const region = options.region && options.region !== 'global' ? options.region : 'us-central1';
    args.push('--region', region);

    // Optional Service Account
    if (options.serviceAccount && options.serviceAccount.trim()) {
      args.push('--service-account', options.serviceAccount.trim());
    }

    // Optional Network Attachment for Private Service Connect
    if (options.networkAttachment && options.networkAttachment.trim()) {
      args.push('--network-attachment', options.networkAttachment.trim());
    }

    return args;
  }

  /**
   * Constructs the CLI arguments for official ADK deployment (`adk deploy agent_engine`).
   * Conforms to the standard deployment path documented at https://adk.dev/deploy/agent-runtime/deploy/.
   *
   * @param options Deployment configuration options
   * @param existingMetadata Existing deployment metadata if performing an in-place update
   * @returns Array of command line arguments for `adk deploy agent_engine`
   */
  public buildAdkDeployArgs(
    options: AgentEngineDeployOptions,
    existingMetadata?: DeploymentMetadataRecord | null
  ): string[] {
    // Normalization: Agent Runtime requires regional locations (e.g. us-central1), not global
    const rawRegion = options.region || 'us-central1';
    const region = rawRegion.toLowerCase() === 'global' ? 'us-central1' : rawRegion;

    const args: string[] = ['deploy', 'agent_engine'];

    // GCP Project and Region
    args.push('--project', options.projectId);
    args.push('--region', region);

    // Existing instance update vs new creation:
    // If not forcing a new deployment, reuse either the explicitly configured agentEngineId or previous deployment metadata
    const targetEngineId = options.agentEngineId?.trim() || existingMetadata?.remote_agent_runtime_id;
    if (!options.forceNew && targetEngineId) {
      const parts = targetEngineId.split('/');
      const engineId = parts.pop() || targetEngineId;
      args.push('--agent_engine_id', engineId);
    } else if (options.displayName) {
      args.push('--display_name', options.displayName);
    }

    // NOTE: Explicitly configure in-memory session service URI to ensure reliable execution in containers
    // and prevent premature stream closure or 500 INTERNAL failures from Vertex AI Managed Sessions.
    args.push('--session_service_uri', 'memory://');

    // Optional GCS artifact/staging bucket URI
    if (options.stagingBucket && options.stagingBucket.trim()) {
      const bucketUri = options.stagingBucket.trim().startsWith('gs://')
        ? options.stagingBucket.trim()
        : `gs://${options.stagingBucket.trim()}`;
      args.push('--artifact_service_uri', bucketUri);
    }

    // Agent directory positional argument
    args.push('.');

    return args;
  }

  /**
   * Formats a human-readable shell command string representing the deployment.
   *
   * @param options Deployment configuration options
   * @returns Command string suitable for display or copy
   */
  public getDeployCommandString(options: AgentEngineDeployOptions): string {
    const existingMeta = this.readDeploymentMetadata(options.targetDirectory);
    if (this.hasBinary('adk')) {
      const args = this.buildAdkDeployArgs(options, existingMeta);
      return `adk ${args.join(' ')}`;
    }
    const args = this.buildDeployArgs(options, existingMeta);
    return `agents-cli ${args.join(' ')}`;
  }

  /**
   * Discovers if an existing Reasoning Engine instance exists in the specified project and region
   * with the matching display_name, preventing accidental duplicate instance creation.
   *
   * @param projectId Target GCP Project ID
   * @param region Target GCP Region
   * @param displayName Display name to match
   * @returns Resource ID string if found, otherwise null
   * @author Mike Nimer <mikenimer@google.com>
   */
  public async findExistingReasoningEngine(
    projectId: string,
    region: string,
    displayName: string
  ): Promise<string | null> {
    try {
      // Priority 1: Check ADK virtualenv python binary
      const pipxPython = path.join(process.env.HOME || '', '.local/pipx/venvs/google-adk/bin/python');
      let pythonCmd = fs.existsSync(pipxPython) ? pipxPython : 'python3';

      if (pythonCmd === 'python3' && this.pythonResolver) {
        const resolved = await this.pythonResolver.resolvePythonEnvironment();
        if (resolved?.path) {
          pythonCmd = resolved.path;
        }
      }

      const script = `import sys, vertexai; client=vertexai.Client(project='${projectId}', location='${region}'); sys.stdout.write(next((getattr(e.api_resource, 'name', '') for e in client.agent_engines.list() if getattr(e.api_resource, 'display_name', '') == '${displayName}'), ''))`;

      const res = require('child_process')
        .execSync(`"${pythonCmd}" -c "${script}"`, {
          timeout: 8000,
          stdio: ['ignore', 'pipe', 'ignore'],
        })
        .toString()
        .trim();

      return res || null;
    } catch {
      return null;
    }
  }

  /**
   * Alias for deploy() providing convenient method invocation.
   *
   * @param options Deployment configuration options
   * @returns Promise resolving to deployment outcome
   * @author Mike Nimer <mikenimer@google.com>
   */
  public deployAgentEngine = (options: AgentEngineDeployOptions): Promise<AgentEngineDeployResult> => {
    return this.deploy(options);
  };

  /**
   * Executes the Agent Engine deployment process.
   *
   * @param options Deployment configuration options
   * @returns Promise resolving to deployment outcome
   * @author Mike Nimer <mikenimer@google.com>
   */
  public async deploy(options: AgentEngineDeployOptions): Promise<AgentEngineDeployResult> {
    const { targetDirectory, projectId, bridge } = options;
    const region = options.region && options.region !== 'global' ? options.region : 'us-central1';

    // 0. Validate GCP Project ID requirement
    if (!projectId || !projectId.trim()) {
      const errMsg = 'Cannot deploy to Agent Engine: GCP Project ID is required. Please specify a valid project ID.';
      this.logToBridge(bridge, `[ERROR] ${errMsg}`, 'stderr');
      this.sendStatusToBridge(bridge, {
        status: 'error',
        error: errMsg,
      });

      return {
        success: false,
        error: errMsg,
      };
    }

    // 1. Validate target directory has valid naming and generated agent code
    const validation = this.validateTargetDirectory(targetDirectory);
    if (!validation.valid) {
      let errMsg = '';
      if (validation.nameError) {
        const folderBase = path.basename(targetDirectory);
        const sanitized = sanitizeFolderBaseName(folderBase);
        errMsg = `Cannot deploy to Agent Engine: ${validation.nameError} Please update the target folder to '${sanitized}' in the Deployment tab.`;
      } else {
        errMsg = `Cannot deploy to Agent Engine: missing required code file (${validation.missingFiles.join(
          ', '
        )}) in '${targetDirectory}'. Please generate code first.`;
      }

      this.logToBridge(bridge, `[ERROR] ${errMsg}`, 'stderr');
      this.sendStatusToBridge(bridge, {
        status: 'error',
        error: errMsg,
      });

      return {
        success: false,
        error: errMsg,
      };
    }

    // 2. Direct in-place deployment (no duplicate directory staging or repository clutter)
    const executionDir = targetDirectory;

    // 3. Ensure packaging files exist on targetDirectory:
    // agents-cli-manifest.yaml, pyproject.toml, agent_runtime_app.py, ignore files, and sys.path imports in agent.py
    // NOTE: ensureIgnoreFiles excludes .venv/ (799MB+) to prevent 400 INVALID_ARGUMENT (8MB payload limit)
    this.ensureIgnoreFiles(targetDirectory);
    this.ensureManifestFile(targetDirectory, options);
    this.ensurePyProjectToml(targetDirectory, options);
    this.ensureAgentRuntimeApp(targetDirectory);
    this.ensureAgentImports(targetDirectory);

    // 4. Check for existing deployment metadata or configured engine ID to determine update vs create
    const existingMeta = this.readDeploymentMetadata(targetDirectory);
    let resolvedEngineId = options.agentEngineId?.trim() || existingMeta?.remote_agent_runtime_id;

    // Check if workflow document has a previously deployed resource ID
    if (!options.forceNew && !resolvedEngineId && options.document?.deployment?.deployedResourceId) {
      resolvedEngineId = options.document.deployment.deployedResourceId;
    }

    // If still not configured and displayName is present, search Vertex AI to prevent accidental duplicates
    if (!options.forceNew && !resolvedEngineId && options.displayName) {
      const existingRemoteId = await this.findExistingReasoningEngine(projectId, region, options.displayName);
      if (existingRemoteId) {
        resolvedEngineId = existingRemoteId;
        this.logToBridge(
          bridge,
          `[0.3s] Discovered existing Reasoning Engine instance: ${resolvedEngineId}`,
          'system',
          targetDirectory
        );
      }
    }

    const isUpdate = Boolean(!options.forceNew && resolvedEngineId);
    if (isUpdate && resolvedEngineId) {
      options.agentEngineId = resolvedEngineId;
    }

    // 5. Initialize active deployment record in memory for background resilience
    const deployStartTime = Date.now();
    this.activeDeployments.set(targetDirectory, {
      targetDirectory,
      status: 'building',
      logs: [],
      startTime: deployStartTime,
      isExistingDeployment: isUpdate,
      remoteRuntimeId: resolvedEngineId || existingMeta?.remote_agent_runtime_id,
    });

    // 5. Emit initial starting status
    const actionLabel = isUpdate ? 'Updating existing Agent Engine Runtime' : 'Deploying new Agent Engine Runtime';
    this.logToBridge(bridge, `[0.0s] Initializing ${actionLabel}...`, 'system', targetDirectory);
    this.logToBridge(bridge, `[0.1s] Target: Vertex AI Agent Engine (${region})`, 'system', targetDirectory);
    this.logToBridge(bridge, `[0.2s] Project: ${projectId}`, 'system', targetDirectory);

    if (isUpdate && resolvedEngineId) {
      this.logToBridge(
        bridge,
        `[0.3s] In-place container update for: ${resolvedEngineId}`,
        'system',
        targetDirectory
      );
    }

    this.sendStatusToBridge(bridge, {
      status: 'building',
      isExistingDeployment: isUpdate,
      remoteRuntimeId: resolvedEngineId || existingMeta?.remote_agent_runtime_id,
    });

    // 6. Determine deployment tool and build arguments
    let deployTool: 'adk' | 'agents-cli' | 'python';
    let deployArgs: string[];

    if (this.hasBinary('adk')) {
      deployTool = 'adk';
      deployArgs = this.buildAdkDeployArgs(options, existingMeta);
    } else if (this.hasBinary('agents-cli')) {
      deployTool = 'agents-cli';
      deployArgs = this.buildDeployArgs(options, existingMeta);
    } else if (fs.existsSync(path.join(targetDirectory, 'deploy.py'))) {
      deployTool = 'python';
      deployArgs = ['deploy.py'];
    } else {
      const errMsg = "Neither 'adk' nor 'agents-cli' CLI tool was found in PATH, and no 'deploy.py' script was found.";
      this.logToBridge(bridge, `[ERROR] ${errMsg}`, 'stderr');
      this.sendStatusToBridge(bridge, {
        status: 'error',
        error: errMsg,
      });
      return {
        success: false,
        error: errMsg,
      };
    }

    const deployCmd = `${deployTool} ${deployArgs.join(' ')}`;
    this.logToBridge(bridge, `[0.5s] Executing: ${deployCmd}`, 'system', targetDirectory);

    // 6. Prepare execution environment with extended PATH resolution
    const env: NodeJS.ProcessEnv = this.getExtendedEnv({
      GOOGLE_CLOUD_PROJECT: projectId,
      CLOUDSDK_CORE_PROJECT: projectId,
      ...(options.envVars || {}),
    });

    // 7. Resolve Python binary if falling back to deploy.py
    let pythonExecutable = process.platform === 'win32' ? 'python.exe' : 'python3';
    if (deployTool === 'python') {
      try {
        const resolvedEnv = await this.pythonResolver.resolvePythonEnvironment(targetDirectory);
        if (resolvedEnv && resolvedEnv.path) {
          pythonExecutable = resolvedEnv.path;
        }
      } catch {
        pythonExecutable = process.platform === 'win32' ? 'python.exe' : 'python3';
      }
    }

    return new Promise<AgentEngineDeployResult>((resolve) => {
      // NOTE: For updates without forceNew, pre-populate existing remote ID as default;
      // for new deployments, strictly require the CLI output to yield a genuine ID.
      let remoteRuntimeId: string | undefined =
        !options.forceNew && existingMeta?.remote_agent_runtime_id
          ? existingMeta.remote_agent_runtime_id
          : undefined;
      let detectedConsoleUrl: string | undefined;
      let detectedFailureMessage: string | undefined;
      const buildLogs: string[] = [];

      let child: ChildProcess;
      const useShell = process.platform === 'win32';

      if (deployTool === 'python') {
        this.logToBridge(
          bridge,
          `[NOTE] Neither 'adk' nor 'agents-cli' found in PATH. Invoking Python deployment script 'deploy.py'...`,
          'system',
          targetDirectory
        );
        child = spawn(pythonExecutable, ['deploy.py'], {
          cwd: executionDir,
          env,
          shell: useShell,
        });
      } else {
        child = spawn(deployTool, deployArgs, {
          cwd: executionDir,
          env,
          shell: useShell,
        });
      }

      this.activeProcesses.set(targetDirectory, child);

      // Helper to scan streamed lines for failure messages (handles CLI tools that catch exceptions without exit(1))
      const inspectLineForFailures = (line: string) => {
        // Match explicit failure indications in CLI logs:
        // Examples:
        // "Deploy failed: 403 PERMISSION_DENIED. ..."
        // "Failed to deploy to Agent Platform: ..."
        // "Error: Failed to run 'uv sync' ..."
        // "PERMISSION_DENIED" or "SERVICE_DISABLED"
        const isFailure =
          line.match(/^(Deploy failed:|Failed to deploy|Error:\s+)/i) ||
          line.match(/(PERMISSION_DENIED|SERVICE_DISABLED)/i);
        if (isFailure && !detectedFailureMessage) {
          detectedFailureMessage = line.trim();
        }
      };

      // Handle standard output
      child.stdout?.on('data', (data: Buffer | string) => {
        const text = data.toString();
        const lines = text.split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          buildLogs.push(line);
          this.logToBridge(bridge, line, 'stdout', targetDirectory);
          inspectLineForFailures(line);

          // Extract Reasoning Engine resource ID from CLI output
          // Format pattern: projects/{project}/locations/{region}/reasoningEngines/{id}
          const idMatch = line.match(/projects\/[^/\s]+\/locations\/[^/\s]+\/reasoningEngines\/[0-9a-zA-Z_-]+/);
          if (idMatch) {
            remoteRuntimeId = idMatch[0];
          }

          // Extract Console playground URL if printed by CLI
          const consoleMatch = line.match(/https:\/\/console\.cloud\.google\.com\/[^\s]+/);
          if (consoleMatch) {
            detectedConsoleUrl = consoleMatch[0];
          }
        }
      });

      // Handle standard error
      child.stderr?.on('data', (data: Buffer | string) => {
        const text = data.toString();
        const lines = text.split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          buildLogs.push(line);
          this.logToBridge(bridge, line, 'stderr', targetDirectory);
          inspectLineForFailures(line);

          const idMatch = line.match(/projects\/[^/\s]+\/locations\/[^/\s]+\/reasoningEngines\/[0-9a-zA-Z_-]+/);
          if (idMatch) {
            remoteRuntimeId = idMatch[0];
          }

          const consoleMatch = line.match(/https:\/\/console\.cloud\.google\.com\/[^\s]+/);
          if (consoleMatch) {
            detectedConsoleUrl = consoleMatch[0];
          }
        }
      });

      // Handle process completion
      child.on('close', (code: number | null, signal: string | null) => {
        this.activeProcesses.delete(targetDirectory);
        this.cleanupAdkTempDirectories(targetDirectory, deployStartTime);

        // Check if deployment was explicitly cancelled by user
        const wasCancelled = this.cancelledDirectories.has(targetDirectory);
        this.cancelledDirectories.delete(targetDirectory);

        if (wasCancelled) {
          const active = this.activeDeployments.get(targetDirectory);
          if (active) {
            active.status = 'idle';
          }
          this.logToBridge(bridge, `[Agent Engine Deployer] Deployment cancelled by user.`, 'system', targetDirectory);
          this.sendStatusToBridge(bridge, {
            status: 'idle',
          });
          resolve({
            success: false,
            error: 'Deployment cancelled by user.',
          });
          return;
        }

        // NOTE: Strict verification: deployment must exit code 0, have NO detected failure output,
        // and have a genuine Reasoning Engine resource ID.
        const isSuccessful = code === 0 && !detectedFailureMessage && Boolean(remoteRuntimeId);

        if (isSuccessful && remoteRuntimeId) {
          const serviceUrl = this.resolveEndpointUrl(region, projectId, remoteRuntimeId);
          const consoleUrl = detectedConsoleUrl || this.resolveConsoleUrl(region, projectId, remoteRuntimeId);

          const metadata: DeploymentMetadataRecord = {
            remote_agent_runtime_id: remoteRuntimeId,
            deployment_target: 'agent_runtime',
            is_a2a: true,
            agent_directory: targetDirectory,
            deployment_timestamp: new Date().toISOString(),
            service_url: serviceUrl,
            console_url: consoleUrl,
            project_id: projectId,
            region,
            service_account: options.serviceAccount,
            network_attachment: options.networkAttachment,
            staging_bucket: options.stagingBucket,
            status: 'ACTIVE',
          };

          // Save deployment metadata to disk
          this.writeDeploymentMetadata(targetDirectory, metadata);

          const active = this.activeDeployments.get(targetDirectory);
          if (active) {
            active.status = 'success';
            active.remoteRuntimeId = remoteRuntimeId;
            active.serviceUrl = serviceUrl;
            active.consoleUrl = consoleUrl;
            active.metadata = metadata;
          }

          this.logToBridge(bridge, `✅ Deployment succeeded!`, 'system', targetDirectory);
          this.logToBridge(bridge, `✨ Resource ID: ${remoteRuntimeId}`, 'system', targetDirectory);
          this.logToBridge(bridge, `🚀 Endpoint: ${serviceUrl}`, 'system', targetDirectory);

          this.sendStatusToBridge(bridge, {
            status: 'success',
            remoteRuntimeId,
            serviceUrl,
            consoleUrl,
            metadata,
          });

          resolve({
            success: true,
            remoteRuntimeId,
            serviceUrl,
            consoleUrl,
            metadata,
          });
        } else {
          // Provide descriptive error message from process output or exit code / signal
          let errMsg = detectedFailureMessage;
          if (!errMsg) {
            if (code !== null && code !== 0) {
              errMsg = `Deployment process exited with error code ${code}. Check logs above for details.`;
            } else if (signal) {
              errMsg = `Deployment process was terminated by signal ${signal}. Check logs above for details.`;
            } else if (code === null) {
              errMsg = 'Deployment process was terminated unexpectedly. Check logs above for details.';
            } else {
              errMsg = 'Deployment failed: no Agent Engine resource ID was returned by the deployment process.';
            }
          }

          // Check if this deployment was attempting to update an existing engine that was deleted in Cloud Console (404 NOT_FOUND).
          // If so, automatically purge stale local metadata and redeploy as a fresh instance.
          const isNotFound = this.isReasoningEngineNotFoundError(errMsg, buildLogs);
          if (isUpdate && isNotFound) {
            const staleId =
              resolvedEngineId || options.agentEngineId || existingMeta?.remote_agent_runtime_id || 'stale instance';
            this.logToBridge(
              bridge,
              `⚠️ Target Reasoning Engine (${staleId}) was deleted in Cloud Console (404 NOT_FOUND).`,
              'system',
              targetDirectory
            );
            this.logToBridge(
              bridge,
              `[Agent Engine Deployer] Clearing stale deployment metadata and automatically deploying a new Reasoning Engine instance...`,
              'system',
              targetDirectory
            );

            // 1. Purge stale deployment metadata file on disk
            const metaPath = path.join(targetDirectory, 'deployment_metadata.json');
            if (fs.existsSync(metaPath)) {
              try {
                fs.unlinkSync(metaPath);
              } catch (err) {
                console.warn(`[AgentEngineDeployer] Warning deleting stale ${metaPath}:`, err);
              }
            }

            // 2. Clear stale metadata from activeDeployments
            this.activeDeployments.delete(targetDirectory);

            // 3. Fallback to fresh deployment with forceNew: true and cleared engine IDs
            const retryOptions: AgentEngineDeployOptions = {
              ...options,
              agentEngineId: undefined,
              forceNew: true,
              displayName: options.displayName || (options.document as any)?.name || path.basename(targetDirectory),
            };
            if (retryOptions.document && (retryOptions.document as any).deployment) {
              retryOptions.document = {
                ...retryOptions.document,
                deployment: {
                  ...(retryOptions.document as any).deployment,
                  deployedResourceId: undefined,
                  serviceUrl: undefined,
                  consoleUrl: undefined,
                },
              };
            }

            this.deployAgentEngine(retryOptions)
              .then(resolve)
              .catch((retryErr) => {
                resolve({
                  success: false,
                  error: retryErr?.message || String(retryErr),
                });
              });
            return;
          }

          const active = this.activeDeployments.get(targetDirectory);
          if (active) {
            active.status = 'error';
            active.error = errMsg;
          }

          this.logToBridge(bridge, `[ERROR] ${errMsg}`, 'stderr', targetDirectory);

          this.sendStatusToBridge(bridge, {
            status: 'error',
            error: errMsg,
          });

          resolve({
            success: false,
            error: errMsg,
          });
        }
      });

      // Handle spawn error (e.g. command not found)
      child.on('error', (err: Error) => {
        this.activeProcesses.delete(targetDirectory);
        this.cleanupAdkTempDirectories(targetDirectory, deployStartTime);
        const errMsg = `Failed to start deployment subprocess: ${err.message}`;

        const active = this.activeDeployments.get(targetDirectory);
        if (active) {
          active.status = 'error';
          active.error = errMsg;
        }

        this.logToBridge(bridge, `[ERROR] ${errMsg}`, 'stderr', targetDirectory);

        this.sendStatusToBridge(bridge, {
          status: 'error',
          error: errMsg,
        });

        resolve({
          success: false,
          error: errMsg,
        });
      });
    });
  }

  /**
   * Constructs an execution environment with extended PATH resolution.
   * Ensures paths like ~/.local/bin (where uv, adk, and agents-cli reside on macOS/Linux)
   * and Homebrew/system paths are included even when spawned from GUI VS Code.
   *
   * @param extraEnv Optional additional environment variables to merge
   * @returns ProcessEnv with augmented PATH
   */
  public getExtendedEnv(extraEnv?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
    const home = process.env.HOME || '';
    const extraPaths = [
      path.join(home, '.local', 'bin'),
      path.join(home, '.cargo', 'bin'),
      '/opt/homebrew/bin',
      '/usr/local/bin',
      '/usr/bin',
      '/bin',
    ];

    const currentPath = process.env.PATH || '';
    const existingParts = currentPath.split(path.delimiter);
    const combinedPaths: string[] = [];

    for (const p of extraPaths) {
      if (!existingParts.includes(p) && fs.existsSync(p)) {
        combinedPaths.push(p);
      }
    }
    combinedPaths.push(...existingParts);

    // NOTE: PYTHONUNBUFFERED=1 forces Python to flush stdout/stderr line-by-line,
    // ensuring build and deployment progress streams to the UI in real time without libc buffering.
    return {
      ...process.env,
      PATH: combinedPaths.join(path.delimiter),
      PYTHONUNBUFFERED: '1',
      ...(extraEnv || {}),
    };
  }

  /**
   * Checks if an executable exists on the system PATH with extended PATH resolution.
   *
   * @param binaryName Name of executable binary
   * @returns Boolean indicating if binary was detected
   */
  public hasBinary(binaryName: string): boolean {
    try {
      const checkCmd = process.platform === 'win32' ? `where ${binaryName}` : `which ${binaryName}`;
      require('child_process').execSync(checkCmd, {
        env: this.getExtendedEnv(),
        stdio: 'ignore',
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Cancels any in-flight deployment process for the given target directory.
   *
   * @param targetDir Path to target directory (or empty to cancel all active)
   * @param bridge Optional bridge for emitting status
   * @returns Boolean indicating whether a process was terminated
   */
  public cancelDeployment(targetDir?: string, bridge?: WebviewBridge): boolean {
    let cancelled = false;

    if (targetDir && this.activeProcesses.has(targetDir)) {
      this.cancelledDirectories.add(targetDir);
      const proc = this.activeProcesses.get(targetDir);
      try {
        proc?.kill('SIGTERM');
        cancelled = true;
      } catch (err) {
        console.warn(`[AgentEngineDeployer] Error killing process:`, err);
      }
      this.activeProcesses.delete(targetDir);
      const active = this.activeDeployments.get(targetDir);
      if (active) {
        active.status = 'idle';
      }
    } else if (!targetDir) {
      for (const [dir, proc] of this.activeProcesses.entries()) {
        this.cancelledDirectories.add(dir);
        try {
          proc.kill('SIGTERM');
          cancelled = true;
        } catch {}
      }
      this.activeProcesses.clear();
      for (const active of this.activeDeployments.values()) {
        active.status = 'idle';
      }
    }

    if (cancelled && bridge) {
      this.logToBridge(bridge, '[Agent Engine Deployer] Deployment cancelled by user.', 'system', targetDir);
      this.sendStatusToBridge(bridge, {
        status: 'idle',
      });
    }

    return cancelled;
  }

  /**
   * Retrieves and emits current deployment status from in-memory session or disk metadata.
   * Enables background deployment resilience by querying active subprocess status and replaying
   * buffered logs whenever the webview mounts or user switches back to the tab.
   *
   * @param targetDir Target directory
   * @param bridge Optional bridge
   * @returns Current metadata record or null
   */
  public getDeploymentStatus(
    targetDir: string,
    bridge?: WebviewBridge
  ): DeploymentMetadataRecord | null {
    const active = this.activeDeployments.get(targetDir);
    const meta = this.readDeploymentMetadata(targetDir);

    if (bridge) {
      if (
        active &&
        (active.status === 'building' || active.status === 'deploying' || active.status === 'packaging')
      ) {
        // Replay active background deployment and accumulated logs
        this.sendStatusToBridge(bridge, {
          status: active.status,
          inProgress: true,
          logs: active.logs,
          remoteRuntimeId: active.remoteRuntimeId,
          serviceUrl: active.serviceUrl,
          consoleUrl: active.consoleUrl,
          isExistingDeployment: active.isExistingDeployment,
          metadata: active.metadata || meta,
        });
      } else if (active && active.status === 'error') {
        this.sendStatusToBridge(bridge, {
          status: 'error',
          error: active.error,
          logs: active.logs,
          metadata: meta,
        });
      } else if (meta) {
        this.sendStatusToBridge(bridge, {
          status: 'success',
          remoteRuntimeId: meta.remote_agent_runtime_id,
          serviceUrl: meta.service_url,
          consoleUrl: meta.console_url,
          isExistingDeployment: true,
          metadata: meta,
          logs: active?.logs,
        });
      } else {
        this.sendStatusToBridge(bridge, {
          status: 'idle',
        });
      }
    }

    return meta;
  }

  /**
   * Executes a live test query against the deployed remote Agent Runtime via the HTTP passthrough.
   *
   * @param options Remote query configuration options
   * @returns Promise resolving to the test result
   */
  public async testRemoteAgentRuntime(options: AgentEngineTestOptions): Promise<AgentEngineTestResult> {
    const { targetDirectory, query, bridge } = options;
    const startTime = Date.now();

    // 1. Resolve endpoint URL from options or persisted metadata
    let serviceUrl = options.serviceUrl;
    let remoteRuntimeId = options.remoteRuntimeId;

    if ((!serviceUrl || !remoteRuntimeId) && targetDirectory) {
      const meta = this.readDeploymentMetadata(targetDirectory);
      if (meta) {
        serviceUrl = serviceUrl || meta.service_url;
        remoteRuntimeId = remoteRuntimeId || meta.remote_agent_runtime_id;
      }
    }

    if (!serviceUrl && remoteRuntimeId) {
      const locationMatch = remoteRuntimeId.match(/\/locations\/([^/]+)\//);
      const loc = locationMatch ? locationMatch[1] : 'us-central1';
      serviceUrl = this.resolveEndpointUrl(loc, '', remoteRuntimeId);
    }

    // Normalize obsolete /api/run_sse path to standard :streamQuery?alt=sse for reasoning engines
    if (serviceUrl && serviceUrl.includes('/api/run_sse')) {
      try {
        const u = new URL(serviceUrl);
        if (u.pathname.includes('/reasoningEngines/')) {
          u.pathname = u.pathname.replace(/\/api\/run_sse\b/, ':streamQuery');
          if (!u.searchParams.has('alt')) {
            u.searchParams.set('alt', 'sse');
          }
          serviceUrl = u.toString();
        }
      } catch {}
    }

    if (!serviceUrl) {
      const err = 'No active remote Agent Runtime endpoint found. Please deploy the agent first.';
      if (bridge) {
        bridge.postMessage({
          type: 'AGENT_ENGINE_TEST_RESULT',
          payload: {
            success: false,
            query,
            durationMs: 0,
            error: err,
          },
        });
      }
      return { success: false, query, durationMs: 0, error: err };
    }

    // 2. Perform HTTP invocation against the reasoning engine endpoint
    try {
      this.logToBridge(bridge, `[Test] Sending query to ${serviceUrl}...`, 'system');

      const responseText = await this.performHttpQuery(serviceUrl, query);
      const durationMs = Date.now() - startTime;

      if (bridge) {
        bridge.postMessage({
          type: 'AGENT_ENGINE_TEST_RESULT',
          payload: {
            success: true,
            query,
            response: responseText,
            durationMs,
          },
        });
      }

      return {
        success: true,
        query,
        response: responseText,
        durationMs,
      };
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      let errMsg = err?.message || String(err);
      if (this.isReasoningEngineNotFoundError(errMsg)) {
        errMsg = `Reasoning Engine was not found on Vertex AI (404 NOT_FOUND). The instance may have been deleted in Google Cloud Console. Please click Deploy to automatically create a new instance.`;
      }

      this.logToBridge(bridge, `[Test Error] Query failed: ${errMsg}`, 'stderr');

      if (bridge) {
        bridge.postMessage({
          type: 'AGENT_ENGINE_TEST_RESULT',
          payload: {
            success: false,
            query,
            durationMs,
            error: errMsg,
          },
        });
      }

      return {
        success: false,
        query,
        durationMs,
        error: errMsg,
      };
    }
  }

  /**
   * Helper to create an ADK session on Vertex AI Reasoning Engine before streaming query execution.
   *
   * @param queryUrl The reasoningEngine :query endpoint URL
   * @param authHeader Authorization header (e.g. Bearer token)
   * @returns Promise resolving to the created session ID, or undefined
   * @author Mike Nimer <mikenimer@google.com>
   */
  private createReasoningEngineSession(queryUrl: string, authHeader: string): Promise<string | undefined> {
    return new Promise((resolve) => {
      try {
        // 1. Prepare HTTP request for async_create_session
        const urlObj = new URL(queryUrl);
        const client = urlObj.protocol === 'https:' ? https : http;
        const body = JSON.stringify({
          class_method: 'async_create_session',
          input: { user_id: 'vad_user' },
        });

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body).toString(),
        };
        if (authHeader) {
          headers['Authorization'] = authHeader;
        }

        // 2. Dispatch session creation request
        const req = client.request(
          urlObj,
          {
            method: 'POST',
            headers,
            timeout: 10000,
          },
          (res) => {
            let resData = '';
            res.on('data', (c) => {
              resData += c;
            });
            res.on('end', () => {
              try {
                // 3. Extract generated session identifier from response
                const parsed = JSON.parse(resData);
                const sessionObj = parsed.output || parsed;
                const id = sessionObj?.id || sessionObj?.session_id;
                resolve(id || undefined);
              } catch {
                resolve(undefined);
              }
            });
          }
        );

        req.on('error', () => resolve(undefined));
        req.write(body);
        req.end();
      } catch {
        resolve(undefined);
      }
    });
  }

  /**
   * Helper to perform HTTP/HTTPS POST query to the reasoning engine endpoint.
   * Handles Vertex AI Agent Engine :streamQuery SSE streams as well as standard JSON endpoints.
   *
   * @param serviceUrl Destination service URL
   * @param query User prompt query
   * @returns Promise resolving to response text
   * @author Mike Nimer <mikenimer@google.com>
   */
  private async performHttpQuery(serviceUrl: string, query: string): Promise<string> {
    let normalizedUrl = serviceUrl;
    if (normalizedUrl.includes('/api/run_sse')) {
      try {
        const u = new URL(normalizedUrl);
        if (u.pathname.includes('/reasoningEngines/')) {
          u.pathname = u.pathname.replace(/\/api\/run_sse\b/, ':streamQuery');
          if (!u.searchParams.has('alt')) {
            u.searchParams.set('alt', 'sse');
          }
          normalizedUrl = u.toString();
        }
      } catch {}
    }

    const urlObj = new URL(normalizedUrl);
    const isHttps = urlObj.protocol === 'https:';
    const client = isHttps ? https : http;

    const isAgentEngine =
      urlObj.hostname.includes('aiplatform.googleapis.com') ||
      (urlObj.pathname.includes('reasoningEngines') &&
        !urlObj.hostname.includes('127.0.0.1') &&
        !urlObj.hostname.includes('localhost'));

    // Retrieve ADC access token if available
    let authHeader = '';
    try {
      const token = require('child_process')
        .execSync('gcloud auth print-access-token', { timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] })
        .toString()
        .trim();
      if (token) {
        authHeader = `Bearer ${token}`;
      }
    } catch {
      // NOTE: Token retrieval failed; proceeding without explicit auth header (e.g. mock or local proxy)
    }

    // NOTE: For live Vertex AI Reasoning Engines, initialize a session to allow stateful execution
    let sessionId: string | undefined;
    if (isAgentEngine) {
      try {
        const sessionUrl = normalizedUrl.replace(/:streamQuery.*$/, ':query');
        sessionId = await this.createReasoningEngineSession(sessionUrl, authHeader);
      } catch {
        // Fall back if session service is not configured
      }
    }

    // Vertex AI Reasoning Engines expects `class_method: async_stream_query` (or stream_query)
    // with input: { message, user_id, session_id }. Generic mock servers expect { input: { query } }.
    const payload = JSON.stringify(
      isAgentEngine
        ? {
            class_method: 'async_stream_query',
            input: {
              user_id: 'vad_user',
              ...(sessionId ? { session_id: sessionId } : {}),
              message: query,
            },
          }
        : {
            input: {
              query,
            },
          }
    );

    return new Promise<string>((resolve, reject) => {
      try {

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload).toString(),
        };

        if (authHeader) {
          headers['Authorization'] = authHeader;
        }

        const req = client.request(
          urlObj,
          {
            method: 'POST',
            headers,
            timeout: 60000,
          },
          (res) => {
            let body = '';
            res.on('data', (chunk) => {
              body += chunk;
            });

            res.on('end', () => {
              if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                // Guard: Remote server closed connection with 0 bytes (e.g. unhandled container crash or session error)
                if (!body || body.trim().length === 0) {
                  reject(
                    new Error(
                      'Remote Reasoning Engine closed the HTTP connection without returning any response content (0 bytes received). ' +
                      'This indicates a container-level session error or stream termination. ' +
                      'Please verify the container logs in Google Cloud Logging or redeploy with in-memory session service.'
                    )
                  );
                  return;
                }

                try {
                  // Check if response is SSE stream or newline-delimited JSON
                  const lines = body.split('\n').filter(Boolean);
                  let accumulatedText = '';
                  let hasParsedEvents = false;

                  for (const line of lines) {
                    const trimmed = line.trim();
                    const jsonCandidate = trimmed.startsWith('data:') ? trimmed.slice(5).trim() : trimmed;
                    try {
                      const evt = JSON.parse(jsonCandidate);
                      hasParsedEvents = true;
                      if (evt.content?.parts) {
                        for (const part of evt.content.parts) {
                          if (part.text) {
                            accumulatedText += part.text;
                          }
                        }
                      } else if (Array.isArray(evt.parts)) {
                        for (const part of evt.parts) {
                          if (part.text) {
                            accumulatedText += part.text;
                          }
                        }
                      } else if (evt.output) {
                        accumulatedText +=
                          (typeof evt.output === 'string' ? evt.output : JSON.stringify(evt.output, null, 2)) + '\n';
                      } else if (evt.response) {
                        accumulatedText +=
                          (typeof evt.response === 'string' ? evt.response : JSON.stringify(evt.response, null, 2)) + '\n';
                      } else if (typeof evt.content === 'string') {
                        accumulatedText += evt.content;
                      } else if (typeof evt.text === 'string') {
                        accumulatedText += evt.text;
                      }
                    } catch {
                      // Not a JSON event line
                    }
                  }

                  if (hasParsedEvents && accumulatedText.trim().length > 0) {
                    resolve(accumulatedText.trim());
                    return;
                  }

                  const parsed = JSON.parse(body);
                  if (parsed.error) {
                    let errMsg = parsed.error.message || JSON.stringify(parsed.error);
                    if (errMsg.includes('Invalid agent name')) {
                      errMsg += ' (Redeploy the agent to automatically apply valid Python identifier naming).';
                    }
                    reject(new Error(errMsg));
                    return;
                  }
                  const output = parsed.output || parsed.response || parsed.result || body;
                  const finalOutput = typeof output === 'string' ? output.trim() : JSON.stringify(output, null, 2);
                  if (!finalOutput) {
                    reject(new Error('Remote Reasoning Engine returned an empty response string.'));
                    return;
                  }
                  resolve(finalOutput);
                } catch {
                  if (body && body.trim().length > 0) {
                    resolve(body.trim());
                  } else {
                    reject(new Error('Remote Reasoning Engine returned an empty response.'));
                  }
                }
              } else {
                let errorMsg = body || res.statusMessage || `HTTP ${res.statusCode}`;
                try {
                  const parsed = JSON.parse(body);
                  if (parsed.error?.message) {
                    errorMsg = parsed.error.message;
                    if (errorMsg.includes('Invalid agent name')) {
                      errorMsg += ' (Redeploy the agent to automatically apply valid Python identifier naming).';
                    }
                  }
                } catch {
                  // Keep fallback errorMsg
                }
                reject(new Error(`HTTP ${res.statusCode}: ${errorMsg}`));
              }
            });
          }
        );

        req.on('error', (err) => {
          reject(err);
        });

        req.on('timeout', () => {
          req.destroy(new Error('Connection timed out after 60 seconds'));
        });

        req.write(payload);
        req.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Helper to send log messages through WebviewBridge and buffer them in the in-memory active deployment state.
   *
   * @param bridge WebviewBridge instance
   * @param text Log text line
   * @param stream Stream channel
   * @param targetDirectory Optional directory to record logs for background replay
   */
  private logToBridge(
    bridge: WebviewBridge | undefined,
    text: string,
    stream: 'stdout' | 'stderr' | 'system',
    targetDirectory?: string
  ): void {
    const entry = {
      text,
      stream,
      timestamp: new Date().toISOString(),
    };

    if (targetDirectory) {
      const active = this.activeDeployments.get(targetDirectory);
      if (active) {
        active.logs.push(entry);
      }
    }

    if (!bridge) return;
    bridge.postMessage({
      type: 'AGENT_ENGINE_DEPLOY_LOG',
      payload: entry,
    });
  }

  /**
   * Helper to send status updates through WebviewBridge.
   *
   * @param bridge WebviewBridge instance
   * @param payload Status payload
   */
  private sendStatusToBridge(bridge: WebviewBridge | undefined, payload: any): void {
    if (!bridge) return;
    bridge.postMessage({
      type: 'AGENT_ENGINE_DEPLOY_STATUS',
      payload,
    });
  }

  /**
   * Disposes active deployment processes.
   */
  public dispose(): void {
    this.cancelDeployment();
  }
}
