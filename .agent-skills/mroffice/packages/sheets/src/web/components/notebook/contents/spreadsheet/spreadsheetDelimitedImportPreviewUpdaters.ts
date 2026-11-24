"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { type RefObject } from "react";
import { type SpreadsheetDateSystem } from "@mrnote/core/web/lib/spreadsheet/excel-1900-calendar.ts";
import { type CsvImportDelimiter, type CsvImportEncodingChoice } from "@mrnote/core/web/lib/spreadsheet/csv.ts";
import { type DelimitedImportColumnDisposition, classifyDelimitedImportCell, type DelimitedImportDateOrder, type DelimitedImportNumberOptions } from "../../../../lib/spreadsheet/csv-import";
import { normalizeFixedWidthBreaks, type TextToColumnsQualifier } from "@mrnote/core/web/lib/spreadsheet/text-to-columns.ts";
import { type SpreadsheetDelimitedImportPreview, type CsvImportDelimiterChoice, type CsvImportLayoutMode } from "./spreadsheetDelimitedImport";
import { type CsvImportEncoding } from "@mrnote/core/web/lib/spreadsheet/csv.ts";
import { type DelimitedImportCellValue } from "../../../../lib/spreadsheet/csv-import";
import { type Dispatch, type SetStateAction } from "react";
import { excelDateSystemArg } from "@mrnote/core/web/lib/spreadsheet/excel-1900-calendar.ts";

/** What spreadsheetDelimitedImportPreviewUpdaters reads from SpreadsheetWindow's render scope. */
export interface SpreadsheetDelimitedImportPreviewUpdatersInputs {
  buildDelimitedImportPreview: (bytes: ArrayBuffer, dialectHint: CsvImportDelimiter, encodingChoice: CsvImportEncodingChoice, delimiterChoice: CsvImportDelimiterChoice, customDelimiterInput?: string, textQualifier?: TextToColumnsQualifier, consecutiveDelimiters?: boolean, layoutMode?: CsvImportLayoutMode, fixedWidthBreaksInput?: string, startRow?: number, numberOptions?: DelimitedImportNumberOptions, columnDispositions?: readonly DelimitedImportColumnDisposition[], columnDateOrders?: readonly DelimitedImportDateOrder[]) => { detectedEncoding: CsvImportEncoding; effectiveDelimiter: CsvImportDelimiter | undefined; rawRows: string[][]; columnDispositions: DelimitedImportColumnDisposition[]; columnDateOrders: DelimitedImportDateOrder[]; cells: DelimitedImportCellValue[][]; };
  delimitedPreviewErrorMessage: (error?: unknown) => string;
  locale: string;
  setDelimitedImportPreview: Dispatch<SetStateAction<SpreadsheetDelimitedImportPreview | null>>;
  workbookDateSystemRef: RefObject<SpreadsheetDateSystem | undefined>;
}

