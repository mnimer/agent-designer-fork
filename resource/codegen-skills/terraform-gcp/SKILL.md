---
name: terraform-gcp
description: "Shared Terraform rules for every target: Terraform-only provisioning, manifest-driven APIs/IAM/secrets, least privilege, Secret Manager for tool tokens, and Google Workspace remote MCP API enablement; required by the infra agent."
metadata:
  usedBy: [generator, reviewer]
  targets: [all]
---

# Terraform on Google Cloud: Shared Rules

These rules apply to every deployment target. Target-specific resources live in `terraform-cloudrun` / `terraform-agent-engine`.

## General Rules
- Project configuration must be 100% deployed with Terraform (`main.tf`, `variables.tf`, `outputs.tf`, `terraform.tfvars`). Never hardcode secrets or keys; use Terraform variables and Secret Manager for sensitive values.
- Use the environment variables, Google Cloud services, IAM roles, secrets, and triggers the generated code actually needs to decide which APIs, IAM bindings, secrets, and trigger resources to provision. Only provision trigger resources for triggers that exist in the blueprint.
- Every variable passed by the `Makefile` (`make infra` `-var=...` flags) MUST be declared in Terraform.
- Grant least-privilege IAM only: dedicated service accounts, never grant broad roles or `allUsers` unless the blueprint explicitly requires public access.
- When tools require OAuth / Bearer secret tokens (e.g. `DATABRICKS_TOKEN`, `SNOWFLAKE_MCP_TOKEN`, webhook secrets), provision `google_secret_manager_secret` + a secret version and grant `roles/secretmanager.secretAccessor` to the runtime service account.

## Google Workspace Remote MCP Servers (both targets)

* **CONDITIONAL Google Workspace Remote MCP Servers**: When the workflow contains any tool with `category: "google_workspace_mcp"` or `workspaceConfig`:
  - In `main.tf`, MUST include `google_project_service` resources enabling BOTH the base Workspace REST API (`workspaceConfig.companionRestApi`, e.g., `gmail.googleapis.com`, `drive.googleapis.com`, `calendar-json.googleapis.com`) AND the companion MCP service (`workspaceConfig.mcpServiceName`, e.g., `gmailmcp.googleapis.com`, `drivemcp.googleapis.com`, `calendarmcp.googleapis.com`) with `disable_on_destroy = false`.
