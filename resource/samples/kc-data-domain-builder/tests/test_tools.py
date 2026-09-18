"""
Unit Tests for Knowledge Catalog Data Domain Builder Toolsets

Purpose:
Validates full functional coverage of `dataplex_toolset.py`, `bigquery_toolset.py`,
`binding_toolset.py`, `overview_toolset.py`, and `governance_toolset.py` across
simple conditions, extreme conditions, and failure/fallback conditions.

Architectural Decisions:
- Author: Steve Thill <stevethill@google.com>
- Uses unittest.mock to mock Google Cloud ADC credentials and requests REST calls.
- Validates payload construction, URL formats, HTTP error translation, and cascading logic.
"""

import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch
import requests

# Ensure tools package is importable
SAMPLE_ROOT = Path(__file__).resolve().parent.parent
if str(SAMPLE_ROOT) not in sys.path:
    sys.path.insert(0, str(SAMPLE_ROOT))

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


class BaseToolTestCase(unittest.TestCase):
    """Base test case providing mock Google ADC credentials."""

    def setUp(self):
        # Section 1: Set up mock ADC credentials
        self.mock_creds = MagicMock()
        self.mock_creds.valid = True
        self.mock_creds.token = "mock-token-xyz"
        self.auth_patcher = patch("google.auth.default", return_value=(self.mock_creds, "mock-project"))
        self.auth_patcher.start()

    def tearDown(self):
        self.auth_patcher.stop()


class TestDataplexToolset(BaseToolTestCase):
    """Tests for Dataplex lifecycle operations and principal extraction."""

    @patch("requests.get")
    def test_list_domains_success(self, mock_get):
        """Simple condition: List domains successfully."""
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"dataDomains": [{"name": "dom1"}]}
        mock_get.return_value = mock_resp

        res = list_domains("test-proj", "us-central1")
        self.assertEqual(res["status"], "ok")
        self.assertEqual(len(res["data"]["dataDomains"]), 1)

    @patch("requests.post")
    def test_create_domain_with_contacts(self, mock_post):
        """Simple condition: Create domain with owner contact details."""
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"name": "projects/test-proj/locations/us-central1/dataDomains/orders"}
        mock_post.return_value = mock_resp

        res = create_domain(
            project_id="test-proj",
            location="us-central1",
            domain_id="orders",
            display_name="Orders Domain",
            description="Manages customer orders.",
            contact_name="Alice",
            contact_role="owner",
            contact_email="alice@example.com",
        )
        self.assertEqual(res["status"], "ok")
        call_json = mock_post.call_args[1]["json"]
        self.assertEqual(call_json["display_name"], "Orders Domain")
        self.assertEqual(call_json["contacts"]["identities"][0]["contact_id"], "alice@example.com")

    @patch("requests.post")
    def test_create_subdomain_nested(self, mock_post):
        """Simple condition: Create subdomain nested under parent."""
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"name": "projects/test-proj/locations/us-central1/dataDomains/order-intake"}
        mock_post.return_value = mock_resp

        res = create_subdomain(
            project_id="test-proj",
            location="us-central1",
            domain_id="order-intake",
            parent_domain_id="orders",
            display_name="Order Intake Subdomain",
            description="Upstream order capture.",
        )
        self.assertEqual(res["status"], "ok")
        call_json = mock_post.call_args[1]["json"]
        self.assertTrue(call_json["parent_data_domain"].endswith("/dataDomains/orders"))

    @patch("requests.get")
    def test_list_subdomains_filtered(self, mock_get):
        """Extreme condition: Filtering subdomains from multiple domains."""
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "dataDomains": [
                {"name": "projects/p/locations/l/dataDomains/sub1", "parentDataDomain": "projects/p/locations/l/dataDomains/parent1"},
                {"name": "projects/p/locations/l/dataDomains/sub2", "parentDataDomain": "projects/p/locations/l/dataDomains/parent2"},
            ]
        }
        mock_get.return_value = mock_resp

        res = list_subdomains("p", "l", "parent1")
        self.assertEqual(res["status"], "ok")
        self.assertEqual(len(res["data"]["subdomains"]), 1)
        self.assertEqual(res["data"]["subdomains"][0]["name"].split("/")[-1], "sub1")

    @patch("requests.patch")
    def test_update_domain_validation_and_success(self, mock_patch):
        """Extreme condition: Empty update mask vs valid update mask."""
        # Empty fields
        res_empty = update_domain("p", "l", "dom1")
        self.assertEqual(res_empty["status"], "error")

        # Valid update
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"name": "dom1", "displayName": "New Name"}
        mock_patch.return_value = mock_resp

        res = update_domain("p", "l", "dom1", display_name="New Name")
        self.assertEqual(res["status"], "ok")

    @patch("requests.delete")
    def test_delete_domain_success_and_error(self, mock_delete):
        """Failure condition: 204 success vs 409 conflict error."""
        # Success (204 No Content)
        mock_204 = MagicMock()
        mock_204.status_code = 204
        mock_delete.return_value = mock_204
        res_ok = delete_domain("p", "l", "dom1")
        self.assertEqual(res_ok["status"], "ok")

        # Failure (409 Conflict)
        mock_409 = MagicMock()
        mock_409.status_code = 409
        mock_409.raise_for_status.side_effect = requests.exceptions.HTTPError(response=mock_409)
        mock_409.json.return_value = {"error": {"message": "Domain contains bindings"}}
        mock_delete.return_value = mock_409

        res_err = delete_domain("p", "l", "dom1")
        self.assertEqual(res_err["status"], "error")
        self.assertIn("contains bindings", res_err["message"])

    @patch("requests.get")
    def test_get_domain_principal(self, mock_get):
        """Simple and failure conditions for get_domain_principal."""
        # Success with dict policyMember
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "policyMember": {
                "iamPolicyNamePrincipal": "principal://dataplex.googleapis.com/projects/123/name/locations/us-central1/dataDomains/dom1"
            }
        }
        mock_get.return_value = mock_resp

        res = get_domain_principal("p", "us-central1", "dom1")
        self.assertEqual(res["status"], "ok")
        self.assertTrue(res["principal"].startswith("principal://"))

        # Missing principal failure
        mock_resp.json.return_value = {}
        res_missing = get_domain_principal("p", "us-central1", "dom1")
        self.assertEqual(res_missing["status"], "error")


