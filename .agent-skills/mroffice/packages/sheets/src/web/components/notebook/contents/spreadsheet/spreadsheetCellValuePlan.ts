/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { hasManualLineBreak } from "../../../../lib/spreadsheet/cell-text";
import { updateCellValue, updateCellValues } from "@mrnote/core/web/lib/spreadsheet/cell-buttons.ts";
import { withHyperlinkCellStyle } from "../../../../lib/spreadsheet/editing-buttons";
import {
  planDataTableResize,
  reconcileTableHeaderWrites,
  renameTableColumnReferencesInSheet,
  renameTableColumnsInSheet,
  tableHeaderRenamesAfterReplace,
  tableHeadersForCells,
  type TableColumnRename,
} from "../../../../lib/spreadsheet/table-buttons";
import { shiftFormula } from "@mrnote/core/web/lib/spreadsheet/formula-engine.ts";
import { type MergeSpan } from "@mrnote/core/web/lib/spreadsheet/merge-cells.ts";
import { isAuthorableTableTotalFormula, MAX_TOTALS_LABEL_LENGTH, normalizeTableColumnNames, renameDataTableTotalFormulaColumn, tableTotalCellOwnsValue, tableTotalCellValue, tableNativeStructureBlocked, TABLE_TOTAL_KINDS, type DataTable } from "@mrnote/core/web/lib/spreadsheet/data-table.ts";
import { inheritInsertedLineFormats } from "@mrnote/core/web/lib/spreadsheet/structural.ts";
import { tableAutoExpansionColumnName, type SpreadsheetTableAutoCorrectSettings } from "../../../../lib/spreadsheet/table-autocorrect";
import { type SpreadsheetAutoFillChoice } from "./SpreadsheetAutoFillOptionsButton";
import { type PasteOptionsChoice, type RichClipboard } from "@mrnote/core/web/lib/spreadsheet/paste-special.ts";
import { type TextRun as CellTextRun } from "@mrnote/core/web/lib/spreadsheet/cell-rich-text.ts";
import { type SheetModel } from "./spreadsheetSheetModel";
import { MAX_SHEET_COLS, MAX_SHEET_ROWS } from "./spreadsheetGridConstants";
import { type ExcelDateSystemArg } from "@mrnote/core/web/lib/spreadsheet/excel-1900-calendar.ts";

// Moved to the shared table layer (the command path renames a cleared header too); kept here for the window's importers.
export {
  reconcileTableHeaderWrites,
  renameTableColumnReferencesInSheet,
  renameTableColumnsInSheet,
  tableHeaderRenamesAfterReplace,
  type TableColumnRename,
};

