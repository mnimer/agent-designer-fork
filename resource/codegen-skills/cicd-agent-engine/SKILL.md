---
name: cicd-agent-engine
description: "Agent Runtime CI/CD: cloudbuild-buildonly.yaml, cloudbuild.yaml with reasoning-engine updates, and the Agent Runtime Makefile (adk deploy agent_engine, register-agent, publish-gemini-enterprise); required by the infra agent for target agent-engine."
metadata:
  usedBy: [generator, reviewer]
  targets: [agent-engine]
---

# CI/CD: Google Agent Runtime (Agent Engine) Target

- `cloudbuild-buildonly.yaml`: Targeted Cloud Build configuration for container building and testing:
  * Step 1: Run pytest unit tests (`pytest test_agent.py`) in `python:3.11-slim`.
  * Step 2: Build container image with Docker and push to Artifact Registry (`${_REGION}-docker.pkg.dev/${_PROJECT_ID}/${_REPO}/${_AGENT_NAME}:$SHORT_SHA` and `:latest`).
  * Called automatically by Terraform during initial `terraform apply` Day 0 setup!
- `cloudbuild.yaml`: CI/CD Cloud Build pipeline for ongoing automated continuous deployment:
  * Step 1: Run pytest unit tests (`pytest test_agent.py`) in `python:3.11-slim`.
  * Step 2: Build container image with Docker and push to Artifact Registry (`${_REGION}-docker.pkg.dev/${_PROJECT_ID}/${_REPO}/${_AGENT_NAME}:$SHORT_SHA` and `:latest`).
  * Step 3: Continuous deployment: Update the Reasoning Engine container image using `gcloud beta ai reasoning-engines update` when `_REASONING_ENGINE_ID` is provided.

