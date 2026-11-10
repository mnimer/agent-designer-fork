---
name: terraform-agent-engine
description: "Terraform for the Agent Runtime target: google_vertex_ai_reasoning_engine with container_spec, null_resource Cloud Build bootstrap, service account/IAM, and conditional Pub/Sub, Eventarc, Cloud Scheduler, webhook gateway resources; required by the infra agent for target agent-engine."
metadata:
  usedBy: [generator, reviewer]
  targets: [agent-engine]
---

# Terraform: Google Agent Runtime (Agent Engine) Target

- `main.tf`: Complete Terraform configuration provisioning:
  * Dedicated Service Account with least-privilege IAM bindings (`roles/aiplatform.user`, `roles/logging.logWriter`).
  * Automated container build: `null_resource.build_container` with `local-exec` provisioner running `gcloud builds submit --config=cloudbuild-buildonly.yaml ...` when `var.build_image` is `true`.
  * `google_vertex_ai_reasoning_engine` configuring `spec.container_spec.image_uri` (with `depends_on = [null_resource.build_container]`, `agent_framework = "google-adk"`, and `lifecycle { ignore_changes = [spec[0].container_spec[0].image_uri] }`).
  * **CONDITIONAL Pub/Sub**: ONLY generate `google_pubsub_topic`, `google_pubsub_subscription`, and `roles/pubsub.subscriber` if the workflow contains a trigger node with `triggerType: "pubsub"` or `triggerKind: "pubsub"`. If there are NO Pub/Sub triggers in the workflow, DO NOT generate any Pub/Sub resources in `main.tf`.
  * **CONDITIONAL Eventarc**: When the workflow contains a trigger node with `triggerType: "eventarc"` or `triggerKind: "eventarc"`:
    - Enable APIs: `google_project_service.eventarc_api` (`eventarc.googleapis.com`) and `google_project_service.pubsub_api` (`pubsub.googleapis.com`).
    - Create dedicated invoker service account: `google_service_account.eventarc_invoker` with `roles/aiplatform.user` and `roles/eventarc.eventReceiver` project IAM member bindings.
    - If the event source is Cloud Storage (`storage.googleapis.com`), create `google_project_iam_member.gcs_pubsub_publisher` for `data.google_storage_project_service_account.gcs_account`.
    - Create `google_eventarc_trigger` resource matching the configured event:
      * `name`: derive from agent or trigger name (e.g. `"${var.agent_name}-eventarc-trigger"`).
      * `location`: `var.region` (or `eventarcRegion` from trigger config).
      * `matching_criteria`: match the specific selected event (e.g. `attribute = "type"`, `value = "<eventarcEvent>"` e.g. `"google.cloud.dataplex.entry.v1.created"` or `"google.cloud.storage.object.v1.finalized"`). If `eventarcServiceName` is provided, include `matching_criteria { attribute = "serviceName", value = "..." }`.
      * `destination`: `http_endpoint { uri = "https://${var.region}-aiplatform.googleapis.com/v1/projects/${var.project_id}/locations/${var.region}/reasoningEngines/${google_vertex_ai_reasoning_engine.agent_engine.id}:query" }`.
      * `service_account`: `google_service_account.eventarc_invoker.email`.
      * `depends_on`: `[google_project_service.eventarc_api, google_project_iam_member.eventarc_agent_engine_invoker]`.
    - In `Dockerfile`: Run `CMD ["adk", "api_server", "--host=0.0.0.0", "--port=8080", "--trigger_sources", "eventarc", "."]`.
  * **CONDITIONAL Cloud Scheduler (Cron Trigger)**: When the workflow contains a trigger node with `triggerType: "scheduled"` or `"cron"` or `triggerKind: "scheduled"` / `"cron"`:
    - Enable API: `google_project_service.cloudscheduler_api` (`cloudscheduler.googleapis.com`).
    - Create dedicated invoker service account: `google_service_account.scheduler_invoker` with `roles/aiplatform.user` project IAM member binding.
    - Create `google_cloud_scheduler_job` (e.g. `"${var.agent_name}-cron-job"`):
      * `name`: `"${var.agent_name}-schedule"`
      * `schedule`: `"<cronExpression>"` (from trigger config, e.g. `"0 9 * * 1-5"`)
      * `time_zone`: `"<timezone>"` (from trigger config, e.g. `"America/New_York"` or `"UTC"`)
      * `attempt_deadline`: `"320s"`
      * `retry_config`: `retry_count = <retryCount>`
      * `http_target`:
        - `uri`: `"https://${var.region}-aiplatform.googleapis.com/v1/projects/${var.project_id}/locations/${var.region}/reasoningEngines/${google_vertex_ai_reasoning_engine.agent_engine.id}:query"`
        - `http_method`: `"POST"`
        - `body`: `base64encode(jsonencode({ "input" = { "prompt" = "<scheduledPrompt>" } }))`
        - `oidc_token { service_account_email = google_service_account.scheduler_invoker.email }`
      * `depends_on`: `[google_project_service.cloudscheduler_api, google_vertex_ai_reasoning_engine.agent_engine]`
  * **CONDITIONAL Webhook Trigger**: When the workflow contains a trigger node with `triggerType: "webhook"` or `triggerKind: "webhook"`:
    - Because Vertex AI Agent Engine (`:query`) strictly requires Google Cloud IAM authentication that external third-party webhook callers cannot directly generate, provision an HTTP Ingress Gateway:
    - In `main.tf`:
      * Enable APIs: `google_project_service.cloudfunctions_api` (`cloudfunctions.googleapis.com`) and `google_project_service.run_api` (`run.googleapis.com`).
      * Create dedicated gateway service account: `google_service_account.webhook_ingress_sa` with `roles/aiplatform.user` project IAM member binding.
      * If `authType` is not `"none"`, provision `google_secret_manager_secret.webhook_secret` and secret version, granting `roles/secretmanager.secretAccessor` to `google_service_account.webhook_ingress_sa`.
      * Create `google_cloudfunctions2_function.webhook_gateway` (or `google_cloud_run_v2_service` ingress):
        - `name`: `"${var.agent_name}-webhook-gateway"`
        - `location`: `var.region`
        - `service_config`:
          * `service_account_email`: `google_service_account.webhook_ingress_sa.email`
          * `environment_variables`: `PROJECT_ID = var.project_id`, `LOCATION = var.region`, `REASONING_ENGINE_ID = google_vertex_ai_reasoning_engine.agent_engine.id`, `WEBHOOK_PATH = "<webhookPath>"`, `AUTH_TYPE = "<authType>"`, `SECRET_HEADER = "<secretHeaderName>"`.
      * Create `google_cloud_run_v2_service_iam_member.public_webhook` granting `roles/run.invoker` to `allUsers` (or authorized invokers) on the ingress gateway service.
      * Output `webhook_endpoint_url` displaying the public HTTPS URL for external webhook delivery.
    - Generate `webhook_gateway.py`: A lightweight HTTP Cloud Function handler validating the secret header/token, parsing the incoming JSON payload into a prompt, and querying `aiplatform.ReasoningEngine(reasoning_engine_id).query(prompt=prompt)`.

