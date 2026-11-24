"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { type SpreadsheetCell } from "@mrnote/core/web/lib/spreadsheet/cell-buttons.ts";
import { sheetWithTableColumnTotal, tableHeadersForCells } from "../../../../lib/spreadsheet/table-buttons";
import { useCallback, useMemo, type RefObject } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { toast } from "@mrnote/core/web/hooks/use-toast.ts";
import { type SheetEvaluator } from "@mrnote/core/web/lib/spreadsheet/formula-engine.ts";
import { type Slicer, filterToSlicerSelection, slicerSelectionForWebClick, slicerSelectionToFilter } from "../../../../lib/spreadsheet/slicer";
import { type TableTotalKind, tableNativeStructureBlocked, isAuthorableTableTotalFormula, tableTotalCellOwnsValue, type DataTable, type DataTableColumnFilter, tableNativeFilterCustody } from "@mrnote/core/web/lib/spreadsheet/data-table.ts";
import { type rangeHasLockedCell as rangeHasLockedCellWithProtection } from "@mrnote/core/web/lib/spreadsheet/protection.ts";
import { pivotPreservedReasonKey } from "@mrnote/core/web/lib/spreadsheet/pivot.ts";
import { spreadsheetSlicerView } from "../../../../lib/spreadsheet/slicer-view";
import { type SheetModel } from "./spreadsheetSheetModel";
import { columnLabel } from "./spreadsheetRangeA1";
import { type SheetViewMappedCellMutation, type SheetViewMappedDrawingMutation, type SheetViewMappedLineMutation, type SheetViewMappedPageMutation } from "./spreadsheetSheetViews";
import { type PivotSlicerBinding } from "../../../../lib/spreadsheet/slicer-buttons";
import { type DataTableColumn } from "@mrnote/core/web/lib/spreadsheet/data-table.ts";
import { type Dispatch, type SetStateAction } from "react";

/** What useSpreadsheetTableTotalsAndSlicers reads from SpreadsheetWindow's render scope. */
export interface SpreadsheetTableTotalsAndSlicersInputs {
  activeSheetIndex: number;
  cellDisplayValue: (cell: SpreadsheetCell | undefined, row: number, col: number, editing: boolean, numberFormatOverride?: string) => string;
  dataTables: DataTable[];
  formulaEvaluator: SheetEvaluator;
  homeZh: boolean;
  locale: string;
  rangeHasLockedCellRef: RefObject<(candidate: SheetModel, range: Parameters<typeof rangeHasLockedCellWithProtection>[1]) => boolean>;
  replaceActiveSheet: (nextSheet: SheetModel, nextTitle?: string, calculationMutation?: "content" | "coordinate", sheetViewMutation?: SheetViewMappedCellMutation | SheetViewMappedDrawingMutation | SheetViewMappedLineMutation | SheetViewMappedPageMutation, followOnOtherSheets?: (candidate: SheetModel) => SheetModel) => SheetModel[];
  resolvePivotSlicerBinding: (slicer: Slicer) => PivotSlicerBinding<SheetModel> | null;
  resolveTableSlicerBinding: (slicer: Slicer) => { table: DataTable; column: DataTableColumn; worksheetColumn: number; rowStart: number; rowEnd: number; } | null;
  setColumnFilter: (col: number, allowed: string[] | null) => void;
  setDataTableColumnFilter: (id: string, columnId: number, filter: DataTableColumnFilter | null, options?: { allowHiddenFilterButton?: boolean; }) => void;
  setPivotSlicerSelection: (slicer: Slicer, selection: readonly string[] | null) => boolean;
  setTableTotalFormulaDraft: Dispatch<SetStateAction<{ workbook: readonly SheetModel[]; activeSheetIndex: number; sheet: SheetModel; tableCollection: readonly DataTable[]; table: DataTable; tableId: string; offset: number; columnName: string; formula: string; error: string | null; } | null>>;
  sheet: SheetModel;
  sheets: SheetModel[];
  showProtectNotice: (message?: string) => void;
  slicerColumnValues: (col: number, rowStart?: number, rowEnd?: number) => string[];
  slicers: Slicer[];
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  tableTotalFormulaDraft: { workbook: readonly SheetModel[]; activeSheetIndex: number; sheet: SheetModel; tableCollection: readonly DataTable[]; table: DataTable; tableId: string; offset: number; columnName: string; formula: string; error: string | null; } | null;
  tableTotalFormulaReturnFocusRef: RefObject<HTMLElement | null>;
}

