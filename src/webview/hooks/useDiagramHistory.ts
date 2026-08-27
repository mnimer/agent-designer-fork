/**
 * useDiagramHistory Hook
 *
 * Manages undo/redo snapshot history stacks for workflow canvas state,
 * supporting standard keyboard shortcuts (Cmd+Z, Cmd+Shift+Z, Ctrl+Z, Ctrl+Y).
 *
 * Job in Application:
 * Enables non-destructive workflow editing on the canvas with rapid reversal
 * of node creations, deletions, movements, tool attachments, and edge links.
 *
 * Architectural Decisions:
 * 1. Bounded snapshot history depth (max 50 states) preventing memory ballooning.
 * 2. Deep equality check on snapshot pushing to ignore duplicate successive states.
 * 3. Cross-platform keyboard event listener for macOS (MetaKey) and Windows/Linux (CtrlKey).
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { AgentWorkflowDocument } from '../../shared/types';

export interface UseDiagramHistoryOptions {
  maxHistory?: number;
  onRestore?: (document: AgentWorkflowDocument) => void;
}

export interface UseDiagramHistoryReturn {
  canUndo: boolean;
  canRedo: boolean;
  undo: () => AgentWorkflowDocument | null;
  redo: () => AgentWorkflowDocument | null;
  pushSnapshot: (document: AgentWorkflowDocument) => void;
  clearHistory: () => void;
}

export function useDiagramHistory(
  initialDocument: AgentWorkflowDocument,
  options: UseDiagramHistoryOptions = {}
): UseDiagramHistoryReturn {
  const { maxHistory = 50, onRestore } = options;

  const [past, setPast] = useState<AgentWorkflowDocument[]>([]);
  const [future, setFuture] = useState<AgentWorkflowDocument[]>([]);
  const currentDocRef = useRef<AgentWorkflowDocument>(initialDocument);

  // Update current document reference
  currentDocRef.current = initialDocument;

  /**
   * Pushes a new document snapshot onto the undo history stack.
   *
   * @param document Updated AgentWorkflowDocument
   */
  const pushSnapshot = useCallback(
    (document: AgentWorkflowDocument) => {
      // Avoid pushing duplicate identical states
      const currentJson = JSON.stringify(currentDocRef.current);
      const newJson = JSON.stringify(document);
      if (currentJson === newJson) return;

      setPast((prevPast) => {
        const nextPast = [...prevPast, currentDocRef.current];
        if (nextPast.length > maxHistory) {
          return nextPast.slice(nextPast.length - maxHistory);
        }
        return nextPast;
      });

      // Clear redo stack on new user actions
      setFuture([]);
    },
    [maxHistory]
  );

  /**
   * Undoes the last action, restoring previous snapshot.
   *
   * @returns Previous AgentWorkflowDocument or null
   */
  const undo = useCallback((): AgentWorkflowDocument | null => {
    if (past.length === 0) return null;

    const previous = past[past.length - 1];
    const newPast = past.slice(0, past.length - 1);

    setPast(newPast);
    setFuture((prevFuture) => [currentDocRef.current, ...prevFuture]);

    if (onRestore) {
      onRestore(previous);
    }
    return previous;
  }, [past, onRestore]);

  /**
   * Redoes the previously undone action.
   *
   * @returns Next AgentWorkflowDocument or null
   */
  const redo = useCallback((): AgentWorkflowDocument | null => {
    if (future.length === 0) return null;

    const next = future[0];
    const newFuture = future.slice(1);

    setFuture(newFuture);
    setPast((prevPast) => [...prevPast, currentDocRef.current]);

    if (onRestore) {
      onRestore(next);
    }
    return next;
  }, [future, onRestore]);

  /**
   * Resets both history stacks.
   */
  const clearHistory = useCallback(() => {
    setPast([]);
    setFuture([]);
  }, []);

  // Global keyboard shortcut listener for Cmd+Z / Ctrl+Z and Redo
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore key events when typing inside inputs or textareas
      const target = event.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const isModifier = isMac ? event.metaKey : event.ctrlKey;

      if (isModifier && event.key.toLowerCase() === 'z') {
        if (event.shiftKey) {
          // Redo: Cmd+Shift+Z or Ctrl+Shift+Z
          event.preventDefault();
          redo();
        } else {
          // Undo: Cmd+Z or Ctrl+Z
          event.preventDefault();
          undo();
        }
      } else if (isModifier && event.key.toLowerCase() === 'y' && !isMac) {
        // Redo: Ctrl+Y (Windows/Linux)
        event.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  return {
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    undo,
    redo,
    pushSnapshot,
    clearHistory,
  };
}
