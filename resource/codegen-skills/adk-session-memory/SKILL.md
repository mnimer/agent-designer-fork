---
name: adk-session-memory
description: "Session persistence and memory: session_store.py checkpointer backends, ADK state prefixes, initial session state, session services and rewind, artifacts, and long-term Memory Bank; load for session_store.py, memoryConfig, artifactConfig, or longTermMemory."
metadata:
  usedBy: [generator]
  targets: [all]
---

# Sessions, State, Artifacts & Memory

### SESSION MEMORY & PRODUCTION CHECKPOINTERS:
- Inspect the blueprint JSON for session memory configuration (`memoryConfig` on nodes or workflow metadata).
- **Supported Memory Backends**:
  * `'in_memory'`: In-Memory Turn Buffer (`InMemorySessionStore`)
  * `'sqlite'`: Local Embedded SQLite Checkpointer (`SqliteSessionStore` using standard library `sqlite3` with thread safety)
  * `'firestore'`: Google Cloud Firestore / Firebase Checkpointer (`FirestoreSessionStore` using `google-cloud-firestore`)
  * `'postgres'` | `'cloud_sql'`: Google Cloud SQL (PostgreSQL / MySQL) Checkpointer (`CloudSqlSessionStore` using `psycopg2-binary` and `sqlalchemy`). Must implement auto-DDL execution in `_init_db()` (`CREATE TABLE IF NOT EXISTS {table_name} (session_id VARCHAR(255) PRIMARY KEY, state JSONB, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`), resolve database credentials safely via `DATABASE_URL` or `LOAN_DB_SECRET` or `os.getenv(db_secret_env)` (NEVER hardcode default fallback URIs containing credentials like `'postgresql://postgres:postgres@localhost:5432/...'`; if the environment variable is unset, fall back to `sqlite:///:memory:` or `InMemorySessionStore`), and execute safe parameterized queries (`text("SELECT state FROM ... WHERE session_id = :sid")` with `:sid` bind parameter) to prevent SQL injection.
  * `'spanner'`: Google Cloud Spanner Enterprise Checkpointer (`SpannerSessionStore` using `google-cloud-spanner`). Must resolve instance ID from `SPANNER_INSTANCE_ID` (or `memoryConfig.instanceId`), database ID from `SPANNER_DATABASE_ID` (or `memoryConfig.databaseId`), table name from `SPANNER_TABLE_NAME` (or `memoryConfig.tableName`, defaulting to `'PatientSessions'`), and project ID from `GOOGLE_CLOUD_PROJECT` or `GCP_PROJECT`. Must implement auto-DDL verification/creation in `_init_db()` (`CREATE TABLE IF NOT EXISTS {table_name} (session_id STRING(256) NOT NULL, state JSON, created_at TIMESTAMP NOT NULL OPTIONS (allow_commit_timestamp=true), updated_at TIMESTAMP NOT NULL OPTIONS (allow_commit_timestamp=true)) PRIMARY KEY (session_id)`), use safe parameterized queries (`SELECT state FROM {table_name} WHERE session_id = @sid` with `params={"sid": session_id}`) to prevent SQL injection, and implement `get_session(session_id)`, `save_session(session_id, state)`, and `clear_session(session_id)`.
  * `'redis'`: Cloud Memorystore (Redis / Valkey) Checkpointer (`RedisSessionStore` using `redis` client). Must support configurable `ttl_seconds` (default 86400) and execute `set(key, json.dumps(state), ex=ttl_seconds)` or `expire(key, ttl_seconds)` for session TTL management, resolving connection host/port/auth from environment variables (`REDIS_HOST`, `REDIS_PORT`, `REDIS_AUTH_SECRET`, `REDIS_PASSWORD`).
  * `'none'`: Stateless (`StatelessSessionStore`)
- You MUST generate `session_store.py` providing `BaseSessionStore`, `StatelessSessionStore`, `InMemorySessionStore`, `SqliteSessionStore`, `FirestoreSessionStore`, `CloudSqlSessionStore`, `SpannerSessionStore`, `RedisSessionStore`, and a factory function `get_session_store(backend: Optional[str] = None) -> BaseSessionStore`.
- **CRITICAL completeness rule for `session_store.py`**: NEVER stub `FirestoreSessionStore`, `CloudSqlSessionStore`, `SpannerSessionStore`, or `RedisSessionStore` by delegating to `InMemorySessionStore()` or `pass`. Every session store class in `session_store.py` MUST contain a complete, real production implementation using its respective driver (`google-cloud-firestore`, `sqlalchemy` + `psycopg2`, `google-cloud-spanner`, `redis`) with lazy client initialization.

### Cloud Run

- In `server.py` and `agent.py`, import `from session_store import get_session_store` and use `session_store = get_session_store()` to persist session history and state between FastAPI request turns.

### Agent Runtime (Agent Engine)

- In `agent.py` (and test harnesses), import `from session_store import get_session_store` and use `session_store = get_session_store()` to manage conversation state across multi-turn interactions.

### Dependencies & Configuration (both targets)

- In `requirements.txt`, include the corresponding driver packages:
  * For Firestore: `google-cloud-firestore>=2.16.0`
  * For Cloud SQL / Postgres: `psycopg2-binary>=2.9.9`, `sqlalchemy>=2.0.0`
  * For Spanner: `google-cloud-spanner>=3.40.0`
  * For Redis: `redis>=5.0.0`
- In `.env.example`, include `SESSION_STORE_BACKEND=<configured_type>` along with any relevant connection parameters.

## 8. Context, State, and Memory

