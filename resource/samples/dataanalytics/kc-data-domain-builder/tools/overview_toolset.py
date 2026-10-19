"""
Knowledge Catalog Overview Aspect Toolset for Google ADK

Purpose:
Manages native Knowledge Catalog Overview aspects on Data Domain entries in Google Cloud Dataplex.
Enables attaching structured Markdown documentation, executive summaries, and bound entity indexes.

Architectural Decisions:
- Author: Mike Nimer <mikenimer@google.com>
- Uses Google Application Default Credentials (ADC) with explicit `x-goog-user-project`
  quota project headers so all catalog aspect updates execute under the user's ADC identity.
- In Knowledge Catalog (Universal Catalog), the Overview section is an Aspect attached to
  the domain entry within the '@dataplex' entryGroup:
  entry: projects/{projectNumber}/locations/{location}/entryGroups/@dataplex/entries/...
- Handles asynchronous `@dataplex` entry materialization lag after `create_domain` / `create_subdomain`:
  when a domain was just created, Dataplex Universal Catalog ingests its `@dataplex` Entry in the
  background (returning `403 Permission denied ... (or it may not exist)` until synced). This toolset
  polls with backoff and gracefully reports `catalog_entry_sync: "pending"` rather than crashing.
- Returns structured error dictionaries (`{"status": "error", ...}`) rather than raising uncaught
  exceptions so Google ADK's tool runner never crashes the agent turn with HTTP 500.
"""

import sys
import time
import logging
from typing import Any, Dict, Optional, Tuple
import requests
import google.auth
from google.auth.transport.requests import Request

logger = logging.getLogger("kc-domain-agent.overview-tools")

TIMEOUT_SECONDS = 30
DATAPLEX_API_BASE = "https://dataplex.googleapis.com/v1"
OVERVIEW_SYNC_RETRY_DELAYS: Tuple[float, ...] = (2.0, 4.0, 6.0)


def get_credentials() -> google.auth.credentials.Credentials:
    """Retrieves Google Cloud credentials using Application Default Credentials (ADC)."""
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
    """Builds HTTP request headers using User ADC credentials and quota project binding."""
    headers: Dict[str, str] = {"Authorization": f"Bearer {creds.token}"}
    if project_id:
        headers["x-goog-user-project"] = str(project_id).strip()
    if json_content:
        headers["Content-Type"] = "application/json"
    return headers


def normalize_location(location: str) -> str:
    """Normalizes location strings (e.g. 'US' -> 'us')."""
    return str(location).strip().lower()


def _extract_error_message(response: requests.Response) -> str:
    """Extracts human-readable error message from a Dataplex HTTP error response."""
    try:
        err_json = response.json()
        return err_json.get("error", {}).get("message", getattr(response, "text", ""))
    except Exception:
        return getattr(response, "text", "") or f"HTTP {response.status_code}"


def handle_response(response: requests.Response) -> Dict[str, Any]:
    """
    Handles HTTP responses uniformly across Dataplex REST endpoints.
    Returns structured dictionaries on HTTP errors rather than raising uncaught exceptions.
    """
    try:
        response.raise_for_status()
        if response.status_code == 204:
            return {"status": "ok", "message": "Overview aspect updated successfully"}
        return {"status": "ok", "data": response.json()}
    except requests.exceptions.HTTPError as err:
        err_msg = _extract_error_message(response) or str(err)
        sys.stderr.write(f"\n[DATAPLEX OVERVIEW ERROR {response.status_code}] {err_msg}\n")
        sys.stderr.flush()
        logger.error("HTTP Error %s: %s", response.status_code, err_msg)
        return {
            "status": "error",
            "http_status": response.status_code,
            "message": f"Dataplex Overview API Error ({response.status_code}): {err_msg}",
        }
    except Exception as err:
        sys.stderr.write(f"\n[DATAPLEX OVERVIEW UNEXPECTED ERROR] {err}\n")
        sys.stderr.flush()
        logger.error("Unexpected error: %s", str(err))
        return {
            "status": "error",
            "message": f"Dataplex Overview Unexpected Error: {err}",
        }


