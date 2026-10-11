"""
Domain Governance, IAM, Scoped Discovery & Teardown Toolset for Google ADK

Purpose:
Provides access control (IAM), scoped semantic search within domain contexts,
and safe cascading teardowns of Dataplex Data Domains in Google Cloud Knowledge Catalog.

Architectural Decisions:
- Author: Steve Thill <stevethill@google.com>
- Implements Dataplex domain IAM management for predefined roles:
  roles/dataplex.dataDomainAdmin, dataDomainEditor, dataDomainViewer, dataDomainEntryReader.
- Implements scoped semantic search constrained to domain resource contexts.
- Implements 'cascading_teardown_domain' to handle Dataplex's strict deletion prerequisites:
  unbind all resources -> delete all child subdomains -> delete parent domain.
"""

import sys
import logging
from typing import Any, Dict, List, Optional
import requests
import google.auth
from google.auth.transport.requests import Request
from .dataplex_toolset import delete_domain, list_subdomains
from .binding_toolset import list_bindings, unbind_resource

logger = logging.getLogger("kc-domain-agent.governance-tools")

TIMEOUT_SECONDS = 30
DATAPLEX_API_BASE = "https://dataplex.googleapis.com/v1"


def get_credentials() -> google.auth.credentials.Credentials:
    """Retrieves Google Cloud credentials using Application Default Credentials (ADC)."""
    creds, _ = google.auth.default(
        scopes=["https://www.googleapis.com/auth/cloud-platform"]
    )
    if not creds.valid:
        creds.refresh(Request())
    return creds


def handle_response(response: requests.Response) -> Dict[str, Any]:
    """Handles HTTP responses uniformly across Dataplex REST endpoints."""
    try:
        response.raise_for_status()
        if response.status_code == 204:
            return {"status": "ok", "message": "Operation completed successfully"}
        return {"status": "ok", "data": response.json()}
    except requests.exceptions.HTTPError as err:
        err_msg = ""
        try:
            err_json = response.json()
            err_msg = err_json.get("error", {}).get("message", response.text)
        except Exception:
            err_msg = response.text or str(err)
        sys.stderr.write(f"\n[DATAPLEX GOVERNANCE ERROR {response.status_code}] {err_msg}\n")
        sys.stderr.flush()
        logger.error("HTTP Error %s: %s", response.status_code, err_msg)
        raise RuntimeError(f"Dataplex Governance API Error ({response.status_code}): {err_msg}")
    except Exception as err:
        sys.stderr.write(f"\n[DATAPLEX GOVERNANCE UNEXPECTED ERROR] {err}\n")
        sys.stderr.flush()
        logger.error("Unexpected error: %s", str(err))
        raise RuntimeError(f"Dataplex Governance Unexpected Error: {err}")


# ==============================================================================
# 1. Domain IAM Policy Management
# ==============================================================================

def validate_param(param_name: str, value: Any, prompt: str) -> Optional[Dict[str, Any]]:
    """Validates that a required tool argument is non-empty and not a placeholder."""
    if value is None:
        return {
            "status": "error",
            "message": f"Missing required parameter '{param_name}'. Please ask the user: {prompt}",
        }
    val_str = str(value).strip().lower()
    if (
        not val_str
        or val_str in ("none", "null", "undefined")
        or (val_str.startswith("{") and val_str.endswith("}"))
        or (val_str.startswith("<") and val_str.endswith(">"))
    ):
        return {
            "status": "error",
            "message": f"Missing required parameter '{param_name}'. Please ask the user: {prompt}",
        }
    return None


def get_iam_policy(
    project_id: str,
    location: str,
    domain_id: str,
) -> Dict[str, Any]:
    """
    Retrieves the IAM access control policy for a Dataplex Data Domain.

    Args:
        project_id: Google Cloud project ID.
        location: Region identifier.
        domain_id: Target domain identifier.

    Returns:
        Current IAM policy bindings for the domain.
    """
    # Section 0: Validate required parameters
    err = validate_param("project_id", project_id, "Please provide the GCP Project ID.")
    if err:
        return err
    err = validate_param("location", location, "Please provide the GCP location/region.")
    if err:
        return err
    err = validate_param("domain_id", domain_id, "Please provide the target domain ID.")
    if err:
        return err

    # Section 1: Query getIamPolicy endpoint
    creds = get_credentials()
    url = (
        f"{DATAPLEX_API_BASE}/projects/{project_id}/locations/{location}"
        f"/dataDomains/{domain_id}:getIamPolicy"
    )
    headers = {"Authorization": f"Bearer {creds.token}"}

    response = requests.get(url, headers=headers, timeout=TIMEOUT_SECONDS)
    return handle_response(response)


