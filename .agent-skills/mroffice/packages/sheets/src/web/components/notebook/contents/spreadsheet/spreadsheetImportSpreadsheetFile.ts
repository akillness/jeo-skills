"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { type RefObject } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { toast } from "@mrnote/core/web/hooks/use-toast.ts";
import { type CsvImportDelimiter, type CsvImportEncodingChoice, declaredCsvImportDelimiter } from "@mrnote/core/web/lib/spreadsheet/csv.ts";
import { type DelimitedImportNumberOptions, type DelimitedImportColumnDisposition, type DelimitedImportDateOrder } from "../../../../lib/spreadsheet/csv-import";
import { type TextToColumnsQualifier } from "@mrnote/core/web/lib/spreadsheet/text-to-columns.ts";
import { type SheetModel } from "./spreadsheetSheetModel";
import { columnLabel } from "./spreadsheetRangeA1";
import { DEFAULT_DELIMITED_IMPORT_NUMBER_OPTIONS, type CsvImportDelimiterChoice, type CsvImportLayoutMode, type SpreadsheetDelimitedImportPreview } from "./spreadsheetDelimitedImport";
import { type WorkbookImportAuthority, type MoveCopySheetLiveAuthority } from "./spreadsheetWindowHelpers";
import { isSpreadsheetWorkbookImportFile } from "./spreadsheetWindowConstants";
import { type CsvImportEncoding } from "@mrnote/core/web/lib/spreadsheet/csv.ts";
import { type DelimitedImportCellValue } from "../../../../lib/spreadsheet/csv-import";
import { type Dispatch, type SetStateAction } from "react";

/** What spreadsheetImportSpreadsheetFile reads from SpreadsheetWindow's render scope. */
export interface SpreadsheetImportSpreadsheetFileInputs {
  activeCell: { row: number; col: number; };
  buildDelimitedImportPreview: (bytes: ArrayBuffer, dialectHint: CsvImportDelimiter, encodingChoice: CsvImportEncodingChoice, delimiterChoice: CsvImportDelimiterChoice, customDelimiterInput?: string, textQualifier?: TextToColumnsQualifier, consecutiveDelimiters?: boolean, layoutMode?: CsvImportLayoutMode, fixedWidthBreaksInput?: string, startRow?: number, numberOptions?: DelimitedImportNumberOptions, columnDispositions?: readonly DelimitedImportColumnDisposition[], columnDateOrders?: readonly DelimitedImportDateOrder[]) => { detectedEncoding: CsvImportEncoding; effectiveDelimiter: CsvImportDelimiter | undefined; rawRows: string[][]; columnDispositions: DelimitedImportColumnDisposition[]; columnDateOrders: DelimitedImportDateOrder[]; cells: DelimitedImportCellValue[][]; };
  dataDialogWriteAllowedRef: RefObject<boolean>;
  delimitedPreviewErrorMessage: (error?: unknown) => string;
  liveWorkbookImportAuthorityRef: RefObject<Omit<WorkbookImportAuthority, "requestId">>;
  moveCopySheetLiveAuthorityRef: RefObject<MoveCopySheetLiveAuthority | null>;
  pageId: string;
  runWorkbookImport: (file: File, allowLossy?: boolean, authority?: WorkbookImportAuthority | null) => Promise<void>;
  setDelimitedImportPreview: Dispatch<SetStateAction<SpreadsheetDelimitedImportPreview | null>>;
  setSpreadsheetImporting: Dispatch<SetStateAction<boolean>>;
  sheet: SheetModel;
  sheets: SheetModel[];
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  workbookImportRequestRef: RefObject<number>;
}

