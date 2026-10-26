---
name: terraform-cloudrun
description: "Terraform for the Cloud Run target: main.tf (Artifact Registry, service account, IAM, Cloud Run v2 service, conditional trigger resources), variables.tf, outputs.tf, and terraform.tfvars; required by the infra agent for target cloudrun."
metadata:
  usedBy: [generator, reviewer]
  targets: [cloudrun]
---

# Terraform: Google Cloud Run Target

- `main.tf`: Complete, production-grade Terraform configuration deploying to Google Cloud Run and connecting to an existing project:
   * **Terraform Specification & Provider**:
     - Configure `terraform` block requiring `google` provider (`~> 5.0`) and Terraform version `>= 1.5.0`.
     - Configure `provider "google"` referencing `var.project_id` and `var.region`.
   * **Artifact Registry Repository**:
     - Provision `google_artifact_registry_repository` for storing agent container images (`format = "DOCKER"`).
   * **Identity & Least Privilege IAM Bindings**:
     - Include `data "google_project" "current" {}` to resolve the numeric project number.
     - Provision dedicated `google_service_account` for Cloud Run (e.g. `"${var.service_name}-sa"`).
     - Grant `roles/aiplatform.user` project IAM member to the service account for Vertex AI Gemini model invocation.
     - Grant `roles/run.invoker` on `google_cloud_run_v2_service.agent_service` (`google_cloud_run_v2_service_iam_member.discovery_engine_invoker`) to `serviceAccount:service-${data.google_project.current.number}@gcp-sa-discoveryengine.iam.gserviceaccount.com` so Gemini Enterprise (Discovery Engine) can invoke the Cloud Run A2A service via `X-Serverless-Authorization` even when public unauthenticated access is disabled.
     - When public unauthenticated access is enabled (`var.allow_unauthenticated`), grant `roles/run.invoker` on the Cloud Run service to `allUsers`.
     - When Secret Manager secrets are provisioned, grant `roles/secretmanager.secretAccessor` on the secrets to the service account.
   * **Cloud Run V2 Service (`google_cloud_run_v2_service`)**:
     - Configure `template.service_account` to the dedicated service account email.
     - Deploy container with `image = var.image_uri != "" ? var.image_uri : "${var.region}-docker.pkg.dev/${var.project_id}/${var.artifact_repo_name}/${var.service_name}:latest"`.
     - Set runtime environment variables:
       `GOOGLE_GENAI_USE_VERTEXAI = "true"`,
       `GOOGLE_CLOUD_PROJECT = var.project_id`,
       `GOOGLE_CLOUD_LOCATION = "global"` (per Vertex AI requirements for Gemini 3.7 Flash).
     - Configure compute limits (`cpu = var.cpu`, `memory = var.memory`, `cpu_idle = true`).
     - Configure scaling limits (`min_instance_count = var.min_instances`, `max_instance_count = var.max_instances`).
     - Set traffic allocation to 100% on latest revision (`TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST`).
     - Set `lifecycle { ignore_changes = [client, client_version, template[0].containers[0].image] }` to allow fast CI/CD container updates via Cloud Build / `gcloud run deploy` without Terraform state drift.
   * **Conditional Triggers & Integrations**:
     - **Least-Privilege IAM & Invocation Security**: NEVER grant `roles/run.invoker` to `allUsers` unless the workflow specification explicitly specifies unauthenticated public access. For Eventarc, Pub/Sub, and Cloud Scheduler triggers, bind `roles/run.invoker` ONLY to the dedicated trigger service account (e.g. `google_service_account.eventarc_invoker.email` or `google_service_account.pubsub_invoker.email`).
     - **Pub/Sub Trigger** (when `triggerType` / `triggerKind == "pubsub"`): Enable `pubsub.googleapis.com`, provision dedicated invoker service account with `roles/run.invoker` on Cloud Run, and create `google_pubsub_subscription` with `push_config` pointing to the Cloud Run service `/pubsub` (or `/apps/{app}/trigger/pubsub`) endpoint with `oidc_token { service_account_email = google_service_account.pubsub_invoker.email }`.
     - **Eventarc Trigger** (when `triggerType` / `triggerKind == "eventarc"`): Enable `eventarc.googleapis.com`, provision dedicated invoker service account with `roles/run.invoker` on Cloud Run and `roles/eventarc.eventReceiver` on the project, and create `google_eventarc_trigger` matching the configured event routing to the Cloud Run service path.
     - **Cloud Scheduler (Cron Trigger)** (when `triggerType` / `triggerKind == "scheduled"` or `"cron"`): Enable `cloudscheduler.googleapis.com`, provision scheduler invoker service account with `roles/run.invoker` on Cloud Run, and create `google_cloud_scheduler_job` with the configured cron schedule, timezone, and HTTP target pointing to the Cloud Run service URL with OIDC authentication.
     - **Webhook Trigger** (when `triggerType` / `triggerKind == "webhook"`): When authentication is configured (`authType != "none"`), provision `google_secret_manager_secret` and secret version for the token/signature secret, grant `roles/secretmanager.secretAccessor` to the service account, and inject the secret into the Cloud Run container environment.
     - **Google Workspace Remote MCP Servers** (when any tool has `category: "google_workspace_mcp"` or `workspaceConfig`): MUST include `google_project_service` resources enabling BOTH the base Workspace REST API (`workspaceConfig.companionRestApi`, e.g., `gmail.googleapis.com`, `drive.googleapis.com`, `calendar-json.googleapis.com`) AND the companion MCP service (`workspaceConfig.mcpServiceName`, e.g., `gmailmcp.googleapis.com`, `drivemcp.googleapis.com`, `calendarmcp.googleapis.com`) with `disable_on_destroy = false`.