/** Moved verbatim from SpreadsheetWindow (called at the same position, so hook order is unchanged). */
export function spreadsheetDelimitedImportPreviewUpdaters({
  buildDelimitedImportPreview,
  delimitedPreviewErrorMessage,
  locale,
  setDelimitedImportPreview,
  workbookDateSystemRef,
}: SpreadsheetDelimitedImportPreviewUpdatersInputs) {
  const updateDelimitedImportPreview = (
    choices: Partial<
      Pick<
        SpreadsheetDelimitedImportPreview,
        | "layoutMode"
        | "encodingChoice"
        | "delimiterChoice"
        | "customDelimiterInput"
        | "textQualifier"
        | "consecutiveDelimiters"
        | "fixedWidthBreaksInput"
        | "startRow"
        | "numberOptions"
      >
    >,
  ) => {
    setDelimitedImportPreview((current) => {
      if (!current) return current;
      const layoutMode = choices.layoutMode ?? current.layoutMode;
      const encodingChoice =
        choices.encodingChoice ?? current.encodingChoice;
      const delimiterChoice =
        choices.delimiterChoice ?? current.delimiterChoice;
      const customDelimiterInput =
        choices.customDelimiterInput ?? current.customDelimiterInput;
      const textQualifier = choices.textQualifier ?? current.textQualifier;
      const consecutiveDelimiters =
        choices.consecutiveDelimiters ?? current.consecutiveDelimiters;
      const fixedWidthBreaksInput =
        choices.fixedWidthBreaksInput ?? current.fixedWidthBreaksInput;
      const startRow = choices.startRow ?? current.startRow;
      const numberOptions = choices.numberOptions ?? current.numberOptions;
      try {
        const rebuilt = buildDelimitedImportPreview(
          current.bytes,
          current.dialectHint,
          encodingChoice,
          delimiterChoice,
          customDelimiterInput,
          textQualifier,
          consecutiveDelimiters,
          layoutMode,
          fixedWidthBreaksInput,
          startRow,
          numberOptions,
          current.columnDispositions,
          current.columnDateOrders,
        );
        return {
          ...current,
          layoutMode,
          encodingChoice,
          delimiterChoice,
          customDelimiterInput,
          textQualifier,
          consecutiveDelimiters,
          fixedWidthBreaksInput,
          startRow,
          numberOptions,
          ...rebuilt,
          selectedColumn: Math.min(
            current.selectedColumn,
            Math.max(0, rebuilt.columnDispositions.length - 1),
          ),
          error: undefined,
        };
      } catch (error) {
        return {
          ...current,
          layoutMode,
          encodingChoice,
          delimiterChoice,
          customDelimiterInput,
          textQualifier,
          consecutiveDelimiters,
          fixedWidthBreaksInput,
          startRow,
          numberOptions,
          detectedEncoding: undefined,
          effectiveDelimiter: undefined,
          rawRows: [],
          cells: [],
          error: delimitedPreviewErrorMessage(error),
        };
      }
    });
  };

  const updateDelimitedImportFixedWidthBreaks = (
    breaks: readonly number[],
  ) => {
    updateDelimitedImportPreview({
      fixedWidthBreaksInput: normalizeFixedWidthBreaks(breaks).join(", "),
    });
  };

  const selectDelimitedImportColumn = (column: number) => {
    setDelimitedImportPreview((current) => {
      if (!current || current.columnDispositions.length === 0) return current;
      return {
        ...current,
        selectedColumn: Math.max(
          0,
          Math.min(column, current.columnDispositions.length - 1),
        ),
      };
    });
  };

  const updateDelimitedImportColumnDisposition = (
    disposition: DelimitedImportColumnDisposition,
  ) => {
    setDelimitedImportPreview((current) => {
      if (!current || current.columnDispositions.length === 0) return current;
      const columnDispositions = [...current.columnDispositions];
      columnDispositions[current.selectedColumn] = disposition;
      return {
        ...current,
        columnDispositions,
        cells: current.rawRows.map((line) =>
          line.map((value, column) =>
            classifyDelimitedImportCell(
              value,
              locale,
              columnDispositions[column] ?? "general",
              current.columnDateOrders[column] ?? "locale",
              current.numberOptions,
              { date1904: excelDateSystemArg(workbookDateSystemRef.current) },
            ),
          ),
        ),
      };
    });
  };

  const updateDelimitedImportColumnDateOrder = (
    dateOrder: DelimitedImportDateOrder,
  ) => {
    setDelimitedImportPreview((current) => {
      if (!current || current.columnDateOrders.length === 0) return current;
      const columnDateOrders = [...current.columnDateOrders];
      columnDateOrders[current.selectedColumn] = dateOrder;
      return {
        ...current,
        columnDateOrders,
        cells: current.rawRows.map((line) =>
          line.map((value, column) =>
            classifyDelimitedImportCell(
              value,
              locale,
              current.columnDispositions[column] ?? "general",
              columnDateOrders[column] ?? "locale",
              current.numberOptions,
              { date1904: excelDateSystemArg(workbookDateSystemRef.current) },
            ),
          ),
        ),
      };
    });
  };
  return {
    selectDelimitedImportColumn,
    updateDelimitedImportColumnDateOrder,
    updateDelimitedImportColumnDisposition,
    updateDelimitedImportFixedWidthBreaks,
    updateDelimitedImportPreview,
  };
}
