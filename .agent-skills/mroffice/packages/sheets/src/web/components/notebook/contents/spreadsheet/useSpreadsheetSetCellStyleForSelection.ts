"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { type SpreadsheetCell, cellStylePatchedSheet, type CellMap, type CellStylePatchInput } from "@mrnote/core/web/lib/spreadsheet/cell-buttons.ts";
import type { OfficeFontFace } from "@mrnote/core/web/components/office-ribbon/officeFontFace.ts";
import { useCallback, type RefObject } from "react";
import { type FormatCellsBorderLinesPatch } from "../FormatCellsDialog";
import { type SheetEvaluator } from "@mrnote/core/web/lib/spreadsheet/formula-engine.ts";
import { type MergeSpan, mergeSpanFor, addMerge, rangeHasMerge, spansOverlap, removeMergesInRange, cellsAfterMergesRemoved, expandRangeToMergeClosure } from "@mrnote/core/web/lib/spreadsheet/merge-cells.ts";
import { cellsWithTheirCoveredFormats, mergeRectTouchesTable } from "../../../../lib/spreadsheet/merge-buttons";
import { setRangeLocked, setRangeFormulaHidden, type SheetProtectionPermission } from "@mrnote/core/web/lib/spreadsheet/protection.ts";
import { type SheetModel } from "./spreadsheetSheetModel";
import { type SheetViewMappedCellMutation, type SheetViewMappedDrawingMutation, type SheetViewMappedLineMutation, type SheetViewMappedPageMutation } from "./spreadsheetSheetViews";
import { type SparseAxisSizeResolver } from "@mrnote/core/web/lib/spreadsheet/grid-sizing.ts";
import { type GridRect } from "../../../../lib/spreadsheet/grid-nav";
import { type Dispatch, type SetStateAction } from "react";

/** What useSpreadsheetSetCellStyleForSelection reads from SpreadsheetWindow's render scope. */
export interface SpreadsheetSetCellStyleForSelectionInputs {
  cellDisplayValue: (cell: SpreadsheetCell | undefined, row: number, col: number, editing: boolean, numberFormatOverride?: string) => string;
  colWidth: SparseAxisSizeResolver;
  confirmMergeDataLoss: (spans: readonly MergeSpan[], commit: () => void) => void;
  formulaEvaluator: SheetEvaluator;
  gridColumnCount: number;
  gridRowCount: number;
  homeObjectSelectedRef: RefObject<boolean>;
  isSheetProtectionEffectiveRef: RefObject<(candidate: SheetModel | null | undefined) => boolean>;
  mergedCellMap: (spans: readonly MergeSpan[], cells?: CellMap) => CellMap;
  mergeMutationBlockedByProtection: (plannedSpans: readonly MergeSpan[]) => boolean;
  mergeSpans: MergeSpan[];
  replaceActiveSheet: (nextSheet: SheetModel, nextTitle?: string, calculationMutation?: "content" | "coordinate", sheetViewMutation?: SheetViewMappedCellMutation | SheetViewMappedDrawingMutation | SheetViewMappedLineMutation | SheetViewMappedPageMutation, followOnOtherSheets?: (candidate: SheetModel) => SheetModel) => SheetModel[];
  selRect: GridRect;
  setActiveCell: Dispatch<SetStateAction<{ row: number; col: number; }>>;
  setSelectionAnchor: Dispatch<SetStateAction<{ row: number; col: number; } | null>>;
  sheet: SheetModel;
  sheetProtectionAllowsRef: RefObject<(candidate: SheetModel | null | undefined, permission: SheetProtectionPermission) => boolean>;
  showProtectNotice: (message?: string) => void;
  /** Why the Alignment tab's Merge cells refuses a table's cells. */
  tableMergeRefusal: string;
  workbookFontAssets: { aliases: Record<string, string>; unavailable: boolean; faces: OfficeFontFace[]; };
}

