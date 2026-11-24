"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The layers an overlay of range boxes (useSheetRangeBoxes) draws on: its
 * host over the scrolling body, and, with panes frozen, one layer per frozen
 * pane pinned with that pane as the drawing panes are (SpreadsheetWindow):
 * a zero-size sticky box at the stage's start, so a box over frozen cells
 * stays on them while the body scrolls, with no measuring after the scroll.
 *
 * Excel draws a range (the range finder's references, a selected chart's
 * source data) in every pane it spans. On one layer under the frozen panes
 * (as the body's boxes must be, so they pass under the bands as their cells
 * do), the part over frozen cells was covered by those cells.
 */

import type { CSSProperties, ReactNode, RefObject } from "react";

import { offsetOfLine } from "@mrnote/core/web/lib/spreadsheet/grid-sizing.ts";

import { SPREADSHEET_HEADER_HEIGHT_PX, SPREADSHEET_HEADER_WIDTH_PX } from "./spreadsheetGridConstants";
import { SHEET_RANGE_PANES, sheetRangePaneLayer, type SheetFrozenLines, type SheetRangePane } from "./useSheetRangeBoxes";

export type SheetRangePaneLayerRefs = Partial<Record<SheetRangePane, HTMLElement | null>>;

/** The frozen panes a sheet has: the top band with frozen rows, the left band
 * with frozen columns, the corner with both. */
export function sheetFrozenPanes(frozen: SheetFrozenLines | null | undefined): SheetRangePane[] {
  const rows = (frozen?.rows ?? 0) > 0;
  const cols = (frozen?.cols ?? 0) > 0;
  return SHEET_RANGE_PANES.filter(
    (pane) => (pane === "top" && rows) || (pane === "left" && cols) || (pane === "corner" && rows && cols),
  );
}

/** Where the freeze lines run in the stage's content pixels (the headings'
 * size and the frozen lines'), as an overlay laid out from the sheet's
 * geometry places its boxes; null without frozen panes. */
export function sheetFreezeLinesPx(
  frozen: SheetFrozenLines | null | undefined,
  rowCount: number,
  columnCount: number,
  rowHeight: (line: number) => number,
  colWidth: (line: number) => number,
): { readonly x: number; readonly y: number } | null {
  const rows = frozen?.rows ?? 0;
  const cols = frozen?.cols ?? 0;
  if (rows <= 0 && cols <= 0) return null;
  return {
    y: rows > 0 ? SPREADSHEET_HEADER_HEIGHT_PX + offsetOfLine(rows, rowCount, rowHeight) : 0,
    x: cols > 0 ? SPREADSHEET_HEADER_WIDTH_PX + offsetOfLine(cols, columnCount, colWidth) : 0,
  };
}

export interface SheetBoxPanePart {
  readonly pane: SheetRangePane;
  /** The part of the box this pane shows, as a clip of the whole box
   * (undefined: the whole box, which stands in one pane). */
  readonly clip: string | undefined;
}

/**
 * The panes a box laid out in content pixels spans (`freeze`:
 * `sheetFreezeLinesPx`), each with the part of the box it shows. A frozen
 * pane's part is drawn on that pane's pinned layer in the same content
 * pixels: the layer stands at the stage's start while the grid is not
 * scrolled, and moves with its pane. On the body's single layer the frozen
 * cells covered it and it slid away with the body as the grid scrolled.
 * What reaches past the box (a name tag above it) is kept up to `reach`
 * where the edge is the box's own, and cut at a freeze line.
 */
export function sheetBoxPaneParts(
  box: { readonly left: number; readonly top: number; readonly width: number; readonly height: number },
  freeze: { readonly x: number; readonly y: number } | null,
  reach = 0,
): SheetBoxPanePart[] {
  if (!freeze) return [{ pane: "body", clip: undefined }];
  const x0 = box.left, x1 = box.left + box.width, y0 = box.top, y1 = box.top + box.height;
  type Span = { frozen: boolean; from: number; to: number };
  const rows: Span[] = [];
  if (freeze.y > 0 && y0 < freeze.y) rows.push({ frozen: true, from: y0, to: Math.min(y1, freeze.y) });
  if (freeze.y <= 0 || y1 > freeze.y) rows.push({ frozen: false, from: Math.max(y0, freeze.y), to: y1 });
  const cols: Span[] = [];
  if (freeze.x > 0 && x0 < freeze.x) cols.push({ frozen: true, from: x0, to: Math.min(x1, freeze.x) });
  if (freeze.x <= 0 || x1 > freeze.x) cols.push({ frozen: false, from: Math.max(x0, freeze.x), to: x1 });
  const paneOf = (row: Span, col: Span): SheetRangePane =>
    row.frozen ? (col.frozen ? "corner" : "top") : col.frozen ? "left" : "body";
  if (rows.length === 1 && cols.length === 1) return [{ pane: paneOf(rows[0]!, cols[0]!), clip: undefined }];
  const inset = (cut: number) => (cut > 0 ? `${cut}px` : `-${reach}px`);
  const parts: SheetBoxPanePart[] = [];
  for (const row of rows) {
    for (const col of cols) {
      parts.push({
        pane: paneOf(row, col),
        clip: `inset(${inset(row.from - y0)} ${inset(x1 - col.to)} ${inset(y1 - row.to)} ${inset(col.from - x0)})`,
      });
    }
  }
  return parts;
}

const PINNED: Record<Exclude<SheetRangePane, "body">, CSSProperties> = {
  top: { position: "sticky", top: 0, height: 0 },
  left: { position: "sticky", left: 0, width: 0, height: 0 },
  corner: { position: "sticky", top: 0, left: 0, width: 0, height: 0 },
};

export function SheetRangePaneLayers({
  hostRef,
  layersRef,
  frozen,
  bodyLayer,
  testId,
  hostProps,
  announced = false,
  children,
}: {
  readonly hostRef: RefObject<HTMLDivElement | null>;
  readonly layersRef: RefObject<SheetRangePaneLayerRefs>;
  readonly frozen: SheetFrozenLines | null | undefined;
  /** The body layer's stacking tier (the overlay's own). */
  readonly bodyLayer: number;
  /** The host's test id; a pane layer's is `${testId}-pane-${pane}`. */
  readonly testId: string;
  /** More attributes of the host (data-*). */
  readonly hostProps?: Record<string, string | undefined>;
  /** The boxes are named for assistive technology (not hidden from it). */
  readonly announced?: boolean;
  readonly children: (pane: SheetRangePane) => ReactNode;
}) {
  return (
    <>
      <div
        ref={hostRef}
        aria-hidden={announced ? undefined : "true"}
        data-testid={testId}
        {...hostProps}
        style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: bodyLayer }}
      >
        {children("body")}
      </div>
      {sheetFrozenPanes(frozen).map((pane) => (
        <div
          key={pane}
          ref={(element) => {
            layersRef.current[pane] = element;
          }}
          aria-hidden={announced ? undefined : "true"}
          data-testid={`${testId}-pane-${pane}`}
          style={{
            ...PINNED[pane as Exclude<SheetRangePane, "body">],
            overflow: "visible",
            pointerEvents: "none",
            zIndex: sheetRangePaneLayer(pane, bodyLayer),
          }}
        >
          {children(pane)}
        </div>
      ))}
    </>
  );
}
