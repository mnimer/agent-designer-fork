---
name: adk-mcp
description: "MCP toolsets in ADK: local stdio and remote Streamable HTTP servers, ID-token header providers, Google Workspace remote MCP servers with caller-aware auth, Databricks and Snowflake managed MCP; load when any tool is an MCP tool."
metadata:
  usedBy: [generator]
  targets: [all]
  preloadWhen: [mcp]
---

### MCP Tools

Connect to MCP servers to use external tools (needs the `mcp` extra: scaffolded projects ship `google-adk[gcp,otel-gcp]`, so add `mcp` and re-sync). Use `StdioConnectionParams` for local dev, `StreamableHTTPConnectionParams` for remote HTTP servers.

```python
from google.adk.tools.mcp_tool import McpToolset
from google.adk.tools.mcp_tool.mcp_session_manager import StdioConnectionParams, StreamableHTTPConnectionParams
from mcp import StdioServerParameters

# Local MCP server via stdio
agent = Agent(
    name="my_agent",
    tools=[
        McpToolset(
            connection_params=StdioConnectionParams(
                server_params=StdioServerParameters(
                    command="npx",
                    args=["-y", "@modelcontextprotocol/server-filesystem", "/absolute/path"],
                ),
            ),
            tool_filter=["list_directory", "read_file"],  # optional: restrict exposed tools
        )
    ],
    ...
)

# Remote MCP server, e.g. Cloud Run with --no-allow-unauthenticated. ID tokens
# expire in ~1h, so mint per call via `header_provider` (ADK calls it on every
# tool call); a static `headers` dict goes stale. Audience = root, not /mcp.
from google.auth.transport.requests import Request
from google.oauth2.id_token import fetch_id_token

McpToolset(
    connection_params=StreamableHTTPConnectionParams(url=f"{MCP_SERVER_URL}/mcp"),
    header_provider=lambda ctx: {
        "Authorization": f"Bearer {fetch_id_token(Request(), MCP_SERVER_URL)}"
    },
)

# Google Workspace Remote MCP Servers (`category === 'google_workspace_mcp'`, `workspace_mcp_*`, `https://*mcp.googleapis.com/mcp/v1`)
# Google Workspace Remote MCP Servers (gmailmcp.googleapis.com, drivemcp.googleapis.com, docsmcp.googleapis.com,
# sheetsmcp.googleapis.com, slidesmcp.googleapis.com, calendarmcp.googleapis.com, chatmcp.googleapis.com,
# meetmcp.googleapis.com, tasksmcp.googleapis.com, people.googleapis.com, formsmcp.googleapis.com,
# keepmcp.googleapis.com, classroommcp.googleapis.com) are USER-SCOPED APIs and must act on behalf of the calling user.
# They use `McpToolset` with `StreamableHTTPConnectionParams` and a caller-aware `header_provider` that inspects
# ADK's `ReadonlyContext` (`ctx`) on every tool call in strict priority order:
#   1. Per-Caller OAuth 2.0 Bearer Token in `ctx.session.state` (`tokenStateKey`, default `"user_access_token"` or `"workspace_access_token"`)
#   2. Domain-Wide Delegation subject impersonation (`credentials.with_subject(caller_email)`) using `ctx.session.state.get("user_email")`, `ctx.session.user_id`, or `subject_email`
#   3. Local Workstation ADC Fallback (`google.auth.default(scopes=scopes)`) from `gcloud auth application-default login`
import os
from typing import Any, Optional
import google.auth
from google.auth.transport.requests import Request
from google.adk.tools.mcp_tool import McpToolset
from google.adk.tools.mcp_tool.mcp_session_manager import StreamableHTTPConnectionParams

# Normalize HTTP 401/403 status on valid JSON-RPC 2.0 responses from *.googleapis.com/mcp
# (Google ESF returns HTTP 403 alongside valid JSON-RPC result/isError payloads when scopes are missing)
for _httpx_mod_name in ("httpx2", "httpx"):
    try:
        _httpx_mod = __import__(_httpx_mod_name)
        _orig_httpx_send = _httpx_mod.AsyncClient.send
        def _make_mcp_send(_orig):
            async def _mcp_jsonrpc_send(self, request, *args, **kwargs):
                resp = await _orig(self, request, *args, **kwargs)
                if resp.status_code in (401, 403) and ".googleapis.com/mcp" in str(getattr(request, "url", "")):
                    if resp.headers.get("content-type", "").lower().startswith("application/json"):
                        resp.status_code = 200
                return resp
            return _mcp_jsonrpc_send
        _httpx_mod.AsyncClient.send = _make_mcp_send(_orig_httpx_send)
    except Exception:
        pass

