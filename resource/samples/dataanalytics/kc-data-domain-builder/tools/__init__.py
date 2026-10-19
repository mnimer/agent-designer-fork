"""
Knowledge Catalog Data Domain Builder Tools Package

Purpose:
Exports custom toolsets for the Data Domain Builder multi-agent system,
including Dataplex domain lifecycle, BigQuery metadata discovery & authorization,
resource binding and exclusivity verification, native Overview aspect documentation,
and domain IAM governance with safe cascading teardown.

Architectural Decisions:
- Author: Steve Thill <stevethill@google.com>
- Modularizes toolsets by functional domain across the 5 specialized sub-agents:
  Orchestrator, Discovery, DDD Architect, Provisioner, and Governance.
"""

from .dataplex_toolset import (
    list_domains,
    create_domain,
    create_subdomain,
    get_domain,
    list_subdomains,
    update_domain,
    delete_domain,
    get_domain_principal,
)
from .bigquery_toolset import (
    list_datasets,
    list_tables,
    get_table_schema,
    authorize_dataset,
    authorize_table,
)
from .binding_toolset import (
    bind_resource,
    list_bindings,
    unbind_resource,
    verify_binding_availability,
)
from .overview_toolset import (
    set_overview,
    get_overview,
)
from .governance_toolset import (
    get_iam_policy,
    set_iam_policy,
    add_iam_member,
    search_entries,
    cascading_teardown_domain,
)

__all__ = [
    # Dataplex Lifecycle
    "list_domains",
    "create_domain",
    "create_subdomain",
    "get_domain",
    "list_subdomains",
    "update_domain",
    "delete_domain",
    "get_domain_principal",
    # BigQuery Discovery & Auth
    "list_datasets",
    "list_tables",
    "get_table_schema",
    "authorize_dataset",
    "authorize_table",
    # Resource Binding & Exclusivity
    "bind_resource",
    "list_bindings",
    "unbind_resource",
    "verify_binding_availability",
    # Documentation & Overviews
    "set_overview",
    "get_overview",
    # Governance & Search
    "get_iam_policy",
    "set_iam_policy",
    "add_iam_member",
    "search_entries",
    "cascading_teardown_domain",
]

