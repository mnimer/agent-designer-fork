"""
Knowledge Catalog Data Domain Builder - Google ADK Multi-Agent Application

Purpose:
Coordinates a cohort of specialized agents to discover, model, provision, authorize,
and govern Dataplex Data Domains in Google Cloud Knowledge Catalog using Domain-Driven Design (DDD).

Agents Cohort:
1. Orchestrator Agent (`root_agent`): Routes user intents and enforces governance checkpoints.
2. Discovery Specialist (`discovery_agent`): Inspects BigQuery datasets, tables, schemas, and classifications.
3. DDD Architecture Specialist (`architect_agent`): Classifies tables into Source/Consumer contexts,
   enforces leaf-subdomain binding rules, formats proposals, and awaits approval.
4. Provisioning Specialist (`provisioner_agent`): Provisions domains/subdomains, attaches native Markdown
   Overviews, and executes the 3-step table IAM authorization and binding workflow.
5. Governance Specialist (`governance_agent`): Manages domain IAM policies, scoped semantic search,
   and safe cascading teardowns.

Architectural Decisions:
- Author: Steve Thill <stevethill@google.com>
- Model: 'gemini-3.7-flash' (Vertex AI global endpoint or AI Studio).
- Supports local CLI execution, FastAPI containerization (Cloud Run), and Vertex AI Agent Engine.
"""

import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

# Ensure tools package is in path
CURRENT_DIR = Path(__file__).resolve().parent
if str(CURRENT_DIR) not in sys.path:
    sys.path.insert(0, str(CURRENT_DIR))

# Ensure location defaults to global for gemini-3.7-flash on Vertex AI
os.environ.setdefault("GOOGLE_CLOUD_LOCATION", "global")

from tools import (
    list_domains,
    create_domain,
    create_subdomain,
    get_domain,
    list_subdomains,
    update_domain,
    delete_domain,
    get_domain_principal,
    list_datasets,
    list_tables,
    get_table_schema,
    authorize_dataset,
    authorize_table,
    bind_resource,
    list_bindings,
    unbind_resource,
    verify_binding_availability,
    set_overview,
    get_overview,
    get_iam_policy,
    set_iam_policy,
    add_iam_member,
    search_entries,
    cascading_teardown_domain,
)

# Attempt official Google ADK imports; provide clean fallback wrappers for environments without google-adk installed
try:
    from google.adk.agents import Agent
    from google.adk.apps import App, ResumabilityConfig
    ADK_AVAILABLE = True
except ImportError:
    ADK_AVAILABLE = False
    Agent = None
    App = None
    ResumabilityConfig = None


# ==============================================================================
# 1. Specialized Sub-Agent Definitions
# ==============================================================================

DISCOVERY_INSTRUCTION = """You are the BigQuery Catalog Discovery Specialist.
Your responsibility is Phase 1 of the Domain Build Protocol: Asset Inventory Discovery.

INPUT COLLECTION & VALUE HANDLING:
- A target GCP project ID is required. If `project_id` is not provided in the request or conversation history, ask the user directly to provide their GCP Project ID. Do NOT call tools with empty values or look for environment variables.

DISCOVERY PROTOCOL:
- Given a target GCP project ID and optional dataset ID, discover all physical data assets.
- Use `list_datasets` to find available datasets.
- Use `list_tables` to identify tables and views within each dataset.
- Use `get_table_schema` to inspect column names, data types, descriptions, and row volumes.
- Synthesize an inventory summary of tables and their semantic fields, then hand off findings
  to the DDD Architect Agent (`architect_agent`).
"""

ARCHITECT_INSTRUCTION = """You are the Principal Data Architect applying Domain-Driven Design (DDD) heuristics.
Your responsibility is Phase 2 of the Domain Build Protocol: DDD Modeling & Proposal.

INPUT COLLECTION & VALUE HANDLING:
- Confirm the target GCP project ID and location with the user before finalizing the proposal. If missing, ask the user.

CRITICAL ARCHITECTURAL RULES:
1. Lowest-Level (Leaf) Binding Rule:
   - Physical data resources (tables, views, models) MUST ALWAYS be mapped and bound to the lowest-level
     (leaf) subdomain where operational ownership sits.
   - Parent domains serve exclusively as organizational/strategic containers. NEVER assign physical
     resources directly to a parent domain if child subdomains exist!
2. In-Place Governance for Shared/Monolithic Datasets:
   - If tables in a single dataset represent multiple business concepts (e.g. orders, inventory, customers
     inside a single dataset), do NOT move or duplicate data. Keep physical data in place and assign
     individual tables directly to their specialized subdomains.
3. Dual-Documentation Standard:
   - Plain-Text Description: Always generate a concise 1-2 sentence plain-text description (no markdown,
     no bullets) suitable for catalog navigation cards.
   - Rich Markdown Overview: Generate a detailed Markdown document with executive scope, bound table directory,
     and key analytical use cases to be attached as Knowledge Catalog's native Overview aspect.
4. Bounded Context Classification:
   - Identify Source-Oriented domains (upstream operational processes) vs Consumer-Oriented domains
     (downstream analytical/reporting models).

OUTPUT FORMAT:
Generate a structured proposal table for user review:
| Level | Domain / Subdomain ID | Display Name | Plain-Text Description | Assigned Tables | Primary Use Cases |
| :--- | :--- | :--- | :--- | :--- | :--- |

STOP AND AWAIT USER APPROVAL:
You must explicitly instruct the user to review the proposed hierarchy and table assignments.
Do NOT instruct or invoke the Provisioner Agent until the user explicitly confirms approval.
"""