- `Makefile`: Standardized, self-contained CLI & CI/CD automation entrypoint (used directly by both the VS Code "Deploy" button and terminal/CI users) with default variables (`PROJECT_ID ?=`, `REGION ?= us-central1`, `AGENT_NAME ?=`, `DISPLAY_NAME ?= $(AGENT_NAME)`, `AGENT_ENGINE_ID ?=`, `STAGING_BUCKET ?=`, `SERVICE_ACCOUNT ?=`, `NETWORK_ATTACHMENT ?=`, `CPU ?= 1`, `MEMORY ?= 2Gi`, `MIN_INSTANCES ?= 1`, `MAX_INSTANCES ?= 10`, `USE_CLOUD_BUILD ?= false`, `ENABLE_AGENT_GATEWAY ?= true`, `MODEL_ARMOR_TEMPLATE ?= enterprise-baseline`, `GATEWAY_ID ?= default-shared-agent-gateway`, `RUN_CLOUD_EVAL ?= false`, `PUBLISH_GEMINI_ENTERPRISE ?= false`, `GEMINI_ENTERPRISE_APP_ID ?=`, `GEMINI_ENTERPRISE_LOCATION ?= global`) and targets:
  * `make install`: `python3 -m venv .venv && .venv/bin/pip install --upgrade pip -r requirements.txt`
  * `make dev`: `.venv/bin/adk web .`
  * `make test`: `@test -x .venv/bin/pytest || $(MAKE) install` followed by `.venv/bin/pytest test_agent.py -v`
  * `make eval`: `@test -x .venv/bin/python || $(MAKE) install` followed by `.venv/bin/python evaluate.py --project=$(PROJECT_ID) --location=$(REGION) --dataset=eval_dataset.jsonl`
  * `make infra`: `terraform init && terraform apply -auto-approve -var="project_id=$(PROJECT_ID)" -var="region=$(REGION)" -var="agent_name=$(AGENT_NAME)" -var="enable_agent_gateway=$(ENABLE_AGENT_GATEWAY)" -var="model_armor_template_id=$(MODEL_ARMOR_TEMPLATE)" -var="publish_to_gemini_enterprise=$(PUBLISH_GEMINI_ENTERPRISE)" -var="gemini_enterprise_app_id=$(GEMINI_ENTERPRISE_APP_ID)" -var="gemini_enterprise_location=$(GEMINI_ENTERPRISE_LOCATION)"`
  * `make deploy`: Automatically ensures `.venv/bin/adk` is installed (`test -x .venv/bin/adk || $(MAKE) install`) and executes `.venv/bin/adk deploy agent_engine --project=$(PROJECT_ID) --region=$(REGION) $(if $(AGENT_ENGINE_ID),--agent_engine_id=$(AGENT_ENGINE_ID),--display_name="$(DISPLAY_NAME)") --otel_to_cloud $(if $(STAGING_BUCKET),--artifact_service_uri=$(STAGING_BUCKET),) $(if $(SERVICE_ACCOUNT),--service_account=$(SERVICE_ACCOUNT),) .` (or `gcloud builds submit --config=cloudbuild.yaml --project=$(PROJECT_ID) --substitutions=_PROJECT_ID=$(PROJECT_ID),_REGION=$(REGION),_AGENT_NAME=$(AGENT_NAME),_REASONING_ENGINE_ID=$(AGENT_ENGINE_ID) .` when `USE_CLOUD_BUILD=true`). CRITICAL: Omit `--session_service_uri="memory://"` so `adk deploy agent_engine` defaults to the managed Agent Engine session service (`agentengine://projects/.../reasoningEngines/...`), pass `--otel_to_cloud` so the container installs `google-adk[a2a,gcp,otel-gcp]` and exports OpenTelemetry trace and session spans to Cloud Trace, and NEVER pass a relative `--agent_engine_config_file` flag because `adk deploy agent_engine` changes directory to the parent folder during staging and automatically resolves `<agent_folder>/.agent_engine_config.json` when `--agent_engine_config_file` is omitted!
  * `make register-agent`: Verifies the deployed agent in Google Cloud Agent Registry (`GET https://agentregistry.googleapis.com/v1alpha/projects/$(PROJECT_ID)/locations/$(REGION)/agents`), registers the agent's discovered workload/service in a regional Google Cloud App Hub Application (`POST https://apphub.googleapis.com/v1/projects/$(PROJECT_ID)/locations/$(REGION)/applications/agent-platform-$(REGION)/workloads`) so the Cloud Console Topology tab shows a registered workload, enables Agent Engine OpenTelemetry tracing (`PATCH https://$(REGION)-aiplatform.googleapis.com/v1beta1/$(AGENT_URI)?updateMask=spec.deploymentSpec.env` with `GOOGLE_CLOUD_AGENT_ENGINE_ENABLE_TELEMETRY=true`, `OTEL_SEMCONV_STABILITY_OPT_IN=gen_ai_latest_experimental`, `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=EVENT_ONLY`, `ADK_CAPTURE_MESSAGE_CONTENT_IN_SPANS=true`), and applies least-privilege Agent Security Policies on both IAP (`POST https://iap.googleapis.com/v1/projects/$(PROJECT_ID)/locations/$(REGION)/iap_web/agentRegistry:setIamPolicy` granting `roles/iap.egressor` to the agent's `RuntimeIdentity` principal) and IAM v3 Unified Access Policies (`POST https://iam.googleapis.com/v3/projects/$(PROJECT_ID)/locations/global/accessPolicies` + `policyBindings` granting `iap.googleapis.com/resources.egressViaIAP`).
  * `make setup-gateway`: Provisions the Model Armor template (`POST https://modelarmor.$(REGION).rep.googleapis.com/v1/projects/$(PROJECT_ID)/locations/$(REGION)/templates?templateId=$(MODEL_ARMOR_TEMPLATE)`), creates or updates the Shared Regional Agent Gateway (`POST https://networkservices.googleapis.com/v1alpha1/projects/$(PROJECT_ID)/locations/$(REGION)/agentGateways?agentGatewayId=$(GATEWAY_ID)` with `googleManaged.governedAccessPath = "AGENT_TO_ANYWHERE"`, `protocols = ["MCP"]`, and `registries = ["//agentregistry.googleapis.com/projects/$(PROJECT_ID)/locations/$(REGION)"]`), and binds IAP (`REQUEST_AUTHZ`) + Model Armor AI Security (`CONTENT_AUTHZ`) `authzExtensions` (`networkservices.googleapis.com/v1beta1`) and `authzPolicies` (`networksecurity.googleapis.com/v1beta1`).
  * `make publish-gemini-enterprise`: Upserts the deployed agent onto the target Gemini Enterprise App (`GET` existing agents from `https://discoveryengine.googleapis.com/v1alpha/projects/$(PROJECT_ID)/locations/$(GEMINI_ENTERPRISE_LOCATION)/collections/default_collection/engines/$(GEMINI_ENTERPRISE_APP_ID)/assistants/default_assistant/agents`, `PATCH ?updateMask=displayName,description,adkAgentDefinition` if matched or `POST` without `?agentId=` if new, setting `sharingConfig: {"scope": "ALL_USERS"}` and `adkAgentDefinition.provisionedReasoningEngine.reasoningEngine = "$(AGENT_URI)"`).

