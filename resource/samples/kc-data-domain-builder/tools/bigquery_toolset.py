"""
BigQuery Discovery & IAM Authorization Toolset for Google ADK

Purpose:
Provides BigQuery metadata discovery (listing datasets/tables and inspecting schemas)
and IAM authorization tools (granting metadataViewer roles on datasets or specific tables)
required to authorize Dataplex Data Domain principals before binding.

Architectural Decisions:
- Author: Steve Thill <stevethill@google.com>
- Uses Google Application Default Credentials (ADC) for zero-hardcoded secret authentication.
- Implements direct table-level IAM authorization (getIamPolicy/setIamPolicy) to support
  granular table-to-subdomain mapping across shared/monolithic datasets without moving physical data.
- Handles both standard user/serviceAccount principals and modern Google Cloud 'principal://...' identities.
"""

import sys
import logging
from typing import Any, Dict, List, Optional
import requests
import google.auth
from google.auth.transport.requests import Request

logger = logging.getLogger("kc-domain-agent.bigquery-tools")

TIMEOUT_SECONDS = 30
BIGQUERY_API_BASE = "https://bigquery.googleapis.com/bigquery/v2"


def get_credentials() -> google.auth.credentials.Credentials:
    """
    Retrieves Google Cloud credentials using Application Default Credentials (ADC).

    Returns:
        A valid google.auth credentials object refreshed if necessary.
    """
    # Section 1: Retrieve ADC credentials with bigquery & cloud-platform scopes
    creds, _ = google.auth.default(
        scopes=["https://www.googleapis.com/auth/cloud-platform"]
    )
    if not creds.valid:
        creds.refresh(Request())
    return creds


def handle_response(response: requests.Response) -> Dict[str, Any]:
    """
    Handles HTTP responses uniformly across BigQuery REST endpoints.

    Args:
        response: The requests Response object.

    Returns:
        A dictionary with 'status' and either 'data' or error 'message'.
    """
    # Section 1: Uniformly parse BigQuery HTTP responses
    try:
        response.raise_for_status()
        return {"status": "ok", "data": response.json()}
    except requests.exceptions.HTTPError as err:
        err_msg = ""
        try:
            err_json = response.json()
            err_msg = err_json.get("error", {}).get("message", response.text)
        except Exception:
            err_msg = response.text or str(err)
        sys.stderr.write(f"\n[BIGQUERY API ERROR {response.status_code}] {err_msg}\n")
        sys.stderr.flush()
        logger.error("BigQuery HTTP Error %s: %s", response.status_code, err_msg)
        raise RuntimeError(f"BigQuery API Error ({response.status_code}): {err_msg}")
    except Exception as err:
        sys.stderr.write(f"\n[BIGQUERY UNEXPECTED ERROR] {err}\n")
        sys.stderr.flush()
        logger.error("Unexpected BigQuery error: %s", str(err))
        raise RuntimeError(f"BigQuery Unexpected Error: {err}")


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


# ==============================================================================
# 1. Metadata Discovery Tools (Phase 1: Asset Inventory Discovery)
# ==============================================================================

def list_datasets(project_id: str, max_results: int = 100) -> Dict[str, Any]:
    """
    Lists all BigQuery datasets in a specified Google Cloud project.

    Args:
        project_id: GCP project ID to inspect.
        max_results: Maximum datasets to return per request.

    Returns:
        Dictionary containing list of dataset IDs, descriptions, and labels.
    """
    # Section 0: Validate required parameters
    err = validate_param("project_id", project_id, "Please provide the GCP Project ID to discover BigQuery datasets.")
    if err:
        return err
    # Section 1: Query BigQuery datasets endpoint
    creds = get_credentials()
    url = f"{BIGQUERY_API_BASE}/projects/{project_id}/datasets?maxResults={max_results}"
    headers = {"Authorization": f"Bearer {creds.token}"}

    response = requests.get(url, headers=headers, timeout=TIMEOUT_SECONDS)
    res = handle_response(response)
    if res.get("status") != "ok":
        return res

    # Section 2: Format dataset summaries for LLM consumption
    raw_datasets = res.get("data", {}).get("datasets", [])
    formatted_datasets = []
    for d in raw_datasets:
        ref = d.get("datasetReference", {})
        formatted_datasets.append({
            "dataset_id": ref.get("datasetId"),
            "project_id": ref.get("projectId"),
            "friendly_name": d.get("friendlyName", ""),
            "location": d.get("location", ""),
            "labels": d.get("labels", {}),
        })

    return {"status": "ok", "datasets": formatted_datasets, "count": len(formatted_datasets)}


