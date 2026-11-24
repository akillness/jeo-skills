"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { OfficeTouchGrip } from "./OfficeTouchGrip";
import { holdTouchGesture, swallowNextClick, useTouchInputMode } from "../../lib/touch-gestures";
import { isTouchLikePointer } from "../../lib/pointer-capability";

/**
 * Selection handles on a table's cell range for a finger (PowerPoint / Word
 * for iPad: tap a cell, then drag a selection handle to take more cells; a
 * finger dragged across the cells themselves scrolls). The same two round
 * grips Excel's grid shows (`OfficeTouchGrip`), on the range's top-start and
 * bottom-end corners.
 *
 * The component knows tables only as DOM: the editor's adapter says which
 * cell elements form the range (`selectedCells`) and turns "from this cell to
 * that cell" back into its own selection (`onRange`). Dragging a grip keeps
 * the cell at the opposite corner fixed and makes the cell under the finger
 * the moving end, cell by cell — what a Shift+click on that cell selects.
 *
 * The layer is an absolutely positioned child of any positioned ancestor of
 * the table that scrolls with it or not (it measures on every scroll); the
 * grips keep their screen size when that ancestor is scaled (a zoomed slide)
 * and are dropped when their corner is scrolled out of an ancestor that
 * clips the table.
 *
 * Touch only: nothing renders until a finger (or a non-hovering pen) has
 * pressed, or on a coarse-pointer device; the mouse never sees a grip.
 */

export type OfficeTableTouchGripCorner = "start" | "end";

export interface OfficeTableTouchPoint {
  readonly x: number;
  readonly y: number;
}

export interface OfficeTableTouchGripGeometry {
  readonly start: OfficeTableTouchPoint | null;
  readonly end: OfficeTableTouchPoint | null;
  /** Layer px per screen px (the inverse of the ancestor's scale). */
  readonly unscale: number;
  readonly rtl: boolean;
}

