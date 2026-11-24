"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useEffect, useRef, type RefObject } from "react";
import { clipToVisibleEditor } from "@mrnote/core/web/components/console/editor/native-document/visibleEditorClip.ts";
import { spreadsheetCellNodeAt } from "./spreadsheetCellLookup";

/**
 * Excel's Draw Borders tools (Home > Font > Borders > Draw Borders).
 *
 * ## Microsoft behaviour this reproduces
 *
 * Draw Border, Draw Border Grid and Erase Border turn the pointer over the
 * grid into a pencil (an eraser); picking a Line Color or Line Style turns
 * Draw Border on by itself, so the next stroke draws in that pen (Microsoft
 * Support, "Apply or remove cell borders on a worksheet"). With the tool held:
 *   - a click on a gridline draws (erases) that one border;
 *   - a drag across cells draws an outline around them (Draw Border), every
 *     border of them (Draw Border Grid), or clears all their borders (Erase
 *     Border);
 *   - a click inside a cell treats the cell as a one-cell drag;
 *   - the grid does not select while the tool is held;
 *   - Esc, or the Borders button, puts the tool down.
 *
 * The host owns the writes (protection, one Undo step per stroke); this hook
 * only turns pointer strokes over `data-cell` cells into edge and range
 * gestures.
 */

export type SpreadsheetBorderDrawMode = "draw" | "grid" | "erase";
export type SpreadsheetBorderDrawEdge = "top" | "right" | "bottom" | "left";

export interface SpreadsheetBorderDrawRange {
  readonly r1: number;
  readonly c1: number;
  readonly r2: number;
  readonly c2: number;
}

interface HitCell {
  readonly row: number;
  readonly col: number;
  readonly rect: DOMRect;
}

/** How close (px) to a gridline a click has to land to take that line. */
const EDGE_TOLERANCE_PX = 4;
/** Travel (px) before a press becomes a drag. */
const DRAG_THRESHOLD_PX = 4;

function cellAt(
  x: number,
  y: number,
  root: Element,
  target: EventTarget | null,
): HitCell | null {
  const doc = root.ownerDocument;
  // What lies under the point, then the event's own target (a layout-less
  // host reports nothing under any point).
  const candidates: Element[] = [
    ...(typeof doc.elementsFromPoint === "function"
      ? doc.elementsFromPoint(x, y)
      : []),
    ...(target instanceof Element ? [target] : []),
  ];
  for (const element of candidates) {
    if (!root.contains(element)) continue;
    const input =
      element.matches("[data-cell]")
        ? element
        : element.querySelector(":scope > [data-cell]");
    const key = input?.getAttribute("data-cell");
    if (!input || !key) continue;
    const [row, col] = key.split(":").map((part) => Number.parseInt(part, 10));
    if (!Number.isFinite(row) || !Number.isFinite(col)) continue;
    const cell = input.closest("td") ?? input;
    return { row, col, rect: cell.getBoundingClientRect() };
  }
  return null;
}

/** The gridline of `hit` within tolerance of the point, nearest first. */
export function spreadsheetBorderEdgeAt(
  rect: { left: number; top: number; right: number; bottom: number },
  x: number,
  y: number,
  tolerance: number = EDGE_TOLERANCE_PX,
): SpreadsheetBorderDrawEdge | null {
  const distances: Array<[SpreadsheetBorderDrawEdge, number]> = [
    ["top", Math.abs(y - rect.top)],
    ["bottom", Math.abs(rect.bottom - y)],
    ["left", Math.abs(x - rect.left)],
    ["right", Math.abs(rect.right - x)],
  ];
  distances.sort((a, b) => a[1] - b[1]);
  const [edge, distance] = distances[0];
  return distance <= tolerance ? edge : null;
}

function cellRect(root: Element, row: number, col: number): DOMRect | null {
  const input = spreadsheetCellNodeAt<Element>(root, `${row}:${col}`);
  if (!input) return null;
  return (input.closest("td") ?? input).getBoundingClientRect();
}

