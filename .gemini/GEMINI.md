# GEMINI.MD: AI Collaboration Guide & Memory Notes

This document provides essential context for AI models interacting with the `agent-designer` codebase.

## Model Selection & Rules
- **CRITICAL RULE**: Never revert to or map model names to `gemini-2.5` (`gemini-2.5-flash`, `gemini-2.5-pro`). Gemini 1.x and 2.x models are deprecated.
- **Valid Models**: Use `gemini-flash-latest`, `gemini-pro-latest`, or `gemini-3.5-flash`.
- **Region Configuration**: Always use the `global` region for Google Cloud / Vertex AI endpoints (`location="global"`).

## Coding Conventions & Style Guide
- **Author Tag**: Add `Mike Nimer <mikenimer@google.com>` as the Author to every class modified.
- **Git Commits**: Never commit code unless explicitly requested by the user.
- **CSS / UI Spacing**: Use the 8pt grid system for all spacing (margins, paddings, sizing in multiples of 8px).
- **TypeScript / React**: Nested components should take props in and emit events up. Avoid unnecessary two-way data binding.
