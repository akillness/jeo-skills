"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Boxes drawn over ranges of the grid, measured off the cells it has on
 * screen: Excel's range finder while a formula is entered
 * (`SpreadsheetFormulaReferenceOverlay`) and a selected chart's source data
 * (`SpreadsheetChartSourceOverlay`) both outline cells this way.
 *
 * The host is a layer laid over the grid stage (its parent element): a box
 * is in the stage's own pixels, so it stays on its cells through the
 * stage's zoom. A range that runs past the rendered rows or
 * columns is boxed as far as they go (the edge it runs on past is not its
 * own, `edges`), one wholly out of view has no box, and the boxes are
 * measured again as the grid scrolls (frozen panes keep their cells in
 * place while the rest moves) or resizes.
 */

import { useLayoutEffect, useState, type RefObject } from "react";
import { SPREADSHEET_GRID_CORNER_DRAWINGS_LAYER, SPREADSHEET_GRID_FROZEN_BAND_DRAWINGS_LAYER } from "./spreadsheetGridConstants";

export interface SheetRangeSpan {
  /** Stable identity of the range among those drawn. */
  readonly key: string;
  /** Zero-based, inclusive, top-left first (`Infinity` runs to the end). */
  readonly r1: number;
  readonly c1: number;
  readonly r2: number;
  readonly c2: number;
}

/**
 * The pane of the grid a box stands in when panes are frozen: the corner
 * (frozen rows and columns), the top band (frozen rows), the left band
 * (frozen columns) or the scrolling body. Each is drawn on its own layer
 * (`SHEET_RANGE_PANE_LAYERS`), as Excel draws a range in each pane it spans:
 * a box over frozen cells stays over them, one over the body passes under
 * the frozen bands as its cells do.
 */
export type SheetRangePane = "body" | "top" | "left" | "corner";

export const SHEET_RANGE_PANES: readonly SheetRangePane[] = ["body", "left", "top", "corner"];

/**
 * The stacking layer of an overlay's boxes in a pane (spreadsheetGridConstants):
 * the body's is the overlay's own (under the frozen cells, which cover it as
 * the body scrolls under them); a band's is its drawings' tier, over the
 * band's cells and under the corner's; the corner's is the corner drawings'
 * tier, over everything frozen. The layers stand before the drawing panes,
 * so at the same tier a chart still covers the outline of the cells it
 * stands on, as it does in the body.
 */
export function sheetRangePaneLayer(pane: SheetRangePane, bodyLayer: number): number {
  return pane === "corner"
    ? SPREADSHEET_GRID_CORNER_DRAWINGS_LAYER
    : pane === "body"
      ? bodyLayer
      : SPREADSHEET_GRID_FROZEN_BAND_DRAWINGS_LAYER;
}

/** The lines frozen at the top and at the start of the sheet. */
export interface SheetFrozenLines {
  readonly rows: number;
  readonly cols: number;
}

export interface SheetRangeBox<T extends SheetRangeSpan> {
  readonly span: T;
  /** The pane this part of the range stands in ("body" without frozen panes). */
  readonly pane: SheetRangePane;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  /** Which edges are the range's own (false: it runs on out of view, or on
   * into the next pane across a freeze line). */
  readonly edges: readonly [top: boolean, right: boolean, bottom: boolean, left: boolean];
}

const CELL_SELECTOR = '[data-testid="spreadsheet-cell"][data-cell]';

function cellKey(element: HTMLElement): { row: number; col: number } | null {
  return cellKeyOf(element.dataset.cell);
}

function cellKeyOf(key: string | null | undefined): { row: number; col: number } | null {
  if (!key) return null;
  const separator = key.indexOf(":");
  const row = Number(key.slice(0, separator));
  const col = Number(key.slice(separator + 1));
  return Number.isInteger(row) && Number.isInteger(col) ? { row, col } : null;
}

interface Extent {
  min: number;
  max: number;
}

const emptyExtent = (): Extent => ({ min: Infinity, max: -1 });

const widen = (extent: Extent, at: number) => {
  if (at < extent.min) extent.min = at;
  if (at > extent.max) extent.max = at;
};

/** The boxes of `spans`, a range split at the freeze lines into one box per
 * pane it spans: each in the own pixels of its pane's layer (`paneOrigin`; a
 * frozen pane's layer is pinned with the pane, so its boxes stay put as the
 * grid scrolls without being measured again), or of the stage. Exported for
 * tests. */
