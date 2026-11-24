/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { MAX_GRID_COLUMNS, MAX_GRID_ROWS } from "@mrnote/core/web/lib/spreadsheet/grid-sizing.ts";
import { type CsvImportDelimiter, type CsvImportEncoding, type CsvImportEncodingChoice } from "@mrnote/core/web/lib/spreadsheet/csv.ts";
import { type DelimitedImportColumnDisposition, type DelimitedImportCellValue, type DelimitedImportDateOrder, type DelimitedImportNumberOptions } from "../../../../lib/spreadsheet/csv-import";
import { normalizeFixedWidthBreaks, type TextToColumnsQualifier } from "@mrnote/core/web/lib/spreadsheet/text-to-columns.ts";
import { type SheetModel } from "./spreadsheetSheetModel";

export type CsvImportDelimiterChoice = "auto" | "custom" | CsvImportDelimiter;
export type CsvImportLayoutMode = "delimited" | "fixedWidth";
export const CSV_IMPORT_CUSTOM_DELIMITER_INVALID =
  "spreadsheet_csv_custom_delimiter_invalid";
export const CSV_IMPORT_DELIMITER_QUALIFIER_CONFLICT =
  "spreadsheet_csv_delimiter_qualifier_conflict";
export const CSV_IMPORT_START_ROW_INVALID = "spreadsheet_csv_start_row_invalid";
export const CSV_IMPORT_NUMBER_SEPARATOR_CONFLICT =
  "spreadsheet_csv_number_separator_conflict";
export const CSV_IMPORT_FIXED_WIDTH_BREAKS_INVALID =
  "spreadsheet_csv_fixed_width_breaks_invalid";
// Excel's own bound for the wizard's "Start import at row" (1 through 32,767:
// Microsoft Learn, TextConnection.TextFileStartRow / QueryTable.TextFileStartRow).
export const CSV_IMPORT_MAX_START_ROW = 32_767;
export const DEFAULT_DELIMITED_IMPORT_NUMBER_OPTIONS = {
  decimalSeparator: "locale",
  thousandsSeparator: "locale",
  trailingMinus: false,
} as const satisfies DelimitedImportNumberOptions;

export function parseCsvImportFixedWidthBreaks(input: string): number[] | null {
  const trimmed = input.trim();
  if (!trimmed) return [];
  const tokens = trimmed.split(/[\s,]+/);
  if (tokens.some((token) => !/^\d+$/.test(token) || Number(token) <= 0)) {
    return null;
  }
  const breaks = normalizeFixedWidthBreaks(tokens.map(Number));
  return breaks.length > 0 ? breaks : null;
}

interface SpreadsheetDelimitedImportDestination {
  readonly row: number;
  readonly col: number;
}

export interface SpreadsheetDelimitedImportPreview {
  readonly fileName: string;
  readonly bytes: ArrayBuffer;
  readonly dialectHint: CsvImportDelimiter;
  readonly layoutMode: CsvImportLayoutMode;
  readonly encodingChoice: CsvImportEncodingChoice;
  readonly delimiterChoice: CsvImportDelimiterChoice;
  readonly customDelimiterInput: string;
  readonly textQualifier: TextToColumnsQualifier;
  readonly consecutiveDelimiters: boolean;
  readonly fixedWidthBreaksInput: string;
  readonly startRow: number;
  readonly numberOptions: DelimitedImportNumberOptions;
  readonly detectedEncoding?: CsvImportEncoding;
  readonly effectiveDelimiter?: CsvImportDelimiter;
  readonly rawRows: readonly (readonly string[])[];
  readonly cells: readonly (readonly DelimitedImportCellValue[])[];
  readonly columnDispositions: readonly DelimitedImportColumnDisposition[];
  readonly columnDateOrders: readonly DelimitedImportDateOrder[];
  readonly selectedColumn: number;
  readonly destinationInput: string;
  readonly destination: SpreadsheetDelimitedImportDestination | null;
  readonly error?: string;
  readonly authoritySheet: SheetModel;
  readonly authorityIsCurrent: () => boolean;
  readonly rejectStale: () => void;
}

function delimitedImportProjectedColumnCount(
  preview: SpreadsheetDelimitedImportPreview,
): number {
  return preview.columnDispositions.filter(
    (disposition) => disposition !== "skip",
  ).length;
}

export function delimitedImportDestinationFits(
  preview: SpreadsheetDelimitedImportPreview,
): boolean {
  const destination = preview.destination;
  if (!destination) return false;
  return (
    destination.row + preview.cells.length <= MAX_GRID_ROWS &&
    destination.col + delimitedImportProjectedColumnCount(preview) <=
      MAX_GRID_COLUMNS
  );
}
