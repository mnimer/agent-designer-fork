---
name: readme
description: "README.md content and structure requirements for the generated repository, per deployment target."
metadata:
  usedBy: [generator, reviewer]
  targets: [all]
---

# README.md Generation

Write `README.md` for the generated repository. Base it on the blueprint JSON and the actual generated files (Makefile targets, Terraform resources, endpoints) — never document commands, targets, or files that do not exist.

## Required README Content (per deployment target)

### Cloud Run

- `README.md`: Architecture overview, local execution (`make install && make dev`), unit testing (`make test`), Terraform provisioning (`make infra`), and standalone CLI / CI/CD deployment (`make deploy`).

### Agent Runtime (Agent Engine)

- `README.md`: Architecture overview, local execution via `make install && make dev`, unit testing via `make test`, Terraform provisioning via `make infra` (initial Day 0 setup: `terraform init && terraform apply`), standalone CLI deployment via `make deploy`, and Cloud Build CI/CD deployment instructions.

## Recommended Structure
1. Title and one-paragraph purpose of the agent (from the root agent's `description` / `systemPrompt`, without leaking test scenarios).
2. Architecture overview: the agent hierarchy (root agent, sub-agents, orchestration pattern), tools, session store backend, and triggers. A Mermaid diagram is encouraged.
3. Repository layout: one line per generated file.
4. Prerequisites and configuration: required environment variables (from `.env.example`), `gcloud auth application-default login`, and the `global` Vertex AI location requirement for `gemini-3.8-flash`.
5. Local execution, unit testing, evaluation, Terraform provisioning, and deployment using the target's Makefile targets.
6. CI/CD (Cloud Build) usage and enterprise governance targets (`register-agent`, `setup-gateway`, `publish-gemini-enterprise`) when present in the Makefile.
