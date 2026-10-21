/**
 * Unit Tests for Plugin Settings (Models & Skills), Agent Skills Section,
 * Model Selector, and Code Generation Model Selection
 *
 * Validates:
 * 1. ADC Always-On Gemini Foundation Models (`gemini-3.8-flash`, `gemini-3.7-flash`, `gemini-4-argon`)
 *    with disabled On/Off switches and right-aligned Code Gen Default header & radio buttons.
 * 2. GCP Vertex AI Model Garden catalog filtering, sorting by Company and Model Name,
 *    and enablement in Model Garden (`GcpDiscoveryManager`).
 * 3. Direct Provider API Keys (`Gemini API`, `Anthropic`, `OpenAI`, `Grok`) on 100%-width stacked
 *    rows (`w-full`) with company-level and per-model On/Off switches (e.g. enabling only
 *    `claude-opus-5-5` while hiding other Anthropic models).
 * 4. Validation rules for ADC and API Key modes (at least 1 model enabled and 1 model set
 *    as Code Generation Default).
 * 5. Global Skills Editor & Agent Property Panel Skills (`AgentSkillsSection`) with
 *    agent-scoped skill creation by default and "Save this as a global skill" checkbox.
 * 6. Dynamic enabled model population in `ModelSelector` (Agent / A2A Inspector) and
 *    `CodePreviewTab` (Code Generation Model dropdown + vertical file list down the left side).
 *
 * Author: Mike Nimer <mikenimer@google.com>
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ADC_CORE_GEMINI_MODELS,
  DEFAULT_MODEL_GARDEN_CATALOG,
  API_KEY_PROVIDER_CATALOG,
  deduplicateModelGardenCatalog,
  filterAndSortModelGarden,
  validateAdcModelSettings,
  validateApiKeyModelSettings,
  getEnabledModelsForSettings,
  resolveEffectiveCodeGenDefault,
} from '../../../src/webview/data/modelCatalog';
import {
  DEFAULT_GLOBAL_SKILLS,
  sanitizeSkillSlug,
  formatSkillMarkdownWithFrontmatter,
} from '../../../src/webview/data/defaultSkills';
import {
  SettingsProvider,
  DEFAULT_API_KEY_PROVIDERS,
  DEFAULT_SETTINGS,
} from '../../../src/webview/context/SettingsContext';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PaletteCard } from '../../../src/webview/components/Canvas/PaletteCard';
import { SettingsPage } from '../../../src/webview/components/settings/SettingsPage';
import { SkillsSettingsTab } from '../../../src/webview/components/settings/SkillsSettingsTab';
import { AgentSkillsSection } from '../../../src/webview/components/inspector/AgentSkillsSection';
import { ModelSelector } from '../../../src/webview/components/drawers/primitives/ModelSelector';
import { CodePreviewTab } from '../../../src/webview/components/tabs/CodePreviewTab';
import { GcpDiscoveryManager } from '../../../src/extension/GcpDiscoveryManager';
import { GeminiCodeGenEngine } from '../../../src/extension/GeminiCodeGenEngine';

describe('Plugin Settings: Models (ADC, Model Garden, API Keys) & Skills Editor', () => {
  // ==========================================================================
  // 1. ADC Always-On Gemini Models & Model Garden Catalog
  // ==========================================================================
  describe('ADC Core Gemini Models & Model Garden Catalog', () => {
    it('should define the 3 always-on Gemini models with gemini-3.8-flash as default', () => {
      assert.equal(ADC_CORE_GEMINI_MODELS.length, 3);
      assert.deepEqual(
        ADC_CORE_GEMINI_MODELS.map((m) => m.id),
        ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-4-argon']
      );
      for (const model of ADC_CORE_GEMINI_MODELS) {
        assert.equal(model.alwaysOn, true, `${model.id} must have alwaysOn=true`);
        assert.equal(model.company, 'Google');
      }
    });

    it('should include Claude, OpenAI, and OSS models (Qwen, Llama, Mistral, DeepSeek) in Model Garden catalog', () => {
      const companies = new Set(DEFAULT_MODEL_GARDEN_CATALOG.map((m) => m.company));
      assert.ok(companies.has('Anthropic'), 'Should include Anthropic Claude models');
      assert.ok(companies.has('OpenAI'), 'Should include OpenAI models');
      assert.ok(companies.has('Alibaba / Qwen'), 'Should include Qwen OSS models');
      assert.ok(
        DEFAULT_MODEL_GARDEN_CATALOG.some((m) => m.id === 'claude-opus-5-5'),
        'Should include Claude Opus 5.5 in Model Garden'
      );
      assert.ok(
        DEFAULT_MODEL_GARDEN_CATALOG.some((m) => m.id.includes('qwen')),
        'Should include Qwen model in Model Garden'
      );
    });

    it('should sort Model Garden models by company or model name and filter by search query', () => {
      const sortedByCompanyAsc = filterAndSortModelGarden(
        DEFAULT_MODEL_GARDEN_CATALOG,
        '',
        'company',
        'asc'
      );
      assert.ok(sortedByCompanyAsc.length >= 10);
      assert.ok(
        sortedByCompanyAsc[0].company.localeCompare(
          sortedByCompanyAsc[sortedByCompanyAsc.length - 1].company
        ) <= 0
      );

      const sortedByNameDesc = filterAndSortModelGarden(
        DEFAULT_MODEL_GARDEN_CATALOG,
        '',
        'name',
        'desc'
      );
      assert.ok(
        sortedByNameDesc[0].name.localeCompare(
          sortedByNameDesc[sortedByNameDesc.length - 1].name
        ) >= 0
      );

      // Search filter for Qwen
      const qwenOnly = filterAndSortModelGarden(
        DEFAULT_MODEL_GARDEN_CATALOG,
        'qwen',
        'name',
        'asc'
      );
      assert.ok(qwenOnly.length >= 2);
      assert.ok(qwenOnly.every((m) => m.company.toLowerCase().includes('qwen')));
    });

    it('should validate ADC settings requiring at least 1 enabled model and 1 valid Code Gen Default', () => {
      const validResult = validateAdcModelSettings(
        ['claude-opus-5-5'],
        'gemini-3.8-flash',
        DEFAULT_MODEL_GARDEN_CATALOG
      );
      assert.equal(validResult.isValid, true);
      assert.equal(validResult.enabledModelsCount, 4);

      // Invalid when codeGenDefaultModel is not among enabled models
      const invalidDefault = validateAdcModelSettings(
        [],
        'claude-opus-5-5',
        DEFAULT_MODEL_GARDEN_CATALOG
      );
      assert.equal(invalidDefault.isValid, false);
      assert.equal(invalidDefault.hasValidDefault, false);
      assert.ok(invalidDefault.errors.length > 0);
    });
  });

  // ==========================================================================
  // 2. API Key Providers & Per-Model Switches
  // ==========================================================================
  describe('API Key Providers & Per-Company / Per-Model Toggles', () => {
    it('should define the 4 required API Key companies (Gemini API, Anthropic, OpenAI, Grok) with latest Claude 5.x, GPT-6.x, and Grok 4.7 models', () => {
      assert.equal(API_KEY_PROVIDER_CATALOG.length, 4);
      assert.deepEqual(
        API_KEY_PROVIDER_CATALOG.map((p) => p.companyName),
        ['Gemini API', 'Anthropic', 'OpenAI', 'Grok']
      );

      const anthropicCatalog = API_KEY_PROVIDER_CATALOG.find((p) => p.providerId === 'anthropic')!;
      assert.deepEqual(
        anthropicCatalog.models.map((m) => m.id),
        ['claude-fable-5-1', 'claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5']
      );

      const openaiCatalog = API_KEY_PROVIDER_CATALOG.find((p) => p.providerId === 'openai')!;
      assert.deepEqual(
        openaiCatalog.models.map((m) => m.id),
        ['gpt-6-astra', 'gpt-6.1-sol', 'gpt-6-sol', 'gpt-6-luna']
      );

      const grokCatalog = API_KEY_PROVIDER_CATALOG.find((p) => p.providerId === 'grok')!;
      assert.deepEqual(
        grokCatalog.models.map((m) => m.id),
        ['grok-4.7']
      );
    });

    it('should allow enabling only a single model under a company (e.g. Opus 5.5 only under Anthropic)', () => {
      const providers = {
        ...DEFAULT_API_KEY_PROVIDERS,
        gemini: {
          ...DEFAULT_API_KEY_PROVIDERS.gemini,
          enabled: false,
        },
        anthropic: {
          providerId: 'anthropic' as const,
          enabled: true,
          apiKey: 'sk-ant-test-key-12345',
          enabledModels: ['claude-opus-5-5'],
        },
      };

      const validation = validateApiKeyModelSettings(providers, 'claude-opus-5-5');
      assert.equal(validation.isValid, true);
      assert.equal(validation.enabledModelsCount, 1);

      const enabledModels = getEnabledModelsForSettings({
        authMode: 'api_keys',
        adcEnabledGardenModels: [],
        apiKeyProviders: providers,
      });
      assert.equal(enabledModels.length, 1);
      assert.equal(enabledModels[0].id, 'claude-opus-5-5');
      assert.equal(enabledModels[0].company, 'Anthropic');
    });

    it('should fail API Key validation when no provider has an API key or all models are turned off', () => {
      const noKeyResult = validateApiKeyModelSettings(
        DEFAULT_API_KEY_PROVIDERS,
        'gemini-3.8-flash'
      );
      assert.equal(noKeyResult.isValid, false);
      assert.ok(noKeyResult.errors.some((e) => e.includes('missing an API Key') || e.includes('At least 1 provider')));

      // Provider enabled with key, but all individual models turned off
      const keyWithNoModels = {
        ...DEFAULT_API_KEY_PROVIDERS,
        gemini: { ...DEFAULT_API_KEY_PROVIDERS.gemini, enabled: false },
        anthropic: {
          providerId: 'anthropic' as const,
          apiKey: 'sk-ant-key',
          enabled: true,
          enabledModels: [],
        },
      };
      const noModelsResult = validateApiKeyModelSettings(keyWithNoModels, 'claude-opus-5-5');
      assert.equal(noModelsResult.isValid, false);
      assert.ok(noModelsResult.errors.some((e) => e.includes('At least 1 model must be enabled')));
    });

    it('should resolve effective Code Gen default model when current default is disabled', () => {
      const enabledModels = getEnabledModelsForSettings({
        authMode: 'adc',
        adcEnabledGardenModels: ['claude-opus-5-5'],
        apiKeyProviders: DEFAULT_API_KEY_PROVIDERS,
      });
      assert.equal(
        resolveEffectiveCodeGenDefault(enabledModels, 'claude-opus-5-5'),
        'claude-opus-5-5'
      );
      assert.equal(
        resolveEffectiveCodeGenDefault(enabledModels, 'non-existent-model'),
        'gemini-3.8-flash'
      );
    });
  });

  // ==========================================================================
  // 3. Global & Agent-Scoped Skills Utilities
  // ==========================================================================
  describe('Skills Utilities & SKILL.md Formatting', () => {
    it('should sanitize skill slugs and generate valid SKILL.md frontmatter', () => {
      assert.equal(sanitizeSkillSlug('BigQuery SQL Optimization!!'), 'bigquery-sql-optimization');
      assert.equal(sanitizeSkillSlug('   '), 'custom-skill');

      const md = formatSkillMarkdownWithFrontmatter({
        id: 'skill-1',
        name: 'bigquery-sql-optimization',
        title: 'BigQuery SQL Optimization',
        description: 'Optimizes BigQuery SQL queries.',
        instructions: 'Always partition by date.',
        scope: 'global',
      });
      assert.ok(md.startsWith('---\nname: bigquery-sql-optimization\n'));
      assert.ok(md.includes('description: Optimizes BigQuery SQL queries.'));
      assert.ok(md.includes('# BigQuery SQL Optimization'));
    });

    it('should provide default global skills', () => {
      assert.ok(DEFAULT_GLOBAL_SKILLS.length >= 3);
      assert.ok(DEFAULT_GLOBAL_SKILLS.every((s) => s.scope === 'global'));
    });
  });

  // ==========================================================================
  // 4. UI Component Rendering Verification (SSR Markup)
  // ==========================================================================
  describe('UI Component Rendering (SettingsPage, ModelsSettingsTab, SkillsSettingsTab, AgentSkillsSection, CodePreviewTab)', () => {
    it('should render SettingsPage with 2 left sidebar menu options (Models and Skills) and disabled Always-On Gemini switches', () => {
      const html = renderToStaticMarkup(
        React.createElement(SettingsProvider, null, React.createElement(SettingsPage))
      );

      // 2 Sidebar Menu options
      assert.ok(html.includes('data-testid="settings-menu-models"'), 'Should render Models menu option');
      assert.ok(html.includes('data-testid="settings-menu-skills"'), 'Should render Skills menu option');

      // Always-On Gemini switches are disabled
      assert.ok(html.includes('data-testid="adc-gemini-switch-gemini-3.8-flash"'));
      assert.ok(html.includes('data-testid="adc-gemini-switch-gemini-3.7-flash"'));
      assert.ok(html.includes('data-testid="adc-gemini-switch-gemini-4-argon"'));
      assert.ok(html.includes('disabled=""'), 'Gemini switches must be disabled');

      // Right-aligned Code Gen Default headers
      assert.ok(html.includes('data-testid="adc-gemini-codegen-header"'));
      assert.ok(html.includes('data-testid="model-garden-codegen-header"'));
      assert.ok(html.includes('text-right'));

      // Model Garden search input and sortable columns (no filter buttons, no pagination footer)
      assert.ok(html.includes('data-testid="model-garden-search-input"'));
      assert.ok(html.includes('data-testid="sort-by-company-btn"'));
      assert.ok(html.includes('data-testid="sort-by-name-btn"'));

      // Verify all DEFAULT_MODEL_GARDEN_CATALOG models (>10 rows) are rendered in one table without pagination
      for (const gardenModel of DEFAULT_MODEL_GARDEN_CATALOG) {
        assert.ok(
          html.includes(`data-testid="garden-row-${gardenModel.id}"`),
          `Should render Model Garden row ${gardenModel.id} without pagination`
        );
      }
      assert.equal(
        html.includes('aria-label="Previous Page"'),
        false,
        'Should not render Previous Page pagination button'
      );
      assert.equal(
        html.includes('aria-label="Next Page"'),
        false,
        'Should not render Next Page pagination button'
      );

      // Verify API Keys mode activates in one click (no second "Save & Activate API Key Mode" button)
      // and shows a red Error banner when no API keys are defined
      const rootDir = path.resolve(__dirname, '../../..');
      const modelsTabSrc = fs.readFileSync(
        path.join(rootDir, 'src/webview/components/settings/ModelsSettingsTab.tsx'),
        'utf-8'
      );
      assert.ok(
        modelsTabSrc.includes('onClick={handleActivateApiKeysMode}'),
        'Clicking API Keys tab should activate API Keys mode in one click'
      );
      assert.equal(
        modelsTabSrc.includes('save-api-keys-mode-btn'),
        false,
        'Should not render a redundant Save & Activate API Key Mode button'
      );
      assert.ok(
        modelsTabSrc.includes("bg-rose-500/10 border-rose-500/30 text-rose-300"),
        'Should show a rose Error banner when API key validation fails'
      );
    });

    it('should render SkillsSettingsTab with global skills list and SKILL.md editor', () => {
      const html = renderToStaticMarkup(
        React.createElement(SettingsProvider, null, React.createElement(SkillsSettingsTab))
      );

      assert.ok(html.includes('data-testid="skills-settings-tab"'));
      assert.ok(html.includes('data-testid="create-new-global-skill-btn"'));
      assert.ok(html.includes('data-testid="global-skills-list"'));
      assert.ok(html.includes('data-testid="skill-title-input"'));
      assert.ok(html.includes('data-testid="skill-instructions-textarea"'));
    });

    it('should render AgentSkillsSection with global skill selector and inline Create Skill button', () => {
      const html = renderToStaticMarkup(
        React.createElement(
          SettingsProvider,
          null,
          React.createElement(AgentSkillsSection, {
            skills: [
              {
                id: 'skill-local-1',
                name: 'local-refund-check',
                title: 'Local Refund Check',
                description: 'Agent-only skill',
                instructions: '# Refund Check',
                scope: 'agent',
              },
            ],
            onChangeSkills: () => {},
          })
        )
      );

      assert.ok(html.includes('data-testid="agent-skills-section"'));
      assert.ok(html.includes('data-testid="attach-global-skill-select"'));
      assert.ok(html.includes('data-testid="toggle-inline-create-skill-btn"'));
      assert.ok(html.includes('Local Refund Check'));
      assert.ok(html.includes('Agent Only'));
    });

    it('should render ModelSelector and CodePreviewTab with Code Generation Model dropdown and vertical file list down the left side', () => {
      const selectorHtml = renderToStaticMarkup(
        React.createElement(
          SettingsProvider,
          null,
          React.createElement(ModelSelector, {
            selectedModel: 'gemini-3.8-flash',
            onChangeModel: () => {},
          })
        )
      );
      assert.ok(selectorHtml.includes('gemini-3.8-flash'));
      assert.ok(selectorHtml.includes('gemini-4-argon'));

      const codeTabHtml = renderToStaticMarkup(
        React.createElement(
          SettingsProvider,
          null,
          React.createElement(CodePreviewTab, {
            config: {
              framework: 'google_adk',
              language: 'python',
              outputFolder: './my_agent/',
              includeTests: true,
              includeDocker: true,
              useStreaming: true,
              deploymentTarget: 'agent_engine',
              codeGenModel: 'gemini-3.8-flash',
            },
            onChangeConfig: () => {},
            onGenerateCode: () => {},
            generatedFiles: [
              {
                name: 'agent.py',
                path: 'agent.py',
                language: 'python',
                content: 'root_agent = LlmAgent(name="root_agent")',
                description: 'Main ADK agent module',
              },
              {
                name: 'skills/sql-bigquery-optimization/SKILL.md',
                path: 'skills/sql-bigquery-optimization/SKILL.md',
                language: 'markdown',
                content: '---\nname: sql-bigquery-optimization\n---',
                description: 'Agent Skill definition',
              },
            ],
            isGenerating: false,
          })
        )
      );

      assert.ok(codeTabHtml.includes('data-testid="codegen-model-select"'));
      assert.ok(codeTabHtml.includes('data-testid="generated-files-sidebar-list"'));
      assert.ok(codeTabHtml.includes('data-testid="generated-file-item-agent.py"'));
      assert.ok(
        codeTabHtml.includes(
          'data-testid="generated-file-item-skills/sql-bigquery-optimization/SKILL.md"'
        )
      );
    });

    it('should omit Settings buttons from PaletteCard and CanvasToolbar, keep Settings button on CodeGenerationPanel, and register agentFlow.openSettings in package.json', () => {
      const paletteHtml = renderToStaticMarkup(
        React.createElement(
          SettingsProvider,
          null,
          React.createElement(PaletteCard, {
            tools: [],
            onAddAgent: () => {},
            onAddPattern: () => {},
            onAddTrigger: () => {},
            onOpenAdvisor: () => {},
            onOpenEditTool: () => {},
            onCreateCustomTool: () => {},
            onAddToolToAgent: () => {},
          })
        )
      );
      assert.equal(paletteHtml.includes('data-testid="palette-settings-button"'), false);

      const rootDir = path.resolve(__dirname, '../../..');
      const flowCanvasSrc = fs.readFileSync(
        path.join(rootDir, 'src/webview/components/FlowCanvas.tsx'),
        'utf-8'
      );
      assert.ok(
        flowCanvasSrc.includes("import { SettingsPage } from './settings/SettingsPage'"),
        'FlowCanvas.tsx must import SettingsPage'
      );
      assert.ok(
        flowCanvasSrc.includes('OPEN_PLUGIN_SETTINGS'),
        'FlowCanvas.tsx must subscribe to OPEN_PLUGIN_SETTINGS'
      );

      const toolbarSrc = fs.readFileSync(
        path.join(rootDir, 'src/webview/components/Canvas/CanvasToolbar.tsx'),
        'utf-8'
      );
      assert.equal(
        toolbarSrc.includes('data-testid="canvas-settings-button"'),
        false,
        'CanvasToolbar should not contain a Settings button'
      );

      const codeGenPanelSrc = fs.readFileSync(
        path.join(rootDir, 'src/webview/components/codegen/CodeGenerationPanel.tsx'),
        'utf-8'
      );
      assert.ok(
        codeGenPanelSrc.includes('data-testid="bottom-panel-settings-button"'),
        'CodeGenerationPanel should keep the Settings button in the bottom tab bar'
      );

      const pkgJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf-8'));
      const hasOpenSettingsCmd = pkgJson.contributes.commands.some(
        (c: any) => c.command === 'agentFlow.openSettings'
      );
      assert.equal(hasOpenSettingsCmd, true, 'package.json must register agentFlow.openSettings');
    });
  });

  // ==========================================================================
  // 5. Extension Host GcpDiscoveryManager Model Garden Integration
  // ==========================================================================
  describe('GcpDiscoveryManager Model Garden Discovery & Enablement', () => {
    it('should transform raw gcloud Model Garden JSON into ModelCatalogItem entries', () => {
      const manager = GcpDiscoveryManager.getInstance();
      const raw = [
        {
          name: 'publishers/anthropic/models/claude-opus-5-5',
          displayName: 'Claude Opus 5.5',
          description: 'Anthropic flagship model on Vertex AI',
        },
        {
          name: 'publishers/qwen/models/qwen-2.5-coder-32b-instruct',
          displayName: 'Qwen 2.5 Coder 32B',
        },
      ];

      const items = manager.transformRawModelGardenModels(raw);
      assert.equal(items.length, 2);
      assert.equal(items[0].id, 'claude-opus-5-5');
      assert.equal(items[0].company, 'Anthropic');
      assert.equal(items[1].id, 'qwen-2.5-coder-32b-instruct');
      assert.equal(items[1].company, 'Alibaba / Qwen');
    });

    it('should deduplicate repeated Model Garden version entries from gcloud and in filterAndSortModelGarden', () => {
      const manager = GcpDiscoveryManager.getInstance();
      const rawWithDuplicateVersions = [
        { name: 'publishers/qwen/models/qwen2', versionId: '001' },
        { name: 'publishers/qwen/models/qwen2', versionId: '002' },
        { name: 'publishers/qwen/models/qwen2', versionId: '003' },
        { name: 'publishers/qwen/models/qwen-image', versionId: '001' },
        { name: 'publishers/qwen/models/qwen-image', versionId: '002' },
        { name: 'publishers/aisingapore/models/gemma-sea-lion-v4', versionId: '001' },
        { name: 'publishers/aisingapore/models/gemma-sea-lion-v4', versionId: '002' },
        // Core Always-On Gemini models should also be excluded from Model Garden duplicates
        { name: 'publishers/google/models/gemini-3.8-flash', versionId: '001' },
      ];

      const deduplicated = manager.transformRawModelGardenModels(rawWithDuplicateVersions);
      assert.equal(deduplicated.length, 3, 'Should deduplicate multiple versionId rows to 3 unique models');
      assert.deepEqual(
        deduplicated.map((m) => m.id),
        ['qwen2', 'qwen-image', 'gemma-sea-lion-v4']
      );

      // Also verify filterAndSortModelGarden deduplicates when passed raw duplicate ModelCatalogItem entries
      const duplicatedCatalog = [
        ...deduplicated,
        ...deduplicated,
        {
          id: 'QWEN2',
          name: 'qwen2',
          company: 'Alibaba / Qwen',
          description: 'Duplicate uppercase ID',
          source: 'model_garden' as const,
          gardenPublisherModel: 'publishers/qwen/models/qwen2',
        },
      ];
      const sortedUnique = filterAndSortModelGarden(duplicatedCatalog, '', 'name', 'asc');
      assert.equal(sortedUnique.length, 3);
      assert.equal(deduplicateModelGardenCatalog(duplicatedCatalog).length, 3);
    });

    it('should not falsely pre-enable any Model Garden models in DEFAULT_SETTINGS', () => {
      assert.deepEqual(
        DEFAULT_SETTINGS.adcEnabledGardenModels,
        [],
        'Model Garden models must default to OFF until verified in the user GCP project'
      );
      assert.equal(DEFAULT_SETTINGS.codeGenDefaultModel, 'gemini-3.8-flash');
    });

    it('should handle disabling and verifying Model Garden models gracefully', async () => {
      const manager = GcpDiscoveryManager.getInstance();
      const disabledRes = await manager.enableModelGardenModel(
        'claude-opus-5-5',
        'publishers/anthropic/models/claude-opus-5-5',
        false
      );
      assert.equal(disabledRes.success, true);
      assert.equal(disabledRes.enabled, false);
    });

    it('should build direct model-specific GCP Model Garden Console URLs and render verification failure modal', () => {
      const manager = GcpDiscoveryManager.getInstance();
      const claudeUrl = manager.buildModelGardenConsoleUrl(
        'publishers/anthropic/models/claude-opus-5-5',
        'claude-opus-5-5',
        'argolis-playground'
      );
      assert.equal(
        claudeUrl,
        'https://console.cloud.google.com/vertex-ai/publishers/anthropic/model-garden/claude-opus-5-5?project=argolis-playground'
      );

      const sonnetVersionedUrl = manager.buildModelGardenConsoleUrl(
        'publishers/anthropic/models/claude-3-7-sonnet@20250219',
        'claude-3-7-sonnet@20250219',
        'argolis-playground'
      );
      assert.equal(
        sonnetVersionedUrl,
        'https://console.cloud.google.com/vertex-ai/publishers/anthropic/model-garden/claude-3-7-sonnet?project=argolis-playground'
      );

      const rootDir = path.resolve(__dirname, '../../..');
      const modelsTabSrc = fs.readFileSync(
        path.join(rootDir, 'src/webview/components/settings/ModelsSettingsTab.tsx'),
        'utf-8'
      );
      assert.ok(
        modelsTabSrc.includes('data-testid="model-garden-verification-modal"'),
        'ModelsSettingsTab must render centered verification failure modal dialog'
      );
      assert.ok(
        modelsTabSrc.includes('data-testid="verification-modal-open-browser-btn"'),
        'Modal must include Open in Browser (Accept EULA) button'
      );
      assert.ok(
        modelsTabSrc.includes("type: 'OPEN_EXTERNAL_URL'"),
        'Open in Browser button must dispatch OPEN_EXTERNAL_URL RPC'
      );

      // Ensure WebviewMessageRouter does NOT trigger a duplicate VS Code bottom-right warning toast on ENABLE_MODEL_GARDEN_MODEL
      const routerSrc = fs.readFileSync(
        path.join(rootDir, 'src/extension/editor/WebviewMessageRouter.ts'),
        'utf-8'
      );
      const enableHandlerBlock = routerSrc.slice(
        routerSrc.indexOf("bridge.onMessage('ENABLE_MODEL_GARDEN_MODEL'"),
        routerSrc.indexOf("bridge.onMessage('OPEN_EXTERNAL_URL'")
      );
      assert.equal(
        enableHandlerBlock.includes('showWarningMessage'),
        false,
        'ENABLE_MODEL_GARDEN_MODEL handler must not open a duplicate VS Code warning notification'
      );
    });

    it('should omit deprecated temperature parameter for Claude models and extract text block past adaptive thinking blocks', () => {
      const rootDir = path.resolve(__dirname, '../../..');
      const engineSrc = fs.readFileSync(
        path.join(rootDir, 'src/extension/GeminiCodeGenEngine.ts'),
        'utf-8'
      );

      // Verify Anthropic streamRawPredict block does not send deprecated temperature parameter
      const rawPredictIdx = engineSrc.indexOf('// Route 1: Anthropic Claude Partner Models on Vertex AI');
      const nextRouteIdx = engineSrc.indexOf('// Route 2a:');
      assert.ok(rawPredictIdx > 0 && nextRouteIdx > rawPredictIdx, 'Should include Anthropic :streamRawPredict route');
      const rawPredictBlock = engineSrc.slice(rawPredictIdx, nextRouteIdx);
      assert.ok(
        rawPredictBlock.includes(':streamRawPredict'),
        'Anthropic Vertex AI route must use :streamRawPredict so HTTP 200 headers return immediately instead of buffering on unary :rawPredict'
      );
      assert.equal(
        rawPredictBlock.includes('temperature:'),
        false,
        'Anthropic :streamRawPredict payload must omit deprecated temperature parameter for claude-opus-5-5'
      );
      assert.ok(
        rawPredictBlock.includes('max_tokens: 64000'),
        'Anthropic :streamRawPredict payload must set max_tokens: 64000 so full 19-file repositories do not truncate'
      );
      assert.ok(
        rawPredictBlock.includes("requestPayload.thinking = { type: 'adaptive' }") &&
          rawPredictBlock.includes("requestPayload.output_config = { effort: 'low' }"),
        'Anthropic :streamRawPredict payload must set low-effort adaptive thinking for Claude 4.6/5.5 models'
      );
      assert.ok(
        rawPredictBlock.includes('HTTP 429 RESOURCE_EXHAUSTED'),
        'Anthropic :streamRawPredict handler must distinguish HTTP 429 rate-limit quota errors from HTTP 404 Model Garden entitlement errors'
      );
      assert.ok(
        rawPredictBlock.includes('stream: true') &&
          engineSrc.includes('extractAnthropicResponseText') &&
          engineSrc.includes("b.type === 'text'"),
        'Anthropic response handler must use SSE streaming and extract text blocks past adaptive thinking blocks'
      );

      // Verify OpenMaaS (DeepSeek / Qwen / Llama) route uses SSE streaming (stream: true), frequency_penalty: 0.2, and extractOpenAiResponseText
      const openMaasRouteIdx = engineSrc.indexOf('// Route 2b: Vertex AI Model Garden Open-Weights / MaaS Models');
      const geminiRouteIdx = engineSrc.indexOf('// Route 3: Google Gemini Foundation Models');
      const openMaasRouteBlock = engineSrc.slice(openMaasRouteIdx, geminiRouteIdx);
      assert.ok(
        openMaasRouteBlock.includes('stream: true') &&
          openMaasRouteBlock.includes('frequency_penalty: 0.2') &&
          openMaasRouteBlock.includes('extractOpenAiResponseText') &&
          openMaasRouteBlock.includes('HTTP 429 RESOURCE_EXHAUSTED'),
        'OpenMaaS (DeepSeek/Qwen) route must use SSE streaming, frequency_penalty: 0.2, extractOpenAiResponseText, and DSQ 429 handling'
      );

      // Verify Gemini 4 Argon forces global location, SSE streaming, and thinkingLevel: LOW
      const geminiRouteBlock = engineSrc.slice(geminiRouteIdx, geminiRouteIdx + 1800);
      assert.ok(
        geminiRouteBlock.includes("model.includes('gemini-4')") &&
          geminiRouteBlock.includes("thinkingLevel: 'LOW'"),
        'Gemini 4 Argon code generation must configure thinkingLevel: LOW'
      );
      assert.ok(
        geminiRouteBlock.includes(':streamGenerateContent?alt=sse') &&
          geminiRouteBlock.includes('requiresGlobalEndpoint'),
        'Gemini 3.8/3.7/4 models must use SSE streaming and force global Vertex AI endpoint even when GOOGLE_CLOUD_LOCATION is regional'
      );

      // Verify both prompt templates include the anti-repetition concise ignore files rule
      const agentEnginePrompt = fs.readFileSync(
        path.join(rootDir, 'resource/prompts/python_adk_agent-engine.prompt.txt'),
        'utf-8'
      );
      const cloudRunPrompt = fs.readFileSync(
        path.join(rootDir, 'resource/prompts/python_adk_cloudrun.prompt.txt'),
        'utf-8'
      );
      assert.ok(
        agentEnginePrompt.includes('CONCISE IGNORE FILES RULE (ANTI-REPETITION MANDATE)') &&
          cloudRunPrompt.includes('CONCISE IGNORE FILES RULE (ANTI-REPETITION MANDATE)'),
        'Prompt templates must enforce the Concise Ignore Files anti-repetition mandate for OpenMaaS models'
      );

      const engine = new GeminiCodeGenEngine(rootDir);
      const parsedWithThinkingAndFence = engine.parseGeminiResponse(
        '<think>Planning files...</think>\nHere is the generated project:\n```json\n[\n  {\n    "path": "agent.py",\n    "description": "Root agent",\n    "content": "root_agent = None\\n"\n  },\n  {\n    "path": "README.md",\n    "description": "Docs",\n    "content": "# Demo\\n```bash\\nmake run\\n```\\n"\n  }\n]\n```'
      );
      assert.equal(parsedWithThinkingAndFence.length, 2);
      assert.equal(parsedWithThinkingAndFence[0].path, 'agent.py');
      assert.equal(parsedWithThinkingAndFence[1].path, 'README.md');

      // Verify ensureSessionStore appends anthropic[vertex] when an agent node uses claude-*
      const filesWithClaudeDeps = engine.ensureSessionStore(
        {
          nodes: [
            {
              id: 'node-1',
              type: 'agentNode',
              data: { isStartNode: true, model: 'claude-opus-5-5' },
            },
          ],
        },
        [
          {
            path: 'requirements.txt',
            name: 'requirements.txt',
            description: 'Dependencies',
            content: 'google-adk>=2.0.0\n',
          },
        ]
      );
      assert.ok(
        filesWithClaudeDeps[0].content.includes('anthropic[vertex]>=0.49.0'),
        'ensureSessionStore should append anthropic[vertex]>=0.49.0 when a workflow node uses claude-*'
      );
    });

    it('should render input and output token usage underneath Generate Code & Stop buttons when completed and hide when generating or cleared', async () => {
      const baseConfig = {
        framework: 'google_adk' as const,
        language: 'python' as const,
        outputFolder: './my_agent/',
        includeTests: true,
        includeDocker: true,
        useStreaming: true,
        deploymentTarget: 'agent_engine' as const,
        codeGenModel: 'gemini-3.8-flash',
      };

      // 1. When completed (!isGenerating && tokenUsage provided), token labels appear underneath the buttons
      const completedHtml = renderToStaticMarkup(
        React.createElement(
          SettingsProvider,
          null,
          React.createElement(CodePreviewTab, {
            config: baseConfig,
            onChangeConfig: () => {},
            onGenerateCode: () => {},
            generatedFiles: [
              {
                name: 'agent.py',
                path: 'agent.py',
                language: 'python',
                content: 'root_agent = LlmAgent(name="root_agent")',
              },
            ],
            isGenerating: false,
            tokenUsage: {
              inputTokens: 12450,
              outputTokens: 6820,
            },
          })
        )
      );
      assert.ok(
        completedHtml.includes('data-testid="codegen-token-usage"'),
        'Should render codegen-token-usage container when generation is complete'
      );
      assert.ok(
        completedHtml.includes('data-testid="codegen-input-tokens"') &&
          completedHtml.includes('12,450'),
        'Should display formatted input tokens count'
      );
      assert.ok(
        completedHtml.includes('data-testid="codegen-output-tokens"') &&
          completedHtml.includes('6,820'),
        'Should display formatted output tokens count'
      );

      // 2. When user clicks Generate Code again (isGenerating: true or tokenUsage: null), labels are hidden
      const generatingHtml = renderToStaticMarkup(
        React.createElement(
          SettingsProvider,
          null,
          React.createElement(CodePreviewTab, {
            config: baseConfig,
            onChangeConfig: () => {},
            onGenerateCode: () => {},
            generatedFiles: [],
            isGenerating: true,
            tokenUsage: {
              inputTokens: 12450,
              outputTokens: 6820,
            },
          })
        )
      );
      assert.equal(
        generatingHtml.includes('data-testid="codegen-token-usage"'),
        false,
        'Should hide token usage labels while code generation is in progress'
      );

      const clearedHtml = renderToStaticMarkup(
        React.createElement(
          SettingsProvider,
          null,
          React.createElement(CodePreviewTab, {
            config: baseConfig,
            onChangeConfig: () => {},
            onGenerateCode: () => {},
            generatedFiles: [],
            isGenerating: false,
            tokenUsage: null,
          })
        )
      );
      assert.equal(
        clearedHtml.includes('data-testid="codegen-token-usage"'),
        false,
        'Should not render token usage labels when tokenUsage is null'
      );

      // 3. Verify GeminiCodeGenEngine extracts usageMetadata from SSE chunks
      const rootDir = path.resolve(__dirname, '../../..');
      const engine: any = new GeminiCodeGenEngine(rootDir);
      const ssePayload = [
        'data: ' +
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: '[{"path":"agent.py",' }] } }],
            usageMetadata: { promptTokenCount: 9420, candidatesTokenCount: 120 },
          }),
        'data: ' +
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [{ text: '"description":"Root","content":"x = 1\\n"}]' }],
                },
              },
            ],
            usageMetadata: {
              promptTokenCount: 9420,
              candidatesTokenCount: 3150,
              thoughtsTokenCount: 250,
            },
          }),
      ].join('\n');

      const extracted = await engine.extractGeminiResponseText({
        text: async () => ssePayload,
      });
      assert.ok(extracted.includes('agent.py'));
      assert.deepEqual(engine.lastTokenUsage, {
        inputTokens: 9420,
        outputTokens: 3400,
      });

      // 4. Verify extractOpenAiResponseText parses OpenAI / OpenMaaS SSE chunks and records usage
      const openAiSsePayload = [
        'data: ' +
          JSON.stringify({
            choices: [{ delta: { content: '[{"path":"agent.py",' } }],
          }),
        'data: ' +
          JSON.stringify({
            choices: [{ delta: { content: '"description":"Root","content":"x = 1\\n"}]' } }],
            usage: { prompt_tokens: 18500, completion_tokens: 7200 },
          }),
        'data: [DONE]',
      ].join('\n');

      const extractedOpenAi = await engine.extractOpenAiResponseText({
        text: async () => openAiSsePayload,
      });
      assert.ok(extractedOpenAi.includes('agent.py'));
      assert.deepEqual(engine.lastTokenUsage, {
        inputTokens: 18500,
        outputTokens: 7200,
      });
    });
  });
});