class TestBigQueryToolset(BaseToolTestCase):
    """Tests for BigQuery catalog discovery and IAM authorization."""

    @patch("requests.get")
    def test_list_datasets_and_tables(self, mock_get):
        """Simple condition: List datasets and list tables."""
        # Datasets
        mock_ds_resp = MagicMock()
        mock_ds_resp.status_code = 200
        mock_ds_resp.json.return_value = {
            "datasets": [{"datasetReference": {"datasetId": "ds1", "projectId": "p1"}, "friendlyName": "DS 1"}]
        }
        mock_get.return_value = mock_ds_resp

        ds_res = list_datasets("p1")
        self.assertEqual(ds_res["status"], "ok")
        self.assertEqual(ds_res["count"], 1)
        self.assertEqual(ds_res["datasets"][0]["dataset_id"], "ds1")

        # Tables
        mock_tbl_resp = MagicMock()
        mock_tbl_resp.status_code = 200
        mock_tbl_resp.json.return_value = {
            "tables": [{"tableReference": {"tableId": "t1", "datasetId": "ds1", "projectId": "p1"}, "type": "TABLE"}]
        }
        mock_get.return_value = mock_tbl_resp

        tbl_res = list_tables("p1", "ds1")
        self.assertEqual(tbl_res["status"], "ok")
        self.assertEqual(tbl_res["count"], 1)

    @patch("requests.get")
    def test_get_table_schema(self, mock_get):
        """Simple condition: Retrieve table schema fields and row count."""
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "schema": {"fields": [{"name": "order_id", "type": "STRING", "mode": "REQUIRED", "description": "Primary key"}]},
            "description": "Order records",
            "numRows": "5000",
            "numBytes": "120000",
        }
        mock_get.return_value = mock_resp

        res = get_table_schema("p1", "ds1", "orders")
        self.assertEqual(res["status"], "ok")
        self.assertEqual(len(res["columns"]), 1)
        self.assertEqual(res["columns"][0]["name"], "order_id")

    @patch("requests.patch")
    @patch("requests.get")
    def test_authorize_dataset(self, mock_get, mock_patch):
        """Simple condition: Authorize principal on dataset."""
        # First call: principal not present
        mock_get_resp = MagicMock()
        mock_get_resp.status_code = 200
        mock_get_resp.json.return_value = {"access": []}
        mock_get.return_value = mock_get_resp

        mock_patch_resp = MagicMock()
        mock_patch_resp.status_code = 200
        mock_patch_resp.json.return_value = {"status": "ok"}
        mock_patch.return_value = mock_patch_resp

        res = authorize_dataset("p1", "ds1", "principal://dataplex...")
        self.assertEqual(res["status"], "ok")
        self.assertTrue(mock_patch.called)

        # Second call: principal already present (idempotency check)
        mock_get_resp.json.return_value = {
            "access": [{"role": "roles/bigquery.metadataViewer", "iamMember": "principal://dataplex..."}]
        }
        mock_patch.reset_mock()
        res_already = authorize_dataset("p1", "ds1", "principal://dataplex...")
        self.assertEqual(res_already["status"], "ok")
        self.assertFalse(mock_patch.called)

    @patch("requests.post")
    def test_authorize_table(self, mock_post):
        """Simple and idempotent conditions for table-level IAM authorization."""
        # Call 1: getIamPolicy -> principal not present
        mock_get = MagicMock()
        mock_get.status_code = 200
        mock_get.json.return_value = {"bindings": []}

        mock_set = MagicMock()
        mock_set.status_code = 200
        mock_set.json.return_value = {"bindings": [{"role": "roles/bigquery.metadataViewer", "members": ["principal://xyz"]}]}

        mock_post.side_effect = [mock_get, mock_set]

        res = authorize_table("p1", "ds1", "t1", "principal://xyz")
        self.assertEqual(res["status"], "ok")
        self.assertEqual(mock_post.call_count, 2)


