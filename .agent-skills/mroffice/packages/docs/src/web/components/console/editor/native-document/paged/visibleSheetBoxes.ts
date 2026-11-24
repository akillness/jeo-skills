/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The page boxes worth drawing: the sheets near the reader's viewport.
 *
 * The header/footer bands and their double-click strips are React overlays,
 * one box per sheet. A 296-page book drew ~540 of each on every transaction
 * of its editor (the page ledger's background passes included), seconds of
 * rendering for pages nobody could see. The overlays draw the boxes within a
 * few viewports of the reader instead and follow the scroll; a box keeps its
 * absolute position, so nothing on screen moves.
 */
import { useEffect, useRef, useState } from "react";

export interface SheetBoxRange {
  /** Index of the first box to draw. */
  first: number;
  /** Index of the last box to draw (inclusive). */
  last: number;
}

interface VerticalBox {
  top: number;
  height: number;
}

/** Viewports drawn above and below the visible one. */
const OVERSCAN_VIEWPORTS = 2;

function scrollParentOf(element: Element): HTMLElement | null {
  const win = element.ownerDocument.defaultView;
  if (!win) return null;
  for (let node = element.parentElement; node; node = node.parentElement) {
    const overflow = win.getComputedStyle(node).overflowY;
    if (overflow === "auto" || overflow === "scroll") return node;
  }
  return null;
}

/**
 * The boxes within `OVERSCAN_VIEWPORTS` of the viewport, for boxes placed in
 * `host`'s coordinates; null (draw every box) while there is no viewport to
 * measure (no layout, a hidden window). `scroller`: the host's scroll
 * container when the caller knows it already (null: the window).
 */
export function visibleSheetBoxRange(
  host: HTMLElement,
  boxes: readonly VerticalBox[],
  scroller: HTMLElement | null = scrollParentOf(host),
): SheetBoxRange | null {
  if (boxes.length === 0) return null;
  const win = host.ownerDocument.defaultView;
  const hostRect = host.getBoundingClientRect();
  const viewTop = scroller ? scroller.getBoundingClientRect().top : 0;
  const viewHeight = scroller ? scroller.clientHeight : win?.innerHeight ?? 0;
  if (!(viewHeight > 0) || !(hostRect.height > 0)) return null;
  // The boxes are in the host's own layout pixels; a zoomed page scales them.
  const scale = host.offsetHeight > 0 ? hostRect.height / host.offsetHeight : 1;
  const from = (viewTop - hostRect.top) / scale - OVERSCAN_VIEWPORTS * viewHeight / scale;
  const to = (viewTop - hostRect.top + viewHeight) / scale + OVERSCAN_VIEWPORTS * viewHeight / scale;
  let first = boxes.findIndex((box) => box.top + box.height >= from);
  if (first < 0) first = boxes.length - 1;
  let last = first;
  while (last + 1 < boxes.length && boxes[last + 1].top <= to) last += 1;
  return { first, last };
}

/**
 * `visibleSheetBoxRange` kept current: computed when the host mounts and, a
 * frame at most after, when the boxes change, the reader scrolls or the
 * window resizes. The state changes only when the range does.
 *
 * The boxes change after every measurement of the pages (each keystroke and
 * each pass of the page ledger). Measured at once in the commit that brought
 * them, the range read the host's box in the middle of that task, and found
 * the scroll container again by asking every ancestor for its computed
 * style: in WebKit, which lays a long book out whole, each such read was a
 * forced style and layout of the whole document (3-4 s on the 296-page book).
 * The scroll container is found once per host, and the range follows new
 * boxes in the next frame, where the page is laid out for painting anyway.
 */
export function useVisibleSheetBoxRange(host: HTMLElement | null, boxes: readonly VerticalBox[]): SheetBoxRange | null {
  const [range, setRange] = useState<SheetBoxRange | null>(null);
  const boxesRef = useRef(boxes);
  const scheduleRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    boxesRef.current = boxes;
    scheduleRef.current?.();
  }, [boxes]);
  useEffect(() => {
    if (!host) return;
    const win = host.ownerDocument.defaultView;
    const scroller = scrollParentOf(host);
    let frame = 0;
    const update = () => {
      frame = 0;
      const next = host.isConnected ? visibleSheetBoxRange(host, boxesRef.current, scroller) : null;
      setRange((previous) =>
        previous === next || (previous && next && previous.first === next.first && previous.last === next.last) ? previous : next);
    };
    update();
    const schedule = () => {
      if (frame || !win) return;
      frame = win.requestAnimationFrame(update);
    };
    scheduleRef.current = schedule;
    const target: EventTarget | null = scroller ?? win;
    target?.addEventListener("scroll", schedule, { passive: true });
    win?.addEventListener("resize", schedule);
    return () => {
      if (scheduleRef.current === schedule) scheduleRef.current = null;
      if (frame && win) win.cancelAnimationFrame(frame);
      target?.removeEventListener("scroll", schedule);
      win?.removeEventListener("resize", schedule);
    };
  }, [host]);
  return range;
}

/** Whether box `index` is drawn under `range` (every box without one). */
export function sheetBoxInRange(range: SheetBoxRange | null, index: number): boolean {
  return range === null || (index >= range.first && index <= range.last);
}
