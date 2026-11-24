"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { pivotSlicersAdded, tableSlicerColumns, tableSlicersAdded } from "../../../../lib/spreadsheet/slicer-buttons";
import { type RefObject } from "react";
import { spreadsheetTableNameWriterReceiptMatches, spreadsheetTableAltTextWriterReceiptMatches, spreadsheetTableStyleWriterReceiptMatches, spreadsheetTableResizeWriterReceiptMatches } from "../../../../lib/spreadsheet/visible-command-authority";
import { type SpreadsheetRibbonTab } from "../../../../lib/spreadsheet/SpreadsheetRibbon";
import { normalizeSlicers, pivotSlicerSourceKey, MAX_SLICERS } from "../../../../lib/spreadsheet/slicer";
import { isValidDataTableName, tableNativeStructureBlocked, MAX_TABLE_ALT_TEXT_LENGTH, MAX_TABLE_ALT_TEXT_SUMMARY_LENGTH, tableStyleChoiceAvailable, type TableStyleChoice } from "@mrnote/core/web/lib/spreadsheet/data-table.ts";
import { type rangeHasLockedCell as rangeHasLockedCellWithProtection, type SheetProtectionPermission } from "@mrnote/core/web/lib/spreadsheet/protection.ts";
import { offsetOfLine } from "@mrnote/core/web/lib/spreadsheet/grid-sizing.ts";
import { SPREADSHEET_HEADER_HEIGHT_PX, SPREADSHEET_HEADER_WIDTH_PX } from "./spreadsheetGridConstants";
import { sheetPivotAt } from "@mrnote/core/web/lib/spreadsheet/pivot.ts";
import { type SheetModel } from "./spreadsheetSheetModel";
import { spreadsheetRangeA1 } from "./spreadsheetRangeA1";
import { type TableStyleOptionControlId, type TableStyleOption, type PivotSlicerInsertMutationReceipt, type PageSetupSelectionSnapshot, type TableAltTextMutationReceipt, type TableNameMutationReceipt, type TableResizeMutationReceipt, type TableSlicerInsertMutationReceipt, type TableStyleMutationReceipt, type TableStyleOptionMutationReceipt } from "./spreadsheetMutationReceipts";
import { type SheetViewMappedCellMutation, type SheetViewMappedDrawingMutation, type SheetViewMappedLineMutation, type SheetViewMappedPageMutation } from "./spreadsheetSheetViews";
import { type SparseAxisSizeResolver } from "@mrnote/core/web/lib/spreadsheet/grid-sizing.ts";
import { type SpreadsheetNativeTableStyle } from "@mrnote/core/web/lib/spreadsheet/native-table-styles.ts";

