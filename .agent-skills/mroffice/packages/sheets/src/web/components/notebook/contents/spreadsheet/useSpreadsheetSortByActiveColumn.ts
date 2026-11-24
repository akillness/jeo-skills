"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { sourceOrderAmongVisibleRows, valueSortState, rowSortedSheet, type SortArrayCellAt } from "../../../../lib/spreadsheet/sort-buttons";
import { useCallback, type RefObject } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { type MacroStep } from "../../../../lib/spreadsheet/macros";
import { type DataTable, type DataTableSortCondition } from "@mrnote/core/web/lib/spreadsheet/data-table.ts";
import { type canSortRange as canSortRangeWithProtection } from "@mrnote/core/web/lib/spreadsheet/protection.ts";
import { sortKeyOf, type SortFilterRow, sortRows } from "../../../../lib/spreadsheet/sort-filter";
import { parseA1Range } from "@mrnote/core/web/lib/spreadsheet/print-settings.ts";
import { defaultNamedSheetViewRef, type SheetViewSortKeyInput } from "../../../../lib/spreadsheet/sheet-views";
import { type SheetModel } from "./spreadsheetSheetModel";
import { MAX_SHEET_ROWS, MAX_SHEET_COLS } from "./spreadsheetGridConstants";
import { type SheetViewScopedAction, type SheetViewMappedCellMutation, type SheetViewMappedDrawingMutation, type SheetViewMappedLineMutation, type SheetViewMappedPageMutation, type SheetViewSession } from "./spreadsheetSheetViews";
import { type GridRect } from "../../../../lib/spreadsheet/grid-nav";

/** A cell key's row and column when it is spelled `row:col` in plain
 * decimal (no sign, no leading zero), else null: read digit by digit, as
 * a sort first reads every key of the sheet (split and Number were 0.3 s
 * over 728,000 keys). */
function canonicalCellKey(key: string): { row: number; col: number } | null {
  let row = 0;
  let col = 0;
  let part = 0;
  let digits = 0;
  for (let index = 0; index < key.length; index += 1) {
    const code = key.charCodeAt(index);
    if (code === 58) {
      if (part === 1 || digits === 0) return null;
      part = 1;
      digits = 0;
      continue;
    }
    if (code < 48 || code > 57) return null;
    // A leading zero is only "0" itself.
    if (digits === 1 && (part === 0 ? row : col) === 0) return null;
    digits += 1;
    if (part === 0) row = row * 10 + code - 48;
    else col = col * 10 + code - 48;
  }
  if (part === 0 || digits === 0) return null;
  return Number.isSafeInteger(row) && Number.isSafeInteger(col) ? { row, col } : null;
}