/**
 * What the stroke will draw, shown while the pointer is still down: the
 * box (Draw Border), the box and every inside gridline (Draw Border Grid),
 * or a veil over the cells Erase Border will clear. It is a fixed overlay
 * in the pen's own line, rebuilt as the pointer crosses into another cell.
 */
function createStrokePreview(root: HTMLElement) {
  const doc = root.ownerDocument;
  const layer = doc.createElement("div");
  layer.setAttribute("data-border-draw-preview", "true");
  layer.setAttribute("aria-hidden", "true");
  // Over the whole viewport (taking no pointer), so its clip-path is in
  // client px and its pieces are placed in them.
  Object.assign(layer.style, {
    position: "fixed",
    inset: "0",
    pointerEvents: "none",
    zIndex: "2147483000",
  });
  doc.body.appendChild(layer);
  let shown = "";
  const line = (left: number, top: number, width: number, height: number, css: Partial<CSSStyleDeclaration>) => {
    const piece = doc.createElement("div");
    Object.assign(piece.style, {
      position: "absolute",
      left: `${left}px`,
      top: `${top}px`,
      width: `${Math.max(0, width)}px`,
      height: `${Math.max(0, height)}px`,
      boxSizing: "border-box",
      ...css,
    });
    layer.appendChild(piece);
  };
  return {
    show(range: SpreadsheetBorderDrawRange, mode: SpreadsheetBorderDrawMode, border: string) {
      const key = `${range.r1}:${range.c1}:${range.r2}:${range.c2}:${mode}:${border}`;
      if (key === shown) return;
      const first = cellRect(root, range.r1, range.c1);
      const last = cellRect(root, range.r2, range.c2);
      layer.replaceChildren();
      shown = key;
      if (!first || !last) return;
      // The layer is on the body: cut to what the grid's scroller and the
      // window leave visible, so a range whose first cell has scrolled away
      // (the grid follows the pen) is not drawn over the ribbon or the desk.
      const view = doc.defaultView;
      const anchor = spreadsheetCellNodeAt<HTMLElement>(root, `${range.r1}:${range.c1}`);
      const shownArea =
        anchor && view
          ? clipToVisibleEditor(anchor, { left: 0, top: 0, width: view.innerWidth, height: view.innerHeight })
          : null;
      layer.style.clipPath =
        shownArea && view
          ? `inset(${shownArea.top}px ${Math.max(0, view.innerWidth - shownArea.left - shownArea.width)}px ${Math.max(0, view.innerHeight - shownArea.top - shownArea.height)}px ${shownArea.left}px)`
          : "";
      const left = first.left;
      const top = first.top;
      const width = last.right - first.left;
      const height = last.bottom - first.top;
      if (mode === "erase") {
        line(left, top, width, height, {
          background: "rgb(37 99 235 / 10%)",
          border: "1.5px dashed rgb(37 99 235 / 70%)",
        });
        return;
      }
      line(left, top, width, height, { border });
      if (mode !== "grid") return;
      // Inside gridlines at each column's and row's own boundary.
      for (let col = range.c1; col < range.c2; col += 1) {
        const rect = cellRect(root, range.r1, col);
        if (rect) line(rect.right - 0.5, top, 0, height, { borderLeft: border });
      }
      for (let row = range.r1; row < range.r2; row += 1) {
        const rect = cellRect(root, row, range.c1);
        if (rect) line(left, rect.bottom - 0.5, width, 0, { borderTop: border });
      }
    },
    clear() {
      shown = "";
      layer.replaceChildren();
    },
    dispose() {
      layer.remove();
    },
  };
}

