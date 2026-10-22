/**
 * Unit Tests for ADK Runner-Level Plugins (TASK-240)
 *
 * Validates:
 * 1. ADK_RUNNER_PLUGIN_CATALOG definitions across all 6 supported plugin types.
 * 2. generateRunnerPluginsPythonCode() generates idiomatic Python code for each plugin.
 * 3. Handling of disabled plugins, custom plugin classes/modules, and empty configurations.
 * 4. Merging multiple plugin imports into a clean single import statement.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ADK_RUNNER_PLUGIN_CATALOG,
  generateRunnerPluginsPythonCode,
} from '../../../src/webview/components/deployment/DeploymentPanel';
import { AdkRunnerPluginConfig } from '../../../src/shared/agentSpec';

describe('ADK Runner Plugins (TASK-240)', () => {
  // Section: Catalog Verification
  it('should define exactly 6 runner plugin catalog entries with required metadata', () => {
    assert.equal(ADK_RUNNER_PLUGIN_CATALOG.length, 6);

    const pluginIds = ADK_RUNNER_PLUGIN_CATALOG.map((c) => c.id);
    assert.ok(pluginIds.includes('reflect_and_retry_tool'));
    assert.ok(pluginIds.includes('bigquery_agent_analytics'));
    assert.ok(pluginIds.includes('context_filter'));
    assert.ok(pluginIds.includes('save_files_as_artifacts'));
    assert.ok(pluginIds.includes('debug_logging'));
    assert.ok(pluginIds.includes('custom_plugin'));

    for (const item of ADK_RUNNER_PLUGIN_CATALOG) {
      assert.ok(item.name.length > 0, `Plugin ${item.id} must have a name`);
      assert.ok(item.className.length > 0, `Plugin ${item.id} must have a className`);
      assert.ok(item.description.length > 0, `Plugin ${item.id} must have a description`);
      assert.equal(item.defaultConfig.pluginType, item.id);
    }
  });

  // Section: Code Generation - Empty & Disabled Cases
  it('should return empty runner_plugins list when plugins array is empty or undefined', () => {
    const codeEmpty = generateRunnerPluginsPythonCode([]);
    assert.ok(codeEmpty.includes('runner_plugins = []'));
    assert.ok(codeEmpty.includes('# No runner plugins configured'));

    const codeUndefined = generateRunnerPluginsPythonCode(undefined as any);
    assert.ok(codeUndefined.includes('runner_plugins = []'));
  });

  it('should omit disabled plugins from generated Python code', () => {
    const plugins: AdkRunnerPluginConfig[] = [
      {
        id: 'p-1',
        pluginType: 'reflect_and_retry_tool',
        name: 'Retry',
        enabled: false,
        maxRetries: 5,
      },
      {
        id: 'p-2',
        pluginType: 'debug_logging',
        name: 'Debug',
        enabled: true,
      },
    ];

    const code = generateRunnerPluginsPythonCode(plugins);
    assert.ok(code.includes('DebugLoggingPlugin'));
    assert.ok(!code.includes('ReflectAndRetryToolPlugin'));
    assert.ok(!code.includes('max_retries'));
  });

  // Section: Code Generation - Individual Plugin Types
  it('should generate ReflectAndRetryToolPlugin with configured max_retries', () => {
    const plugins: AdkRunnerPluginConfig[] = [
      {
        id: 'retry-1',
        pluginType: 'reflect_and_retry_tool',
        name: 'Tool Retry',
        enabled: true,
        maxRetries: 4,
      },
    ];

    const code = generateRunnerPluginsPythonCode(plugins);
    assert.ok(code.includes('from google.adk.plugins import ReflectAndRetryToolPlugin'));
    assert.ok(code.includes('ReflectAndRetryToolPlugin(max_retries=4)'));
    assert.ok(code.includes('runner_plugins = ['));
  });

  it('should generate BigQueryAgentAnalyticsPlugin with project, dataset, and table parameters', () => {
    const plugins: AdkRunnerPluginConfig[] = [
      {
        id: 'bq-1',
        pluginType: 'bigquery_agent_analytics',
        name: 'BQ Analytics',
        enabled: true,
        bqProjectId: 'analytics-prod-project',
        bqDatasetId: 'agent_logs',
        bqTableId: 'turns',
      },
    ];

    const code = generateRunnerPluginsPythonCode(plugins);
    assert.ok(code.includes('from google.adk.plugins import BigQueryAgentAnalyticsPlugin'));
    assert.ok(code.includes('project_id="analytics-prod-project"'));
    assert.ok(code.includes('dataset_id="agent_logs"'));
    assert.ok(code.includes('table_id="turns"'));
  });

  it('should generate ContextFilterPlugin with max_messages and max_tokens', () => {
    const plugins: AdkRunnerPluginConfig[] = [
      {
        id: 'cf-1',
        pluginType: 'context_filter',
        name: 'Context Filter',
        enabled: true,
        maxContextMessages: 25,
        maxContextTokens: 4096,
      },
    ];

    const code = generateRunnerPluginsPythonCode(plugins);
    assert.ok(code.includes('from google.adk.plugins import ContextFilterPlugin'));
    assert.ok(code.includes('ContextFilterPlugin(max_messages=25, max_tokens=4096)'));
  });

  it('should generate SaveFilesAsArtifactsPlugin', () => {
    const plugins: AdkRunnerPluginConfig[] = [
      {
        id: 'art-1',
        pluginType: 'save_files_as_artifacts',
        name: 'Save Artifacts',
        enabled: true,
      },
    ];

    const code = generateRunnerPluginsPythonCode(plugins);
    assert.ok(code.includes('from google.adk.plugins import SaveFilesAsArtifactsPlugin'));
    assert.ok(code.includes('SaveFilesAsArtifactsPlugin()'));
  });

  it('should generate custom plugin with custom import and class instantiation', () => {
    const plugins: AdkRunnerPluginConfig[] = [
      {
        id: 'custom-1',
        pluginType: 'custom_plugin',
        name: 'Audit Plugin',
        enabled: true,
        customClassName: 'EnterpriseAuditPlugin',
        customModulePath: 'company.security.audit',
      },
    ];

    const code = generateRunnerPluginsPythonCode(plugins);
    assert.ok(code.includes('from company.security.audit import EnterpriseAuditPlugin'));
    assert.ok(code.includes('EnterpriseAuditPlugin()'));
  });

  // Section: Code Generation - Combined Multi-Plugin Suite
  it('should combine multiple plugins into sorted imports and unified runner_plugins list', () => {
    const plugins: AdkRunnerPluginConfig[] = [
      {
        id: 'p-1',
        pluginType: 'reflect_and_retry_tool',
        name: 'Retry',
        enabled: true,
        maxRetries: 3,
      },
      {
        id: 'p-2',
        pluginType: 'save_files_as_artifacts',
        name: 'Artifacts',
        enabled: true,
      },
      {
        id: 'p-3',
        pluginType: 'debug_logging',
        name: 'Debug',
        enabled: true,
      },
      {
        id: 'p-4',
        pluginType: 'custom_plugin',
        name: 'Custom',
        enabled: true,
        customClassName: 'AuditHook',
        customModulePath: 'hooks.audit',
      },
    ];

    const code = generateRunnerPluginsPythonCode(plugins);
    assert.ok(
      code.includes(
        'from google.adk.plugins import DebugLoggingPlugin, ReflectAndRetryToolPlugin, SaveFilesAsArtifactsPlugin'
      )
    );
    assert.ok(code.includes('from hooks.audit import AuditHook'));
    assert.ok(code.includes('ReflectAndRetryToolPlugin(max_retries=3)'));
    assert.ok(code.includes('SaveFilesAsArtifactsPlugin()'));
    assert.ok(code.includes('DebugLoggingPlugin()'));
    assert.ok(code.includes('AuditHook()'));
  });

  // Section: Regression — UI Placement of Runner Plugins & Language Selection
  it('should mount AdkRunnerPluginsPanel inside StandardAgentDrawer (Agent definition) and language selection inside CodePreviewTab, not DeploymentTab', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');

    const deploymentTabSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/webview/components/deployment/DeploymentTab.tsx'),
      'utf-8'
    );
    const standardAgentDrawerSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/webview/components/inspector/StandardAgentDrawer.tsx'),
      'utf-8'
    );
    const codePreviewTabSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/webview/components/tabs/CodePreviewTab.tsx'),
      'utf-8'
    );

    // DeploymentTab must NOT contain language selection or runner plugins
    assert.ok(
      !deploymentTabSrc.includes('MultiLanguageSelectorCard'),
      'DeploymentTab must not render MultiLanguageSelectorCard'
    );
    assert.ok(
      !deploymentTabSrc.includes('AdkRunnerPluginsPanel'),
      'DeploymentTab must not render AdkRunnerPluginsPanel'
    );

    // StandardAgentDrawer MUST mount AdkRunnerPluginsPanel bound to agent.plugins
    assert.ok(
      standardAgentDrawerSrc.includes('AdkRunnerPluginsPanel'),
      'StandardAgentDrawer must render AdkRunnerPluginsPanel as part of the agent definition'
    );
    assert.ok(
      standardAgentDrawerSrc.includes('onUpdateAgent({ plugins })'),
      'StandardAgentDrawer must persist plugins on the agent node data'
    );

    // CodePreviewTab and DeploymentTab must be Python-only and exclude GKE Autopilot
    assert.ok(
      codePreviewTabSrc.includes('>PYTHON<') || codePreviewTabSrc.includes('🐍 Python'),
      'CodePreviewTab must show Python as the active language'
    );
    assert.ok(
      !codePreviewTabSrc.includes('Go (ADK)') && !codePreviewTabSrc.includes('Java (ADK)'),
      'CodePreviewTab must not expose Go or Java language selector options'
    );
    assert.ok(
      !codePreviewTabSrc.includes('value="gke"') && !deploymentTabSrc.includes('GkeDeploymentConfigCard'),
      'CodePreviewTab and DeploymentTab must not expose GKE Autopilot target'
    );
  });
});
