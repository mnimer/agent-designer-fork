---
name: adk-triggers-streaming
description: "Inbound invocation channels: event-driven/ambient agents via ADK trigger_sources (Pub/Sub, Eventarc, scheduler) and live bidirectional WebSocket streaming; load when the blueprint has pubsub/eventarc/cron triggers or liveStreamingConfig."
metadata:
  usedBy: [generator]
  targets: [all]
  preloadWhen: [event_triggers]
---

# Triggers, Event-Driven Agents & Live Streaming

## 12. Event-Driven / Ambient Agents

Ambient agents process events (Pub/Sub, Eventarc, schedules) autonomously. ADK provides built-in trigger endpoints that handle payload decoding, session creation, concurrency, and retries.

> **Deployment:** `trigger_sources` registers `/apps/{app}/trigger/*` on the standard FastAPI app, so it works on **all** targets. On **Cloud Run** / **GKE** the endpoints are public HTTP routes you point a Pub/Sub push subscription or Eventarc trigger at. On **Agent Runtime** the same routes are reachable through Agent Engine's `/api` passthrough (`https://{location}-aiplatform.googleapis.com/reasoningEngines/v1/{resource}/api/apps/{app}/trigger/pubsub`). The scaffolded `fast_api_app.py` does not pass `trigger_sources` by default — add it to enable these endpoints.

> **Deployment:** `trigger_sources` registers `/apps/{app}/trigger/*` on the standard FastAPI app, so it works on **all** targets. On **Cloud Run** / **GKE** the endpoints are public HTTP routes you point a Pub/Sub push subscription or Eventarc trigger at. On **Agent Runtime** the same routes are reachable through Agent Engine's `/api` passthrough (`https://{location}-aiplatform.googleapis.com/reasoningEngines/v1/{resource}/api/apps/{app}/trigger/pubsub`). When deployed as a container, `adk api_server` enables trigger endpoints via `--trigger_sources "pubsub,eventarc"`.

```python
from google.adk.cli.fast_api import get_fast_api_app

app = get_fast_api_app(
    agents_dir=AGENTS_DIR,
    web=False,
    trigger_sources=["pubsub", "eventarc"],  # enables /apps/{app}/trigger/pubsub and /apps/{app}/trigger/eventarc
)
```

```bash
# CLI equivalent for local dev
adk api_server --trigger_sources "pubsub,eventarc" path/to/your/agent
```

Trigger endpoints handle: base64 decoding, CloudEvent parsing, per-event session creation (UUID), concurrency semaphore, and exponential backoff on transient errors.

| Setting | Default | Environment Variable |
|---------|---------|----------------------|
| Max concurrent invocations | 10 | `ADK_TRIGGER_MAX_CONCURRENT` |
| Max retry attempts | 3 | `ADK_TRIGGER_MAX_RETRIES` |
| Base backoff delay | 1.0s | `ADK_TRIGGER_RETRY_BASE_DELAY` |
| Max backoff delay | 30.0s | `ADK_TRIGGER_RETRY_MAX_DELAY` |

Sessions are ephemeral by default (`InMemorySessionService`); use `DatabaseSessionService` for audit trails. Pub/Sub and Eventarc have a 10-minute processing limit. For non-GCP sources, use `adk api_server --auto_create_session` with the `/run` endpoint instead.

**Scheduled / cron execution:** Use Cloud Scheduler to publish to a Pub/Sub topic on a cron schedule, then connect the topic to the agent's `/apps/{app}/trigger/pubsub` endpoint. This is how you implement "run daily at 8 PM" — no custom scheduling code needed.

Since ambient agents have no interactive user, route outputs via structured logging (JSON stdout → Cloud Logging → Cloud Monitoring alerts), Pub/Sub, or tool-based integrations (email, Jira, Slack).

**Before implementing an ambient agent, clone and study the production sample** — it covers trigger wiring, middleware, structured logging, and Terraform. Look it up in the topic index in `references/samples.md`. [Full docs](https://adk.dev/runtime/ambient-agents/).

## Live Streaming / WebSocket (`liveStreamingConfig`, TASK-235)

- When enabled, in `server.py` expose FastAPI WebSocket endpoint `GET /ws/live` using `from google.adk.runners import LiveRequestQueue, RunConfig` and `await runner.run_live(...)`.