export function measureSheetRangeBoxes<T extends SheetRangeSpan>(
  stage: HTMLElement,
  spans: readonly T[],
  frozen: SheetFrozenLines | null = null,
  paneOrigin: (pane: SheetRangePane) => HTMLElement | null | undefined = () => null,
): SheetRangeBox<T>[] {
  const stageRect = stage.getBoundingClientRect();
  // The stage may be zoomed: its children's own pixels are layout pixels.
  const scale = stage.offsetWidth > 0 ? stageRect.width / stage.offsetWidth : 1;
  const frozenRows = Math.max(0, frozen?.rows ?? 0);
  const frozenCols = Math.max(0, frozen?.cols ?? 0);
  const cells = new Map<string, HTMLElement>();
  // The rendered lines of each pane apart: the frozen rows are always on
  // screen while the body's window is wherever the grid scrolled, and a
  // range is cut where the rendered lines of its own pane end.
  const rows = { frozen: emptyExtent(), body: emptyExtent() };
  const cols = { frozen: emptyExtent(), body: emptyExtent() };
  // A ghost cell (the canvas text layer's, without an editor) is its own address.
  for (const editor of stage.querySelectorAll<HTMLElement>(`${CELL_SELECTOR}, td[data-ghost-cell]`)) {
    const ghost = editor.hasAttribute("data-ghost-cell");
    const at = ghost ? cellKeyOf(editor.getAttribute("data-range-cell")) : cellKey(editor);
    const cell = ghost ? editor : editor.closest("td");
    if (!at || !cell) continue;
    cells.set(`${at.row}:${at.col}`, cell);
    widen(at.row < frozenRows ? rows.frozen : rows.body, at.row);
    widen(at.col < frozenCols ? cols.frozen : cols.body, at.col);
  }
  const corner = (row: number, col: number, toward: 1 | -1, limitRow: number, limitCol: number) => {
    // The cell at (row, col), or the nearest rendered one further into the
    // range (a cell a merge covers, or a hidden line, has no element).
    for (let r = row; toward > 0 ? r <= limitRow : r >= limitRow; r += toward) {
      for (let c = col; toward > 0 ? c <= limitCol : c >= limitCol; c += toward) {
        const cell = cells.get(`${r}:${c}`);
        if (cell) return cell;
      }
    }
    return undefined;
  };
  // A range's lines in each pane: [first, last, rendered extent of the pane].
  const parts = (first: number, last: number, split: number, extents: { frozen: Extent; body: Extent }) => {
    const out: { first: number; last: number; frozen: boolean; extent: Extent }[] = [];
    if (first < split) out.push({ first, last: Math.min(last, split - 1), frozen: true, extent: extents.frozen });
    if (last >= split) out.push({ first: Math.max(first, split), last, frozen: false, extent: extents.body });
    return out;
  };
  const next: SheetRangeBox<T>[] = [];
  for (const span of spans) {
    for (const rowPart of parts(span.r1, span.r2, frozenRows, rows)) {
      for (const colPart of parts(span.c1, span.c2, frozenCols, cols)) {
        const r1 = Math.max(rowPart.first, rowPart.extent.min), r2 = Math.min(rowPart.last, rowPart.extent.max);
        const c1 = Math.max(colPart.first, colPart.extent.min), c2 = Math.min(colPart.last, colPart.extent.max);
        if (r1 > r2 || c1 > c2) continue;
        const first = corner(r1, c1, 1, r2, c2);
        const last = corner(r2, c2, -1, r1, c1);
        if (!first || !last) continue;
        const a = first.getBoundingClientRect(), b = last.getBoundingClientRect();
        const left = Math.min(a.left, b.left), right = Math.max(a.right, b.right);
        const top = Math.min(a.top, b.top), bottom = Math.max(a.bottom, b.bottom);
        const pane: SheetRangePane =
          rowPart.frozen && colPart.frozen ? "corner" : rowPart.frozen ? "top" : colPart.frozen ? "left" : "body";
        const origin = paneOrigin(pane)?.getBoundingClientRect() ?? stageRect;
        next.push({
          span,
          pane,
          left: (left - origin.left) / scale,
          top: (top - origin.top) / scale,
          width: (right - left) / scale,
          height: (bottom - top) / scale,
          // An edge is the range's own where the range ends there and the
          // pane renders that line: not where it runs on out of the
          // rendered window, nor across a freeze line into the next pane.
          edges: [
            rowPart.first === span.r1 && span.r1 >= rowPart.extent.min,
            colPart.last === span.c2 && span.c2 <= colPart.extent.max,
            rowPart.last === span.r2 && span.r2 <= rowPart.extent.max,
            colPart.first === span.c1 && span.c1 >= colPart.extent.min,
          ],
        });
      }
    }
  }
  return next;
}

