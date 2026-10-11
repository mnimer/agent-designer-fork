# [TASK-217 & TASK-218] Enterprise Agent Governance Pipeline & Automated Gemini Enterprise App Publishing (+ `.agent_engine_config.json` Deploy Fix)

## Problem Statement
1. **`.agent_engine_config.json` Parent Folder Path Bug in `make deploy`**:
   - When `adk deploy agent_engine` executes, ADK's `cli_deploy.to_agent_engine` switches the working directory (`os.chdir(parent_folder)` and then `os.chdir(temp_folder_path)`), while Click resolves the positional `agent` directory argument (`resolve_path=True`), NOT `--agent_engine_config_file` (`type=str`).
   - Passing a relative `--agent_engine_config_file=.agent_engine_config.json` in `Makefile` caused `adk deploy agent_engine` to look for `.agent_engine_config.json` in the parent/temp directory (`<parent_folder>/.agent_engine_config.json`) instead of the generated agent code directory, failing with `Deploy failed: Agent Platform config file not found: <parent_folder>/.agent_engine_config.json`.
   - Omitting `--agent_engine_config_file` (or using `$(CURDIR)/.agent_engine_config.json`) allows `adk deploy agent_engine` to natively resolve `os.path.join(agent_folder, '.agent_engine_config.json')` inside the generated code directory. Furthermore, `UnifiedDeployRunner.hasMakefileTarget(targetDirectory, 'deploy')` should detect legacy `Makefile`s that contain a relative `--agent_engine_config_file=.agent_engine_config.json` and fall back to running `.venv/bin/adk deploy agent_engine` directly (`buildAdkDeployArgs`) so existing generated folders deploy without requiring regeneration first.
2. **[TASK-217] Enterprise Agent Governance Pipeline**:
   - **Always Automatic on Deploy**:
     - Register the deployed agent in **Agent Registry** (`agentregistry.googleapis.com/v1/projects/{project}/locations/{location}/agents`) with Agent Identity and tool/MCP bindings.
     - Configure least-privilege **Agent Security & Access Policies** (`networksecurity.googleapis.com` `AuthzPolicies` & IAM Unified Access Policies).
     - Generate & register `eval_dataset.jsonl` and `evaluate.py` (`make eval`).
   - **Deployment Tab Governance Controls (`GovernanceStatusCard.tsx`)**:
     - **Enable Shared Regional Agent Gateway + Model Armor Guardrails**: Checkbox defaulting to **Checked (`true`)**. When checked, displays a **Model Armor Template** dropdown (populated via `GcpDiscoveryManager.getModelArmorTemplates()`, defaulting to `"enterprise-baseline"` / `"Enterprise Baseline (Managed Default)"`) and attaches the agent to the project's shared regional gateway (`default-shared-agent-gateway`).
     - **Run Vertex AI Cloud Evaluation (`EvalTask`) Post-Deploy**: Checkbox (shown when a Test Suite Trigger node exists on the canvas) defaulting to **Unchecked (`false`)**.
     - **Evaluation Gate Failure Behavior**: When enabled and any test case falls below threshold, marks deployment as **Succeeded with Evaluation Warnings** (`evalGateStatus: 'warning'`, surfacing failed test cases + Vertex AI Experiment URL) and **blocks publishing to the Gemini Enterprise App**.
3. **[TASK-218] Automated Gemini Enterprise App Publishing & Discovery**:
   - **Conditional Visibility**: Only render **"Publish to Gemini Enterprise App"** in `GovernanceStatusCard` (inside `AgentEngineDeployTab` and `CloudRunDeployTab`) when the workflow has a **Chat Trigger** node (`trigger.type === 'chat'` or `triggerKind === 'chat'` or `triggerType === 'chat'`).
   - **Default State**: Defaults to **Checked (`true`)** when a Chat Trigger is present.
   - **Sub-Controls When Checked**:
     - **Gemini Enterprise App (`engine_id`) Dropdown**: Populated via `GcpDiscoveryManager.getGeminiEnterpriseApps(projectId, location, forceRefresh)` (with Refresh button and custom App ID input option).
     - **Location Selector**: `global` (default), `us`, `eu`.
     - **Bind Shared Regional Agent Gateway**: Automatically routes Gemini Enterprise egress through the governed shared regional Agent Gateway when enabled.
   - **Post-Deploy Execution**: Runs `make publish-gemini-enterprise` (or extension-orchestrated Discovery Engine registration + IAM binding for `service-{PROJECT_NUMBER}@gcp-sa-discoveryengine.iam.gserviceaccount.com`) unless blocked by an Evaluation Gate failure.

## Checklist
- [x] Step 1: Write isolated failing unit tests in `tests/unit/extension/UnifiedDeployRunner.test.ts` and `tests/unit/webview/GovernanceStatusCard.test.ts`.
- [x] Step 2: Fix `.agent_engine_config.json` path resolution in `resource/prompts/python_adk_agent-engine.prompt.txt`, `src/extension/deployer/UnifiedDeployRunner.ts`, and `src/extension/deployer/DeployPipeline.ts`.
- [x] Step 3: Extend `src/shared/agentSpec.ts`, `src/shared/rpcProtocol.ts`, `src/extension/deployer/DeployTypes.ts`, and `src/extension/GcpDiscoveryManager.ts` (`getModelArmorTemplates`, `getGeminiEnterpriseApps`).
- [x] Step 4: Implement post-deploy governance & Gemini Enterprise publishing orchestration in `src/extension/deployer/UnifiedDeployRunner.ts`, `src/extension/deployer/DeployPipeline.ts`, `src/extension/CloudRunDeployer.ts`, and `src/extension/editor/WebviewMessageRouter.ts`, and update `resource/prompts/*.prompt.txt` with governance/publishing targets.
- [x] Step 5: Create `src/webview/components/deployment/GovernanceStatusCard.tsx` and integrate it into `src/webview/components/deployment/AgentEngineDeployTab.tsx` and `src/webview/components/deployment/CloudRunDeployTab.tsx`.
- [x] Step 6: Run unit tests (`npx vitest run`), compile (`npm run compile`), and update `TASKS.md`.

