/**
 * ChatPanel
 *
 * Dedicated runner UI panel providing:
 * 1. Multimodal File Attachment Picker & preview chips (TASK-224).
 * 2. Versioned Artifact Chips with namespace scoping and download actions (TASK-224).
 * 3. Live Bidirectional Voice / Audio Controls with animated waveform, prebuilt voice indicator,
 *    and real-time audio transcription banner (TASK-235).
 *
 * Architectural Decisions:
 * 1. Strict 8pt grid spacing (p-2 = 8px, p-3 = 12px, p-4 = 16px, gap-2, gap-4).
 * 2. Pure "props down, events up" unidirectional data flow.
 * 3. Visual alignment with ChatRunnerTab dark theme palette (#0d1117, #161b22, #30363d, amber, emerald, indigo, cyan).
 * 4. Resilient file reading via FileReader converting attachments into base64 inline_data.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import React, { useRef } from 'react';
import {
  Paperclip,
  X,
  FileText,
  FileImage,
  FileCode,
  Download,
  Mic,
  MicOff,
  PhoneOff,
  Radio,
  Volume2,
  Archive,
  Sparkles,
  Layers,
  User,
  Bot,
} from 'lucide-react';

export interface AttachedFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  dataUrl?: string;
  base64Data?: string;
}

export interface VersionedArtifact {
  id: string;
  filename: string;
  version: number | string;
  scope: 'session' | 'user';
  mimeType?: string;
  size?: number;
  downloadUrl?: string;
  updatedAt?: string;
}

export type LiveVoiceSessionState = 'idle' | 'connecting' | 'active' | 'muted';

export interface ChatPanelProps {
  // Multimodal file attachments (TASK-224)
  attachedFiles: AttachedFile[];
  onAddAttachment: (file: AttachedFile) => void;
  onRemoveAttachment: (fileId: string) => void;
  onClearAttachments?: () => void;
  allowedMimeTypes?: string[];

  // Versioned artifacts emitted by agent (TASK-224)
  artifacts?: VersionedArtifact[];
  onDownloadArtifact?: (artifact: VersionedArtifact) => void;

  // Live bidirectional streaming controls (TASK-235)
  liveStreamingEnabled?: boolean;
  liveVoiceState?: LiveVoiceSessionState;
  activeVoiceName?: string;
  onStartLiveVoice?: () => void;
  onMuteLiveVoice?: () => void;
  onEndLiveVoice?: () => void;
  inputTranscription?: string;
  outputTranscription?: string;
}

/**
 * Converts a standard HTML5 File object into an AttachedFile with base64 dataUrl encoding.
 *
 * @param file Browser File object
 * @returns Promise resolving to an AttachedFile
 */
export async function fileToAttachedFile(file: File): Promise<AttachedFile> {
  return new Promise((resolve, reject) => {
    // Section 1: Create FileReader instance
    const reader = new FileReader();

    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64Data = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
      resolve({
        id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        dataUrl,
        base64Data,
      });
    };

    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

/**
 * Formats byte size into human readable string.
 *
 * @param bytes Number of bytes
 * @returns Formatted size string
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Resolves file icon based on MIME type.
 *
 * @param mimeType MIME type string
 * @returns React icon element
 */
export function getFileIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) {
    return <FileImage className="w-3.5 h-3.5 text-cyan-400" />;
  }
  if (mimeType.includes('csv') || mimeType.includes('json') || mimeType.includes('code')) {
    return <FileCode className="w-3.5 h-3.5 text-amber-400" />;
  }
  return <FileText className="w-3.5 h-3.5 text-teal-400" />;
}

/**
 * ChatPanel Component
 */