/** Moved verbatim from SpreadsheetWindow (called at the same position, so hook order is unchanged). */
export function spreadsheetImportSpreadsheetFile({
  activeCell,
  buildDelimitedImportPreview,
  dataDialogWriteAllowedRef,
  delimitedPreviewErrorMessage,
  liveWorkbookImportAuthorityRef,
  moveCopySheetLiveAuthorityRef,
  pageId,
  runWorkbookImport,
  setDelimitedImportPreview,
  setSpreadsheetImporting,
  sheet,
  sheets,
  t,
  workbookImportRequestRef,
}: SpreadsheetImportSpreadsheetFileInputs) {
  const importSpreadsheetFile = (file: File, allowWorkbookReplacement = true) => {
    if (!dataDialogWriteAllowedRef.current) return;
    setDelimitedImportPreview(null);
    // capability:label-only — separates a workbook the user just picked from a
    // delimited-text file so the right reader runs. The file has no workspace
    // id yet; write permission was already checked above.
    if (isSpreadsheetWorkbookImportFile(file)) { // capability:label-only
      if (!allowWorkbookReplacement) {
        toast({
          variant: "destructive",
          title: t("spreadsheet.uiCopy.chooseATextOrCSVFile"),
          description: t("spreadsheet.uiCopy.thisEntryImportsDataValuesWithoutReplacingTheWorkbook"),
        });
        return;
      }
      void runWorkbookImport(file);
      return;
    }
    const liveWorkbook = liveWorkbookImportAuthorityRef.current;
    const liveSheet = moveCopySheetLiveAuthorityRef.current;
    if (
      !liveSheet ||
      liveWorkbook.pageId !== pageId ||
      liveWorkbook.workbook !== sheets ||
      liveSheet.pageId !== pageId ||
      liveSheet.workbook !== sheets ||
      liveSheet.sheet !== sheet
    ) {
      return;
    }
    const requestId = workbookImportRequestRef.current + 1;
    workbookImportRequestRef.current = requestId;
    const authority = Object.freeze({
      requestId,
      ...liveWorkbook,
      activeSheetIndex: liveSheet.activeSheetIndex,
      sheet: liveSheet.sheet,
      destination: Object.freeze({
        row: activeCell.row,
        col: activeCell.col,
      }),
    });
    const authorityIsCurrent = () => {
      const currentWorkbook = liveWorkbookImportAuthorityRef.current;
      const currentSheet = moveCopySheetLiveAuthorityRef.current;
      return (
        dataDialogWriteAllowedRef.current &&
        workbookImportRequestRef.current === authority.requestId &&
        currentWorkbook.pageId === authority.pageId &&
        currentWorkbook.workbook === authority.workbook &&
        currentWorkbook.title === authority.title &&
        currentWorkbook.referenceStyle === authority.referenceStyle &&
        currentWorkbook.viewOptions === authority.viewOptions &&
        currentSheet?.pageId === authority.pageId &&
        currentSheet.workbook === authority.workbook &&
        currentSheet.activeSheetIndex === authority.activeSheetIndex &&
        currentSheet.sheet === authority.sheet
      );
    };
    const finish = () => {
      if (workbookImportRequestRef.current === authority.requestId) {
        setSpreadsheetImporting(false);
      }
    };
    const rejectStale = () => {
      toast({
        variant: "destructive",
        title: t("spreadsheet.uiCopy.worksheetChanged"),
        description: t("spreadsheet.uiCopy.theDestinationWorksheetChangedWhileTheTextFileWas"),
      });
    };
    const reader = new FileReader();
    const rejectRead = (error?: unknown) => {
      const fallbackDescription = t("spreadsheet.uiCopy.theTextFileCouldNotBeReadUTF8");
      toast({
        variant: "destructive",
        title: t("spreadsheet.uiCopy.textImportFailed"),
        description:
          (error instanceof Error ? error.message : reader.error?.message) ??
          fallbackDescription,
      });
    };
    setSpreadsheetImporting(true);
    reader.onload = () => {
      try {
        // A newer file selection supersedes this read silently; only a still-
        // current request whose destination changed needs the stale warning.
        if (workbookImportRequestRef.current !== authority.requestId) return;
        if (!authorityIsCurrent()) {
          rejectStale();
          return;
        }
        if (!(reader.result instanceof ArrayBuffer)) {
          throw new Error(
            t("spreadsheet.uiCopy.theTextFileDidNotReturnDecodableBytes"),
          );
        }
        // A declared format (TSV) is the dialog's starting delimiter, which
        // the user can still change; other names only hint the detector.
        const declaredDelimiter = declaredCsvImportDelimiter(
          file.name,
          file.type,
        );
        const dialectHint =
          declaredDelimiter ??
          (file.name.toLowerCase().endsWith(".psv") ? "|" : ",");
        const delimiterChoice: CsvImportDelimiterChoice =
          declaredDelimiter ?? "auto";
        try {
          setDelimitedImportPreview({
            fileName: file.name,
            bytes: reader.result,
            dialectHint,
            layoutMode: "delimited",
            encodingChoice: "auto",
            delimiterChoice,
            customDelimiterInput: "",
            textQualifier: "double",
            consecutiveDelimiters: false,
            fixedWidthBreaksInput: "",
            startRow: 1,
            numberOptions: DEFAULT_DELIMITED_IMPORT_NUMBER_OPTIONS,
            selectedColumn: 0,
            destinationInput: `${columnLabel(authority.destination.col)}${authority.destination.row + 1}`,
            destination: authority.destination,
            ...buildDelimitedImportPreview(
              reader.result,
              dialectHint,
              "auto",
              delimiterChoice,
            ),
            authoritySheet: authority.sheet,
            authorityIsCurrent,
            rejectStale,
          });
        } catch (error) {
          setDelimitedImportPreview({
            fileName: file.name,
            bytes: reader.result,
            dialectHint,
            layoutMode: "delimited",
            encodingChoice: "auto",
            delimiterChoice,
            customDelimiterInput: "",
            textQualifier: "double",
            consecutiveDelimiters: false,
            fixedWidthBreaksInput: "",
            startRow: 1,
            numberOptions: DEFAULT_DELIMITED_IMPORT_NUMBER_OPTIONS,
            rawRows: [],
            cells: [],
            columnDispositions: [],
            columnDateOrders: [],
            selectedColumn: 0,
            destinationInput: `${columnLabel(authority.destination.col)}${authority.destination.row + 1}`,
            destination: authority.destination,
            error: delimitedPreviewErrorMessage(error),
            authoritySheet: authority.sheet,
            authorityIsCurrent,
            rejectStale,
          });
        }
      } catch (error) {
        rejectRead(error);
      } finally {
        finish();
      }
    };
    reader.onerror = () => {
      if (authorityIsCurrent()) rejectRead();
      finish();
    };
    reader.onabort = finish;
    try {
      reader.readAsArrayBuffer(file);
    } catch {
      rejectRead();
      finish();
    }
  };
  return {
    importSpreadsheetFile,
  };
}