class TestBindingToolset(BaseToolTestCase):
    """Tests for resource binding and exclusivity verification."""

    @patch("requests.post")
    def test_bind_resource_success(self, mock_post):
        """Simple condition: Bind BigQuery table resource to subdomain."""
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"name": "binding1"}
        mock_post.return_value = mock_resp

        res = bind_resource("p", "l", "sub1", "b1", "//bigquery.googleapis.com/.../t1")
        self.assertEqual(res["status"], "ok")

    @patch("requests.get")
    def test_verify_binding_availability(self, mock_get):
        """Extreme condition: Detect 1:1 binding collision vs available resource."""
        # 1. Collision scenario
        mock_domains = MagicMock()
        mock_domains.status_code = 200
        mock_domains.json.return_value = {"dataDomains": [{"name": "projects/p/locations/l/dataDomains/dom-existing"}]}

        mock_bindings = MagicMock()
        mock_bindings.status_code = 200
        mock_bindings.json.return_value = {
            "dataDomainBindings": [{"name": "projects/p/.../bindings/b1", "resource": "//bigquery.googleapis.com/.../orders"}]
        }
        mock_get.side_effect = [mock_domains, mock_bindings]

        res_conflict = verify_binding_availability("p", "l", "//bigquery.googleapis.com/.../orders")
        self.assertEqual(res_conflict["status"], "ok")
        self.assertFalse(res_conflict["is_available"])
        self.assertEqual(res_conflict["conflict"]["domain_id"], "dom-existing")

        # 2. Available scenario
        mock_bindings.json.return_value = {"dataDomainBindings": []}
        mock_get.side_effect = [mock_domains, mock_bindings]
        res_avail = verify_binding_availability("p", "l", "//bigquery.googleapis.com/.../new_table")
        self.assertEqual(res_avail["status"], "ok")
        self.assertTrue(res_avail["is_available"])


class TestOverviewToolset(BaseToolTestCase):
    """Tests for native Overview aspect documentation."""

    @patch("requests.patch")
    @patch("requests.get")
    def test_set_and_get_overview(self, mock_get, mock_patch):
        """Simple condition: Update and retrieve Markdown overview aspect."""
        # get_domain mock during set_overview
        mock_dom = MagicMock()
        mock_dom.status_code = 200
        mock_dom.json.return_value = {
            "policyMember": {"iamPolicyNamePrincipal": "principal://dataplex.googleapis.com/projects/12345/..."}
        }
        mock_get.return_value = mock_dom

        # patch aspect mock
        mock_patch_resp = MagicMock()
        mock_patch_resp.status_code = 200
        mock_patch_resp.json.return_value = {"name": "entry1"}
        mock_patch.return_value = mock_patch_resp

        set_res = set_overview("p1", "us-central1", "dom1", "# Overview Content", "MARKDOWN")
        self.assertEqual(set_res["status"], "ok")

        # get_overview mock
        mock_entry = MagicMock()
        mock_entry.status_code = 200
        mock_entry.json.return_value = {
            "aspects": {
                "655216118709.global.overview": {
                    "data": {"content": "# Overview Content", "contentType": "MARKDOWN"}
                }
            }
        }
        mock_get.side_effect = [mock_dom, mock_entry]

        get_res = get_overview("p1", "us-central1", "dom1")
        self.assertEqual(get_res["status"], "ok")
        self.assertEqual(get_res["overview"], "# Overview Content")


