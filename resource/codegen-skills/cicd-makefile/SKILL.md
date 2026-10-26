---
name: cicd-makefile
description: "Shared Makefile and Cloud Build conventions plus the Make targets identical across targets (install, test, eval, setup-gateway); required by the infra agent."
metadata:
  usedBy: [generator, reviewer]
  targets: [all]
---

# Makefile & Cloud Build: Shared Rules

The `Makefile` is the standardized, self-contained CLI & CI/CD automation entrypoint (used directly by both the VS Code "Deploy" button and terminal/CI users). Target-specific targets (`dev`, `infra`, `deploy`, `register-agent`, `publish-gemini-enterprise`) and pipelines live in `cicd-cloudrun` / `cicd-agent-engine`.

## General Rules
- Declare every variable with an overrideable default (`VAR ?= value`) at the top of the Makefile.
- In Makefile recipes, always double-quote make variable expansions passed to shell/CLI commands.
- Recipes must use TAB indentation.
- Every file referenced by a recipe (`test_agent.py`, `evaluate.py`, `eval_dataset.jsonl`, `cloudbuild.yaml`) must be part of the generated repository.

## Shared Make Targets (identical for every target)

* `make install`: `python3 -m venv .venv && .venv/bin/pip install --upgrade pip -r requirements.txt`

* `make test`: `@test -x .venv/bin/pytest || $(MAKE) install` followed by `.venv/bin/pytest test_agent.py -v`
* `make eval`: `@test -x .venv/bin/python || $(MAKE) install` followed by `.venv/bin/python evaluate.py --project=$(PROJECT_ID) --location=$(REGION) --dataset=eval_dataset.jsonl`

* `make setup-gateway`: Provisions the Model Armor template (`POST https://modelarmor.$(REGION).rep.googleapis.com/v1/projects/$(PROJECT_ID)/locations/$(REGION)/templates?templateId=$(MODEL_ARMOR_TEMPLATE)`), creates or updates the Shared Regional Agent Gateway (`POST https://networkservices.googleapis.com/v1alpha1/projects/$(PROJECT_ID)/locations/$(REGION)/agentGateways?agentGatewayId=$(GATEWAY_ID)` with `googleManaged.governedAccessPath = "AGENT_TO_ANYWHERE"`, `protocols = ["MCP"]`, and `registries = ["//agentregistry.googleapis.com/projects/$(PROJECT_ID)/locations/$(REGION)"]`), and binds IAP (`REQUEST_AUTHZ`) + Model Armor AI Security (`CONTENT_AUTHZ`) `authzExtensions` (`networkservices.googleapis.com/v1beta1`) and `authzPolicies` (`networksecurity.googleapis.com/v1beta1`).
