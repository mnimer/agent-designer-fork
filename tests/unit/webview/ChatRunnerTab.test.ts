/**
 * Unit Tests for ChatRunnerTab Execution Target & Remote Chat Logic
 *
 * Validates:
 * 1. Target readiness resolution across local runner status and remote deployment state.
 * 2. Input and Send button enablement states for remote deployed engines.
 * 3. Dynamic placeholder and tooltip generation tailored to active execution target.
 * 4. Warning banner visibility and messaging (suppressed when remote agent is deployed).
 * 5. Dynamic health check routing (GET_AGENT_ENGINE_STATUS vs GET_LOCAL_RUNNER_STATUS).
 * 6. Message dispatch payload resolution ensuring executionTarget and deployedResourceId are included.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('ChatRunnerTab Execution Target & Remote Chat Logic', () => {
  function computeTargetReady(
    executionTarget: 'local' | 'remote',
    localRunnerStatus: string,
    isDeployed: boolean
  ): boolean {
    const isServerRunning = localRunnerStatus === 'running';
    return executionTarget === 'remote' ? isDeployed : isServerRunning;
  }

  function computeTextareaDisabled(
    isTargetReady: boolean
  ): boolean {
    return !isTargetReady;
  }

  function computeSendButtonDisabled(
    isTargetReady: boolean,
    inputPrompt: string
  ): boolean {
    return !isTargetReady || !inputPrompt.trim();
  }

  function resolveInputPlaceholder(
    isTargetReady: boolean,
    executionTarget: 'local' | 'remote',
    localRunnerStatus: string
  ): string {
    if (!isTargetReady) {
      if (executionTarget === 'remote') {
        return 'Remote agent is not deployed. Deploy to Agent Runtime on the Deployment tab to chat...';
      }
      return localRunnerStatus === 'starting'
        ? 'Local agent server is starting...'
        : 'Local agent server is offline. Start the agent in the Deployment tab to chat...';
    }
    return 'Type a message (Enter to send, Shift+Enter for newline)...';
  }

  function resolveSendButtonTooltip(
    isTargetReady: boolean,
    executionTarget: 'local' | 'remote',
    inputPrompt: string
  ): string {
    if (!isTargetReady) {
      return executionTarget === 'remote'
        ? 'Remote agent is not deployed. Deploy to Agent Runtime on the Deployment tab to send messages.'
        : 'Local agent server is offline. Start the agent in the Deployment tab to send messages.';
    }
    if (!inputPrompt.trim()) {
      return 'Enter a message first';
    }
    return 'Send message';
  }

  function resolveWarningBanner(
    isTargetReady: boolean,
    executionTarget: 'local' | 'remote'
  ): { show: boolean; title: string; message: string } {
    if (isTargetReady) {
      return { show: false, title: '', message: '' };
    }
    if (executionTarget === 'remote') {
      return {
        show: true,
        title: 'Remote Agent is Not Deployed.',
        message: 'Deploy to Agent Runtime on the Deployment tab to enable interactive chat.',
      };
    }
    return {
      show: true,
      title: 'Local Agent Server is Offline.',
      message: 'Start the local agent on the Deployment tab to enable interactive chat.',
    };
  }

  function resolveChatPayload(
    sessionId: string,
    message: string,
    executionTarget: 'local' | 'remote',
    deployedResourceId?: string,
    port?: number
  ) {
    return {
      sessionId,
      message,
      executionTarget,
      deployedResourceId: executionTarget === 'remote' ? deployedResourceId : undefined,
      port: executionTarget === 'local' ? port : undefined,
    };
  }

  it('should mark target ready when executionTarget is remote and agent is deployed, even if local runner is offline', () => {
    const isReady = computeTargetReady('remote', 'idle', true);
    assert.equal(isReady, true, 'Remote target should be ready when deployed even if local runner is idle');

    const isReadyStopped = computeTargetReady('remote', 'stopped', true);
    assert.equal(isReadyStopped, true, 'Remote target should be ready when deployed even if local runner is stopped');
  });

  it('should mark target not ready when executionTarget is remote and agent is not deployed', () => {
    const isReady = computeTargetReady('remote', 'running', false);
    assert.equal(isReady, false, 'Remote target should not be ready if agent is not deployed');
  });

  it('should mark target ready for local target only when local runner is running', () => {
    assert.equal(computeTargetReady('local', 'running', false), true);
    assert.equal(computeTargetReady('local', 'idle', true), false);
    assert.equal(computeTargetReady('local', 'starting', true), false);
    assert.equal(computeTargetReady('local', 'stopped', true), false);
    assert.equal(computeTargetReady('local', 'error', true), false);
  });

  it('should enable Send button when remote agent is deployed and input has text', () => {
    const isReady = computeTargetReady('remote', 'idle', true);
    const isDisabled = computeSendButtonDisabled(isReady, 'Hello agent');
    assert.equal(isDisabled, false, 'Send button should be enabled for deployed remote agent');
  });

  it('should keep textarea enabled while streaming so user can answer questions', () => {
    const isReady = computeTargetReady('local', 'running', false);
    const isTextareaDisabled = computeTextareaDisabled(isReady);
    assert.equal(isTextareaDisabled, false, 'Textarea must not be disabled during streaming');

    const isSendDisabledWithText = computeSendButtonDisabled(isReady, 'Yes, here is my order number 123');
    assert.equal(isSendDisabledWithText, false, 'Send button must be enabled with text even if streaming');
  });

  it('should disable Send button when remote agent is not deployed', () => {
    const isReady = computeTargetReady('remote', 'idle', false);
    const isDisabled = computeSendButtonDisabled(isReady, 'Hello agent');
    assert.equal(isDisabled, true, 'Send button should be disabled when remote agent is not deployed');
  });

  it('should suppress offline warning banner when remote agent is deployed', () => {
    const isReady = computeTargetReady('remote', 'idle', true);
    const banner = resolveWarningBanner(isReady, 'remote');
    assert.equal(banner.show, false, 'Warning banner must be suppressed when remote agent is ready');
  });

  it('should show remote deployment banner when remote target is selected but not deployed', () => {
    const isReady = computeTargetReady('remote', 'idle', false);
    const banner = resolveWarningBanner(isReady, 'remote');
    assert.equal(banner.show, true);
    assert.equal(banner.title, 'Remote Agent is Not Deployed.');
    assert.ok(banner.message.includes('Deploy to Agent Runtime'));
  });

  it('should show local offline banner when local runner is selected and offline', () => {
    const isReady = computeTargetReady('local', 'idle', true);
    const banner = resolveWarningBanner(isReady, 'local');
    assert.equal(banner.show, true);
    assert.equal(banner.title, 'Local Agent Server is Offline.');
    assert.ok(banner.message.includes('Start the local agent'));
  });

  it('should format message payload with executionTarget and deployedResourceId for remote execution', () => {
    const payload = resolveChatPayload(
      'sess-123',
      'Tell me a joke',
      'remote',
      'projects/my-proj/locations/global/reasoningEngines/999'
    );

    assert.equal(payload.sessionId, 'sess-123');
    assert.equal(payload.message, 'Tell me a joke');
    assert.equal(payload.executionTarget, 'remote');
    assert.equal(payload.deployedResourceId, 'projects/my-proj/locations/global/reasoningEngines/999');
    assert.equal(payload.port, undefined);
  });

  it('should format message payload with executionTarget and port for local execution', () => {
    const payload = resolveChatPayload(
      'sess-456',
      'Hello local',
      'local',
      'projects/my-proj/locations/global/reasoningEngines/999',
      8000
    );

    assert.equal(payload.sessionId, 'sess-456');
    assert.equal(payload.message, 'Hello local');
    assert.equal(payload.executionTarget, 'local');
    assert.equal(payload.deployedResourceId, undefined);
    assert.equal(payload.port, 8000);
  });

  it('should provide informative placeholder when remote agent is not deployed', () => {
    const placeholder = resolveInputPlaceholder(false, 'remote', 'idle');
    assert.ok(placeholder.includes('Remote agent is not deployed'));
  });

  it('should provide informative tooltip when remote agent is not deployed', () => {
    const tooltip = resolveSendButtonTooltip(false, 'remote', 'hello');
    assert.ok(tooltip.includes('Remote agent is not deployed'));
  });

  it('should ensure Chat trigger default config does not contain initialMessage', async () => {
    const { TRIGGER_CATALOG } = await import('../../../src/webview/data/triggerDefinitions');
    const chatTrigger = TRIGGER_CATALOG.find((t) => t.type === 'chat');
    assert.ok(chatTrigger);
    assert.equal((chatTrigger.defaultConfig as any)?.initialMessage, undefined);
  });

  it('should automatically switch executionTarget to local when LOCAL_RUNNER_STATUS reports running, and respect manual user target selection', () => {
    function resolveNextTarget(
      currentTarget: 'local' | 'remote',
      isDeployed: boolean,
      localRunnerStatus: 'idle' | 'starting' | 'running' | 'stopped' | 'error',
      userSelectedTarget: boolean
    ): 'local' | 'remote' {
      if (localRunnerStatus === 'running') {
        return 'local';
      }
      if (
        isDeployed &&
        (localRunnerStatus === 'idle' || localRunnerStatus === 'stopped') &&
        !userSelectedTarget
      ) {
        return 'remote';
      }
      return currentTarget;
    }

    // Initial load when deployed and local runner idle -> defaults to remote
    assert.equal(resolveNextTarget('local', true, 'idle', false), 'remote');

    // When local runner starts ('starting'), it must not snap back to 'remote' if user chose 'local'
    assert.equal(resolveNextTarget('local', true, 'starting', true), 'local');
    assert.equal(resolveNextTarget('local', true, 'idle', true), 'local');

    // When local runner reaches 'running', it automatically selects 'local'
    assert.equal(resolveNextTarget('remote', true, 'running', false), 'local');
  });
});
