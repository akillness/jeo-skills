/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The model half of SpreadsheetWindow.replaceActiveSheet, the one place every
 * active-sheet edit is committed (typing, Paste, Fill, Insert / Delete, Sort,
 * Merge, a dialog's OK, a macro step). Kept pure and out of the window so the
 * window and the model-level tests commit an edit through the same code; the
 * window keeps the refusals (protection, sheet views, tiled sheets, PivotTable
 * output) between the two halves, and the history, calculation and save
 * bookkeeping after them.
 */
import { committedSheetEdit, type FollowOtherSheets } from "../../../../lib/spreadsheet/row-column-buttons";
import { grownRowsStayHidden, sheetCoveringItsCells } from "../../../../lib/spreadsheet/sheet-extent";
import { reconcileTableHeaderWrites, renameTableColumnsInSheet } from "./spreadsheetCellValuePlan";
import { type SheetModel } from "./spreadsheetSheetModel";

/**
 * The requested sheet as it will be committed: the stored extent grown to
 * hold every cell, merge and drawing anchor it carries (the server refuses a
 * page with a cell outside it), and, for a content edit, a table header that
 * a command which does not name tables wrote renaming its column on every
 * sheet, as typing it does (live audit S-123). A row/column move shifts
 * headers, not names, so a coordinate edit is left alone.
 */
export function preparedActiveSheetEdit(
  sheet: SheetModel,
  requested: SheetModel,
  calculationMutation: "content" | "coordinate",
  followOnOtherSheets?: FollowOtherSheets<SheetModel>,
): { sheet: SheetModel; followOthers: FollowOtherSheets<SheetModel> | undefined } {
  let nextSheet = requested;
  if (
    nextSheet.cells !== sheet.cells ||
    nextSheet.merges !== sheet.merges ||
    nextSheet.objects !== sheet.objects ||
    nextSheet.charts !== sheet.charts
  ) {
    nextSheet = sheetCoveringItsCells(nextSheet);
  }
  // Rows the extent took in on a sheet whose rows are hidden by default stay
  // hidden, unless the edit itself said which rows are hidden (Unhide).
  if (nextSheet.manuallyHiddenRows === sheet.manuallyHiddenRows) nextSheet = grownRowsStayHidden(sheet, nextSheet);
  let followOthers = followOnOtherSheets;
  if (calculationMutation === "content") {
    const reconciled = reconcileTableHeaderWrites(sheet, nextSheet);
    if (reconciled) {
      nextSheet = reconciled.sheet;
      const before = followOnOtherSheets;
      followOthers = reconciled.renames.length > 0
        ? (candidate) => renameTableColumnsInSheet(before ? before(candidate) : candidate, reconciled.renames)
        : before;
    }
  }
  return { sheet: nextSheet, followOthers };
}

/**
 * The workbook after the prepared edit: the active sheet replaced (its legacy
 * Watch Window payload kept as it was, an imported grid's row metrics
 * following a changed height) and what the edit means for the other
 * worksheets written in the same commit, so one Undo restores both.
 */
export function workbookAfterActiveSheetEdit(
  sheets: readonly SheetModel[],
  activeIndex: number,
  sheet: SheetModel,
  prepared: SheetModel,
  followOthers: FollowOtherSheets<SheetModel> | undefined,
): { sheet: SheetModel; sheets: SheetModel[] } {
  const committedSheet = committedSheetEdit(sheet, prepared);
  return {
    sheet: committedSheet,
    sheets: sheets.map((candidate, index) =>
      index === activeIndex
        ? committedSheet
        : followOthers
          ? followOthers(candidate)
          : candidate,
    ),
  };
}