/** Moved verbatim from SpreadsheetWindow (called at the same position, so hook order is unchanged). */
export function useSpreadsheetSetCellStyleForSelection({
  colWidth,
  confirmMergeDataLoss,
  formulaEvaluator,
  gridColumnCount,
  gridRowCount,
  homeObjectSelectedRef,
  isSheetProtectionEffectiveRef,
  mergedCellMap,
  mergeMutationBlockedByProtection,
  mergeSpans,
  replaceActiveSheet,
  selRect,
  setActiveCell,
  setSelectionAnchor,
  sheet,
  sheetProtectionAllowsRef,
  showProtectNotice,
  tableMergeRefusal,
}: SpreadsheetSetCellStyleForSelectionInputs) {
  // Apply a style patch to the whole current selection (Excel/WPS behaviour),
  // falling back to the active cell when nothing is range-selected.
  const setCellStyleForSelection = useCallback(
    (
      patch: CellStylePatchInput,
      // Format Cells can change a style AND the protection flag in one OK.
      // `locked` rides along so both land in ONE sheet commit: two commits in a
      // row would each build from the same stale closure, and the second would
      // silently drop the first one's edit.
      options?: {
        locked?: boolean;
        /** Format Cells > Protection > Hidden, in the same commit. */
        formulaHidden?: boolean;
        /** Excel's Alignment-tab "Merge cells": true merges the selection
         * into one cell, false unmerges it, in the same commit as the style. */
        mergeCells?: boolean;
        /** Format Cells > Border: the selection's lines as one block, each
         * cell taking its share (XLS-A060). */
        borderLinesPatch?: FormatCellsBorderLinesPatch;
      },
    ) => {
      // An object or a chart is selected: Home never writes the cells under
      // it (Excel formats the object or greys the command). Every caller —
      // the ribbon, the shortcuts, the orientation presets — is covered here.
      if (homeObjectSelectedRef.current) return;
      // Protection enforced CENTRALLY here so EVERY caller is covered — the direct
      // toolbar format buttons (bold/italic/underline/font color/alignment/wrap),
      // the Format Painter, and the named-styles gallery alike. On a protected
      // sheet, formatting a locked cell shows the notice and writes nothing.
      // (Painter + gallery also pre-check and short-circuit before reaching here,
      // so they never double-notice; the direct buttons rely on this guard.)
      // A protected sheet formats nothing without its Format cells
      // permission, unlocked cells included (live audit B138). With it, any
      // cell may be formatted, locked ones too ("format any cell",
      // Worksheet.Protect AllowFormattingCells), but the Protection formats
      // themselves (Locked, Hidden) stay as they are while protected.
      if (
        isSheetProtectionEffectiveRef.current(sheet) &&
        (!sheetProtectionAllowsRef.current(sheet, "formatCells") ||
          options?.locked !== undefined ||
          options?.formulaHidden !== undefined)
      ) {
        showProtectNotice();
        return;
      }
      const patchedSheet = cellStylePatchedSheet(
        sheet,
        selRect,
        patch,
        options,
        gridRowCount,
        gridColumnCount,
      );
      if (!patchedSheet) return;
      let nextSheet = patchedSheet;
      // Wrap Text leaves the row's height automatic, as Excel does: the grid
      // projects the wrapped height (useSpreadsheetAutoRowHeights) without
      // storing it, so turning wrap off brings the row back down and typing
      // more text grows it again. Writing the grown height here made it a
      // fixed height that outlived the wrap (Excel 16: 16 -> 119 -> 16 pt).
      if (options?.locked !== undefined) {
        nextSheet = {
          ...nextSheet,
          cells: setRangeLocked(
            nextSheet.cells,
            {
              r1: selRect.r1,
              r2: selRect.r2,
              c1: selRect.c1,
              c2: selRect.c2,
            },
            options.locked,
          ),
        };
      }
      if (options?.formulaHidden !== undefined) {
        nextSheet = {
          ...nextSheet,
          cells: setRangeFormulaHidden(
            nextSheet.cells,
            {
              r1: selRect.r1,
              r2: selRect.r2,
              c1: selRect.c1,
              c2: selRect.c2,
            },
            options.formulaHidden,
          ),
        };
      }
      // Merge cells (Excel Format Cells > Alignment > Text control). The same
      // rules as the Home Merge commands: the anchor keeps its value, covered
      // cells are cleared, a 1x1 selection merges nothing, unmerge drops every
      // span the selection touches, and a protected locked span refuses the
      // whole OK rather than committing half of it.
      let collapseTo: { row: number; col: number } | null = null;
      let mergedSpan: MergeSpan | null = null;
      if (options?.mergeCells !== undefined) {
        // The selection grows to every merge it touches, as the Home Merge
        // commands' target does (sheetAfterMergeButton): merging B2:C3 over
        // a C3:D4 merge merges B2:D4, never a span that cuts the old one.
        const range = expandRangeToMergeClosure(
          { r1: selRect.r1, r2: selRect.r2, c1: selRect.c1, c2: selRect.c2 },
          mergeSpans,
        );
        if (options.mergeCells) {
          const span = mergeSpanFor(range);
          if (span) {
            if (mergeMutationBlockedByProtection([span])) return;
            // As the Home Merge commands: no merge across a table's records.
            if (mergeRectTouchesTable(nextSheet, range)) {
              showProtectNotice(tableMergeRefusal);
              return;
            }
            // The Home Merge commands' content rule (live audit B252): a
            // lone value moves onto the anchor, and losing more than one
            // value is confirmed first.
            nextSheet = {
              ...nextSheet,
              cells: mergedCellMap([span], nextSheet.cells),
              merges: addMerge(mergeSpans, span),
            };
            collapseTo = { row: span.row, col: span.col };
            mergedSpan = span;
          }
        } else if (rangeHasMerge(mergeSpans, range)) {
          const selectionSpan: MergeSpan = {
            row: range.r1,
            col: range.c1,
            rowSpan: range.r2 - range.r1 + 1,
            colSpan: range.c2 - range.c1 + 1,
          };
          if (
            mergeMutationBlockedByProtection(
              mergeSpans.filter((span) => spansOverlap(span, selectionSpan)),
            )
          ) {
            return;
          }
          const nextMerges = removeMergesInRange(mergeSpans, range);
          nextSheet = { ...nextSheet, cells: cellsWithTheirCoveredFormats(cellsAfterMergesRemoved(nextSheet.cells, mergeSpans, nextMerges), mergeSpans, nextMerges) };
          if (nextMerges.length > 0) nextSheet.merges = nextMerges;
          else delete nextSheet.merges;
        }
      }
      const commit = () => {
        replaceActiveSheet(nextSheet);
        if (collapseTo) {
          // Selection collapses onto the anchor (Excel behavior).
          setActiveCell(collapseTo);
          setSelectionAnchor(collapseTo);
        }
      };
      // Declining the warning writes nothing of the OK, as the toolbar's
      // declined merge does.
      if (mergedSpan) confirmMergeDataLoss([mergedSpan], commit);
      else commit();
    },
    // cellDisplayValue derives from sheet.cells via formulaEvaluator.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      replaceActiveSheet,
      sheet,
      selRect,
      showProtectNotice,
      tableMergeRefusal,
      mergeSpans,
      mergeMutationBlockedByProtection,
      colWidth,
      formulaEvaluator,
      gridColumnCount,
      gridRowCount,
    ],
  );
  return {
    setCellStyleForSelection,
  };
}