const sameBoxes = <T extends SheetRangeSpan>(current: readonly SheetRangeBox<T>[], next: readonly SheetRangeBox<T>[]) =>
  current.length === next.length &&
  current.every((box, index) => {
    const other = next[index]!;
    return box.span === other.span && box.pane === other.pane &&
      Math.abs(box.left - other.left) < 0.25 && Math.abs(box.top - other.top) < 0.25 &&
      Math.abs(box.width - other.width) < 0.25 && Math.abs(box.height - other.height) < 0.25 &&
      box.edges.every((edge, side) => edge === other.edges[side]);
  });

/**
 * The boxes of `spans` over the grid stage that is `hostRef`'s parent,
 * measured again when the spans change, `layoutKey` changes (the grid laid
 * out again: its scroll window, sizes, zoom), the stage scrolls or resizes.
 */
/**
 * The grid stage an overlay host draws over: its parent, or its parent's
 * parent when the host stands in a stage slot (a `display: contents` box
 * that keeps the stage's own children fixed while the overlay comes and
 * goes, see SpreadsheetWindow).
 */
export function sheetOverlayStage(host: HTMLElement | null | undefined): HTMLElement | null {
  const parent = host?.parentElement ?? null;
  return parent?.hasAttribute("data-spreadsheet-stage-slot") ? parent.parentElement : parent;
}

export function useSheetRangeBoxes<T extends SheetRangeSpan>(
  hostRef: RefObject<HTMLElement | null>,
  spans: readonly T[],
  layoutKey: unknown,
  frozen: SheetFrozenLines | null = null,
  /** The layer each frozen pane's boxes are drawn on (pinned with the pane). */
  paneLayers?: RefObject<Partial<Record<SheetRangePane, HTMLElement | null>>>,
): readonly SheetRangeBox<T>[] {
  const frozenRows = frozen?.rows ?? 0;
  const frozenCols = frozen?.cols ?? 0;
  const [boxes, setBoxes] = useState<readonly SheetRangeBox<T>[]>([]);
  useLayoutEffect(() => {
    const host = hostRef.current;
    const stage = sheetOverlayStage(host);
    if (!host || !stage || spans.length === 0) {
      setBoxes((current) => (current.length ? [] : current));
      return;
    }
    const measure = () => {
      const next = measureSheetRangeBoxes(stage, spans, { rows: frozenRows, cols: frozenCols }, (pane) =>
        pane === "body" ? null : paneLayers?.current?.[pane],
      );
      setBoxes((current) => (sameBoxes(current, next) ? current : next));
    };
    measure();
    // Frozen panes keep their cells in place while the rest scrolls, and the
    // grid renders other rows as it goes: measure again as it moves.
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const scroller = stage.parentElement;
    scroller?.addEventListener("scroll", schedule, { passive: true });
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    resize?.observe(stage);
    return () => {
      cancelAnimationFrame(frame);
      scroller?.removeEventListener("scroll", schedule);
      resize?.disconnect();
    };
  }, [hostRef, spans, layoutKey, frozenRows, frozenCols, paneLayers]);
  return boxes;
}

/** The grid cell under a point of the screen (the frozen one over a body
 * cell scrolled beneath it; a merge's anchor for any cell it covers), or
 * null off the cells. */
export function sheetCellAtPoint(stage: HTMLElement, clientX: number, clientY: number): { row: number; col: number } | null {
  if (typeof document.elementsFromPoint !== "function") return null;
  for (const element of document.elementsFromPoint(clientX, clientY)) {
    if (!(element instanceof HTMLElement) || !stage.contains(element)) continue;
    const cell = element.closest("td");
    const editor = cell?.querySelector<HTMLElement>(CELL_SELECTOR);
    const at = editor ? cellKey(editor) : cell?.hasAttribute("data-ghost-cell") ? cellKeyOf(cell.getAttribute("data-range-cell")) : null;
    if (at) return at;
  }
  return null;
}
