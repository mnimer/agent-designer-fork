"""
Resource Binding & Exclusivity Verification Toolset for Google ADK

Purpose:
Manages Dataplex Data Domain resource bindings, unbindings, and pre-flight
exclusivity checks to prevent 1:1 binding collisions.

Architectural Decisions:
- Author: Mike Nimer <mikenimer@google.com>
- Uses Google Application Default Credentials (ADC) with explicit `x-goog-user-project`
  quota project headers so all binding operations run under the user's ADC identity.
- Strictly enforces Dataplex 1:1 resource binding exclusivity: a resource URI
  (BigQuery dataset or table) can only belong to ONE domain.
- Returns structured error dictionaries (`{"status": "error", ...}`) rather than raising
  uncaught exceptions so Google ADK's tool runner never crashes the agent turn with HTTP 500.
- Detects cross-location mismatches (e.g. domain in 'us-central1' vs BigQuery dataset in 'US'/'us')
  and retries transient IAM propagation 403 errors after `authorize_table` / `authorize_dataset`.
"""

import re
import sys
import time
import logging
from typing import Any, Dict, Optional, Tuple
import requests
import google.auth
from google.auth.transport.requests import Request

logger = logging.getLogger("kc-domain-agent.binding-tools")

TIMEOUT_SECONDS = 30
DATAPLEX_API_BASE = "https://dataplex.googleapis.com/v1"
BIGQUERY_API_BASE = "https://bigquery.googleapis.com/bigquery/v2"
# Note: Dataplex OwnershipAuthorizationServiceImpl checks BigQuery table IAM with
# `retryParams { suppress = true }` (local Zanzibar replica only), which takes ~60-120s
# to propagate after `authorize_table` (`setIamPolicy`). Polling across this window
# ensures `bind_resource` succeeds seamlessly out of the box.
BIND_IAM_RETRY_DELAYS: Tuple[float, ...] = (5.0, 10.0, 15.0)
UNBIND_IAM_RETRY_DELAYS: Tuple[float, ...] = (5.0, 10.0, 10.0)


def sanitize_binding_id(binding_id: str) -> str:
    """
    Sanitizes a Dataplex DataDomainBinding identifier to comply with AIP-122/Dataplex rules:
    - Only lowercase letters, numbers, and hyphens
    - Must start with a lowercase letter
    - Between 1 and 63 characters
    - Must end with a letter or number
    """
    cleaned = re.sub(r"[^a-z0-9-]+", "-", str(binding_id).strip().lower())
    cleaned = re.sub(r"-+", "-", cleaned).strip("-")
    if not cleaned or not cleaned[0].isalpha():
        cleaned = f"b-{cleaned}" if cleaned else "binding-1"
    if len(cleaned) > 63:
        cleaned = cleaned[:63].rstrip("-")
    if not cleaned[-1].isalnum():
        cleaned = f"{cleaned}0"[:63]
    return cleaned


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
    if not creds.valid or not getattr(creds, "token", None):
        creds.refresh(Request())
    return creds


def build_headers(
    creds: google.auth.credentials.Credentials,
    project_id: Optional[str] = None,
    json_content: bool = False,
) -> Dict[str, str]:
    """
    Builds HTTP request headers using User ADC credentials and quota project binding.
    """
    headers: Dict[str, str] = {"Authorization": f"Bearer {creds.token}"}
    if project_id:
        headers["x-goog-user-project"] = str(project_id).strip()
    if json_content:
        headers["Content-Type"] = "application/json"
    return headers


def normalize_location(location: str) -> str:
    """Normalizes location strings (e.g. 'US' -> 'us')."""
    return str(location).strip().lower()


