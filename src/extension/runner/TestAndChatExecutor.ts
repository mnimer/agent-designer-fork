/**
 * TestAndChatExecutor
 *
 * Provides the execution runtime for running automated tests (scenarios)
 * and interactive chat sessions against local and remote agents.
 *
 * Job inside Application:
 * Offloads long-running and state-heavy logic for stream parsing, OpenAI-compatible
 * chunk mapping, LLM assertion judging, and remote Reasoning Engine execution away from
 * the AgentRunnerManager facade.
 *
 * Architectural Decisions:
 * 1. Sequential Scenario Execution: Runs scenarios sequentially to avoid port contention.
 * 2. LLM assertion evaluations: Passes criteria, output schema, and expected text to the Gemini
 *    codegen engine for semantic validation.
 * 3. Robust SSE parser: Consumes incoming stream bytes, decodes chunks, and fires incremental
 *    events to the UI.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { WebviewBridge } from '../WebviewBridge';
import { AgentWorkflowDocument, TriggerTestScenario } from '../../shared/types';
import { RunTestOptions, SendChatMessageOptions, AgentRunnerManager } from '../AgentRunnerManager';

export class TestAndChatExecutor {
  /**
   * Formats an error into a human-readable diagnostic string, unpacking inner errors
   * for Node.js AggregateError instances.
   */
  public formatErrorMessage(err: any): string {
    if (!err) return 'Unknown error';
    if (Array.isArray(err.errors) && err.errors.length > 0) {
      const details = err.errors.map((e: any) => e?.message || String(e)).filter(Boolean).join('; ');
      return err.message && err.message.trim().length > 0 ? `${err.message}: ${details}` : details;
    }
    return err.message || String(err);
  }

  /**
   * Executes test scenarios for the specified workflow document using the universal HTTP API harness.
   */
  public async runTests(runner: AgentRunnerManager, options: RunTestOptions): Promise<string> {
    const { document, scenarioIds, port, bridge, executionTarget = 'local', deployedResourceId } = options;
    const runId = `run-${Date.now()}`;
    const startTime = Date.now();
    const targetPort = port || runner.getLastRunningPort() || 8000;

    const abortController = new AbortController();
    runner.getActiveAbortControllers().set(runId, abortController);

    const scenarios = runner.extractScenarios(document, scenarioIds);
    const activeResourceId = deployedResourceId || (document as any)?.deployment?.deployedResourceId;

    const targetDescription =
      executionTarget === 'remote'
        ? `Remote Reasoning Engine (${activeResourceId || 'deployed instance'})`
        : `http://127.0.0.1:${targetPort}`;

    await bridge.postMessage({
      type: 'EXECUTION_LOG',
      payload: {
        runId,
        timestamp: new Date().toISOString(),
        level: 'info',
        message: `Starting test execution run '${runId}' with ${scenarios.length} scenario(s) against ${targetDescription}...`,
      },
    });

    let passedCount = 0;
    let failedCount = 0;

    try {
      for (const scenario of scenarios) {
        if (abortController.signal.aborted) {
          await bridge.postMessage({
            type: 'EXECUTION_LOG',
            payload: {
              runId,
              scenarioId: scenario.id,
              timestamp: new Date().toISOString(),
              level: 'warn',
              message: `[${scenario.name}] Execution skipped due to user cancellation.`,
            },
          });
          break;
        }

        const scenarioStart = Date.now();

        await bridge.postMessage({
          type: 'TEST_RESULT_UPDATE',
          payload: {
            runId,
            scenarioId: scenario.id,
            status: 'running',
            durationMs: 0,
          },
        });

        await bridge.postMessage({
          type: 'EXECUTION_LOG',
          payload: {
            runId,
            scenarioId: scenario.id,
            timestamp: new Date().toISOString(),
            level: 'info',
            message: `[${scenario.name}] Executing input query: "${scenario.inputQuery}"`,
          },
        });

        try {
          const result = await this.executeScenario(
            runner,
            document,
            scenario,
            bridge,
            runId,
            targetPort,
            executionTarget,
            activeResourceId,
            options.targetDirectory,
            abortController.signal
          );
          const duration = Date.now() - scenarioStart;

          if (result.passed) {
            passedCount++;
            await bridge.postMessage({
              type: 'TEST_RESULT_UPDATE',
              payload: {
                runId,
                scenarioId: scenario.id,
                status: 'passed',
                durationMs: duration,
                output: result.output,
              },
            });
            await bridge.postMessage({
              type: 'EXECUTION_LOG',
              payload: {
                runId,
                scenarioId: scenario.id,
                timestamp: new Date().toISOString(),
                level: 'info',
                message: `[${scenario.name}] PASSED in ${duration}ms`,
              },
            });
          } else {
            failedCount++;
            await bridge.postMessage({
              type: 'TEST_RESULT_UPDATE',
              payload: {
                runId,
                scenarioId: scenario.id,
                status: 'failed',
                durationMs: duration,
                output: result.output,
                error: result.error,
              },
            });
            await bridge.postMessage({
              type: 'EXECUTION_LOG',
              payload: {
                runId,
                scenarioId: scenario.id,
                timestamp: new Date().toISOString(),
                level: 'error',
                message: `[${scenario.name}] FAILED: ${result.error || 'Unknown error'}`,
              },
            });
          }
        } catch (err: any) {
          failedCount++;
          const duration = Date.now() - scenarioStart;
          await bridge.postMessage({
            type: 'TEST_RESULT_UPDATE',
            payload: {
              runId,
              scenarioId: scenario.id,
              status: 'failed',
              durationMs: duration,
              output: '',
              error: err.message || 'Execution failed',
            },
          });
        }
      }
    } finally {
      runner.getActiveAbortControllers().delete(runId);
    }

    const totalDuration = Date.now() - startTime;
    const summary = `Executed ${scenarios.length} test(s): ${passedCount} passed, ${failedCount} failed (${totalDuration}ms)`;

    await bridge.postMessage({
      type: 'EXECUTION_LOG',
      payload: {
        runId,
        timestamp: new Date().toISOString(),
        level: failedCount === 0 ? 'info' : 'warn',
        message: summary,
      },
    });

    await bridge.postMessage({
      type: 'EXECUTION_COMPLETE',
      payload: {
        runId,
        success: failedCount === 0,
        durationMs: totalDuration,
        summary,
      },
    });

    return runId;
  }

  /**
   * Executes a single test scenario against local HTTP runner or remote Reasoning Engine.
   */
  private async executeScenario(
    runner: AgentRunnerManager,
    document: AgentWorkflowDocument,
    scenario: TriggerTestScenario,
    bridge: WebviewBridge,
    runId: string,
    port: number,
    executionTarget: 'local' | 'remote' = 'local',
    deployedResourceId?: string,
    targetDirectory?: string,
    abortSignal?: AbortSignal
  ): Promise<{ passed: boolean; output: string; error?: string; durationMs?: number }> {
    if (abortSignal?.aborted) {
      return {
        passed: false,
        output: '',
        error: 'Execution cancelled by user.',
      };
    }

    const inputQuery = scenario.inputQuery || '';
    if (!inputQuery.trim()) {
      await bridge.postMessage({
        type: 'EXECUTION_LOG',
        payload: {
          runId,
          scenarioId: scenario.id,
          timestamp: new Date().toISOString(),
          level: 'warn',
          message: `[Test Scenario Warning]: Scenario input query is empty. The agent will receive an empty prompt.`,
        },
      });
    }

    // Early Input Schema Validation Gate (TASK-196)
    const schemaValidation = runner.validateScenarioInput(scenario, document);
    if (!schemaValidation.valid && schemaValidation.errors.length > 0) {
      const errorMsg = `[Input Schema Validation Error]: ${schemaValidation.errors.join('; ')}`;
      await bridge.postMessage({
        type: 'EXECUTION_LOG',
        payload: {
          runId,
          scenarioId: scenario.id,
          timestamp: new Date().toISOString(),
          level: 'error',
          message: errorMsg,
        },
      });
      return {
        passed: false,
        output: '',
        error: errorMsg,
        durationMs: 0,
      };
    }

    // Branch 1: Remote Execution
    if (executionTarget === 'remote') {
      await bridge.postMessage({
        type: 'EXECUTION_LOG',
        payload: {
          runId,
          scenarioId: scenario.id,
          timestamp: new Date().toISOString(),
          level: 'info',
          message: `[Remote Execution] Invoking Reasoning Engine: ${deployedResourceId || 'active instance'}...\nInput: "${inputQuery}"`,
        },
      });

      let responseText = '';
      const remoteStartTime = Date.now();
      try {
        const deployer = runner.getAgentEngineDeployer();
        if (!deployer) {
          throw new Error('Agent Engine deployer is not configured for remote test execution.');
        }

        const rawServiceUrl = (document as any)?.deployment?.serviceUrl;
        const sanitizedServiceUrl =
          rawServiceUrl && !rawServiceUrl.includes('localhost') && !rawServiceUrl.includes('127.0.0.1')
            ? rawServiceUrl
            : undefined;

        const remoteResult = await deployer.testRemoteAgentRuntime({
          targetDirectory: targetDirectory || (document as any)?._targetDirectory || '',
          remoteRuntimeId: deployedResourceId || (document as any)?.deployment?.deployedResourceId,
          serviceUrl: sanitizedServiceUrl,
          query: inputQuery,
          bridge,
          abortSignal,
        });

        if (!remoteResult.success || !remoteResult.response) {
          throw new Error(remoteResult.error || 'Remote agent returned an empty response.');
        }

        responseText = remoteResult.response;
      } catch (err: any) {
        const errMsg = this.formatErrorMessage(err);
        await bridge.postMessage({
          type: 'EXECUTION_LOG',
          payload: {
            runId,
            scenarioId: scenario.id,
            timestamp: new Date().toISOString(),
            level: 'error',
            message: `[Remote Execution Error]: ${errMsg}`,
          },
        });
        return {
          passed: false,
          output: '',
          error: errMsg,
        };
      }
      const remoteLatencyMs = Date.now() - remoteStartTime;

      await bridge.postMessage({
        type: 'EXECUTION_LOG',
        payload: {
          runId,
          scenarioId: scenario.id,
          timestamp: new Date().toISOString(),
          level: 'info',
          message: `[Remote Agent Response]:\n${responseText}`,
        },
      });

      const shouldEvaluateAssertion = Boolean(
        (scenario.expectedOutput && scenario.expectedOutput.trim().length > 0) ||
        scenario.assertionType === 'json_schema' ||
        scenario.expectedSchema
      );

      if (shouldEvaluateAssertion) {
        await bridge.postMessage({
          type: 'EXECUTION_LOG',
          payload: {
            runId,
            scenarioId: scenario.id,
            timestamp: new Date().toISOString(),
            level: 'info',
            message: `[Test Evaluator] Evaluating assertion (${scenario.assertionType || 'criteria'}): "${scenario.expectedOutput || (scenario.assertionType === 'json_schema' ? 'Schema conformance' : '')}"...`,
          },
        });

        const evalStartTime = Date.now();
        const evalResult = await runner.getCodeGenEngine().evaluateAssertion({
          inputQuery: inputQuery,
          expectedCriteria: scenario.expectedOutput || '',
          actualOutput: responseText,
          model: 'gemini-3.8-flash',
          assertionType: scenario.assertionType,
          expectedSchema: scenario.expectedSchema,
        });
        const evalLatencyMs = Date.now() - evalStartTime;

        await bridge.postMessage({
          type: 'EXECUTION_LOG',
          payload: {
            runId,
            scenarioId: scenario.id,
            timestamp: new Date().toISOString(),
            level: evalResult.passed ? 'info' : 'warn',
            message: `[Test Evaluator Verdict]: ${evalResult.passed ? 'PASSED' : 'FAILED'} - ${evalResult.reason}`,
          },
        });

        await bridge.postMessage({
          type: 'EXECUTION_LOG',
          payload: {
            runId,
            scenarioId: scenario.id,
            timestamp: new Date().toISOString(),
            level: 'info',
            message: `[Latency Metrics] Remote invocation: ${remoteLatencyMs}ms, Assertion evaluation: ${evalLatencyMs}ms (Total: ${remoteLatencyMs + evalLatencyMs}ms)`,
          },
        });

        return {
          passed: evalResult.passed,
          output: responseText,
          error: evalResult.passed ? undefined : evalResult.reason,
          durationMs: remoteLatencyMs + evalLatencyMs,
        };
      }

      return {
        passed: true,
        output: responseText,
        durationMs: remoteLatencyMs,
      };
    }

    // Branch 2: Local Execution
    const agentNodes = (document.nodes || []).filter(
      (n) => n.type === 'agent' || (n as any).type === 'agentNode'
    );
    let modelName = (agentNodes[0]?.data as any)?.model || 'gemini-3.8-flash';
    if (
      !modelName ||
      modelName.includes('2.5') ||
      modelName.includes('1.5') ||
      modelName.includes('2.0')
    ) {
      modelName = 'gemini-3.8-flash';
    }

    const sessionId = `test-session-${scenario.id}-${Date.now()}`;
    const sessionHeaders: Record<string, string> = {
      'X-Session-ID': sessionId,
      'X-Thread-ID': sessionId,
    };

    const requestPayload: any = {
      model: modelName,
      messages: [{ role: 'user', content: inputQuery }],
      session_id: sessionId,
      thread_id: sessionId,
      user_id: 'test-runner',
    };

    await bridge.postMessage({
      type: 'EXECUTION_LOG',
      payload: {
        runId,
        scenarioId: scenario.id,
        timestamp: new Date().toISOString(),
        level: 'info',
        message: `[Turn Session Isolated] Initialized fresh test session: ${sessionId}`,
      },
    });

    await bridge.postMessage({
      type: 'EXECUTION_LOG',
      payload: {
        runId,
        scenarioId: scenario.id,
        timestamp: new Date().toISOString(),
        level: 'info',
        message: `[HTTP Request] POST http://127.0.0.1:${port}/v1/chat/completions\nPayload: ${JSON.stringify(requestPayload, null, 2)}`,
      },
    });

    try {
      const networkStartTime = Date.now();
      let httpResult = await runner.httpPostJson(
        port,
        '/v1/chat/completions',
        requestPayload,
        30000,
        abortSignal,
        sessionHeaders
      );
      let networkLatencyMs = Date.now() - networkStartTime;

      if (
        !httpResult.ok &&
        httpResult.text &&
        httpResult.text.includes('Unsupported model') &&
        modelName !== 'gemini-flash-latest'
      ) {
        modelName = 'gemini-flash-latest';
        requestPayload.model = modelName;
        const retryStart = Date.now();
        httpResult = await runner.httpPostJson(
          port,
          '/v1/chat/completions',
          requestPayload,
          30000,
          abortSignal,
          sessionHeaders
        );
        networkLatencyMs += Date.now() - retryStart;
      }

      if ((!httpResult.ok && httpResult.status === 404) || (!httpResult.text && httpResult.status === 200)) {
        try {
          const slashResult = await runner.httpPostJson(
            port,
            '/v1/chat/completions/',
            requestPayload,
            15000,
            abortSignal,
            sessionHeaders
          );
          if (slashResult.ok && slashResult.text && slashResult.text.trim().length > 0) {
            httpResult = slashResult;
          }
        } catch {}
      }

      if (!httpResult.ok && httpResult.status === 404) {
        try {
          const convPayload = {
            prompt: inputQuery,
            message: inputQuery,
            messages: [{ role: 'user', content: inputQuery }],
            session_id: sessionId,
            thread_id: sessionId,
          };
          const convResult = await runner.httpPostJson(
            port,
            '/conversation',
            convPayload,
            15000,
            abortSignal,
            sessionHeaders
          );
          if (convResult.ok && convResult.text && convResult.text.trim().length > 0) {
            httpResult = convResult;
          }
        } catch {}
      }

      await bridge.postMessage({
        type: 'EXECUTION_LOG',
        payload: {
          runId,
          scenarioId: scenario.id,
          timestamp: new Date().toISOString(),
          level: httpResult.ok ? 'info' : 'error',
          message: `[HTTP Raw Response (Status: ${httpResult.status}, OK: ${httpResult.ok})]:\n${httpResult.text || '(empty body)'}`,
        },
      });

      if (httpResult.ok) {
        const data = httpResult.data;
        let responseText = '';

        const choices = data?.choices;
        const messageObj = choices?.[0]?.message;
        const toolCalls = messageObj?.tool_calls;
        const defaultAgentLabel = (agentNodes[0]?.data as any)?.label || agentNodes[0]?.id || 'Agent';

        if (Array.isArray(toolCalls) && toolCalls.length > 0) {
          for (const tc of toolCalls) {
            const fnName = tc.function?.name || tc.name || 'tool';
            const fnArgs = tc.function?.arguments || tc.arguments || '';
            await bridge.postMessage({
              type: 'EXECUTION_LOG',
              payload: {
                runId,
                scenarioId: scenario.id,
                timestamp: new Date().toISOString(),
                level: 'info',
                message: `[Tool Call] ${fnName}(${typeof fnArgs === 'object' ? JSON.stringify(fnArgs) : fnArgs})`,
                agentId: defaultAgentLabel,
                stepId: tc.id || `step-${Date.now()}`,
              },
            });
          }
        }

        if (messageObj?.reasoning_content) {
          await bridge.postMessage({
            type: 'EXECUTION_LOG',
            payload: {
              runId,
              scenarioId: scenario.id,
              timestamp: new Date().toISOString(),
              level: 'info',
              message: `[Reasoning Step] ${messageObj.reasoning_content}`,
              agentId: defaultAgentLabel,
            },
          });
        }

        if (Array.isArray(data?.traces)) {
          for (const tr of data.traces) {
            const traceMsg = typeof tr === 'string' ? tr : tr.message || JSON.stringify(tr);
            await bridge.postMessage({
              type: 'EXECUTION_LOG',
              payload: {
                runId,
                scenarioId: scenario.id,
                timestamp: new Date().toISOString(),
                level: 'info',
                message: `[Agent Trace] ${traceMsg}`,
                agentId: tr.agentId || defaultAgentLabel,
                stepId: tr.stepId,
              },
            });
          }
        }

        if (typeof data?.choices?.[0]?.message?.content === 'string') {
          responseText = data.choices[0].message.content;
        } else if (data?.choices?.[0]?.message?.content !== undefined && data?.choices?.[0]?.message?.content !== null) {
          responseText = typeof data.choices[0].message.content === 'object'
            ? JSON.stringify(data.choices[0].message.content, null, 2)
            : String(data.choices[0].message.content);
        } else if (typeof data?.choices?.[0]?.text === 'string') {
          responseText = data.choices[0].text;
        } else if (typeof data?.response === 'string') {
          responseText = data.response;
        } else if (data?.response !== undefined && data?.response !== null) {
          responseText = typeof data.response === 'object'
            ? JSON.stringify(data.response, null, 2)
            : String(data.response);
        } else if (typeof data?.content === 'string') {
          responseText = data.content;
        } else if (data?.content !== undefined && data?.content !== null) {
          responseText = typeof data.content === 'object'
            ? JSON.stringify(data.content, null, 2)
            : String(data.content);
        } else if (typeof data?.output === 'string') {
          responseText = data.output;
        } else if (data?.output !== undefined && data?.output !== null) {
          responseText = typeof data.output === 'object'
            ? JSON.stringify(data.output, null, 2)
            : String(data.output);
        } else if (typeof data?.result === 'string') {
          responseText = data.result;
        } else if (data?.result !== undefined && data?.result !== null) {
          responseText = typeof data.result === 'object'
            ? JSON.stringify(data.result, null, 2)
            : String(data.result);
        } else if (typeof data === 'string') {
          responseText = data;
        } else if (data !== undefined && data !== null) {
          responseText = JSON.stringify(data, null, 2);
        } else if (httpResult.text && httpResult.text.trim().length > 0) {
          responseText = httpResult.text;
        }

        await bridge.postMessage({
          type: 'EXECUTION_LOG',
          payload: {
            runId,
            scenarioId: scenario.id,
            timestamp: new Date().toISOString(),
            level: 'info',
            message: `[Live Agent Extracted Output]:\n${responseText || '(empty response)'}`,
          },
        });

        let evalLatencyMs = 0;
        const shouldEvaluateAssertion = Boolean(
          (scenario.expectedOutput && scenario.expectedOutput.trim().length > 0) ||
          scenario.assertionType === 'json_schema' ||
          scenario.expectedSchema
        );

        if (shouldEvaluateAssertion) {
          await bridge.postMessage({
            type: 'EXECUTION_LOG',
            payload: {
              runId,
              scenarioId: scenario.id,
              timestamp: new Date().toISOString(),
              level: 'info',
              message: `[Test Evaluator] Evaluating assertion (${scenario.assertionType || 'criteria'}): "${scenario.expectedOutput || (scenario.assertionType === 'json_schema' ? 'Schema conformance' : '')}"...`,
            },
          });

          const evalStartTime = Date.now();
          const evalResult = await runner.getCodeGenEngine().evaluateAssertion({
            inputQuery: inputQuery,
            expectedCriteria: scenario.expectedOutput || '',
            actualOutput: responseText,
            model: 'gemini-flash-latest',
            assertionType: scenario.assertionType,
            expectedSchema: scenario.expectedSchema,
          });
          evalLatencyMs = Date.now() - evalStartTime;

          await bridge.postMessage({
            type: 'EXECUTION_LOG',
            payload: {
              runId,
              scenarioId: scenario.id,
              timestamp: new Date().toISOString(),
              level: evalResult.passed ? 'info' : 'warn',
              message: `[Test Evaluator Verdict]: ${evalResult.passed ? 'PASSED' : 'FAILED'} - ${evalResult.reason}`,
            },
          });

          await bridge.postMessage({
            type: 'EXECUTION_LOG',
            payload: {
              runId,
              scenarioId: scenario.id,
              timestamp: new Date().toISOString(),
              level: 'info',
              message: `[Latency Metrics] Agent response: ${networkLatencyMs}ms, Assertion evaluation: ${evalLatencyMs}ms (Total: ${networkLatencyMs + evalLatencyMs}ms)`,
            },
          });

          if (!evalResult.passed) {
            return {
              passed: false,
              output: responseText,
              error: evalResult.reason,
              durationMs: networkLatencyMs + evalLatencyMs,
            };
          }
        } else {
          await bridge.postMessage({
            type: 'EXECUTION_LOG',
            payload: {
              runId,
              scenarioId: scenario.id,
              timestamp: new Date().toISOString(),
              level: 'info',
              message: `[Latency Metrics] Agent response: ${networkLatencyMs}ms`,
            },
          });
        }

        return {
          passed: true,
          output: responseText,
          durationMs: networkLatencyMs + evalLatencyMs,
        };
      } else {
        const errorMsg =
          httpResult.status === 0
            ? `Agent server is offline on http://127.0.0.1:${port}. Please start the local runner in the Deployment tab.`
            : `Agent server returned HTTP ${httpResult.status}: ${httpResult.text}`;
        return {
          passed: false,
          output: httpResult.text || '',
          error: errorMsg,
          durationMs: networkLatencyMs,
        };
      }
    } catch (err: any) {
      if (abortSignal?.aborted || err.message?.includes('aborted')) {
        return {
          passed: false,
          output: '',
          error: 'Execution cancelled by user.',
        };
      }
      return {
        passed: false,
        output: '',
        error: `Agent server is offline on http://127.0.0.1:${port}. Please start the local runner in the Deployment tab. (${err.message})`,
      };
    }
  }

  /**
   * Sends an interactive conversational turn to local/remote agent and streams tokens.
   */
  public async sendChatMessage(runner: AgentRunnerManager, options: SendChatMessageOptions): Promise<void> {
    const {
      sessionId,
      message,
      bridge,
      document,
      targetDirectory,
      executionTarget = 'local',
      deployedResourceId,
    } = options;
    const streaming = options.streaming !== false;

    let history = runner.getChatHistory(sessionId);
    if (options.history && options.history.length > 0) {
      history = [...options.history];
    }
    history.push({ role: 'user', content: message });
    runner.getChatSessions().set(sessionId, history);

    if (executionTarget === 'remote') {
      const deployer = runner.getAgentEngineDeployer();
      if (!deployer) {
        await bridge.postMessage({
          type: 'CHAT_STREAM_CHUNK',
          payload: {
            sessionId,
            chunk: '',
            done: true,
            error: 'Agent Engine deployer is not configured for remote chat execution.',
          },
        });
        return;
      }

      const rawServiceUrl = (document as any)?.deployment?.serviceUrl;
      const sanitizedServiceUrl =
        rawServiceUrl && !rawServiceUrl.includes('localhost') && !rawServiceUrl.includes('127.0.0.1')
          ? rawServiceUrl
          : undefined;

      const existingRemoteSessionId = runner.getRemoteReasoningEngineSessions().get(sessionId);
      let streamedTokens = '';

      try {
        const remoteResult = await deployer.testRemoteAgentRuntime({
          targetDirectory: targetDirectory || (document as any)?._targetDirectory || '',
          remoteRuntimeId: deployedResourceId || (document as any)?.deployment?.deployedResourceId,
          serviceUrl: sanitizedServiceUrl,
          query: message,
          bridge,
          remoteSessionId: existingRemoteSessionId,
          onChunk: (chunkText) => {
            streamedTokens += chunkText;
            bridge.postMessage({
              type: 'CHAT_STREAM_CHUNK',
              payload: {
                sessionId,
                chunk: chunkText,
                done: false,
              },
            });
          },
        });

        if (!remoteResult.success || (!remoteResult.response && !streamedTokens)) {
          throw new Error(remoteResult.error || 'Remote agent returned an empty response.');
        }

        const finalReply = remoteResult.response || streamedTokens;
        if (remoteResult.remoteSessionId) {
          runner.getRemoteReasoningEngineSessions().set(sessionId, remoteResult.remoteSessionId);
        }

        if (!streamedTokens && finalReply) {
          if (streaming && finalReply.length > 50) {
            const words = finalReply.split(' ');
            for (let i = 0; i < words.length; i++) {
              const token = words[i] + (i < words.length - 1 ? ' ' : '');
              await bridge.postMessage({
                type: 'CHAT_STREAM_CHUNK',
                payload: {
                  sessionId,
                  chunk: token,
                  done: false,
                },
              });
              await new Promise((r) => setTimeout(r, 12));
            }
          } else {
            await bridge.postMessage({
              type: 'CHAT_STREAM_CHUNK',
              payload: {
                sessionId,
                chunk: finalReply,
                done: false,
              },
            });
          }
        }

        history.push({ role: 'assistant', content: finalReply });
        runner.getChatSessions().set(sessionId, history);

        await bridge.postMessage({
          type: 'CHAT_STREAM_CHUNK',
          payload: {
            sessionId,
            chunk: '',
            done: true,
          },
        });
      } catch (err: any) {
        const errMsg = this.formatErrorMessage(err);
        await bridge.postMessage({
          type: 'CHAT_STREAM_CHUNK',
          payload: {
            sessionId,
            chunk: '',
            done: true,
            error: `Remote chat execution failed: ${errMsg}`,
          },
        });
      }
      return;
    }

    let port = options.port || (await runner.detectLiveRunnerPort());
    if (!port && targetDirectory) {
      try {
        await bridge.postMessage({
          type: 'LOCAL_RUNNER_LOG',
          payload: {
            text: `[Chat Runner] Local server offline. Starting agent runner on port 8000...`,
            stream: 'system',
            timestamp: new Date().toISOString(),
          },
        });
        await runner.startLocalRunner({
          document,
          targetDirectory,
          port: 8000,
          bridge,
        });
        const ready = await runner.waitForServerReady(8000, 12000);
        if (ready) {
          port = 8000;
        }
      } catch (err: any) {
        // Continue
      }
    }

    if (!port) {
      await bridge.postMessage({
        type: 'CHAT_STREAM_CHUNK',
        payload: {
          sessionId,
          chunk: '',
          done: true,
          error: 'Agent server is offline. Please generate code and click "Start Local Runner" in the bottom panel.',
        },
      });
      return;
    }

    const agentNodes = (document?.nodes || []).filter(
      (n) => n.type === 'agent' || (n as any).type === 'agentNode'
    );
    let modelName = (agentNodes[0]?.data as any)?.model || 'gemini-flash-latest';
    if (!modelName || modelName.includes('2.5') || modelName.includes('1.5') || modelName.includes('2.0')) {
      modelName = 'gemini-flash-latest';
    }

    const payload = {
      model: modelName,
      messages: history.map((h) => ({ role: h.role, content: h.content })),
      stream: streaming,
      sessionId,
      session_id: sessionId,
    };

    let assistantReply = '';
    const candidateUrls = [
      `http://localhost:${port}/v1/chat/completions`,
      `http://127.0.0.1:${port}/v1/chat/completions`,
    ];

    try {
      let response: any = null;
      let lastErr: any = null;

      for (const targetUrl of candidateUrls) {
        try {
          if (typeof fetch === 'function') {
            response = await fetch(targetUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'text/event-stream, application/json, text/plain, */*',
              },
              body: JSON.stringify(payload),
            });
            if (response.ok) break;
          }
        } catch (e) {
          lastErr = e;
        }
      }

      if (!response || !response.ok) {
        const fallbackRes = await runner.httpPostJson(port, '/v1/chat/completions', payload, 30000);
        if (fallbackRes.ok && fallbackRes.data) {
          const content = fallbackRes.data?.choices?.[0]?.message?.content || fallbackRes.text;
          assistantReply = content;
          await bridge.postMessage({
            type: 'CHAT_STREAM_CHUNK',
            payload: {
              sessionId,
              chunk: content,
              done: false,
            },
          });
        } else {
          throw new Error(lastErr ? lastErr.message : `Runner endpoint returned status ${response?.status || fallbackRes.status}`);
        }
      } else {
        const contentType = response.headers.get('content-type') || '';
        if (streaming && contentType.includes('text/event-stream') && response.body) {
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let isStreamDone = false;

          try {
            while (!isStreamDone) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith(':')) continue;
                if (trimmed === 'data: [DONE]') {
                  isStreamDone = true;
                  break;
                }
                if (trimmed.startsWith('data: ')) {
                  const dataStr = trimmed.slice(6);
                  try {
                    const parsed = JSON.parse(dataStr);
                    const delta = parsed.choices?.[0]?.delta?.content || parsed.content || '';
                    if (delta) {
                      assistantReply += delta;
                      await bridge.postMessage({
                        type: 'CHAT_STREAM_CHUNK',
                        payload: {
                          sessionId,
                          chunk: delta,
                          done: false,
                        },
                      });
                    }
                    if (parsed.choices?.[0]?.finish_reason === 'stop') {
                      isStreamDone = true;
                      break;
                    }
                  } catch {
                    if (dataStr) {
                      assistantReply += dataStr;
                      await bridge.postMessage({
                        type: 'CHAT_STREAM_CHUNK',
                        payload: {
                          sessionId,
                          chunk: dataStr,
                          done: false,
                        },
                      });
                    }
                  }
                }
              }
            }
          } finally {
            try {
              await reader.cancel();
            } catch {}
          }
        } else {
          const text = await response.text();
          let replyContent = text;
          try {
            const json = JSON.parse(text);
            replyContent = json.choices?.[0]?.message?.content || json.response || json.output || text;
          } catch {}

          assistantReply = replyContent;

          if (streaming && replyContent.length > 50) {
            const words = replyContent.split(' ');
            for (let i = 0; i < words.length; i++) {
              const token = words[i] + (i < words.length - 1 ? ' ' : '');
              await bridge.postMessage({
                type: 'CHAT_STREAM_CHUNK',
                payload: {
                  sessionId,
                  chunk: token,
                  done: false,
                },
              });
              await new Promise((r) => setTimeout(r, 12));
            }
          } else {
            await bridge.postMessage({
              type: 'CHAT_STREAM_CHUNK',
              payload: {
                sessionId,
                chunk: replyContent,
                done: false,
              },
            });
          }
        }
      }

      history.push({ role: 'assistant', content: assistantReply });
      runner.getChatSessions().set(sessionId, history);

      await bridge.postMessage({
        type: 'CHAT_STREAM_CHUNK',
        payload: {
          sessionId,
          chunk: '',
          done: true,
        },
      });
    } catch (err: any) {
      await bridge.postMessage({
        type: 'CHAT_STREAM_CHUNK',
        payload: {
          sessionId,
          chunk: '',
          done: true,
          error: `Chat execution failed: ${err.message || 'Unknown error'}`,
        },
      });
    }
  }
}
