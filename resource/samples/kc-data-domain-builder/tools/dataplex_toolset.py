"""
Dataplex Data Domain Toolset for Google ADK

Purpose:
Provides core lifecycle management functions (CRUD) and principal extraction
for Dataplex Data Domains and Subdomains in Google Cloud Knowledge Catalog.

Architectural Decisions:
- Author: Steve Thill <stevethill@google.com>
- Uses Google Application Default Credentials (ADC) for zero-hardcoded secret authentication.
- Implements resilient error handling and uniform JSON dictionary return formats compatible with ADK ToolContext.
- Follows Dataplex v1 REST API standards (https://dataplex.googleapis.com/v1).
"""

import logging
from typing import Any, Dict, List, Optional
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
    # Section 1: Attempt standard HTTP response parsing
    try:
        response.raise_for_status()
        if response.status_code == 204:
            return {"status": "ok", "message": "Resource deleted successfully"}
        return {"status": "ok", "data": response.json()}
    except requests.exceptions.HTTPError as err:
        # Section 2: Gracefully extract Dataplex backend error details
        logger.error("HTTP Error %s: %s", response.status_code, response.text)
        try:
            err_json = response.json()
            message = err_json.get("error", {}).get("message", str(err))
        except Exception:
            message = response.text or str(err)
        return {"status": "error", "message": message, "code": response.status_code}
    except Exception as err:
        # Section 3: Catch unexpected serialization or connection errors
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


def list_domains(project_id: str, location: str) -> Dict[str, Any]:
    """
    Lists all Dataplex Data Domains in a given project and location.

    Args:
        project_id: The Google Cloud project ID.
        location: The region identifier (e.g. 'us-central1' or 'global').

    Returns:
        JSON response containing list of domains or error message.
    """
    # Section 0: Validate required parameters
    err = validate_param("project_id", project_id, "Please provide the GCP Project ID.")
    if err:
        return err
    err = validate_param("location", location, "Please provide the GCP location/region (e.g. 'us-central1').")
    if err:
        return err

    # Section 1: Construct endpoint and authorization headers
    creds = get_credentials()
    url = f"{DATAPLEX_API_BASE}/projects/{project_id}/locations/{location}/dataDomains"
    headers = {"Authorization": f"Bearer {creds.token}"}

    # Section 2: Execute GET request
    response = requests.get(url, headers=headers, timeout=TIMEOUT_SECONDS)
    return handle_response(response)


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

    Args:
        project_id: Google Cloud project ID.
        location: Target region (e.g. 'us-central1').
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
    err = validate_param("location", location, "Please provide the GCP location/region (e.g. 'us-central1').")
    if err:
        return err
    err = validate_param("domain_id", domain_id, "Please provide the domain identifier (kebab-case).")
    if err:
        return err
    # Section 1: Set up request URL and credentials
    creds = get_credentials()
    url = (
        f"{DATAPLEX_API_BASE}/projects/{project_id}/locations/{location}"
        f"/dataDomains?data_domain_id={domain_id}"
    )
    headers = {
        "Authorization": f"Bearer {creds.token}",
        "Content-Type": "application/json",
    }

    # Section 2: Build domain payload with plain-text description
    payload: Dict[str, Any] = {
        "display_name": display_name,
        "description": description,
    }

    # Section 3: Attach contact identity if specified
    if contact_name or contact_email:
        payload["contacts"] = {
            "identities": [
                {
                    "contact_name": contact_name or "Domain Owner",
                    "contact_role": contact_role or "owner",
                    "contact_id": contact_email or "",
                }
            ]
        }

    # Section 4: Dispatch creation call
    response = requests.post(url, headers=headers, json=payload, timeout=TIMEOUT_SECONDS)
    return handle_response(response)


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

    Args:
        project_id: Google Cloud project ID.
        location: Region identifier (e.g. 'us-central1').
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
    err = validate_param("location", location, "Please provide the GCP location/region (e.g. 'us-central1').")
    if err:
        return err
    err = validate_param("domain_id", domain_id, "Please provide the subdomain identifier (kebab-case).")
    if err:
        return err
    err = validate_param("parent_domain_id", parent_domain_id, "Please provide the parent domain identifier.")
    if err:
        return err

    # Section 1: Set up endpoint and authorization headers
    creds = get_credentials()
    url = (
        f"{DATAPLEX_API_BASE}/projects/{project_id}/locations/{location}"
        f"/dataDomains?data_domain_id={domain_id}"
    )
    headers = {
        "Authorization": f"Bearer {creds.token}",
        "Content-Type": "application/json",
    }

    # Section 2: Normalize parent resource path if simple ID provided
    if not parent_domain_id.startswith("projects/"):
        parent_path = (
            f"projects/{project_id}/locations/{location}/dataDomains/{parent_domain_id}"
        )
    else:
        parent_path = parent_domain_id

    # Section 3: Build subdomain payload
    payload: Dict[str, Any] = {
        "display_name": display_name,
        "description": description,
        "parent_data_domain": parent_path,
    }
    if contact_name or contact_email:
        payload["contacts"] = {
            "identities": [
                {
                    "contact_name": contact_name or "Subdomain Owner",
                    "contact_role": contact_role or "owner",
                    "contact_id": contact_email or "",
                }
            ]
        }

    # Section 4: Dispatch subdomain creation request
    response = requests.post(url, headers=headers, json=payload, timeout=TIMEOUT_SECONDS)
    return handle_response(response)