9. `main.tf`: Complete Terraform configuration deploying google_vertex_ai_reasoning_engine with container_spec, Service Account, IAM bindings, and null_resource build_container invoking cloudbuild-buildonly.yaml (including google_secret_manager_secret, secret version, and secretAccessor IAM member when tools require OAuth / Bearer secret tokens; only generate Pub/Sub resources if a pubsub trigger node is present).

## Reference `main.tf`

```hcl
terraform {
  required_version = ">= 1.5.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    null = {
      source  = "hashicorp/null"
      version = "~> 3.2"
    }
  }
}

variable "project_id" {
  type        = string
  description = "Google Cloud Project ID"
}

variable "region" {
  type        = string
  default     = "us-central1"
  description = "Google Cloud Region for regional resources"
}

variable "agent_name" {
  type        = string
  default     = "animal-agent"
  description = "Deployment name for the agent"
}

variable "repo_name" {
  type        = string
  default     = "agents"
  description = "Artifact Registry Docker repository name"
}

variable "image_uri" {
  type        = string
  default     = ""
  description = "Container image URI in Artifact Registry (defaults to latest tag in Artifact Registry)"
}

variable "build_image" {
  type        = bool
  default     = true
  description = "Trigger Cloud Build to build and push container image before creating Reasoning Engine (set false in CI/CD)"
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# --- Service Account & IAM ---
resource "google_service_account" "agent_sa" {
  account_id   = "${substr(replace(var.agent_name, "_", "-"), 0, 26)}-sa"
  display_name = "Service Account for ${var.agent_name}"
}

resource "google_project_iam_member" "vertex_user" {
  project = var.project_id
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:${google_service_account.agent_sa.email}"
}

resource "google_project_iam_member" "log_writer" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.agent_sa.email}"
}

# --- Automated Container Build via Cloud Build ---
resource "null_resource" "build_container" {
  count = var.build_image ? 1 : 0

  triggers = {
    dir_sha1 = sha1(join("", [for f in fileset(path.module, "{*.py,Dockerfile,requirements.txt,cloudbuild-buildonly.yaml}") : filesha1(f)]))
  }

  provisioner "local-exec" {
    command = "gcloud builds submit --config=cloudbuild-buildonly.yaml --substitutions=_PROJECT_ID=${var.project_id},_REGION=${var.region},_REPO=${var.repo_name},_AGENT_NAME=${var.agent_name},SHORT_SHA=tf${substr(self.triggers.dir_sha1, 0, 7)} ."
  }
}

# --- Pub/Sub Trigger Scaffolding (CONDITIONAL: Generate ONLY if a Pub/Sub trigger node is present in the workflow) ---
# When triggerType == "pubsub":
# resource "google_pubsub_topic" "agent_trigger_topic" {
#   name = "${var.agent_name}-triggers"
# }
# resource "google_pubsub_subscription" "agent_trigger_sub" {
#   name                 = "${var.agent_name}-sub"
#   topic                = google_pubsub_topic.agent_trigger_topic.id
#   ack_deadline_seconds = 60
# }
# resource "google_project_iam_member" "pubsub_subscriber" {
#   project = var.project_id
#   role    = "roles/pubsub.subscriber"
#   member  = "serviceAccount:${google_service_account.agent_sa.email}"
# }

# --- Google Workspace Remote MCP APIs (CONDITIONAL: Generate when workspaceConfig tools are present) ---
# Whenever any agent uses a Google Workspace Remote MCP tool (workspaceConfig), main.tf MUST include
# google_project_service resources enabling BOTH companionRestApi and mcpServiceName:
# resource "google_project_service" "workspace_rest_api" {
#   project            = var.project_id
#   service            = "<companionRestApi>" # e.g. "gmail.googleapis.com"
#   disable_on_destroy = false
# }
# resource "google_project_service" "workspace_mcp_service" {
#   project            = var.project_id
#   service            = "<mcpServiceName>" # e.g. "gmailmcp.googleapis.com"
#   disable_on_destroy = false
# }

# --- Vertex AI Reasoning Engine Deployment ---
resource "google_vertex_ai_reasoning_engine" "agent" {
  depends_on   = [null_resource.build_container]
  display_name = var.agent_name
  description  = "Vertex AI Reasoning Engine for ${var.agent_name} managed by Terraform."
  project      = var.project_id
  location     = var.region

  spec {
    agent_framework = "google-adk"
    service_account = google_service_account.agent_sa.email
    container_spec {
      image_uri = var.image_uri != "" ? var.image_uri : "${var.region}-docker.pkg.dev/${var.project_id}/${var.repo_name}/${var.agent_name}:latest"
    }
  }

  lifecycle {
    ignore_changes = [
      spec[0].container_spec[0].image_uri,
    ]
  }
}
```