/** Moved verbatim from SpreadsheetWindow (called at the same position, so hook order is unchanged). */
export function useSpreadsheetTableTotalsAndSlicers({
  activeSheetIndex,
  cellDisplayValue,
  dataTables,
  formulaEvaluator,
  homeZh,
  rangeHasLockedCellRef,
  replaceActiveSheet,
  resolvePivotSlicerBinding,
  resolveTableSlicerBinding,
  setColumnFilter,
  setDataTableColumnFilter,
  setPivotSlicerSelection,
  setTableTotalFormulaDraft,
  sheet,
  sheets,
  showProtectNotice,
  slicerColumnValues,
  slicers,
  t,
  tableTotalFormulaDraft,
  tableTotalFormulaReturnFocusRef,
}: SpreadsheetTableTotalsAndSlicersInputs) {
  // Set one column's totals aggregation and its physical structured-reference
  // formula in the same transaction. A custom/unowned cell is never replaced.
  const setTableColumnTotal = useCallback(
    (
      id: string,
      offset: number,
      kind: TableTotalKind,
      customFormula?: string,
    ): boolean => {
      // The shared Total Row writer (lib/spreadsheet/table-buttons), which
      // the AI's spreadsheet.data.table_total command calls too.
      const result = sheetWithTableColumnTotal(sheet, id, offset, kind, customFormula, ({ row, col }) =>
        rangeHasLockedCellRef.current(sheet, { r1: row, r2: row, c1: col, c2: col }),
      );
      if ("refusal" in result) {
        if (result.refusal === "locked") showProtectNotice();
        if (result.refusal === "custom_content") {
          toast({
            variant: "destructive",
            description: t("spreadsheet.uiCopy.thisTotalsCellContainsCustomContentAndWasNot"),
          });
        }
        return false;
      }
      replaceActiveSheet(result.sheet);
      return true;
    },
    [
      replaceActiveSheet,
      sheet,
      showProtectNotice,
      toast, t],
  );

  const openTableTotalFormulaDialog = useCallback(
    (id: string, offset: number, returnFocus: HTMLElement | null): boolean => {
      const current = dataTables.find((table) => table.id === id);
      const sourceTable = sheet.dataTables?.find((table) => table.id === id);
      const headers = current
        ? tableHeadersForCells(current, sheet.cells)
        : null;
      if (
        !current?.totalsRow ||
        tableNativeStructureBlocked(current) ||
        !sourceTable ||
        !headers ||
        !sheet.dataTables ||
        !Number.isInteger(offset) ||
        offset < 0 ||
        offset >= headers.length
      ) {
        return false;
      }
      const totalsRow = current.range.r2 + 1;
      const col = current.range.c1 + offset;
      if (
        rangeHasLockedCellRef.current(sheet, {
          r1: totalsRow,
          r2: totalsRow,
          c1: col,
          c2: col,
        })
      ) {
        showProtectNotice();
        return false;
      }
      const currentValue = String(
        sheet.cells[`${totalsRow}:${col}`]?.value ?? "",
      );
      if (
        !tableTotalCellOwnsValue(
          current,
          offset,
          headers[offset],
          currentValue,
        )
      ) {
        toast({
          variant: "destructive",
          description: t("spreadsheet.uiCopy.thisTotalsCellContainsContentThatIsNotManaged"),
        });
        return false;
      }
      tableTotalFormulaReturnFocusRef.current = returnFocus;
      setTableTotalFormulaDraft({
        workbook: sheets,
        activeSheetIndex,
        sheet,
        tableCollection: sheet.dataTables,
        table: sourceTable,
        tableId: current.id,
        offset,
        columnName: headers[offset],
        formula: current.totalFormulas?.[offset] ?? "=",
        error: null,
      });
      return true;
    },
    [
      activeSheetIndex,
      dataTables,
      homeZh,
      sheet,
      sheets,
      showProtectNotice,
      toast, t],
  );

  const chooseTableColumnTotal = useCallback(
    (
      id: string,
      offset: number,
      kind: TableTotalKind,
      returnFocus: HTMLElement | null,
    ) => {
      if (kind === "custom") {
        openTableTotalFormulaDialog(id, offset, returnFocus);
        return;
      }
      setTableColumnTotal(id, offset, kind);
    },
    [openTableTotalFormulaDialog, setTableColumnTotal],
  );

  const applyTableTotalFormulaDialog = useCallback(() => {
    const draft = tableTotalFormulaDraft;
    if (!draft) return;
    const formula = draft.formula.trim();
    const liveTableCollection = sheet.dataTables;
    const liveTable = liveTableCollection?.find(
      (table) => table.id === draft.tableId,
    );
    if (
      draft.workbook !== sheets ||
      draft.activeSheetIndex !== activeSheetIndex ||
      draft.sheet !== sheet ||
      draft.tableCollection !== liveTableCollection ||
      draft.table !== liveTable ||
      !isAuthorableTableTotalFormula(formula)
    ) {
      setTableTotalFormulaDraft((current) =>
        current
          ? {
              ...current,
              error: t("spreadsheet.uiCopy.theTableChangedOrTheFormulaIsNotA"),
            }
          : null,
      );
      return;
    }
    if (
      setTableColumnTotal(draft.tableId, draft.offset, "custom", formula)
    ) {
      setTableTotalFormulaDraft(null);
      return;
    }
    setTableTotalFormulaDraft((current) =>
      current
        ? {
            ...current,
            error: t("spreadsheet.uiCopy.theTotalsCellChangedIsProtectedOrCannotBe"),
          }
        : null,
    );
  }, [
    activeSheetIndex,
    homeZh,
    setTableColumnTotal,
    sheet,
    sheets,
    tableTotalFormulaDraft, t]);

  const tableSlicerFilterUsesAnotherMode = useCallback(
    (filter: DataTableColumnFilter | undefined) =>
      Boolean(
        filter &&
          (filter.dateGroups ||
            filter.condition ||
            filter.color ||
            filter.icon ||
            filter.relativeDate),
      ),
    [],
  );

  const toggleSlicerSelection = useCallback(
    (slicer: Slicer, value: string, additive: boolean) => {
      if (slicer.source?.kind === "pivot") {
        const pivotBinding = resolvePivotSlicerBinding(slicer);
        if (!pivotBinding) return;
        const current = filterToSlicerSelection(
          pivotBinding.filterValues,
          pivotBinding.values,
        );
        setPivotSlicerSelection(
          slicer,
          slicerSelectionForWebClick(
            current,
            value,
            additive,
            pivotBinding.values,
          ),
        );
        return;
      }
      const binding = resolveTableSlicerBinding(slicer);
      if (slicer.source?.kind === "table") {
        if (
          !binding ||
          !binding.table.headerRow ||
          binding.table.nativeResizeBlocker
        ) {
          return;
        }
        const currentFilter =
          binding.table.columnFilters?.[String(binding.column.id)];
        if (tableSlicerFilterUsesAnotherMode(currentFilter)) return;
        const allValues = slicerColumnValues(
          binding.worksheetColumn,
          binding.rowStart,
          binding.rowEnd,
        );
        const current = filterToSlicerSelection(
          currentFilter?.values,
          allValues,
        );
        const values = slicerSelectionToFilter(
          slicerSelectionForWebClick(current, value, additive, allValues),
          allValues,
        );
        setDataTableColumnFilter(
          binding.table.id,
          binding.column.id,
          values === null ? null : { values },
          { allowHiddenFilterButton: true },
        );
        return;
      }
      const allValues = slicerColumnValues(slicer.column);
      const current = filterToSlicerSelection(
        sheet.filters?.[String(slicer.column)],
        allValues,
      );
      const nextSelection = slicerSelectionForWebClick(
        current,
        value,
        additive,
        allValues,
      );
      setColumnFilter(
        slicer.column,
        slicerSelectionToFilter(nextSelection, allValues),
      );
    },
    [
      resolvePivotSlicerBinding,
      resolveTableSlicerBinding,
      setColumnFilter,
      setDataTableColumnFilter,
      setPivotSlicerSelection,
      sheet.filters,
      slicerColumnValues,
      tableSlicerFilterUsesAnotherMode,
    ],
  );

  const clearSlicerSelection = useCallback(
    (slicer: Slicer) => {
      if (slicer.source?.kind === "pivot") {
        const pivotBinding = resolvePivotSlicerBinding(slicer);
        if (!pivotBinding?.filterValues?.length) return;
        setPivotSlicerSelection(slicer, null);
        return;
      }
      const binding = resolveTableSlicerBinding(slicer);
      if (slicer.source?.kind === "table") {
        if (
          !binding ||
          !binding.table.headerRow ||
          binding.table.nativeResizeBlocker
        ) {
          return;
        }
        const currentFilter =
          binding.table.columnFilters?.[String(binding.column.id)];
        if (
          !currentFilter ||
          tableSlicerFilterUsesAnotherMode(currentFilter)
        ) {
          return;
        }
        setDataTableColumnFilter(
          binding.table.id,
          binding.column.id,
          null,
          { allowHiddenFilterButton: true },
        );
        return;
      }
      if (!sheet.filters?.[String(slicer.column)]) return;
      setColumnFilter(slicer.column, null);
    },
    [
      resolvePivotSlicerBinding,
      resolveTableSlicerBinding,
      setColumnFilter,
      setDataTableColumnFilter,
      setPivotSlicerSelection,
      sheet.filters,
      tableSlicerFilterUsesAnotherMode,
    ],
  );

  // Per-slicer render model resolves stable Table identity first. Only legacy
  // source-less panels enumerate/filter the whole worksheet column.
  const slicerViews = useMemo(
    () =>
      slicers.map((slicer) => {
        // What the slicer shows is the shared answer the printout reads too
        // (lib/spreadsheet/slicer-view); why it cannot be used is the grid's.
        const shown = spreadsheetSlicerView(slicer, {
          dataTables,
          filters: sheet.filters,
          rowCount: sheet.rowCount,
          shown: (row, col) => cellDisplayValue(sheet.cells[`${row}:${col}`], row, col, false),
          pivot: (candidate) => resolvePivotSlicerBinding(candidate),
          columnLabel,
        });
        const view = {
          slicer,
          title: shown.title,
          values: [...shown.values],
          selected: new Set(shown.selected),
          ...(shown.unbound ? {} : { filtered: shown.filtered }),
        };
        if (shown.unbound === "table") {
          return { ...view, disabledReason: t("spreadsheet.uiCopy.theTableFieldConnectedToThisSlicerIsNo") };
        }
        if (shown.unbound === "pivot") {
          return { ...view, disabledReason: t("spreadsheet.uiCopy.thePivotTableFieldConnectedToThisSlicerIsGone") };
        }
        if (slicer.source?.kind === "table") {
          const binding = resolveTableSlicerBinding(slicer);
          const filter = binding?.table.columnFilters?.[String(binding.column.id)];
          const disabledReason = !binding
            ? undefined
            : !binding.table.headerRow
              ? t("spreadsheet.uiCopy.showTheTableHeaderRowBeforeUsingThisSlicer")
              : binding.table.nativeResizeBlocker
                ? tableNativeFilterCustody(binding.table)
                  ? t("spreadsheet.uiCopy.thisTableContainsNativeFilterMetadataThatCannotBe")
                  : t("spreadsheet.uiCopy.thisImportedTableContainsNativeDataThatCannotBe")
                : tableSlicerFilterUsesAnotherMode(filter)
                  ? t("spreadsheet.uiCopy.thisFieldUsesAnotherFilterModeClearThatFilter")
                  : undefined;
          return { ...view, disabledReason };
        }
        if (slicer.source?.kind === "pivot") {
          const pivotBinding = resolvePivotSlicerBinding(slicer);
          // A connected PivotTable kept as it came in cannot take the
          // filter; the slicer says why.
          const kept = pivotBinding?.targets.find(
            (target) => target.pivot.native?.disposition === "preserve-only",
          );
          return { ...view, disabledReason: kept ? t(pivotPreservedReasonKey(kept.pivot.native?.blocker)) : undefined };
        }
        return { ...view, disabledReason: undefined };
      }),
    // cellDisplayValue derives from sheet.cells via the evaluator.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      dataTables,
      formulaEvaluator,
      homeZh,
      resolvePivotSlicerBinding,
      resolveTableSlicerBinding,
      sheet.cells,
      sheet.filters,
      sheet.rowCount,
      slicers,
      tableSlicerFilterUsesAnotherMode, t],
  );
  return {
    applyTableTotalFormulaDialog,
    chooseTableColumnTotal,
    clearSlicerSelection,
    slicerViews,
    toggleSlicerSelection,
  };
}