def list_tables(project_id: str, dataset_id: str, max_results: int = 200) -> Dict[str, Any]:
    """
    Lists all tables and views within a BigQuery dataset.

    Args:
        project_id: GCP project ID.
        dataset_id: Target BigQuery dataset ID.
        max_results: Maximum tables to return.

    Returns:
        Dictionary containing table IDs, types (TABLE, VIEW), and creation time.
    """
    # Section 0: Validate required parameters
    err = validate_param("project_id", project_id, "Please provide the GCP Project ID.")
    if err:
        return err
    err = validate_param("dataset_id", dataset_id, "Please provide the BigQuery dataset ID.")
    if err:
        return err

    # Section 1: Query BigQuery tables endpoint
    creds = get_credentials()
    url = f"{BIGQUERY_API_BASE}/projects/{project_id}/datasets/{dataset_id}/tables?maxResults={max_results}"
    headers = {"Authorization": f"Bearer {creds.token}"}

    response = requests.get(url, headers=headers, timeout=TIMEOUT_SECONDS)
    res = handle_response(response)
    if res.get("status") != "ok":
        return res

    # Section 2: Format table listing
    raw_tables = res.get("data", {}).get("tables", [])
    formatted_tables = []
    for t in raw_tables:
        t_ref = t.get("tableReference", {})
        formatted_tables.append({
            "table_id": t_ref.get("tableId"),
            "dataset_id": t_ref.get("datasetId"),
            "project_id": t_ref.get("projectId"),
            "type": t.get("type", "TABLE"),
            "creation_time": t.get("creationTime"),
        })

    return {"status": "ok", "tables": formatted_tables, "count": len(formatted_tables)}


def get_table_schema(project_id: str, dataset_id: str, table_id: str) -> Dict[str, Any]:
    """
    Retrieves the detailed column schema, field descriptions, and metadata for a BigQuery table.

    Args:
        project_id: GCP project ID.
        dataset_id: BigQuery dataset ID.
        table_id: Target table or view ID.

    Returns:
        Dictionary containing column fields, types, modes, descriptions, and row counts.
    """
    # Section 0: Validate required parameters
    err = validate_param("project_id", project_id, "Please provide the GCP Project ID.")
    if err:
        return err
    err = validate_param("dataset_id", dataset_id, "Please provide the BigQuery dataset ID.")
    if err:
        return err
    err = validate_param("table_id", table_id, "Please provide the BigQuery table ID.")
    if err:
        return err

    # Section 1: Fetch table resource definition
    creds = get_credentials()
    url = f"{BIGQUERY_API_BASE}/projects/{project_id}/datasets/{dataset_id}/tables/{table_id}"
    headers = {"Authorization": f"Bearer {creds.token}"}

    response = requests.get(url, headers=headers, timeout=TIMEOUT_SECONDS)
    res = handle_response(response)
    if res.get("status") != "ok":
        return res

    data = res.get("data", {})
    schema_fields = data.get("schema", {}).get("fields", [])

    # Section 2: Extract clean column profile
    columns = []
    for col in schema_fields:
        columns.append({
            "name": col.get("name"),
            "type": col.get("type"),
            "mode": col.get("mode", "NULLABLE"),
            "description": col.get("description", ""),
        })

    return {
        "status": "ok",
        "project_id": project_id,
        "dataset_id": dataset_id,
        "table_id": table_id,
        "description": data.get("description", ""),
        "num_rows": data.get("numRows"),
        "num_bytes": data.get("numBytes"),
        "columns": columns,
    }


# ==============================================================================
# 2. IAM Authorization Tools (Phase 5: Step B Helper)
# ==============================================================================

