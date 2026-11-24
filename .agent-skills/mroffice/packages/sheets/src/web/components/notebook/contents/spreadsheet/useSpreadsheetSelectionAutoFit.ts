"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { type SpreadsheetCell } from "@mrnote/core/web/lib/spreadsheet/cell-buttons.ts";
import type { OfficeFontFace } from "@mrnote/core/web/components/office-ribbon/officeFontFace.ts";
import { useCallback, type RefObject } from "react";
import { autoFitSkipsMergedCell, spanAt, type MergeSpan } from "@mrnote/core/web/lib/spreadsheet/merge-cells.ts";
import { type SheetProtectionPermission } from "@mrnote/core/web/lib/spreadsheet/protection.ts";
import { resolvedColumnWidth, autoFitCellHeightPx, autoFitColumnWidth } from "@mrnote/core/web/lib/spreadsheet/grid-sizing.ts";
import { hasManualLineBreak } from "../../../../lib/spreadsheet/cell-text";
import { isCheckboxCell } from "../../../../lib/spreadsheet/checkbox";
import { spreadsheetWrapMetrics } from "./spreadsheetCellCss";
import { type SheetModel } from "./spreadsheetSheetModel";
import { type CalculationState } from "@mrnote/core/web/lib/spreadsheet/calculation-mode.ts";
import { type GridRect } from "../../../../lib/spreadsheet/grid-nav";

/** What useSpreadsheetSelectionAutoFit reads from SpreadsheetWindow's render scope. */
export interface SpreadsheetSelectionAutoFitInputs {
  autoFitAuthorityRef: RefObject<{ workbook: SheetModel[]; sheet: SheetModel; calculationKey: string; selectionKey: string; }>;
  autoFitRequestRef: RefObject<number>;
  automaticWorksheetResultsRevision: number;
  calcLedgerRevision: number;
  calcState: CalculationState;
  cellDisplayValue: (cell: SpreadsheetCell | undefined, row: number, col: number, editing: boolean, numberFormatOverride?: string) => string;
  /** A cell's shown text as AutoFit measures it: in its drawn font, with an
   *  icon-set icon's room (S-042, S-050). */
  autoFitTextWidth: (cell: SpreadsheetCell | undefined, row: number, col: number, text: string) => number;
  /** The text the grid shows for a cell: its formula text while Show Formulas
   *  is on, else its display value (B484: a shown formula was fitted to its
   *  hidden result). Falls back to the display value. */
  cellShownText?: (cell: SpreadsheetCell | undefined, row: number, col: number) => string;
  commitColumnWidths: (sizes: ReadonlyArray<{ index: number; size: number; }>, preflightedSheet?: SheetModel, options?: { reveal?: boolean; bestFit?: boolean; }) => void;
  commitRowHeights: (sizes: ReadonlyArray<{ index: number; size: number; }>, preflightedSheet?: SheetModel, options?: { reveal?: boolean; }) => void;
  effectiveDefaultColumnWidth: number;
  effectiveDefaultRowHeight: number;
  /** The grid's text padding on each side of a cell. */
  displayCellPadding: number;
  mergeSpans: MergeSpan[];
  pivotRefreshRevision: number;
  selRect: GridRect;
  sheet: SheetModel;
  sheetProtectionAllowsRef: RefObject<(candidate: SheetModel | null | undefined, permission: SheetProtectionPermission) => boolean>;
  sheets: SheetModel[];
  showProtectNotice: (message?: string) => void;
  workbookFontAssets: { aliases: Record<string, string>; unavailable: boolean; faces: OfficeFontFace[]; };
}

