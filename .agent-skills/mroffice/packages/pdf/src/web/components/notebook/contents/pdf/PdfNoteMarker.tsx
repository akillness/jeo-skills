"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * A placed sticky-note marker with drag-to-move. Sticky notes are
 * point-anchored (no box), so unlike the shape / signature / redaction frame
 * they get a plain drag: pointer-down arms a potential drag, movement past a
 * small threshold previews the marker at the pointer, and pointer-up commits
 * the new page-percent anchor via `onMove` (the viewer PATCHes it). A press
 * that never crosses the threshold stays a click and toggles the popover via
 * `onSelect`, exactly the pre-drag behavior.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from "react";

import { moveAnnotationPoint } from "../../../../lib/pdf/annotation-transform";
import { pdfOverlayCoordinatesV2Enabled } from "../../../../lib/pdf/pdf-flags";
import {
  overlayDragDelta,
  resolveOverlayCoordinateSize,
  type OverlayCoordinateSize,
} from "../../../../lib/pdf/overlay-coordinate-space";
import { PDF_NOTE_HIT_RADIUS } from "@mrnote/core/web/lib/pdf/sticky-notes.ts";

export interface PdfNoteMarkerProps {
  /** Committed anchor in page percent. */
  x: number;
  y: number;
  color: string;
  /** Tooltip / accessible name (note preview or the empty-note label). */
  label: string;
  active: boolean;
  /** Logical PDF viewport size before any notebook-canvas transform. */
  pageWidth: number;
  pageHeight: number;
  /** False disables drag (while saving / while a drawing tool owns the page). */
  draggable: boolean;
  /** Toggle the note popover (a plain click). */
  onSelect: () => void;
  /** Commit a finished drag's new anchor (page percent). */
  onMove: (
    point: { x: number; y: number },
  ) => boolean | void | Promise<boolean | void>;
  /** Optional point-object presentation used by other native annotations. */
  icon?: ReactNode;
  testId?: string;
  centered?: boolean;
  /** Delete the selected point object without weakening its save authority. */
  onDelete?: () => boolean | void | Promise<boolean | void>;
}

/** Pointer travel (px) below which a press is a click, not a drag. */
const NOTE_DRAG_THRESHOLD_PX = 4;







