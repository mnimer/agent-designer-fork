/**
 * TriggerInspectorDrawer
 *
 * Dedicated inspector components and helper utilities for trigger nodes,
 * featuring Live Bidirectional Streaming configuration (TASK-235) over Gemini Live API,
 * WebRTC, and WebSockets.
 *
 * Job inside Application:
 * 1. Provides LiveStreamingConfigPanel for conversational chat triggers.
 * 2. Formats and validates Gemini Live API configuration (audio/text response modalities,
 *    prebuilt voice selections, audio transcription, affective dialog, and barge-in proactivity).
 * 3. Exports buildLiveRunConfigSnippet for generating Python ADK runner.run_live() calls.
 * 4. Re-exports TriggerDrawer for seamless consumer imports.
 *
 * Architectural Decisions:
 * 1. 8pt grid design consistency: padding, spacing, and font hierarchy match existing inspector drawers.
 * 2. Props down, events up: pure callback notification to trigger config updates.
 * 3. Strict alignment with LiveStreamingConfig interface from shared agent specification.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import React from 'react';
import {
  Mic,
  Volume2,
  Radio,
  Sparkles,
  Sliders,
  AudioLines,
  MessageSquare,
  Activity,
  Layers,
} from 'lucide-react';
import { LiveStreamingConfig, LiveVoiceName } from '../../../shared/agentSpec';
import { TriggerDrawer } from './TriggerDrawer';

export { TriggerDrawer };
export const TriggerInspectorDrawer = TriggerDrawer;

/**
 * Standard prebuilt voice options available on Gemini Live multimodal API.
 */
export const PREBUILT_LIVE_VOICES: LiveVoiceName[] = [
  'Puck',
  'Charon',
  'Kore',
  'Fenrir',
  'Aoede',
];

/**
 * Generates the Python ADK initialization code snippet for Live Bidirectional Streaming.
 * Configures LiveRequestQueue, RunConfig, and runner.run_live().
 *
 * @param config Live streaming configuration
 * @returns Executable Python ADK code string
 */
export function buildLiveRunConfigSnippet(config?: LiveStreamingConfig): string {
  // Section 1: Guard against missing or disabled live configuration
  if (!config || !config.enabled) {
    return '# Live bidirectional streaming is disabled';
  }

  // Section 2: Format response modalities (e.g. ["AUDIO", "TEXT"])
  const modalities =
    config.responseModalities && config.responseModalities.length > 0
      ? config.responseModalities.map((m) => `"${m}"`).join(', ')
      : '"AUDIO", "TEXT"';

  const voice = config.voiceName || 'Puck';

  // Section 3: Optional live features (transcription, emotion, proactivity)
  const inputTranscription = config.enableInputAudioTranscription
    ? '\n    input_audio_transcription=types.InputAudioTranscriptionConfig(enabled=True),'
    : '';
  const outputTranscription = config.enableOutputAudioTranscription
    ? '\n    output_audio_transcription=types.OutputAudioTranscriptionConfig(enabled=True),'
    : '';
  const affectiveDialog = config.enableAffectiveDialog
    ? '\n    affective_dialog=types.AffectiveDialogConfig(enabled=True),'
    : '';
  const proactivity = config.proactivity
    ? '\n    proactivity=types.ProactivityConfig(enabled=True),'
    : '';

  // Section 4: Assemble complete ADK live runner snippet
  return `from google.genai import types
from google.adk.runners import LiveRequestQueue

# Initialize Live Request Queue for bidirectional streaming over WebSocket / WebRTC
live_queue = LiveRequestQueue()

# Configure Live Gemini multimodal session
run_config = types.RunConfig(
    response_modalities=[${modalities}],
    speech_config=types.SpeechConfig(
        voice_config=types.VoiceConfig(
            prebuilt_voice_config=types.PrebuiltVoiceConfig(
                voice_name="${voice}"
            )
        )
    ),${inputTranscription}${outputTranscription}${affectiveDialog}${proactivity}
)

# Start live bidirectional runner session
live_session = runner.run_live(
    request_queue=live_queue,
    run_config=run_config,
)`;
}

export interface LiveStreamingConfigPanelProps {
  liveConfig?: LiveStreamingConfig;
  onChange: (config: LiveStreamingConfig) => void;
}

/**
 * LiveStreamingConfigPanel
 *
 * Inspector panel for configuring ADK Live Bidirectional Streaming options.
 */
