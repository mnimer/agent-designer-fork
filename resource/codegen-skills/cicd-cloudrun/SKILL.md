---
name: cicd-cloudrun
description: "Cloud Run CI/CD: cloudbuild.yaml pipeline and the Cloud Run Makefile targets (dev, infra, deploy, register-agent, publish-gemini-enterprise); required by the infra agent for target cloudrun."
metadata:
  usedBy: [generator, reviewer]
  targets: [cloudrun]
---

# CI/CD: Google Cloud Run Target

- `cloudbuild.yaml`: Production multi-stage Google Cloud Build pipeline:
  * Step 1: Run pytest test suite (`test_agent.py`) in python:3.11 container.
  * Step 2: Build Docker container image (`docker build -t ...`).
  * Step 3: Push image to Google Cloud Artifact Registry (`docker push ...`).
  * Step 4: Deploy container revision to Google Cloud Run (`gcloud run deploy ...`).
  * Step 5: Post-deploy CI/CD governance & Gemini Enterprise registration (grants `roles/run.invoker` to `service-${PROJECT_NUMBER}@gcp-sa-discoveryengine.iam.gserviceaccount.com`, runs `evaluate.py` when `_RUN_CLOUD_EVAL=true`, and upserts the A2A `JSONRPC` agent card onto Gemini Enterprise when `_PUBLISH_GEMINI_ENTERPRISE=true` and `_GEMINI_ENTERPRISE_APP_ID` is provided).
- `Makefile`: Standardized, self-contained CLI & CI/CD automation entrypoint with targets:

* `make dev`: `@test -x .venv/bin/python || $(MAKE) install` followed by `.venv/bin/python -m uvicorn server:app --reload --port $(PORT)`

* `make infra`: `terraform init && terraform apply -auto-approve -var="project_id=$(PROJECT_ID)" -var="region=$(REGION)" -var="service_name=$(SERVICE_NAME)" -var="enable_agent_gateway=$(ENABLE_AGENT_GATEWAY)" -var="model_armor_template_id=$(MODEL_ARMOR_TEMPLATE)" -var="publish_to_gemini_enterprise=$(PUBLISH_GEMINI_ENTERPRISE)" -var="gemini_enterprise_app_id=$(GEMINI_ENTERPRISE_APP_ID)" -var="gemini_enterprise_location=$(GEMINI_ENTERPRISE_LOCATION)"`
* `make deploy`: Deploys the Cloud Run service using overrideable variables (`PROJECT_ID ?=`, `REGION ?= us-central1`, `SERVICE_NAME ?=`, `CPU ?= 1`, `MEMORY ?= 2Gi`, `MIN_INSTANCES ?= 0`, `MAX_INSTANCES ?= 10`, `ALLOW_UNAUTHENTICATED ?= false`, `NETWORK_ATTACHMENT ?=`, `ENABLE_AGENT_GATEWAY ?= true`, `MODEL_ARMOR_TEMPLATE ?= enterprise-baseline`, `GATEWAY_ID ?= default-shared-agent-gateway`, `RUN_CLOUD_EVAL ?= false`, `PUBLISH_GEMINI_ENTERPRISE ?= false`, `GEMINI_ENTERPRISE_APP_ID ?=`, `GEMINI_ENTERPRISE_LOCATION ?= global`, `ENV_VARS ?= GOOGLE_GENAI_USE_VERTEXAI=true,GOOGLE_CLOUD_LOCATION=global,GOOGLE_CLOUD_PROJECT=$(PROJECT_ID)`): In Makefile recipes for `infra` and `deploy`, always double-quote all make variable expansions passed to shell/CLI commands: `gcloud run deploy "$(SERVICE_NAME)" --source . --project "$(PROJECT_ID)" --region "$(REGION)" --platform managed --cpu="$(CPU)" --memory="$(MEMORY)" --min-instances="$(MIN_INSTANCES)" --max-instances="$(MAX_INSTANCES)" $(if $(filter true,$(ALLOW_UNAUTHENTICATED)),--allow-unauthenticated,--no-allow-unauthenticated) $(if $(NETWORK_ATTACHMENT),--network-attachment="$(NETWORK_ATTACHMENT)",) --set-env-vars="$(ENV_VARS)" --quiet` (or `gcloud builds submit --config=cloudbuild.yaml --project="$(PROJECT_ID)" .` when `USE_CLOUD_BUILD=true`), followed by optional `$(MAKE) eval` when `RUN_CLOUD_EVAL=true` and `$(MAKE) publish-gemini-enterprise` when `PUBLISH_GEMINI_ENTERPRISE=true`.
* `make register-agent`: Verifies the deployed Cloud Run agent in Google Cloud Agent Registry (`GET https://agentregistry.googleapis.com/v1alpha/projects/$(PROJECT_ID)/locations/$(REGION)/agents`) and applies least-privilege Agent Security Policies on both IAP (`POST https://iap.googleapis.com/v1/projects/$(PROJECT_ID)/locations/$(REGION)/iap_web/agentRegistry:setIamPolicy` granting `roles/iap.egressor` to the agent's `RuntimeIdentity` principal) and IAM v3 Unified Access Policies (`POST https://iam.googleapis.com/v3/projects/$(PROJECT_ID)/locations/global/accessPolicies` + `policyBindings` granting `iap.googleapis.com/resources.egressViaIAP`).

* `make publish-gemini-enterprise`: Grants `roles/run.invoker` on `$(SERVICE_NAME)` to `serviceAccount:service-$$PROJECT_NUMBER@gcp-sa-discoveryengine.iam.gserviceaccount.com` via `gcloud run services add-iam-policy-binding`, then upserts the deployed Cloud Run agent onto the target Gemini Enterprise App (`GET` existing agents from `https://discoveryengine.googleapis.com/v1alpha/projects/$(PROJECT_ID)/locations/$(GEMINI_ENTERPRISE_LOCATION)/collections/default_collection/engines/$(GEMINI_ENTERPRISE_APP_ID)/assistants/default_assistant/agents`, `PATCH ?updateMask=displayName,description,a2aAgentDefinition` if matched or `POST` without `?agentId=` if new, setting `sharingConfig: {"scope": "ALL_USERS"}` and `a2aAgentDefinition.jsonAgentCard` with `preferredTransport: "JSONRPC"` and `url` set to the Cloud Run service root HTTPS URL).

## Manifest Entries

9. `Makefile`: Self-contained CLI & CI/CD automation Makefile with `install`, `dev`, `test`, `eval`, `infra`, `deploy`, `register-agent`, `setup-gateway`, and `publish-gemini-enterprise` targets.

12. `cloudbuild.yaml`: CI/CD Cloud Build pipeline running tests, building container, and deploying.
