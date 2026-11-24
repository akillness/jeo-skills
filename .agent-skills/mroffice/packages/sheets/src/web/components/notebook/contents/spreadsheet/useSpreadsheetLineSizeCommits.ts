"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { withBestFitColumns } from "@mrnote/core/web/lib/spreadsheet/cell-buttons.ts";
import { sizeMapsEqual, columnWidthsSheet, rowHeightsSheet, linesHiddenSheet } from "../../../../lib/spreadsheet/row-column-buttons";
import { editNativeColumns, nativeColumnCssClamp, nativeWidthToPixels, editNativeRowSizes } from "@mrnote/core/web/lib/spreadsheet/native-typography.ts";
import { type AutoRowMeasurement } from "./useSpreadsheetAutoRowHeights";
import { useCallback } from "react";
import { clampColumnWidth, setLineSize, clampRowHeight } from "@mrnote/core/web/lib/spreadsheet/grid-sizing.ts";
import { type SheetModel } from "./spreadsheetSheetModel";
import { MAX_SHEET_COLS, MAX_SHEET_ROWS } from "./spreadsheetGridConstants";
import { type SheetViewMappedCellMutation, type SheetViewMappedDrawingMutation, type SheetViewMappedLineMutation, type SheetViewMappedPageMutation } from "./spreadsheetSheetViews";
import { type ResolvedNativeGrid } from "../../../../lib/spreadsheet/row-column-buttons";

/** What useSpreadsheetLineSizeCommits reads from SpreadsheetWindow's render scope. */
export interface SpreadsheetLineSizeCommitsInputs {
  autoRowCandidates: { measurements: AutoRowMeasurement[]; rows: { has(row: number): boolean }; };
  effectiveDefaultColumnWidth: number;
  effectiveDefaultRowHeight: number;
  lineFormatBlockedByProtection: (axis: "row" | "col", start: number, end: number) => boolean;
  nativeGrid: ResolvedNativeGrid | undefined;
  replaceActiveSheet: (nextSheet: SheetModel, nextTitle?: string, calculationMutation?: "content" | "coordinate", sheetViewMutation?: SheetViewMappedCellMutation | SheetViewMappedDrawingMutation | SheetViewMappedLineMutation | SheetViewMappedPageMutation, followOnOtherSheets?: (candidate: SheetModel) => SheetModel) => SheetModel[];
  sheet: SheetModel;
}