/** What useSpreadsheetSortByActiveColumn reads from SpreadsheetWindow's render scope. */
export interface SpreadsheetSortByActiveColumnInputs {
  activeCell: { row: number; col: number; };
  askSheetViewScopeRef: RefObject<(action: SheetViewScopedAction) => boolean>;
  canSortRangeRef: RefObject<(candidate: SheetModel, range: Parameters<typeof canSortRangeWithProtection>[1]) => boolean>;
  cellSortKeyAt: (row: number, col: number) => { valueType: "boolean"; booleanValue: boolean; numericValue?: number | undefined; value: string; } | { valueType: "error"; numericValue?: number | undefined; value: string; } | { valueType: "text"; numericValue?: number | undefined; value: string; } | { numericValue?: number | undefined; value: string; };
  commitActiveSheetViewSort: (conditions: ReadonlyArray<SheetViewSortKeyInput>, options?: { caseSensitive?: boolean; sortMethod?: "pinYin" | "stroke"; }) => boolean | null;
  dataTables: DataTable[];
  /** The rows the sheet's filters hide now: a sort leaves them in place. */
  filterHiddenRows?: ReadonlySet<number>;
  hasActiveFilter: boolean;
  homeZh: boolean;
  macroAnchorRef: RefObject<{ row: number; col: number; }>;
  macroExplicitStepRef: RefObject<MacroStep | null>;
  macroRecordingRef: RefObject<boolean>;
  oneCellSortRegion: (col: number) => { r1: number; r2: number; c1: number; c2: number; } | null | undefined;
  /** Whether a range's first row reads as a header (text over numbers). */
  sortRangeHasHeaderRow: (range: { r1: number; r2: number; c1: number; c2: number }) => boolean;
  replaceActiveSheet: (nextSheet: SheetModel, nextTitle?: string, calculationMutation?: "content" | "coordinate", sheetViewMutation?: SheetViewMappedCellMutation | SheetViewMappedDrawingMutation | SheetViewMappedLineMutation | SheetViewMappedPageMutation, followOnOtherSheets?: (candidate: SheetModel) => SheetModel) => SheetModel[];
  selRect: GridRect;
  sheet: SheetModel;
  sheetViewSessionRef: RefObject<SheetViewSession | null>;
  showProtectNotice: (message?: string) => void;
  sortDataTableRef: RefObject<((id: string, conditions: readonly DataTableSortCondition[]) => Promise<void>) | null>;
  /** The cells of the sheet's dynamic arrays: a sort refuses to move them (B522). */
  sortArrayCellAt: SortArrayCellAt;
  sortTextOrder: { locale: string; };
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
}

