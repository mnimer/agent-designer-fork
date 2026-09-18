"""
Resource Binding & Exclusivity Verification Toolset for Google ADK

Purpose:
Manages Dataplex Data Domain resource bindings, unbindings, and pre-flight
exclusivity checks to prevent 1:1 binding collisions.

Architectural Decisions:
- Author: Steve Thill <stevethill@google.com>
- Strictly enforces Dataplex 1:1 resource binding exclusivity: a resource URI
  (BigQuery dataset or table) can only belong to ONE domain.
- Provides 'verify_binding_availability' to check across all domains in the project/region
  before attempting mutation, failing fast rather than encountering cryptic API errors.
"""

import logging
from typing import Any, Dict, List, Optional
import requests
import google.auth
from google.auth.transport.requests import Request

logger = logging.getLogger("kc-domain-agent.binding-tools")

TIMEOUT_SECONDS = 30
DATAPLEX_API_BASE = "https://dataplex.googleapis.com/v1"


def get_credentials() -> google.auth.credentials.Credentials:
    """
    Retrieves Google Cloud credentials using Application Default Credentials (ADC).

    Returns:
        A valid google.auth credentials object refreshed if necessary.
    """
    # Section 1: Obtain ADC credentials
    creds, _ = google.auth.default(
        scopes=["https://www.googleapis.com/auth/cloud-platform"]
    )
    if not creds.valid:
        creds.refresh(Request())
    return creds


def handle_response(response: requests.Response) -> Dict[str, Any]:
    """
    Handles HTTP responses uniformly across Dataplex REST endpoints.

    Args:
        response: The requests Response object.

    Returns:
        A dictionary with 'status' and either 'data' or error 'message'.
    """
    # Section 1: Uniformly parse HTTP responses
    try:
        response.raise_for_status()
        if response.status_code == 204:
            return {"status": "ok", "message": "Binding removed successfully"}
        return {"status": "ok", "data": response.json()}
    except requests.exceptions.HTTPError as err:
        logger.error("HTTP Error %s: %s", response.status_code, response.text)
        try:
            err_json = response.json()
            message = err_json.get("error", {}).get("message", str(err))
        except Exception:
            message = response.text or str(err)
        return {"status": "error", "message": message, "code": response.status_code}
    except Exception as err:
        logger.error("Unexpected error: %s", str(err))
        return {"status": "error", "message": str(err)}


def validate_param(param_name: str, value: Any, prompt: str) -> Optional[Dict[str, Any]]:
    """Validates that a required tool argument is non-empty and not a placeholder."""
    if (
        value is None
        or not str(value).strip()
        or str(value).strip().lower() in (
            "none", "null",
            f"<{param_name.lower()}>", f"<{param_name.upper()}>",
            f"{{{param_name.lower()}}}", f"{{{param_name.upper()}}}"
        )
    ):
        return {
            "status": "error",
            "message": f"Missing required parameter '{param_name}'. Please ask the user: {prompt}",
        }
    return None


def bind_resource(
    project_id: str,
    location: str,
    domain_id: str,
    binding_id: str,
    resource: str,
) -> Dict[str, Any]:
    """
    Binds an authorized physical resource (BigQuery table or dataset) to a domain or subdomain.

    Args:
        project_id: Google Cloud project ID.
        location: Region identifier (e.g. 'us-central1').
        domain_id: Target domain or subdomain identifier.
        binding_id: Unique identifier for this binding (e.g. 'customers-table-binding').
        resource: Fully qualified resource URI:
          - BigQuery Table: '//bigquery.googleapis.com/projects/{P}/datasets/{D}/tables/{T}'
          - BigQuery Dataset: '//bigquery.googleapis.com/projects/{P}/datasets/{D}'

    Returns:
        Created binding metadata or error details.
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
    err = validate_param("binding_id", binding_id, "Please provide a unique binding ID.")
    if err:
        return err
    err = validate_param("resource", resource, "Please provide the fully qualified resource URI.")
    if err:
        return err

    # Section 1: Format binding URL
    creds = get_credentials()
    url = (
        f"{DATAPLEX_API_BASE}/projects/{project_id}/locations/{location}"
        f"/dataDomains/{domain_id}/bindings?data_domain_binding_id={binding_id}"
    )
    headers = {
        "Authorization": f"Bearer {creds.token}",
        "Content-Type": "application/json",
    }
    payload = {"resource": resource}

    # Section 2: Execute binding POST call
    response = requests.post(url, headers=headers, json=payload, timeout=TIMEOUT_SECONDS)
    return handle_response(response)


def list_bindings(
    project_id: str,
    location: str,
    domain_id: str,
) -> Dict[str, Any]:
    """
    Lists all physical resources currently bound to a domain or subdomain.

    Args:
        project_id: Google Cloud project ID.
        location: Region identifier.
        domain_id: Target domain identifier.

    Returns:
        List of binding items.
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

    # Section 1: Query bindings endpoint
    creds = get_credentials()
    url = (
        f"{DATAPLEX_API_BASE}/projects/{project_id}/locations/{location}"
        f"/dataDomains/{domain_id}/bindings"
    )
    headers = {"Authorization": f"Bearer {creds.token}"}

    response = requests.get(url, headers=headers, timeout=TIMEOUT_SECONDS)
    return handle_response(response)


