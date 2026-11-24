"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { yieldCalculationTask } from "@mrnote/core/web/lib/spreadsheet/background-calculation-protocol.ts";
import { useSpreadsheetBackgroundCalculation } from "./useSpreadsheetBackgroundCalculation";
import { type CellMap } from "@mrnote/core/web/lib/spreadsheet/cell-buttons.ts";
import { useCallback, type RefObject } from "react";
import { type MergeSpan } from "@mrnote/core/web/lib/spreadsheet/merge-cells.ts";
import { type DataTableSortCondition, type DataTableColumnFilter, type DataTableSortState, type DataTable } from "@mrnote/core/web/lib/spreadsheet/data-table.ts";
import { type canSortRange as canSortRangeWithProtection } from "@mrnote/core/web/lib/spreadsheet/protection.ts";
import { relocateSortedCell } from "../../../../lib/spreadsheet/sort";
import { sourceOrderAmongVisibleRows } from "../../../../lib/spreadsheet/sort-buttons";
import { type SortLevel, type SortDisplayKeyCell, sortedSourceOrder } from "../../../../lib/spreadsheet/multi-sort";
import { type SortFilterRow } from "../../../../lib/spreadsheet/sort-filter";
import { iconSetCount } from "@mrnote/core/web/lib/spreadsheet/conditional-format.ts";
import { type SheetModel } from "./spreadsheetSheetModel";
import { type SheetViewScopedAction, type SheetViewMappedCellMutation, type SheetViewMappedDrawingMutation, type SheetViewMappedLineMutation, type SheetViewMappedPageMutation } from "./spreadsheetSheetViews";
import { type Dispatch, type SetStateAction } from "react";

/** What useSpreadsheetSortDataTable reads from SpreadsheetWindow's render scope. */
export interface SpreadsheetSortDataTableInputs {
  askSheetViewScopeRef: RefObject<(action: SheetViewScopedAction) => boolean>;
  backgroundCalculation: ReturnType<typeof useSpreadsheetBackgroundCalculation>;
  canSortRangeRef: RefObject<(candidate: SheetModel, range: Parameters<typeof canSortRangeWithProtection>[1]) => boolean>;
  commitActiveSheetViewTable: (tableId: string, change: { columnFilters?: Record<string, DataTableColumnFilter> | null; sortState?: DataTableSortState | null; }) => boolean | null;
  dataDialogWriteAllowedRef: RefObject<boolean>;
  dataTables: DataTable[];
  deferComputedActionRef: RefObject<(name: string, args?: unknown[]) => boolean>;
  liveSheetsRef: RefObject<SheetModel[]>;
  mergeSpans: MergeSpan[];
   
  rowsSortKeepsInPlace: ReadonlySet<number>;
  replaceActiveSheet: (nextSheet: SheetModel, nextTitle?: string, calculationMutation?: "content" | "coordinate", sheetViewMutation?: SheetViewMappedCellMutation | SheetViewMappedDrawingMutation | SheetViewMappedLineMutation | SheetViewMappedPageMutation, followOnOtherSheets?: (candidate: SheetModel) => SheetModel) => SheetModel[];
  setBackgroundPlanBusy: Dispatch<SetStateAction<boolean>>;
  sheet: SheetModel;
  sheets: SheetModel[];
  showProtectNotice: (message?: string) => void;
  sortDisplayCellAt: (row: number, col: number) => SortDisplayKeyCell;
}