export function PdfNoteGlyph({ color, size = 20 }: { color: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      aria-hidden="true"
      focusable="false"
      style={{ display: "block" }}
    >
      <path
        d="M3 2.5h10.5L17 6v11.5H3z"
        fill={color}
        stroke="rgba(15, 23, 42, 0.62)"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <path d="M13.5 2.5V6H17" fill="rgba(15, 23, 42, 0.18)" stroke="rgba(15, 23, 42, 0.62)" strokeWidth="1.1" strokeLinejoin="round" />
      <path d="M6 9h8M6 12h8M6 15h5" stroke="rgba(15, 23, 42, 0.62)" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

interface ActiveNoteDrag {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  moved: boolean;
  /** Captured once so a view-scale change cannot warp an active gesture. */
  renderedPageSize: OverlayCoordinateSize | null;
}

export default function PdfNoteMarker({
  x,
  y,
  color,
  label,
  active,
  pageWidth,
  pageHeight,
  draggable,
  onSelect,
  onMove,
  icon,
  testId = "pdf-note-marker",
  centered = false,
  onDelete,
}: PdfNoteMarkerProps) {
  const [preview, setPreview] = useState<{ x: number; y: number } | null>(null);
  const [keyboardPoint, setKeyboardPoint] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  // The armed drag (pointer-down happened; may still resolve to a click).
  const dragRef = useRef<ActiveNoteDrag | null>(null);
  // Suppress the click event that fires right after a completed drag.
  const suppressClickRef = useRef(false);
  // Only the latest keyboard movement may reconcile its local preview. A slow
  // rejection from an older write must never roll back a newer accepted move.
  const keyboardMoveSequenceRef = useRef(0);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (!draggable || event.button !== 0 || event.isPrimary === false) return;
      const existing = dragRef.current;
      if (existing && existing.pointerId !== event.pointerId) return;
      // Never let the page wrapper treat this press as a draw/redact drag.
      event.stopPropagation();
      event.preventDefault();
      try {
        event.currentTarget.setPointerCapture?.(event.pointerId);
      } catch {
        /* capture is best-effort (jsdom / detached targets) */
      }
      let renderedPageSize: OverlayCoordinateSize | null = null;
      if (pdfOverlayCoordinatesV2Enabled()) {
        try {
          const page =
            event.currentTarget.closest<HTMLElement>(".pdf-viewer__page");
          const rect = page?.getBoundingClientRect();
          renderedPageSize = resolveOverlayCoordinateSize(
            rect ? { width: rect.width, height: rect.height } : null,
            { width: pageWidth, height: pageHeight },
          );
        } catch {
          renderedPageSize = resolveOverlayCoordinateSize(null, {
            width: pageWidth,
            height: pageHeight,
          });
        }
      }
      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: x,
        originY: y,
        moved: false,
        renderedPageSize,
      };
      // A completed drag may not produce a click when it ends off-marker. A
      // fresh press must never inherit that stale one-click suppression.
      suppressClickRef.current = false;
      setKeyboardPoint(null);
      setPreview(null);
      setDragging(true);
    },
    [draggable, pageHeight, pageWidth, x, y],
  );

  useEffect(() => {
    if (!dragging) return;
    const endDrag = () => {
      dragRef.current = null;
      setDragging(false);
      setPreview(null);
    };
    const pointAt = (
      event: PointerEvent,
      drag: ActiveNoteDrag,
    ): { x: number; y: number } | null => {
      if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) {
        return null;
      }
      const dxPx = event.clientX - drag.startX;
      const dyPx = event.clientY - drag.startY;
      if (!drag.moved && Math.hypot(dxPx, dyPx) < NOTE_DRAG_THRESHOLD_PX) {
        return null;
      }
      drag.moved = true;
      const size =
        drag.renderedPageSize ??
        resolveOverlayCoordinateSize(null, {
          width: pageWidth,
          height: pageHeight,
        });
      const delta = overlayDragDelta(
        { clientX: drag.startX, clientY: drag.startY },
        { clientX: event.clientX, clientY: event.clientY },
        size,
        100,
      );
      return moveAnnotationPoint(
        { x: drag.originX, y: drag.originY },
        delta.x,
        delta.y,
        PDF_NOTE_HIT_RADIUS,
      );
    };
    const onPointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      // Recover from a mouse-up that escaped both capture and window events.
      if (event.pointerType === "mouse" && (event.buttons & 1) === 0) {
        endDrag();
        return;
      }
      const point = pointAt(event, drag);
      if (point) setPreview(point);
    };
    const onPointerUp = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      const point = pointAt(event, drag);
      const moved = drag.moved;
      endDrag();
      if (moved) {
        // The click that follows this pointer-up must not toggle the popover.
        suppressClickRef.current = true;
        if (point) onMove(point);
      }
    };
    const onPointerCancel = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      endDrag();
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
    };
  }, [dragging, onMove, pageWidth, pageHeight]);

  const shown = preview ?? keyboardPoint ?? { x, y };
  return (
    <button
      type="button"
      className={`pdf-viewer__note-marker${centered ? " pdf-viewer__note-marker--centered" : ""}${active ? " is-active" : ""}`}
      data-testid={testId}
      style={{
        left: `${shown.x}%`,
        top: `${shown.y}%`,
        color,
        // A touch that starts on a draggable marker belongs to the marker,
        // not the scroll container; pointercancel still handles OS takeover.
        touchAction: draggable ? "none" : undefined,
      }}
      title={label}
      aria-label={label}
      aria-keyshortcuts={
        onDelete
          ? "ArrowLeft ArrowRight ArrowUp ArrowDown Delete Backspace"
          : "ArrowLeft ArrowRight ArrowUp ArrowDown"
      }
      onPointerDown={handlePointerDown}
      onKeyDown={(event) => {
        if (
          active &&
          onDelete &&
          (event.key === "Delete" || event.key === "Backspace")
        ) {
          event.preventDefault();
          event.stopPropagation();
          void onDelete();
          return;
        }
        if (!draggable || event.altKey) return;
        const direction =
          event.key === "ArrowLeft"
            ? { x: -1, y: 0 }
            : event.key === "ArrowRight"
              ? { x: 1, y: 0 }
              : event.key === "ArrowUp"
                ? { x: 0, y: -1 }
                : event.key === "ArrowDown"
                  ? { x: 0, y: 1 }
                  : null;
        if (!direction) return;
        event.preventDefault();
        event.stopPropagation();
        const step =
          event.metaKey || event.ctrlKey ? 0.1 : event.shiftKey ? 2 : 0.5;
        const point = moveAnnotationPoint(
          shown,
          direction.x * step,
          direction.y * step,
          PDF_NOTE_HIT_RADIUS,
        );
        setKeyboardPoint(point);
        const sequence = keyboardMoveSequenceRef.current + 1;
        keyboardMoveSequenceRef.current = sequence;
        const rejectPreview = () => {
          if (keyboardMoveSequenceRef.current === sequence) {
            setKeyboardPoint(null);
          }
        };
        try {
          const result = onMove(point);
          void Promise.resolve(result).then((accepted) => {
            if (accepted === false) rejectPreview();
          }, rejectPreview);
        } catch {
          rejectPreview();
        }
      }}
      onClick={(event) => {
        event.stopPropagation();
        if (suppressClickRef.current) {
          suppressClickRef.current = false;
          return;
        }
        onSelect();
      }}
    >
      {icon ?? <PdfNoteGlyph color={color} />}
    </button>
  );
}