def get_domain(project_id: str, location: str, domain_id: str) -> Dict[str, Any]:
    """
    Retrieves metadata for a specific Dataplex Data Domain or Subdomain.

    Args:
        project_id: Google Cloud project ID.
        location: Region identifier.
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

    # Section 1: Prepare request endpoint and credentials
    creds = get_credentials()
    url = (
        f"{DATAPLEX_API_BASE}/projects/{project_id}/locations/{location}"
        f"/dataDomains/{domain_id}"
    )
    headers = {"Authorization": f"Bearer {creds.token}"}

    # Section 2: Query domain metadata
    response = requests.get(url, headers=headers, timeout=TIMEOUT_SECONDS)
    return handle_response(response)


def list_subdomains(
    project_id: str,
    location: str,
    parent_domain_id: str,
) -> Dict[str, Any]:
    """
    Lists all subdomains directly belonging to a specified parent domain.

    Args:
        project_id: Google Cloud project ID.
        location: Region identifier.
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

    # Section 1: Query all domains in region
    all_domains_resp = list_domains(project_id, location)
    if all_domains_resp.get("status") != "ok":
        return all_domains_resp

    # Section 2: Normalize parent path for matching
    expected_parent = (
        parent_domain_id
        if parent_domain_id.startswith("projects/")
        else f"projects/{project_id}/locations/{location}/dataDomains/{parent_domain_id}"
    )

    # Section 3: Filter domains where parent_data_domain matches
    domains = all_domains_resp.get("data", {}).get("dataDomains", [])
    matching_subdomains = [
        d for d in domains if d.get("parentDataDomain") == expected_parent or d.get("parent_data_domain") == expected_parent
    ]
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
        location: Region identifier.
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

    # Section 1: Validate update fields and compute update mask
    creds = get_credentials()
    update_mask = []
    payload: Dict[str, Any] = {}

    if display_name is not None:
        update_mask.append("displayName")
        payload["display_name"] = display_name
    if description is not None:
        update_mask.append("description")
        payload["description"] = description

    if not update_mask:
        return {"status": "error", "message": "No update fields specified (display_name or description required)."}

    # Section 2: Send PATCH request with update mask
    url = (
        f"{DATAPLEX_API_BASE}/projects/{project_id}/locations/{location}"
        f"/dataDomains/{domain_id}?updateMask={','.join(update_mask)}"
    )
    headers = {
        "Authorization": f"Bearer {creds.token}",
        "Content-Type": "application/json",
    }
    response = requests.patch(url, headers=headers, json=payload, timeout=TIMEOUT_SECONDS)
    return handle_response(response)


def delete_domain(project_id: str, location: str, domain_id: str) -> Dict[str, Any]:
    """
    Deletes an empty Dataplex Data Domain or Subdomain.

    Note:
        Dataplex requires that all child subdomains and resource bindings
        are deleted before a domain can be deleted.

    Args:
        project_id: Google Cloud project ID.
        location: Region identifier.
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

    # Section 1: Set up DELETE request
    creds = get_credentials()
    url = (
        f"{DATAPLEX_API_BASE}/projects/{project_id}/locations/{location}"
        f"/dataDomains/{domain_id}"
    )
    headers = {"Authorization": f"Bearer {creds.token}"}

    # Section 2: Execute DELETE call
    response = requests.delete(url, headers=headers, timeout=TIMEOUT_SECONDS)
    return handle_response(response)


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
        location: Region identifier.
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

    # Section 1: Fetch domain details
    domain_resp = get_domain(project_id, location, domain_id)
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
        "raw_policy_member": policy_member,
    }