/** Moved verbatim from SpreadsheetWindow (called at the same position, so hook order is unchanged). */
export function useSpreadsheetSortDataTable({
  askSheetViewScopeRef,
  backgroundCalculation,
  canSortRangeRef,
  commitActiveSheetViewTable,
  dataDialogWriteAllowedRef,
  dataTables,
  deferComputedActionRef,
  liveSheetsRef,
  mergeSpans,
  replaceActiveSheet,
  rowsSortKeepsInPlace,
  setBackgroundPlanBusy,
  sheet,
  sheets,
  showProtectNotice,
  sortDisplayCellAt,
}: SpreadsheetSortDataTableInputs) {
  const sortDataTable = useCallback(
    async (id: string, conditions: readonly DataTableSortCondition[]) => {
      if (deferComputedActionRef.current("sortDataTable", [id, conditions])) return;
      if (
        askSheetViewScopeRef.current({
          kind: "tableSort",
          tableId: id,
          conditions: [...conditions],
        })
      ) {
        return;
      }
      const table = dataTables.find((candidate) => candidate.id === id);
      if (
        !table ||
        !table.headerRow ||
        table.nativeResizeBlocker ||
        !table.columns ||
        table.columns.length !== table.range.c2 - table.range.c1 + 1 ||
        conditions.length === 0 ||
        conditions.length > 64
      ) {
        return;
      }
      const body = {
        r1: table.range.r1 + 1,
        c1: table.range.c1,
        r2: table.range.r2,
        c2: table.range.c2,
      };
      if (body.r2 < body.r1) return;
      const offsetById = new Map(
        table.columns.map((column, offset) => [column.id, offset] as const),
      );
      const seen = new Set<number>();
      const levels: SortLevel[] = [];
      const nextConditions: DataTableSortCondition[] = [];
      for (const condition of conditions) {
        const offset = offsetById.get(condition.columnId);
        if (offset === undefined || seen.has(condition.columnId)) return;
        seen.add(condition.columnId);
        levels.push({
          column: offset,
          direction: condition.descending ? "desc" : "asc",
          sortOn:
            condition.icon
              ? "icon"
              : condition.color?.kind === "cell"
              ? "cellColor"
              : condition.color?.kind === "font"
                ? "fontColor"
                : "values",
          ...(condition.icon
            ? {
                formatKey: `${condition.icon.iconSet}:${condition.icon.iconId}:${iconSetCount(condition.icon.iconSet)}`,
                // A descending color/icon condition is Excel's "On Bottom".
                placement: condition.descending ? "last" : "first",
              }
            : condition.color
            ? {
                formatKey: condition.color.value,
                placement: condition.descending ? "last" : "first",
              }
            : {}),
          caseSensitive: false,
        });
        nextConditions.push({
          columnId: condition.columnId,
          ...(condition.descending ? { descending: true } : {}),
          ...(condition.color ? { color: condition.color } : {}),
          ...(condition.icon ? { icon: condition.icon } : {}),
        });
      }
      if (
        mergeSpans.some(
          (span) =>
            span.row <= body.r2 &&
            span.row + span.rowSpan - 1 >= body.r1 &&
            span.col <= body.c2 &&
            span.col + span.colSpan - 1 >= body.c1,
        )
      ) {
        return;
      }
      if (!canSortRangeRef.current(sheet, body)) {
        showProtectNotice();
        return;
      }
      // Inside a Sheet View the Table sorts for this view alone: its keys
      // become the view's, the rows only change their display order.
      if (
        commitActiveSheetViewTable(table.id, {
          sortState: { conditions: nextConditions },
        }) !== null
      ) {
        return;
      }
      const keyRows: SortFilterRow[] = [];
      const sourceRows: number[] = [];
      // Hidden rows keep their places; the visible ones sort among
      // themselves (Microsoft Support, "Sort data in a range or table";
      
      for (let row = body.r1; row <= body.r2; row += 1) {
        if (rowsSortKeepsInPlace.has(row)) continue;
        const cells: SortDisplayKeyCell[] = [];
        for (let col = body.c1; col <= body.c2; col += 1) {
          cells.push(sortDisplayCellAt(row, col));
        }
        keyRows.push(cells);
        sourceRows.push(row);
        if (body.r2 - body.r1 >= 1_000 && (row - body.r1) % 128 === 127) {
          await yieldCalculationTask();
          if (sheets !== liveSheetsRef.current || !dataDialogWriteAllowedRef.current) return;
        }
      }
      let visibleOrder: readonly number[];
      if (sourceRows.length >= 1_000) {
        const token = backgroundCalculation.getCurrentToken();
        if (!token) return;
        setBackgroundPlanBusy(true);
        try {
          const result = await backgroundCalculation.plan({ kind: "sort", token, rows: keyRows, sourceRows, levels });
          if (result.plan.kind !== "rows" || sheets !== liveSheetsRef.current || !dataDialogWriteAllowedRef.current || !canSortRangeRef.current(sheet, body)) return;
          visibleOrder = result.plan.sourceOrder;
        } catch { return; } finally { setBackgroundPlanBusy(false); }
      } else visibleOrder = sortedSourceOrder(keyRows, sourceRows, levels);
      const sourceOrder = sourceOrderAmongVisibleRows(body.r1, body.r2, rowsSortKeepsInPlace, () => [...visibleOrder]);
      const nextSortState = { conditions: nextConditions };
      const sortStateChanged =
        JSON.stringify(table.sortState) !== JSON.stringify(nextSortState);
      const orderChanged = sourceOrder.some(
        (source, offset) => source !== body.r1 + offset,
      );
      if (!sortStateChanged && !orderChanged) return;
      const nextCells: CellMap = { ...sheet.cells };
      if (orderChanged) {
        for (let row = body.r1; row <= body.r2; row += 1) {
          for (let col = body.c1; col <= body.c2; col += 1) {
            delete nextCells[`${row}:${col}`];
          }
        }
        sourceOrder.forEach((sourceRow, offset) => {
          const destinationRow = body.r1 + offset;
          for (let col = body.c1; col <= body.c2; col += 1) {
            const cell = sheet.cells[`${sourceRow}:${col}`];
            if (cell !== undefined) {
              nextCells[`${destinationRow}:${col}`] = relocateSortedCell(
                cell,
                destinationRow - sourceRow,
                0,
              );
            }
          }
        });
      }
      replaceActiveSheet(
        {
          ...sheet,
          cells: nextCells,
          dataTables: dataTables.map((candidate) =>
            candidate.id === table.id
              ? { ...candidate, sortState: nextSortState }
              : candidate,
          ),
        },
        undefined,
        "coordinate",
      );
    },
    [
      commitActiveSheetViewTable,
      dataTables,
      mergeSpans,
      replaceActiveSheet,
      rowsSortKeepsInPlace,
      sheet,
      showProtectNotice,
      sortDisplayCellAt,
    ],
  );
  return {
    sortDataTable,
  };
}