interface RectLike {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

const EMPTY: OfficeTableTouchGripGeometry = { start: null, end: null, unscale: 1, rtl: false };
/** How far each grip's target leans out of the range, so a tap just inside
 * the corner cell still lands in the cell (screen px). */
const GRIP_LEAN_PX = 11;

/** The union of the range's cell boxes (screen px), or null. */
export function tableRangeBounds(rects: readonly RectLike[]): RectLike | null {
  let bounds: { left: number; top: number; right: number; bottom: number } | null = null;
  for (const rect of rects) {
    if (!(rect.right > rect.left && rect.bottom > rect.top)) continue;
    if (!bounds) {
      bounds = { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
      continue;
    }
    bounds.left = Math.min(bounds.left, rect.left);
    bounds.top = Math.min(bounds.top, rect.top);
    bounds.right = Math.max(bounds.right, rect.right);
    bounds.bottom = Math.max(bounds.bottom, rect.bottom);
  }
  return bounds;
}

/** The screen point of a corner of the range; the start is top-left (top-right
 * in a right-to-left table), the end bottom-right (bottom-left). */
export function tableRangeCorner(
  bounds: RectLike,
  corner: OfficeTableTouchGripCorner,
  rtl: boolean,
): OfficeTableTouchPoint {
  const startX = rtl ? bounds.right : bounds.left;
  const endX = rtl ? bounds.left : bounds.right;
  return corner === "start" ? { x: startX, y: bounds.top } : { x: endX, y: bounds.bottom };
}

/**
 * The cell of the range that holds a corner: the one whose box contains a
 * point just inside it. Merged cells are found by their own (larger) box.
 */
export function tableCellAtCorner<T>(
  cells: readonly { readonly cell: T; readonly rect: RectLike }[],
  bounds: RectLike,
  corner: OfficeTableTouchGripCorner,
  rtl: boolean,
): T | null {
  const point = tableRangeCorner(bounds, corner, rtl);
  const inwardX = (corner === "start" ? 1 : -1) * (rtl ? -1 : 1);
  const inwardY = corner === "start" ? 1 : -1;
  const x = point.x + inwardX * 2;
  const y = point.y + inwardY * 2;
  for (const { cell, rect } of cells) {
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return cell;
  }
  return null;
}

/** The visible part of the screen for `element`: every clipping ancestor up to
 * (not including) `stop`, intersected. */
function visibleArea(element: Element, stop: Element | null): RectLike | null {
  let area: { left: number; top: number; right: number; bottom: number } | null = null;
  for (let node = element.parentElement; node && node !== stop; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (style.overflowX === "visible" && style.overflowY === "visible") continue;
    const rect = node.getBoundingClientRect();
    if (!area) {
      area = { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
      continue;
    }
    area.left = Math.max(area.left, rect.left);
    area.top = Math.max(area.top, rect.top);
    area.right = Math.min(area.right, rect.right);
    area.bottom = Math.min(area.bottom, rect.bottom);
  }
  return area;
}

function contains(area: RectLike | null, point: OfficeTableTouchPoint): boolean {
  if (!area) return true;
  return (
    point.x >= area.left - 1 &&
    point.x <= area.right + 1 &&
    point.y >= area.top - 1 &&
    point.y <= area.bottom + 1
  );
}

function tableIsRtl(cell: Element): boolean {
  const table = cell.closest("table") ?? cell;
  return getComputedStyle(table).direction === "rtl";
}

/** Where the grips go, in the layer's own (unscaled) pixels. DOM reads only. */
export function measureTableTouchGrips(
  layer: HTMLElement,
  cells: readonly Element[],
): OfficeTableTouchGripGeometry {
  if (cells.length === 0) return EMPTY;
  const bounds = tableRangeBounds(cells.map((cell) => cell.getBoundingClientRect()));
  if (!bounds) return EMPTY;
  const origin = layer.getBoundingClientRect();
  const unscale = origin.width > 0 && layer.offsetWidth > 0 ? layer.offsetWidth / origin.width : 1;
  const rtl = tableIsRtl(cells[0]!);
  const area = visibleArea(cells[0]!, layer.offsetParent ?? layer.parentElement);
  const local = (point: OfficeTableTouchPoint) =>
    contains(area, point)
      ? { x: (point.x - origin.left) * unscale, y: (point.y - origin.top) * unscale }
      : null;
  return {
    start: local(tableRangeCorner(bounds, "start", rtl)),
    end: local(tableRangeCorner(bounds, "end", rtl)),
    unscale,
    rtl,
  };
}

function samePoint(a: OfficeTableTouchPoint | null, b: OfficeTableTouchPoint | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return Math.round(a.x) === Math.round(b.x) && Math.round(a.y) === Math.round(b.y);
}

/** The cell of `table` under a screen point, through the grips over it. */
function tableCellAtPoint(x: number, y: number, table: Element, cellSelector: string): Element | null {
  const stack =
    typeof document.elementsFromPoint === "function"
      ? document.elementsFromPoint(x, y)
      : typeof document.elementFromPoint === "function"
        ? [document.elementFromPoint(x, y)].filter((element): element is Element => element !== null)
        : [];
  for (const element of stack) {
    if (element.closest("[data-office-touch-grip]")) continue;
    const cell = element.closest(cellSelector);
    // the innermost cell of THIS table (a nested table's cells belong to it)
    if (cell && cell.closest("table") === table) return cell;
  }
  return null;
}

export interface OfficeTableTouchGripsProps {
  /** The adapter's own conditions (an editable table with a cell range or a
   * caret in a cell). Touch input mode is added here. */
  readonly enabled: boolean;
  /** The cells forming the range now; one cell when only a caret is there.
   * `layer` is the grips' own layer, a child of the adapter's host. */
  readonly selectedCells: (layer: HTMLElement) => readonly Element[];
  /** Matches the table's cell elements (`td`, `th`, …). */
  readonly cellSelector: string;
  /** Anything whose change can move the range's corners. */
  readonly layoutKey: unknown;
  /** Select the rectangle from `fixed` to `moving` (both cells of one table). */
  readonly onRange: (fixed: Element, moving: Element) => void;
  readonly onDragEnd?: () => void;
  /** `${testIdPrefix}-start` / `-end` on the grips, `${testIdPrefix}s` on the layer. */
  readonly testIdPrefix: string;
  readonly zIndex?: number;
}

export function OfficeTableTouchGrips(props: OfficeTableTouchGripsProps): React.JSX.Element | null {
  const touchMode = useTouchInputMode();
  const enabled = props.enabled && touchMode;
  const layerRef = useRef<HTMLDivElement | null>(null);
  const [geometry, setGeometry] = useState<OfficeTableTouchGripGeometry>(EMPTY);
  const [dragging, setDragging] = useState(false);
  const frameRef = useRef(0);
  const endDragRef = useRef<(() => void) | null>(null);
  const live = useRef(props);
  const draggingRef = useRef(false);
  useLayoutEffect(() => {
    live.current = props;
  });

  const schedule = useCallback(() => {
    if (frameRef.current || typeof requestAnimationFrame !== "function") return;
    const tick = () => {
      frameRef.current = 0;
      const layer = layerRef.current;
      const next = layer ? measureTableTouchGrips(layer, live.current.selectedCells(layer)) : EMPTY;
      setGeometry((previous) =>
        samePoint(previous.start, next.start) &&
        samePoint(previous.end, next.end) &&
        Math.abs(previous.unscale - next.unscale) < 0.001 &&
        previous.rtl === next.rtl
          ? previous
          : next,
      );
      // the range repaints under a dragging finger without a commit here
      if (draggingRef.current) frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
  }, []);

  useLayoutEffect(() => {
    if (enabled) schedule();
  });
  // grips switched off forget where they stood: no stale frame on their return
  useLayoutEffect(() => {
    if (!enabled) return;
    return () => setGeometry(EMPTY);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    // any scroller between the table and the screen moves the corners
    window.addEventListener("scroll", schedule, { capture: true, passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("resize", schedule);
    };
  }, [enabled, schedule]);

  useEffect(
    () => () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
      endDragRef.current?.();
    },
    [],
  );

  const onGrip = useCallback(
    (corner: OfficeTableTouchGripCorner, event: ReactPointerEvent<HTMLSpanElement>) => {
      event.preventDefault();
      event.stopPropagation();
      // a grip is a finger's; a mouse that reaches one (touch mode left on
      // after a tap) does nothing here
      if (!isTouchLikePointer(event)) return;
      const layer = layerRef.current;
      if (!layer) return;
      const cells = live.current.selectedCells(layer);
      const measured = cells.map((cell) => ({ cell, rect: cell.getBoundingClientRect() }));
      const bounds = tableRangeBounds(measured.map((entry) => entry.rect));
      if (!bounds || cells.length === 0) return;
      const rtl = tableIsRtl(cells[0]!);
      const fixed = tableCellAtCorner(measured, bounds, corner === "start" ? "end" : "start", rtl);
      const table = fixed?.closest("table");
      if (!fixed || !table) return;
      endDragRef.current?.();
      const pointerId = event.pointerId;
      const release = holdTouchGesture(event.currentTarget, pointerId);
      let moving: Element | null = tableCellAtCorner(measured, bounds, corner, rtl);
      let last = { x: event.clientX, y: event.clientY };
      let frame = 0;
      let ended = false;
      const follow = () => {
        frame = 0;
        const cell = tableCellAtPoint(last.x, last.y, table, live.current.cellSelector);
        if (!cell || cell === moving) return;
        moving = cell;
        live.current.onRange(fixed, cell);
      };
      const move = (next: PointerEvent) => {
        if (next.pointerId !== pointerId) return;
        last = { x: next.clientX, y: next.clientY };
        if (!frame) frame = requestAnimationFrame(follow);
      };
      const finish = (next: PointerEvent | null) => {
        if (ended) return;
        ended = true;
        window.removeEventListener("pointermove", move, true);
        window.removeEventListener("pointerup", up, true);
        window.removeEventListener("pointercancel", cancel, true);
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
        // the last stretch of the drag counts even when no frame ran for it
        if (next) {
          last = { x: next.clientX, y: next.clientY };
          follow();
        }
        release();
        if (endDragRef.current === stop) endDragRef.current = null;
        draggingRef.current = false;
        setDragging(false);
        swallowNextClick();
        live.current.onDragEnd?.();
      };
      const up = (next: PointerEvent) => {
        if (next.pointerId === pointerId) finish(next);
      };
      // the browser took the touch: keep what the finger already chose
      const cancel = (next: PointerEvent) => {
        if (next.pointerId === pointerId) finish(null);
      };
      const stop = () => finish(null);
      window.addEventListener("pointermove", move, true);
      window.addEventListener("pointerup", up, true);
      window.addEventListener("pointercancel", cancel, true);
      endDragRef.current = stop;
      draggingRef.current = true;
      setDragging(true);
      schedule();
    },
    [schedule],
  );

  if (!enabled) return null;
  const { start, end, unscale, rtl } = geometry;
  const grip = (corner: OfficeTableTouchGripCorner, point: OfficeTableTouchPoint | null) => {
    if (!point) return null;
    const outward = corner === "start" ? -GRIP_LEAN_PX : GRIP_LEAN_PX;
    return (
      <span
        key={corner}
        // the grip keeps its screen size on a scaled ancestor
        style={{
          position: "absolute",
          left: point.x,
          top: point.y,
          width: 0,
          height: 0,
          transform: unscale !== 1 ? `scale(${unscale})` : undefined,
          transformOrigin: "0 0",
        }}
        // a tap on a grip is not a click on the table under it
        onClick={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
      >
        <OfficeTouchGrip
          variant="selection"
          testId={`${props.testIdPrefix}-${corner}`}
          x={0}
          y={0}
          hitOffsetX={rtl ? -outward : outward}
          hitOffsetY={outward}
          zIndex={2}
          onPointerDown={(event) => onGrip(corner, event)}
        />
      </span>
    );
  };
  return (
    <div
      ref={layerRef}
      data-testid={`${props.testIdPrefix}s`}
      data-office-touch-grips={dragging ? "dragging" : "idle"}
      aria-hidden="true"
      contentEditable={false}
      suppressContentEditableWarning
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "visible",
        zIndex: props.zIndex ?? 13,
      }}
    >
      {grip("start", start)}
      {grip("end", end)}
    </div>
  );
}