- `variables.tf`: Complete Terraform input variable definitions:
  * `project_id`: (string, description = "Google Cloud Project ID")
  * `region`: (string, default = "us-central1", description = "Google Cloud Region")
  * `service_name`: (string, default = derived from agent name, description = "Cloud Run service name")
  * `artifact_repo_name`: (string, default = "agent-containers", description = "Artifact Registry Docker repository name")
  * `image_uri`: (string, default = "", description = "Container image URI (defaults to latest tag in Artifact Registry repo)")
  * `cpu`: (string, default = "1", description = "CPU allocation for Cloud Run service")
  * `memory`: (string, default = "2Gi", description = "Memory allocation for Cloud Run service")
  * `min_instances`: (number, default = 0, description = "Minimum scale instance count")
  * `max_instances`: (number, default = 10, description = "Maximum scale instance count")
  * `allow_unauthenticated`: (bool, default = false, description = "Allow unauthenticated public access to the Cloud Run service")
  * `enable_agent_gateway`: (bool, default = true, description = "Provision Shared Regional Agent Gateway and Model Armor protection")
  * `model_armor_template_id`: (string, default = "enterprise-baseline", description = "Model Armor security template ID")
  * `publish_to_gemini_enterprise`: (bool, default = false, description = "Publish deployed agent to Gemini Enterprise App")
  * `gemini_enterprise_app_id`: (string, default = "", description = "Target Gemini Enterprise (Discovery Engine) App/Engine ID")
  * `gemini_enterprise_location`: (string, default = "global", description = "Gemini Enterprise collection location (global, us, eu)")
- `outputs.tf`: Terraform outputs:
  * `service_url`: Reference `google_cloud_run_v2_service.agent_service.uri`.
  * `service_id`: Reference `google_cloud_run_v2_service.agent_service.id`.
  * `artifact_repo_id`: Reference `google_artifact_registry_repository.repo.id`.
  * `service_account_email`: Reference `google_service_account.agent_sa.email`.
- `terraform.tfvars`: Sample environment variable definitions with placeholder project ID and matching defaults.

13. `main.tf`: Complete Terraform configuration deploying google_cloud_run_v2_service, Artifact Registry, Service Account, IAM roles, and triggers.
14. `variables.tf`: Input variable definitions for Terraform.
15. `outputs.tf`: Output values (service_url, service_id, artifact_repo_id, service_account_email).
16. `terraform.tfvars`: Default variable values for local initialization.
