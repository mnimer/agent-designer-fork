# UI Parity Implementation Plan: VS Code Agent Flow Builder

This plan details the technical steps required to bring the VS Code Extension Webview UI into 100% visual and functional parity with the `mockup/` React application.

It addresses all UI gaps: vertical category toolbars, floating palette drawers, rich custom node cards, right inspector drawers, multi-tab `.agent` file management, bottom resizable code generation/deployment panel, and full dynamic theme support (`vscode-dark` & `vscode-light`).

---

## User Review Required

> [!IMPORTANT]
> **Theme Support Strategy**:
> VS Code webviews emit dynamic CSS variables (`--vscode-editor-background`, `--vscode-editor-foreground`, etc.) and append `vscode-dark` or `vscode-light` to `document.body`.
> The mockup relies on Tailwind CSS classes with custom dark/light variants. We will implement a `ThemeContext` that reads VS Code theme changes over the `WebviewBridge` (`THEME_CHANGED`) and toggles theme classes across all floating cards, canvas background grid, nodes, and code editor containers.

> [!NOTE]
> **Bottom Panel Docking vs Modals**:
> The existing implementation uses a floating modal for Code Preview. The mockup uses a bottom-docked resizable panel with a draggable splitter handle. We will adopt the bottom-docked resizable panel while retaining modal options for standalone tool creation.

---

## Open Questions

1. **Multi-Tab Workspace File Sync**:
   - The mockup supports opening multiple `.agent` tabs (`workflow.agent`, `sample_agent.agent`) inside the single webview panel.
   - Would you prefer multi-tab management within the single custom editor webview, or having VS Code natively manage separate `.agent` file tabs? *(Default: Support multi-tab in webview + sync active file with VS Code).*

---

## Proposed Changes

### Webview Theme Infrastructure & Data Models

#### [MODIFY] [src/shared/types.ts](file:///Users/mikenimer/Development/projects/agent-designer/src/shared/types.ts)
- Extend `AgentNodeData`, `TriggerNodeData`, and `GenerationConfig` schemas to match `mockup/src/types.ts` (including `AgentKind`, `PatternType`, `AgentFileTab`, `SampleWorkflowDefinition`, `ToolDefinition`, and `TestPromptCase`).

#### [NEW] [src/webview/context/ThemeContext.tsx](file:///Users/mikenimer/Development/projects/agent-designer/src/webview/context/ThemeContext.tsx)
- Port `ThemeContext` from `mockup/src/context/ThemeContext.tsx`. Provides `theme` state ('dark' | 'light') synchronized with `vscode.window.onDidChangeActiveColorTheme`.

---

### Canvas Palette & Drag-and-Drop Controls

#### [NEW] [src/webview/components/Canvas/PaletteCard.tsx](file:///Users/mikenimer/Development/projects/agent-designer/src/webview/components/Canvas/PaletteCard.tsx)
- Port `PaletteCard.tsx` from `mockup/src/components/canvas/PaletteCard.tsx`.
- Features left vertical category selector strip:
  - `AGENTS`: Basic types (Standard, A2A Agent, Router) & 8 Multi-Agent Patterns (Sequential Pipeline, Parallel / Fan-Out, Router, Evaluator-Optimizer).
  - `TOOLS`: Tool Registry with MCP Servers, REST APIs, Built-in tools, category search, and `+ Add Tool` button.
  - `TRIGGERS`: Workflow Triggers & QA (Test Suite, Chat Trigger, PubSub Invocation, Schedule Trigger, EventArc Trigger).
  - `SAMPLES`: Pre-built sample agent workflow templates.
- Supports HTML5 Drag-and-Drop onto the React Flow canvas as well as click-to-add.

#### [MODIFY] [src/webview/components/Canvas/WorkflowCanvas.tsx](file:///Users/mikenimer/Development/projects/agent-designer/src/webview/components/Canvas/WorkflowCanvas.tsx)
- Add `onDragOver` and `onDrop` event handlers to instantiate dropped agents, patterns, tools, or triggers at exact flow coordinates using `screenToFlowPosition`.
- Add center "Blank Agent Canvas" card when `nodes.length === 0` with `[+ Add Root Engine]` action button.

---

### Rich Node Visual Cards

