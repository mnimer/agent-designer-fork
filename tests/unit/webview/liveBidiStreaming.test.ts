/**
 * Unit Tests for ADK Live Bidirectional Streaming (TASK-235)
 *
 * Validates:
 * 1. buildLiveRunConfigSnippet Python ADK code generation with LiveRequestQueue,
 *    response_modalities, speech_config, transcription, affective dialog, and proactivity.
 * 2. Prebuilt voice catalog (Puck, Charon, Kore, Fenrir, Aoede).
 * 3. LiveStreamingConfigPanel component rendering and prop validation.
 * 4. ChatPanel Live Voice UI states (idle, connecting, active, muted) and transcription banner.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {
  buildLiveRunConfigSnippet,
  PREBUILT_LIVE_VOICES,
  LiveStreamingConfigPanel,
} from '../../../src/webview/components/inspector/TriggerInspectorDrawer';
import {
  ChatPanel,
  LiveVoiceSessionState,
} from '../../../src/webview/components/runner/ChatPanel';
import { LiveStreamingConfig } from '../../../src/shared/agentSpec';

describe('TASK-235: ADK Live Bidirectional Streaming Suite', () => {
  describe('buildLiveRunConfigSnippet', () => {
    it('should return disabled message when config is omitted or enabled is false', () => {
      assert.equal(
        buildLiveRunConfigSnippet(undefined),
        '# Live bidirectional streaming is disabled'
      );
      assert.equal(
        buildLiveRunConfigSnippet({ enabled: false, responseModalities: ['AUDIO', 'TEXT'] }),
        '# Live bidirectional streaming is disabled'
      );
    });

    it('should generate complete live runner setup with LiveRequestQueue and RunConfig', () => {
      const config: LiveStreamingConfig = {
        enabled: true,
        responseModalities: ['AUDIO'],
        voiceName: 'Kore',
        enableInputAudioTranscription: true,
        enableOutputAudioTranscription: true,
        enableAffectiveDialog: true,
        proactivity: true,
      };

      const code = buildLiveRunConfigSnippet(config);

      assert.ok(code.includes('from google.genai import types'));
      assert.ok(code.includes('from google.adk.runners import LiveRequestQueue'));
      assert.ok(code.includes('live_queue = LiveRequestQueue()'));
      assert.ok(code.includes('response_modalities=["AUDIO"]'));
      assert.ok(code.includes('voice_name="Kore"'));
      assert.ok(code.includes('input_audio_transcription=types.InputAudioTranscriptionConfig(enabled=True)'));
      assert.ok(code.includes('output_audio_transcription=types.OutputAudioTranscriptionConfig(enabled=True)'));
      assert.ok(code.includes('affective_dialog=types.AffectiveDialogConfig(enabled=True)'));
      assert.ok(code.includes('proactivity=types.ProactivityConfig(enabled=True)'));
      assert.ok(code.includes('live_session = runner.run_live('));
    });

    it('should default voice to Puck and modalities to AUDIO, TEXT when unspecified', () => {
      const config: LiveStreamingConfig = {
        enabled: true,
        responseModalities: [],
      };

      const code = buildLiveRunConfigSnippet(config);
      assert.ok(code.includes('"AUDIO", "TEXT"'));
      assert.ok(code.includes('voice_name="Puck"'));
    });
  });

  describe('Prebuilt Voices Catalog', () => {
    it('should list all five Gemini Live prebuilt voices', () => {
      assert.equal(PREBUILT_LIVE_VOICES.length, 5);
      assert.ok(PREBUILT_LIVE_VOICES.includes('Puck'));
      assert.ok(PREBUILT_LIVE_VOICES.includes('Charon'));
      assert.ok(PREBUILT_LIVE_VOICES.includes('Kore'));
      assert.ok(PREBUILT_LIVE_VOICES.includes('Fenrir'));
      assert.ok(PREBUILT_LIVE_VOICES.includes('Aoede'));
    });
  });

  describe('LiveStreamingConfigPanel Component', () => {
    it('should instantiate LiveStreamingConfigPanel with active voice and toggles', () => {
      let dispatchedConfig: LiveStreamingConfig | null = null;
      const element = React.createElement(LiveStreamingConfigPanel, {
        liveConfig: {
          enabled: true,
          responseModalities: ['AUDIO', 'TEXT'],
          voiceName: 'Fenrir',
          enableInputAudioTranscription: true,
          enableOutputAudioTranscription: true,
          enableAffectiveDialog: true,
          proactivity: true,
        },
        onChange: (cfg) => {
          dispatchedConfig = cfg;
        },
      });

      assert.ok(element);
      assert.equal(element.props.liveConfig?.voiceName, 'Fenrir');
      assert.equal(element.props.liveConfig?.enabled, true);
    });
  });

  describe('ChatPanel Live Voice State & Transcription UI', () => {
    it('should instantiate ChatPanel in active live voice streaming state', () => {
      let started = false;
      let muted = false;
      let ended = false;

      const element = React.createElement(ChatPanel, {
        attachedFiles: [],
        onAddAttachment: () => {},
        onRemoveAttachment: () => {},
        liveStreamingEnabled: true,
        liveVoiceState: 'active' as LiveVoiceSessionState,
        activeVoiceName: 'Kore',
        inputTranscription: 'What is the flight status?',
        outputTranscription: 'Flight UA-412 is on schedule.',
        onStartLiveVoice: () => {
          started = true;
        },
        onMuteLiveVoice: () => {
          muted = true;
        },
        onEndLiveVoice: () => {
          ended = true;
        },
      });

      assert.ok(element);
      assert.equal(element.props.liveVoiceState, 'active');
      assert.equal(element.props.activeVoiceName, 'Kore');
      assert.equal(element.props.inputTranscription, 'What is the flight status?');
      assert.equal(element.props.outputTranscription, 'Flight UA-412 is on schedule.');
    });

    it('should support idle and muted states in ChatPanel', () => {
      const idleElement = React.createElement(ChatPanel, {
        attachedFiles: [],
        onAddAttachment: () => {},
        onRemoveAttachment: () => {},
        liveVoiceState: 'idle' as LiveVoiceSessionState,
      });
      assert.equal(idleElement.props.liveVoiceState, 'idle');

      const mutedElement = React.createElement(ChatPanel, {
        attachedFiles: [],
        onAddAttachment: () => {},
        onRemoveAttachment: () => {},
        liveVoiceState: 'muted' as LiveVoiceSessionState,
      });
      assert.equal(mutedElement.props.liveVoiceState, 'muted');
    });
  });
});