def _resolve_project_number_and_entry_name(
    project_id: str,
    location: str,
    domain_id: str,
    creds: google.auth.credentials.Credentials,
) -> Tuple[str, bool]:
    """
    Helper to resolve the fully qualified Dataplex catalog Entry name for a domain
    and whether the underlying DataDomain resource currently exists.
    """
    loc = normalize_location(location)
    # Section 1: Query domain metadata to inspect policyMember containing project number
    url = f"{DATAPLEX_API_BASE}/projects/{project_id}/locations/{loc}/dataDomains/{domain_id}"
    headers = build_headers(creds, project_id=project_id)
    domain_resp = requests.get(url, headers=headers, timeout=TIMEOUT_SECONDS)

    proj_num = project_id
    domain_exists = domain_resp.status_code == 200
    if domain_exists:
        data = domain_resp.json()
        policy_member = data.get("policyMember") or data.get("policy_member", {})
        if isinstance(policy_member, dict):
            principal = (
                policy_member.get("iamPolicyNamePrincipal")
                or policy_member.get("iam_policy_name_principal")
                or ""
            )
        else:
            principal = str(policy_member)

        if "/projects/" in principal:
            proj_num = principal.split("/projects/")[1].split("/")[0]
        elif "/projects/" in str(data.get("parentDataDomain", "")):
            proj_num = str(data["parentDataDomain"]).split("/projects/")[1].split("/")[0]

    # Section 2: Formulate entry name in @dataplex entryGroup
    entry_name = (
        f"projects/{proj_num}/locations/{loc}/entryGroups/@dataplex/entries/"
        f"projects/{proj_num}/locations/{loc}/dataDomains/{domain_id}"
    )
    return entry_name, domain_exists


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
        location: Region or multi-region identifier (e.g. 'us', 'us-central1', or 'global').
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

    loc = normalize_location(location)

    # Section 1: Resolve entry name and credentials
    try:
        creds = get_credentials()
        entry_name, domain_exists = _resolve_project_number_and_entry_name(
            project_id, loc, domain_id, creds
        )
        entry_url = f"{DATAPLEX_API_BASE}/{entry_name}?updateMask=aspects"
        headers = build_headers(creds, project_id=project_id, json_content=True)

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

        # Section 3: Dispatch PATCH update with retry for newly-created domain @dataplex entry sync
        response = requests.patch(entry_url, headers=headers, json=payload, timeout=TIMEOUT_SECONDS)

        if (
            domain_exists
            and response.status_code in (403, 404)
            and "or it may not exist" in _extract_error_message(response).lower()
        ):
            for delay in OVERVIEW_SYNC_RETRY_DELAYS:
                time.sleep(delay)
                if not creds.valid or not getattr(creds, "token", None):
                    creds.refresh(Request())
                headers = build_headers(creds, project_id=project_id, json_content=True)
                response = requests.patch(
                    entry_url, headers=headers, json=payload, timeout=TIMEOUT_SECONDS
                )
                if response.status_code < 400:
                    break

            if (
                response.status_code in (403, 404)
                and "or it may not exist" in _extract_error_message(response).lower()
            ):
                logger.info(
                    "Domain '%s' exists in '%s', but @dataplex catalog entry is still syncing in background.",
                    domain_id,
                    loc,
                )
                return {
                    "status": "ok",
                    "catalog_entry_sync": "pending",
                    "domain_id": domain_id,
                    "location": loc,
                    "entry_name": entry_name,
                    "message": (
                        f"Data domain '{domain_id}' is active in '{loc}', and its Knowledge Catalog "
                        "`@dataplex` system entry is currently completing background ingestion. "
                        "Re-run `set_overview` in ~60 seconds once catalog entry sync finishes."
                    ),
                }

        return handle_response(response)
    except Exception as exc:
        return {"status": "error", "message": f"Failed to set overview on '{domain_id}': {exc}"}


def get_overview(
    project_id: str,
    location: str,
    domain_id: str,
) -> Dict[str, Any]:
    """
    Retrieves the native Knowledge Catalog Overview aspect content for a Data Domain.

    Args:
        project_id: Google Cloud project ID.
        location: Region or multi-region identifier.
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

    loc = normalize_location(location)

    # Section 1: Resolve entry name and credentials
    try:
        creds = get_credentials()
        entry_name, domain_exists = _resolve_project_number_and_entry_name(
            project_id, loc, domain_id, creds
        )
        entry_url = f"{DATAPLEX_API_BASE}/{entry_name}?view=FULL"
        headers = build_headers(creds, project_id=project_id)

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
                    "location": loc,
                    "content_type": content_type,
                    "overview": content,
                }
            return {
                "status": "ok",
                "domain_id": domain_id,
                "location": loc,
                "overview": None,
                "message": "No native Overview aspect is currently attached to this domain.",
            }

        if (
            domain_exists
            and response.status_code in (403, 404)
            and "or it may not exist" in _extract_error_message(response).lower()
        ):
            return {
                "status": "ok",
                "domain_id": domain_id,
                "location": loc,
                "overview": None,
                "catalog_entry_sync": "pending",
                "message": (
                    f"Data domain '{domain_id}' exists, and its `@dataplex` catalog entry "
                    "is currently completing background ingestion."
                ),
            }

        return handle_response(response)
    except Exception as exc:
        return {"status": "error", "message": f"Failed to get overview for '{domain_id}': {exc}"}