export const ChatPanel: React.FC<ChatPanelProps> = ({
  attachedFiles,
  onAddAttachment,
  onRemoveAttachment,
  allowedMimeTypes,
  artifacts = [],
  onDownloadArtifact,
  liveStreamingEnabled = true,
  liveVoiceState = 'idle',
  activeVoiceName = 'Puck',
  onStartLiveVoice,
  onMuteLiveVoice,
  onEndLiveVoice,
  inputTranscription,
  outputTranscription,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Section 1: Handle native file input selection
  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const attached = await fileToAttachedFile(file);
        onAddAttachment(attached);
      } catch (err) {
        console.error('Failed to read file attachment:', err);
      }
    }

    // Reset input so re-selecting same file triggers change
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const isLiveActive = liveVoiceState === 'active' || liveVoiceState === 'muted';

  return (
    <div className="space-y-2" data-testid="chat-panel">
      {/* Hidden file input for attachment picker */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileInputChange}
        multiple
        accept={allowedMimeTypes ? allowedMimeTypes.join(',') : undefined}
        className="hidden"
        data-testid="multimodal-file-input"
      />

      {/* ==================================================================== */}
      {/* 1. LIVE BIDIRECTIONAL VOICE CONTROLS (TASK-235)                     */}
      {/* ==================================================================== */}
      {liveStreamingEnabled && (
        <div
          className={`p-2.5 rounded-lg border transition-all ${
            isLiveActive
              ? 'bg-[#161b22] border-amber-500/50 shadow-md'
              : 'bg-[#0d1117] border-[#30363d]'
          }`}
          data-testid="live-voice-bar"
        >
          <div className="flex items-center justify-between">
            {/* Left: Status and Voice Badge */}
            <div className="flex items-center gap-2">
              <span
                className={`flex h-2 w-2 rounded-full ${
                  liveVoiceState === 'active'
                    ? 'bg-emerald-400 animate-pulse'
                    : liveVoiceState === 'muted'
                    ? 'bg-amber-400'
                    : liveVoiceState === 'connecting'
                    ? 'bg-indigo-400 animate-ping'
                    : 'bg-gray-500'
                }`}
              />
              <span className="text-xs font-semibold text-gray-200">
                {liveVoiceState === 'active' && 'Live Audio Streaming'}
                {liveVoiceState === 'muted' && 'Live Audio Muted'}
                {liveVoiceState === 'connecting' && 'Connecting Live Audio...'}
                {liveVoiceState === 'idle' && 'Live Voice Session (WebRTC/WS)'}
              </span>

              {isLiveActive && (
                <span
                  className="text-xs font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40"
                  data-testid="active-voice-badge"
                >
                  Voice: {activeVoiceName}
                </span>
              )}
            </div>

            {/* Middle: Animated Audio Waveform when active */}
            {liveVoiceState === 'active' && (
              <div
                className="flex items-center gap-1 h-4 px-2"
                data-testid="audio-waveform-indicator"
              >
                <div className="w-1 bg-amber-400 rounded-full animate-bounce h-2" />
                <div
                  className="w-1 bg-amber-400 rounded-full animate-bounce h-4"
                  style={{ animationDelay: '150ms' }}
                />
                <div
                  className="w-1 bg-amber-400 rounded-full animate-bounce h-3"
                  style={{ animationDelay: '300ms' }}
                />
                <div
                  className="w-1 bg-amber-400 rounded-full animate-bounce h-5"
                  style={{ animationDelay: '200ms' }}
                />
                <div
                  className="w-1 bg-amber-400 rounded-full animate-bounce h-2.5"
                  style={{ animationDelay: '350ms' }}
                />
              </div>
            )}

            {/* Right: Actions */}
            <div className="flex items-center gap-2">
              {liveVoiceState === 'idle' && onStartLiveVoice && (
                <button
                  type="button"
                  onClick={onStartLiveVoice}
                  data-testid="start-live-voice-button"
                  className="px-3 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Mic className="w-3.5 h-3.5" />
                  <span>Start Live Voice</span>
                </button>
              )}

              {isLiveActive && onMuteLiveVoice && (
                <button
                  type="button"
                  onClick={onMuteLiveVoice}
                  data-testid="mute-live-voice-button"
                  className={`p-1.5 rounded transition-colors cursor-pointer ${
                    liveVoiceState === 'muted'
                      ? 'bg-amber-500 text-black hover:bg-amber-400'
                      : 'bg-[#21262d] text-gray-200 hover:bg-[#30363d]'
                  }`}
                  title={liveVoiceState === 'muted' ? 'Unmute microphone' : 'Mute microphone'}
                >
                  {liveVoiceState === 'muted' ? (
                    <MicOff className="w-3.5 h-3.5" />
                  ) : (
                    <Mic className="w-3.5 h-3.5" />
                  )}
                </button>
              )}

              {isLiveActive && onEndLiveVoice && (
                <button
                  type="button"
                  onClick={onEndLiveVoice}
                  data-testid="end-live-voice-button"
                  className="p-1.5 rounded bg-rose-600 hover:bg-rose-500 text-white transition-colors cursor-pointer"
                  title="End live voice session"
                >
                  <PhoneOff className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Real-time Transcription Banner */}
          {isLiveActive && (inputTranscription || outputTranscription) && (
            <div
              className="mt-2 pt-2 border-t border-[#30363d] space-y-2 text-xs"
              data-testid="live-transcription-banner"
            >
              {inputTranscription && (
                <div className="flex items-start gap-2 text-gray-300">
                  <User className="w-3.5 h-3.5 text-cyan-400 mt-0.5 shrink-0" />
                  <span className="text-gray-400 shrink-0 font-medium">You (live):</span>
                  <span className="italic text-gray-200 font-sans">{inputTranscription}</span>
                </div>
              )}
              {outputTranscription && (
                <div className="flex items-start gap-2 text-amber-300">
                  <Bot className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
                  <span className="text-amber-400 shrink-0 font-medium">Agent (live):</span>
                  <span className="text-gray-200 font-sans">{outputTranscription}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* 2. MULTIMODAL ATTACHMENTS TRAY (TASK-224)                           */}
      {/* ==================================================================== */}
      <div className="flex items-center gap-2 flex-wrap" data-testid="attachment-tray">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          data-testid="attach-file-button"
          title="Attach multimodal document or binary (PDF, images, CSV, etc.)"
          className="px-2 py-1 rounded-lg bg-[#161b22] hover:bg-[#21262d] text-gray-300 hover:text-white border border-[#30363d] transition-colors cursor-pointer flex items-center gap-2 text-xs"
        >
          <Paperclip className="w-3.5 h-3.5 text-teal-400" />
          <span>Attach</span>
        </button>

        {attachedFiles.map((file) => (
          <div
            key={file.id}
            data-testid={`attachment-chip-${file.id}`}
            className="flex items-center gap-2 px-2 py-1 rounded bg-[#161b22] border border-teal-500/40 text-xs text-gray-200 group"
          >
            {getFileIcon(file.mimeType)}
            <span className="font-mono text-xs truncate max-w-[140px]">{file.name}</span>
            <span className="text-xs text-gray-400">({formatFileSize(file.size)})</span>
            <button
              type="button"
              onClick={() => onRemoveAttachment(file.id)}
              data-testid={`remove-attachment-${file.id}`}
              className="text-gray-400 hover:text-rose-400 ml-1 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      {/* ==================================================================== */}
      {/* 3. VERSIONED ARTIFACT CHIPS (TASK-224)                              */}
      {/* ==================================================================== */}
      {artifacts.length > 0 && (
        <div
          className="p-2 bg-[#0d1117] rounded-lg border border-[#30363d] space-y-2"
          data-testid="artifact-chips-tray"
        >
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span className="flex items-center gap-1 text-teal-300 font-semibold uppercase tracking-wider">
              <Archive className="w-3.5 h-3.5" />
              <span>Artifacts Emitted by Agent</span>
            </span>
            <span className="text-xs font-mono text-gray-500">
              {artifacts.length} {artifacts.length === 1 ? 'artifact' : 'artifacts'}
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            {artifacts.map((art) => {
              const versionLabel =
                typeof art.version === 'number' ? `v${art.version}` : art.version;
              const isUserScoped = art.scope === 'user';
              const namespacedKey = isUserScoped ? `user:${art.filename}` : art.filename;

              return (
                <div
                  key={art.id}
                  data-testid={`artifact-chip-${art.id}`}
                  className="flex items-center gap-2 px-2 py-1 rounded bg-[#161b22] border border-[#30363d] hover:border-teal-500/40 text-xs text-gray-200 transition-colors"
                >
                  {/* Version Badge */}
                  <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-teal-500/20 text-teal-300 font-bold border border-teal-500/40">
                    {versionLabel}
                  </span>

                  {/* Scope Badge */}
                  <span
                    className={`font-mono text-xs px-1.5 py-0.5 rounded border ${
                      isUserScoped
                        ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                        : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                    }`}
                  >
                    {isUserScoped ? 'user' : 'session'}
                  </span>

                  {/* Filename */}
                  <span className="font-mono text-xs text-gray-200 truncate max-w-[140px]" title={namespacedKey}>
                    {art.filename}
                  </span>

                  {/* Download Action */}
                  {onDownloadArtifact && (
                    <button
                      type="button"
                      onClick={() => onDownloadArtifact(art)}
                      data-testid={`download-artifact-${art.id}`}
                      title={`Download ${namespacedKey}`}
                      className="text-gray-400 hover:text-teal-300 cursor-pointer ml-1"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
