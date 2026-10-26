---
name: adk-a2a
description: "Agent-to-Agent (A2A) protocol in ADK: exposing agents as A2A services and consuming remote A2A agents with RemoteA2aAgent, auth, and JSON-RPC client tools; load when any node has agentKind a2a or A2A endpoints are required."
metadata:
  usedBy: [generator]
  targets: [all]
  preloadWhen: [a2a]
---

## 11. A2A Protocol

Requires `pip install "google-adk[a2a]>=2.0.0" "a2a-sdk[http-server]>=0.3.4"`.

### Exposing an agent as an A2A service
```python
from google.adk.a2a.utils.agent_to_a2a import to_a2a
from a2a.types import AgentCard
to_a2a(root_agent, port=8001)
```

### Consuming a remote A2A agent (CRITICAL RULES)
CRITICAL ADK RULES:
1. `RemoteA2aAgent` is imported ONLY from `google.adk.agents.remote_a2a_agent import RemoteA2aAgent`.
2. NEVER import `google.adk.auth.google_iam_auth` or `google.adk.auth.auth_credential` — these modules DO NOT EXIST in ADK.
3. NEVER pass `auth_credential=`, `custom_headers=`, or `output_key=` to `RemoteA2aAgent(...)` — these parameters DO NOT EXIST on `RemoteA2aAgent`.
4. NEVER write `App.ResumabilityConfig(...)`. `App` is a Pydantic model and does not expose `ResumabilityConfig` as an attribute. Always import it at top-level: `from google.adk.apps import App, ResumabilityConfig` and write `resumability_config=ResumabilityConfig(is_resumable=True)`.
5. When `a2aConfig.rawJsonPack` is provided in the workflow node, emit a `<agent_name>_agent_card.json` file containing the JSON card payload, and pass its path to `agent_card=`:
   ```python
   from pathlib import Path
   from google.adk.agents.remote_a2a_agent import RemoteA2aAgent

   card_path = str(Path(__file__).parent / "<agent_name>_agent_card.json")
   remote_agent = RemoteA2aAgent(
       name="<agent_name>",
       description="...",
       agent_card=card_path,
   )
   ```
6. When connecting to Google Cloud A2A endpoints (e.g. `*.googleapis.com`, Cloud Run endpoints requiring Google Cloud authentication, or when `authType: "google_iam"` with `targetAudience` is configured):
   - Securely generate OIDC Identity Tokens by importing from `google.auth.transport.requests import Request` and `google.oauth2.id_token import fetch_id_token`:
   ```python
   import os
   import httpx
   from google.auth.transport.requests import Request
   from google.oauth2.id_token import fetch_id_token
   from google.adk.agents.remote_a2a_agent import RemoteA2aAgent

   target_audience = os.getenv("A2A_TARGET_AUDIENCE", "https://catalog-service.vendor-corp.internal")
   try:
       token = fetch_id_token(Request(), audience=target_audience)
       headers = {"Authorization": f"Bearer {token}"}
   except Exception:
       headers = {}

   # Disable persistent keepalive connections so pooled sockets are not reused across closed asyncio event loops
   limits = httpx.Limits(max_keepalive_connections=0)
   httpx_client = httpx.AsyncClient(headers=headers, timeout=45.0, limits=limits)

   remote_agent = RemoteA2aAgent(
       name="<agent_name>",
       description="...",
       agent_card=card_path,
       httpx_client=httpx_client,
   )
   ```
   - In `tools.py`, if client functions/tools are generated for A2A JSON-RPC 2.0 communication (e.g. `query_vendor_catalog_a2a`), import `from google.auth.transport.requests import Request` and `from google.oauth2.id_token import fetch_id_token` to fetch and attach the OIDC Bearer token in the `Authorization` header, and execute JSON-RPC 2.0 calls (`{"jsonrpc": "2.0", "method": ..., "params": ..., "id": ...}`) with explicit `timeout=45.0` and retry logic.