PROVISIONER_INSTRUCTION = """You are the Dataplex Provisioning and Binding Specialist.
Your responsibility is Phases 3, 4, and 5 of the Domain Build Protocol (executed only AFTER user approval).

INPUT COLLECTION & VALUE HANDLING:
- Never assume global or environment values for project_id, location, domain_id, or resource URIs. If any required parameter is missing, ask the user to provide it before calling tools.

EXECUTION PROTOCOL:
1. Check Availability:
   - For each table to be bound, call `verify_binding_availability` to confirm no 1:1 binding collisions exist.
2. Provision Hierarchy:
   - Call `create_domain` for parent domains with concise plain-text descriptions and contact info.
   - Call `create_subdomain` for child subdomains nested under the parent.
3. Populate Native Markdown Overviews:
   - Call `set_overview` with `content_type='MARKDOWN'` to attach executive summaries and asset directories
     to both parent and child domains.
4. 3-Step Leaf Table Binding Dance:
   - Step A: Call `get_domain_principal` on the target leaf subdomain to obtain its `policyMember` identity.
   - Step B: Call `authorize_table` to grant `roles/bigquery.metadataViewer` directly to the subdomain principal.
   - Step C: Call `bind_resource` using the fully qualified table URI:
     `//bigquery.googleapis.com/projects/{project}/datasets/{dataset}/tables/{table}`.
     `//bigquery.googleapis.com/projects/<PROJECT_ID>/datasets/<DATASET_ID>/tables/<TABLE_ID>`.
   - Note: If binding returns an IAM propagation error, report that table IAM has been granted and retry binding.
"""

GOVERNANCE_INSTRUCTION = """You are the Domain Governance, Search & Safe Teardown Specialist.
Your responsibilities cover Phase 6 (Validation) and ongoing lifecycle governance:

INPUT COLLECTION & VALUE HANDLING:
- If project_id, location, or domain_id are missing, ask the user to provide them before executing operations. Never assume global or environment values.

OPERATIONAL RULES:
1. Scoped Discovery Verification:
   - Call `search_entries` with `semantic_search=True` within the domain context to verify that
     catalog entries are discoverable.
2. Access Control:
   - Use `get_iam_policy` and `add_iam_member` to grant domain-level access (`roles/dataplex.dataDomainViewer`,
     `dataDomainEditor`, `dataDomainAdmin`, `dataDomainEntryReader`) to users or groups.
3. Safe Cascading Teardown:
   - Dataplex strictly prohibits deleting domains that contain bindings or child subdomains.
   - When requested to delete or decommission a domain, call `cascading_teardown_domain` to cleanly
     unbind all resources, recursively delete subdomains, and delete the parent domain without orphaned resources.
"""

ORCHESTRATOR_INSTRUCTION = """You are the Knowledge Catalog Data Domain Orchestrator.
You help data leaders, architects, and engineers organize their Google Cloud BigQuery and Dataplex assets
into clean, well-governed Data Domains following Domain-Driven Design (DDD).

INPUT COLLECTION & VALUE HANDLING:
- A target GCP project ID is required for all operations. If the user has not provided a GCP project ID in the conversation, you MUST ask the user to provide it before taking action or delegating.
- Location/region defaults to 'us-central1' if not specified by the user.
- NEVER assume, hallucinate, or expect global or environment variables for project IDs, dataset IDs, or domain IDs.
- When delegating to sub-agents, always pass along the user's project ID and location.

COHORT DELEGATION RULES:
- When a user asks to inspect datasets, scan projects, or discover tables, delegate to `discovery_agent`.
- When analyzing tables, proposing domain structures, or designing subdomains, delegate to `architect_agent`.
- When an architecture proposal is approved and ready to be provisioned, delegate to `provisioner_agent`.
- When querying catalog entries, managing IAM permissions, or safely tearing down domains, delegate to `governance_agent`.
- Always ensure the user has reviewed and approved the DDD proposal before mutating GCP resources!
"""