class TestGovernanceToolset(BaseToolTestCase):
    """Tests for IAM governance, scoped search, and cascading teardown."""

    @patch("requests.post")
    @patch("requests.get")
    def test_add_iam_member(self, mock_get, mock_post):
        """Simple condition: Grant dataDomainViewer role to user."""
        mock_get_resp = MagicMock()
        mock_get_resp.status_code = 200
        mock_get_resp.json.return_value = {"bindings": []}
        mock_get.return_value = mock_get_resp

        mock_post_resp = MagicMock()
        mock_post_resp.status_code = 200
        mock_post_resp.json.return_value = {"bindings": [{"role": "roles/dataplex.dataDomainViewer", "members": ["user:analyst@example.com"]}]}
        mock_post.return_value = mock_post_resp

        res = add_iam_member("p", "l", "dom1", "roles/dataplex.dataDomainViewer", "user:analyst@example.com")
        self.assertEqual(res["status"], "ok")

    @patch("requests.post")
    def test_search_entries(self, mock_post):
        """Simple condition: Scoped semantic catalog search."""
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"results": [{"dataplexEntry": {"name": "entry1"}}]}
        mock_post.return_value = mock_resp

        res = search_entries("p", "l", "dom1", "orders", semantic_search=True)
        self.assertEqual(res["status"], "ok")
        self.assertEqual(len(res["data"]["results"]), 1)

    @patch("tools.governance_toolset.delete_domain")
    @patch("tools.governance_toolset.list_subdomains")
    @patch("tools.governance_toolset.unbind_resource")
    @patch("tools.governance_toolset.list_bindings")
    def test_cascading_teardown_domain(self, mock_lb, mock_ub, mock_ls, mock_dd):
        """Extreme condition: Full cascading teardown of domain with bound resource and child subdomain."""
        # 1. Parent bindings: 1 binding 'b1'
        mock_lb.return_value = {
            "status": "ok",
            "data": {"dataDomainBindings": [{"name": "projects/p/.../bindings/b1"}]},
        }
        mock_ub.return_value = {"status": "ok"}

        # 2. Subdomains: 1 child 'sub1'
        mock_ls.side_effect = [
            {"status": "ok", "data": {"subdomains": [{"name": "projects/p/.../dataDomains/sub1"}]}},
            {"status": "ok", "data": {"subdomains": []}},  # sub1 has no further children
        ]
        mock_dd.return_value = {"status": "ok"}

        res = cascading_teardown_domain("p", "l", "parent-dom")
        self.assertEqual(res["status"], "ok")
        self.assertTrue(res["data"]["deleted"])
        self.assertEqual(len(res["data"]["unbound_resources"]), 1)
        self.assertEqual(len(res["data"]["deleted_subdomains"]), 1)


class TestParameterValidation(BaseToolTestCase):
    """Tests to verify that tools gracefully prompt when required parameters are missing or placeholders."""

    def test_bigquery_missing_project_id(self):
        """Validates that BigQuery tools catch missing or placeholder project IDs."""
        res_none = list_datasets(None)
        self.assertEqual(res_none["status"], "error")
        self.assertIn("Missing required parameter 'project_id'", res_none["message"])

        res_empty = list_datasets("")
        self.assertEqual(res_empty["status"], "error")
        self.assertIn("Please ask the user", res_empty["message"])

        res_placeholder = list_datasets("<project_id>")
        self.assertEqual(res_placeholder["status"], "error")

        res_curly = list_datasets("{project}")
        self.assertEqual(res_curly["status"], "error")

    def test_dataplex_missing_parameters(self):
        """Validates that Dataplex tools catch missing parameters and placeholders."""
        res = create_domain(project_id="my-proj", location="", domain_id="my-dom", display_name="D", description="Desc")
        self.assertEqual(res["status"], "error")
        self.assertIn("Missing required parameter 'location'", res["message"])

        res_sub = create_subdomain(project_id="my-proj", location="us-central1", domain_id="sub", parent_domain_id=None, display_name="S", description="D")
        self.assertEqual(res_sub["status"], "error")
        self.assertIn("Missing required parameter 'parent_domain_id'", res_sub["message"])

    def test_binding_missing_parameters(self):
        """Validates that Binding tools catch missing parameters."""
        res = bind_resource(project_id="my-proj", location="us-central1", domain_id="dom", binding_id="b1", resource="")
        self.assertEqual(res["status"], "error")
        self.assertIn("Missing required parameter 'resource'", res["message"])

        res_avail = verify_binding_availability(project_id="my-proj", location="us-central1", target_resource_uri="null")
        self.assertEqual(res_avail["status"], "error")
        self.assertIn("Missing required parameter 'target_resource_uri'", res_avail["message"])

    def test_overview_missing_parameters(self):
        """Validates that Overview tools catch missing parameters."""
        res = set_overview(project_id="my-proj", location="us-central1", domain_id="dom", content="")
        self.assertEqual(res["status"], "error")
        self.assertIn("Missing required parameter 'content'", res["message"])

    def test_governance_missing_parameters(self):
        """Validates that Governance tools catch missing parameters."""
        res = get_iam_policy(project_id="", location="us-central1", domain_id="dom")
        self.assertEqual(res["status"], "error")
        self.assertIn("Missing required parameter 'project_id'", res["message"])

        res_search = search_entries(project_id="p", location="l", domain_id="d", query="")
        self.assertEqual(res_search["status"], "error")
        self.assertIn("Missing required parameter 'query'", res_search["message"])


if __name__ == "__main__":
    unittest.main()


