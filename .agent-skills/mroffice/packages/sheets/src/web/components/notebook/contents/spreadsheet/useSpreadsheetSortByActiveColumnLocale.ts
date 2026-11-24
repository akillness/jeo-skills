"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { type CellMap } from "@mrnote/core/web/lib/spreadsheet/cell-buttons.ts";
import { useCallback, type RefObject } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { remapMergesByRowPermutation } from "@mrnote/core/web/lib/spreadsheet/merge-cells.ts";
import { relocateSortedCell } from "../../../../lib/spreadsheet/sort";
import { rowMoveTouchesArray, type SortArrayCellAt } from "../../../../lib/spreadsheet/sort-buttons";
import { type ChineseCollation } from "@mrnote/core/web/lib/spreadsheet/locale-sort.ts";
import { sortKeyOf, compareCells, type SortFilterRow, sortRows } from "../../../../lib/spreadsheet/sort-filter";
import { type SheetViewSortKeyInput } from "../../../../lib/spreadsheet/sheet-views";
import { type SheetModel } from "./spreadsheetSheetModel";
import { type SheetViewMappedCellMutation, type SheetViewMappedDrawingMutation, type SheetViewMappedLineMutation, type SheetViewMappedPageMutation, type SheetViewSession } from "./spreadsheetSheetViews";
import { type GridRect } from "../../../../lib/spreadsheet/grid-nav";

/** What useSpreadsheetSortByActiveColumnLocale reads from SpreadsheetWindow's render scope. */
export interface SpreadsheetSortByActiveColumnLocaleInputs {
  activeCell: { row: number; col: number; };
  cellSortKeyAt: (row: number, col: number) => { valueType: "boolean"; booleanValue: boolean; numericValue?: number | undefined; value: string; } | { valueType: "error"; numericValue?: number | undefined; value: string; } | { valueType: "text"; numericValue?: number | undefined; value: string; } | { numericValue?: number | undefined; value: string; };
  commitActiveSheetViewSort: (conditions: ReadonlyArray<SheetViewSortKeyInput>, options?: { caseSensitive?: boolean; sortMethod?: "pinYin" | "stroke"; }) => boolean | null;
  homeZh: boolean;
  locale: string;
  oneCellSortRegion: (col: number) => { r1: number; r2: number; c1: number; c2: number; } | null | undefined;
  replaceActiveSheet: (nextSheet: SheetModel, nextTitle?: string, calculationMutation?: "content" | "coordinate", sheetViewMutation?: SheetViewMappedCellMutation | SheetViewMappedDrawingMutation | SheetViewMappedLineMutation | SheetViewMappedPageMutation, followOnOtherSheets?: (candidate: SheetModel) => SheetModel) => SheetModel[];
  selRect: GridRect;
  sheet: SheetModel;
  sheetViewSessionRef: RefObject<SheetViewSession | null>;
  showProtectNotice: (message?: string) => void;
  sortRangeBlockedByProtection: (r1: number, r2: number, c2?: number, c1?: number) => boolean;
  /** Whether a range's first row reads as a header (text over numbers). */
  sortRangeHasHeaderRow: (range: { r1: number; r2: number; c1: number; c2: number }) => boolean;
  /** The cells of the sheet's dynamic arrays: a sort refuses to move them (B522). */
  sortArrayCellAt: SortArrayCellAt;
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
}