| Need | Solution |
|---|---|
| Within one conversation (task data, form state) | Session state — see [State Prefixes](#state-prefixes) and [Session Service Options](#session-service-options) below |
| Across conversations (remember interactions, learn over time) | Memory Bank — see [Memory](#memory-long-term-knowledge) below |

### State Prefixes

```python
# Session-specific (default)
state["booking_step"] = 2

# User-persistent (across sessions)
state["user:preferred_language"] = "en"

# App-wide (all users)
state["app:total_queries"] = 1000

# Temporary (current invocation only)
state["temp:intermediate_result"] = data
```

### Initial Session State Pre-loading (`data/initial_session_state.json`, TASK-215)

When initializing new sessions or test harness scenarios, check if `data/initial_session_state.json` exists relative to the package root. If present, load its JSON dictionary and pass it as `initial_state` or merge into `session.state`:

```python
import json
from pathlib import Path

def load_initial_session_state() -> dict:
    state_path = Path(__file__).resolve().parent / "data" / "initial_session_state.json"
    if state_path.is_file():
        try:
            with open(state_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logging.getLogger(__name__).warning("Failed to load initial session state: %s", e)
    return {}

# Pass to session creation:
session = await session_service.create_session(
    app_name=APP_NAME,
    user_id=user_id,
    session_id=session_id,
    state=load_initial_session_state(),
)
```

### Session Service Options

```python
from google.adk.sessions import InMemorySessionService
# For dev: InMemorySessionService()
# For prod: VertexAiSessionService(), DatabaseSessionService()
```

### Session Rewind

Roll back a session to the state before a specific invocation (useful for debugging or user-initiated undo):

```python
from google.adk.runners import InMemoryRunner

runner = InMemoryRunner(agent=root_agent, app_name="my_app")

# Rewind to state before a given invocation
await runner.rewind_async(
    user_id=user_id,
    session_id=session.id,
    rewind_before_invocation_id=invocation_id,  # exclusive: state before this call
)
```

> **Note**: Restores session-level state and artifacts only; app/user-scoped state is unaffected.

### Artifacts (File Storage)

Store and retrieve binary data (PDFs, images, audio) scoped to session or user:

```python
from google.adk.artifacts import InMemoryArtifactService, GcsArtifactService
from google.genai import types

# Configure runner with artifact service
runner = Runner(
    agent=root_agent,
    app_name="app",
    session_service=session_service,
    artifact_service=InMemoryArtifactService(),  # or GcsArtifactService(bucket_name="my-bucket")
)

# In a tool or callback:
async def save_file(data: bytes, tool_context: ToolContext) -> dict:
    part = types.Part(inline_data=types.Blob(mime_type="application/pdf", data=data))
    version = await tool_context.save_artifact("report.pdf", part)       # session-scoped
    await tool_context.save_artifact("user:profile.png", part)           # user-scoped
    artifact = await tool_context.load_artifact("report.pdf")            # latest version
    artifact_v0 = await tool_context.load_artifact("report.pdf", version=0)
    names = await tool_context.list_artifacts()
    return {"status": "saved", "version": version}
```

**Namespace prefixes:** plain name = session-scoped · `"user:"` = persistent across sessions

### Memory (Long-term Knowledge)

#### InMemoryMemoryService (Dev)

In-memory implementation for local development. Memories don't persist across restarts.

```python
from google.adk.memory import InMemoryMemoryService

memory_service = InMemoryMemoryService()
# Add session to memory after conversation
await memory_service.add_session_to_memory(session)
# Search later
results = await memory_service.search_memory(app_name=app_name, user_id=user_id, query="query")
```

#### Memory Bank (Long-term Memory)

Managed cross-session memory that persists user preferences, remembers facts across sessions, and learns from conversations over time. See the [`cross-session-memory` recipe](https://github.com/google/adk-samples/tree/main/core/python/cross-session-memory) for a complete implementation.

```python
from google.adk.agents.callback_context import CallbackContext
from google.adk.tools.preload_memory_tool import PreloadMemoryTool

# PreloadMemoryTool retrieves memories at the start of each turn and injects
# them into the system instruction. Alternative: LoadMemoryTool() — the model
# calls it on-demand when it decides memories are needed.
root_agent = Agent(
    ...,
    tools=[PreloadMemoryTool()],
    after_agent_callback=generate_memories_callback,
)

# Alternative: callback_context.add_events_to_memory(events=...) to send only
# a subset of events, which is better for incremental processing.
async def generate_memories_callback(callback_context: CallbackContext):
    """Sends the session's events to Memory Bank for memory generation."""
    await callback_context.add_session_to_memory()
    return None
```

## Artifact Service (`artifactConfig`, TASK-224)

- When `artifactConfig` is configured on nodes or deployment:
  * For local dev / in-memory: use `from google.adk.artifacts import InMemoryArtifactService; artifact_service = InMemoryArtifactService()`.
  * For cloud / GCS: use `from google.adk.artifacts import GcsArtifactService; artifact_service = GcsArtifactService(bucket_name=os.getenv("ARTIFACT_BUCKET_NAME", "<bucket>"))`.
  * Pass `artifact_service=artifact_service` to `Runner(..., artifact_service=artifact_service)`.

## Long-Term Memory Banks (`longTermMemory`, TASK-236)

- When configured, instantiate `from google.adk.memory import VertexAiMemoryBankService, VertexAiRagMemoryService`.
- Pass `memory_service` to `Runner(..., memory_service=memory_service)`.
- In `agent.py`, attach `after_agent_callback` to save conversation sessions to memory:
  ```python
  async def persist_memory_callback(agent, session, **kwargs):
      await memory_service.add_session_to_memory(session)
  ```