#### [MODIFY] [src/webview/components/Canvas/nodes/AgentNode.tsx](file:///Users/mikenimer/Development/projects/agent-designer/src/webview/components/Canvas/nodes/AgentNode.tsx)
- Update node card styling to match `mockup`:
  - Model badge (`@ gemini-flash-latest`), header actions (duplicate, delete).
  - System prompt preview box (truncated with word/char count).
  - Memory & State section with edit link (`Stateless`, `Session Memory`, `Vector DB`).
  - Tools list with removable pills + `+ Add Tool` button.
  - Sub-agent handles & delegation dropdown (`Parallel`, `Sequential`).

#### [MODIFY] [src/webview/components/Canvas/nodes/TriggerNode.tsx](file:///Users/mikenimer/Development/projects/agent-designer/src/webview/components/Canvas/nodes/TriggerNode.tsx)
- Update trigger node styling to match `mockup`:
  - Trigger type icon, title, description, and list of Test Prompts (Task Decomposition, Tool Invocation, Safety & Guardrails).

---

### Right Inspector Drawers

#### [MODIFY] [src/webview/components/inspector/StandardAgentDrawer.tsx](file:///Users/mikenimer/Development/projects/agent-designer/src/webview/components/inspector/StandardAgentDrawer.tsx)
- Align with `AgentDrawer.tsx` from `mockup`: agent display name, system prompt text area with word/char counters, freeform text vs JSON schema builder toggle, underlying LLM model picker, and creativity (temperature) slider.

#### [MODIFY] [src/webview/components/inspector/TriggerDrawer.tsx](file:///Users/mikenimer/Development/projects/agent-designer/src/webview/components/inspector/TriggerDrawer.tsx)
- Align with `TriggerDrawer.tsx` from `mockup`: trigger label, trigger type selector, description, and Test Prompts & Mock Cases assert list builder.

#### [NEW] [src/webview/components/inspector/ToolPropertyDrawer.tsx](file:///Users/mikenimer/Development/projects/agent-designer/src/webview/components/inspector/ToolPropertyDrawer.tsx)
- Port `ToolPropertyDrawer.tsx` from `mockup` to enable inspecting and editing tool schema properties, headers, and parameters.

---

### Bottom Docked Resizable Code Generation Panel

#### [NEW] [src/webview/components/codegen/CodeGenerationPanel.tsx](file:///Users/mikenimer/Development/projects/agent-designer/src/webview/components/codegen/CodeGenerationPanel.tsx)
- Port `CodeGenerationPanel.tsx` from `mockup/src/components/codegen/CodeGenerationPanel.tsx`.
- Replaces modal dialog with bottom-docked panel containing a draggable splitter divider.
- Tabs: `Code Generation (N files)`, `Deployment (Cloud Run)`, `Test Runner`.
- Left generator settings panel (Framework: Google ADK / LangGraph, Language: Python / TypeScript, Output folder, Generate Code button).
- Right multi-file code viewer with tab bar (`agent_workflow.py`, `tools.py`, `test_pipeline.py`, `main.py`, `requirements.txt`, `README.md`, `main.tf`), Copy, Download, and syntax highlighting.

---

### Workbench App Assembly

#### [MODIFY] [src/webview/App.tsx](file:///Users/mikenimer/Development/projects/agent-designer/src/webview/App.tsx)
- Re-architect layout to host:
  - Top `.agent` file tab strip.
  - Header toolbar with Undo/Redo, Auto-Layout, Zoom controls, Missing Features Advisor badge, and Theme switcher toggle.
  - Left floating `PaletteCard`.
  - Center `WorkflowCanvas` with empty state card.
  - Right `AgentDrawer` / `TriggerDrawer` / `ToolPropertyDrawer`.
  - Bottom resizable `CodeGenerationPanel`.

---

## Verification Plan

### Automated Tests
- Run complete test suite:
  ```bash
  npm run compile && npm test
  ```
- Add unit tests for new components:
  - `tests/webview/PaletteCard.test.ts`: Test tab switching, drag data preparation, and filtering.
  - `tests/webview/CodeGenerationPanel.test.ts`: Test code file tab switching, generator settings updates, and copy actions.
  - `tests/webview/ThemeContext.test.ts`: Test theme toggling between dark and light modes.

### Manual Verification
1. Launch extension in VS Code Extension Host (`F5`).
2. Verify left palette drawer opens and closes, and dragging an Agent or Pattern places nodes on the canvas.
3. Verify clicking a node opens the right inspector drawer with prompt and temperature controls.
4. Verify bottom resizable code generation panel drags smoothly and displays generated code files.
5. Toggle VS Code theme between Light and Dark to verify complete theme parity.
