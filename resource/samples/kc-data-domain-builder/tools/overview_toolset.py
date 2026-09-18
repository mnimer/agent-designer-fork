"""
Knowledge Catalog Overview Aspect Toolset for Google ADK

Purpose:
Manages native Knowledge Catalog Overview aspects on Data Domain entries in Google Cloud Dataplex.
Enables attaching structured Markdown documentation, executive summaries, and bound entity indexes.

Architectural Decisions:
- Author: Steve Thill <stevethill@google.com>
- In Knowledge Catalog (Universal Catalog), the Overview section is an Aspect attached to
  the domain entry within the '@dataplex' entryGroup:
  entry: projects/{projectNumber}/locations/{location}/entryGroups/@dataplex/entries/...
- Supports both MARKDOWN (default standard) and HTML formats.
- Resolves project number from domain principal or metadata automatically to construct
  the exact entry resource path.
"""

import logging
from typing import Any, Dict, Optional
import requests
import google.auth
from google.auth.transport.requests import Request

logger = logging.getLogger("kc-domain-agent.overview-tools")

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
            return {"status": "ok", "message": "Overview aspect updated successfully"}
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


def _resolve_project_number_and_entry_name(
    project_id: str,
    location: str,
    domain_id: str,
    creds: google.auth.credentials.Credentials,
) -> str:
    """
    Helper to resolve the fully qualified Dataplex catalog Entry name for a domain.
    """
    # Section 1: Query domain metadata to inspect policyMember containing project number
    url = f"{DATAPLEX_API_BASE}/projects/{project_id}/locations/{location}/dataDomains/{domain_id}"
    headers = {"Authorization": f"Bearer {creds.token}"}
    domain_resp = requests.get(url, headers=headers, timeout=TIMEOUT_SECONDS)

    proj_num = project_id
    if domain_resp.status_code == 200:
        data = domain_resp.json()
        policy_member = data.get("policyMember") or data.get("policy_member", {})
        if isinstance(policy_member, dict):
            principal = policy_member.get("iamPolicyNamePrincipal", "")
        else:
            principal = str(policy_member)

        if "/projects/" in principal:
            proj_num = principal.split("/projects/")[1].split("/")[0]

    # Section 2: Formulate entry name in @dataplex entryGroup
    return f"projects/{proj_num}/locations/{location}/entryGroups/@dataplex/entries/projects/{proj_num}/locations/{location}/dataDomains/{domain_id}"


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


def set_overview(
    project_id: str,
    location: str,
    domain_id: str,
    content: str,
    content_type: str = "MARKDOWN",
) -> Dict[str, Any]:
    """
    Attaches or updates the native Knowledge Catalog Overview aspect on a Data Domain entry.

    Args:
        project_id: Google Cloud project ID or project number.
        location: Region identifier (e.g. 'us-central1' or 'global').
        domain_id: Data domain or subdomain identifier.
        content: Rich text (Markdown) document detailing executive summary, bounded scope,
                 bound asset directory, and data stewardship.
        content_type: 'MARKDOWN' (recommended) or 'HTML'.

    Returns:
        Result dictionary containing status and updated entry aspect metadata.
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
    err = validate_param("content", content, "Please provide the Markdown overview content.")
    if err:
        return err

    # Section 1: Resolve entry name and credentials
    creds = get_credentials()
    entry_name = _resolve_project_number_and_entry_name(project_id, location, domain_id, creds)
    entry_url = f"{DATAPLEX_API_BASE}/{entry_name}?updateMask=aspects"

    headers = {
        "Authorization": f"Bearer {creds.token}",
        "Content-Type": "application/json",
    }

    # Section 2: Build aspect payload using standard Knowledge Catalog overview aspect type
    payload = {
        "aspects": {
            "655216118709.global.overview": {
                "aspectType": "projects/655216118709/locations/global/aspectTypes/overview",
                "data": {
                    "content": content,
                    "contentType": content_type.upper(),
                },
            }
        }
    }

    # Section 3: Dispatch PATCH update
    response = requests.patch(entry_url, headers=headers, json=payload, timeout=TIMEOUT_SECONDS)
    return handle_response(response)


def get_overview(
    project_id: str,
    location: str,
    domain_id: str,
) -> Dict[str, Any]:
    """
    Retrieves the native Knowledge Catalog Overview aspect content for a Data Domain.

    Args:
        project_id: Google Cloud project ID.
        location: Region identifier.
        domain_id: Data domain identifier.

    Returns:
        Dictionary containing 'status' and 'overview' text content.
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
    # Section 1: Resolve entry name and credentials
    creds = get_credentials()
    entry_name = _resolve_project_number_and_entry_name(project_id, location, domain_id, creds)
    entry_url = f"{DATAPLEX_API_BASE}/{entry_name}?view=FULL"
    headers = {"Authorization": f"Bearer {creds.token}"}

    # Section 2: Fetch full entry definition
    response = requests.get(entry_url, headers=headers, timeout=TIMEOUT_SECONDS)
    if response.status_code == 200:
        aspects = response.json().get("aspects", {})
        overview = None
        for k, v in aspects.items():
            if k.endswith(".overview") or k.endswith(".global.overview"):
                overview = v
                break

        if overview:
            content = overview.get("data", {}).get("content", "")
            content_type = overview.get("data", {}).get("contentType", "MARKDOWN")
            return {
                "status": "ok",
                "domain_id": domain_id,
                "content_type": content_type,
                "overview": content,
            }
        return {
            "status": "ok",
            "domain_id": domain_id,
            "overview": None,
            "message": "No native Overview aspect is currently attached to this domain.",
        }

    return handle_response(response)