/** What spreadsheetTableReceiptWriters reads from SpreadsheetWindow's render scope. */
export interface SpreadsheetTableReceiptWritersInputs {
  activePivotSlotRef: RefObject<number>;
  contextualTabActivationRef: RefObject<{ contextual: NonNullable<SpreadsheetRibbonTab["contextual"]>; id?: string; } | null>;
  intrinsicColWidth: SparseAxisSizeResolver;
  intrinsicRowHeight: SparseAxisSizeResolver;
  /** The active PivotTable's drawn report, where its slicers go beside. */
  activePivotOutputRange: { r1: number; c1: number; r2: number; c2: number } | null;
  isSheetProtectionEffectiveRef: RefObject<(candidate: SheetModel | null | undefined) => boolean>;
  liveActiveSheetIndexRef: RefObject<number>;
  liveSheetsRef: RefObject<SheetModel[]>;
  pivotSlicerInsertMutationCommandRef: RefObject<PivotSlicerInsertMutationReceipt | null>;
  rangeHasLockedCellRef: RefObject<(candidate: SheetModel, range: Parameters<typeof rangeHasLockedCellWithProtection>[1]) => boolean>;
  readPageSetupSelectionSnapshot: () => PageSetupSelectionSnapshot | null;
  renameDataTable: (id: string, rawName: string) => boolean;
  replaceActiveSheet: (nextSheet: SheetModel, nextTitle?: string, calculationMutation?: "content" | "coordinate", sheetViewMutation?: SheetViewMappedCellMutation | SheetViewMappedDrawingMutation | SheetViewMappedLineMutation | SheetViewMappedPageMutation, followOnOtherSheets?: (candidate: SheetModel) => SheetModel) => SheetModel[];
  resizeDataTable: (id: string, rangeA1: string) => boolean;
  selectSlicerContext: (id: string) => void;
  setTableAltText: (id: string, altText: string, altTextSummary: string) => boolean;
  setTableStyle: (id: string, styleId: TableStyleChoice) => boolean;
  setTableStyleOption: (id: string, option: TableStyleOption, nextValue: boolean) => boolean;
  sheetProtectionAllowsRef: RefObject<(candidate: SheetModel | null | undefined, permission: SheetProtectionPermission) => boolean>;
  sheetViewProjectionActive: boolean;
  sheetViewProjectionActiveRef: RefObject<boolean>;
  tableAltTextMutationCommandRef: RefObject<TableAltTextMutationReceipt | null>;
  tableNameMutationCommandRef: RefObject<TableNameMutationReceipt | null>;
  tableResizeMutationCommandRef: RefObject<TableResizeMutationReceipt | null>;
  tableSlicerInsertMutationCommandRef: RefObject<TableSlicerInsertMutationReceipt | null>;
  tableStyleMutationCommandRef: RefObject<TableStyleMutationReceipt | null>;
  tableStyleOptionMutationCommandRef: RefObject<TableStyleOptionMutationReceipt | null>;
  workbookNativeTableStyles: SpreadsheetNativeTableStyle[] | undefined;
}

