/**
 * useCanvasKeyboardShortcuts.ts - Keyboard Shortcuts Hook for Visual Workflow Editor
 *
 * Purpose:
 * Centralizes global keyboard shortcuts for the canvas, including multi-level Undo/Redo
 * (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl/Cmd+Y) and selected node deletion via Delete or Backspace.
 *
 * Architectural Decisions:
 * - Author: Mike Nimer <mikenimer@google.com>
 * - Input Element Focus Isolation: Strictly guards against hijacking keys when user is typing inside
 *   an <input>, <textarea>, <select>, or contentEditable container.
 * - Multi-Selection Support: Supports deleting individually clicked active nodes or a multi-selection
 *   bounding box of nodes.
 */

import { useEffect } from 'react';
import { Node } from '@xyflow/react';

export interface UseCanvasKeyboardShortcutsOptions {
  onUndo: () => void;
  onRedo: () => void;
  selectedAgentId: string | null;
  selectedTriggerId: string | null;
  nodes: Node<any>[];
  onDeleteAgent: (id: string) => void;
  onDeleteTrigger: (id: string) => void;
}

/**
 * Custom hook to register global keyboard shortcuts on the window object.
 */
export function useCanvasKeyboardShortcuts(options: UseCanvasKeyboardShortcutsOptions): void {
  const {
    onUndo,
    onRedo,
    selectedAgentId,
    selectedTriggerId,
    nodes,
    onDeleteAgent,
    onDeleteTrigger,
  } = options;

  // Global Undo / Redo keyboard listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // NOTE: Avoid hijacking undo/redo when typing inside text inputs
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const isCmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      if (isCmdOrCtrl && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          onRedo();
        } else {
          onUndo();
        }
      } else if (isCmdOrCtrl && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        onRedo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onUndo, onRedo]);

  // Global Delete / Backspace listeners for active or selected nodes
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedAgentId) {
          e.preventDefault();
          onDeleteAgent(selectedAgentId);
        } else if (selectedTriggerId) {
          e.preventDefault();
          onDeleteTrigger(selectedTriggerId);
        } else {
          const selectedNodes = nodes.filter((n) => n.selected);
          if (selectedNodes.length > 0) {
            e.preventDefault();
            selectedNodes.forEach((node) => {
              if (node.type === 'triggerNode') {
                onDeleteTrigger(node.id);
              } else {
                onDeleteAgent(node.id);
              }
            });
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedAgentId, selectedTriggerId, nodes, onDeleteAgent, onDeleteTrigger]);
}
