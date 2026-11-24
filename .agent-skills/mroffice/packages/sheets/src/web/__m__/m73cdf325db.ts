/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { type SpreadsheetCell } from "@mrnote/core/web/lib/spreadsheet/cell-buttons.ts";
import { type SheetModel } from "./spreadsheetSheetModel";
import { columnLabel, spreadsheetRangeA1 } from "../components/notebook/contents/spreadsheet/spreadsheetRangeA1";

// Cells an AI turn sends of the workbook and of the selection (the request
// carries 200,000 characters, ai-panel/request-context.ts). At 500/350 a
// question about a sheet of a few thousand cells was answered from its corner.
const SPREADSHEET_AI_DOCUMENT_CELL_LIMIT = 5_000;
const SPREADSHEET_AI_SELECTED_CELL_LIMIT = 5_000;
const SPREADSHEET_AI_SELECTED_TEXT_CELL_LIMIT = 5_000;

/** Presence is independent of escaping/formatting. Keep the line writer for
 * the bounded sample only; never allocate full-workbook AI strings on render. */
function spreadsheetCellHasAiContent(cell: SpreadsheetCell): boolean {
  return Boolean(String(cell.formula || "").trim() || String(cell.value ?? "") || String(cell.display ?? ""));
}

function spreadsheetCellAiLine(
  sheet: Pick<SheetModel, "id" | "name">,
  row: number,
  col: number,
  cell: SpreadsheetCell,
): string {
  const formula = String(cell.formula || "").trim();
  const value = String(cell.value ?? "").replace(/\r?\n/g, "\\n");
  const display = String(cell.display ?? "").replace(/\r?\n/g, "\\n");
  if (!formula && !value && !display) return "";
  return [
    `${sheet.name || sheet.id}!${columnLabel(col)}${row + 1}:`,
    formula ? `formula=${formula}` : "",
    `value=${JSON.stringify(value)}`,
    display && display !== value ? `display=${JSON.stringify(display)}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function spreadsheetWorkbookAiContext(
  sheets: readonly SheetModel[],
  activeSheetId: string,
  selection: { r1: number; c1: number; r2: number; c2: number },
): {
  selectedText: string;
  selectedTextTruncated: boolean;
  documentText: string;
  documentTextTruncated: boolean;
} {
  const sheetEntries = sheets.map((candidate) => ({
    sheet: candidate,
    entries: Object.entries(candidate.cells)
      .map(([key, cell]) => {
        const [rowText, colText] = key.split(":");
        return { row: Number(rowText), col: Number(colText), cell };
      })
      .filter(
        (entry) =>
          Number.isSafeInteger(entry.row) &&
          Number.isSafeInteger(entry.col) &&
          spreadsheetCellHasAiContent(entry.cell),
      )
      .sort((left, right) => left.row - right.row || left.col - right.col),
  }));
  const active =
    sheetEntries.find((entry) => entry.sheet.id === activeSheetId) ??
    sheetEntries[0];
  const selectedEntries = (active?.entries ?? []).filter(
    ({ row, col }) =>
      row >= selection.r1 &&
      row <= selection.r2 &&
      col >= selection.c1 &&
      col <= selection.c2,
  );
  const selectedLines = selectedEntries.slice(0, Math.max(
    SPREADSHEET_AI_SELECTED_TEXT_CELL_LIMIT, SPREADSHEET_AI_SELECTED_CELL_LIMIT,
  )).map(({ row, col, cell }) =>
    spreadsheetCellAiLine(active!.sheet, row, col, cell),
  );
  const selectedTextLines = selectedLines.slice(
    0,
    SPREADSHEET_AI_SELECTED_TEXT_CELL_LIMIT,
  );
  const selectedTextOmitted = selectedEntries.length - selectedTextLines.length;
  const selectedDocumentLines = selectedLines.slice(
    0,
    SPREADSHEET_AI_SELECTED_CELL_LIMIT,
  );
  const selectedDocumentOmitted =
    selectedEntries.length - selectedDocumentLines.length;
  const selectedKeys = new Set(
    selectedEntries.map(({ row, col }) => `${row}:${col}`),
  );
  const remainingBySheet = sheetEntries.map(({ sheet: candidate, entries }) => ({
    sheet: candidate,
    entries:
      candidate.id === active?.sheet.id
        ? entries.filter(({ row, col }) => !selectedKeys.has(`${row}:${col}`))
        : entries,
    cursor: 0,
  }));
  const documentLines = [...selectedDocumentLines];
  while (
    documentLines.length < SPREADSHEET_AI_DOCUMENT_CELL_LIMIT &&
    remainingBySheet.some((entry) => entry.cursor < entry.entries.length)
  ) {
    for (const candidate of remainingBySheet) {
      if (documentLines.length >= SPREADSHEET_AI_DOCUMENT_CELL_LIMIT) break;
      const entry = candidate.entries[candidate.cursor];
      if (!entry) continue;
      candidate.cursor += 1;
      documentLines.push(
        spreadsheetCellAiLine(
          candidate.sheet,
          entry.row,
          entry.col,
          entry.cell,
        ),
      );
    }
  }
  const totalNonEmptyCells = sheetEntries.reduce(
    (total, entry) => total + entry.entries.length,
    0,
  );
  const omittedDocumentCells = Math.max(
    0,
    totalNonEmptyCells - documentLines.length,
  );
  const activeSheet = active?.sheet;
  const selectedRange = spreadsheetRangeA1(selection);
  return {
    selectedText: [
      ...selectedTextLines,
      selectedTextOmitted > 0
        ? `[… ${selectedTextOmitted} selected non-empty cells omitted from this snapshot …]`
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
    selectedTextTruncated: selectedTextOmitted > 0,
    documentText: [
      `[Workbook · sheets=${sheets.length} · active=${activeSheet?.name || activeSheet?.id || "unknown"}]`,
      ...sheetEntries.map(
        ({ sheet: candidate, entries }) =>
          `[Sheet ${candidate.name || candidate.id}; ${candidate.rowCount} rows × ${candidate.columnCount} columns; ${entries.length} non-empty cells${candidate.hidden ? "; hidden" : ""}]`,
      ),
      `[Selected range ${activeSheet?.name || activeSheet?.id || activeSheetId}!${selectedRange}]`,
      selectedDocumentOmitted > 0
        ? `[… ${selectedDocumentOmitted} selected non-empty cells omitted from the workbook sample; see selected-text truncation flag …]`
        : "",
      ...documentLines,
      omittedDocumentCells > 0
        ? `[… ${omittedDocumentCells} non-empty workbook cells omitted after fair per-sheet sampling …]`
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
    documentTextTruncated:
      selectedDocumentOmitted > 0 || omittedDocumentCells > 0,
  };
}
