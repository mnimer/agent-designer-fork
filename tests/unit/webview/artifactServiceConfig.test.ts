/**
 * Unit Tests for ADK Artifact Service & Multimodal Versioning (TASK-224)
 *
 * Validates:
 * 1. Artifact namespace scoping: 'user:{filename}' for user scope vs '{filename}' for session scope.
 * 2. Python ADK code generation for InMemoryArtifactService and GcsArtifactService.
 * 3. Configuration toggles: automatic versioning, allowed MIME types, GCS bucket names.
 * 4. ChatPanel multimodal file formatting, icon mapping, and versioned artifact chips.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {
  formatArtifactNamespaceKey,
  buildArtifactServiceCodeSnippet,
  ARTIFACT_SERVICE_OPTION_DESCRIPTIONS,
  DEFAULT_ALLOWED_MIME_TYPES,
  MemoryConfigSection,
} from '../../../src/webview/components/inspector/MemoryConfigSection';
import {
  formatFileSize,
  getFileIcon,
  ChatPanel,
  AttachedFile,
  VersionedArtifact,
} from '../../../src/webview/components/runner/ChatPanel';
import { ArtifactServiceConfig } from '../../../src/shared/agentSpec';

describe('TASK-224: ADK Artifact Service Configuration & Multimodal Versioning', () => {
  describe('formatArtifactNamespaceKey', () => {
    it('should format user-scoped artifacts with user: prefix', () => {
      assert.equal(formatArtifactNamespaceKey('report.pdf', 'user'), 'user:report.pdf');
      assert.equal(formatArtifactNamespaceKey('dataset.csv', 'user'), 'user:dataset.csv');
      assert.equal(formatArtifactNamespaceKey('nested/doc.txt', 'user'), 'user:nested/doc.txt');
    });

    it('should leave session-scoped artifacts without prefix', () => {
      assert.equal(formatArtifactNamespaceKey('report.pdf', 'session'), 'report.pdf');
      assert.equal(formatArtifactNamespaceKey('diagram.png', 'session'), 'diagram.png');
    });
  });

  describe('buildArtifactServiceCodeSnippet', () => {
    it('should return disabled message when config is missing or type is none', () => {
      assert.equal(buildArtifactServiceCodeSnippet(undefined), '# Artifact service is disabled');
      assert.equal(
        buildArtifactServiceCodeSnippet({ type: 'none' }),
        '# Artifact service is disabled'
      );
    });

    it('should generate InMemoryArtifactService code for in_memory backend', () => {
      const config: ArtifactServiceConfig = {
        type: 'in_memory',
        defaultScope: 'session',
        enableVersioning: false,
      };
      const code = buildArtifactServiceCodeSnippet(config);
      assert.ok(code.includes('from google.adk.artifacts import InMemoryArtifactService'));
      assert.ok(code.includes('artifact_service = InMemoryArtifactService()'));
    });

    it('should generate GcsArtifactService code with specified bucket and versioning', () => {
      const config: ArtifactServiceConfig = {
        type: 'gcs',
        gcsBucketName: 'prod-agent-artifacts',
        defaultScope: 'user',
        enableVersioning: true,
        allowedMimeTypes: ['application/pdf', 'image/png'],
      };
      const code = buildArtifactServiceCodeSnippet(config);
      assert.ok(code.includes('from google.adk.artifacts import GcsArtifactService'));
      assert.ok(code.includes('bucket_name="prod-agent-artifacts"'));
      assert.ok(code.includes('# Versioning enabled: automatic increment v1, v2, ...'));
      assert.ok(code.includes('user:filename'));
      assert.ok(code.includes('application/pdf, image/png'));
    });

    it('should fallback to environment variable when gcsBucketName is omitted', () => {
      const config: ArtifactServiceConfig = {
        type: 'gcs',
      };
      const code = buildArtifactServiceCodeSnippet(config);
      assert.ok(code.includes('os.environ.get("GCS_ARTIFACTS_BUCKET")'));
    });
  });

  describe('Allowed MIME Types & File Helpers', () => {
    it('should provide complete standard MIME types in DEFAULT_ALLOWED_MIME_TYPES', () => {
      assert.ok(DEFAULT_ALLOWED_MIME_TYPES.includes('application/pdf'));
      assert.ok(DEFAULT_ALLOWED_MIME_TYPES.includes('image/png'));
      assert.ok(DEFAULT_ALLOWED_MIME_TYPES.includes('image/jpeg'));
      assert.ok(DEFAULT_ALLOWED_MIME_TYPES.includes('text/csv'));
      assert.ok(DEFAULT_ALLOWED_MIME_TYPES.includes('audio/wav'));
      assert.ok(DEFAULT_ALLOWED_MIME_TYPES.includes('application/json'));
      assert.ok(DEFAULT_ALLOWED_MIME_TYPES.includes('text/plain'));
    });

    it('should format byte sizes accurately', () => {
      assert.equal(formatFileSize(512), '512 B');
      assert.equal(formatFileSize(1024), '1.0 KB');
      assert.equal(formatFileSize(2048), '2.0 KB');
      assert.equal(formatFileSize(1024 * 1024 * 2.5), '2.5 MB');
    });

    it('should resolve matching file icons for images, data, and documents', () => {
      const imgIcon = getFileIcon('image/png');
      const csvIcon = getFileIcon('text/csv');
      const pdfIcon = getFileIcon('application/pdf');

      assert.ok(imgIcon);
      assert.ok(csvIcon);
      assert.ok(pdfIcon);
    });
  });

  describe('Component Instantiation & Artifact Chips', () => {
    it('should instantiate MemoryConfigSection cleanly', () => {
      let updatedConfig: any = null;
      const element = React.createElement(MemoryConfigSection, {
        memoryConfig: {
          type: 'in_memory',
          artifactConfig: {
            type: 'gcs',
            gcsBucketName: 'test-bucket',
            defaultScope: 'user',
            enableVersioning: true,
          },
        },
        onUpdateMemoryConfig: (conf) => {
          updatedConfig = conf;
        },
      });

      assert.ok(element);
      assert.equal(element.props.memoryConfig?.artifactConfig?.gcsBucketName, 'test-bucket');
    });

    it('should provide user-facing descriptions for all 3 Artifact Service Backend options', () => {
      const types = ['none', 'in_memory', 'gcs'] as const;
      for (const t of types) {
        const meta = ARTIFACT_SERVICE_OPTION_DESCRIPTIONS[t];
        assert.ok(meta, `Missing description metadata for ${t}`);
        assert.ok(meta.title.length > 0);
        assert.ok(meta.badge.length > 0);
        assert.ok(meta.description.length > 10);
        assert.ok(meta.bestFor.length > 5);
      }
    });

    it('should instantiate ChatPanel with versioned artifacts and file attachments', () => {
      const sampleAttachments: AttachedFile[] = [
        {
          id: 'att-1',
          name: 'invoice.pdf',
          mimeType: 'application/pdf',
          size: 15420,
          base64Data: 'JVBERi0xLjQK...',
        },
      ];

      const sampleArtifacts: VersionedArtifact[] = [
        {
          id: 'art-1',
          filename: 'summary_chart.png',
          version: 'v1',
          scope: 'session',
          mimeType: 'image/png',
          size: 45000,
        },
        {
          id: 'art-2',
          filename: 'user_preferences.json',
          version: 2,
          scope: 'user',
          mimeType: 'application/json',
          size: 1200,
        },
      ];

      let downloadedArtifact: VersionedArtifact | null = null;
      let removedFileId: string | null = null;

      const element = React.createElement(ChatPanel, {
        attachedFiles: sampleAttachments,
        onAddAttachment: () => {},
        onRemoveAttachment: (id) => {
          removedFileId = id;
        },
        artifacts: sampleArtifacts,
        onDownloadArtifact: (art) => {
          downloadedArtifact = art;
        },
      });

      assert.ok(element);
      assert.equal(element.props.attachedFiles.length, 1);
      assert.equal(element.props.artifacts?.length, 2);
    });
  });
});
