"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useCallback, useEffect, useInsertionEffect, useRef, type RefObject } from "react";
import { type SpreadsheetViewMode } from "../../../../lib/spreadsheet/view-options";
import { type SheetModel } from "./spreadsheetSheetModel";
import { SPREADSHEET_CELL_HEIGHT_PX, SPREADSHEET_CELL_WIDTH_PX, SPREADSHEET_HEADER_HEIGHT_PX, SPREADSHEET_HEADER_WIDTH_PX, SPREADSHEET_VIEWPORT_EDGE_RATIO, SPREADSHEET_VIEWPORT_ROW_GROWTH, SPREADSHEET_VIEWPORT_COL_GROWTH, MAX_SHEET_ROWS, MAX_SHEET_COLS } from "./spreadsheetGridConstants";
import { type EmbeddedWorkbookSession } from "@/lib/spreadsheet/embedded-workbook-session";
import { type Dispatch, type SetStateAction } from "react";

/** What useSpreadsheetGridViewportCapacity reads from SpreadsheetWindow's render scope. */
export interface SpreadsheetGridViewportCapacityInputs {
  embeddedWorkbookRef: RefObject<EmbeddedWorkbookSession | undefined>;
  gridViewportElementEpoch: number;
  /** The measured viewport size the window last rendered with. */
  gridViewportSize: { width: number; height: number; };
  gridWrapRef: RefObject<HTMLDivElement | null>;
  setGridViewportExtentBySheet: Dispatch<SetStateAction<Record<string, { rowCount: number; columnCount: number; }>>>;
  setGridViewportSize: Dispatch<SetStateAction<{ width: number; height: number; }>>;
  sheet: SheetModel;
  spreadsheetViewMode: SpreadsheetViewMode;
  storedGridViewportExtent: { rowCount: number; columnCount: number; } | undefined;
  toContentPx: (screenPx: number) => number;
}