/** Moved verbatim from SpreadsheetWindow (called at the same position, so hook order is unchanged). */
export function useSpreadsheetSortByActiveColumn({
  activeCell,
  askSheetViewScopeRef,
  canSortRangeRef,
  cellSortKeyAt,
  commitActiveSheetViewSort,
  dataTables,
  filterHiddenRows,
  hasActiveFilter,
  homeZh,
  macroAnchorRef,
  macroExplicitStepRef,
  macroRecordingRef,
  oneCellSortRegion,
  sortRangeHasHeaderRow,
  replaceActiveSheet,
  selRect,
  sheet,
  sheetViewSessionRef,
  showProtectNotice,
  sortDataTableRef,
  sortArrayCellAt,
  sortTextOrder,
  t,
}: SpreadsheetSortByActiveColumnInputs) {
  const sortByActiveColumn = useCallback(
    (direction: "asc" | "desc", requestedColumn?: number) => {
      const headerMenuAuthority = requestedColumn !== undefined;
      const col = requestedColumn ?? activeCell.col;
      // A recording keeps the sort as a sort (Excel's Range.Sort), run again
      // on whatever the data is when the macro runs.
      const recordQuickSort = () => {
        if (!macroRecordingRef.current) return;
        const anchor = macroAnchorRef.current;
        macroExplicitStepRef.current = {
          kind: "sort",
          quick: true,
          dRow: selRect.r1 - anchor.row,
          dCol: selRect.c1 - anchor.col,
          rows: selRect.r2 - selRect.r1 + 1,
          cols: selRect.c2 - selRect.c1 + 1,
          levels: [{ at: col - anchor.col, direction }],
        };
      };
      if (
        askSheetViewScopeRef.current({
          kind: "quickSort",
          direction,
          ...(requestedColumn !== undefined ? { column: requestedColumn } : {}),
        })
      ) {
        return;
      }
      // The formal Table (with its header row) the active cell sorts in.
      const table = dataTables.find(
        (candidate) =>
          candidate.headerRow &&
          activeCell.row >= candidate.range.r1 &&
          activeCell.row <= candidate.range.r2 &&
          col >= candidate.range.c1 &&
          col <= candidate.range.c2,
      );
      const columnId = table?.columns?.[col - (table?.range.c1 ?? 0)]?.id;
      const sortAsTable = () => {
        if (!table || columnId === undefined) return;
        void sortDataTableRef.current?.(table.id, [
          { columnId, ...(direction === "desc" ? { descending: true } : {}) },
        ]);
      };
      const viewSession = sheetViewSessionRef.current;
      if (viewSession?.sheetId === sheet.id) {
        // In a view a Table sorts as a Table (its own sort keys, view-local);
        // anywhere else the sort belongs to the view's AutoFilter range,
        // which it sorts whole, as Excel's AutoFilter sort does.
        if (table && columnId !== undefined && !headerMenuAuthority) {
          sortAsTable();
          return;
        }
        const viewRange = parseA1Range(
          (viewSession.ref ?? defaultNamedSheetViewRef(sheet)).replace(/\$/g, ""),
        );
        if (
          !headerMenuAuthority &&
          (!viewRange ||
            selRect.r1 < viewRange.r1 ||
            selRect.r2 > viewRange.r2 ||
            selRect.c1 < viewRange.c1 ||
            selRect.c2 > viewRange.c2)
        ) {
          showProtectNotice(t("spreadsheet.uiCopy.sheetViewsSortTheWholeFilterRange"));
          return;
        }
      }
      const sheetViewSortHandled = commitActiveSheetViewSort([
        { column: col, ...(direction === "desc" ? { descending: true } : {}) },
      ]);
      if (sheetViewSortHandled !== null) return;
      // One cell of a formal Table sorts that Table (Excel "Sort data in a
      // range or table"): its body under the header row it declares, through
      // the Table's own sort as its header menu does. The current-region
      // header guess (text over numbers) would take an all-text header such
      // as Key/Label for data and sort it to the bottom (live audit B012).
      if (
        !headerMenuAuthority &&
        table &&
        columnId !== undefined &&
        selRect.r1 === selRect.r2 &&
        selRect.c1 === selRect.c2
      ) {
        recordQuickSort();
        sortAsTable();
        return;
      }
      const rowCount = sheet.rowCount;
      const columnCount = sheet.columnCount;
      if (
        typeof sheet.id !== "string" ||
        sheet.id.length === 0 ||
        !Number.isInteger(rowCount) ||
        rowCount <= 0 ||
        rowCount > MAX_SHEET_ROWS ||
        !Number.isInteger(columnCount) ||
        columnCount <= 0 ||
        columnCount > MAX_SHEET_COLS ||
        !Number.isInteger(col) ||
        col < 0 ||
        col >= columnCount ||
        (!headerMenuAuthority &&
          (!Number.isInteger(activeCell.row) ||
            !Number.isInteger(selRect.r1) ||
            !Number.isInteger(selRect.r2) ||
            !Number.isInteger(selRect.c1) ||
            !Number.isInteger(selRect.c2) ||
            selRect.r1 < 0 ||
            selRect.r2 < selRect.r1 ||
            selRect.r2 >= rowCount ||
            selRect.c1 < 0 ||
            selRect.c2 < selRect.c1 ||
            selRect.c2 >= columnCount ||
            activeCell.row < selRect.r1 ||
            activeCell.row > selRect.r2 ||
            col < selRect.c1 ||
            col > selRect.c2))
      ) {
        return;
      }
      // Collapsed selection => sort the whole used column (header-aware).
      if (headerMenuAuthority || selRect.r1 === selRect.r2) {
        let maxRow = -1;
        let maxColumn = -1;
        for (const key in sheet.cells) {
          const at = canonicalCellKey(key);
          if (!at || at.row >= rowCount || at.col >= columnCount) return;
          if (at.row > maxRow) maxRow = at.row;
          if (at.col > maxColumn) maxColumn = at.col;
        }
        // A merged block is used even where its covered cells hold nothing:
        // the list a filtered sheet sorts takes it whole, so the sort can see,
        // and refuse, the merge it would tear (a vertical merge in column B
        // beside a filtered column A was split silently).
        for (const merge of Array.isArray(sheet.merges) ? sheet.merges : []) {
          if (!merge || !Number.isInteger(merge.row) || !Number.isInteger(merge.col)) continue;
          if (maxRow < 0 || merge.row > maxRow + 1 || merge.col > maxColumn + 1) continue;
          maxRow = Math.min(rowCount - 1, Math.max(maxRow, merge.row + Math.max(1, merge.rowSpan ?? 1) - 1));
          maxColumn = Math.min(columnCount - 1, Math.max(maxColumn, merge.col + Math.max(1, merge.colSpan ?? 1) - 1));
        }
        if (maxRow < 1 || maxColumn < 0) return;

        // A toolbar sort from one selected cell sorts the CURRENT REGION around
        // that cell, exactly as Excel does, not the sheet's whole used range
        // (oneCellSortRegion). Sorting the used range dragged a title above the
        // table, a total row below it and any unrelated block further down
        // into the sort: the title and the header row changed places and the
        // total's =SUM() ended up pointing at itself. An empty active cell has
        // no region and keeps the used range, with the header inferred in the
        // sorted column alone; a header AutoFilter menu owns row 0 as its
        // header even when every data value is text.
        let regionLeft = 0;
        let dataR1 = headerMenuAuthority || hasActiveFilter ? 1 : 0;
        // A header AutoFilter menu sorts the filter's own range (the rows its
        // value list was read from), never the used range past it: a block
        // below a blank row is not the filter's and stays where it is.
        const autoFilterRange = headerMenuAuthority && sheet.autoFilterRef
          ? parseA1Range(sheet.autoFilterRef.replace(/\$/g, ""))
          : null;
        if (
          autoFilterRange &&
          col >= autoFilterRange.c1 &&
          col <= autoFilterRange.c2
        ) {
          dataR1 = autoFilterRange.r1 + 1;
          regionLeft = autoFilterRange.c1;
          maxRow = Math.min(maxRow, autoFilterRange.r2);
          maxColumn = Math.min(maxColumn, autoFilterRange.c2);
        }
        if (!headerMenuAuthority && !hasActiveFilter) {
          const region = oneCellSortRegion(col);
          if (region === undefined) return;
          if (region) {
            dataR1 = region.r1;
            regionLeft = region.c1;
            maxRow = region.r2;
            maxColumn = region.c2;
          } else {
            try {
              const resolvedKind = (row: number) =>
                sortKeyOf(cellSortKeyAt(row, col)).kind;
              if (resolvedKind(0) === "string") {
                for (let row = 1; row <= maxRow; row += 1) {
                  if (resolvedKind(row) === "number") {
                    dataR1 = 1;
                    break;
                  }
                }
              }
            } catch {
              return;
            }
          }
        }
        if (maxRow - dataR1 < 1) return;
        if (
          !canSortRangeRef.current(sheet, {
            r1: dataR1,
            r2: maxRow,
            c1: regionLeft,
            c2: maxColumn,
          })
        ) {
          showProtectNotice();
          return;
        }
        // A filtered list sorts among its visible rows; the rows its filter
        // hides keep their places and stay hidden, and the filter stays, as
        
        const sourceOrder = sourceOrderAmongVisibleRows(dataR1, maxRow, filterHiddenRows ?? new Set<number>(), (rows) =>
          sortRows(
            rows.map((row) => [cellSortKeyAt(row, col), { value: String(row) }] as SortFilterRow),
            0,
            direction,
            true,
            sortTextOrder,
          ).map((row) => Number(row[1]?.value)),
        );
        const nextSortState = valueSortState(
          { r1: dataR1, r2: maxRow },
          maxColumn + 1,
          [{ column: col, direction }],
          regionLeft,
        );
        // The rows' new order through the shared row rewrite (sort-buttons):
        // formulas rebase, merges follow, the sortState is recorded; rows
        // already in order only record it.
        const inOrder = sourceOrder.every((source, offset) => source === dataR1 + offset);
        const sorted = rowSortedSheet(
          sheet,
          { dataR1, c1: regionLeft, c2: maxColumn },
          sourceOrder,
          nextSortState,
          sortArrayCellAt,
        );
        if (sorted === "merge" || sorted === "array" || sorted === "table") {
          showProtectNotice(
            t(sorted === "array"
              ? "spreadsheet.uiCopy.cantChangePartOfArray"
              : sorted === "table"
                ? "spreadsheet.cellShiftRefusedTable"
                : "spreadsheet.uiCopy.canTSortBecauseMergedCellsWouldBeSplit"),
          );
          return;
        }
        if (!sorted) return;
        recordQuickSort();
        replaceActiveSheet(sorted, undefined, inOrder ? undefined : "coordinate");
        return;
      }
      // A multi-cell selection sorts its own cells, as Excel sorts a range:
      // the columns beside it stay put (data right beside it was offered by
      // the Sort Warning first), and its first row is kept as a header when
      // it reads as one (text over numbers), as the one-cell region guesses.
      const c1 = selRect.c1;
      const c2 = selRect.c2;
      let r1 = hasActiveFilter && selRect.r1 === 0 ? 1 : selRect.r1;
      const r2 = selRect.r2;
      if (!hasActiveFilter) {
        try {
          if (sortRangeHasHeaderRow({ r1, r2, c1, c2 })) r1 += 1;
        } catch {
          return;
        }
      }
      if (r2 <= r1) return;
      if (
        !canSortRangeRef.current(sheet, {
          r1,
          r2,
          c1,
          c2,
        })
      ) {
        showProtectNotice();
        return;
      }
      // Sort the span's row indices by the active column. Each pure "row" is just
      // the key column's value tagged with its source row index, so the resolved
      // order tells us how to permute whole source rows (styles/comments/formula-
      // free values all travel together). sortRows is stable, so equal keys keep
      // their original order.
      // Index 0 carries the key value; index 1 stashes the source row index so
      // it survives the (stable) permutation. Sort by the RESOLVED display
      // label plus its authenticated raw/computed numeric scalar. Formatting
      // stays visible but never changes value ordering. Rows a filter hides
      
      const sourceOrder = sourceOrderAmongVisibleRows(r1, r2, filterHiddenRows ?? new Set<number>(), (rows) =>
        sortRows(
          rows.map((r) => [cellSortKeyAt(r, col), { value: String(r) }] as SortFilterRow),
          0,
          direction,
          true,
          sortTextOrder,
        ).map((row) => Number(row[1]?.value)),
      );
      const nextSortState = valueSortState(
        { r1, r2 },
        c2 + 1,
        [{ column: col, direction }],
        c1,
      );
      const inOrder = sourceOrder.every((source, offset) => source === r1 + offset);
      // Rebuild the affected span in the new order (sort-buttons); cells
      // outside the span are untouched and merges follow the same row
      // permutation. Any active filter is keyed by display value, so it
      // survives.
      const sorted = rowSortedSheet(
        sheet,
        { dataR1: r1, c1, c2 },
        sourceOrder,
        nextSortState,
        sortArrayCellAt,
      );
      if (sorted === "merge" || sorted === "array" || sorted === "table") {
        showProtectNotice(
          t(sorted === "array"
            ? "spreadsheet.uiCopy.cantChangePartOfArray"
            : sorted === "table"
              ? "spreadsheet.cellShiftRefusedTable"
              : "spreadsheet.uiCopy.canTSortBecauseMergedCellsWouldBeSplit"),
        );
        return;
      }
      if (!sorted) return;
      recordQuickSort();
      replaceActiveSheet(sorted, undefined, inOrder ? undefined : "coordinate");
    },
    // cellSortKeyAt derives from sheet.cells via formulaEvaluator; `sheet` is
    // already a dependency, so the callback recomputes when the cell map changes.
    [
      replaceActiveSheet,
      sheet,
      activeCell.row,
      activeCell.col,
      selRect.r1,
      selRect.r2,
      selRect.c1,
      selRect.c2,
      hasActiveFilter,
      commitActiveSheetViewSort,
      dataTables,
      homeZh,
      showProtectNotice,
      cellSortKeyAt, oneCellSortRegion, sortRangeHasHeaderRow, sortArrayCellAt, sortTextOrder, t, filterHiddenRows],
  );
  return {
    sortByActiveColumn,
  };
}
