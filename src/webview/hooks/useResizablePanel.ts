/**
 * useResizablePanel.ts - Split-Pane Resizing and Height Management Hook
 *
 * Purpose:
 * Encapsulates the drag-to-resize behavior, panel height boundary clamping, and maximize
 * toggling between the visual workflow canvas and the bottom tabs/code generation panel.
 *
 * Architectural Decisions:
 * - Author: Mike Nimer <mikenimer@google.com>
 * - Default 2/3 vs 1/3 Ratio: Initializes `bottomPanelHeight` to null so flexbox preserves the
 *   canonical 66.66% / 33.33% view until the user performs custom drag resizing.
 * - Dynamic Boundary Clamping: Enforces minimum panel height of 100px and maximum height of
 *   container height - 130px to guarantee the canvas remains visible and interactive.
 * - Clean Window Listener Cleanup: Window mousemove and mouseup listeners are only attached
 *   during active drag sessions and reliably removed upon mouse release.
 */

import { useState, useRef, useEffect, useCallback } from 'react';

export interface UseResizablePanelResult {
  bottomPanelHeight: number | null;
  setBottomPanelHeight: React.Dispatch<React.SetStateAction<number | null>>;
  isPanelMaximized: boolean;
  setIsPanelMaximized: React.Dispatch<React.SetStateAction<boolean>>;
  isDraggingDivider: boolean;
  panelContainerRef: React.RefObject<HTMLDivElement | null>;
  handleToggleMaximizePanel: () => void;
  handleDividerMouseDown: (e: React.MouseEvent) => void;
}

/**
 * Custom hook to control vertical split-pane resizing and maximize states.
 */
export function useResizablePanel(): UseResizablePanelResult {
  const [bottomPanelHeight, setBottomPanelHeight] = useState<number | null>(null);
  const [isPanelMaximized, setIsPanelMaximized] = useState<boolean>(false);
  const [isDraggingDivider, setIsDraggingDivider] = useState<boolean>(false);
  const panelContainerRef = useRef<HTMLDivElement | null>(null);

  /**
   * Toggles the bottom panel between full height and standard split height.
   */
  const handleToggleMaximizePanel = useCallback(() => {
    setIsPanelMaximized((prev) => !prev);
  }, []);

  /**
   * Initiates dragging of the split-pane divider.
   */
  const handleDividerMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsPanelMaximized(false);
      // NOTE: If height was null (default flex ratio), capture initial pixel height on first drag
      if (panelContainerRef.current && bottomPanelHeight === null) {
        const rect = panelContainerRef.current.getBoundingClientRect();
        setBottomPanelHeight(rect.height * (1 / 3));
      }
      setIsDraggingDivider(true);
    },
    [bottomPanelHeight]
  );

  // Attach window event listeners when actively dragging
  useEffect(() => {
    if (!isDraggingDivider) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!panelContainerRef.current) return;
      const rect = panelContainerRef.current.getBoundingClientRect();
      const newHeight = rect.bottom - e.clientY;

      // NOTE: Clamp between min 100px and max (containerHeight - 130px)
      const minHeight = 100;
      const maxHeight = rect.height - 130;
      const clampedHeight = Math.max(minHeight, Math.min(maxHeight, newHeight));
      setBottomPanelHeight(clampedHeight);
    };

    const handleMouseUp = () => {
      setIsDraggingDivider(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingDivider]);

  return {
    bottomPanelHeight,
    setBottomPanelHeight,
    isPanelMaximized,
    setIsPanelMaximized,
    isDraggingDivider,
    panelContainerRef,
    handleToggleMaximizePanel,
    handleDividerMouseDown,
  };
}