/** Moved verbatim from SpreadsheetWindow (called at the same position, so hook order is unchanged). */
export function useSpreadsheetLineSizeCommits({
  autoRowCandidates,
  effectiveDefaultColumnWidth,
  effectiveDefaultRowHeight,
  lineFormatBlockedByProtection,
  nativeGrid,
  replaceActiveSheet,
  sheet,
}: SpreadsheetLineSizeCommitsInputs) {
  const commitColumnWidth = useCallback(
    (col: number, width: number, bestFit = false) => {
      if (lineFormatBlockedByProtection("col", col, col)) return;
      if (sheet.nativeGrid && !nativeGrid) return;
      if (nativeGrid) {
        const size = clampColumnWidth(width, effectiveDefaultColumnWidth);
        const nextGrid = editNativeColumns(nativeGrid.grid, [{ index: col, size }], nativeGrid.digitWidth, nativeGrid.dpi);
        const previousWidth = nativeColumnCssClamp(nativeGrid.widths[col], nativeGrid.defaultWidth ?? effectiveDefaultColumnWidth);
        if (Math.abs(previousWidth - nativeWidthToPixels(nextGrid.columns[col].width, nativeGrid.digitWidth, nativeGrid.dpi)) < 0.01) return;
        replaceActiveSheet({ ...sheet, columnCount: Math.max(sheet.columnCount, col + 1), columnWidths: { ...sheet.columnWidths, [col]: nextGrid.columns[col].pixels }, nativeGrid: nextGrid });
        return;
      }
      const nextWidths = setLineSize(
        sheet.columnWidths,
        col,
        width,
        effectiveDefaultColumnWidth,
        clampColumnWidth,
      );
      // A fitted width keeps the column best-fit; a width the user set ends it.
      const marked = withBestFitColumns(sheet, [col], bestFit);
      if (marked === sheet && sizeMapsEqual(sheet.columnWidths, nextWidths)) return;
      // A width given to a column past the stored extent stores that column.
      const next: SheetModel = { ...marked, columnCount: Math.max(marked.columnCount, col + 1) };
      if (nextWidths) next.columnWidths = nextWidths;
      else delete next.columnWidths;
      replaceActiveSheet(next);
    },
    [
      nativeGrid,
      effectiveDefaultColumnWidth,
      lineFormatBlockedByProtection,
      replaceActiveSheet,
      sheet,
    ],
  );

  const commitRowHeight = useCallback(
    (row: number, height: number) => {
      if (lineFormatBlockedByProtection("row", row, row)) return;
      if (sheet.nativeGrid?.rowMetrics) {
        const nextGrid=editNativeRowSizes(sheet.nativeGrid,[{index:row,size:height}]);
        const pair=nextGrid.rowMetrics!.rows[row];
        if (sheet.nativeGrid.rowMetrics.rows[row]?.heightPt===pair.heightPt && sheet.nativeGrid.rowMetrics.rows[row]?.customHeight) return;
        replaceActiveSheet({...sheet,nativeGrid:nextGrid,rowHeights:{...sheet.rowHeights,[row]:pair.pixels}});
        return;
      }
      let nextHeights = setLineSize(
        sheet.rowHeights,
        row,
        height,
        effectiveDefaultRowHeight,
        clampRowHeight,
      );
      if (autoRowCandidates.rows.has(row) && clampRowHeight(height, effectiveDefaultRowHeight) === effectiveDefaultRowHeight) {
        nextHeights = { ...nextHeights, [row]: effectiveDefaultRowHeight };
      }
      if (sizeMapsEqual(sheet.rowHeights, nextHeights)) return;
      const next: SheetModel = { ...sheet };
      if (nextHeights) next.rowHeights = nextHeights;
      else delete next.rowHeights;
      replaceActiveSheet(next);
    },
    [
      autoRowCandidates,
      effectiveDefaultRowHeight,
      lineFormatBlockedByProtection,
      replaceActiveSheet,
      sheet,
    ],
  );

  // Commit many column widths as ONE model change (so a multi-column auto-fit /
  // resize is a single undo step, matching Excel/WPS where double-clicking a
  // divider while several columns are selected fits them all at once).
  // `reveal`: Excel shows a hidden column that is given a width (typed in
  // Column Width for a selection that holds it), in the same step.
  const commitColumnWidths = useCallback(
    (
      sizes: ReadonlyArray<{ index: number; size: number }>,
      preflightedSheet?: SheetModel,
      // `bestFit`: the widths were fitted to the content (AutoFit), not set
      // by the user, so the columns stay best-fit.
      options?: { reveal?: boolean; bestFit?: boolean },
    ) => {
      const valid = sizes.filter(
        ({ index }) =>
          Number.isSafeInteger(index) &&
          index >= 0 &&
          index < MAX_SHEET_COLS,
      );
      if (valid.length === 0 || valid.length !== sizes.length) return;
      if (
        preflightedSheet !== sheet &&
        valid.some(({ index }) =>
          lineFormatBlockedByProtection("col", index, index),
        )
      ) {
        return;
      }
      const next = columnWidthsSheet(sheet, valid, {
        nativeGrid,
        defaultWidth: effectiveDefaultColumnWidth,
        reveal: options?.reveal,
        bestFit: options?.bestFit,
      });
      if (next) replaceActiveSheet(next);
    },
    [
      nativeGrid,
      effectiveDefaultColumnWidth,
      lineFormatBlockedByProtection,
      replaceActiveSheet,
      sheet,
    ],
  );

  const commitRowHeights = useCallback(
    (
      sizes: ReadonlyArray<{ index: number; size: number }>,
      preflightedSheet?: SheetModel,
      options?: { reveal?: boolean },
    ) => {
      const valid = sizes.filter(
        ({ index }) =>
          Number.isSafeInteger(index) && index >= 0 && index < MAX_SHEET_ROWS,
      );
      if (valid.length === 0 || valid.length !== sizes.length) return;
      if (
        preflightedSheet !== sheet &&
        valid.some(({ index }) =>
          lineFormatBlockedByProtection("row", index, index),
        )
      ) {
        return;
      }
      // `reveal`: as commitColumnWidths, a height given to a hidden row shows it.
      const next = rowHeightsSheet(sheet, valid, {
        defaultHeight: effectiveDefaultRowHeight,
        autoRow: (row) => autoRowCandidates.rows.has(row),
        reveal: options?.reveal,
      });
      if (next) replaceActiveSheet(next);
    },
    [
      autoRowCandidates,
      effectiveDefaultRowHeight,
      lineFormatBlockedByProtection,
      replaceActiveSheet,
      sheet,
    ],
  );

  // Excel hides a column given 0 in Column Width (a row given 0 in Row
  // Height) rather than sizing it: the size it had comes back when it is
  // shown again. One model change, so one Undo.
  const commitLinesHidden = useCallback(
    (axis: "col" | "row", lines: readonly number[], hide: boolean) => {
      // Any line of the worksheet, as the menus' Hide takes: a 0 typed for a
      // blank column past the stored extent hides it too (the transaction
      // stores the line). It used to be dropped silently.
      const lineCount = axis === "col" ? MAX_SHEET_COLS : MAX_SHEET_ROWS;
      const valid = lines.filter(
        (line) => Number.isSafeInteger(line) && line >= 0 && line < lineCount,
      );
      if (valid.length === 0) return;
      if (
        lineFormatBlockedByProtection(
          axis,
          Math.min(...valid),
          Math.max(...valid),
        )
      ) {
        return;
      }
      const sheetNext = linesHiddenSheet(sheet, axis, valid, hide);
      if (sheetNext) replaceActiveSheet(sheetNext);
    },
    [
      lineFormatBlockedByProtection,
      replaceActiveSheet,
      sheet,
    ],
  );
  return {
    commitColumnWidth,
    commitColumnWidths,
    commitLinesHidden,
    commitRowHeight,
    commitRowHeights,
  };
}
