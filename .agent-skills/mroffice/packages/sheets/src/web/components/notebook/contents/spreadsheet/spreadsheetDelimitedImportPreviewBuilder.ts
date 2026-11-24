"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { type RefObject } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { type SpreadsheetDateSystem } from "@mrnote/core/web/lib/spreadsheet/excel-1900-calendar.ts";
import { type CsvImportDelimiter, type CsvImportEncodingChoice, decodeCsvImportBytes, resolveCsvImportDialect, normalizeCsvImportDelimiter, csvImportTextQualifierCharacter } from "@mrnote/core/web/lib/spreadsheet/csv.ts";
import { type DelimitedImportNumberOptions, type DelimitedImportColumnDisposition, type DelimitedImportDateOrder, delimitedImportNumberOptionsAreValid, parseFixedWidthText, parseDelimited, classifyDelimitedImportCell, DelimitedImportLimitError } from "../../../../lib/spreadsheet/csv-import";
import { type TextToColumnsQualifier } from "@mrnote/core/web/lib/spreadsheet/text-to-columns.ts";
import { type CsvImportDelimiterChoice, type CsvImportLayoutMode, DEFAULT_DELIMITED_IMPORT_NUMBER_OPTIONS, CSV_IMPORT_MAX_START_ROW, CSV_IMPORT_START_ROW_INVALID, CSV_IMPORT_NUMBER_SEPARATOR_CONFLICT, parseCsvImportFixedWidthBreaks, CSV_IMPORT_FIXED_WIDTH_BREAKS_INVALID, CSV_IMPORT_CUSTOM_DELIMITER_INVALID, CSV_IMPORT_DELIMITER_QUALIFIER_CONFLICT } from "./spreadsheetDelimitedImport";
import { excelDateSystemArg } from "@mrnote/core/web/lib/spreadsheet/excel-1900-calendar.ts";

/** What spreadsheetDelimitedImportPreviewBuilder reads from SpreadsheetWindow's render scope. */
export interface SpreadsheetDelimitedImportPreviewBuilderInputs {
  locale: string;
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  workbookDateSystemRef: RefObject<SpreadsheetDateSystem | undefined>;
}

