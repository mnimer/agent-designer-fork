/**
 * Unit tests for StandardAgentDrawer 4-Tab Property Panel layout and section header counts.
 *
 * Verifies:
 * 1. The 4 main tabs (`agent`, `tools_skills`, `memory_context`, `runtime_hooks`) match the
 *    A2AAgentDrawer tab bar styling and do NOT display counts on the tab buttons themselves.
 * 2. Section headers inside the tabs display item counts (`Attached Tools (N)`,
 *    `Agent Skills (N)`, `Sub-Agent Delegation (N)`, `Lifecycle Callbacks (N)`,
 *    `ADK Runner Plugins (N)`).
 * 3. Each of the 14 property sections is placed under its designated tab and
 *    Thinking Budget is not duplicated on `ModelSelector`.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const DRAWER_PATH = path.resolve(
  __dirname,
  '../../../src/webview/components/inspector/StandardAgentDrawer.tsx'
);
const SKILLS_SECTION_PATH = path.resolve(
  __dirname,
  '../../../src/webview/components/inspector/SkillsSection.tsx'
);
const CALLBACKS_SECTION_PATH = path.resolve(
  __dirname,
  '../../../src/webview/components/inspector/CallbacksConfigSection.tsx'
);
const DEPLOYMENT_PANEL_PATH = path.resolve(
  __dirname,
  '../../../src/webview/components/deployment/DeploymentPanel.tsx'
);
const MODEL_SELECTOR_PATH = path.resolve(
  __dirname,
  '../../../src/webview/components/drawers/primitives/ModelSelector.tsx'
);

describe('StandardAgentDrawer 4-Tab Organization & Section Counts', () => {
  const drawerSource = fs.readFileSync(DRAWER_PATH, 'utf-8');
  const skillsSource = fs.readFileSync(SKILLS_SECTION_PATH, 'utf-8');
  const callbacksSource = fs.readFileSync(CALLBACKS_SECTION_PATH, 'utf-8');
  const deploymentPanelSource = fs.readFileSync(DEPLOYMENT_PANEL_PATH, 'utf-8');
  const modelSelectorSource = fs.readFileSync(MODEL_SELECTOR_PATH, 'utf-8');

  describe('1. 4-Tab Navigation Bar Structure & Styling', () => {
    it('defines StandardAgentDrawerTab union with all 4 tab keys', () => {
      expect(drawerSource).toContain(
        "export type StandardAgentDrawerTab = 'agent' | 'tools_skills' | 'memory_context' | 'runtime_hooks';"
      );
    });

    it('renders the 4 tab buttons with matching A2AAgentDrawer tab bar container styling', () => {
      expect(drawerSource).toContain('data-testid="standard-agent-drawer-tabs"');
      expect(drawerSource).toContain('data-testid="agent-drawer-tab-agent"');
      expect(drawerSource).toContain('data-testid="agent-drawer-tab-tools_skills"');
      expect(drawerSource).toContain('data-testid="agent-drawer-tab-memory_context"');
      expect(drawerSource).toContain('data-testid="agent-drawer-tab-runtime_hooks"');
    });

    it('does not render badge counts on the 4 main tab buttons', () => {
      const tabBarStart = drawerSource.indexOf('data-testid="standard-agent-drawer-tabs"');
      const formBodyStart = drawerSource.indexOf('{/* Form Body */}');
      expect(tabBarStart).toBeGreaterThan(-1);
      expect(formBodyStart).toBeGreaterThan(tabBarStart);

      const tabBarMarkup = drawerSource.slice(tabBarStart, formBodyStart);
      expect(tabBarMarkup).toContain('<span>Agent</span>');
      expect(tabBarMarkup).toContain('<span>Tools & Skills</span>');
      expect(tabBarMarkup).toContain('<span>Memory & Context</span>');
      expect(tabBarMarkup).toContain('<span>Runtime & Hooks</span>');
      expect(tabBarMarkup).not.toContain('.length');
    });
  });

  describe('2. Section Header Counts Inside Tabs', () => {
    it('displays count in Attached Tools section header', () => {
      expect(drawerSource).toContain('Attached Tools ({agent.tools?.length || 0})');
    });

    it('displays count in Agent Skills section header', () => {
      expect(skillsSource).toContain('Agent Skills ({skills.length})');
    });

    it('displays count in Sub-Agent Delegation section header', () => {
      expect(drawerSource).toContain('Sub-Agent Delegation ({subAgents.length})');
    });

    it('displays count in Lifecycle Callbacks section header', () => {
      expect(callbacksSource).toContain('Lifecycle Callbacks ({callbacks.length})');
    });

    it('displays count in ADK Runner Plugins section header', () => {
      expect(deploymentPanelSource).toContain('ADK Runner Plugins ({plugins.length})');
    });
  });

  describe('3. Logical Grouping of Properties Across the 4 Tabs', () => {
    const agentTabStart = drawerSource.indexOf("{activeTab === 'agent' && (");
    const memoryTabStart = drawerSource.indexOf("{activeTab === 'memory_context' && (");
    const runtimeTabStart = drawerSource.indexOf("{activeTab === 'runtime_hooks' && (");
    const toolsTabStart = drawerSource.indexOf("{activeTab === 'tools_skills' && (");

    const agentTabBlock = drawerSource.slice(agentTabStart, memoryTabStart);
    const memoryTabBlock = drawerSource.slice(memoryTabStart, runtimeTabStart);
    const runtimeTabBlock = drawerSource.slice(runtimeTabStart, toolsTabStart);
    const toolsTabBlock = drawerSource.slice(toolsTabStart);

    it('Tab 1 (Agent) contains Display Name, auto-generated hidden Identifier, ModelSelector (without duplicate thinkingBudget), Prompt, A2UI Rich UI, and Input/Output Schemas', () => {
      expect(agentTabBlock).toContain('Agent Display Name');
      expect(agentTabBlock).toContain('data-testid="agent-identifier-hidden"');
      expect(agentTabBlock).not.toContain('Agent Identifier (Python ID)');
      expect(agentTabBlock).toContain('<ModelSelector');
      expect(agentTabBlock).not.toContain('onChangeThinkingBudget');
      expect(agentTabBlock).toContain('<span>Agent Prompt</span>');
      expect(agentTabBlock).toContain('<A2UIConfigSection');
      expect(agentTabBlock).toContain('<StructuredInputBuilder');
      expect(agentTabBlock).toContain('<StructuredOutputBuilder');
    });

    it('ModelSelector removes the description box under the dropdown and collapses Creative Temperature by default', () => {
      expect(modelSelectorSource).not.toContain('Custom selected LLM foundation engine.');
      expect(modelSelectorSource).toContain('const [isTempExpanded, setIsTempExpanded] = useState(false);');
      expect(modelSelectorSource).toContain('data-testid="temp-toggle-button"');
    });

    it('Tab 2 (Tools & Skills) contains Attached Tools, SkillsSection, and Sub-Agent Delegation', () => {
      expect(toolsTabBlock).toContain('Attached Tools ({agent.tools?.length || 0})');
      expect(toolsTabBlock).toContain('<SkillsSection');
      expect(toolsTabBlock).toContain('Sub-Agent Delegation ({subAgents.length})');
      expect(toolsTabBlock).toContain('Orchestration Pattern');
    });

    it('Tab 3 (Memory & Context) contains MemoryDrawer (or sub-agent inherited notice) and Context & Token Optimization', () => {
      expect(memoryTabBlock).toContain('<MemoryDrawer');
      expect(memoryTabBlock).toContain('data-testid="subagent-inherited-memory-notice"');
      expect(memoryTabBlock).toContain('data-testid="context-optimization-section"');
      expect(memoryTabBlock).toContain('Context Caching (Vertex AI)');
      expect(memoryTabBlock).toContain('Event Compaction Auto-Summarization');
    });

    it('Tab 4 (Runtime & Hooks) contains Reasoning Planner, CallbacksConfigSection, and AdkRunnerPluginsPanel', () => {
      expect(runtimeTabBlock).toContain('data-testid="planner-config-section"');
      expect(runtimeTabBlock).toContain('<CallbacksConfigSection');
      expect(runtimeTabBlock).toContain('<AdkRunnerPluginsPanel');
    });
  });
});