/** Moved verbatim from SpreadsheetWindow (called at the same position, so hook order is unchanged). */
export function useSpreadsheetSelectionAutoFit({
  autoFitAuthorityRef,
  autoFitRequestRef,
  automaticWorksheetResultsRevision,
  calcLedgerRevision,
  calcState,
  autoFitTextWidth,
  cellDisplayValue,
  cellShownText,
  commitColumnWidths,
  commitRowHeights,
  effectiveDefaultColumnWidth,
  effectiveDefaultRowHeight,
  displayCellPadding,
  mergeSpans,
  pivotRefreshRevision,
  selRect,
  sheet,
  sheetProtectionAllowsRef,
  sheets,
  showProtectNotice,
  workbookFontAssets,
}: SpreadsheetSelectionAutoFitInputs) {
  // Selection-wide AutoFit is intentionally sparse and time-sliced. A maximum
  // worksheet selection is 10,000 x 1,000; walking that Cartesian product on a
  // click would synchronously perform ten million display/layout resolutions.
  // Instead we authenticate the COMPLETE affected protection domain first, then
  // visit only materialized cells in bounded chunks. The exact immutable sheet,
  // display evaluator and selection identities are rechecked before every chunk
  // and again before the one atomic commit.
  const runSelectionAutoFit = useCallback(
    (axis: "col" | "row", requestedIndices: ReadonlyArray<number>) => {
      const lineCount = axis === "col" ? sheet.columnCount : sheet.rowCount;
      const indices = [...new Set(requestedIndices)];
      if (
        indices.length === 0 ||
        indices.length !== requestedIndices.length ||
        indices.some(
          (index) =>
            !Number.isSafeInteger(index) || index < 0 || index >= lineCount,
        )
      ) {
        return;
      }

      const snapshotSheet = sheet;
      const snapshotDisplay = (cell: SpreadsheetCell | undefined, row: number, col: number): string =>
        cellShownText ? cellShownText(cell, row, col) : cellDisplayValue(cell, row, col, false);
      const snapshotWorkbook = sheets;
      const snapshotCalculationKey = `${calcState.mode}:${calcLedgerRevision}:${automaticWorksheetResultsRevision}:${pivotRefreshRevision}`;
      const snapshotSelectionKey = `${selRect.r1}:${selRect.r2}:${selRect.c1}:${selRect.c2}`;
      const token = autoFitRequestRef.current + 1;
      autoFitRequestRef.current = token;
      const targetLines = new Set(indices);
      const cellKeys = Object.keys(snapshotSheet.cells);
      const affectedCellCount =
        indices.length *
        (axis === "col" ? snapshotSheet.rowCount : snapshotSheet.columnCount);
      if (!Number.isSafeInteger(affectedCellCount) || affectedCellCount <= 0) {
        return;
      }

      const isCurrentAuthority = () => {
        const live = autoFitAuthorityRef.current;
        return (
          autoFitRequestRef.current === token &&
          live.workbook === snapshotWorkbook &&
          live.sheet === snapshotSheet &&
          live.calculationKey === snapshotCalculationKey &&
          live.selectionKey === snapshotSelectionKey
        );
      };
      const parseCellKey = (key: string) => {
        const separator = key.indexOf(":");
        if (separator <= 0 || separator === key.length - 1) return null;
        const row = Number(key.slice(0, separator));
        const col = Number(key.slice(separator + 1));
        if (
          !Number.isSafeInteger(row) ||
          !Number.isSafeInteger(col) ||
          row < 0 ||
          col < 0 ||
          row >= snapshotSheet.rowCount ||
          col >= snapshotSheet.columnCount ||
          key !== `${row}:${col}`
        ) {
          return null;
        }
        return { row, col };
      };
      const inAffectedDomain = (row: number, col: number) =>
        targetLines.has(axis === "col" ? col : row);
      const schedule = (task: () => void) => {
        window.setTimeout(task, 0);
      };
      const failProtected = () => {
        if (isCurrentAuthority()) showProtectNotice();
      };

      const widestByColumn = new Map<
        number,
        { text: string; displayWidth: number }
      >();
      const heightByRow = new Map<number, number>();
      // Excel's AutoFit passes over a merge that spans several columns (when
      // fitting a width) or several rows (when fitting a height).
      const skipsMerged = autoFitSkipsMergedCell(
        mergeSpans,
        axis === "col" ? "column" : "row",
      );
      for (const index of indices) {
        if (axis === "col") {
          widestByColumn.set(index, { text: "", displayWidth: 0 });
        } else {
          heightByRow.set(index, effectiveDefaultRowHeight);
        }
      }
      let measureCursor = 0;
      const measureChunk = () => {
        if (!isCurrentAuthority()) return;
        const end = Math.min(measureCursor + 256, cellKeys.length);
        try {
          for (; measureCursor < end; measureCursor += 1) {
            const key = cellKeys[measureCursor];
            const coordinate = parseCellKey(key);
            if (
              !coordinate ||
              !inAffectedDomain(coordinate.row, coordinate.col) ||
              skipsMerged(coordinate.row, coordinate.col)
            ) {
              continue;
            }
            const cell = snapshotSheet.cells[key];
            const text = snapshotDisplay(cell, coordinate.row, coordinate.col);
            if (axis === "col") {
              const current = widestByColumn.get(coordinate.col);
              if (!current || text === "") continue;
              // Measured in the cell's own font, as the divider double-click.
              // In the cell's drawn font, an icon-set icon's room included.
              const displayWidth = autoFitTextWidth(cell, coordinate.row, coordinate.col, text);
              if (displayWidth > current.displayWidth) {
                widestByColumn.set(coordinate.col, { text, displayWidth });
              }
              continue;
            }
            if (text === "") continue;
            const wraps =
              Boolean(cell?.style?.wrapText) || hasManualLineBreak(text);
            const span = spanAt(coordinate.row, coordinate.col, mergeSpans);
            const colSpanCount = span ? span.colSpan : 1;
            let widthPx = 0;
            for (
              let col = coordinate.col;
              col < coordinate.col + colSpanCount;
              col += 1
            ) {
              widthPx += resolvedColumnWidth(
                col,
                snapshotSheet.columnWidths,
                effectiveDefaultColumnWidth,
              );
            }
            // Wrapped lines, a taller font and turned text all set the row
            // (S-051), as the single-row AutoFit measures them.
            const turned = !isCheckboxCell(cell?.style);
            const needed = autoFitCellHeightPx(
              text,
              widthPx,
              effectiveDefaultRowHeight,
              spreadsheetWrapMetrics(cell?.style, workbookFontAssets.aliases),
              {
                wraps,
                rotation: turned ? Number(cell?.style?.textRotation ?? 0) : 0,
                stacked: turned && cell?.style?.verticalText === true,
              },
            );
            const current =
              heightByRow.get(coordinate.row) ?? effectiveDefaultRowHeight;
            if (needed > current) heightByRow.set(coordinate.row, needed);
          }
        } catch {
          // A malformed display/layout authority fails closed: no partial size
          // map reaches replaceActiveSheet.
          if (isCurrentAuthority()) autoFitRequestRef.current += 1;
          return;
        }
        if (measureCursor < cellKeys.length) {
          schedule(measureChunk);
          return;
        }
        // React state mutations replace the immutable sheet object, and formula
        // or spill authority changes replace the display callback. Identity
        // equality here is therefore the complete event-time revalidation; the
        // protection proof below belongs to this exact unchanged object.
        if (!isCurrentAuthority()) return;
        if (axis === "col") {
          commitColumnWidths(
            indices.map((index) => ({
              index,
              size: autoFitColumnWidth(
                widestByColumn.get(index)?.text ?? "",
                effectiveDefaultColumnWidth,
                {
                  measure: () => widestByColumn.get(index)?.displayWidth ?? 0,
                  paddingPx: 2 * displayCellPadding,
                },
              ),
            })),
            snapshotSheet,
            { bestFit: true },
          );
        } else {
          commitRowHeights(
            indices.map((index) => ({
              index,
              size: heightByRow.get(index) ?? effectiveDefaultRowHeight,
            })),
            snapshotSheet,
          );
        }
      };

      // Protection is a distinct first phase, with ZERO display measurement
      // when refused: AutoFit is a Format rows / Format columns command, so a
      // protected sheet answers with that permission alone (never the locks).
      if (
        !sheetProtectionAllowsRef.current(
          snapshotSheet,
          axis === "row" ? "formatRows" : "formatColumns",
        )
      ) {
        failProtected();
        return;
      }
      schedule(measureChunk);
    },
    [
      autoFitTextWidth,
      cellDisplayValue,
      cellShownText,
      calcLedgerRevision,
      displayCellPadding,
      calcState.mode,
      commitColumnWidths,
      commitRowHeights,
      automaticWorksheetResultsRevision,
      effectiveDefaultColumnWidth,
      effectiveDefaultRowHeight,
      mergeSpans,
      selRect,
      sheet,
      sheets,
      showProtectNotice,
      pivotRefreshRevision,
    ],
  );
  return {
    runSelectionAutoFit,
  };
}
