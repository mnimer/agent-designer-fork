# [TASK-216] Unified Self-Contained CLI & CI/CD Deployment Architecture (Makefile, Terraform & Cloud Build)

## Problem Statement
1. **Extension-Only Procedural Staging (`ArtifactStager`)**: Previously, `DeployPipeline` relied on `ArtifactStager` to procedurally generate or patch `.ae_ignore`, `.agent_engine_config.json`, `pyproject.toml`, `agents-cli-manifest.yaml`, `agent_runtime_app.py`, and `agent.py` at deploy time inside the VS Code extension. If a developer wanted to deploy the generated repository from the command line or a CI/CD pipeline outside VS Code, those mutations/files were missing or inconsistent, and procedural code patching violated the **Zero Procedural Post-Processing** rule in `AGENTS.md`.
2. **Duplicate Target-Specific Deployer Pipelines (`DeployPipeline` vs `CloudRunDeployer`)**: `AgentEngineDeployer`/`DeployPipeline` and `CloudRunDeployer` maintained separate subprocess spawners, environment resolvers, process registries, and CLI flag builders instead of sharing a unified deployment runner that executes the repository's own self-contained build/deploy definitions (`Makefile`, `cloudbuild.yaml`, `main.tf`).

## Architectural Plan
1. **Self-Contained Repository Generation in Prompt Templates (`resource/prompts/*.prompt.txt`)**:
   - Update `resource/prompts/python_adk_agent-engine.prompt.txt` and `resource/prompts/python_adk_cloudrun.prompt.txt` to include a standardized `Makefile` in the mandatory file manifest with targets:
     - `make install`: Creates local `.venv` and installs `requirements.txt`.
     - `make dev`: Starts the local ADK server (`adk web .` or `uvicorn server:app --reload`).
     - `make test`: Executes `.venv/bin/pytest test_agent.py -v`.
     - `make infra`: Executes `terraform init && terraform apply -auto-approve` with `project_id`, `region`, and `agent_name`/`service_name`.
     - `make deploy`: Executes the target deployment from the CLI (`adk deploy agent_engine` / `gcloud builds submit` / `gcloud run deploy`) using standard overrideable Makefile variables (`PROJECT_ID`, `REGION`, `AGENT_NAME`, `SERVICE_NAME`, `AGENT_ENGINE_ID`, `DISPLAY_NAME`, `STAGING_BUCKET`, `SERVICE_ACCOUNT`, `NETWORK_ATTACHMENT`, `USE_CLOUD_BUILD`).
   - Add `.agent_engine_config.json`, `.ae_ignore`, and `pyproject.toml` to the mandatory file manifest in `resource/prompts/python_adk_agent-engine.prompt.txt` so Agent Engine repositories are 100% self-contained at code generation time without procedural file patching.
   - Update `README.md` instructions in both prompts to document `make install`, `make dev`, `make test`, `make infra`, and `make deploy`.
2. **Unified Deployment Runner (`src/extension/deployer/UnifiedDeployRunner.ts`)**:
   - Create `UnifiedDeployRunner` to provide a single, target-agnostic deployment execution and command builder supporting `agent_engine` and `cloud_run` via `Makefile` (`make deploy` / `make infra`), `Cloud Build` (`gcloud builds submit --config=cloudbuild.yaml`), `Terraform` (`terraform apply`), or direct CLI (`adk deploy agent_engine` / `gcloud run deploy`).
   - Remove procedural Python file mutation (`ensureAgentImports`, `ensureAgentRuntimeApp`, `ensureManifestFile`, `ensurePyProjectToml`) from `DeployPipeline.deploy()` so the extension never rewrites generated Python code behind the scenes.
   - Wire `DeployPipeline` and `CloudRunDeployer` to `UnifiedDeployRunner` while preserving 100% backwards compatibility with all existing WebviewBridge RPC messages and UI components.
3. **TDD & Verification**:
   - Write comprehensive unit tests in `tests/unit/extension/UnifiedDeployRunner.test.ts`, `tests/unit/extension/GeminiCodeGenEngine.test.ts`, `tests/unit/extension/AgentEngineDeployer.test.ts`, and `tests/unit/extension/CloudRunDeployer.test.ts`.
   - Update `ARCHITECTURE.md` and `DESIGN_DOC.md` to reflect the unified self-contained deployment architecture.

## Checklist
- [x] Step 1: Document `[TASK-216]` in `TASK.md` and `TASKS.md`.
- [x] Step 2: Write isolated failing unit tests for `UnifiedDeployRunner` and prompt manifest requirements (`Makefile`, `.agent_engine_config.json`, `.ae_ignore`, `pyproject.toml`).
- [x] Step 3: Update `resource/prompts/python_adk_agent-engine.prompt.txt` and `resource/prompts/python_adk_cloudrun.prompt.txt` with `Makefile` and self-contained config files.
- [x] Step 4: Implement `src/extension/deployer/UnifiedDeployRunner.ts` and refactor `DeployPipeline.ts` and `CloudRunDeployer.ts` to use it without procedural Python code mutation.
- [x] Step 5: Run full unit test suite (`npx vitest run`), compile extension (`npm run compile`), and sync `ARCHITECTURE.md` / `DESIGN_DOC.md`.
