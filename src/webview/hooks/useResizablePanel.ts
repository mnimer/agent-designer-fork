/**
 * useResizablePanel.ts - Split-Pane Resizing and Height Management Hook
 *
 * Purpose:
 * Encapsulates the drag-to-resize behavior, panel height boundary clamping, and expand/collapse
 * toggling between the visual workflow canvas and the bottom tabs/code generation panel.
 *
 * Architectural Decisions:
 * - Author: Mike Nimer <mikenimer@google.com>
 * - Collapsed Tab-Bar Default: Initializes `bottomPanelHeight` to null and `isPanelMaximized` to
 *   false so the bottom panel starts collapsed to just the 40px tab bar (`BOTTOM_PANEL_HEADER_HEIGHT`)
 *   to maximize canvas space on smaller screens.
 * - Tab Click & Toggle Expansion (2/3 Ratio): Clicking any tab (`handleExpandPanel`) opens the bottom
 *   panel to 2/3 (66.67%) of available space; clicking the expand/collapse icon
 *   (`handleToggleMaximizePanel`) jumps between 2/3 available space and the 40px tab header bar.
 * - Full-Range Free Dragging: Allows dragging the resize handle (`PanelDivider`) freely to any height
 *   from the 40px tab bar up to 100% of available space (`rect.height - PANEL_DIVIDER_HEIGHT`).
 * - Clean Window Listener Cleanup: Window mousemove and mouseup listeners are only attached
 *   during active drag sessions and reliably removed upon mouse release.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { useState, useRef, useEffect, useCallback } from 'react';

/** Height in pixels of the collapsed bottom tab bar header (5 * 8pt = 40px). */
export const BOTTOM_PANEL_HEADER_HEIGHT = 40;

/** Height in pixels of the draggable split-pane divider bar (1 * 8pt = 8px). */
export const PANEL_DIVIDER_HEIGHT = 8;

/** Expanded height ratio (2/3 of available space) when opening tabs or toggling expand. */
export const BOTTOM_PANEL_EXPANDED_RATIO = 2 / 3;

export interface UseResizablePanelResult {
  bottomPanelHeight: number | null;
  setBottomPanelHeight: React.Dispatch<React.SetStateAction<number | null>>;
  isPanelMaximized: boolean;
  setIsPanelMaximized: React.Dispatch<React.SetStateAction<boolean>>;
  isDraggingDivider: boolean;
  panelContainerRef: React.RefObject<HTMLDivElement | null>;
  handleExpandPanel: () => void;
  handleToggleMaximizePanel: () => void;
  handleDividerMouseDown: (e: React.MouseEvent) => void;
}

/**
 * Custom hook to control vertical split-pane resizing and expand/collapse states.
 */
export function useResizablePanel(): UseResizablePanelResult {
  const [bottomPanelHeight, setBottomPanelHeight] = useState<number | null>(null);
  const [isPanelMaximized, setIsPanelMaximized] = useState<boolean>(false);
  const [isDraggingDivider, setIsDraggingDivider] = useState<boolean>(false);
  const panelContainerRef = useRef<HTMLDivElement | null>(null);

  /**
   * Opens the bottom panel to 2/3rd of the available space when a user clicks any tab.
   */
  const handleExpandPanel = useCallback(() => {
    setBottomPanelHeight(null);
    setIsPanelMaximized(true);
  }, []);

  /**
   * Toggles the bottom panel between 2/3rd available space and just the 40px tab header bar.
   */
  const handleToggleMaximizePanel = useCallback(() => {
    const isCurrentlyExpanded =
      isPanelMaximized ||
      (bottomPanelHeight !== null && bottomPanelHeight > BOTTOM_PANEL_HEADER_HEIGHT);
    setBottomPanelHeight(null);
    setIsPanelMaximized(!isCurrentlyExpanded);
  }, [isPanelMaximized, bottomPanelHeight]);

  /**
   * Initiates free-form dragging of the split-pane divider at any height up to 100%.
   */
  const handleDividerMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      // NOTE: If height was null (preset collapsed or 2/3 ratio), capture current pixel height on drag start
      if (panelContainerRef.current && bottomPanelHeight === null) {
        const rect = panelContainerRef.current.getBoundingClientRect();
        const initialHeight = isPanelMaximized
          ? rect.height * BOTTOM_PANEL_EXPANDED_RATIO
          : BOTTOM_PANEL_HEADER_HEIGHT;
        setBottomPanelHeight(initialHeight);
      }
      setIsDraggingDivider(true);
    },
    [bottomPanelHeight, isPanelMaximized]
  );

  // Attach window event listeners when actively dragging
  useEffect(() => {
    if (!isDraggingDivider) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!panelContainerRef.current) return;
      const rect = panelContainerRef.current.getBoundingClientRect();
      const newHeight = rect.bottom - e.clientY;

      // NOTE: Clamp between 40px header bar height and 100% available space (minus 8px divider bar)
      const minHeight = BOTTOM_PANEL_HEADER_HEIGHT;
      const maxHeight = Math.max(minHeight, rect.height - PANEL_DIVIDER_HEIGHT);
      const clampedHeight = Math.max(minHeight, Math.min(maxHeight, newHeight));
      setBottomPanelHeight(clampedHeight);
      setIsPanelMaximized(clampedHeight > BOTTOM_PANEL_HEADER_HEIGHT);
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
    handleExpandPanel,
    handleToggleMaximizePanel,
    handleDividerMouseDown,
  };
}