def set_iam_policy(
    project_id: str,
    location: str,
    domain_id: str,
    policy: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Sets or replaces the entire IAM access policy on a domain.

    Args:
        project_id: Google Cloud project ID.
        location: Region identifier.
        domain_id: Target domain identifier.
        policy: IAM policy dictionary containing bindings list.

    Returns:
        Updated IAM policy definition.
    """
    # Section 0: Validate required parameters
    err = validate_param("project_id", project_id, "Please provide the GCP Project ID.")
    if err:
        return err
    err = validate_param("location", location, "Please provide the GCP location/region.")
    if err:
        return err
    err = validate_param("domain_id", domain_id, "Please provide the target domain ID.")
    if err:
        return err

    # Section 1: Post setIamPolicy payload
    creds = get_credentials()
    url = (
        f"{DATAPLEX_API_BASE}/projects/{project_id}/locations/{location}"
        f"/dataDomains/{domain_id}:setIamPolicy"
    )
    headers = {
        "Authorization": f"Bearer {creds.token}",
        "Content-Type": "application/json",
    }
    payload = {"policy": policy}

    response = requests.post(url, headers=headers, json=payload, timeout=TIMEOUT_SECONDS)
    return handle_response(response)


def add_iam_member(
    project_id: str,
    location: str,
    domain_id: str,
    role: str,
    member: str,
) -> Dict[str, Any]:
    """
    Grants a specific IAM role on a domain to a user, group, or service account.

    Supported Roles:
      - 'roles/dataplex.dataDomainAdmin'
      - 'roles/dataplex.dataDomainEditor'
      - 'roles/dataplex.dataDomainViewer'
      - 'roles/dataplex.dataDomainEntryReader'

    Args:
        project_id: Google Cloud project ID.
        location: Region identifier.
        domain_id: Target domain identifier.
        role: Predefined or custom Dataplex role.
        member: Member specification (e.g. 'user:alice@example.com', 'group:data-analysts@example.com').

    Returns:
        Updated policy bindings.
    """
    # Section 0: Validate required parameters
    err = validate_param("project_id", project_id, "Please provide the GCP Project ID.")
    if err:
        return err
    err = validate_param("location", location, "Please provide the GCP location/region.")
    if err:
        return err
    err = validate_param("domain_id", domain_id, "Please provide the target domain ID.")
    if err:
        return err
    err = validate_param("role", role, "Please provide the IAM role to grant.")
    if err:
        return err
    err = validate_param("member", member, "Please provide the user or group identity (e.g. 'user:name@example.com').")
    if err:
        return err

    # Section 1: Fetch current policy
    cur_policy_resp = get_iam_policy(project_id, location, domain_id)
    if cur_policy_resp.get("status") != "ok":
        return cur_policy_resp

    policy = cur_policy_resp.get("data", {})
    bindings = policy.get("bindings", [])

    # Section 2: Update or append role binding
    role_binding = next((b for b in bindings if b.get("role") == role), None)
    if role_binding:
        if member in role_binding.get("members", []):
            return {"status": "ok", "message": f"Member '{member}' already holds role '{role}' on domain '{domain_id}'."}
        role_binding.setdefault("members", []).append(member)
    else:
        bindings.append({
            "role": role,
            "members": [member],
        })

    policy["bindings"] = bindings

    # Section 3: Commit updated policy
    return set_iam_policy(project_id, location, domain_id, policy)


# ==============================================================================
# 2. Scoped Discovery & Semantic Search
# ==============================================================================

def search_entries(
    project_id: str,
    location: str,
    domain_id: str,
    query: str,
    semantic_search: bool = True,
    page_size: int = 50,
) -> Dict[str, Any]:
    """
    Performs scoped search across Knowledge Catalog entries constrained to a specific domain context.

    Args:
        project_id: Google Cloud project ID.
        location: Region identifier.
        domain_id: Target domain identifier.
        query: Natural language query or business concept (e.g. 'customer orders', 'churn prediction').
        semantic_search: Whether to execute AI-assisted semantic search (default: True).
        page_size: Maximum entries to return (default: 50).

    Returns:
        List of matching catalog entries strictly within the domain boundary.
    """
    # Section 0: Validate required parameters
    err = validate_param("project_id", project_id, "Please provide the GCP Project ID.")
    if err:
        return err
    err = validate_param("location", location, "Please provide the GCP location/region.")
    if err:
        return err
    err = validate_param("domain_id", domain_id, "Please provide the target domain ID.")
    if err:
        return err
    err = validate_param("query", query, "Please provide the search query.")
    if err:
        return err

    # Section 1: Prepare search payload with domain context restriction
    creds = get_credentials()
    url = f"{DATAPLEX_API_BASE}/projects/{project_id}/locations/{location}:searchEntries"
    headers = {
        "Authorization": f"Bearer {creds.token}",
        "Content-Type": "application/json",
    }
    payload = {
        "query": query,
        "contexts": [
            f"projects/{project_id}/locations/{location}/dataDomains/{domain_id}"
        ],
        "semantic_search": semantic_search,
        "page_size": page_size,
    }

    # Section 2: Execute search query
    response = requests.post(url, headers=headers, json=payload, timeout=TIMEOUT_SECONDS)
    return handle_response(response)


# ==============================================================================
# 3. Cascading Safe Teardown Helper
# ==============================================================================

def cascading_teardown_domain(
    project_id: str,
    location: str,
    domain_id: str,
) -> Dict[str, Any]:
    """
    Safely tears down a domain by first unbinding all its resources, recursively tearing down
    any child subdomains, and finally deleting the domain itself.

    Args:
        project_id: Google Cloud project ID.
        location: Region identifier.
        domain_id: Domain or subdomain identifier to delete.

    Returns:
        Summary of actions taken (unbound resources, deleted subdomains, deleted domain).
    """
    # Section 0: Validate required parameters
    err = validate_param("project_id", project_id, "Please provide the GCP Project ID.")
    if err:
        return err
    err = validate_param("location", location, "Please provide the GCP location/region.")
    if err:
        return err
    err = validate_param("domain_id", domain_id, "Please provide the domain ID to tear down.")
    if err:
        return err

    summary = {
        "domain_id": domain_id,
        "unbound_resources": [],
        "deleted_subdomains": [],
        "deleted": False,
    }

    # Section 1: Unbind all resources attached directly to this domain
    b_resp = list_bindings(project_id, location, domain_id)
    if b_resp.get("status") == "ok":
        bindings = b_resp.get("data", {}).get("dataDomainBindings", [])
        for b in bindings:
            binding_name = b.get("name", "")
            b_id = binding_name.split("/")[-1] if "/" in binding_name else binding_name
            try:
                unbind_resource(project_id, location, domain_id, b_id)
                summary["unbound_resources"].append(b_id)
            except RuntimeError as err:
                raise RuntimeError(f"Failed to unbind '{b_id}' on domain '{domain_id}': {err}")

    # Section 2: Discover and recursively tear down any child subdomains
    sub_resp = list_subdomains(project_id, location, domain_id)
    if sub_resp.get("status") == "ok":
        subdomains = sub_resp.get("data", {}).get("subdomains", [])
        for sub in subdomains:
            sub_name = sub.get("name", "")
            sub_id = sub_name.split("/")[-1] if "/" in sub_name else sub_name
            child_teardown = cascading_teardown_domain(project_id, location, sub_id)
            summary["deleted_subdomains"].append(child_teardown)

    # Section 3: Delete the now-empty domain
    try:
        delete_domain(project_id, location, domain_id)
        summary["deleted"] = True
        return {"status": "ok", "message": f"Successfully tore down domain '{domain_id}' and all dependencies.", "data": summary}
    except RuntimeError as err:
        raise RuntimeError(f"Failed to delete domain '{domain_id}': {err}")

