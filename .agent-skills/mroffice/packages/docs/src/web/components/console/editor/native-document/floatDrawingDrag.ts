/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Dragging a floating drawing (a chart, a picture) on its page, as Word drags
 * one: the drawing follows the pointer once it has moved more than 4px, Shift
 * keeps it on one axis, and on release the move is committed in page px (the
 * caller restates the anchor, `office-float-anchor-edit.floatAnchorMovedBy`).
 * The press starts no native drag and no editor mousedown, and the click a
 * drag ends with selects nothing. `live` shows the move to the other members
 * of the page as it goes (documentLiveTransform).
 */

import { constrainedMoveAxis } from "@mrnote/core/web/lib/presentation-drag.ts";

import { beginDocumentObjectSnap } from "@mrnote/core/web/components/console/editor/native-document/documentObjectSnap.ts";
import { liftSheetsDuringDrag, type SheetLift } from "@mrnote/core/web/components/console/editor/native-document/dragSheetLift.ts";
import { floatPaintOf } from "@mrnote/core/web/components/console/editor/native-document/floatingTextBoxLayout.ts";
import type { DocumentLiveGesture } from "@mrnote/core/web/components/console/editor/native-document/documentLiveTransform.ts";

const DRAG_THRESHOLD_PX = 4;

/**
 * Start a move of `wrapper` (the element the float pass places) from `event`.
 * False when the drawing has not been placed by the float pass (in line, off
 * the paged surface): the press is then left to its other handlers.
 */
export function startFloatingDrawingDrag(
  event: PointerEvent,
  wrapper: HTMLElement,
  commit: (dxPx: number, dyPx: number) => void,
  live?: Pick<DocumentLiveGesture, "offset" | "end"> | null,
): boolean {
  if (event.button !== 0) return false;
  const paint = floatPaintOf(wrapper);
  if (!paint) return false;
  event.preventDefault();
  const pointerId = event.pointerId;
  const startX = event.clientX;
  const startY = event.clientY;
  let moved = false;
  // Over the next page while it is carried across a seam.
  let lift: SheetLift | null = null;
  // Word's alignment guides: the drawing lines up with the page's other
  // floating objects, its edges, centre and margins (documentObjectSnap).
  const snap = beginDocumentObjectSnap([wrapper]);
  const shift = (next: PointerEvent) => {
    const along = constrainedMoveAxis(next.clientX - startX, next.clientY - startY, next.shiftKey);
    const dx = along === "vertical" ? 0 : (next.clientX - startX) / (paint.scaleX || 1);
    const dy = along === "horizontal" ? 0 : (next.clientY - startY) / (paint.scaleY || 1);
    return snap ? snap.move(dx, dy, next, along) : { dx, dy };
  };
  const move = (next: PointerEvent) => {
    if (next.pointerId !== pointerId) return;
    if (!moved && Math.hypot(next.clientX - startX, next.clientY - startY) <= DRAG_THRESHOLD_PX) return;
    if (!moved) lift = liftSheetsDuringDrag([wrapper]);
    moved = true;
    const { dx, dy } = shift(next);
    lift?.follow(dy);
    wrapper.style.translate = `${dx}px ${dy}px`;
    live?.offset(dx, dy);
  };
  const end = (next: PointerEvent) => {
    if (next.pointerId !== pointerId) return;
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
    wrapper.style.translate = "";
    lift?.lower();
    const { dx, dy } = moved && next.type !== "pointercancel" ? shift(next) : { dx: 0, dy: 0 };
    snap?.end();
    if (!moved || next.type === "pointercancel") {
      live?.end();
      return;
    }
    // The click this drag ends with selects nothing (no element, no title).
    const swallow = (click: MouseEvent) => {
      click.stopPropagation();
      click.preventDefault();
    };
    wrapper.addEventListener("click", swallow, { capture: true, once: true });
    window.setTimeout(() => wrapper.removeEventListener("click", swallow, { capture: true }), 400);
    if (Math.abs(dx) >= 0.5 || Math.abs(dy) >= 0.5) commit(dx, dy);
    live?.end();
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);
  return true;
}
