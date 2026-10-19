/**
 * Unit Tests for TestRunnerTab Execution Target & Health Check Logic
 *
 * Validates:
 * 1. Target readiness resolution across local runner status and remote deployment state.
 * 2. Button enablement states (Run All and single Run buttons) for remote deployed engines.
 * 3. Dynamic tooltip generation tailored to active execution target.
 * 4. Warning banner visibility and messaging (suppressed when remote agent is deployed).
 * 5. Dynamic health check routing (GET_AGENT_ENGINE_STATUS vs GET_LOCAL_RUNNER_STATUS).
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('TestRunnerTab Execution Target & Health Check Logic', () => {
  // Pure logic functions mirroring TestRunnerTab state computations
  function computeTargetReady(
    executionTarget: 'local' | 'remote',
    localRunnerStatus: string,
    isDeployed: boolean
  ): boolean {
    const isServerRunning = localRunnerStatus === 'running';
    return executionTarget === 'remote' ? isDeployed : isServerRunning;
  }

  function computeRunButtonDisabled(
    isTargetReady: boolean,
    isRunning: boolean,
    isRunningAll: boolean,
    testPromptCount: number
  ): boolean {
    return !isTargetReady || isRunning || isRunningAll || testPromptCount === 0;
  }

  function resolveRunAllTooltip(
    isTargetReady: boolean,
    executionTarget: 'local' | 'remote'
  ): string {
    if (!isTargetReady) {
      return executionTarget === 'remote'
        ? 'Remote agent is not deployed. Deploy to Agent Runtime on the Deployment tab to run tests.'
        : 'Local agent is offline. Start the agent in the Deployment tab to run tests.';
    }
    return executionTarget === 'remote'
      ? 'Run all unit tests against remote Agent Runtime'
      : 'Run all unit tests';
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
        message: 'Deploy the workflow to Agent Runtime on the Deployment tab to enable remote unit test execution.',
      };
    }
    return {
      show: true,
      title: 'Local Agent Server is Offline.',
      message: 'Start the local agent on the Deployment tab to enable unit test execution.',
    };
  }

  function dispatchHealthCheck(
    executionTarget: 'local' | 'remote',
    targetDir: string,
    postMessage: (msg: any) => void
  ): void {
    if (executionTarget === 'remote') {
      postMessage({
        type: 'GET_AGENT_ENGINE_STATUS',
        payload: { targetDirectory: targetDir },
      });
    } else {
      postMessage({ type: 'GET_LOCAL_RUNNER_STATUS' });
    }
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
    assert.equal(computeTargetReady('local', 'stopped', true), false);
    assert.equal(computeTargetReady('local', 'error', true), false);
  });

  it('should enable Run All and Single Run buttons when remote agent is deployed', () => {
    const isTargetReady = computeTargetReady('remote', 'idle', true);
    const runAllDisabled = computeRunButtonDisabled(isTargetReady, false, false, 3);
    assert.equal(runAllDisabled, false, 'Run All button should be enabled when remote agent is deployed');

    const singleRunDisabled = computeRunButtonDisabled(isTargetReady, false, false, 1);
    assert.equal(singleRunDisabled, false, 'Single run button should be enabled when remote agent is deployed');
  });

  it('should disable Run All button when remote agent is not deployed', () => {
    const isTargetReady = computeTargetReady('remote', 'idle', false);
    const runAllDisabled = computeRunButtonDisabled(isTargetReady, false, false, 3);
    assert.equal(runAllDisabled, true, 'Run All button should be disabled when remote agent is not deployed');

    const tooltip = resolveRunAllTooltip(isTargetReady, 'remote');
    assert.match(tooltip, /Remote agent is not deployed/);
  });

  it('should suppress offline warning banner when remote agent is deployed', () => {
    const isTargetReady = computeTargetReady('remote', 'idle', true);
    const banner = resolveWarningBanner(isTargetReady, 'remote');
    assert.equal(banner.show, false, 'Warning banner must not appear when remote agent is deployed');
  });

  it('should show remote deployment banner when remote agent is selected but not deployed', () => {
    const isTargetReady = computeTargetReady('remote', 'idle', false);
    const banner = resolveWarningBanner(isTargetReady, 'remote');
    assert.equal(banner.show, true);
    assert.equal(banner.title, 'Remote Agent is Not Deployed.');
    assert.match(banner.message, /Deploy the workflow to Agent Runtime/);
  });

  it('should show local offline banner when local runner is selected and offline', () => {
    const isTargetReady = computeTargetReady('local', 'idle', true);
    const banner = resolveWarningBanner(isTargetReady, 'local');
    assert.equal(banner.show, true);
    assert.equal(banner.title, 'Local Agent Server is Offline.');
    assert.match(banner.message, /Start the local agent/);
  });

  it('should route health check messages dynamically based on active target', () => {
    const messages: any[] = [];
    const mockPostMessage = (msg: any) => messages.push(msg);

    // Remote target health check
    dispatchHealthCheck('remote', '/path/to/agent', mockPostMessage);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].type, 'GET_AGENT_ENGINE_STATUS');
    assert.equal(messages[0].payload?.targetDirectory, '/path/to/agent');

    // Local target health check
    dispatchHealthCheck('local', '/path/to/agent', mockPostMessage);
    assert.equal(messages.length, 2);
    assert.equal(messages[1].type, 'GET_LOCAL_RUNNER_STATUS');
  });
});
