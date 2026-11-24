"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { yieldCalculationTask } from "@mrnote/core/web/lib/spreadsheet/background-calculation-protocol.ts";
import { useSpreadsheetBackgroundCalculation } from "./useSpreadsheetBackgroundCalculation";
import { type CellMap } from "@mrnote/core/web/lib/spreadsheet/cell-buttons.ts";
import { type RowSortRequest, rowMoveTouchesArray, rowSortSpan, rowSortLevels, rowSortStateFor, rowSortedSheet, remapRowSortMergesFailClosed, sourceOrderAmongVisibleRows, type SortArrayCellAt } from "../../../../lib/spreadsheet/sort-buttons";
import { coordinateMapTouchesColumnRange } from "../../../../lib/spreadsheet/table-buttons";
import { useCallback, type RefObject } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { type SpreadsheetSortDialogFormatOption, type SpreadsheetSortDialogLevel, type SpreadsheetSortMethod } from "./SpreadsheetSortDialog";
import { rangeHasMerge } from "@mrnote/core/web/lib/spreadsheet/merge-cells.ts";
import { type MacroStep } from "../../../../lib/spreadsheet/macros";
import { type Slicer } from "../../../../lib/spreadsheet/slicer";
import { isDataTableIconSetName, type DataTableSortCondition, type DataTable } from "@mrnote/core/web/lib/spreadsheet/data-table.ts";
import { type canSortRange as canSortRangeWithProtection } from "@mrnote/core/web/lib/spreadsheet/protection.ts";
import { relocateSortedCell } from "../../../../lib/spreadsheet/sort";
import { type SortLevel, type SortDisplayKeyCell, sortedColumnOrder, sortedSourceOrder } from "../../../../lib/spreadsheet/multi-sort";
import { type SortFilterRow } from "../../../../lib/spreadsheet/sort-filter";
import { parseA1Range } from "@mrnote/core/web/lib/spreadsheet/print-settings.ts";
import { defaultNamedSheetViewRef, type SheetViewSortKeyInput } from "../../../../lib/spreadsheet/sheet-views";
import { type SheetModel } from "./spreadsheetSheetModel";
import { type SheetViewScopedAction, type SheetViewMappedCellMutation, type SheetViewMappedDrawingMutation, type SheetViewMappedLineMutation, type SheetViewMappedPageMutation, type SheetViewSession } from "./spreadsheetSheetViews";
import { type Dispatch, type SetStateAction } from "react";

/** What useSpreadsheetRunSort reads from SpreadsheetWindow's render scope. */
export interface SpreadsheetRunSortInputs {
  askSheetViewScopeRef: RefObject<(action: SheetViewScopedAction) => boolean>;
  backgroundCalculation: ReturnType<typeof useSpreadsheetBackgroundCalculation>;
  canSortRangeRef: RefObject<(candidate: SheetModel, range: Parameters<typeof canSortRangeWithProtection>[1]) => boolean>;
  commitActiveSheetViewSort: (conditions: ReadonlyArray<SheetViewSortKeyInput>, options?: { caseSensitive?: boolean; sortMethod?: "pinYin" | "stroke"; }, range?: { r1: number; c1: number; r2: number; c2: number }) => boolean | null;
  dataDialogWriteAllowedRef: RefObject<boolean>;
  dataTables: DataTable[];
  deferComputedActionRef: RefObject<(name: string, args?: unknown[]) => boolean>;
  liveSheetsRef: RefObject<SheetModel[]>;
  locale: string;
  macroAnchorRef: RefObject<{ row: number; col: number; }>;
  macroExplicitStepRef: RefObject<MacroStep | null>;
  macroRecordingRef: RefObject<boolean>;
  

  rowsSortKeepsInPlace: ReadonlySet<number>;
  