export function useSpreadsheetBorderDraw({
  rootRef,
  mode,
  previewBorder,
  onEdge,
  onRange,
  onExit,
}: {
  /** The window element; only presses on grid cells (`data-cell`) are taken. */
  readonly rootRef: RefObject<HTMLElement | null>;
  readonly mode: SpreadsheetBorderDrawMode | null;
  /** The pen as a CSS border (`<width> <style> <color>`), for the stroke preview. */
  readonly previewBorder?: string;
  readonly onEdge: (row: number, col: number, edge: SpreadsheetBorderDrawEdge) => void;
  readonly onRange: (range: SpreadsheetBorderDrawRange) => void;
  readonly onExit: () => void;
}): void {
  const handlers = useRef({ onEdge, onRange, onExit });
  const penRef = useRef(previewBorder ?? "1px solid #000000");
  useEffect(() => {
    handlers.current = { onEdge, onRange, onExit };
    penRef.current = previewBorder ?? "1px solid #000000";
  });

  useEffect(() => {
    const root = rootRef.current;
    if (!mode || !root) return;
    root.setAttribute("data-border-draw-mode", mode);
    const preview = createStrokePreview(root);
    let stroke: {
      pointerId: number;
      x: number;
      y: number;
      start: HitCell;
      moved: boolean;
    } | null = null;
    // The click the browser sends after a stroke is not a cell click.
    let swallowClick = false;

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const start = cellAt(event.clientX, event.clientY, root, event.target);
      if (!start) return;
      // The grid does not select while a border tool is held.
      event.preventDefault();
      event.stopPropagation();
      stroke = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        start,
        moved: false,
      };
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!stroke || event.pointerId !== stroke.pointerId) return;
      if (
        Math.hypot(event.clientX - stroke.x, event.clientY - stroke.y) >=
        DRAG_THRESHOLD_PX
      ) {
        stroke.moved = true;
      }
      event.preventDefault();
      if (!stroke.moved) return;
      const end = cellAt(event.clientX, event.clientY, root, null);
      if (!end) return;
      preview.show(
        {
          r1: Math.min(stroke.start.row, end.row),
          c1: Math.min(stroke.start.col, end.col),
          r2: Math.max(stroke.start.row, end.row),
          c2: Math.max(stroke.start.col, end.col),
        },
        mode,
        penRef.current,
      );
    };
    const onPointerUp = (event: PointerEvent) => {
      if (!stroke || event.pointerId !== stroke.pointerId) return;
      const { start, moved, x, y } = stroke;
      stroke = null;
      preview.clear();
      swallowClick = true;
      window.setTimeout(() => {
        swallowClick = false;
      }, 0);
      event.preventDefault();
      event.stopPropagation();
      if (!moved) {
        const edge = spreadsheetBorderEdgeAt(start.rect, x, y);
        if (edge) {
          handlers.current.onEdge(start.row, start.col, edge);
          return;
        }
        handlers.current.onRange({
          r1: start.row,
          c1: start.col,
          r2: start.row,
          c2: start.col,
        });
        return;
      }
      const end =
        cellAt(event.clientX, event.clientY, root, event.target) ?? start;
      handlers.current.onRange({
        r1: Math.min(start.row, end.row),
        c1: Math.min(start.col, end.col),
        r2: Math.max(start.row, end.row),
        c2: Math.max(start.col, end.col),
      });
    };
    const onClick = (event: MouseEvent) => {
      if (!swallowClick) return;
      swallowClick = false;
      event.preventDefault();
      event.stopPropagation();
    };
    const onPointerCancel = (event: PointerEvent) => {
      if (!stroke || event.pointerId !== stroke.pointerId) return;
      stroke = null;
      preview.clear();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      stroke = null;
      preview.clear();
      handlers.current.onExit();
    };
    root.addEventListener("pointerdown", onPointerDown, true);
    root.addEventListener("click", onClick, true);
    window.addEventListener("pointermove", onPointerMove, true);
    window.addEventListener("pointerup", onPointerUp, true);
    window.addEventListener("pointercancel", onPointerCancel, true);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      preview.dispose();
      window.removeEventListener("pointercancel", onPointerCancel, true);
      root.removeAttribute("data-border-draw-mode");
      root.removeEventListener("pointerdown", onPointerDown, true);
      root.removeEventListener("click", onClick, true);
      window.removeEventListener("pointermove", onPointerMove, true);
      window.removeEventListener("pointerup", onPointerUp, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [mode, rootRef]);
}
