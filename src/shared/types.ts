/**
 * types.ts - Shared Type Definitions for Agent Flow Builder
 *
 * This file is an interface layer that imports and re-exports the canonical
 * domain specifications and types from the shared single source of truth: `src/shared/agentSpec.ts`.
 * By acting as an alias/re-export gateway, it ensures that all extension backend and webview
 * components continue to import from 'types.ts' flawlessly while eliminating duplicated code.
 *
 * Architectural Decisions:
 * 1. Single Source of Truth: All modifications to core agent, trigger, or tool models must occur in `src/shared/agentSpec.ts`.
 * 2. Absolute Compatibility: All backend-facing and webview-facing types, parameters, and interfaces are fully preserved via `export * from './agentSpec'`.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

export * from './agentSpec';
