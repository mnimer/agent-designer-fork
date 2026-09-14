/**
 * ArtifactStager
 *
 * Handles workspace file collection, staging directory preparation, copy-filtering,
 * ignore file configuration, and dynamic PyProject/Manifest/Imports/App bootstrapping.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import * as path from 'path';
import * as fs from 'fs';
import { validateTargetFolder } from '../../shared/folderValidation';
import { DeploymentMetadataRecord, AgentEngineDeployOptions } from './DeployTypes';

export class ArtifactStager {
  constructor() {}

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
      console.warn(`[ArtifactStager] Failed to read ${metaPath}:`, err);
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
  env_vars:
    GOOGLE_GENAI_USE_VERTEXAI: "1"
    GOOGLE_CLOUD_LOCATION: "global"
`;
      fs.writeFileSync(manifestPath, manifestContent, 'utf8');
    } else {
      // If manifest exists, verify deployment_target is configured as agent_runtime and env_vars are set
      try {
        let content = fs.readFileSync(manifestPath, 'utf8');
        let modified = false;
        if (!content.includes('agent_runtime')) {
          if (content.includes('deployment_target:')) {
            content = content.replace(/deployment_target:\s*['"]?[a-zA-Z0-9_-]+['"]?/, 'deployment_target: agent_runtime');
          } else if (content.includes('create_params:')) {
            content = content.replace('create_params:', 'create_params:\n  deployment_target: agent_runtime');
          } else {
            content += '\ncreate_params:\n  deployment_target: agent_runtime\n  is_a2a: false\n';
          }
          modified = true;
        }
        if (!content.includes('GOOGLE_CLOUD_LOCATION')) {
          if (content.includes('env_vars:')) {
            content = content.replace('env_vars:', 'env_vars:\n    GOOGLE_GENAI_USE_VERTEXAI: "1"\n    GOOGLE_CLOUD_LOCATION: "global"');
          } else if (content.includes('create_params:')) {
            content = content.replace('create_params:', 'create_params:\n  env_vars:\n    GOOGLE_GENAI_USE_VERTEXAI: "1"\n    GOOGLE_CLOUD_LOCATION: "global"');
          } else {
            content += '\ncreate_params:\n  env_vars:\n    GOOGLE_GENAI_USE_VERTEXAI: "1"\n    GOOGLE_CLOUD_LOCATION: "global"\n';
          }
          modified = true;
        }
        if (modified) {
          fs.writeFileSync(manifestPath, content, 'utf8');
        }
      } catch {
        // Fallback silently if manifest is binary or unreadable
      }
    }
  }

  /**
   * Ensures .agent_engine_config.json exists with env_vars injecting GOOGLE_CLOUD_LOCATION="global"
   * and GOOGLE_GENAI_USE_VERTEXAI="1". When deploying via `adk deploy agent_engine`, ADK reads
   * .agent_engine_config.json and passes env_vars to ReasoningEngine / AgentEngine create/update API,
   * guaranteeing the deployed container runtime in Vertex AI has the global model endpoint configured.
   *
   * @param targetDirectory Target folder containing agent code
   */
  public ensureAgentEngineConfig(targetDirectory: string): void {
    const configPath = path.join(targetDirectory, '.agent_engine_config.json');
    try {
      if (fs.existsSync(configPath)) {
        const raw = fs.readFileSync(configPath, 'utf8');
        let parsed: any;
        try {
          parsed = JSON.parse(raw);
        } catch {
          parsed = {};
        }
        if (!parsed.env_vars || typeof parsed.env_vars !== 'object') {
          parsed.env_vars = {};
        }
        parsed.env_vars['GOOGLE_GENAI_USE_VERTEXAI'] = '1';
        parsed.env_vars['GOOGLE_CLOUD_LOCATION'] = 'global';
        fs.writeFileSync(configPath, JSON.stringify(parsed, null, 2) + '\n', 'utf8');
      } else {
        const defaultConfig = {
          env_vars: {
            GOOGLE_GENAI_USE_VERTEXAI: '1',
            GOOGLE_CLOUD_LOCATION: 'global',
          },
        };
        fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2) + '\n', 'utf8');
      }
    } catch (err) {
      console.warn('[ArtifactStager] Failed to ensure .agent_engine_config.json:', err);
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

    // Check if A2A protocol support is required
    let isA2A = false;
    const agentPyPath = path.join(targetDirectory, 'agent.py');
    try {
      if (fs.existsSync(requirementsPath) && fs.readFileSync(requirementsPath, 'utf8').includes('a2a')) {
        isA2A = true;
      } else if (fs.existsSync(agentPyPath)) {
        const agentContent = fs.readFileSync(agentPyPath, 'utf8');
        if (
          agentContent.includes('RemoteA2aAgent') ||
          agentContent.includes('import a2a') ||
          agentContent.includes('from a2a') ||
          agentContent.includes('to_a2a')
        ) {
          isA2A = true;
        }
      }
    } catch {}

    if (isA2A) {
      if (!fs.existsSync(requirementsPath)) {
        throw new Error(
          `[Deployment Validation Error] A2A protocol detected in agent code, but 'requirements.txt' is missing in ${targetDirectory}. All A2A deployments require requirements.txt declaring 'google-adk[a2a]' and 'a2a-sdk[http-server]'.`
        );
      }

      const reqContent = fs.readFileSync(requirementsPath, 'utf8');
      if (!reqContent.includes('google-adk[a2a]') && !reqContent.includes('a2a-sdk')) {
        throw new Error(
          `[Deployment Validation Error] A2A protocol detected in agent code, but 'requirements.txt' is missing required A2A dependencies ('google-adk[a2a]' and 'a2a-sdk[http-server]'). Failing fast before deployment.`
        );
      }
    }

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
   * Ensures agent_runtime_app.py is present in the target directory with Vertex AI global location mandate.
   * `agents-cli deploy` introspects `agent_runtime_app.agent_runtime` via subprocess
   * to extract the class methods and schemas required by Vertex AI Agent Engine.
   *
   * @param targetDirectory Target folder containing agent code
   */
  public ensureAgentRuntimeApp(targetDirectory: string): void {
    const runtimeAppPath = path.join(targetDirectory, 'agent_runtime_app.py');
    const globalRegionBlock = `# Mandate Vertex AI Global Region for gemini-3.7-flash and publisher models
os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "1"
os.environ["GOOGLE_CLOUD_LOCATION"] = "global"
`;

    if (fs.existsSync(runtimeAppPath)) {
      try {
        let content = fs.readFileSync(runtimeAppPath, 'utf8');
        let modified = false;

        // If GOOGLE_CLOUD_LOCATION is missing, inject it right after import os
        if (!content.includes('GOOGLE_CLOUD_LOCATION')) {
          if (content.includes('import os')) {
            content = content.replace('import os', `import os\n\n${globalRegionBlock}`);
          } else {
            content = `import os\n\n${globalRegionBlock}\n` + content;
          }
          modified = true;
        } else if (content.includes('os.environ.setdefault("GOOGLE_CLOUD_LOCATION"')) {
          content = content.replace(
            /os\.environ\.setdefault\(["']GOOGLE_CLOUD_LOCATION["'],\s*["'][^"']+["']\)/g,
            'os.environ["GOOGLE_CLOUD_LOCATION"] = "global"'
          );
          modified = true;
        }

        if (content.includes('os.environ.setdefault("GOOGLE_GENAI_USE_VERTEXAI"')) {
          content = content.replace(
            /os\.environ\.setdefault\(["']GOOGLE_GENAI_USE_VERTEXAI["'],\s*["'][^"']+["']\)/g,
            'os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "1"'
          );
          modified = true;
        }

        if (modified) {
          fs.writeFileSync(runtimeAppPath, content, 'utf8');
        }
      } catch (err) {
        console.warn('[ArtifactStager] Failed to patch agent_runtime_app.py:', err);
      }
      return;
    }

    const content = `import os

${globalRegionBlock}
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
   * Ensures agent.py explicitly adds its directory to sys.path if not already present,
   * removes any deprecated AgentBase imports, and enforces direct assignment of Vertex AI
   * global region variables (`GOOGLE_CLOUD_LOCATION = "global"`) to prevent 404 NOT_FOUND
   * publisher model errors when running inside regional Agent Engine containers.
   *
   * @param targetDirectory Target folder containing agent code
   */
  public ensureAgentImports(targetDirectory: string): void {
    const agentPyPath = path.join(targetDirectory, 'agent.py');
    if (!fs.existsSync(agentPyPath)) {
      return;
    }

    try {
      let content = fs.readFileSync(agentPyPath, 'utf8');
      let modified = false;

      if (content.includes('from google.adk.agents.agent_base import AgentBase') || content.includes('AgentBase')) {
        content = content
          .replace(/from google\.adk\.agents\.agent_base import AgentBase\r?\n?/g, '')
          .replace(/:\s*AgentBase/g, '');
        modified = true;
      }

      if (!content.includes('sys.path.insert') && !content.includes('sys.path.append')) {
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

      if (content.includes('os.environ.setdefault("GOOGLE_CLOUD_LOCATION"')) {
        content = content.replace(
          /os\.environ\.setdefault\(["']GOOGLE_CLOUD_LOCATION["'],\s*["'][^"']+["']\)/g,
          'os.environ["GOOGLE_CLOUD_LOCATION"] = "global"'
        );
        modified = true;
      }
      if (content.includes('os.environ.setdefault("GOOGLE_GENAI_USE_VERTEXAI"')) {
        content = content.replace(
          /os\.environ\.setdefault\(["']GOOGLE_GENAI_USE_VERTEXAI["'],\s*["'][^"']+["']\)/g,
          'os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "1"'
        );
        modified = true;
      }
      if (!content.includes('GOOGLE_CLOUD_LOCATION')) {
        const locationPatch = `# Mandate Vertex AI Global Region for gemini-3.7-flash and publisher models
os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "1"
os.environ["GOOGLE_CLOUD_LOCATION"] = "global"
`;
        if (content.includes('import os')) {
          content = content.replace('import os', `import os\n\n${locationPatch}`);
        } else {
          content = `import os\n\n${locationPatch}\n` + content;
        }
        modified = true;
      }

      if (modified) {
        fs.writeFileSync(agentPyPath, content, 'utf8');
      }
    } catch (err) {
      console.warn('[ArtifactStager] Failed to patch imports and region in agent.py:', err);
    }
  }

  /**
   * Copies agent source files from a source directory to a staged directory,
   * skipping heavy/virtual environment directories like .venv, .git, and __pycache__
   * to guarantee payloads remain well below the 8MB Vertex AI request limit.
   *
   * @param src Source directory
   * @param dest Destination directory
   */
  public stageAgentDirectory(src: string, dest: string): void {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }

    const ignoredFolders = new Set(['.venv', 'venv', '.git', '__pycache__', 'node_modules', '.pytest_cache']);

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
}
