"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Shared move / 8-handle-resize pointer interaction for boxes drawn over a PDF
 * page. Generalizes the drag loop PdfImageOverlay pioneered (pointer-down on a
 * grip → window-level pointermove preview → pointer-up commit) so every
 * overlay family (inserted images, placed shapes / signatures / redaction
 * boxes) shares one implementation instead of re-deriving it.
 *
 * The hook is unit-agnostic: pointer deltas are divided by the page coordinate
 * extent and scaled by `unitsPerPage` (1 = page fractions, 100 = page percent),
 * then handed to the caller's PURE `apply` transform. Coordinate V2 captures
 * the final rendered client extent at pointer-down; the dark-launch fallback
 * keeps using the logical viewport dimensions supplied by the caller.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

import { useObjectDragGesture } from "@mrnote/core/web/lib/object-drag-gesture.ts";
import { pdfOverlayCoordinatesV2Enabled } from "../../../../lib/pdf/pdf-flags";
import {
  overlayDragDelta,
  resolveOverlayCoordinateSize,
  type OverlayCoordinateSize,
} from "../../../../lib/pdf/overlay-coordinate-space";
import type { ResizeHandle } from "@mrnote/core/web/lib/pdf/text-box-geometry.ts";

/** What a drag gesture does to the box: translate it, or drag one handle. */
export type PdfBoxDragMode = "move" | ResizeHandle;

/**
 * Pointer travel (CSS px) below which a press-and-release is a click, not a
 * gesture. A real mouse click jitters by a pixel or two; without this slop
 * that jitter became a sub-percent move that every consumer committed (and
 * the native PDF writers then had to acknowledge) on a plain selection click.
 */
export const PDF_BOX_DRAG_CLICK_SLOP_PX = 3;

interface ActiveDrag<R> {
  key: string;
  mode: PdfBoxDragMode;
  pointerId: number;
  startX: number;
  startY: number;
  startRect: R;
  /** Captured once so a layout/zoom change cannot warp an active gesture. */
  renderedPageSize: OverlayCoordinateSize | null;
}

export interface UsePdfBoxDragOptions<R> {
  /** Logical PDF viewport size in CSS px (the pre-ancestor-transform fallback). */
  pageWidth: number;
  pageHeight: number;
  /** Page units spanned by one page extent (1 = fraction, 100 = percent). */
  unitsPerPage: number;
  /**
   * Returns the page surface's live client extent. It is only read at
   * pointer-down, and only while overlay-coordinate V2 is enabled.
   */
  getRenderedPageSize?: () => OverlayCoordinateSize | null;
  /** Pure transform: start rect + gesture + delta → the previewed rect. */
  apply: (startRect: R, mode: PdfBoxDragMode, dx: number, dy: number) => R;
  /** Called once on pointer-up with the final rect. */
  onCommit: (key: string, rect: R) => void;
  /**
   * The rect in flight, from the pointer event itself: at pointer-down, on
   * every move, and null when the gesture ends (after `onCommit`) or the
   * box goes away mid-gesture. Reporting it from an effect instead made each
   * move a state update scheduled inside a passive effect; while the host's
   * render was slower than the pointer every flush scheduled another, and a
   * long drag tripped React's "Maximum update depth exceeded".
   */
  onPreview?: (rect: R | null, mode: PdfBoxDragMode | null) => void;
}

export interface PdfBoxDragBeginOptions {
  /**
   * A finger drags at once (a handle, a box that is already selected)
   * instead of holding still first (lib/object-drag-gesture.ts). Defaults to
   * true for a resize handle and false for "move". A mouse always drags at
   * once.
   */
  immediate?: boolean;
}

export interface PdfBoxDrag<R> {
  /** Key of the box being dragged, or null when idle. */
  dragKey: string | null;
  /** Move or the resize handle in flight, or null when idle. */
  dragMode: PdfBoxDragMode | null;
  /** Live rect while dragging (render this instead of the committed rect). */
  previewRect: R | null;
  /** Start a gesture from a pointer-down on the box body or a handle. */
  beginDrag: (
    key: string,
    rect: R,
    mode: PdfBoxDragMode,
    event: ReactPointerEvent,
    options?: PdfBoxDragBeginOptions,
  ) => void;
}