/** Moved verbatim from SpreadsheetWindow (called at the same position, so hook order is unchanged). */
export function useSpreadsheetGridViewportCapacity({
  embeddedWorkbookRef,
  gridViewportElementEpoch,
  gridViewportSize,
  gridWrapRef,
  setGridViewportExtentBySheet,
  setGridViewportSize,
  sheet,
  spreadsheetViewMode,
  storedGridViewportExtent,
  toContentPx,
}: SpreadsheetGridViewportCapacityInputs) {
  // What the window last rendered with. Every scroll frame measures the
  // viewport again; a write of the size and extent already rendered is
  // skipped, since right after a render React cannot always drop it early
  // and the whole window then rendered once more for nothing (after every
  // band a wheel scroll mounts). A real change still goes through the
  // functional updates below, which read the latest queued state.
  const renderedRef = useRef({ size: gridViewportSize, extent: storedGridViewportExtent });
  // Published at commit, so an abandoned render never stands for the screen.
  useInsertionEffect(() => {
    renderedRef.current = { size: gridViewportSize, extent: storedGridViewportExtent };
  });
  // Grow the EMPTY logical viewport, never the workbook model. A first mount /
  // resize reserves one render-window beyond the visible area so a sheet whose
  // imported used range is narrower than the editor can still scroll. Ordinary
  // scroll events append one bounded window only when the user approaches an
  // edge. No cells, history receipts or autosave intents are created here.
  const ensureGridViewportCapacity = useCallback(
    (viewport: HTMLDivElement, growAtEdge: boolean) => {
      if (spreadsheetViewMode !== "normal" || sheet.chartSheet) return;
      // Chart workbooks start small. Do not eagerly inflate a 30x12 data
      // sheet to the standalone editor's blank render budget on every mount.
      // Explicit scrolling/name-box navigation can still extend the grid.
      // A Copilot's change reviewed as the sheet it makes ("grid") lies over
      // the live grid and fills it as the editor does: kept to its own
      // columns and rows, it left the rest of a wide window bare, drawn black
      
      if (embeddedWorkbookRef.current && embeddedWorkbookRef.current.presentation !== "grid" && !growAtEdge) return;
      const clientWidth = viewport.clientWidth, clientHeight = viewport.clientHeight;
      const scrollHeight = viewport.scrollHeight, scrollWidth = viewport.scrollWidth;
      const scrollTop = viewport.scrollTop, scrollLeft = viewport.scrollLeft;
      if (clientWidth <= 0 || clientHeight <= 0) return;
      const rendered = renderedRef.current;
      if (rendered.size.width !== clientWidth || rendered.size.height !== clientHeight) {
        setGridViewportSize(current => current.width === clientWidth && current.height === clientHeight
          ? current : { width: clientWidth, height: clientHeight });
      }
      const defaultRowHeight =
        typeof sheet.defaultRowHeight === "number" &&
        Number.isFinite(sheet.defaultRowHeight) &&
        sheet.defaultRowHeight > 0
          ? sheet.defaultRowHeight
          : SPREADSHEET_CELL_HEIGHT_PX;
      const defaultColumnWidth =
        typeof sheet.defaultColumnWidth === "number" &&
        Number.isFinite(sheet.defaultColumnWidth) &&
        sheet.defaultColumnWidth > 0
          ? sheet.defaultColumnWidth
          : SPREADSHEET_CELL_WIDTH_PX;
      const visibleRows = Math.max(
        1,
        Math.ceil(
          Math.max(
            0,
            toContentPx(clientHeight) -
              SPREADSHEET_HEADER_HEIGHT_PX,
          ) / defaultRowHeight,
        ),
      );
      const visibleColumns = Math.max(
        1,
        Math.ceil(
          Math.max(
            0,
            toContentPx(clientWidth) - SPREADSHEET_HEADER_WIDTH_PX,
          ) / defaultColumnWidth,
        ),
      );
      const bottomGap =
        scrollHeight - scrollTop - clientHeight;
      const trailingGap =
        scrollWidth -
        Math.abs(scrollLeft) -
        clientWidth;
      const nearBottom =
        bottomGap <= clientHeight * SPREADSHEET_VIEWPORT_EDGE_RATIO;
      const nearTrailingEdge =
        trailingGap <= clientWidth * SPREADSHEET_VIEWPORT_EDGE_RATIO;

      const grown = (current: { rowCount: number; columnCount: number }) => {
        let rowCount = Math.max(
          current.rowCount,
          sheet.rowCount,
          visibleRows + SPREADSHEET_VIEWPORT_ROW_GROWTH,
        );
        let columnCount = Math.max(
          current.columnCount,
          sheet.columnCount,
          visibleColumns + SPREADSHEET_VIEWPORT_COL_GROWTH,
        );
        if (growAtEdge && nearBottom) {
          rowCount = Math.max(
            rowCount,
            current.rowCount + SPREADSHEET_VIEWPORT_ROW_GROWTH +
              Math.ceil(toContentPx(Math.max(0, -bottomGap)) / defaultRowHeight),
          );
        }
        if (growAtEdge && nearTrailingEdge) {
          columnCount = Math.max(
            columnCount,
            current.columnCount + SPREADSHEET_VIEWPORT_COL_GROWTH +
              Math.ceil(toContentPx(Math.max(0, -trailingGap)) / defaultColumnWidth),
          );
        }
        rowCount = Math.min(MAX_SHEET_ROWS, rowCount);
        columnCount = Math.min(MAX_SHEET_COLS, columnCount);
        return rowCount === current.rowCount && columnCount === current.columnCount
          ? null
          : { rowCount, columnCount };
      };
      const sheetExtent = { rowCount: sheet.rowCount, columnCount: sheet.columnCount };
      // Unchanged against the rendered extent: nothing to write.
      if (!grown(rendered.extent ?? sheetExtent)) return;
      setGridViewportExtentBySheet((previous) => {
        const next = grown(previous[sheet.id] ?? sheetExtent);
        return next ? { ...previous, [sheet.id]: next } : previous;
      });
    },
    [sheet.id, sheet.rowCount, sheet.columnCount, sheet.chartSheet, sheet.defaultRowHeight, sheet.defaultColumnWidth, spreadsheetViewMode, toContentPx],
  );

  // Two things used to leave the sheet drawn only to its stored column count
  // after a page load — blank space to the right of column J until a scroll
  // grew it again. This effect's first run can precede the grid viewport
  // element (the page is still loading), so it neither grew anything nor
  // attached its observer; and a page load resets the session's logical
  // viewport (resetCalculationSession) after a mount that did grow it. When
  // the loaded sheet has the same id and shape as the one already mounted — a
  // blank workbook, or a reload of the same page — nothing else re-ran the
  // growth. The viewport element's arrival and the missing extent are
  // therefore triggers of their own.
  const gridViewportExtentMissing = storedGridViewportExtent === undefined;
  useEffect(() => {
    if (spreadsheetViewMode !== "normal") return;
    const viewport = gridWrapRef.current;
    if (!viewport) return;
    ensureGridViewportCapacity(viewport, false);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      ensureGridViewportCapacity(viewport, false);
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [
    ensureGridViewportCapacity,
    gridViewportElementEpoch,
    gridViewportExtentMissing,
    spreadsheetViewMode,
  ]);
  return {
    ensureGridViewportCapacity,
  };
}
