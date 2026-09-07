# GEMINI.MD: AI Collaboration Guide & Memory Notes

This document provides essential context for AI models interacting with the `agent-designer` codebase.

## Model Selection & Rules
- **CRITICAL RULE**: Never revert to or map model names to `gemini-2.5` (`gemini-2.5-flash`, `gemini-2.5-pro`) or Gemini 1.x/2.x. They are deprecated.
- **Valid Models**: Use `gemini-3.7-flash` (Recommended), `gemini-3.5-flash`, `gemini-flash-latest`, or `gemini-pro-latest`.
- **Region Configuration for Vertex AI**: `gemini-3.7-flash` on Vertex AI MUST use the `global` region (`location="global"` or `os.environ["GOOGLE_CLOUD_LOCATION"] = "global"`). Regional endpoints like `us-central1` do not host the `gemini-3.7-flash` publisher model and will return 404 NOT_FOUND. Always configure `global` location for model execution.
- **Search Tools & Controlled Generation**: Vertex AI Gemini does not support combining search tools (`google_search`) with controlled generation (`output_schema`) on the same agent. Search agents write to state keys; only downstream synthesizer agents without search tools use `output_schema`.

## Coding Conventions & Style Guide
- **Author Tag**: Add `Mike Nimer <mikenimer@google.com>` as the Author to every class modified.
- **Git Commits**: Never commit code unless explicitly requested by the user.
- **CSS / UI Spacing**: Use the 8pt grid system for all spacing (margins, paddings, sizing in multiples of 8px).
- **TypeScript / React**: Nested components should take props in and emit events up. Avoid unnecessary two-way data binding.