/** An entry whose formula is a HYPERLINK call (its friendly name is the link). */
const HYPERLINK_ENTRY_RE = /^=\s*HYPERLINK\s*\(/i;

/**
 * The value an entry LEFT in the cell — Excel's reading of what was typed
 * ("50%" becomes 0.5, "1,234" becomes 1234), which is what data validation
 * judges. A formula entry has no stored value to judge yet, so its typed text
 * is returned and the rule meets the result on commit instead.
 */

export function storedEntryValue(
  sheet: SheetModel,
  row: number,
  col: number,
  typed: string,
): string {
  const stored = sheet.cells[`${row}:${col}`];
  if (!stored || stored.formula) return typed;
  return stored.value ?? typed;
}

export type SpreadsheetCellValuePlan =
  | {
      ok: false;
      reason:
        | "protected"
        | "spill"
        | "invalid-headers"
        | "native-column"
        | "invalid-calculated-formula"
        | "native-header"
        | "custom-totals"
        | "native-totals"
        | "invalid-total-formula"
        | "total-label-too-long";
    }
  | {
      ok: true;
      sheets: SheetModel[];
      sheet: SheetModel;
      committedValue: string;
      /**
       * What data validation judges: the value the cell HOLDS after the entry,
       * not the characters that were typed. Excel reads an entry before it
       * validates it, so "50%" typed into a cell whose rule allows a decimal
       * between 0 and 1 is the number 0.5 and passes, while "50" is rejected
       * (Microsoft Support, "Format numbers as percentages" for the reading,
       * "Apply data validation to cells" for the rule). A formula entry keeps
       * its typed text here — its result is judged on commit instead.
       */
      validationValue: string;
      workbookChanged: boolean;
      plainCell: boolean;
      recordMacro: boolean;
      /** Set when a table AutoCorrect acted (or offers to act) on this entry. */
      autoCorrect?: SpreadsheetTableAutoCorrect;
    };

/**
 * What the AutoCorrect Options button offers after an entry that Excel's table
 * AutoCorrect acted on (Microsoft Support, "AutoCorrect features in Excel").
 * `alternative` is the active sheet as the button's first choice leaves it:
 * - `expansion`: the table grew to take the entry ("Include new rows and
 *   columns in table"); the alternative is the entry without the growth
 *   ("Undo Table AutoExpansion").
 * - `calculated-column`: the formula filled its whole table column; the
 *   alternative keeps it in the typed cell only ("Undo Calculated Column").
 * - `calculated-overwrite`: the column already had exceptions, so the formula
 *   stayed in its cell; the alternative fills the column with it ("Overwrite
 *   all cells in this column with this formula").
 */
export interface SpreadsheetTableAutoCorrect {
  kind: "expansion" | "calculated-column" | "calculated-overwrite";
  tableId: string;
  alternative: SheetModel;
}

/**
 * Table AutoExpansion for an entry at (row, col): the row directly below a
 * table without a Totals Row, or the column directly right of it, joins the
 * table through the same Resize Table transaction, so a table the resize
 * refuses (native state it cannot keep, protection, merges, a neighbour)
 * simply does not grow. A column added at the right is named first (the entry
 * itself when it is typed in the header row), and the new line takes the
 * direct formats of the table line next to it (Microsoft Support, "Resize a
 * table by adding or removing rows and columns").
 */
export function planTableAutoExpansion(
  sheet: SheetModel,
  row: number,
  col: number,
  value: string,
  rangeHasLockedCell: (
    sheet: SheetModel,
    range: { r1: number; r2: number; c1: number; c2: number },
  ) => boolean,
  defaultColumnName?: (index: number) => string,
): { sheet: SheetModel; tableId: string } | null {
  const tables = sheet.dataTables ?? [];
  const inTable = tables.some(
    (table) =>
      row >= table.range.r1 &&
      row <= table.range.r2 + (table.totalsRow ? 1 : 0) &&
      col >= table.range.c1 &&
      col <= table.range.c2,
  );
  if (inTable) return null;
  const table = tables.find(
    ({ range, totalsRow }) =>
      (!totalsRow &&
        row === range.r2 + 1 &&
        col >= range.c1 &&
        col <= range.c2) ||
      (col === range.c2 + 1 && row >= range.r1 && row <= range.r2),
  );
  if (!table) return null;
  const below = row === table.range.r2 + 1;
  let base: SheetModel = {
    ...sheet,
    rowCount: Math.max(sheet.rowCount, Math.min(MAX_SHEET_ROWS, row + 1)),
    columnCount: Math.max(
      sheet.columnCount,
      Math.min(MAX_SHEET_COLS, col + 1),
    ),
  };
  if (!below && table.headerRow) {
    const header = table.range.r1;
    const current = String(base.cells[`${header}:${col}`]?.value ?? "").trim();
    if (row === header || current === "") {
      const names = tableHeadersForCells(table, base.cells);
      if (!names) return null;
      base = updateCellValue(
        base,
        header,
        col,
        row === header
          ? value.trim()
          : tableAutoExpansionColumnName(names, defaultColumnName),
      );
    }
  }
  const grown = planDataTableResize(
    base,
    table.id,
    below
      ? { ...table.range, r2: table.range.r2 + 1 }
      : { ...table.range, c2: table.range.c2 + 1 },
    rangeHasLockedCell,
    { defaultColumnName },
  );
  if (!grown || grown === base) return null;
  return {
    sheet: inheritInsertedLineFormats(
      grown,
      below ? "row" : "col",
      below ? row : col,
      1,
      below
        ? { from: table.range.c1, to: table.range.c2 }
        : {
            from: table.range.r1,
            to: table.range.r2 + (table.totalsRow ? 1 : 0),
          },
    ),
    tableId: table.id,
  };
}

/**
 * The paste a Paste Options button belongs to: the workbook it committed, the
 * selection it left, where it was pasted and how to paste it again (MRAI's
 * own Copy, or what another application put on the clipboard). `bottom` and
 * `right` are the pasted block's last cell, where the button sits.
 */
export interface SpreadsheetPasteOptionsOffer {
  committed: SheetModel[];
  selectionKey: string;
  row: number;
  col: number;
  bottom: number;
  right: number;
  choice: PasteOptionsChoice;
  source:
    | { kind: "own"; clipboard: RichClipboard }
    | {
        kind: "html";
        rows: string[][];
        cells: RichClipboard;
        merges: readonly MergeSpan[];
      }
    | { kind: "text"; rows: string[][] };
}

/** The fill-handle drag an Auto Fill Options button belongs to. */
export interface SpreadsheetAutoFillOffer {
  committed: SheetModel[];
  selectionKey: string;
  src: { r1: number; r2: number; c1: number; c2: number };
  target: { row: number; col: number };
  choice: SpreadsheetAutoFillChoice;
  /** Fill Series would extend the source (else Excel leaves it out). */
  series: boolean;
  /** The source is dates: Fill Days / Weekdays / Months / Years. */
  dates: boolean;
  /** A fill down one column, which Flash Fill can redo. */
  flashFill: boolean;
}

/** A Paste Options or Auto Fill Options choice waiting for the Undo of the
 * command it replaces to render (see smartTagReplay). */
export type SpreadsheetSmartTagReplay = (
  | {
      kind: "paste";
      base: SheetModel[];
      offer: SpreadsheetPasteOptionsOffer;
      choice: PasteOptionsChoice;
    }
  | {
      kind: "fill";
      base: SheetModel[];
      offer: SpreadsheetAutoFillOffer;
      choice: SpreadsheetAutoFillChoice;
    }
) & {
  /** An embedded workbook (a chart's data) undoes in its host, which hands
   * the undone sheets back later: `base` is then the sheets BEFORE the Undo,
   * and the choice runs on the first sheets that differ from them. */
  readonly awaitHostUndo?: true;
};

/** The native typing rules, with no React, save, history or socket mutations.
 * A batch caller threads each successful immutable result into the next step,
 * then commits once. Rejections leave the entire original workbook untouched. */
export function planSpreadsheetCellValue(
  sheets: SheetModel[],
  activeSheetIndex: number,
  {
    row,
    col,
    value,
    editedRuns,
  }: {
    row: number;
    col: number;
    value: string;
    /** An in-place edit's runs (runsForEditedText), kept when still valid. */
    editedRuns?: CellTextRun[];
  },
  context: {
    isEditableCell(sheet: SheetModel, row: number, col: number): boolean;
    rangeHasLockedCell(
      sheet: SheetModel,
      range: { r1: number; r2: number; c1: number; c2: number },
    ): boolean;
    spilled: { has(key: string): boolean };
    /**
     * The write is an entry the user typed into this very cell, so Excel's
     * rule applies: the entry wins over a spill footprint and the anchor
     * reads #SPILL!. Omitted, a spilled cell refuses the write, which is what
     * every non-interactive writer relies on.
     */
    spillOverwrite?: boolean;
    /**
     * The table AutoCorrect settings for an interactive entry. Omitted, a
     * table never grows and a formula still fills its calculated column,
     * which is what batch writers have always relied on.
     */
    autoCorrect?: SpreadsheetTableAutoCorrectSettings;
    /**
     * The value is an entry the user typed: it is read into a value and the
     * number format it implies (writeSpreadsheetEntryInto), with the UI
     * locale's currency and date order. Omitted, the text is stored as given.
     * `typedNumerals`: the user typed it into the cell or the formula bar, so
     * its digits read with the interface language's separators (5,5 in
     * German); every other entry keeps the canonical "." form.
     */
    entry?: { locale: string; date1904?: ExcelDateSystemArg; typedNumerals?: boolean };
    /**
     * The text a formula entered into a table's header row shows. Excel keeps
     * no formula there: the header becomes the static text of its result
     * (measured: =1+2 and =E1*2 typed into Sales' headers left text, the
     * second renamed by the unique-name rule). Omitted, the entry is the
     * column name as typed, which is what batch writers rely on.
     */
    headerFormulaText?: (formula: string, row: number, col: number) => string | null;
    /**
     * The localized "ColumnN" text a column that AutoExpansion adds is named
     * with ("列1" in Chinese). Omitted, Excel's English form.
     */
    defaultColumnName?: (index: number) => string;
    /**
     * The workbook theme's Hyperlink colour: an entry of a HYPERLINK formula
     * wears the Hyperlink cell style, as a link inserted by the dialog does
     * (`withHyperlinkCellStyle`). Omitted, the cell's style is left alone.
     */
    hyperlinkColor?: string;
  },
): SpreadsheetCellValuePlan {
  const sheet = sheets[activeSheetIndex];
  if (!sheet) return { ok: false, reason: "protected" };
  const dataTables = sheet.dataTables ?? [];
  const calculatedColumns = context.autoCorrect?.calculatedColumns !== false;
  // Sheet protection (Excel/WPS): a protected sheet refuses any mutation of a
  // LOCKED cell's content/formula. This is the single value-commit path
  // (typing, formula intellisense accept, fill, AI replace), so guarding here
  // covers all of them. A non-blocking notice tells the user why.
  if (!context.isEditableCell(sheet, row, col)) {
    return { ok: false, reason: "protected" };
  }
  // Dynamic-array spill (Excel parity). Microsoft Support, "How to correct a
  // #SPILL! error": the spill range is not blank, so the array cannot come
  // down and the anchor reads #SPILL! with "Spill range isn't blank" on its
  // error button. Excel never refuses the entry — THE USER'S VALUE WINS and
  // the array collapses — so a typed entry (`spillOverwrite`) goes through and
  // the overlay marks the anchor blocked. Every other writer (the AI/Copilot
  // batch route, fills, dialogs) still refuses: a writer the user is not
  // watching must not quietly destroy an array. Clearing an already-empty
  // spilled cell was, and stays, a harmless no-op.
  if (
    value.trim() &&
    !context.spillOverwrite &&
    context.spilled.has(`${row}:${col}`)
  ) {
    return { ok: false, reason: "spill" };
  }
  // Table AutoExpansion: grow first, then apply the ordinary typing rules to
  // the grown table, so a new row gets the calculated-column formulas and a
  // formula typed in a new column fills it. The write plus the growth is one
  // plan (one Undo step); the entry without the growth is the alternative the
  // AutoCorrect Options button offers.
  if (context.autoCorrect?.expandTables && value.trim() !== "") {
    const expansion = planTableAutoExpansion(
      sheet,
      row,
      col,
      value,
      context.rangeHasLockedCell,
      context.defaultColumnName,
    );
    if (expansion) {
      const settled = {
        ...context,
        autoCorrect: { ...context.autoCorrect, expandTables: false },
      };
      const grown = planSpreadsheetCellValue(
        sheets.map((candidate, index) =>
          index === activeSheetIndex ? expansion.sheet : candidate,
        ),
        activeSheetIndex,
        { row, col, value },
        settled,
      );
      const plain = planSpreadsheetCellValue(
        sheets,
        activeSheetIndex,
        { row, col, value },
        settled,
      );
      if (grown.ok && plain.ok) {
        return {
          ...grown,
          plainCell: false,
          autoCorrect: {
            kind: "expansion",
            tableId: expansion.tableId,
            alternative: plain.sheet,
          },
        };
      }
    }
  }
  let autoCorrect: SpreadsheetTableAutoCorrect | undefined;
  const headerTable = dataTables.find(
    (table) =>
      table.headerRow &&
      row === table.range.r1 &&
      col >= table.range.c1 &&
      col <= table.range.c2,
  );
  const totalsTable = dataTables.find(
    (table) =>
      table.totalsRow &&
      row === table.range.r2 + 1 &&
      col >= table.range.c1 &&
      col <= table.range.c2,
  );
  const bodyTable = dataTables.find((table) => {
    const firstDataRow = table.range.r1 + (table.headerRow ? 1 : 0);
    return (
      row >= firstDataRow &&
      row <= table.range.r2 &&
      col >= table.range.c1 &&
      col <= table.range.c2
    );
  });
  if (bodyTable) {
    const offset = col - bodyTable.range.c1;
    const firstDataRow = bodyTable.range.r1 + (bodyTable.headerRow ? 1 : 0);
    const canonical = bodyTable.calculatedFormulas?.[offset];
    const formula = value.trim();
    // A table whose native parts MRAI only carries (an array calculated
    // column, an extension...) takes no formula into its body: a formula may
    // make or change a calculated column. A constant stays in its one cell,
    // as Excel keeps it (an exception in a calculated column), and leaves the
    
    // Tabela1's array calculated columns refused 2023 typed into its Year).
    if (tableNativeStructureBlocked(bodyTable) && formula.startsWith("=")) {
      return { ok: false, reason: "native-column" };
    }
    const dataRows = Array.from(
      { length: Math.max(0, bodyTable.range.r2 - firstDataRow + 1) },
      (_, rowOffset) => firstDataRow + rowOffset,
    );
    // Only a formula creates or changes a calculated column. Anything else
    // typed into one (a constant, or a formula when the column already has
    // exceptions) stays in that one cell as an exception and the column stays
    // calculated (Microsoft Support, "Use calculated columns in an Excel
    // table" and "Inconsistent calculated column formula"). The cell being
    // replaced does not count against an otherwise empty column.
    const columnIsEmpty = dataRows.every((targetRow) => {
      if (targetRow === row) return true;
      const cell = sheet.cells[`${targetRow}:${col}`];
      return String(cell?.formula ?? cell?.value ?? "").trim() === "";
    });
    if (
      calculatedColumns &&
      formula.startsWith("=") &&
      (canonical || columnIsEmpty)
    ) {
      const nextCanonical = shiftFormula(formula, firstDataRow - row, 0);
      if (!isAuthorableTableTotalFormula(nextCanonical)) {
        return { ok: false, reason: "invalid-calculated-formula" };
      }
      const hasExceptions =
        canonical !== undefined &&
        dataRows.some((targetRow) => {
          if (targetRow === row) return false;
          const cell = sheet.cells[`${targetRow}:${col}`];
          return (
            (cell?.formula ?? cell?.value ?? "") !==
            shiftFormula(canonical, targetRow - firstDataRow, 0)
          );
        });
      const fillLocked = context.rangeHasLockedCell(sheet, {
        r1: firstDataRow,
        r2: bodyTable.range.r2,
        c1: col,
        c2: col,
      });
      const fillColumn = (): SheetModel => {
        let filled = sheet;
        for (const targetRow of dataRows) {
          filled = updateCellValue(
            filled,
            targetRow,
            col,
            shiftFormula(nextCanonical, targetRow - firstDataRow, 0),
          );
        }
        const nextTable: DataTable = {
          ...bodyTable,
          calculatedFormulas: {
            ...(bodyTable.calculatedFormulas ?? {}),
            [offset]: nextCanonical,
          },
        };
        return {
          ...filled,
          dataTables: dataTables.map((table) =>
            table.id === bodyTable.id ? nextTable : table,
          ),
        };
      };
      if (hasExceptions) {
        // The entry is written to its own cell below; the AutoCorrect Options
        // button offers "Overwrite all cells in this column with this formula".
        if (nextCanonical !== canonical && !fillLocked) {
          autoCorrect = {
            kind: "calculated-overwrite",
            tableId: bodyTable.id,
            alternative: fillColumn(),
          };
        }
      } else {
        if (fillLocked) return { ok: false, reason: "protected" };
        const result = fillColumn();
        return {
          ok: true,
          sheets: sheets.map((candidate, index) =>
            index === activeSheetIndex ? result : candidate,
          ),
          sheet: result,
          committedValue: value,
          validationValue: storedEntryValue(result, row, col, value),
          workbookChanged: false,
          plainCell: false,
          recordMacro: false,
          ...(nextCanonical !== canonical
            ? {
                autoCorrect: {
                  kind: "calculated-column" as const,
                  tableId: bodyTable.id,
                  alternative: updateCellValue(sheet, row, col, value),
                },
              }
            : {}),
        };
      }
    }
  }
  if (
    headerTable &&
    (headerTable.nativeResizeBlocker === "query" ||
      headerTable.nativeResizeBlocker === "extension")
  ) {
    return { ok: false, reason: "native-header" };
  }
  let committedValue = value;
  let nextTables = dataTables;
  let nextSheet = sheet;
  let renamedColumn:
    { tableName: string; previousName: string; nextName: string } | undefined;
  if (headerTable) {
    const names =
      tableHeadersForCells(headerTable, sheet.cells) ??
      Array.from(
        { length: headerTable.range.c2 - headerTable.range.c1 + 1 },
        (_, index) => `Column${index + 1}`,
      );
    const offset = col - headerTable.range.c1;
    const previousName = names[offset];
    names[offset] =
      value.startsWith("=") && value.length > 1 && context.headerFormulaText
        ? context.headerFormulaText(value, row, col) ?? value
        : value;
    // The other columns keep their names; a name already taken gets Excel's
    // number on the column being entered (S-124: the column that already had
    // the name was renamed instead, and its references followed the edited
    // column, so Amount = [@Qty]*[@Price] became Qty*Qty).
    const normalized = normalizeTableColumnNames(names, {
      keep: names.map((_name, index) => index !== offset),
    });
    committedValue = normalized[offset];
    if (previousName !== committedValue) {
      renamedColumn = {
        tableName: headerTable.name,
        previousName,
        nextName: committedValue,
      };
    }
    const previousColumns = headerTable.columns;
    const nextHeaderTable: DataTable = {
      ...headerTable,
      columns: normalized.map((name, index) => ({
        id: previousColumns?.[index]?.id ?? index + 1,
        name,
      })),
    };
    if (renamedColumn && headerTable.totalFormulas) {
      const rename = renamedColumn;
      nextHeaderTable.totalFormulas = Object.fromEntries(
        Object.entries(headerTable.totalFormulas).map(([index, formula]) => [
          index,
          renameDataTableTotalFormulaColumn(
            formula,
            headerTable.name,
            rename.previousName,
            rename.nextName,
          ),
        ]),
      );
    }
    if (renamedColumn && headerTable.calculatedFormulas) {
      const rename = renamedColumn;
      nextHeaderTable.calculatedFormulas = Object.fromEntries(
        Object.entries(headerTable.calculatedFormulas).map(
          ([index, formula]) => [
            index,
            renameDataTableTotalFormulaColumn(
              formula,
              headerTable.name,
              rename.previousName,
              rename.nextName,
            ),
          ],
        ),
      );
    }
    if (headerTable.totalsRow) {
      const totalsRow = headerTable.range.r2 + 1;
      const previousNames = tableHeadersForCells(headerTable, sheet.cells);
      if (!previousNames) return { ok: false, reason: "invalid-headers" };
      for (let index = 0; index < previousNames.length; index += 1) {
        const totalCol = headerTable.range.c1 + index;
        const currentTotal = String(
          sheet.cells[`${totalsRow}:${totalCol}`]?.value ?? "",
        );
        if (!context.isEditableCell(sheet, totalsRow, totalCol)) {
          return { ok: false, reason: "protected" };
        }
        if (
          !tableTotalCellOwnsValue(
            headerTable,
            index,
            previousNames[index],
            currentTotal,
          )
        ) {
          return { ok: false, reason: "custom-totals" };
        }
      }
      nextSheet = updateCellValues(nextSheet, normalized.map((name, index) => ({
        row: totalsRow,
        col: headerTable.range.c1 + index,
        value: tableTotalCellValue(nextHeaderTable, index, name),
      })));
    }
    // One copy of the cell map for the whole row: a value typed in the header
    // of a table of 44 columns copied its 100,000 cells 43 times, 2.5 s of a
    // keypress on the 1.6 MB benchmark.
    nextSheet = updateCellValues(nextSheet, normalized.map((name, index) => ({
      row: headerTable.range.r1,
      col: headerTable.range.c1 + index,
      value: name,
    })));
    nextTables = dataTables.map((table) =>
      table.id === headerTable.id ? nextHeaderTable : table,
    );
  } else if (totalsTable) {
    if (tableNativeStructureBlocked(totalsTable)) {
      return { ok: false, reason: "native-totals" };
    }
    const headers = tableHeadersForCells(totalsTable, sheet.cells);
    if (!headers) return { ok: false, reason: "invalid-headers" };
    const offset = col - totalsTable.range.c1;
    const totals = { ...(totalsTable.totals ?? {}) };
    const totalLabels = { ...(totalsTable.totalLabels ?? {}) };
    const totalFormulas = { ...(totalsTable.totalFormulas ?? {}) };
    const trimmed = value.trim();
    if (trimmed.startsWith("=")) {
      if (!isAuthorableTableTotalFormula(trimmed)) {
        return { ok: false, reason: "invalid-total-formula" };
      }
      const builtIn = TABLE_TOTAL_KINDS.find(
        (candidate) =>
          candidate !== "none" &&
          candidate !== "custom" &&
          tableTotalCellOwnsValue(
            {
              ...totalsTable,
              totals: { ...totals, [offset]: candidate },
              totalFormulas: undefined,
            },
            offset,
            headers[offset],
            trimmed,
          ),
      );
      totals[offset] = builtIn ?? "custom";
      if (builtIn) delete totalFormulas[offset];
      else totalFormulas[offset] = trimmed;
      delete totalLabels[offset];
      committedValue = trimmed;
    } else if (value === "") {
      delete totals[offset];
      delete totalLabels[offset];
      delete totalFormulas[offset];
    } else {
      if (value.length > MAX_TOTALS_LABEL_LENGTH) {
        return { ok: false, reason: "total-label-too-long" };
      }
      delete totals[offset];
      delete totalFormulas[offset];
      totalLabels[offset] = value;
    }
    const nextTable: DataTable = { ...totalsTable };
    if (Object.keys(totals).length > 0) nextTable.totals = totals;
    else delete nextTable.totals;
    if (Object.keys(totalLabels).length > 0) {
      nextTable.totalLabels = totalLabels;
    } else {
      delete nextTable.totalLabels;
    }
    if (Object.keys(totalFormulas).length > 0) {
      nextTable.totalFormulas = totalFormulas;
    } else {
      delete nextTable.totalFormulas;
    }
    nextTables = dataTables.map((table) =>
      table.id === totalsTable.id ? nextTable : table,
    );
    nextSheet = updateCellValue(nextSheet, row, col, committedValue);
  } else {
    // An entry (context.entry) is read as Excel reads it; a header stays the
    // text a table column is named by, and a totals cell keeps its label.
    nextSheet = updateCellValue(
      nextSheet,
      row,
      col,
      committedValue,
      context.entry?.locale,
      editedRuns,
      context.entry?.date1904,
      context.entry?.typedNumerals === true,
    );
    // An entry with a line break (Alt+Enter; Control+Option+Return on a Mac)
    // turns the cell's Wrap Text on, as Excel does on entering it, in the
    // same step as the entry so one Undo takes both back. Its lines show:
    // without Wrap Text Excel draws a cell's breaks as nothing.
    if (context.entry && hasManualLineBreak(committedValue) && !committedValue.startsWith("=")) {
      const key = `${row}:${col}`;
      const cell = nextSheet.cells[key];
      if (cell && cell.style?.wrapText !== true) {
        nextSheet = { ...nextSheet, cells: { ...nextSheet.cells, [key]: { ...cell, style: { ...cell.style, wrapText: true } } } };
      }
    }
    // Excel formats the cell of an entered =HYPERLINK(...) as a link: its
    // friendly name "is displayed in blue and is underlined" (Microsoft
    // Support, "HYPERLINK function"). The formula's text was a link one could
    // not tell from plain text (live audit S-138). Only the colour and the
    // underline the cell has not set itself are added.
    if (context.entry && context.hyperlinkColor && HYPERLINK_ENTRY_RE.test(committedValue)) {
      const key = `${row}:${col}`;
      const cell = nextSheet.cells[key];
      if (cell) {
        const style = withHyperlinkCellStyle(cell.style, context.hyperlinkColor);
        if (style.color !== cell.style?.color || style.underline !== cell.style?.underline) {
          nextSheet = { ...nextSheet, cells: { ...nextSheet.cells, [key]: { ...cell, style } } };
        }
      }
    }
  }
  if (headerTable || totalsTable) {
    nextSheet = { ...nextSheet, dataTables: nextTables };
  }
  const nextSheets =
    headerTable && renamedColumn
      ? sheets.map((candidate, sheetIndex) =>
          renameTableColumnReferencesInSheet(
            sheetIndex === activeSheetIndex ? nextSheet : candidate,
            renamedColumn.tableName,
            renamedColumn.previousName,
            renamedColumn.nextName,
          ),
        )
      : sheets.map((candidate, sheetIndex) =>
          sheetIndex === activeSheetIndex ? nextSheet : candidate,
        );
  return {
    ok: true,
    sheets: nextSheets,
    sheet: nextSheets[activeSheetIndex],
    committedValue,
    validationValue: storedEntryValue(
      nextSheets[activeSheetIndex],
      row,
      col,
      committedValue,
    ),
    workbookChanged: Boolean(headerTable && renamedColumn),
    plainCell: !headerTable && !totalsTable,
    recordMacro: true,
    ...(autoCorrect ? { autoCorrect } : {}),
  };
}