  colsSortKeepsInPlace: ReadonlySet<number>;
  replaceActiveSheet: (nextSheet: SheetModel, nextTitle?: string, calculationMutation?: "content" | "coordinate", sheetViewMutation?: SheetViewMappedCellMutation | SheetViewMappedDrawingMutation | SheetViewMappedLineMutation | SheetViewMappedPageMutation, followOnOtherSheets?: (candidate: SheetModel) => SheetModel) => SheetModel[];
  setBackgroundPlanBusy: Dispatch<SetStateAction<boolean>>;
  setSortDialogOpen: Dispatch<SetStateAction<boolean>>;
  setSortDialogStatus: Dispatch<SetStateAction<{ kind: "success" | "error"; text: string; } | null>>;
  sheet: SheetModel;
  sheets: SheetModel[];
  sheetViewSessionRef: RefObject<SheetViewSession | null>;
  showProtectNotice: (message?: string) => void;
  slicers: Slicer[];
  sortDataTableRef: RefObject<((id: string, conditions: readonly DataTableSortCondition[]) => Promise<void>) | null>;
  sortDialogAuthority: { readonly sheetId: string; readonly range: { readonly r1: number; readonly c1: number; readonly r2: number; readonly c2: number; }; readonly currentRegion?: true; } | null;
  sortDialogCaseSensitive: boolean;
  sortDialogCoordinateBlockedLabel: string;
  sortDialogCustomLists: (readonly string[])[];
  sortDialogFormatOptions: SpreadsheetSortDialogFormatOption[][];
  sortDialogGrammarInvalidRef: RefObject<boolean>;
  sortDialogHasHeader: boolean;
  sortDialogInvalidOptionLabel: string;
  sortDialogLevels: SpreadsheetSortDialogLevel[];
  sortDialogMethod: SpreadsheetSortMethod;
  sortDialogOrientation: "rows" | "columns";
  sortDisplayCellAt: (row: number, col: number) => SortDisplayKeyCell;
  /** The cells of the sheet's dynamic arrays: a sort refuses to move them (B522). */
  sortArrayCellAt: SortArrayCellAt;
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
}