/** Moved verbatim from SpreadsheetWindow (called at the same position, so hook order is unchanged). */
export function spreadsheetDelimitedImportPreviewBuilder({
  locale,
  t,
  workbookDateSystemRef,
}: SpreadsheetDelimitedImportPreviewBuilderInputs) {
  const buildDelimitedImportPreview = (
    bytes: ArrayBuffer,
    dialectHint: CsvImportDelimiter,
    encodingChoice: CsvImportEncodingChoice,
    delimiterChoice: CsvImportDelimiterChoice,
    customDelimiterInput = "",
    textQualifier: TextToColumnsQualifier = "double",
    consecutiveDelimiters = false,
    layoutMode: CsvImportLayoutMode = "delimited",
    fixedWidthBreaksInput = "",
    startRow = 1,
    numberOptions: DelimitedImportNumberOptions =
      DEFAULT_DELIMITED_IMPORT_NUMBER_OPTIONS,
    columnDispositions: readonly DelimitedImportColumnDisposition[] = [],
    columnDateOrders: readonly DelimitedImportDateOrder[] = [],
  ) => {
    const decoded = decodeCsvImportBytes(bytes, encodingChoice);
    if (
      !Number.isInteger(startRow) ||
      startRow < 1 ||
      startRow > CSV_IMPORT_MAX_START_ROW
    ) {
      throw new Error(CSV_IMPORT_START_ROW_INVALID);
    }
    if (!delimitedImportNumberOptionsAreValid(locale, numberOptions)) {
      throw new Error(CSV_IMPORT_NUMBER_SEPARATOR_CONFLICT);
    }
    let effectiveDelimiter: CsvImportDelimiter | undefined;
    let parsedRows: string[][];
    if (layoutMode === "fixedWidth") {
      const fixedWidthBreaks = parseCsvImportFixedWidthBreaks(
        fixedWidthBreaksInput,
      );
      if (fixedWidthBreaks === null) {
        throw new Error(CSV_IMPORT_FIXED_WIDTH_BREAKS_INVALID);
      }
      parsedRows = parseFixedWidthText(decoded.text, fixedWidthBreaks);
    } else {
      const detectedDialect = resolveCsvImportDialect(
        decoded.text,
        dialectHint,
        textQualifier,
        consecutiveDelimiters,
      );
      if (delimiterChoice === "auto") {
        effectiveDelimiter = detectedDialect.delimiter;
      } else if (delimiterChoice === "custom") {
        const customDelimiter = normalizeCsvImportDelimiter(
          customDelimiterInput,
        );
        if (!customDelimiter) {
          throw new Error(CSV_IMPORT_CUSTOM_DELIMITER_INVALID);
        }
        effectiveDelimiter = customDelimiter;
      } else {
        effectiveDelimiter = delimiterChoice;
      }
      if (
        effectiveDelimiter === csvImportTextQualifierCharacter(textQualifier)
      ) {
        throw new Error(CSV_IMPORT_DELIMITER_QUALIFIER_CONFLICT);
      }
      parsedRows = parseDelimited(
        detectedDialect.text,
        effectiveDelimiter,
        textQualifier,
        consecutiveDelimiters,
      );
    }
    const records = parsedRows.slice(startRow - 1);
    const columnCount = Math.max(0, ...records.map((line) => line.length));
    // Every record is projected onto the preview's columns: a field a short
    // record lacks is an empty field, so the preview, the overwrite check and
    // the write all clear that cell, exactly as an explicit empty field does.
    const rawRows = records.map((line) =>
      line.length < columnCount
        ? [...line, ...Array<string>(columnCount - line.length).fill("")]
        : line,
    );
    const nextColumnDispositions = Array.from(
      { length: columnCount },
      (_, column) => columnDispositions[column] ?? "general",
    );
    const nextColumnDateOrders = Array.from(
      { length: columnCount },
      (_, column) => columnDateOrders[column] ?? "locale",
    );
    return {
      detectedEncoding: decoded.encoding,
      effectiveDelimiter,
      rawRows,
      columnDispositions: nextColumnDispositions,
      columnDateOrders: nextColumnDateOrders,
      cells: rawRows.map((line) =>
        line.map((value, column) =>
          classifyDelimitedImportCell(
            value,
            locale,
            nextColumnDispositions[column] ?? "general",
            nextColumnDateOrders[column] ?? "locale",
            numberOptions,
            { date1904: excelDateSystemArg(workbookDateSystemRef.current) },
          ),
        ),
      ),
    };
  };

  const delimitedPreviewErrorMessage = (error?: unknown) => {
    if (
      error instanceof Error &&
      error.message === CSV_IMPORT_CUSTOM_DELIMITER_INVALID
    ) {
      return t("spreadsheet.uiCopy.enterOneDelimiterCharacterOtherThanADoubleQuote");
    }
    if (
      error instanceof Error &&
      error.message === CSV_IMPORT_DELIMITER_QUALIFIER_CONFLICT
    ) {
      return t("spreadsheet.uiCopy.theDelimiterAndTextQualifierMustUseDifferentCharacters");
    }
    if (
      error instanceof Error &&
      error.message === CSV_IMPORT_START_ROW_INVALID
    ) {
      return t("spreadsheet.dynamicCopy.invalidImportStartRow", { limit: CSV_IMPORT_MAX_START_ROW });
    }
    if (
      error instanceof Error &&
      error.message === CSV_IMPORT_NUMBER_SEPARATOR_CONFLICT
    ) {
      return t("spreadsheet.uiCopy.theDecimalAndThousandsSeparatorsMustBeDifferent");
    }
    if (
      error instanceof Error &&
      error.message === CSV_IMPORT_FIXED_WIDTH_BREAKS_INVALID
    ) {
      return t("spreadsheet.uiCopy.columnBreaksMustBePositiveIntegersSuchAs8");
    }
    if (error instanceof DelimitedImportLimitError) {
      // Codes have distinct scanner/fixed-width/projection variants. Translate
      // only known canonical diagnostics; preserve custom messages verbatim.
      const known: Record<string, Record<string, { key: string; limit?: number }>> = {
        "csv_row_limit_exceeded": {
          "Delimited files may contain at most 10000 rows.": {
            "key": "spreadsheet.surfaceCopy.importLimit.delimitedRowLimit",
            "limit": 10000
          },
          "Fixed-width files may contain at most 10000 rows.": {
            "key": "spreadsheet.surfaceCopy.importLimit.fixedWidthRowLimit",
            "limit": 10000
          }
        },
        "csv_column_limit_exceeded": {
          "Delimited files may contain at most 1000 columns.": {
            "key": "spreadsheet.surfaceCopy.importLimit.delimitedColumnLimit",
            "limit": 1000
          },
          "Fixed-width files may contain at most 1000 columns.": {
            "key": "spreadsheet.surfaceCopy.importLimit.fixedWidthColumnLimit",
            "limit": 1000
          }
        },
        "csv_cell_limit_exceeded": {
          "Delimited input contains too many materialized fields.": {
            "key": "spreadsheet.surfaceCopy.importLimit.delimitedFieldLimit"
          },
          "Delimited files may contain at most 50000 populated cells.": {
            "key": "spreadsheet.surfaceCopy.importLimit.delimitedCellLimit",
            "limit": 50000
          },
          "Fixed-width files may contain at most 50000 materialized fields.": {
            "key": "spreadsheet.surfaceCopy.importLimit.fixedWidthFieldLimit",
            "limit": 50000
          }
        },
        "csv_text_limit_exceeded": {
          "Delimited text exceeds the import text budget.": {
            "key": "spreadsheet.surfaceCopy.importLimit.delimitedTextLimit"
          },
          "Fixed-width text exceeds the import text budget.": {
            "key": "spreadsheet.surfaceCopy.importLimit.fixedWidthTextLimit"
          },
          "The import contains too much projected text.": {
            "key": "spreadsheet.surfaceCopy.importLimit.projectedTextLimit"
          }
        },
        "csv_node_limit_exceeded": {
          "The import contains too many projected objects.": {
            "key": "spreadsheet.surfaceCopy.importLimit.projectedObjectLimit"
          }
        },
        "csv_malformed": {
          "The delimiter and text qualifier must be different characters.": {
            "key": "spreadsheet.surfaceCopy.importLimit.delimiterQualifierConflict"
          },
          "The delimiter must be one non-newline character.": {
            "key": "spreadsheet.surfaceCopy.importLimit.invalidDelimiterCharacter"
          },
          "Delimited input contains data after a closing quote.": {
            "key": "spreadsheet.surfaceCopy.importLimit.dataAfterClosingQuote"
          },
          "Delimited input contains a text qualifier inside an unquoted field.": {
            "key": "spreadsheet.surfaceCopy.importLimit.qualifierInsideUnquotedField"
          },
          "Delimited input contains an unterminated qualified field.": {
            "key": "spreadsheet.surfaceCopy.importLimit.unterminatedQualifiedField"
          }
        }
      };
      const variants = Object.prototype.hasOwnProperty.call(known, error.code) ? known[error.code] : undefined;
      const message = variants && Object.prototype.hasOwnProperty.call(variants, error.message) ? variants[error.message] : undefined;
      return message ? t(message.key, message.limit === undefined ? undefined : { limit: message.limit }) : error.message;
    }
    return t("spreadsheet.uiCopy.thisFileCannotBePreviewedWithTheSelectedEncoding");
  };
  return {
    buildDelimitedImportPreview,
    delimitedPreviewErrorMessage,
  };
}
