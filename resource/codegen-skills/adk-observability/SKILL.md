---
name: adk-observability
description: "Logging, tracing, and metrics for generated agents: no print(), structured logging, ADK OpenTelemetry GenAI conventions, and Cloud Trace/Logging/Monitoring exporters; load when writing agent.py, tools, or server entrypoints."
metadata:
  usedBy: [generator]
  targets: [all]
---

# Observability: Logging, Tracing & Metrics

## Summary

* **NO Hardcoded `print()` Statements**: Under NO circumstances should you use `print()` for agent tracing or logging. Do NOT subclass `Agent` or override `_run_async_impl` to intercept execution.
* **Structured Logging**: Configure Python's standard `logging` module (`logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(name)s - %(message)s')`) in `server.py`, `main.py`, and `agent.py`. All ADK loggers are children of `google_adk` (use `DEBUG` level for LLM prompt/response inspection).
* **Distributed Tracing & Metrics**: ADK natively implements OpenTelemetry GenAI Semantic Conventions (`invoke_agent`, `invoke_workflow`, `execute_tool`, `generate_content`, `gen_ai.client.token.usage`, etc.). Initialize ADK telemetry providers via `maybe_set_otel_providers([get_gcp_exporters(...)])` for Cloud Logging, Cloud Trace, and Cloud Monitoring.
* **Tool Observability**: In custom tool functions (`tools/*.py`), log activity using `logger.info(...)` or `logger.debug(...)` rather than `print()`.

## Detailed Strategy

- **NO Hardcoded `print()` or Custom Agent Subclasses**: Under NO circumstances should you use `print()` for tracing/logging or subclass `Agent` / override `_run_async_impl` to intercept execution. ADK natively implements OpenTelemetry GenAI Semantic Conventions for end-to-end observability.
- **Structured Logging (Python `logging`)**:
  * Configure Python's standard `logging` in execution entrypoint (`agent.py`):
    ```python
    import logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(levelname)s - %(name)s - %(message)s'
    )
    logger = logging.getLogger(__name__)
    ```
  * All ADK internal loggers are children of `google_adk` (e.g. `google_adk.google.adk.models.google_llm`). Set to `logging.DEBUG` when troubleshooting LLM prompts, tool invocations, or internal state transitions.
  * To capture full prompt and response payloads in telemetry, set:
    ```python
    import os
    os.environ["OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT"] = "true"
    ```
- **Distributed Tracing & Metrics (OpenTelemetry & Google Cloud)**:
  * ADK automatically emits hierarchical trace spans (`invoke_agent`, `invoke_workflow`, `execute_tool`, `generate_content`) and metrics (`gen_ai.invoke_agent.duration`, `gen_ai.client.token.usage`, `gen_ai.invoke_agent.tool_calls`).
   * In `agent.py`, initialize ADK telemetry providers for Cloud Trace, Cloud Logging, and Cloud Monitoring when deployed:
     ```python
     import os
     from google.adk.telemetry.google_cloud import get_gcp_exporters
     from google.adk.telemetry.setup import maybe_set_otel_providers

     os.environ.setdefault("OTEL_SERVICE_NAME", "adk-agent-service")
     # Enable cloud exporters in deployed environments or when explicitly requested
     is_deployed = bool(os.getenv("GOOGLE_CLOUD_AGENT_ENGINE_ID") or os.getenv("K_SERVICE") or os.getenv("ENABLE_OTEL_EXPORTERS", "").lower() in ("true", "1"))
     try:
         gcp_exporters = get_gcp_exporters(
             enable_cloud_logging=True,
             enable_cloud_tracing=is_deployed,
             enable_cloud_metrics=is_deployed,
         )
         maybe_set_otel_providers([gcp_exporters])
     except Exception:
         pass
     ```
   * For local development or OTLP backends, ADK automatically respects standard OTel env vars (`OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`, `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT`) when calling `maybe_set_otel_providers()`. For local development or testing without OTLP backends, OpenTelemetry network exporters are disabled via `OTEL_SDK_DISABLED=true` to prevent local 400 Bad Request metric export spam.
 - **Tool Observability**:
  * In custom tool functions (`tools/*.py`), log progress using `logger.info(...)` or `logger.debug(...)` rather than `print()`.