/** Moved verbatim from SpreadsheetWindow (called at the same position, so hook order is unchanged). */
export function useSpreadsheetRunSort({
  askSheetViewScopeRef,
  backgroundCalculation,
  canSortRangeRef,
  commitActiveSheetViewSort,
  dataDialogWriteAllowedRef,
  dataTables,
  deferComputedActionRef,
  liveSheetsRef,
  locale,
  macroAnchorRef,
  macroExplicitStepRef,
  macroRecordingRef,
  replaceActiveSheet,
  rowsSortKeepsInPlace,
  colsSortKeepsInPlace,
  setBackgroundPlanBusy,
  setSortDialogOpen,
  setSortDialogStatus,
  sheet,
  sheets,
  sheetViewSessionRef,
  showProtectNotice,
  slicers,
  sortDataTableRef,
  sortDialogAuthority,
  sortDialogCaseSensitive,
  sortDialogCoordinateBlockedLabel,
  sortDialogCustomLists,
  sortDialogFormatOptions,
  sortDialogGrammarInvalidRef,
  sortDialogHasHeader,
  sortDialogInvalidOptionLabel,
  sortDialogLevels,
  sortDialogMethod,
  sortDialogOrientation,
  sortDisplayCellAt,
  sortArrayCellAt,
  t,
}: SpreadsheetRunSortInputs) {
  // Multi-level Sort (Excel/WPS "Data > Sort"): order the selected range's rows by
  // the stacked sort levels (sort by col A, then col B, then col C), each level
  // with its own ascending/descending direction, optionally case-sensitive, with a
  // pinned header row. Reuses the pure multi-sort helper (sortedSourceOrder) for the
  // STABLE multi-key ordering, then permutes whole source rows exactly like the
  // single-key span sort (sortByActiveColumn): full cell objects travel so styles /
  // comments / number formats follow their row, merges are remapped through the same
  // permutation, and the affected span is cleared-then-rewritten through
  // replaceActiveSheet (undo + autosave + sheet-protection). Formula cells rebase
  // relative references through the same relocation helper as single-key sort.
  const runSort = useCallback(async () => {
    if (deferComputedActionRef.current("runSort")) return;
    if (askSheetViewScopeRef.current({ kind: "sortDialog" })) return;
    const authority = sortDialogAuthority;
    if (
      authority === null ||
      authority.sheetId !== sheet.id ||
      !Number.isInteger(authority.range.r1) ||
      !Number.isInteger(authority.range.r2) ||
      !Number.isInteger(authority.range.c1) ||
      !Number.isInteger(authority.range.c2) ||
      authority.range.r1 < 0 ||
      authority.range.r2 < authority.range.r1 ||
      authority.range.r2 >= sheet.rowCount ||
      authority.range.c1 < 0 ||
      authority.range.c2 < authority.range.c1 ||
      authority.range.c2 >= sheet.columnCount
    ) {
      setSortDialogStatus({
        kind: "error",
        text: t("spreadsheet.sortDialogNoData"),
      });
      return;
    }
    if (sortDialogLevels.length === 0) {
      setSortDialogStatus({
        kind: "error",
        text: t("spreadsheet.sortDialogNoLevels"),
      });
      return;
    }
    const { r1, r2, c1, c2 } = authority.range;
    // A recording keeps the sort as a sort, with its levels and options.
    const recordDialogSort = () => {
      if (!macroRecordingRef.current) return;
      const anchor = macroAnchorRef.current;
      const keyBase = sortDialogOrientation === "columns" ? anchor.row : anchor.col;
      macroExplicitStepRef.current = {
        kind: "sort",
        dRow: r1 - anchor.row,
        dCol: c1 - anchor.col,
        rows: r2 - r1 + 1,
        cols: c2 - c1 + 1,
        orientation: sortDialogOrientation,
        hasHeader: sortDialogHasHeader,
        caseSensitive: sortDialogCaseSensitive,
        ...(authority.currentRegion ? { currentRegion: true } : {}),
        levels: sortDialogLevels.map((level) => {
          const customList =
            level.customListIndex !== undefined
              ? sortDialogCustomLists[level.customListIndex]
              : undefined;
          return {
            at: level.column - keyBase,
            direction: level.direction,
            ...((level.sortOn ?? "values") !== "values"
              ? { sortOn: level.sortOn, formatKey: level.formatKey, placement: level.placement }
              : {}),
            ...(customList ? { orderKeys: [...customList] } : {}),
          };
        }),
      };
    };
    // What moves with each sorted line: only the range's own cells, as Excel
    // sorts a range (rowSortSpan). A title above it, a total below it or a
    // block beside it stays put, a selection's included: the Sort Warning
    // offered any data right beside it before the dialog opened.
    const moveC1 = c1;
    const moveC2 = c2;
    const moveR1 = r1;
    const moveR2 = r2;
    const validLineMin = sortDialogOrientation === "columns" ? r1 : c1;
    const validLineMax = sortDialogOrientation === "columns" ? r2 : c2;
    const grammarValid =
      !sortDialogGrammarInvalidRef.current &&
      (sortDialogOrientation === "rows" ||
        sortDialogOrientation === "columns") &&
      typeof sortDialogHasHeader === "boolean" &&
      typeof sortDialogCaseSensitive === "boolean" &&
      sortDialogLevels.every((level, index) => {
        if (
          typeof level.id !== "string" ||
          level.id.length === 0 ||
          !Number.isInteger(level.column) ||
          level.column < validLineMin ||
          level.column > validLineMax ||
          (level.direction !== "asc" && level.direction !== "desc")
        ) {
          return false;
        }
        const sortOn = level.sortOn ?? "values";
        if (sortOn !== "values") {
          return (
            (sortOn === "cellColor" ||
              sortOn === "fontColor" ||
              sortOn === "icon") &&
            level.customListIndex === undefined &&
            typeof level.formatKey === "string" &&
            level.formatKey.length > 0 &&
            level.formatKey.length <= 128 &&
            (level.placement === "first" || level.placement === "last") &&
            Boolean(
              sortDialogFormatOptions[index]?.some(
                (option) =>
                  option.kind === sortOn && option.key === level.formatKey,
              ),
            )
          );
        }
        if (level.formatKey !== undefined || level.placement !== undefined) {
          return false;
        }
        if (level.customListIndex === undefined) return true;
        const list = sortDialogCustomLists[level.customListIndex];
        return (
          Number.isSafeInteger(level.customListIndex) &&
          level.customListIndex >= 0 &&
          Array.isArray(list) &&
          list.length > 0
        );
      });
    if (!grammarValid) {
      setSortDialogStatus({
        kind: "error",
        text: sortDialogInvalidOptionLabel,
      });
      return;
    }

    const activeSheetViewSortSession = sheetViewSessionRef.current;
    if (
      activeSheetViewSortSession?.sheetId === sheet.id
    ) {
      const viewRef =
        activeSheetViewSortSession.ref ?? defaultNamedSheetViewRef(sheet);
      const viewRange = parseA1Range(viewRef.replace(/\$/g, ""));
      // A view's sortRules sort its AutoFilter range (or a Table) top to
      // bottom under the header row; the dialog's range must lie inside it.
      const table = dataTables.find(
        (candidate) =>
          candidate.headerRow &&
          r1 >= candidate.range.r1 &&
          r2 <= candidate.range.r2 &&
          c1 >= candidate.range.c1 &&
          c2 <= candidate.range.c2,
      );
      const insideView =
        viewRange &&
        r1 >= viewRange.r1 &&
        r2 <= viewRange.r2 &&
        c1 >= viewRange.c1 &&
        c2 <= viewRange.c2;
      if (
        sortDialogOrientation !== "rows" ||
        !sortDialogHasHeader ||
        (!table && !insideView)
      ) {
        setSortDialogStatus({
          kind: "error",
          text: t("spreadsheet.uiCopy.sheetViewsSortTheWholeFilterRange"),
        });
        return;
      }
      const keys: SheetViewSortKeyInput[] = [];
      for (const level of sortDialogLevels) {
        const sortOn = level.sortOn ?? "values";
        if (sortOn === "values") {
          const list =
            level.customListIndex === undefined
              ? undefined
              : sortDialogCustomLists[level.customListIndex];
          keys.push({
            column: level.column,
            ...(level.direction === "desc" ? { descending: true } : {}),
            ...(list ? { customList: list } : {}),
          });
          continue;
        }
        const onBottom = level.placement === "last";
        if (sortOn === "icon") {
          const [iconSet, rawIndex] = (level.formatKey ?? "").split(":");
          const iconId = Number(rawIndex);
          if (!isDataTableIconSetName(iconSet) || !Number.isInteger(iconId)) {
            setSortDialogStatus({
              kind: "error",
              text: t("spreadsheet.uiCopy.sheetViewsSortByStandardIconSetsOnly"),
            });
            return;
          }
          keys.push({
            column: level.column,
            sortBy: "icon",
            icon: { iconSet, iconId },
            ...(onBottom ? { descending: true } : {}),
          });
          continue;
        }
        keys.push({
          column: level.column,
          sortBy: sortOn,
          color: level.formatKey ?? "",
          ...(onBottom ? { descending: true } : {}),
        });
      }
      let handled: boolean | null;
      if (table) {
        // A Table's own sort keys carry no custom list or case setting.
        const conditions: DataTableSortCondition[] = [];
        for (const key of keys) {
          const columnId = table.columns?.[key.column - table.range.c1]?.id;
          if (
            columnId === undefined ||
            key.customList ||
            sortDialogCaseSensitive ||
            sortDialogMethod === "stroke"
          ) {
            setSortDialogStatus({
              kind: "error",
              text: t("spreadsheet.uiCopy.sheetViewTableSortsUseValuesColorsOrIcons"),
            });
            return;
          }
          conditions.push({
            columnId,
            ...(key.descending ? { descending: true } : {}),
            ...(key.sortBy === "cellColor" || key.sortBy === "fontColor"
              ? {
                  color: {
                    kind: key.sortBy === "cellColor" ? ("cell" as const) : ("font" as const),
                    value: key.color ?? "",
                  },
                }
              : {}),
            ...(key.sortBy === "icon" && key.icon ? { icon: key.icon } : {}),
          });
        }
        await sortDataTableRef.current?.(table.id, conditions);
        handled = true;
      } else {
        handled = commitActiveSheetViewSort(keys, {
          caseSensitive: sortDialogCaseSensitive,
          ...(sortDialogMethod === "stroke"
            ? { sortMethod: "stroke" as const }
            : {}),
        }, { r1, r2, c1, c2 });
      }
      if (handled) {
        setSortDialogStatus({
          kind: "success",
          text: t("spreadsheet.sortDialogDone", {
            rows: Math.max(0, r2 - r1),
            levels: sortDialogLevels.length,
          }),
        });
        setSortDialogOpen(false);
      }
      return;
    }

    // ── Left-to-right (sort by row) orientation ──────────────────────────────
    // Permute COLUMNS within the span by a key ROW. Formula cells rebase their
    // relative column references; merges in the affected span are refused (a
    // column permutation cannot safely retain a merge rectangle).
    if (sortDialogOrientation === "columns") {
      // The first column is pinned (when "has headers" is on) and excluded.
      const dataC1 = sortDialogHasHeader ? c1 + 1 : c1;
      if (dataC1 > c2) {
        setSortDialogStatus({
          kind: "error",
          text: t("spreadsheet.sortDialogNoData"),
        });
        return;
      }
      const hasCoordinateBoundFeature =
        coordinateMapTouchesColumnRange(
          sheet.filters,
          dataC1,
          c2,
          sheet.columnCount,
        ) ||
        coordinateMapTouchesColumnRange(
          sheet.colorFilters,
          dataC1,
          c2,
          sheet.columnCount,
        ) ||
        coordinateMapTouchesColumnRange(
          sheet.conditionFilters,
          dataC1,
          c2,
          sheet.columnCount,
        ) ||
        slicers.some(
          (slicer) => slicer.column >= dataC1 && slicer.column <= c2,
        ) ||
        dataTables.some(
          (table) => table.range.c1 <= c2 && table.range.c2 >= dataC1,
        );
      if (hasCoordinateBoundFeature) {
        setSortDialogStatus({
          kind: "error",
          text: sortDialogCoordinateBlockedLabel,
        });
        return;
      }
      // Refuse when any merge overlaps the affected column span (full height) —
      // a column reorder would tear it apart and there is no column-permutation
      // merge remap.
      if (
        sheet.merges &&
        sheet.merges.length > 0 &&
        rangeHasMerge(sheet.merges, {
          r1: moveR1,
          r2: moveR2,
          c1: dataC1,
          c2,
        })
      ) {
        setSortDialogStatus({
          kind: "error",
          text: t("spreadsheet.sortDialogHasMerge"),
        });
        return;
      }
      // The levels' `column` field is a key ROW (absolute) → translate to a row
      // OFFSET within the selection so it indexes the per-column extracted array.
      // A level carrying a customListIndex maps to that saved custom list's
      // ordered keys (Excel "Order ▸ Custom List"). Grammar and list authority
      // were authenticated above, so no clamp/fallback can change user intent.
      const levels: SortLevel[] = sortDialogLevels.map((lvl) => ({
        column: lvl.column - r1,
        direction: lvl.direction,
        sortOn: lvl.sortOn ?? "values",
        caseSensitive: sortDialogCaseSensitive,
        locale,
        ...(sortDialogMethod === "stroke" ? { method: "stroke" as const } : {}),
        ...((lvl.sortOn ?? "values") === "values" &&
        lvl.customListIndex !== undefined &&
        sortDialogCustomLists[lvl.customListIndex]
          ? { orderKeys: sortDialogCustomLists[lvl.customListIndex] }
          : {}),
        ...((lvl.sortOn ?? "values") !== "values"
          ? { formatKey: lvl.formatKey, placement: lvl.placement }
          : {}),
      }));
      // Each unit is a COLUMN: its resolved key values indexed by row offset.
      const keyColumns: SortFilterRow[] = [];
      const sourceCols: number[] = [];
      // Hidden columns keep their places (Microsoft Support: hidden columns are
      
      for (let c = dataC1; c <= c2; c += 1) {
        if (colsSortKeepsInPlace.has(c)) continue;
        const cellsCol: SortDisplayKeyCell[] = [];
        for (let r = r1; r <= r2; r += 1) {
          cellsCol.push(sortDisplayCellAt(r, c));
        }
        keyColumns.push(cellsCol);
        sourceCols.push(c);
      }
      const visibleColOrder = sortedColumnOrder(keyColumns, sourceCols, levels);
      const colOrder = sourceOrderAmongVisibleRows(dataC1, c2, colsSortKeepsInPlace, () => visibleColOrder);
      if (colOrder.every((source, offset) => source === dataC1 + offset)) {
        if (sheet.sortState !== undefined) {
          const nextSheet = { ...sheet };
          delete nextSheet.sortState;
          recordDialogSort();
          replaceActiveSheet(nextSheet);
        }
        setSortDialogStatus({
          kind: "success",
          text: t("spreadsheet.sortDialogDoneCols", {
            cols: colOrder.length,
            levels: levels.length,
          }),
        });
        setSortDialogOpen(false);
        return;
      }
      // Protected-sheet sorting needs native Allow Sort and every cell in the
      // affected column span (full height) must remain unlocked.
      if (
        !canSortRangeRef.current(sheet, {
          r1: moveR1,
          r2: moveR2,
          c1: dataC1,
          c2,
        })
      ) {
        showProtectNotice();
        return;
      }
      // Whole-COLUMN rewrite within [dataC1, c2] (full height): clear then place.
      const nextCellsCol: CellMap = { ...sheet.cells };
      for (let c = dataC1; c <= c2; c += 1) {
        for (let r = moveR1; r <= moveR2; r += 1) {
          delete nextCellsCol[`${r}:${c}`];
        }
      }
      colOrder.forEach((srcCol, offset) => {
        const destCol = dataC1 + offset;
        for (let r = moveR1; r <= moveR2; r += 1) {
          const cell = sheet.cells[`${r}:${srcCol}`];
          if (cell !== undefined) {
            nextCellsCol[`${r}:${destCol}`] = relocateSortedCell(
              cell,
              0,
              destCol - srcCol,
            );
          }
        }
      });
      const nextSheet = { ...sheet, cells: nextCellsCol };
      delete nextSheet.sortState;
      recordDialogSort();
          replaceActiveSheet(nextSheet, undefined, "coordinate");
      setSortDialogStatus({
        kind: "success",
        text: t("spreadsheet.sortDialogDoneCols", {
          cols: colOrder.length,
          levels: levels.length,
        }),
      });
      setSortDialogOpen(false);
      return;
    }
    // A header row (when toggled) is pinned at the top and excluded from the sort:
    // the data starts one row below, so the header is never moved or compared.
    const rowSortRequest: RowSortRequest = {
      range: authority.range,
      hasHeader: sortDialogHasHeader,
      currentRegion: Boolean(authority.currentRegion),
      caseSensitive: sortDialogCaseSensitive,
      method: sortDialogMethod,
      locale,
      levels: sortDialogLevels,
      customLists: sortDialogCustomLists,
    };
    const span = rowSortSpan(sheet, rowSortRequest);
    if (!span) {
      setSortDialogStatus({
        kind: "error",
        text: t("spreadsheet.sortDialogNoData"),
      });
      return;
    }
    const { dataR1 } = span;
    // Translate the UI levels (absolute columns) into key OFFSETS within the
    // selection so they index the extracted per-row arrays (offset 0 = first
    // selected column), carrying each level's direction + the shared case flag.
    // Grammar and list authority were authenticated above, so the offset
    // and custom list are exact rather than clamped or silently downgraded.
    const levels: SortLevel[] = rowSortLevels(rowSortRequest);
    // Build the pure key rows from the RESOLVED display values (so the order
    // matches what the user sees / what AutoFilter compares), paired with their
    // source row index so whole source rows can be permuted afterwards.
    // Hidden rows keep their places: only the visible rows are keyed and
    // sorted, into the visible places (Microsoft Support, "Sort data in a
    
    const keyRows: SortFilterRow[] = [];
    const sourceRows: number[] = [];
    for (let r = dataR1; r <= r2; r += 1) {
      if (rowsSortKeepsInPlace.has(r)) continue;
      const cellsRow: SortDisplayKeyCell[] = [];
      for (let c = c1; c <= c2; c += 1) {
        cellsRow.push(sortDisplayCellAt(r, c));
      }
      keyRows.push(cellsRow);
      sourceRows.push(r);
      if (r2 - dataR1 >= 1_000 && (r - dataR1) % 128 === 127) {
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
        if (result.plan.kind !== "rows" || sheets !== liveSheetsRef.current || !dataDialogWriteAllowedRef.current || !canSortRangeRef.current(sheet, authority.range)) return;
        visibleOrder = result.plan.sourceOrder;
      } catch { return; } finally { setBackgroundPlanBusy(false); }
    } else visibleOrder = sortedSourceOrder(keyRows, sourceRows, levels);
    const sourceOrder = sourceOrderAmongVisibleRows(dataR1, r2, rowsSortKeepsInPlace, () => [...visibleOrder]);
    const nextSortState = rowSortStateFor(rowSortRequest, span);
    // Rows already in order only record (or drop) the sortState.
    if (sourceOrder.every((source, offset) => source === dataR1 + offset)) {
      const recorded = rowSortedSheet(sheet, { dataR1, c1: moveC1, c2: moveC2 }, sourceOrder, nextSortState);
      if (recorded && recorded !== "merge" && recorded !== "array" && recorded !== "table") {
        recordDialogSort();
        replaceActiveSheet(recorded);
      }
      setSortDialogStatus({
        kind: "success",
        text: t("spreadsheet.sortDialogDone", {
          rows: sourceOrder.length,
          levels: levels.length,
        }),
      });
      setSortDialogOpen(false);
      return;
    }
    if (remapRowSortMergesFailClosed(sheet.merges, dataR1, sourceOrder, { c1: moveC1, c2: moveC2 }) === null) {
      // A top-to-bottom sort: the left-to-right wording is the other branch's.
      setSortDialogStatus({
        kind: "error",
        text: t("spreadsheet.uiCopy.canTSortBecauseMergedCellsWouldBeSplit"),
      });
      return;
    }
    // A row that moves would carry part of a dynamic array (B522): refused
    // before anything is written, and the dialog stays up to say why.
    if (rowMoveTouchesArray(sortArrayCellAt, dataR1, sourceOrder, moveC1, moveC2)) {
      setSortDialogStatus({
        kind: "error",
        text: t("spreadsheet.uiCopy.cantChangePartOfArray"),
      });
      return;
    }
    // Protected-sheet sorting needs native Allow Sort and every cell in the
    // affected data span (the range's columns moveC1..moveC2) must remain
    // unlocked.
    if (
      !canSortRangeRef.current(sheet, {
        r1: dataR1,
        r2,
        c1: moveC1,
        c2: moveC2,
      })
    ) {
      showProtectNotice();
      return;
    }
    // Whole-row rewrite within [dataR1, r2] (sort-buttons): the header row and
    // everything outside the span are untouched; merges follow the same
    // permutation.
    const next = rowSortedSheet(sheet, { dataR1, c1: moveC1, c2: moveC2 }, sourceOrder, nextSortState, sortArrayCellAt);
    // Part of a table would move: Excel sorts a table's cells only inside
    // its body, and the dialog stays up to say why.
    if (next === "table") {
      setSortDialogStatus({ kind: "error", text: t("spreadsheet.cellShiftRefusedTable") });
      return;
    }
    if (!next || next === "merge" || next === "array") return;
    recordDialogSort();
          replaceActiveSheet(next, undefined, "coordinate");
    setSortDialogStatus({
      kind: "success",
      text: t("spreadsheet.sortDialogDone", {
        rows: sourceOrder.length,
        levels: levels.length,
      }),
    });
    // Excel's Sort dialog closes on OK; it stays up only to show why a sort
    // was refused.
    setSortDialogOpen(false);
    // cellDisplayValue derives from sheet.cells via formulaEvaluator (sheet is a
    // dependency), so the callback recomputes when the cell map changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    rowsSortKeepsInPlace,
    colsSortKeepsInPlace,
    sheet,
    sortDialogAuthority,
    sortDialogFormatOptions,
    sortDialogLevels,
    sortDialogHasHeader,
    sortDialogCaseSensitive,
    sortDialogMethod,
    sortDialogOrientation,
    sortDialogCustomLists,
    sortDialogInvalidOptionLabel,
    locale,
    sortDialogCoordinateBlockedLabel,
    slicers,
    dataTables,
    commitActiveSheetViewSort,
    replaceActiveSheet,
    showProtectNotice,
    sortDisplayCellAt,
    sortArrayCellAt,
    t,
  ]);
  return {
    runSort,
  };
}
