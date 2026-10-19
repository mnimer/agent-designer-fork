"""
Unit Tests for Knowledge Catalog Data Domain Builder Toolsets

Purpose:
Validates full functional coverage of `dataplex_toolset.py`, `bigquery_toolset.py`,
`binding_toolset.py`, `overview_toolset.py`, and `governance_toolset.py` across
simple conditions, extreme conditions, and failure/fallback conditions.

Architectural Decisions:
- Author: Mike Nimer <mikenimer@google.com>
- Uses unittest.mock to mock Google Cloud ADC credentials and requests REST calls.
- Validates payload construction, URL formats, `x-goog-user-project` ADC quota headers,
  location normalization ('US' -> 'us'), structured error return dictionaries (preventing
  ADK HTTP 500 crashes), idempotent 409 handling, `@dataplex` catalog entry sync retries,
  cross-location binding diagnostics, and cascading teardown logic.
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
    def test_list_domains_success_and_quota_header(self, mock_get):
        """Simple condition: List domains successfully with normalized location and x-goog-user-project."""
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"dataDomains": [{"name": "dom1"}]}
        mock_get.return_value = mock_resp

        res = list_domains("test-proj", "US")
        self.assertEqual(res["status"], "ok")
        self.assertEqual(len(res["data"]["dataDomains"]), 1)
        called_url = mock_get.call_args[0][0]
        called_headers = mock_get.call_args[1]["headers"]
        self.assertIn("/locations/us/dataDomains", called_url)
        self.assertEqual(called_headers.get("x-goog-user-project"), "test-proj")

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
        self.assertEqual(call_json["displayName"], "Orders Domain")
        self.assertEqual(call_json["contacts"]["identities"][0]["contactId"], "alice@example.com")

    @patch("requests.get")
    @patch("requests.post")
    def test_create_domain_idempotent_on_409(self, mock_post, mock_get):
        """Extreme condition: Create domain returns existing domain when HTTP 409 Already Exists occurs."""
        mock_409 = MagicMock()
        mock_409.status_code = 409
        mock_post.return_value = mock_409

        mock_existing = MagicMock()
        mock_existing.status_code = 200
        mock_existing.json.return_value = {"name": "projects/test-proj/locations/us/dataDomains/orders"}
        mock_get.return_value = mock_existing

        res = create_domain("test-proj", "US", "orders", "Orders", "Desc")
        self.assertEqual(res["status"], "ok")
        self.assertTrue(res.get("already_existed"))

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
        self.assertTrue(call_json["parentDataDomain"].endswith("/dataDomains/orders"))

    @patch("requests.get")
    def test_list_subdomains_filtered_with_numeric_project_number(self, mock_get):
        """Extreme condition: Filtering subdomains when parentDataDomain uses numeric project number."""
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "dataDomains": [
                {
                    "name": "projects/argolis-playground/locations/us/dataDomains/sub1",
                    "parentDataDomain": "projects/717498696647/locations/us/dataDomains/parent1",
                },
                {
                    "name": "projects/argolis-playground/locations/us/dataDomains/sub2",
                    "parentDataDomain": "projects/717498696647/locations/us/dataDomains/parent2",
                },
            ]
        }
        mock_get.return_value = mock_resp

        res = list_subdomains("argolis-playground", "US", "parent1")
        self.assertEqual(res["status"], "ok")
        self.assertEqual(len(res["data"]["subdomains"]), 1)
        self.assertEqual(res["data"]["subdomains"][0]["name"].split("/")[-1], "sub1")

    @patch("requests.patch")
    def test_update_domain_validation_and_success(self, mock_patch):
        """Extreme condition: Empty update mask vs valid update mask."""
        res_empty = update_domain("p", "l", "dom1")
        self.assertEqual(res_empty["status"], "error")

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"name": "dom1", "displayName": "New Name"}
        mock_patch.return_value = mock_resp

        res = update_domain("p", "l", "dom1", display_name="New Name")
        self.assertEqual(res["status"], "ok")

    @patch("requests.delete")
    def test_delete_domain_success_and_error(self, mock_delete):
        """Failure condition: 204 success vs 409 conflict structured error."""
        mock_204 = MagicMock()
        mock_204.status_code = 204
        mock_delete.return_value = mock_204
        res_ok = delete_domain("p", "l", "dom1")
        self.assertEqual(res_ok["status"], "ok")

        mock_409 = MagicMock()
        mock_409.status_code = 409
        mock_409.raise_for_status.side_effect = requests.exceptions.HTTPError(response=mock_409)
        mock_409.json.return_value = {"error": {"message": "Domain contains bindings"}}
        mock_delete.return_value = mock_409

        res_err = delete_domain("p", "l", "dom1")
        self.assertEqual(res_err["status"], "error")
        self.assertEqual(res_err["http_status"], 409)
        self.assertIn("contains bindings", res_err["message"])

    @patch("requests.get")
    def test_get_domain_principal(self, mock_get):
        """Simple and failure conditions for get_domain_principal."""
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

        mock_resp.json.return_value = {}
        res_missing = get_domain_principal("p", "us-central1", "dom1")
        self.assertEqual(res_missing["status"], "error")
        self.assertIn("does not contain an active 'policyMember'", res_missing["message"])


class TestBigQueryToolset(BaseToolTestCase):
    """Tests for BigQuery catalog discovery and IAM authorization."""

    @patch("requests.get")
    def test_list_datasets_and_tables(self, mock_get):
        """Simple condition: List datasets (with dataplex_location) and list tables."""
        mock_ds_resp = MagicMock()
        mock_ds_resp.status_code = 200
        mock_ds_resp.json.return_value = {
            "datasets": [
                {
                    "datasetReference": {"datasetId": "ds1", "projectId": "p1"},
                    "friendlyName": "DS 1",
                    "location": "US",
                }
            ]
        }
        mock_get.return_value = mock_ds_resp

        ds_res = list_datasets("p1")
        self.assertEqual(ds_res["status"], "ok")
        self.assertEqual(ds_res["count"], 1)
        self.assertEqual(ds_res["datasets"][0]["dataset_id"], "ds1")
        self.assertEqual(ds_res["datasets"][0]["location"], "US")
        self.assertEqual(ds_res["datasets"][0]["dataplex_location"], "us")

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
            "location": "US",
            "numRows": "5000",
            "numBytes": "120000",
        }
        mock_get.return_value = mock_resp

        res = get_table_schema("p1", "ds1", "orders")
        self.assertEqual(res["status"], "ok")
        self.assertEqual(len(res["columns"]), 1)
        self.assertEqual(res["columns"][0]["name"], "order_id")
        self.assertEqual(res["dataplex_location"], "us")

    @patch("requests.patch")
    @patch("requests.get")
    def test_authorize_dataset(self, mock_get, mock_patch):
        """Simple condition: Authorize principal on dataset."""
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
    """Tests for resource binding, cross-location diagnostics, and exclusivity verification."""

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
    @patch("requests.post")
    def test_bind_resource_detects_cross_location_mismatch(self, mock_post, mock_get):
        """Regression condition: Detects when domain in us-central1 tries to bind a BigQuery table in US."""
        mock_403 = MagicMock()
        mock_403.status_code = 403
        mock_403.json.return_value = {
            "error": {"message": "Data domain is not authorized to bind the resource, or the resource doesn't exist."}
        }
        mock_post.return_value = mock_403

        mock_ds_resp = MagicMock()
        mock_ds_resp.status_code = 200
        mock_ds_resp.json.return_value = {"location": "US"}
        mock_get.return_value = mock_ds_resp

        res = bind_resource(
            project_id="argolis-playground",
            location="us-central1",
            domain_id="pipeline-engineering",
            binding_id="b1",
            resource="//bigquery.googleapis.com/projects/argolis-playground/datasets/beam_pipeline_designer/tables/pubsub_messages",
        )
        self.assertEqual(res["status"], "error")
        self.assertTrue(res.get("location_mismatch"))
        self.assertEqual(res.get("domain_location"), "us-central1")
        self.assertEqual(res.get("dataset_location"), "us")
        self.assertIn("Dataplex Location Mismatch", res["message"])

    @patch("tools.binding_toolset.time.sleep")
    @patch("requests.get")
    @patch("requests.post")
    def test_bind_resource_retries_on_iam_propagation_403(self, mock_post, mock_get, mock_sleep):
        """Regression condition: Polls through transient 403 IAM propagation delay when locations match."""
        mock_403 = MagicMock()
        mock_403.status_code = 403
        mock_403.text = "Data domain is not authorized to bind the resource, or the resource doesn't exist."
        mock_403.json.return_value = {"error": {"message": mock_403.text}}

        mock_200 = MagicMock()
        mock_200.status_code = 200
        mock_200.json.return_value = {"name": "projects/p/locations/us/dataDomains/d/bindings/b1"}

        mock_post.side_effect = [mock_403, mock_403, mock_200]

        mock_ds_resp = MagicMock()
        mock_ds_resp.status_code = 200
        mock_ds_resp.json.return_value = {"location": "US"}
        mock_get.return_value = mock_ds_resp

        res = bind_resource(
            project_id="argolis-playground",
            location="us",
            domain_id="pipeline-engineering",
            binding_id="b1",
            resource="//bigquery.googleapis.com/projects/argolis-playground/datasets/beam_pipeline_designer/tables/pubsub_messages",
        )
        self.assertEqual(res["status"], "ok")
        self.assertEqual(mock_post.call_count, 3)
        self.assertEqual(mock_sleep.call_count, 2)

    @patch("tools.binding_toolset.time.sleep")
    @patch("requests.get")
    @patch("requests.post")
    def test_bind_resource_returns_pending_when_iam_propagation_exceeds_window(self, mock_post, mock_get, mock_sleep):
        """Regression condition: Returns non-fatal pending status and sanitizes binding_id when IAM propagation takes >30s."""
        mock_403 = MagicMock()
        mock_403.status_code = 403
        mock_403.text = "Data domain is not authorized to bind the resource, or the resource doesn't exist."
        mock_403.json.return_value = {"error": {"message": mock_403.text}}
        mock_post.return_value = mock_403

        mock_ds_resp = MagicMock()
        mock_ds_resp.status_code = 200
        mock_ds_resp.json.return_value = {"location": "US"}
        mock_get.return_value = mock_ds_resp

        res = bind_resource(
            project_id="argolis-playground",
            location="us",
            domain_id="pipeline-engineering",
            binding_id="Academy.outdoor_products_binding",
            resource="//bigquery.googleapis.com/projects/argolis-playground/datasets/Academy/tables/outdoor_products",
        )
        self.assertEqual(res["status"], "ok")
        self.assertEqual(res.get("iam_propagation"), "pending")
        self.assertEqual(res.get("binding_id"), "academy-outdoor-products-binding")

    @patch("requests.get")
    def test_verify_binding_availability(self, mock_get):
        """Extreme condition: Detect 1:1 binding collision vs available resource."""
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

        mock_bindings.json.return_value = {"dataDomainBindings": []}
        mock_get.side_effect = [mock_domains, mock_bindings]
        res_avail = verify_binding_availability("p", "l", "//bigquery.googleapis.com/.../new_table")
        self.assertEqual(res_avail["status"], "ok")
        self.assertTrue(res_avail["is_available"])


class TestOverviewToolset(BaseToolTestCase):
    """Tests for native Overview aspect documentation and @dataplex catalog entry sync handling."""

    @patch("requests.patch")
    @patch("requests.get")
    def test_set_and_get_overview(self, mock_get, mock_patch):
        """Simple condition: Update and retrieve Markdown overview aspect."""
        mock_dom = MagicMock()
        mock_dom.status_code = 200
        mock_dom.json.return_value = {
            "policyMember": {"iamPolicyNamePrincipal": "principal://dataplex.googleapis.com/projects/12345/..."}
        }
        mock_get.return_value = mock_dom

        mock_patch_resp = MagicMock()
        mock_patch_resp.status_code = 200
        mock_patch_resp.json.return_value = {"name": "entry1"}
        mock_patch.return_value = mock_patch_resp

        set_res = set_overview("p1", "us-central1", "dom1", "# Overview Content", "MARKDOWN")
        self.assertEqual(set_res["status"], "ok")

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

    @patch("tools.overview_toolset.time.sleep")
    @patch("requests.patch")
    @patch("requests.get")
    def test_set_overview_handles_pending_dataplex_catalog_entry_sync(self, mock_get, mock_patch, mock_sleep):
        """Regression condition: Handles 403 'or it may not exist' when @dataplex entry is syncing in background."""
        mock_dom = MagicMock()
        mock_dom.status_code = 200
        mock_dom.json.return_value = {
            "policyMember": {"iamPolicyNamePrincipal": "principal://dataplex.googleapis.com/projects/717498696647/..."}
        }
        mock_get.return_value = mock_dom

        mock_403 = MagicMock()
        mock_403.status_code = 403
        mock_403.json.return_value = {
            "error": {
                "message": "Permission denied on resource `projects/717498696647/locations/us/entryGroups/@dataplex/entries/...` (or it may not exist)."
            }
        }
        mock_patch.return_value = mock_403

        res = set_overview("argolis-playground", "us", "data-platform", "# Overview", "MARKDOWN")
        self.assertEqual(res["status"], "ok")
        self.assertEqual(res.get("catalog_entry_sync"), "pending")
        self.assertEqual(mock_patch.call_count, 4)


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
        mock_lb.return_value = {
            "status": "ok",
            "data": {"dataDomainBindings": [{"name": "projects/p/.../bindings/b1"}]},
        }
        mock_ub.return_value = {"status": "ok"}

        mock_ls.side_effect = [
            {"status": "ok", "data": {"subdomains": [{"name": "projects/p/.../dataDomains/sub1"}]}},
            {"status": "ok", "data": {"subdomains": []}},
        ]
        mock_dd.return_value = {"status": "ok"}

        res = cascading_teardown_domain("p", "l", "parent-dom")
        self.assertEqual(res["status"], "ok")
        self.assertTrue(res["data"]["deleted"])
        self.assertEqual(len(res["data"]["unbound_resources"]), 1)
        self.assertEqual(len(res["data"]["deleted_subdomains"]), 1)


class TestErrorHandlingAndLRO(BaseToolTestCase):
    """Tests verifying structured error dictionaries (no uncaught RuntimeError) and LRO polling."""

    @patch("tools.dataplex_toolset.time.sleep")
    @patch("requests.get")
    def test_wait_for_lro_success(self, mock_get, mock_sleep):
        """Validates LRO polls until done: true."""
        from tools.dataplex_toolset import wait_for_lro
        op_initial = {"name": "projects/p/locations/l/operations/op1", "done": False}

        mock_poll_resp = MagicMock()
        mock_poll_resp.status_code = 200
        mock_poll_resp.json.return_value = {
            "name": "projects/p/locations/l/operations/op1",
            "done": True,
            "response": {"name": "projects/p/locations/l/dataDomains/dom1"},
        }
        mock_get.return_value = mock_poll_resp

        res = wait_for_lro(op_initial, self.mock_creds, timeout_seconds=10, poll_interval=0.01)
        self.assertEqual(res.get("status"), "ok")
        self.assertIn("name", res.get("data", {}))

    @patch("tools.dataplex_toolset.time.sleep")
    @patch("requests.get")
    def test_wait_for_lro_failure_returns_structured_error(self, mock_get, mock_sleep):
        """Validates LRO returns structured error dictionary if operation finishes with an error."""
        from tools.dataplex_toolset import wait_for_lro
        op_initial = {"name": "projects/p/locations/l/operations/op1", "done": False}

        mock_poll_resp = MagicMock()
        mock_poll_resp.status_code = 200
        mock_poll_resp.json.return_value = {
            "name": "projects/p/locations/l/operations/op1",
            "done": True,
            "error": {"code": 7, "message": "Permission denied on KMS key"},
        }
        mock_get.return_value = mock_poll_resp

        res = wait_for_lro(op_initial, self.mock_creds, timeout_seconds=10, poll_interval=0.01)
        self.assertEqual(res.get("status"), "error")
        self.assertIn("Permission denied", res.get("message", ""))

    @patch("requests.post")
    def test_bind_resource_http_error_returns_structured_error(self, mock_post):
        """Validates bind_resource returns structured error dictionary when API returns HTTP 400."""
        mock_resp = MagicMock()
        mock_resp.status_code = 400
        mock_resp.raise_for_status.side_effect = requests.exceptions.HTTPError(response=mock_resp)
        mock_resp.json.return_value = {"error": {"message": "Invalid resource URI format"}}
        mock_post.return_value = mock_resp

        res = bind_resource("p", "l", "dom1", "b1", "//invalid/uri")
        self.assertEqual(res["status"], "error")
        self.assertEqual(res["http_status"], 400)
        self.assertIn("Invalid resource URI format", res["message"])

    @patch("requests.get")
    def test_bigquery_http_error_returns_structured_error(self, mock_get):
        """Validates list_datasets returns structured error dictionary on BigQuery HTTP 403."""
        mock_resp = MagicMock()
        mock_resp.status_code = 403
        mock_resp.raise_for_status.side_effect = requests.exceptions.HTTPError(response=mock_resp)
        mock_resp.json.return_value = {"error": {"message": "Access Denied: Dataset project:ds"}}
        mock_get.return_value = mock_resp

        res = list_datasets("p")
        self.assertEqual(res["status"], "error")
        self.assertEqual(res["http_status"], 403)
        self.assertIn("Access Denied", res["message"])

    @patch("requests.get")
    @patch("requests.patch")
    def test_overview_http_error_returns_structured_error(self, mock_patch, mock_get):
        """Validates set_overview returns structured error dictionary when catalog PATCH fails with 404."""
        mock_dom = MagicMock()
        mock_dom.status_code = 200
        mock_dom.json.return_value = {"policyMember": {"iamPolicyNamePrincipal": "principal://..."}}
        mock_get.return_value = mock_dom

        mock_patch_resp = MagicMock()
        mock_patch_resp.status_code = 404
        mock_patch_resp.raise_for_status.side_effect = requests.exceptions.HTTPError(response=mock_patch_resp)
        mock_patch_resp.json.return_value = {"error": {"message": "Entry not found in catalog"}}
        mock_patch.return_value = mock_patch_resp

        res = set_overview("p", "us-central1", "dom1", "# Test")
        self.assertEqual(res["status"], "error")
        self.assertEqual(res["http_status"], 404)
        self.assertIn("Entry not found", res["message"])


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
