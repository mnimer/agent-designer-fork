"""
Dataplex Data Domain Toolset for Google ADK

Purpose:
Provides core lifecycle management functions (CRUD) and principal extraction
for Dataplex Data Domains and Subdomains in Google Cloud Knowledge Catalog.

Architectural Decisions:
- Author: Mike Nimer <mikenimer@google.com>
- Uses Google Application Default Credentials (ADC) with explicit `x-goog-user-project`
  quota project headers so all requests execute under the user's own GCP identity and quota.
- Returns structured error dictionaries (`{"status": "error", ...}`) rather than raising
  uncaught exceptions so Google ADK's tool runner never crashes the agent turn with HTTP 500
  or drops sibling parallel tool calls.
- Normalizes location identifiers to lowercase (e.g. BigQuery 'US' -> Dataplex 'us').
- Handles 409 Already Exists idempotently on domain/subdomain creation and matches both
  project ID and numeric project number in `list_subdomains`.
"""

import sys
import time
import logging
from typing import Any, Dict, Optional
import requests
import google.auth
from google.auth.transport.requests import Request

logger = logging.getLogger("kc-domain-agent.dataplex-tools")

TIMEOUT_SECONDS = 30
DATAPLEX_API_BASE = "https://dataplex.googleapis.com/v1"


