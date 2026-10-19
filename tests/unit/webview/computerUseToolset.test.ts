/**
 * Unit Tests for ADK ComputerUseToolset Integration (TASK-232)
 *
 * Validates:
 * 1. Factory helper `createComputerUseToolsetDefinition` with environment defaults.
 * 2. Playwright Chromium and Browserbase environment configurations.
 * 3. Screen dimensions, headless flag, and allowed domains.
 * 4. Python ADK code generation for PlaywrightComputer and BrowserbaseComputer.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createComputerUseToolsetDefinition,
  generateComputerUseToolsetPythonCode,
} from '../../../src/webview/data/builtinToolsRegistry';
import { ComputerUseConfig } from '../../../src/shared/agentSpec';

describe('TASK-232: ADK ComputerUseToolset Integration', () => {
  it('should create ComputerUseToolset definition with Playwright defaults', () => {
    const config: ComputerUseConfig = {
      environment: 'playwright_chromium',
      screenWidth: 1920,
      screenHeight: 1080,
      headless: true,
      allowedDomains: ['example.com'],
    };

    const toolDef = createComputerUseToolsetDefinition(config);
    assert.ok(toolDef.id.startsWith('builtin_computer_use_'));
    assert.equal(toolDef.name, 'Gemini Computer Use');
    assert.equal(toolDef.builtinType, 'computer_use');
    assert.equal(toolDef.category, 'system');
    assert.ok(toolDef.computerUseConfig);
    assert.equal(toolDef.computerUseConfig.environment, 'playwright_chromium');
    assert.equal(toolDef.computerUseConfig.screenWidth, 1920);
    assert.equal(toolDef.computerUseConfig.screenHeight, 1080);
    assert.equal(toolDef.computerUseConfig.headless, true);
    assert.deepEqual(toolDef.computerUseConfig.allowedDomains, ['example.com']);
  });

  it('should generate Python code for Playwright computer automation', () => {
    const config: ComputerUseConfig = {
      environment: 'playwright_chromium',
      screenWidth: 1440,
      screenHeight: 900,
      headless: false,
    };

    const code = generateComputerUseToolsetPythonCode(config);
    assert.ok(code.includes('from google.adk.tools.computer_use.computer_use_toolset import ComputerUseToolset'));
    assert.ok(code.includes('from google.adk.tools.computer_use.playwright import PlaywrightComputer'));
    assert.ok(code.includes('headless=False'));
    assert.ok(code.includes('screen_size=(1440, 900)'));
    assert.ok(code.includes('computer_use_toolset = ComputerUseToolset('));
  });

  it('should generate Python code for Browserbase cloud browser automation', () => {
    const config: ComputerUseConfig = {
      environment: 'browserbase',
      screenWidth: 1280,
      screenHeight: 800,
    };

    const code = generateComputerUseToolsetPythonCode(config);
    assert.ok(code.includes('from google.adk.tools.computer_use.browserbase import BrowserbaseComputer'));
    assert.ok(code.includes('screen_size=(1280, 800)'));
    assert.ok(!code.includes('headless='));
  });
});