/** Moved verbatim from SpreadsheetWindow (called at the same position, so hook order is unchanged). */
export function spreadsheetTableReceiptWriters({
  activePivotSlotRef,
  contextualTabActivationRef,
  intrinsicColWidth,
  intrinsicRowHeight,
  activePivotOutputRange,
  isSheetProtectionEffectiveRef,
  liveActiveSheetIndexRef,
  liveSheetsRef,
  pivotSlicerInsertMutationCommandRef,
  rangeHasLockedCellRef,
  readPageSetupSelectionSnapshot,
  renameDataTable,
  replaceActiveSheet,
  resizeDataTable,
  selectSlicerContext,
  setTableAltText,
  setTableStyle,
  setTableStyleOption,
  sheetProtectionAllowsRef,
  sheetViewProjectionActive,
  sheetViewProjectionActiveRef,
  tableAltTextMutationCommandRef,
  tableNameMutationCommandRef,
  tableResizeMutationCommandRef,
  tableSlicerInsertMutationCommandRef,
  tableStyleMutationCommandRef,
  tableStyleOptionMutationCommandRef,
  workbookNativeTableStyles,
}: SpreadsheetTableReceiptWritersInputs) {
  const executeTableNameReceiptWriter = (): boolean => {
    const receipt = tableNameMutationCommandRef.current;
    try {
      if (!receipt) return false;
      const liveSelection = readPageSetupSelectionSnapshot();
      const liveWorkbook = liveSheetsRef.current;
      const liveIndex = liveActiveSheetIndexRef.current;
      const liveSheet = liveWorkbook[liveIndex];
      const liveTableCollection = liveSheet?.dataTables;
      const liveTable = liveTableCollection?.find(
        (table) => table.id === receipt.tableId,
      );
      if (
        !liveSelection ||
        !liveSheet ||
        !liveTableCollection ||
        !liveTable ||
        !spreadsheetTableNameWriterReceiptMatches({
          expectedControlId: "XLSCTL.CONTEXT.TABLE.NAME",
          receiptControlId: receipt.controlId,
          sourceWorkbook: receipt.workbook,
          sourceActiveSheetIndex: receipt.activeSheetIndex,
          sourceSheet: receipt.sheet,
          sourceSheetId: receipt.sheetId,
          sourceTableCollection: receipt.tableCollection,
          sourceTable: receipt.table,
          sourceTableId: receipt.tableId,
          sourceSelectionEpoch: receipt.selection.epoch,
          sourceRange: receipt.selection.range,
          sourcePreviousName: receipt.previousName,
          sourceNextName: receipt.nextName,
          liveWorkbook,
          liveActiveSheetIndex: liveIndex,
          liveSheet,
          liveSheetId: liveSheet.id,
          liveTableCollection,
          liveTable,
          liveTableId: liveTable.id,
          liveSelectionEpoch: liveSelection.epoch,
          liveRange: liveSelection.range,
          livePreviousName: liveTable.name,
          liveNextName: receipt.nextName,
        }) ||
        !isValidDataTableName(receipt.nextName) ||
        tableNativeStructureBlocked(liveTable) ||
        sheetViewProjectionActiveRef.current ||
        isSheetProtectionEffectiveRef.current(liveSheet) ||
        rangeHasLockedCellRef.current(liveSheet, {
          ...liveTable.range,
          r2: liveTable.range.r2 + (liveTable.totalsRow ? 1 : 0),
        }) ||
        liveWorkbook.some((candidate, sheetIndex) =>
          (candidate.dataTables ?? []).some(
            (table) =>
              !(sheetIndex === liveIndex && table === liveTable) &&
              table.name.toLowerCase() === receipt.nextName.toLowerCase(),
          ),
        )
      ) {
        return false;
      }
      return renameDataTable(receipt.tableId, receipt.nextName);
    } finally {
      tableNameMutationCommandRef.current = null;
    }
  };
  const executeTableAltTextReceiptWriter = (): boolean => {
    const receipt = tableAltTextMutationCommandRef.current;
    try {
      if (!receipt) return false;
      const liveSelection = readPageSetupSelectionSnapshot();
      const liveWorkbook = liveSheetsRef.current;
      const liveIndex = liveActiveSheetIndexRef.current;
      const liveSheet = liveWorkbook[liveIndex];
      const liveTableCollection = liveSheet?.dataTables;
      const liveTable = liveTableCollection?.find(
        (table) => table.id === receipt.tableId,
      );
      if (
        !liveSelection ||
        !liveSheet ||
        !liveTableCollection ||
        !liveTable ||
        !spreadsheetTableAltTextWriterReceiptMatches({
          expectedControlId: "XLSCTL.CONTEXT.TABLE.ALT_TEXT.MRAI.APPLY",
          receiptControlId: receipt.controlId,
          sourceWorkbook: receipt.workbook,
          sourceActiveSheetIndex: receipt.activeSheetIndex,
          sourceSheet: receipt.sheet,
          sourceSheetId: receipt.sheetId,
          sourceTableCollection: receipt.tableCollection,
          sourceTable: receipt.table,
          sourceTableId: receipt.tableId,
          sourceSelectionEpoch: receipt.selection.epoch,
          sourceRange: receipt.selection.range,
          sourceAltText: receipt.previousAltText,
          sourceAltTextSummary: receipt.previousAltTextSummary,
          nextAltText: receipt.nextAltText,
          nextAltTextSummary: receipt.nextAltTextSummary,
          liveWorkbook,
          liveActiveSheetIndex: liveIndex,
          liveSheet,
          liveSheetId: liveSheet.id,
          liveTableCollection,
          liveTable,
          liveTableId: liveTable.id,
          liveSelectionEpoch: liveSelection.epoch,
          liveRange: liveSelection.range,
          liveAltText: liveTable.altText ?? "",
          liveAltTextSummary: liveTable.altTextSummary ?? "",
          liveNextAltText: receipt.nextAltText,
          liveNextAltTextSummary: receipt.nextAltTextSummary,
        }) ||
        receipt.nextAltText.length > MAX_TABLE_ALT_TEXT_LENGTH ||
        receipt.nextAltTextSummary.length > MAX_TABLE_ALT_TEXT_SUMMARY_LENGTH ||
        (receipt.previousAltText === receipt.nextAltText &&
          receipt.previousAltTextSummary === receipt.nextAltTextSummary) ||
        sheetViewProjectionActiveRef.current ||
        isSheetProtectionEffectiveRef.current(liveSheet) ||
        rangeHasLockedCellRef.current(liveSheet, {
          ...liveTable.range,
          r2: liveTable.range.r2 + (liveTable.totalsRow ? 1 : 0),
        })
      ) {
        return false;
      }
      return setTableAltText(
        receipt.tableId,
        receipt.nextAltText,
        receipt.nextAltTextSummary,
      );
    } finally {
      tableAltTextMutationCommandRef.current = null;
    }
  };
  const executeTableStyleReceiptWriter = (): boolean => {
    const receipt = tableStyleMutationCommandRef.current;
    try {
      if (!receipt) return false;
      const liveSelection = readPageSetupSelectionSnapshot();
      const liveWorkbook = liveSheetsRef.current;
      const liveIndex = liveActiveSheetIndexRef.current;
      const liveSheet = liveWorkbook[liveIndex];
      const liveTableCollection = liveSheet?.dataTables;
      const liveTable = liveTableCollection?.find(
        (table) => table.id === receipt.tableId,
      );
      if (
        !liveSelection ||
        !liveSheet ||
        !liveTableCollection ||
        !liveTable ||
        !spreadsheetTableStyleWriterReceiptMatches({
          expectedControlId: "XLSCTL.CONTEXT.TABLE.STYLE_GALLERY",
          receiptControlId: receipt.controlId,
          sourceWorkbook: receipt.workbook,
          sourceActiveSheetIndex: receipt.activeSheetIndex,
          sourceSheet: receipt.sheet,
          sourceSheetId: receipt.sheetId,
          sourceTableCollection: receipt.tableCollection,
          sourceTable: receipt.table,
          sourceTableId: receipt.tableId,
          sourceSelectionEpoch: receipt.selection.epoch,
          sourceRange: receipt.selection.range,
          sourceStyleId: receipt.styleId,
          liveWorkbook,
          liveActiveSheetIndex: liveIndex,
          liveSheet,
          liveSheetId: liveSheet.id,
          liveTableCollection,
          liveTable,
          liveTableId: liveTable.id,
          liveSelectionEpoch: liveSelection.epoch,
          liveRange: liveSelection.range,
          liveStyleId: receipt.styleId,
        }) ||
        !tableStyleChoiceAvailable(receipt.styleId, workbookNativeTableStyles) ||
        isSheetProtectionEffectiveRef.current(liveSheet) ||
        rangeHasLockedCellRef.current(liveSheet, {
          ...liveTable.range,
          r2: liveTable.range.r2 + (liveTable.totalsRow ? 1 : 0),
        })
      ) {
        return false;
      }
      return setTableStyle(receipt.tableId, receipt.styleId);
    } finally {
      tableStyleMutationCommandRef.current = null;
    }
  };
  const executeTableStyleOptionReceiptWriter = (
    expectedControlId: TableStyleOptionControlId,
    expectedOption: TableStyleOption,
  ): boolean => {
    const receipt = tableStyleOptionMutationCommandRef.current;
    try {
      if (!receipt) return false;
      const liveSelection = readPageSetupSelectionSnapshot();
      const liveWorkbook = liveSheetsRef.current;
      const liveIndex = liveActiveSheetIndexRef.current;
      const liveSheet = liveWorkbook[liveIndex];
      const liveTableCollection = liveSheet?.dataTables;
      const liveTable = liveTableCollection?.find(
        (table) => table.id === receipt.tableId,
      );
      const parameter = `${receipt.option}:${String(receipt.nextValue)}`;
      if (
        receipt.option !== expectedOption ||
        receipt.nextValue === Boolean(receipt.table[receipt.option]) ||
        !liveSelection ||
        !liveSheet ||
        !liveTableCollection ||
        !liveTable ||
        !spreadsheetTableStyleWriterReceiptMatches({
          expectedControlId,
          receiptControlId: receipt.controlId,
          sourceWorkbook: receipt.workbook,
          sourceActiveSheetIndex: receipt.activeSheetIndex,
          sourceSheet: receipt.sheet,
          sourceSheetId: receipt.sheetId,
          sourceTableCollection: receipt.tableCollection,
          sourceTable: receipt.table,
          sourceTableId: receipt.tableId,
          sourceSelectionEpoch: receipt.selection.epoch,
          sourceRange: receipt.selection.range,
          sourceStyleId: parameter,
          liveWorkbook,
          liveActiveSheetIndex: liveIndex,
          liveSheet,
          liveSheetId: liveSheet.id,
          liveTableCollection,
          liveTable,
          liveTableId: liveTable.id,
          liveSelectionEpoch: liveSelection.epoch,
          liveRange: liveSelection.range,
          liveStyleId: parameter,
        }) ||
        sheetViewProjectionActive ||
        isSheetProtectionEffectiveRef.current(liveSheet) ||
        rangeHasLockedCellRef.current(liveSheet, {
          ...liveTable.range,
          r2: liveTable.range.r2 + (liveTable.totalsRow ? 1 : 0),
        })
      ) {
        return false;
      }
      return setTableStyleOption(
        receipt.tableId,
        receipt.option,
        receipt.nextValue,
      );
    } finally {
      tableStyleOptionMutationCommandRef.current = null;
    }
  };
  const executeTableResizeReceiptWriter = (): boolean => {
    const receipt = tableResizeMutationCommandRef.current;
    try {
      if (!receipt) return false;
      const liveSelection = readPageSetupSelectionSnapshot();
      const liveWorkbook = liveSheetsRef.current;
      const liveIndex = liveActiveSheetIndexRef.current;
      const liveSheet = liveWorkbook[liveIndex];
      const liveTableCollection = liveSheet?.dataTables;
      const liveTable = liveTableCollection?.find(
        (table) => table.id === receipt.tableId,
      );
      if (
        !liveSelection ||
        !liveSheet ||
        !liveTableCollection ||
        !liveTable ||
        !spreadsheetTableResizeWriterReceiptMatches({
          expectedControlId: "XLSCTL.CONTEXT.TABLE.RESIZE.MRAI.APPLY",
          receiptControlId: receipt.controlId,
          sourceWorkbook: receipt.workbook,
          sourceActiveSheetIndex: receipt.activeSheetIndex,
          sourceSheet: receipt.sheet,
          sourceSheetId: receipt.sheetId,
          sourceTableCollection: receipt.tableCollection,
          sourceTable: receipt.table,
          sourceTableId: receipt.tableId,
          sourceSelectionEpoch: receipt.selection.epoch,
          sourceSelectionRange: receipt.selection.range,
          sourceTableRange: receipt.tableRange,
          sourceTargetRange: receipt.targetRange,
          liveWorkbook,
          liveActiveSheetIndex: liveIndex,
          liveSheet,
          liveSheetId: liveSheet.id,
          liveTableCollection,
          liveTable,
          liveTableId: liveTable.id,
          liveSelectionEpoch: liveSelection.epoch,
          liveSelectionRange: liveSelection.range,
          liveTableRange: spreadsheetRangeA1(liveTable.range),
          liveTargetRange: receipt.targetRange,
        }) ||
        tableNativeStructureBlocked(liveTable) ||
        isSheetProtectionEffectiveRef.current(liveSheet)
      ) {
        return false;
      }
      return resizeDataTable(receipt.tableId, receipt.targetRange);
    } finally {
      tableResizeMutationCommandRef.current = null;
    }
  };
  const executePivotSlicerInsertReceiptWriter = (): boolean => {
    const receipt = pivotSlicerInsertMutationCommandRef.current;
    try {
      const liveWorkbook = liveSheetsRef.current;
      const liveIndex = liveActiveSheetIndexRef.current;
      const liveSheet = liveWorkbook[liveIndex];
      const liveSelection = readPageSetupSelectionSnapshot();
      // The PivotTable the slicer is inserted on: the active one.
      const livePivot = sheetPivotAt(liveSheet, activePivotSlotRef.current);
      if (
        !receipt ||
        receipt.controlId !== "XLSCTL.CONTEXT.PIVOT.INSERT_SLICER.MRAI.APPLY" ||
        !livePivot ||
        !liveSelection ||
        receipt.workbook !== liveWorkbook ||
        receipt.activeSheetIndex !== liveIndex ||
        receipt.sheet !== liveSheet ||
        receipt.sheetId !== liveSheet.id ||
        receipt.pivot !== livePivot ||
        receipt.selection.epoch !== liveSelection.epoch ||
        livePivot.native?.disposition === "preserve-only" ||
        sheetViewProjectionActiveRef.current ||
        !sheetProtectionAllowsRef.current(liveSheet, "editObjects")
      ) {
        return false;
      }
      const liveSlicers = normalizeSlicers(
        liveSheet.slicers,
        liveSheet.columnCount,
      );
      // A later PivotTable of the sheet is named; the first needs no name.
      const pivotName =
        receipt.pivot !== liveSheet.pivot
          ? receipt.pivot.name ?? receipt.pivot.native?.pivotName ?? ""
          : undefined;
      // Only a field THIS PivotTable already shows in a slicer is taken; a
      // same-named field of another PivotTable on the sheet is not.
      const used = new Set(
        liveSlicers.flatMap((slicer) =>
          slicer.source?.kind === "pivot"
            ? [pivotSlicerSourceKey(slicer.source)]
            : [],
        ),
      );
      const selected = new Set(receipt.selectedFields);
      if (
        selected.size === 0 ||
        selected.size !== receipt.selectedFields.length ||
        selected.size > MAX_SLICERS - liveSlicers.length ||
        receipt.selectedFields.some(
          (field) =>
            !receipt.availableFields.includes(field) ||
            used.has(
              pivotSlicerSourceKey({
                pivotOutput: liveSheet.id,
                pivotName,
                fieldId: field,
              }),
            ),
        )
      ) {
        return false;
      }
      // As a table's: to the right of the report, level with its top row,
      // in the drawing layer's coordinates (past the headings). Without a
      // spot the slicer sat at the sheet's corner, under the frozen headings
      // and out of view of a report at J180 (user audit S-024).
      const firstSpot = activePivotOutputRange
        ? {
            x:
              SPREADSHEET_HEADER_WIDTH_PX +
              offsetOfLine(activePivotOutputRange.c2 + 1, liveSheet.columnCount, intrinsicColWidth) +
              8,
            y:
              SPREADSHEET_HEADER_HEIGHT_PX +
              offsetOfLine(activePivotOutputRange.r1, liveSheet.rowCount, intrinsicRowHeight),
          }
        : undefined;
      const added = pivotSlicersAdded(
        liveSheet,
        { all: receipt.allFields, available: receipt.availableFields, pivotName },
        receipt.selectedFields,
        Date.now().toString(36),
        firstSpot,
      );
      if (!added) return false;
      replaceActiveSheet({
        ...liveSheet,
        slicers: added.slicers,
      });
      contextualTabActivationRef.current = { contextual: "slicer" };
      selectSlicerContext(added.created[0]!.id);
      return true;
    } finally {
      pivotSlicerInsertMutationCommandRef.current = null;
    }
  };
  const executeTableSlicerInsertReceiptWriter = (): boolean => {
    const receipt = tableSlicerInsertMutationCommandRef.current;
    try {
      const liveSelection = readPageSetupSelectionSnapshot();
      const liveWorkbook = liveSheetsRef.current;
      const liveIndex = liveActiveSheetIndexRef.current;
      const liveSheet = liveWorkbook[liveIndex];
      const liveTableCollection = liveSheet?.dataTables;
      const liveTable = liveTableCollection?.find(
        (table) => table.id === receipt?.tableId,
      );
      if (
        !receipt ||
        receipt.controlId !==
          "XLSCTL.CONTEXT.TABLE.INSERT_SLICER.MRAI.APPLY" ||
        !liveSelection ||
        !liveSheet ||
        !liveTableCollection ||
        !liveTable ||
        receipt.workbook !== liveWorkbook ||
        receipt.activeSheetIndex !== liveIndex ||
        receipt.sheet !== liveSheet ||
        receipt.sheetId !== liveSheet.id ||
        receipt.tableCollection !== liveTableCollection ||
        receipt.table !== liveTable ||
        receipt.tableId !== liveTable.id ||
        receipt.selection.epoch !== liveSelection.epoch ||
        receipt.selection.range.r1 !== liveSelection.range.r1 ||
        receipt.selection.range.c1 !== liveSelection.range.c1 ||
        receipt.selection.range.r2 !== liveSelection.range.r2 ||
        receipt.selection.range.c2 !== liveSelection.range.c2 ||
        // Neither write route is a reason to refuse any more: the slicer
        // writer re-authenticates the native table part itself and never
        // rewrites the table, so a preserved (extension-bearing) table is a
        // valid slicer source on the original-package route too.
        sheetViewProjectionActiveRef.current ||
        !sheetProtectionAllowsRef.current(liveSheet, "editObjects") ||
        rangeHasLockedCellRef.current(liveSheet, liveTable.range) ||
        !liveTable.columns?.length
      ) {
        return false;
      }
      // The columns still offered must be the ones the dialog listed.
      const { availableColumnIds } = tableSlicerColumns(liveSheet, liveTable);
      if (
        availableColumnIds.length !== receipt.availableColumnIds.length ||
        availableColumnIds.some(
          (columnId, index) => columnId !== receipt.availableColumnIds[index],
        )
      ) {
        return false;
      }
      // Excel places the first slicer to the right of the table, level with
      // its top row, and cascades the next ones (Microsoft Support, "Use
      // slicers to filter data"); a persisted x/y is what the panel renders.
      // The drawing layer's x/y count from the headings' corner, as every
      // drawing's do: a cell-space spot put the slicer 48 px left of the
      // table's edge, over its last column.
      const firstSpot = {
        x:
          SPREADSHEET_HEADER_WIDTH_PX +
          offsetOfLine(
            liveTable.range.c2 + 1,
            liveSheet.columnCount,
            intrinsicColWidth,
          ) + 8,
        y:
          SPREADSHEET_HEADER_HEIGHT_PX +
          offsetOfLine(
            liveTable.range.r1,
            liveSheet.rowCount,
            intrinsicRowHeight,
          ),
      };
      const added = tableSlicersAdded(
        liveSheet,
        liveTable,
        receipt.selectedColumnIds,
        firstSpot,
        Date.now().toString(36),
      );
      if (!added) return false;
      replaceActiveSheet({
        ...liveSheet,
        slicers: added.slicers,
      });
      contextualTabActivationRef.current = { contextual: "slicer" };
      selectSlicerContext(added.created[0]!.id);
      return true;
    } finally {
      tableSlicerInsertMutationCommandRef.current = null;
    }
  };
  return {
    executePivotSlicerInsertReceiptWriter,
    executeTableAltTextReceiptWriter,
    executeTableNameReceiptWriter,
    executeTableResizeReceiptWriter,
    executeTableSlicerInsertReceiptWriter,
    executeTableStyleOptionReceiptWriter,
    executeTableStyleReceiptWriter,
  };
}