def get_credentials() -> google.auth.credentials.Credentials:
    """
    Retrieves Google Cloud credentials using Application Default Credentials (ADC).

    Returns:
        A valid google.auth credentials object refreshed if necessary.
    """
    # Section 1: Retrieve ADC credentials with cloud-platform scope
    creds, _ = google.auth.default(
        scopes=["https://www.googleapis.com/auth/cloud-platform"]
    )

    # Section 2: Refresh token if expired or not yet valid
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

    Args:
        creds: Refreshed ADC credentials.
        project_id: Target GCP project ID for `x-goog-user-project` quota header.
        json_content: Whether to include `Content-Type: application/json`.

    Returns:
        Dictionary of HTTP headers.
    """
    headers: Dict[str, str] = {"Authorization": f"Bearer {creds.token}"}
    if project_id:
        headers["x-goog-user-project"] = str(project_id).strip()
    if json_content:
        headers["Content-Type"] = "application/json"
    return headers


def normalize_location(location: str) -> str:
    """
    Normalizes a GCP location or BigQuery multi-region string (e.g. 'US', 'EU')
    to lowercase Dataplex format ('us', 'eu', 'us-central1').
    """
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
        Dictionary with status 'ok' or 'error' and operation result data.
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
                "message": f"Dataplex Operation Error ({err_code}): {err_msg}",
            }
        return {"status": "ok", "data": op_data.get("response", op_data)}

    op_name = op_data.get("name")
    if not op_name:
        return {"status": "ok", "data": op_data}

    # Section 2: Poll operation endpoint until done or timeout
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
                    "message": f"Dataplex Operation Error ({err_code}): {err_msg}",
                }
            return {"status": "ok", "data": status_json.get("response", status_json)}

        time.sleep(poll_interval)

    return {
        "status": "error",
        "http_status": 504,
        "message": f"Dataplex Operation {op_name} timed out after {timeout_seconds}s",
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
    dictionaries on HTTP errors so ADK can feed error details back to Gemini
    without crashing the agent turn.

    Args:
        response: The requests Response object.
        creds: Optional credentials to poll LROs.
        wait_lro: Whether to await completion of Long Running Operations.
        project_id: Optional project ID for quota header.

    Returns:
        A dictionary with 'status' ('ok' or 'error') and 'data' or 'message'.
    """
    # Section 1: Attempt standard HTTP response parsing
    try:
        response.raise_for_status()
        if response.status_code == 204:
            return {"status": "ok", "message": "Resource deleted successfully"}
        data = response.json() if getattr(response, "text", None) is not False else {}

        # Section 2: Detect and await Long Running Operation if requested
        if wait_lro and isinstance(data, dict) and "name" in data and ("done" in data or "metadata" in data):
            if creds is None:
                creds = get_credentials()
            return wait_for_lro(data, creds, project_id=project_id)

        return {"status": "ok", "data": data}
    except requests.exceptions.HTTPError as err:
        # Section 3: Extract Dataplex backend error details and return structured error
        err_msg = ""
        try:
            err_json = response.json()
            err_msg = err_json.get("error", {}).get("message", response.text)
        except Exception:
            err_msg = getattr(response, "text", "") or str(err)

        sys.stderr.write(f"\n[DATAPLEX API ERROR {response.status_code}] {err_msg}\n")
        sys.stderr.flush()
        logger.error("HTTP Error %s: %s", response.status_code, err_msg)
        return {
            "status": "error",
            "http_status": response.status_code,
            "message": f"Dataplex API Error ({response.status_code}): {err_msg}",
        }
    except Exception as err:
        sys.stderr.write(f"\n[DATAPLEX UNEXPECTED ERROR] {err}\n")
        sys.stderr.flush()
        logger.error("Unexpected error: %s", str(err))
        return {
            "status": "error",
            "message": f"Dataplex Unexpected Error: {err}",
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


def list_domains(project_id: str, location: str) -> Dict[str, Any]:
    """
    Lists all Dataplex Data Domains in a given project and location.

    Args:
        project_id: The Google Cloud project ID.
        location: The region or multi-region identifier (e.g. 'us', 'eu', 'us-central1').

    Returns:
        JSON response containing list of domains or error message.
    """
    # Section 0: Validate required parameters
    err = validate_param("project_id", project_id, "Please provide the GCP Project ID.")
    if err:
        return err
    err = validate_param("location", location, "Please provide the GCP location/region (e.g. 'us' or 'us-central1').")
    if err:
        return err

    loc = normalize_location(location)

    # Section 1: Construct endpoint and authorization headers
    try:
        creds = get_credentials()
        url = f"{DATAPLEX_API_BASE}/projects/{project_id}/locations/{loc}/dataDomains"
        headers = build_headers(creds, project_id=project_id)

        # Section 2: Execute GET request
        response = requests.get(url, headers=headers, timeout=TIMEOUT_SECONDS)
        return handle_response(response, project_id=project_id)
    except Exception as exc:
        return {"status": "error", "message": f"Failed to list domains: {exc}"}


def create_domain(
    project_id: str,
    location: str,
    domain_id: str,
    display_name: str,
    description: str,
    contact_name: Optional[str] = None,
    contact_role: Optional[str] = None,
    contact_email: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Creates a new top-level Dataplex Data Domain.
    If the domain already exists (HTTP 409), returns the existing domain metadata idempotently.

    Args:
        project_id: Google Cloud project ID.
        location: Target region or multi-region matching BigQuery datasets (e.g. 'us', 'us-central1').
        domain_id: kebab-case unique identifier for the domain (e.g. 'customer-experience').
        display_name: Human-readable domain name.
        description: Concise 1-2 sentence plain-text functional description and scope.
        contact_name: Optional contact display name.
        contact_role: Optional contact role (e.g., 'owner', 'steward').
        contact_email: Optional contact email identifier.

    Returns:
        Created domain metadata or error details.
    """
    # Section 0: Validate required parameters
    err = validate_param("project_id", project_id, "Please provide the GCP Project ID.")
    if err:
        return err
    err = validate_param("location", location, "Please provide the GCP location/region (e.g. 'us' or 'us-central1').")
    if err:
        return err
    err = validate_param("domain_id", domain_id, "Please provide the domain identifier (kebab-case).")
    if err:
        return err

    loc = normalize_location(location)

    # Section 1: Set up request URL and credentials
    try:
        creds = get_credentials()
        url = (
            f"{DATAPLEX_API_BASE}/projects/{project_id}/locations/{loc}"
            f"/dataDomains?dataDomainId={domain_id}"
        )
        headers = build_headers(creds, project_id=project_id, json_content=True)

        # Section 2: Build domain payload with plain-text description and required contacts
        payload: Dict[str, Any] = {
            "displayName": display_name,
            "description": description,
            "contacts": {
                "identities": [
                    {
                        "contactName": contact_name or "Data Domain Owner",
                        "contactRole": contact_role or "owner",
                        "contactId": contact_email or "owner@example.com",
                    }
                ]
            },
        }

        # Section 3: Dispatch creation call and handle idempotent 409 conflicts
        response = requests.post(url, headers=headers, json=payload, timeout=TIMEOUT_SECONDS)
        if response.status_code == 409:
            existing = get_domain(project_id, loc, domain_id)
            if existing.get("status") == "ok":
                existing["already_existed"] = True
                existing["message"] = f"Domain '{domain_id}' already exists in location '{loc}'."
                return existing
        return handle_response(response, creds=creds, wait_lro=True, project_id=project_id)
    except Exception as exc:
        return {"status": "error", "message": f"Failed to create domain '{domain_id}': {exc}"}


def create_subdomain(
    project_id: str,
    location: str,
    domain_id: str,
    parent_domain_id: str,
    display_name: str,
    description: str,
    contact_name: Optional[str] = None,
    contact_role: Optional[str] = None,
    contact_email: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Creates a Dataplex Data Subdomain nested under an existing parent domain.
    If the subdomain already exists (HTTP 409), returns the existing subdomain metadata idempotently.

    Args:
        project_id: Google Cloud project ID.
        location: Region or multi-region identifier matching BigQuery datasets (e.g. 'us', 'us-central1').
        domain_id: kebab-case unique identifier for the subdomain.
        parent_domain_id: Parent domain ID or full resource path.
        display_name: Subdomain display name.
        description: Concise 1-2 sentence plain-text subdomain purpose and boundaries.
        contact_name: Optional contact name.
        contact_role: Optional contact role.
        contact_email: Optional contact email.

    Returns:
        Created subdomain metadata or error details.
    """
    # Section 0: Validate required parameters
    err = validate_param("project_id", project_id, "Please provide the GCP Project ID.")
    if err:
        return err
    err = validate_param("location", location, "Please provide the GCP location/region (e.g. 'us' or 'us-central1').")
    if err:
        return err
    err = validate_param("domain_id", domain_id, "Please provide the subdomain identifier (kebab-case).")
    if err:
        return err
    err = validate_param("parent_domain_id", parent_domain_id, "Please provide the parent domain identifier.")
    if err:
        return err

    loc = normalize_location(location)

    # Section 1: Set up endpoint and authorization headers
    try:
        creds = get_credentials()
        url = (
            f"{DATAPLEX_API_BASE}/projects/{project_id}/locations/{loc}"
            f"/dataDomains?dataDomainId={domain_id}"
        )
        headers = build_headers(creds, project_id=project_id, json_content=True)

        # Section 2: Normalize parent resource path if simple ID provided
        if not parent_domain_id.startswith("projects/"):
            parent_path = (
                f"projects/{project_id}/locations/{loc}/dataDomains/{parent_domain_id}"
            )
        else:
            parent_path = parent_domain_id

        # Section 3: Build subdomain payload with required contacts and parent reference
        payload: Dict[str, Any] = {
            "displayName": display_name,
            "description": description,
            "parentDataDomain": parent_path,
            "contacts": {
                "identities": [
                    {
                        "contactName": contact_name or "Data Subdomain Owner",
                        "contactRole": contact_role or "owner",
                        "contactId": contact_email or "owner@example.com",
                    }
                ]
            },
        }

        # Section 4: Dispatch subdomain creation request and handle idempotent 409 conflicts
        response = requests.post(url, headers=headers, json=payload, timeout=TIMEOUT_SECONDS)
        if response.status_code == 409:
            existing = get_domain(project_id, loc, domain_id)
            if existing.get("status") == "ok":
                existing["already_existed"] = True
                existing["message"] = f"Subdomain '{domain_id}' already exists in location '{loc}'."
                return existing
        return handle_response(response, creds=creds, wait_lro=True, project_id=project_id)
    except Exception as exc:
        return {"status": "error", "message": f"Failed to create subdomain '{domain_id}': {exc}"}


def get_domain(project_id: str, location: str, domain_id: str) -> Dict[str, Any]:
    """
    Retrieves metadata for a specific Dataplex Data Domain or Subdomain.

    Args:
        project_id: Google Cloud project ID.
        location: Region or multi-region identifier.
        domain_id: Identifier of the target domain.

    Returns:
        Domain configuration dictionary including policyMember and parent bindings.
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

    # Section 1: Prepare request endpoint and credentials
    try:
        creds = get_credentials()
        url = (
            f"{DATAPLEX_API_BASE}/projects/{project_id}/locations/{loc}"
            f"/dataDomains/{domain_id}"
        )
        headers = build_headers(creds, project_id=project_id)

        # Section 2: Query domain metadata
        response = requests.get(url, headers=headers, timeout=TIMEOUT_SECONDS)
        return handle_response(response, project_id=project_id)
    except Exception as exc:
        return {"status": "error", "message": f"Failed to get domain '{domain_id}': {exc}"}


def list_subdomains(
    project_id: str,
    location: str,
    parent_domain_id: str,
) -> Dict[str, Any]:
    """
    Lists all subdomains directly belonging to a specified parent domain.

    Args:
        project_id: Google Cloud project ID.
        location: Region or multi-region identifier.
        parent_domain_id: Parent domain identifier.

    Returns:
        List of subdomains or error details.
    """
    # Section 0: Validate required parameters
    err = validate_param("project_id", project_id, "Please provide the GCP Project ID.")
    if err:
        return err
    err = validate_param("location", location, "Please provide the GCP location/region.")
    if err:
        return err
    err = validate_param("parent_domain_id", parent_domain_id, "Please provide the parent domain ID.")
    if err:
        return err

    loc = normalize_location(location)

    # Section 1: Query all domains in region
    all_domains_resp = list_domains(project_id, loc)
    if all_domains_resp.get("status") != "ok":
        return all_domains_resp

    # Section 2: Match parent domain ID regardless of whether Dataplex returned
    # the project ID string or numeric project number in `parentDataDomain`
    short_parent_id = parent_domain_id.split("/")[-1] if "/" in parent_domain_id else parent_domain_id
    expected_suffix = f"/locations/{loc}/dataDomains/{short_parent_id}"

    # Section 3: Filter domains where parentDataDomain matches
    domains = all_domains_resp.get("data", {}).get("dataDomains", [])
    matching_subdomains = []
    for d in domains:
        parent_ref = d.get("parentDataDomain") or d.get("parent_data_domain") or ""
        if (
            parent_ref == parent_domain_id
            or parent_ref.endswith(expected_suffix)
            or (parent_ref and parent_ref.split("/")[-1] == short_parent_id)
        ):
            matching_subdomains.append(d)

    return {"status": "ok", "data": {"subdomains": matching_subdomains}}


def update_domain(
    project_id: str,
    location: str,
    domain_id: str,
    display_name: Optional[str] = None,
    description: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Updates the display name or plain-text description of a domain.

    Args:
        project_id: Google Cloud project ID.
        location: Region or multi-region identifier.
        domain_id: Identifier of the domain to update.
        display_name: Optional new display name.
        description: Optional new plain-text description.

    Returns:
        Updated domain metadata.
    """
    # Section 0: Validate required parameters
    err = validate_param("project_id", project_id, "Please provide the GCP Project ID.")
    if err:
        return err
    err = validate_param("location", location, "Please provide the GCP location/region.")
    if err:
        return err
    err = validate_param("domain_id", domain_id, "Please provide the domain ID to update.")
    if err:
        return err

    loc = normalize_location(location)

    # Section 1: Validate update fields and compute update mask
    update_mask = []
    payload: Dict[str, Any] = {}

    if display_name is not None:
        update_mask.append("displayName")
        payload["displayName"] = display_name
    if description is not None:
        update_mask.append("description")
        payload["description"] = description

    if not update_mask:
        return {"status": "error", "message": "No update fields specified (display_name or description required)."}

    # Section 2: Send PATCH request with update mask
    try:
        creds = get_credentials()
        url = (
            f"{DATAPLEX_API_BASE}/projects/{project_id}/locations/{loc}"
            f"/dataDomains/{domain_id}?updateMask={','.join(update_mask)}"
        )
        headers = build_headers(creds, project_id=project_id, json_content=True)
        response = requests.patch(url, headers=headers, json=payload, timeout=TIMEOUT_SECONDS)
        return handle_response(response, creds=creds, wait_lro=True, project_id=project_id)
    except Exception as exc:
        return {"status": "error", "message": f"Failed to update domain '{domain_id}': {exc}"}


def delete_domain(project_id: str, location: str, domain_id: str) -> Dict[str, Any]:
    """
    Deletes an empty Dataplex Data Domain or Subdomain.

    Note:
        Dataplex requires that all child subdomains and resource bindings
        are deleted before a domain can be deleted.

    Args:
        project_id: Google Cloud project ID.
        location: Region or multi-region identifier.
        domain_id: Identifier of the domain to delete.

    Returns:
        Success message or error if domain still contains bindings/subdomains.
    """
    # Section 0: Validate required parameters
    err = validate_param("project_id", project_id, "Please provide the GCP Project ID.")
    if err:
        return err
    err = validate_param("location", location, "Please provide the GCP location/region.")
    if err:
        return err
    err = validate_param("domain_id", domain_id, "Please provide the domain ID to delete.")
    if err:
        return err

    loc = normalize_location(location)

    # Section 1: Set up DELETE request
    try:
        creds = get_credentials()
        url = (
            f"{DATAPLEX_API_BASE}/projects/{project_id}/locations/{loc}"
            f"/dataDomains/{domain_id}"
        )
        headers = build_headers(creds, project_id=project_id)

        # Section 2: Execute DELETE call and await LRO completion
        response = requests.delete(url, headers=headers, timeout=TIMEOUT_SECONDS)
        return handle_response(response, creds=creds, wait_lro=True, project_id=project_id)
    except Exception as exc:
        return {"status": "error", "message": f"Failed to delete domain '{domain_id}': {exc}"}


def get_domain_principal(
    project_id: str,
    location: str,
    domain_id: str,
) -> Dict[str, Any]:
    """
    Extracts the unique IAM service agent principal identity (policyMember) of a domain.

    This principal identity must be granted 'roles/bigquery.metadataViewer'
    on BigQuery datasets or individual tables before resources can be bound.

    Args:
        project_id: Google Cloud project ID.
        location: Region or multi-region identifier.
        domain_id: Target domain identifier.

    Returns:
        Dictionary containing principal string (e.g., 'principal://dataplex.googleapis.com/...').
    """
    # Section 0: Validate required parameters
    err = validate_param("project_id", project_id, "Please provide the GCP Project ID.")
    if err:
        return err
    err = validate_param("location", location, "Please provide the GCP location/region.")
    if err:
        return err
    err = validate_param("domain_id", domain_id, "Please provide the domain ID.")
    if err:
        return err

    loc = normalize_location(location)

    # Section 1: Fetch domain details
    domain_resp = get_domain(project_id, loc, domain_id)
    if domain_resp.get("status") != "ok":
        return domain_resp

    # Section 2: Extract policyMember identity
    data = domain_resp.get("data", {})
    policy_member = data.get("policyMember") or data.get("policy_member")

    if not policy_member:
        return {
            "status": "error",
            "message": f"Domain '{domain_id}' does not contain an active 'policyMember' principal.",
        }

    # Section 3: Handle both string format and nested dict format
    if isinstance(policy_member, dict):
        principal = (
            policy_member.get("iamPolicyNamePrincipal")
            or policy_member.get("iam_policy_name_principal")
            or policy_member.get("principal", "")
        )
    else:
        principal = str(policy_member)

    return {
        "status": "ok",
        "principal": principal,
        "domain_id": domain_id,
        "location": loc,
        "raw_policy_member": policy_member,
    }
