/**
 * Unit Tests for ADK ApplicationIntegrationToolset Integration (TASK-228)
 *
 * Validates:
 * 1. Preset definitions for SaaS connectors (Salesforce, ServiceNow, Jira, SAP ERP, Workday, HubSpot).
 * 2. Factory helper `createApplicationIntegrationToolDefinition` in both connector and integration_trigger modes.
 * 3. Python ADK code generation for integration triggers with GCP project and location.
 * 4. Python ADK code generation for Enterprise Connectors with entity_operations and actions.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ENTERPRISE_CONNECTOR_PRESETS,
  createApplicationIntegrationToolDefinition,
  generateApplicationIntegrationPythonCode,
} from '../../../src/webview/data/builtinToolsRegistry';
import { ApplicationIntegrationConfig } from '../../../src/shared/agentSpec';

describe('TASK-228: ADK ApplicationIntegrationToolset Integration', () => {
  it('should define all 6 official enterprise connector presets', () => {
    assert.equal(ENTERPRISE_CONNECTOR_PRESETS.length, 6);
    const presetIds = ENTERPRISE_CONNECTOR_PRESETS.map((p) => p.id);
    assert.ok(presetIds.includes('salesforce'));
    assert.ok(presetIds.includes('servicenow'));
    assert.ok(presetIds.includes('jira'));
    assert.ok(presetIds.includes('sap_erp'));
    assert.ok(presetIds.includes('workday'));
    assert.ok(presetIds.includes('hubspot'));

    const sf = ENTERPRISE_CONNECTOR_PRESETS.find((p) => p.id === 'salesforce')!;
    assert.ok(sf.defaultEntityOperations.Account);
    assert.ok(sf.defaultActions.includes('execute_soql'));
  });

  it('should create an ApplicationIntegration ToolDefinition for connector mode', () => {
    const config: ApplicationIntegrationConfig = {
      mode: 'connector',
      project: 'enterprise-prod-123',
      location: 'us-central1',
      connection: 'servicenow-emea',
      entityOperations: {
        Incident: ['GET', 'LIST', 'CREATE'],
      },
      actions: ['resolve_incident'],
    };

    const toolDef = createApplicationIntegrationToolDefinition(config);
    assert.ok(toolDef.id.startsWith('builtin_app_integration_'));
    assert.equal(toolDef.name, 'Connector: servicenow-emea');
    assert.equal(toolDef.builtinType, 'application_integration');
    assert.equal(toolDef.type, 'custom');
    assert.ok(toolDef.applicationIntegrationConfig);
    assert.equal(toolDef.applicationIntegrationConfig.mode, 'connector');
    assert.equal(toolDef.applicationIntegrationConfig.project, 'enterprise-prod-123');
  });

  it('should create an ApplicationIntegration ToolDefinition for trigger flow mode', () => {
    const config: ApplicationIntegrationConfig = {
      mode: 'integration_trigger',
      project: 'enterprise-prod-123',
      location: 'us-central1',
      integration: 'lead-enrichment-flow',
      triggers: ['api_trigger/lead_created'],
    };

    const toolDef = createApplicationIntegrationToolDefinition(config, 'Lead Pipeline Trigger');
    assert.equal(toolDef.name, 'Lead Pipeline Trigger');
    assert.equal(toolDef.applicationIntegrationConfig?.mode, 'integration_trigger');
    assert.equal(toolDef.applicationIntegrationConfig?.integration, 'lead-enrichment-flow');
  });

  it('should generate Python code for integration flow triggers', () => {
    const config: ApplicationIntegrationConfig = {
      mode: 'integration_trigger',
      project: 'sample-project',
      location: 'us-east1',
      integration: 'order_approval_wf',
      triggers: ['api_trigger/order_submitted'],
    };

    const code = generateApplicationIntegrationPythonCode(config);
    assert.ok(code.includes('from google.adk.tools.application_integration_tool.application_integration_toolset import ApplicationIntegrationToolset'));
    assert.ok(code.includes('project="sample-project"'));
    assert.ok(code.includes('location="us-east1"'));
    assert.ok(code.includes('integration="order_approval_wf"'));
    assert.ok(code.includes('triggers=["api_trigger/order_submitted"]'));
  });

  it('should generate Python code for SaaS connectors with entity operations and actions', () => {
    const config: ApplicationIntegrationConfig = {
      mode: 'connector',
      project: 'sample-project',
      location: 'us-central1',
      connection: 'salesforce-crm',
      entityOperations: {
        Account: ['GET', 'LIST'],
      },
      actions: ['execute_soql'],
    };

    const code = generateApplicationIntegrationPythonCode(config);
    assert.ok(code.includes('connection="salesforce-crm"'));
    assert.ok(code.includes('"Account"'));
    assert.ok(code.includes('actions=["execute_soql"]'));
  });
});