export function usePdfBoxDrag<R>({
  pageWidth,
  pageHeight,
  unitsPerPage,
  getRenderedPageSize,
  apply,
  onCommit,
  onPreview,
}: UsePdfBoxDragOptions<R>): PdfBoxDrag<R> {
  const [drag, setDrag] = useState<Pick<ActiveDrag<R>, "key" | "mode"> | null>(null);
  const [previewRect, setPreviewRect] = useState<R | null>(null);
  const onPreviewRef = useRef(onPreview);
  // The latest geometry and callbacks, read by a gesture already in flight.
  const liveRef = useRef({ pageWidth, pageHeight, unitsPerPage, apply, onCommit });
  useLayoutEffect(() => {
    onPreviewRef.current = onPreview;
    liveRef.current = { pageWidth, pageHeight, unitsPerPage, apply, onCommit };
  });
  const draggingRef = useRef(false);
  const gesture = useObjectDragGesture();
  useEffect(
    () => () => {
      // A box taken away mid-gesture still ends its live preview.
      if (draggingRef.current) onPreviewRef.current?.(null, null);
      draggingRef.current = false;
    },
    [],
  );

  const beginDrag = useCallback(
    (
      key: string,
      rect: R,
      mode: PdfBoxDragMode,
      event: ReactPointerEvent,
      options?: PdfBoxDragBeginOptions,
    ) => {
      event.preventDefault();
      event.stopPropagation();
      let renderedPageSize: OverlayCoordinateSize | null = null;
      if (pdfOverlayCoordinatesV2Enabled() && getRenderedPageSize) {
        try {
          renderedPageSize = resolveOverlayCoordinateSize(
            getRenderedPageSize(),
            { width: pageWidth, height: pageHeight },
          );
        } catch {
          // Detached DOM/mocks may reject layout reads. The compute path below
          // retains the exact logical-size fallback used before V2.
        }
      }
      const active: ActiveDrag<R> = {
        key,
        mode,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startRect: rect,
        renderedPageSize,
      };
      const compute = (clientX: number, clientY: number): R => {
        const live = liveRef.current;
        const size =
          active.renderedPageSize ??
          resolveOverlayCoordinateSize(null, {
            width: live.pageWidth,
            height: live.pageHeight,
          });
        const delta = overlayDragDelta(
          { clientX: active.startX, clientY: active.startY },
          { clientX, clientY },
          size,
          live.unitsPerPage,
        );
        return live.apply(active.startRect, active.mode, delta.x, delta.y);
      };
      const endDrag = () => {
        setDrag(null);
        setPreviewRect(null);
        if (draggingRef.current) onPreviewRef.current?.(null, null);
        draggingRef.current = false;
      };
      // One pointer, captured; pointercancel (touch interruption, capture
      // teardown) discards without committing — the gesture didn't finish
      // where the user intended. A finger on a box that is not selected
      // holds still first, so a swipe across the page still scrolls it.
      gesture.begin(
        event,
        {
          onLift: () => {
            setDrag({ key, mode });
            setPreviewRect(rect);
            draggingRef.current = true;
            onPreviewRef.current?.(rect, mode);
          },
          onMove: (move) => {
            const next = compute(move.clientX, move.clientY);
            setPreviewRect(next);
            onPreviewRef.current?.(next, mode);
          },
          onEnd: (up) => {
            const travelled = Math.hypot(
              up.clientX - active.startX,
              up.clientY - active.startY,
            );
            if (travelled >= PDF_BOX_DRAG_CLICK_SLOP_PX) {
              liveRef.current.onCommit(key, compute(up.clientX, up.clientY));
            }
            endDrag();
          },
          onCancel: (_reason, lifted) => {
            if (lifted) endDrag();
          },
        },
        {
          immediate: options?.immediate ?? mode !== "move",
          clickSlopPx: PDF_BOX_DRAG_CLICK_SLOP_PX,
          // Escape belongs to the overlays (deselect), as before.
          escapeCancels: false,
        },
      );
    },
    [gesture, getRenderedPageSize, pageHeight, pageWidth],
  );

  return {
    dragKey: drag?.key ?? null,
    dragMode: drag?.mode ?? null,
    previewRect,
    beginDrag,
  };
}