def authorize_dataset(
    project_id: str,
    dataset_id: str,
    principal: str,
    role: str = "roles/bigquery.metadataViewer",
) -> Dict[str, Any]:
    """
    Grants the Dataplex domain service principal metadata viewer access on a BigQuery dataset.

    Args:
        project_id: BigQuery project ID.
        dataset_id: Target dataset ID.
        principal: Domain principal identity (e.g. 'principal://dataplex...' or 'serviceAccount:...').
        role: IAM role to grant on dataset (default: 'roles/bigquery.metadataViewer').

    Returns:
        Status of the dataset access update.
    """
    # Section 0: Validate required parameters
    err = validate_param("project_id", project_id, "Please provide the GCP Project ID.")
    if err:
        return err
    err = validate_param("dataset_id", dataset_id, "Please provide the BigQuery dataset ID.")
    if err:
        return err
    err = validate_param("principal", principal, "Please provide the domain principal.")
    if err:
        return err

    # Section 1: Fetch existing dataset metadata to retrieve current access control list
    creds = get_credentials()
    get_url = f"{BIGQUERY_API_BASE}/projects/{project_id}/datasets/{dataset_id}"
    headers = {
        "Authorization": f"Bearer {creds.token}",
        "Content-Type": "application/json",
    }

    resp = requests.get(get_url, headers=headers, timeout=TIMEOUT_SECONDS)
    if resp.status_code != 200:
        return handle_response(resp)

    dataset_meta = resp.json()
    access_list = dataset_meta.get("access", [])

    # Section 2: Structure access entry according to principal format
    access_entry: Dict[str, str] = {"role": role}
    if principal.startswith("serviceAccount:"):
        access_entry["userByEmail"] = principal.replace("serviceAccount:", "")
    elif principal.startswith("user:"):
        access_entry["userByEmail"] = principal.replace("user:", "")
    elif principal.startswith("group:"):
        access_entry["groupByEmail"] = principal.replace("group:", "")
    else:
        # Handles principal:// format
        access_entry["iamMember"] = principal

    # Section 3: Verify if principal is already authorized to avoid redundant updates
    already_present = any(
        entry.get("role") == role
        and (
            (access_entry.get("userByEmail") and entry.get("userByEmail") == access_entry.get("userByEmail"))
            or (access_entry.get("groupByEmail") and entry.get("groupByEmail") == access_entry.get("groupByEmail"))
            or (access_entry.get("iamMember") and entry.get("iamMember") == access_entry.get("iamMember"))
        )
        for entry in access_list
    )

    if already_present:
        return {"status": "ok", "message": f"Principal '{principal}' is already authorized on dataset '{dataset_id}'."}

    # Section 4: Patch dataset with updated access list
    access_list.append(access_entry)
    patch_resp = requests.patch(
        get_url,
        headers=headers,
        json={"access": access_list},
        timeout=TIMEOUT_SECONDS,
    )
    return handle_response(patch_resp)


def authorize_table(
    project_id: str,
    dataset_id: str,
    table_id: str,
    principal: str,
    role: str = "roles/bigquery.metadataViewer",
) -> Dict[str, Any]:
    """
    Grants the domain policyMember principal metadata viewer access directly on a specific BigQuery table.

    This enables granular table-to-subdomain mapping across shared monolithic datasets
    without needing to bind the entire dataset.

    Args:
        project_id: GCP project ID hosting the dataset.
        dataset_id: Target BigQuery dataset ID.
        table_id: Target BigQuery table ID.
        principal: Full principal string (e.g. 'principal://dataplex.googleapis.com/...').
        role: IAM role to grant (default: 'roles/bigquery.metadataViewer').

    Returns:
        BigQuery IAM policy update response.
    """
    # Section 0: Validate required parameters
    err = validate_param("project_id", project_id, "Please provide the GCP Project ID.")
    if err:
        return err
    err = validate_param("dataset_id", dataset_id, "Please provide the BigQuery dataset ID.")
    if err:
        return err
    err = validate_param("table_id", table_id, "Please provide the BigQuery table ID.")
    if err:
        return err
    err = validate_param("principal", principal, "Please provide the subdomain principal.")
    if err:
        return err

    # Section 1: Fetch current table IAM policy
    creds = get_credentials()
    get_url = f"{BIGQUERY_API_BASE}/projects/{project_id}/datasets/{dataset_id}/tables/{table_id}:getIamPolicy"
    set_url = f"{BIGQUERY_API_BASE}/projects/{project_id}/datasets/{dataset_id}/tables/{table_id}:setIamPolicy"
    headers = {
        "Authorization": f"Bearer {creds.token}",
        "Content-Type": "application/json",
    }

    get_resp = requests.post(get_url, headers=headers, json={}, timeout=TIMEOUT_SECONDS)
    if get_resp.status_code != 200:
        return handle_response(get_resp)

    policy = get_resp.json()
    bindings = policy.get("bindings", [])

    # Section 2: Locate or create the role binding
    role_binding = next((b for b in bindings if b.get("role") == role), None)
    if role_binding:
        if principal in role_binding.get("members", []):
            return {
                "status": "ok",
                "message": f"Principal '{principal}' is already authorized on table '{table_id}'.",
            }
        role_binding.setdefault("members", []).append(principal)
    else:
        bindings.append({
            "role": role,
            "members": [principal],
        })

    # Section 3: Commit updated policy back to BigQuery
    policy["bindings"] = bindings
    set_resp = requests.post(
        set_url,
        headers=headers,
        json={"policy": policy},
        timeout=TIMEOUT_SECONDS,
    )
    return handle_response(set_resp)