def get_workspace_mcp_headers(
    ctx: Optional[Any],
    scopes: list[str],
    token_state_key: str = "user_access_token",
    subject_email: Optional[str] = None,
) -> dict[str, str]:
    """Resolves OAuth 2.0 Bearer credentials acting on behalf of the calling user with ADC fallback."""
    headers: dict[str, str] = {}
    user_project = os.environ.get("GOOGLE_CLOUD_PROJECT") or os.environ.get("GOOGLE_CLOUD_PROJECT_ID")
    if user_project:
        headers["X-Goog-User-Project"] = user_project

    # 1. Check if the calling user's OAuth 2.0 access token was passed in ADK state
    # (Gemini Enterprise / Vertex AI AdkApp injects `request.authorizations` as `temp:<auth_id>` in `ctx.state`)
    state = getattr(ctx, "state", None) or getattr(getattr(ctx, "session", None), "state", None) or {}
    caller_token = (
        state.get(token_state_key)
        or state.get(f"temp:{token_state_key}")
        or state.get("user_access_token")
        or state.get("temp:user_access_token")
        or state.get("workspace_access_token")
        or state.get("temp:workspace_access_token")
    )
    if not caller_token and hasattr(state, "items"):
        for _k, _v in state.items():
            if isinstance(_k, str) and (
                _k.startswith("temp:")
                or "oauth" in _k.lower()
                or "access_token" in _k.lower()
            ):
                if isinstance(_v, str) and _v.strip():
                    caller_token = _v.strip()
                    break
                elif isinstance(_v, dict) and isinstance(_v.get("access_token"), str):
                    caller_token = _v["access_token"].strip()
                    break
    if not caller_token:
        caller_token = os.environ.get("WORKSPACE_USER_ACCESS_TOKEN")

    if caller_token:
        token_str = str(caller_token).strip()
        headers["Authorization"] = token_str if token_str.lower().startswith("bearer ") else f"Bearer {token_str}"
        return headers

    # 2. Fallback to Google Auth credentials (with optional Domain-Wide Delegation subject impersonation)
    credentials, _ = google.auth.default(scopes=scopes)
    session_user_id = getattr(ctx, "user_id", None) or getattr(getattr(ctx, "session", None), "user_id", None)
    resolved_subject = (
        state.get("user_email")
        or (session_user_id if isinstance(session_user_id, str) and "@" in session_user_id else None)
        or subject_email
    )
    if resolved_subject and hasattr(credentials, "with_subject"):
        credentials = credentials.with_subject(resolved_subject)
    if not credentials.valid:
        credentials.refresh(Request())
    headers["Authorization"] = f"Bearer {credentials.token}"
    return headers

# Example: Gmail Remote MCP Toolset (configured with scopes from workspaceConfig.scopePreset and caller identity)
workspace_toolset = McpToolset(
    connection_params=StreamableHTTPConnectionParams(
        url="https://gmailmcp.googleapis.com/mcp/v1",
        timeout=30,
    ),
    header_provider=lambda ctx: get_workspace_mcp_headers(
        ctx,
        scopes=["https://www.googleapis.com/auth/gmail.readonly"],
        token_state_key="user_access_token",
    ),
)

# Databricks Managed MCP (Genie Space, Vector Search, Unity Catalog, SQL)
# When Databricks MCP tools are attached (databricksConfig / databricks_mcp_*),
# connect over Streamable HTTP with DATABRICKS_TOKEN Bearer auth.
# Add DATABRICKS_TOKEN to .env.example and provision google_secret_manager_secret (databricks-mcp-token) in main.tf.
McpToolset(
    connection_params=StreamableHTTPConnectionParams(
        url=os.environ.get("DATABRICKS_MCP_URL", "https://<workspace-hostname>/api/2.0/mcp/..."),
        headers={"Authorization": f"Bearer {os.environ.get('DATABRICKS_TOKEN', '')}"},
    ),
)

# Snowflake Managed & Cortex MCP (Analyst, Search, Agent, SQL, Generic)
# When Snowflake MCP tools are attached (snowflakeConfig / snowflake_mcp_*),
# connect over Streamable HTTP (or Stdio for snowflake-labs-mcp CLI mode) with SNOWFLAKE_MCP_TOKEN.
# Add SNOWFLAKE_MCP_TOKEN to .env.example and provision google_secret_manager_secret (snowflake-mcp-token) in main.tf.
McpToolset(
    connection_params=StreamableHTTPConnectionParams(
        url=os.environ.get("SNOWFLAKE_MCP_URL", "https://<account>.snowflakecomputing.com/api/v2/databases/<db>/schemas/<schema>/mcp-servers/<server>"),
        headers={"Authorization": f"Bearer {os.environ.get('SNOWFLAKE_MCP_TOKEN', '')}"},
    ),
)
```

**Gotchas:**
- Paths must be absolute, not relative.
- Agent definition must be synchronous (not async) for deployment.
- Node.js/npx required for npm-based MCP servers — add to Dockerfile if containerizing.