export const LiveStreamingConfigPanel: React.FC<LiveStreamingConfigPanelProps> = ({
  liveConfig,
  onChange,
}) => {
  // Section 1: Resolve current configuration state
  const config: LiveStreamingConfig = liveConfig || {
    enabled: false,
    responseModalities: ['AUDIO', 'TEXT'],
    voiceName: 'Puck',
    enableInputAudioTranscription: true,
    enableOutputAudioTranscription: true,
    enableAffectiveDialog: false,
    proactivity: false,
  };

  // Section 2: Update helper
  const handleFieldChange = (updates: Partial<LiveStreamingConfig>) => {
    onChange({
      ...config,
      ...updates,
    });
  };

  const handleToggleModality = (modality: 'AUDIO' | 'TEXT') => {
    const current = config.responseModalities || [];
    const exists = current.includes(modality);
    let updated: ('AUDIO' | 'TEXT')[];
    if (exists) {
      // Keep at least one modality
      if (current.length === 1) return;
      updated = current.filter((m) => m !== modality);
    } else {
      updated = [...current, modality];
    }
    handleFieldChange({ responseModalities: updated });
  };

  return (
    <div
      className="space-y-3 p-3 bg-[#161b22] rounded-lg border border-amber-500/30"
      data-testid="live-streaming-config-panel"
    >
      {/* Header and Enable Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-amber-400 font-bold text-xs">
          <AudioLines className="w-3.5 h-3.5" />
          <span>Live Bidirectional Streaming (Gemini Live API)</span>
        </div>
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono border border-amber-500/30">
          run_live()
        </span>
      </div>

      <p className="text-[10px] text-gray-400 leading-relaxed">
        Enables low-latency real-time voice and audio communication over WebSockets/WebRTC using
        ADK <code className="text-amber-300">LiveRequestQueue</code>.
      </p>

      {/* Enable Live Mode Checkbox */}
      <div className="flex items-center justify-between pt-1 border-t border-[#30363d]">
        <span className="text-[11px] text-gray-200 font-medium">
          Enable Live Bidirectional Mode
        </span>
        <input
          type="checkbox"
          data-testid="live-streaming-enable-toggle"
          checked={config.enabled}
          onChange={(e) => handleFieldChange({ enabled: e.target.checked })}
          className="rounded bg-[#0d1117] border-[#30363d] text-amber-500 focus:ring-0 cursor-pointer"
        />
      </div>

      {/* Contextual Live Controls (Shown when enabled) */}
      {config.enabled && (
        <div className="space-y-3 pt-2 border-t border-[#30363d]" data-testid="live-streaming-details">
          {/* Response Modalities */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-tight text-gray-300">
              Response Modalities
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid="modality-audio-button"
                onClick={() => handleToggleModality('AUDIO')}
                className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1.5 border transition-colors cursor-pointer ${
                  config.responseModalities.includes('AUDIO')
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                    : 'bg-[#0d1117] text-gray-400 border-[#30363d]'
                }`}
              >
                <Mic className="w-3 h-3" />
                <span>AUDIO</span>
              </button>
              <button
                type="button"
                data-testid="modality-text-button"
                onClick={() => handleToggleModality('TEXT')}
                className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1.5 border transition-colors cursor-pointer ${
                  config.responseModalities.includes('TEXT')
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                    : 'bg-[#0d1117] text-gray-400 border-[#30363d]'
                }`}
              >
                <MessageSquare className="w-3 h-3" />
                <span>TEXT</span>
              </button>
            </div>
          </div>

          {/* Prebuilt Voice Selector */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-tight text-gray-300 flex items-center justify-between">
              <span>Prebuilt Voice</span>
              <span className="text-[9px] font-mono text-amber-400">
                {config.voiceName || 'Puck'}
              </span>
            </label>
            <select
              data-testid="live-voice-select"
              value={config.voiceName || 'Puck'}
              onChange={(e) => handleFieldChange({ voiceName: e.target.value as LiveVoiceName })}
              className="w-full px-2.5 py-1.5 bg-[#0d1117] border border-amber-500/40 focus:border-amber-400 rounded-lg text-xs text-amber-200 font-medium focus:outline-none cursor-pointer"
            >
              {PREBUILT_LIVE_VOICES.map((voice) => (
                <option key={voice} value={voice} className="bg-[#161b22] text-gray-200">
                  {voice}
                </option>
              ))}
            </select>
          </div>

          {/* Audio Transcription Toggles */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-gray-300">
                Input Audio Transcription (User Speech-to-Text)
              </span>
              <input
                type="checkbox"
                data-testid="input-transcription-toggle"
                checked={config.enableInputAudioTranscription ?? true}
                onChange={(e) =>
                  handleFieldChange({ enableInputAudioTranscription: e.target.checked })
                }
                className="rounded bg-[#0d1117] border-[#30363d] text-amber-500 focus:ring-0 cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[11px] text-gray-300">
                Output Audio Transcription (Model Speech-to-Text)
              </span>
              <input
                type="checkbox"
                data-testid="output-transcription-toggle"
                checked={config.enableOutputAudioTranscription ?? true}
                onChange={(e) =>
                  handleFieldChange({ enableOutputAudioTranscription: e.target.checked })
                }
                className="rounded bg-[#0d1117] border-[#30363d] text-amber-500 focus:ring-0 cursor-pointer"
              />
            </div>

            {/* Affective Dialog & Proactivity */}
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-gray-300">
                Affective Dialog (Emotion-Aware Tone)
              </span>
              <input
                type="checkbox"
                data-testid="affective-dialog-toggle"
                checked={config.enableAffectiveDialog ?? false}
                onChange={(e) =>
                  handleFieldChange({ enableAffectiveDialog: e.target.checked })
                }
                className="rounded bg-[#0d1117] border-[#30363d] text-amber-500 focus:ring-0 cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[11px] text-gray-300">
                Proactive Audio / Barge-In Handling
              </span>
              <input
                type="checkbox"
                data-testid="proactivity-toggle"
                checked={config.proactivity ?? false}
                onChange={(e) =>
                  handleFieldChange({ proactivity: e.target.checked })
                }
                className="rounded bg-[#0d1117] border-[#30363d] text-amber-500 focus:ring-0 cursor-pointer"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
