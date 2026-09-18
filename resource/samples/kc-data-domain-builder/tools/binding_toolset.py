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

import sys
import time
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


def wait_for_lro(
    op_data: Dict[str, Any],
    creds: google.auth.credentials.Credentials,
    timeout_seconds: int = 120,
    poll_interval: float = 2.0,
) -> Dict[str, Any]:
    """
    Polls a Google Cloud Dataplex Long Running Operation (LRO) until completion.

    Args:
        op_data: Initial operation metadata from the REST response.
        creds: Refreshed google.auth credentials.
        timeout_seconds: Maximum time to wait for completion.
        poll_interval: Seconds between polling requests.

    Returns:
        Dictionary with status 'ok' and completed operation or resource data.

    Raises:
        RuntimeError: If the LRO completes with an error or fails.
        TimeoutError: If the operation does not complete within timeout.
    """
    # Section 1: Check if already completed
    if op_data.get("done") is True:
        if "error" in op_data:
            err = op_data["error"]
            err_code = err.get("code", "UNKNOWN")
            err_msg = err.get("message", "Operation failed")
            raise RuntimeError(f"Dataplex Binding Operation Error ({err_code}): {err_msg}")
        return {"status": "ok", "data": op_data.get("response", op_data)}

    op_name = op_data.get("name")
    if not op_name:
        return {"status": "ok", "data": op_data}

    # Section 2: Poll operation endpoint
    start_time = time.time()
    url = f"{DATAPLEX_API_BASE}/{op_name}"

    while time.time() - start_time < timeout_seconds:
        if not creds.valid:
            creds.refresh(Request())
        headers = {"Authorization": f"Bearer {creds.token}"}
        resp = requests.get(url, headers=headers, timeout=TIMEOUT_SECONDS)
        if resp.status_code >= 400:
            raise RuntimeError(f"Failed to poll LRO {op_name} ({resp.status_code}): {resp.text}")

        status_json = resp.json()
        if status_json.get("done") is True:
            if "error" in status_json:
                err = status_json["error"]
                err_code = err.get("code", "UNKNOWN")
                err_msg = err.get("message", "Operation failed")
                raise RuntimeError(f"Dataplex Binding Operation Error ({err_code}): {err_msg}")
            return {"status": "ok", "data": status_json.get("response", status_json)}

        time.sleep(poll_interval)

    raise TimeoutError(f"Dataplex Binding Operation {op_name} timed out after {timeout_seconds}s")


def handle_response(
    response: requests.Response,
    creds: Optional[google.auth.credentials.Credentials] = None,
    wait_lro: bool = True,
) -> Dict[str, Any]:
    """
    Handles HTTP responses uniformly across Dataplex REST endpoints.
    Awaits Long Running Operations (LRO) when applicable.
    Raises RuntimeError on HTTP errors so ADK and Gemini are immediately aware of failures.

    Args:
        response: The requests Response object.
        creds: Optional credentials to poll LROs.
        wait_lro: Whether to await completion of Long Running Operations.

    Returns:
        A dictionary with 'status' and 'data' or success message.

    Raises:
        RuntimeError: When HTTP status code >= 400 or when LRO fails.
    """
    # Section 1: Uniformly parse HTTP responses
    try:
        response.raise_for_status()
        if response.status_code == 204:
            return {"status": "ok", "message": "Binding removed successfully"}
        data = response.json() if response.text else {}

        # Section 2: Detect and await Long Running Operation if requested
        if wait_lro and isinstance(data, dict) and "name" in data and ("done" in data or "metadata" in data):
            if creds is None:
                creds = get_credentials()
            return wait_for_lro(data, creds)

        return {"status": "ok", "data": data}
    except requests.exceptions.HTTPError as err:
        err_msg = ""
        try:
            err_json = response.json()
            err_msg = err_json.get("error", {}).get("message", response.text)
        except Exception:
            err_msg = response.text or str(err)

        sys.stderr.write(f"\n[DATAPLEX BINDING ERROR {response.status_code}] {err_msg}\n")
        sys.stderr.flush()
        logger.error("HTTP Error %s: %s", response.status_code, err_msg)
        raise RuntimeError(f"Dataplex Binding API Error ({response.status_code}): {err_msg}")
    except Exception as err:
        if isinstance(err, (RuntimeError, TimeoutError)):
            raise
        sys.stderr.write(f"\n[DATAPLEX BINDING UNEXPECTED ERROR] {err}\n")
        sys.stderr.flush()
        logger.error("Unexpected error: %s", str(err))
        raise RuntimeError(f"Dataplex Binding Unexpected Error: {err}")


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

    # Section 1: Format binding URL with camelCase dataDomainBindingId query param
    creds = get_credentials()
    url = (
        f"{DATAPLEX_API_BASE}/projects/{project_id}/locations/{location}"
        f"/dataDomains/{domain_id}/bindings?dataDomainBindingId={binding_id}"
    )
    headers = {
        "Authorization": f"Bearer {creds.token}",
        "Content-Type": "application/json",
    }
    payload = {"resource": resource}

    # Section 2: Execute binding POST call and await LRO completion
    response = requests.post(url, headers=headers, json=payload, timeout=TIMEOUT_SECONDS)
    return handle_response(response, creds=creds, wait_lro=True)


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

    # Section 1: Issue DELETE request on binding resource and await LRO completion
    creds = get_credentials()
    url = (
        f"{DATAPLEX_API_BASE}/projects/{project_id}/locations/{location}"
        f"/dataDomains/{domain_id}/bindings/{binding_id}"
    )
    headers = {"Authorization": f"Bearer {creds.token}"}

    response = requests.delete(url, headers=headers, timeout=TIMEOUT_SECONDS)
    return handle_response(response, creds=creds, wait_lro=True)


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
    d_res = handle_response(domains_resp, wait_lro=False)
    domains = d_res.get("data", {}).get("dataDomains", [])

    # Section 2: Inspect bindings across each domain
    for d in domains:
        d_name = d.get("name", "")
        d_id = d_name.split("/")[-1] if "/" in d_name else d_name

        b_url = f"{DATAPLEX_API_BASE}/projects/{project_id}/locations/{location}/dataDomains/{d_id}/bindings"
        b_resp = requests.get(b_url, headers=headers, timeout=TIMEOUT_SECONDS)
        try:
            b_data = handle_response(b_resp, wait_lro=False)
        except RuntimeError:
            continue

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