## Cloud Build Configuration Details

- `cloudbuild-buildonly.yaml`:
  * Minimal container build and verification pipeline for Day 0 bootstrapping:
    ```yaml
    steps:
      - name: 'python:3.11-slim'
        id: 'unit-tests'
        entrypoint: 'bash'
        args:
          - '-c'
          - |
            pip install --no-cache-dir -r requirements.txt
            pytest test_agent.py -v

      - name: 'gcr.io/cloud-builders/docker'
        id: 'docker-build-push'
        entrypoint: 'bash'
        args:
          - '-c'
          - |
            docker build -t "${_REGION}-docker.pkg.dev/${_PROJECT_ID}/${_REPO}/${_AGENT_NAME}:$SHORT_SHA" .
            docker tag "${_REGION}-docker.pkg.dev/${_PROJECT_ID}/${_REPO}/${_AGENT_NAME}:$SHORT_SHA" "${_REGION}-docker.pkg.dev/${_PROJECT_ID}/${_REPO}/${_AGENT_NAME}:latest"
            docker push "${_REGION}-docker.pkg.dev/${_PROJECT_ID}/${_REPO}/${_AGENT_NAME}:$SHORT_SHA"
            docker push "${_REGION}-docker.pkg.dev/${_PROJECT_ID}/${_REPO}/${_AGENT_NAME}:latest"

    substitutions:
      _PROJECT_ID: ''
      _REGION: 'us-central1'
      _REPO: 'agents'
      _AGENT_NAME: ''

    options:
      logging: CLOUD_LOGGING_ONLY
    ```
- `cloudbuild.yaml`:
  * Step 1 (`unit-tests`): In `python:3.11-slim`, installs requirements and executes `pytest test_agent.py -v`.
  * Step 2 (`docker-build-push`): Builds and pushes container image to Artifact Registry (`${_REGION}-docker.pkg.dev/${_PROJECT_ID}/${_REPO}/${_AGENT_NAME}:$SHORT_SHA` and `:latest`).
  * Step 3 (`agent-engine-deploy`): In `gcr.io/google.com/cloudsdktool/cloud-sdk:slim`, updates the deployed reasoning engine container image when `_REASONING_ENGINE_ID` is set:
    ```yaml
    - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk:slim'
      id: 'agent-engine-deploy'
      entrypoint: 'bash'
      args:
        - '-c'
        - |
          if [ -n "${_REASONING_ENGINE_ID}" ]; then
            gcloud beta ai reasoning-engines update \
              --project="${_PROJECT_ID}" \
              --region="${_REGION}" \
              "projects/${_PROJECT_ID}/locations/${_REGION}/reasoningEngines/${_REASONING_ENGINE_ID}" \
              --container-image-uri="${_REGION}-docker.pkg.dev/${_PROJECT_ID}/${_REPO}/${_AGENT_NAME}:$SHORT_SHA"
          else
            echo "Initial deployment: Run 'terraform apply' to provision the Reasoning Engine infrastructure, or provide _REASONING_ENGINE_ID for continuous updates."
          fi
    ```
  * Substitutions: Declare `_PROJECT_ID: ''`, `_REGION: 'us-central1'`, `_REPO: 'agents'`, `_AGENT_NAME: '<agent_name>'`, `_REASONING_ENGINE_ID: ''`.

## Manifest Entries

5. `Makefile`: Self-contained CLI & CI/CD automation Makefile with `install`, `dev`, `test`, `infra`, and `deploy` targets.

10. `cloudbuild-buildonly.yaml`: Focused Cloud Build configuration running unit tests, building the container image, and pushing to Artifact Registry for initial Day 0 Terraform setup.
11. `cloudbuild.yaml`: CI/CD Cloud Build pipeline running tests, building the container image, pushing to Artifact Registry, and updating the Reasoning Engine container.

## CI/CD Differences from Cloud Run

| Aspect | Agent Runtime | Cloud Run |
|--------|-------------|-----------|
| **Build** | Dockerfile → image (built by Agent Engine) | Dockerfile → image (`gcloud builds`) |
| **Deploy command** | `agents-cli deploy` | `gcloud run deploy --image ...` |
| **Artifact** | Container image | Container image in Artifact Registry |
| **Python version** | Configurable in Dockerfile | Configurable in Dockerfile |
| **Load testing** | Via `locust` against Agent Runtime endpoint | Direct HTTP to Cloud Run URL |