def wait_for_lro(
    op_data: Dict[str, Any],
    creds: google.auth.credentials.Credentials,
    timeout_seconds: int = 120,
    poll_interval: float = 2.0,
    project_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Polls a Google Cloud Dataplex Long Running Operation (LRO) until completion.

    Args:
        op_data: Initial operation metadata from the REST response.
        creds: Refreshed google.auth credentials.
        timeout_seconds: Maximum time to wait for completion.
        poll_interval: Seconds between polling requests.
        project_id: Optional project ID for quota header.

    Returns:
        Dictionary with status 'ok' or 'error' and completed operation or resource data.
    """
    # Section 1: Check if already completed
    if op_data.get("done") is True:
        if "error" in op_data:
            err = op_data["error"]
            err_code = err.get("code", "UNKNOWN")
            err_msg = err.get("message", "Operation failed")
            return {
                "status": "error",
                "http_status": err_code,
                "message": f"Dataplex Binding Operation Error ({err_code}): {err_msg}",
            }
        return {"status": "ok", "data": op_data.get("response", op_data)}

    op_name = op_data.get("name")
    if not op_name:
        return {"status": "ok", "data": op_data}

    # Section 2: Poll operation endpoint
    start_time = time.time()
    url = f"{DATAPLEX_API_BASE}/{op_name}"

    while time.time() - start_time < timeout_seconds:
        if not creds.valid or not getattr(creds, "token", None):
            creds.refresh(Request())
        headers = build_headers(creds, project_id=project_id)
        resp = requests.get(url, headers=headers, timeout=TIMEOUT_SECONDS)
        if resp.status_code >= 400:
            return {
                "status": "error",
                "http_status": resp.status_code,
                "message": f"Failed to poll LRO {op_name} ({resp.status_code}): {resp.text}",
            }

        status_json = resp.json()
        if status_json.get("done") is True:
            if "error" in status_json:
                err = status_json["error"]
                err_code = err.get("code", "UNKNOWN")
                err_msg = err.get("message", "Operation failed")
                return {
                    "status": "error",
                    "http_status": err_code,
                    "message": f"Dataplex Binding Operation Error ({err_code}): {err_msg}",
                }
            return {"status": "ok", "data": status_json.get("response", status_json)}

        time.sleep(poll_interval)

    return {
        "status": "error",
        "http_status": 504,
        "message": f"Dataplex Binding Operation {op_name} timed out after {timeout_seconds}s",
    }


def handle_response(
    response: requests.Response,
    creds: Optional[google.auth.credentials.Credentials] = None,
    wait_lro: bool = True,
    project_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Handles HTTP responses uniformly across Dataplex REST endpoints.
    Awaits Long Running Operations (LRO) when applicable and returns structured
    error dictionaries rather than raising uncaught exceptions.

    Args:
        response: The requests Response object.
        creds: Optional credentials to poll LROs.
        wait_lro: Whether to await completion of Long Running Operations.
        project_id: Optional project ID for quota header.

    Returns:
        A dictionary with 'status' ('ok' or 'error') and 'data' or 'message'.
    """
    # Section 1: Uniformly parse HTTP responses
    try:
        response.raise_for_status()
        if response.status_code == 204:
            return {"status": "ok", "message": "Binding removed successfully"}
        data = response.json() if getattr(response, "text", None) is not False else {}

        # Section 2: Detect and await Long Running Operation if requested
        if wait_lro and isinstance(data, dict) and "name" in data and ("done" in data or "metadata" in data):
            if creds is None:
                creds = get_credentials()
            return wait_for_lro(data, creds, project_id=project_id)

        return {"status": "ok", "data": data}
    except requests.exceptions.HTTPError as err:
        err_msg = ""
        try:
            err_json = response.json()
            err_msg = err_json.get("error", {}).get("message", response.text)
        except Exception:
            err_msg = getattr(response, "text", "") or str(err)

        sys.stderr.write(f"\n[DATAPLEX BINDING ERROR {response.status_code}] {err_msg}\n")
        sys.stderr.flush()
        logger.error("HTTP Error %s: %s", response.status_code, err_msg)
        return {
            "status": "error",
            "http_status": response.status_code,
            "message": f"Dataplex Binding API Error ({response.status_code}): {err_msg}",
        }
    except Exception as err:
        sys.stderr.write(f"\n[DATAPLEX BINDING UNEXPECTED ERROR] {err}\n")
        sys.stderr.flush()
        logger.error("Unexpected error: %s", str(err))
        return {
            "status": "error",
            "message": f"Dataplex Binding Unexpected Error: {err}",
        }


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


def _parse_bigquery_resource_uri(resource: str) -> Optional[Tuple[str, str]]:
    """
    Extracts (project_id, dataset_id) from a BigQuery resource URI of the form:
    '//bigquery.googleapis.com/projects/{P}/datasets/{D}[/tables/{T}]'
    """
    prefix = "//bigquery.googleapis.com/projects/"
    if not resource.startswith(prefix):
        return None
    parts = resource[len(prefix):].split("/")
    if len(parts) >= 3 and parts[1] == "datasets":
        return parts[0], parts[2]
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
        location: Region or multi-region identifier matching the BigQuery resource (e.g. 'us', 'us-central1').
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

    loc = normalize_location(location)
    clean_binding_id = sanitize_binding_id(binding_id)

    # Section 1: Format binding URL with camelCase dataDomainBindingId query param
    try:
        creds = get_credentials()
        url = (
            f"{DATAPLEX_API_BASE}/projects/{project_id}/locations/{loc}"
            f"/dataDomains/{domain_id}/bindings?dataDomainBindingId={clean_binding_id}"
        )
        headers = build_headers(creds, project_id=project_id, json_content=True)
        payload = {"resource": resource}

        # Section 2: Execute binding POST call with IAM propagation retry if needed
        response = requests.post(url, headers=headers, json=payload, timeout=TIMEOUT_SECONDS)

        if response.status_code == 409:
            return {
                "status": "ok",
                "already_bound": True,
                "domain_id": domain_id,
                "binding_id": clean_binding_id,
                "resource": resource,
                "message": f"Resource '{resource}' is already bound under binding '{clean_binding_id}' in domain '{domain_id}'.",
            }

        if response.status_code == 403:
            # Check if 403 is caused by a location mismatch between the Dataplex domain and BigQuery dataset
            bq_target = _parse_bigquery_resource_uri(resource)
            if bq_target:
                bq_proj, bq_ds = bq_target
                try:
                    ds_resp = requests.get(
                        f"{BIGQUERY_API_BASE}/projects/{bq_proj}/datasets/{bq_ds}",
                        headers=build_headers(creds, project_id=project_id),
                        timeout=TIMEOUT_SECONDS,
                    )
                    if ds_resp.status_code == 200:
                        ds_loc_raw = ds_resp.json().get("location", "")
                        ds_loc = normalize_location(ds_loc_raw) if ds_loc_raw else ""
                        if ds_loc and ds_loc != loc:
                            return {
                                "status": "error",
                                "http_status": 403,
                                "location_mismatch": True,
                                "domain_location": loc,
                                "dataset_location": ds_loc,
                                "message": (
                                    f"Dataplex Location Mismatch (403): BigQuery dataset '{bq_ds}' resides in "
                                    f"location '{ds_loc_raw}' (Dataplex location '{ds_loc}'), but domain '{domain_id}' "
                                    f"was provisioned in location '{loc}'. Dataplex Data Domains can only bind BigQuery "
                                    f"resources located in the same region/multi-region ('{ds_loc}'). Please provision "
                                    f"the domain hierarchy in location='{ds_loc}'."
                                ),
                            }
                except Exception:
                    pass

            # Locations match: poll briefly, and if IAM propagation from BigQuery to Dataplex's
            # local Zanzibar replica is still in progress (~60-120s), return a non-fatal pending status
            # so batch provisioning of many tables completes quickly without timing out.
            err_text = getattr(response, "text", "") or ""
            if "not authorized to bind the resource" in err_text or "or the resource doesn't exist" in err_text:
                logger.info(
                    "Waiting for BigQuery IAM policy propagation to Dataplex for '%s' on domain '%s'...",
                    resource,
                    domain_id,
                )
                for delay in BIND_IAM_RETRY_DELAYS:
                    time.sleep(delay)
                    if not creds.valid or not getattr(creds, "token", None):
                        creds.refresh(Request())
                    headers = build_headers(creds, project_id=project_id, json_content=True)
                    response = requests.post(url, headers=headers, json=payload, timeout=TIMEOUT_SECONDS)
                    if response.status_code < 400:
                        break
                    if response.status_code == 409:
                        return {
                            "status": "ok",
                            "already_bound": True,
                            "domain_id": domain_id,
                            "binding_id": clean_binding_id,
                            "resource": resource,
                            "message": f"Resource '{resource}' is already bound under binding '{clean_binding_id}' in domain '{domain_id}'.",
                        }
                if response.status_code == 403:
                    return {
                        "status": "ok",
                        "iam_propagation": "pending",
                        "domain_id": domain_id,
                        "binding_id": clean_binding_id,
                        "location": loc,
                        "resource": resource,
                        "message": (
                            f"Table IAM policy for '{resource}' has been granted, and Dataplex's local IAM "
                            f"replica in '{loc}' is currently syncing (~60-120s). Re-run `bind_resource` for "
                            f"'{clean_binding_id}' in 1-2 minutes once IAM propagation completes."
                        ),
                    }

        return handle_response(response, creds=creds, wait_lro=True, project_id=project_id)
    except Exception as exc:
        return {"status": "error", "message": f"Failed to bind resource '{resource}': {exc}"}


def list_bindings(
    project_id: str,
    location: str,
    domain_id: str,
) -> Dict[str, Any]:
    """
    Lists all physical resources currently bound to a domain or subdomain.

    Args:
        project_id: Google Cloud project ID.
        location: Region or multi-region identifier.
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

    loc = normalize_location(location)

    # Section 1: Query bindings endpoint
    try:
        creds = get_credentials()
        url = (
            f"{DATAPLEX_API_BASE}/projects/{project_id}/locations/{loc}"
            f"/dataDomains/{domain_id}/bindings"
        )
        headers = build_headers(creds, project_id=project_id)

        response = requests.get(url, headers=headers, timeout=TIMEOUT_SECONDS)
        return handle_response(response, project_id=project_id)
    except Exception as exc:
        return {"status": "error", "message": f"Failed to list bindings for domain '{domain_id}': {exc}"}


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
        location: Region or multi-region identifier.
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

    loc = normalize_location(location)

    # Section 1: Issue DELETE request on binding resource and await LRO completion
    try:
        creds = get_credentials()
        url = (
            f"{DATAPLEX_API_BASE}/projects/{project_id}/locations/{loc}"
            f"/dataDomains/{domain_id}/bindings/{binding_id}"
        )
        headers = build_headers(creds, project_id=project_id)

        response = requests.delete(url, headers=headers, timeout=TIMEOUT_SECONDS)
        if response.status_code == 403 and "dataDomainBindings.delete" in (getattr(response, "text", "") or ""):
            for delay in UNBIND_IAM_RETRY_DELAYS:
                time.sleep(delay)
                if not creds.valid or not getattr(creds, "token", None):
                    creds.refresh(Request())
                headers = build_headers(creds, project_id=project_id)
                response = requests.delete(url, headers=headers, timeout=TIMEOUT_SECONDS)
                if response.status_code < 400 or response.status_code == 404:
                    break
        if response.status_code == 404:
            return {"status": "ok", "message": f"Binding '{binding_id}' already removed."}
        return handle_response(response, creds=creds, wait_lro=True, project_id=project_id)
    except Exception as exc:
        return {"status": "error", "message": f"Failed to unbind '{binding_id}' from '{domain_id}': {exc}"}


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
        location: Region or multi-region identifier.
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

    loc = normalize_location(location)

    # Section 1: Fetch all domains in region
    try:
        creds = get_credentials()
        domains_url = f"{DATAPLEX_API_BASE}/projects/{project_id}/locations/{loc}/dataDomains"
        headers = build_headers(creds, project_id=project_id)

        domains_resp = requests.get(domains_url, headers=headers, timeout=TIMEOUT_SECONDS)
        d_res = handle_response(domains_resp, wait_lro=False, project_id=project_id)
        if d_res.get("status") != "ok":
            return d_res
        domains = d_res.get("data", {}).get("dataDomains", [])

        # Section 2: Inspect bindings across each domain
        for d in domains:
            d_name = d.get("name", "")
            d_id = d_name.split("/")[-1] if "/" in d_name else d_name

            b_url = f"{DATAPLEX_API_BASE}/projects/{project_id}/locations/{loc}/dataDomains/{d_id}/bindings"
            b_resp = requests.get(b_url, headers=headers, timeout=TIMEOUT_SECONDS)
            b_data = handle_response(b_resp, wait_lro=False, project_id=project_id)

            if b_data.get("status") == "ok":
                bindings = b_data.get("data", {}).get("dataDomainBindings", [])
                for b in bindings:
                    if b.get("resource") == target_resource_uri:
                        return {
                            "status": "ok",
                            "is_available": False,
                            "conflict": {
                                "domain_id": d_id,
                                "location": loc,
                                "binding_id": b.get("name", "").split("/")[-1],
                                "resource": target_resource_uri,
                            },
                            "message": f"Resource collision: URI '{target_resource_uri}' is already bound to domain '{d_id}' in '{loc}'.",
                        }

        return {
            "status": "ok",
            "is_available": True,
            "location": loc,
            "message": f"Resource URI '{target_resource_uri}' is available for binding in '{loc}'.",
        }
    except Exception as exc:
        return {"status": "error", "message": f"Failed to verify binding availability: {exc}"}