def unbind_resource(
    project_id: str,
    location: str,
    domain_id: str,
    binding_id: str,
) -> Dict[str, Any]:
    """
    Removes a bound resource from a domain by its binding ID.

    Args:
        project_id: Google Cloud project ID.
        location: Region identifier.
        domain_id: Target domain identifier.
        binding_id: Identifier of the binding to delete.

    Returns:
        Deletion confirmation message.
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
    err = validate_param("binding_id", binding_id, "Please provide the binding ID to remove.")
    if err:
        return err

    # Section 1: Issue DELETE request on binding resource
    creds = get_credentials()
    url = (
        f"{DATAPLEX_API_BASE}/projects/{project_id}/locations/{location}"
        f"/dataDomains/{domain_id}/bindings/{binding_id}"
    )
    headers = {"Authorization": f"Bearer {creds.token}"}

    response = requests.delete(url, headers=headers, timeout=TIMEOUT_SECONDS)
    return handle_response(response)


def verify_binding_availability(
    project_id: str,
    location: str,
    target_resource_uri: str,
) -> Dict[str, Any]:
    """
    Pre-flight guardrail: Verifies whether a resource URI is already bound to any existing domain.

    Enforces the Golden Rule: A resource URI can belong to only ONE domain across the catalog.

    Args:
        project_id: Google Cloud project ID.
        location: Region identifier.
        target_resource_uri: The fully qualified resource URI to inspect.

    Returns:
        Status indicating whether resource is available ('is_available': True) or conflicting domain info.
    """
    # Section 0: Validate required parameters
    err = validate_param("project_id", project_id, "Please provide the GCP Project ID.")
    if err:
        return err
    err = validate_param("location", location, "Please provide the GCP location/region.")
    if err:
        return err
    err = validate_param("target_resource_uri", target_resource_uri, "Please provide the target resource URI.")
    if err:
        return err
    # Section 1: Fetch all domains in region
    creds = get_credentials()
    domains_url = f"{DATAPLEX_API_BASE}/projects/{project_id}/locations/{location}/dataDomains"
    headers = {"Authorization": f"Bearer {creds.token}"}

    domains_resp = requests.get(domains_url, headers=headers, timeout=TIMEOUT_SECONDS)
    d_res = handle_response(domains_resp)
    if d_res.get("status") != "ok":
        return d_res

    domains = d_res.get("data", {}).get("dataDomains", [])

    # Section 2: Inspect bindings across each domain
    for d in domains:
        d_name = d.get("name", "")
        d_id = d_name.split("/")[-1] if "/" in d_name else d_name

        b_url = f"{DATAPLEX_API_BASE}/projects/{project_id}/locations/{location}/dataDomains/{d_id}/bindings"
        b_resp = requests.get(b_url, headers=headers, timeout=TIMEOUT_SECONDS)
        b_data = handle_response(b_resp)

        if b_data.get("status") == "ok":
            bindings = b_data.get("data", {}).get("dataDomainBindings", [])
            for b in bindings:
                if b.get("resource") == target_resource_uri:
                    return {
                        "status": "ok",
                        "is_available": False,
                        "conflict": {
                            "domain_id": d_id,
                            "binding_id": b.get("name", "").split("/")[-1],
                            "resource": target_resource_uri,
                        },
                        "message": f"Resource collision: URI '{target_resource_uri}' is already bound to domain '{d_id}'.",
                    }

    return {
        "status": "ok",
        "is_available": True,
        "message": f"Resource URI '{target_resource_uri}' is available for binding.",
    }