/** Moved verbatim from SpreadsheetWindow (called at the same position, so hook order is unchanged). */
export function useSpreadsheetSortByActiveColumnLocale({
  activeCell,
  cellSortKeyAt,
  commitActiveSheetViewSort,
  homeZh,
  locale,
  oneCellSortRegion,
  replaceActiveSheet,
  selRect,
  sheet,
  sheetViewSessionRef,
  showProtectNotice,
  sortRangeBlockedByProtection,
  sortRangeHasHeaderRow,
  sortArrayCellAt,
  t,
}: SpreadsheetSortByActiveColumnLocaleInputs) {
  // Locale-aware Chinese sort (WPS 排序 拼音/笔画 parity): same flow as
  // sortByActiveColumn but the text comparator uses an Intl.Collator scoped to
  // pinyin or stroke collation rather than the default localeCompare. Numbers
  // still sort numerically before text; blanks still sink last (same invariants
  // as the plain sort). Only the text-vs-text comparison changes.
  const sortByActiveColumnLocale = useCallback(
    (method: ChineseCollation, direction: "asc" | "desc") => {
      if (sheetViewSessionRef.current?.sheetId === sheet.id) {
        // Sort Options > Method (letter / stroke) is part of a view's sort.
        commitActiveSheetViewSort(
          [
            {
              column: activeCell.col,
              ...(direction === "desc" ? { descending: true } : {}),
            },
          ],
          method === "stroke"
            ? { sortMethod: "stroke" }
            : method === "pinyin"
              ? { sortMethod: "pinYin" }
              : {},
        );
        return;
      }
      const col = activeCell.col;
      const textOrder = { locale, method };
      // One selected cell: Excel's current region (oneCellSortRegion), sorted by
      // the span path below with its columns narrowed to the region. An empty
      // active cell has no region and keeps the used range.
      const oneCellRegion =
        selRect.r1 === selRect.r2 ? oneCellSortRegion(col) : null;
      if (oneCellRegion === undefined) return;
      // Reuse the same collapsed-vs-range logic as sortByActiveColumn.
      if (selRect.r1 === selRect.r2 && !oneCellRegion) {
        // Collapsed selection: whole-sheet column sort (header-aware).
        // Scan used region.
        let maxRow = -1;
        let maxCol = -1;
        for (const key of Object.keys(sheet.cells)) {
          const [rawRow, rawCol] = key.split(":");
          const r = Number(rawRow);
          const c = Number(rawCol);
          if (!Number.isInteger(r) || !Number.isInteger(c)) continue;
          maxRow = Math.max(maxRow, r);
          maxCol = Math.max(maxCol, c);
        }
        if (maxRow < 1 || maxCol < 0) return;
        if (sortRangeBlockedByProtection(0, maxRow, maxCol)) return;
        // Header detection: same heuristic as sortByColumn.
        const keyCol = col;
        let startRow = 0;
        if (maxRow >= 1) {
          const firstIsText =
            sortKeyOf(cellSortKeyAt(0, keyCol)).kind === "string";
          let hasNumeric = false;
          for (let row = 1; row <= maxRow; row += 1) {
            if (sortKeyOf(cellSortKeyAt(row, keyCol)).kind === "number") {
              hasNumeric = true;
              break;
            }
          }
          if (firstIsText && hasNumeric) startRow = 1;
        }
        const dataIndices: number[] = [];
        for (let r = startRow; r <= maxRow; r += 1) dataIndices.push(r);
        dataIndices.sort((a, b) => {
          return (
            compareCells(
              cellSortKeyAt(a, keyCol),
              cellSortKeyAt(b, keyCol),
              direction,
              true,
              textOrder,
            ) || a - b
          );
        });
        const order = [
          ...Array.from({ length: startRow }, (_, r) => r),
          ...dataIndices,
        ];
        if (rowMoveTouchesArray(sortArrayCellAt, 0, order, 0, maxCol)) {
          showProtectNotice(t("spreadsheet.uiCopy.cantChangePartOfArray"));
          return;
        }
        const cells: CellMap = {};
        order.forEach((srcRow, destRow) => {
          for (let c = 0; c <= maxCol; c += 1) {
            const cell = sheet.cells[`${srcRow}:${c}`];
            if (cell !== undefined) {
              cells[`${destRow}:${c}`] = relocateSortedCell(
                cell,
                destRow - srcRow,
                0,
              );
            }
          }
        });
        let next: SheetModel = { ...sheet, cells };
        if (sheet.merges && sheet.merges.length > 0) {
          let maxMergeRow = maxRow;
          for (const span of sheet.merges) {
            maxMergeRow = Math.max(maxMergeRow, span.row + span.rowSpan - 1);
          }
          const fullOrder = [...order];
          for (let r = maxRow + 1; r <= maxMergeRow; r += 1) fullOrder.push(r);
          const merges = remapMergesByRowPermutation(sheet.merges, fullOrder);
          next = { ...next, ...(merges.length > 0 ? { merges } : {}) };
          if (merges.length === 0) delete next.merges;
        }
        delete next.sortState;
        replaceActiveSheet(next, undefined, "coordinate");
        return;
      }
      // Multi-row selection: sort only the selected cells (its first row kept
      // when it reads as a header); the columns beside it stay put.
      let r1 = oneCellRegion ? oneCellRegion.r1 : selRect.r1;
      const r2 = oneCellRegion
        ? oneCellRegion.r2
        : Math.min(selRect.r2, sheet.rowCount - 1);
      const spanC1 = oneCellRegion ? oneCellRegion.c1 : selRect.c1;
      const spanC2 = oneCellRegion ? oneCellRegion.c2 : Math.min(selRect.c2, sheet.columnCount - 1);
      if (!oneCellRegion && sortRangeHasHeaderRow({ r1, r2, c1: spanC1, c2: spanC2 })) r1 += 1;
      if (r2 <= r1) return;
      if (sortRangeBlockedByProtection(r1, r2, spanC2, spanC1)) return;
      const indexRows: SortFilterRow[] = [];
      for (let r = r1; r <= r2; r += 1) {
        indexRows.push([
          cellSortKeyAt(r, col),
          { value: String(r) },
        ]);
      }
      // The ordinary sort's comparator (type order, blanks last), with the
      // chosen Chinese method for text.
      const sourceOrder = sortRows(indexRows, 0, direction, true, textOrder).map(
        (entry) => Number(entry[1]?.value),
      );
      if (rowMoveTouchesArray(sortArrayCellAt, r1, sourceOrder, spanC1, spanC2)) {
        showProtectNotice(t("spreadsheet.uiCopy.cantChangePartOfArray"));
        return;
      }
      const nextCells: CellMap = { ...sheet.cells };
      for (let r = r1; r <= r2; r += 1) {
        for (let c = spanC1; c <= spanC2; c += 1) {
          delete nextCells[`${r}:${c}`];
        }
      }
      sourceOrder.forEach((srcRow, offset) => {
        const destRow = r1 + offset;
        for (let c = spanC1; c <= spanC2; c += 1) {
          const cell = sheet.cells[`${srcRow}:${c}`];
          if (cell !== undefined) {
            nextCells[`${destRow}:${c}`] = relocateSortedCell(
              cell,
              destRow - srcRow,
              0,
            );
          }
        }
      });
      const next: SheetModel = { ...sheet, cells: nextCells };
      delete next.sortState;
      if (sheet.merges && sheet.merges.length > 0) {
        let maxOrderRow = r2;
        for (const span of sheet.merges) {
          maxOrderRow = Math.max(maxOrderRow, span.row + span.rowSpan - 1);
        }
        const order: number[] = [];
        for (let r = 0; r <= maxOrderRow; r += 1) order.push(r);
        sourceOrder.forEach((srcRow, offset) => {
          order[r1 + offset] = srcRow;
        });
        const remapped = remapMergesByRowPermutation(sheet.merges, order);
        if (remapped.length > 0) next.merges = remapped;
        else delete next.merges;
      }
      replaceActiveSheet(next, undefined, "coordinate");
    },
    [
      replaceActiveSheet,
      sheet,
      activeCell.col,
      commitActiveSheetViewSort,
      selRect.r1,
      selRect.r2,
      selRect.c1,
      selRect.c2,
      sortRangeBlockedByProtection,
      sortRangeHasHeaderRow,
      cellSortKeyAt,
      oneCellSortRegion,
      homeZh,
      locale,
      showProtectNotice, sortArrayCellAt, t],
  );
}