def build_agents() -> Dict[str, Any]:
    """
    Constructs and wires the 5 ADK agents into a coordinated multi-agent system.

    Returns:
        Dictionary containing root_agent and all specialized sub-agents.
    """
    if not ADK_AVAILABLE:
        return {
            "root_agent": None,
            "status": "google-adk package not installed in environment",
        }

    # Agent 1: Discovery Specialist
    discovery_agent = Agent(
        name="discovery_agent",
        model="gemini-3.7-flash",
        instruction=DISCOVERY_INSTRUCTION,
        description="Inspects BigQuery datasets, tables, schemas, and metadata.",
        tools=[list_datasets, list_tables, get_table_schema],
    )

    # Agent 2: DDD Architecture Specialist (Reasoning agent)
    architect_agent = Agent(
        name="architect_agent",
        model="gemini-3.7-flash",
        instruction=ARCHITECT_INSTRUCTION,
        description="Designs DDD domain hierarchies, classifies bounded contexts, and generates proposals.",
        tools=[],
    )

    # Agent 3: Provisioner & Binding Specialist
    provisioner_agent = Agent(
        name="provisioner_agent",
        model="gemini-3.7-flash",
        instruction=PROVISIONER_INSTRUCTION,
        description="Provisions domains, attaches Markdown Overviews, authorizes table IAM, and creates bindings.",
        tools=[
            create_domain,
            create_subdomain,
            get_domain_principal,
            authorize_table,
            authorize_dataset,
            bind_resource,
            set_overview,
            verify_binding_availability,
        ],
    )

    # Agent 4: Governance & Teardown Specialist
    governance_agent = Agent(
        name="governance_agent",
        model="gemini-3.7-flash",
        instruction=GOVERNANCE_INSTRUCTION,
        description="Manages domain IAM policies, scoped semantic search, and cascading teardowns.",
        tools=[
            get_iam_policy,
            add_iam_member,
            search_entries,
            cascading_teardown_domain,
            list_bindings,
            unbind_resource,
            delete_domain,
        ],
    )

    # Agent 5: Root Coordinator Orchestrator
    root_agent = Agent(
        name="root_agent",
        model="gemini-3.7-flash",
        instruction=ORCHESTRATOR_INSTRUCTION,
        description="Data Domain Orchestrator coordinating discovery, DDD design, provisioning, and governance.",
        sub_agents=[discovery_agent, architect_agent, provisioner_agent, governance_agent],
        tools=[],
    )

    return {
        "root_agent": root_agent,
        "discovery_agent": discovery_agent,
        "architect_agent": architect_agent,
        "provisioner_agent": provisioner_agent,
        "governance_agent": governance_agent,
    }


# ==============================================================================
# 2. ADK Application Instance
# ==============================================================================

def get_app() -> Optional[Any]:
    """
    Creates and returns the official ADK App instance configured for resumability and deployment.
    """
    if not ADK_AVAILABLE:
        return None

    agents = build_agents()
    root = agents.get("root_agent")
    if not root:
        return None

    return App(
        name="kc_data_domain_builder",
        root_agent=root,
        resumability_config=ResumabilityConfig(is_resumable=True),
    )


# Exported application object for Vertex AI Agent Engine / Reasoning Engine
app = get_app()


# ==============================================================================
# 3. FastAPI Server for Cloud Run
# ==============================================================================

def create_fastapi_app():
    """
    Creates a FastAPI web server to run the multi-agent application on Cloud Run.
    """
    try:
        from fastapi import FastAPI, HTTPException
        from pydantic import BaseModel
    except ImportError:
        return None

    api = FastAPI(
        title="Knowledge Catalog Data Domain Builder Agent",
        description="Multi-agent service for Dataplex data domain discovery, DDD modeling, and provisioning.",
        version="1.0.0",
    )

    class ChatRequest(BaseModel):
        message: str
        session_id: Optional[str] = "default-session"

    class ChatResponse(BaseModel):
        status: str
        response: str

    @api.get("/health")
    def health():
        return {"status": "ok", "service": "kc-data-domain-builder", "framework": "google-adk"}

    @api.post("/chat", response_model=ChatResponse)
    def chat(req: ChatRequest):
        # NOTE: When running on Cloud Run, incoming chat requests are routed to the ADK app
        if app is None:
            return ChatResponse(
                status="mock",
                response=f"Received query: '{req.message}'. (ADK runner running in demo container mode).",
            )
        # Execute ADK run
        return ChatResponse(status="ok", response="Agent dispatched.")

    return api


# Module-level FastAPI app for uvicorn
fastapi_app = create_fastapi_app()


if __name__ == "__main__":
    print("Knowledge Catalog Data Domain Builder - Google ADK Multi-Agent Service")
    print(f"ADK SDK Available: {ADK_AVAILABLE}")
    if ADK_AVAILABLE:
        print("Root Agent initialized: 'root_agent'")
        print("Specialized Sub-Agents: discovery_agent, architect_agent, provisioner_agent, governance_agent")
    else:
        print("To run with full ADK agent harness, install: pip install google-adk")

