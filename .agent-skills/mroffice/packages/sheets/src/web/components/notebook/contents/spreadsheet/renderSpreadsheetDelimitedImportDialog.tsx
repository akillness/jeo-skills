"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { type RefObject } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { officeDialogParts as dialogParts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import SpreadsheetFixedWidthBreakRuler from "./SpreadsheetFixedWidthBreakRuler";
import { type CsvImportEncodingChoice, normalizeCsvImportDelimiter, csvImportTextQualifierCharacter, type CsvImportDelimiter } from "@mrnote/core/web/lib/spreadsheet/csv.ts";
import { type DelimitedImportDecimalSeparator, type DelimitedImportThousandsSeparator, type DelimitedImportColumnDisposition, type DelimitedImportDateOrder } from "../../../../lib/spreadsheet/csv-import";
import { type TextToColumnsQualifier } from "@mrnote/core/web/lib/spreadsheet/text-to-columns.ts";
import { delimitedImportDestinationFits, type CsvImportLayoutMode, type CsvImportDelimiterChoice, CSV_IMPORT_MAX_START_ROW, parseCsvImportFixedWidthBreaks, type SpreadsheetDelimitedImportPreview } from "./spreadsheetDelimitedImport";
import { type Dispatch, type SetStateAction } from "react";
import { SpreadsheetCollapseDialogButton } from "./SpreadsheetRangePicker";
import { type SpreadsheetRangePick } from "./useSpreadsheetRangePick";

/** What renderSpreadsheetDelimitedImportDialog reads from SpreadsheetWindow's render scope. */
export interface RenderSpreadsheetDelimitedImportDialogInputs {
  rangePick: SpreadsheetRangePick;
  confirmDelimitedImportPreview: () => void;
  dataDialogWriteAllowedRef: RefObject<boolean>;
  delimitedImportDelimiterLabel: (delimiter: CsvImportDelimiter | undefined) => string;
  delimitedImportDestinationIssue: (preview: SpreadsheetDelimitedImportPreview) => string | null;
  delimitedImportPreview: SpreadsheetDelimitedImportPreview | null;
  delimitedImportTextQualifierLabel: (qualifier: TextToColumnsQualifier) => string;
  /** Where closing hands the keyboard: the active cell, which an import moves
   * to its destination, without collapsing the selection it leaves. */
  returnFocusTarget: () => HTMLElement | null;
  selectDelimitedImportColumn: (column: number) => void;
  setDelimitedImportPreview: Dispatch<SetStateAction<SpreadsheetDelimitedImportPreview | null>>;
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  updateDelimitedImportColumnDateOrder: (dateOrder: DelimitedImportDateOrder) => void;
  updateDelimitedImportColumnDisposition: (disposition: DelimitedImportColumnDisposition) => void;
  updateDelimitedImportDestination: (destinationInput: string) => void;
  updateDelimitedImportFixedWidthBreaks: (breaks: readonly number[]) => void;
  updateDelimitedImportPreview: (choices: Partial<Pick<SpreadsheetDelimitedImportPreview, "layoutMode" | "encodingChoice" | "delimiterChoice" | "customDelimiterInput" | "textQualifier" | "consecutiveDelimiters" | "fixedWidthBreaksInput" | "startRow" | "numberOptions">>) => void;
}

/** Moved verbatim from SpreadsheetWindow's JSX: a render function (not a component), so the element tree React reconciles is unchanged. */
export function renderSpreadsheetDelimitedImportDialog({
  rangePick,
  confirmDelimitedImportPreview,
  dataDialogWriteAllowedRef,
  delimitedImportDelimiterLabel,
  delimitedImportDestinationIssue,
  delimitedImportPreview,
  delimitedImportTextQualifierLabel,
  returnFocusTarget,
  selectDelimitedImportColumn,
  setDelimitedImportPreview,
  t,
  updateDelimitedImportColumnDateOrder,
  updateDelimitedImportColumnDisposition,
  updateDelimitedImportDestination,
  updateDelimitedImportFixedWidthBreaks,
  updateDelimitedImportPreview,
}: RenderSpreadsheetDelimitedImportDialogInputs) {
  // Collapsed while a range of it is picked on the sheet.
  if (rangePick.picking("spreadsheet-delimited-import")) return null;
  return (
      <OfficeDialogShell
        open={Boolean(delimitedImportPreview)}
        title={
          t("spreadsheet.uiCopy.previewTextImport")
        }
        description={
          delimitedImportPreview
            ? t("spreadsheet.dynamicCopy.delimitedImportReview", { file: delimitedImportPreview.fileName })
            : ""
        }
        defaultActionLabel={t("spreadsheet.uiCopy.finish")}
        cancelActionLabel={t("common.cancel")}
        defaultActionDisabled={
          !dataDialogWriteAllowedRef.current ||
          !delimitedImportPreview ||
          Boolean(delimitedImportPreview.error) ||
          delimitedImportPreview.cells.length === 0 ||
          !delimitedImportDestinationFits(delimitedImportPreview) ||
          delimitedImportPreview.columnDispositions.every(
            (disposition) => disposition === "skip",
          )
        }
        onDefaultAction={confirmDelimitedImportPreview}
        onCancel={() => setDelimitedImportPreview(null)}
        returnFocusTarget={returnFocusTarget}
        className="sm:max-w-[760px]"
        testIdPrefix="spreadsheet-delimited-import"
      >
        {delimitedImportPreview ? (
          <>
            <div className="grid gap-3 sm:grid-cols-4">
              <label className={dialogParts.field}>
                <span className={dialogParts.label}>
                  {t("spreadsheet.uiCopy.fileEncoding")}
                </span>
                <select
                  value={delimitedImportPreview.encodingChoice}
                  onChange={(event) =>
                    updateDelimitedImportPreview({
                      encodingChoice: event.target
                        .value as CsvImportEncodingChoice,
                    })
                  }
                  data-testid="spreadsheet-delimited-import-encoding"
                >
                  <option value="auto">
                    {t("spreadsheet.uiCopy.autoDetect")}
                  </option>
                  <option value="utf-8">UTF-8</option>
                  <option value="utf-16le">UTF-16 LE</option>
                  <option value="utf-16be">UTF-16 BE</option>
                  <option value="gb18030">GB18030 / GBK</option>
                </select>
              </label>
              <label className={dialogParts.field}>
                <span className={dialogParts.label}>
                  {t("spreadsheet.uiCopy.originalDataType")}
                </span>
                <select
                  value={delimitedImportPreview.layoutMode}
                  onChange={(event) =>
                    updateDelimitedImportPreview({
                      layoutMode: event.target.value as CsvImportLayoutMode,
                    })
                  }
                  data-testid="spreadsheet-delimited-import-layout-mode"
                >
                  <option value="delimited">
                    {t("spreadsheet.uiCopy.delimited")}
                  </option>
                  <option value="fixedWidth">
                    {t("spreadsheet.textToColumnsModeFixedWidth")}
                  </option>
                </select>
              </label>
              <label className={dialogParts.field}>
                <span className={dialogParts.label}>
                  {t("spreadsheet.textToColumnsDelimiterLabel")}
                </span>
                <select
                  value={delimitedImportPreview.delimiterChoice}
                  disabled={delimitedImportPreview.layoutMode === "fixedWidth"}
                  onChange={(event) =>
                    updateDelimitedImportPreview({
                      delimiterChoice: event.target
                        .value as CsvImportDelimiterChoice,
                    })
                  }
                  data-testid="spreadsheet-delimited-import-delimiter"
                >
                  <option value="auto">
                    {t("spreadsheet.uiCopy.autoDetect")}
                  </option>
                  <option value=",">
                    {t("spreadsheet.textToColumnsComma")}
                  </option>
                  <option value=";">
                    {t("spreadsheet.textToColumnsSemicolon")}
                  </option>
                  <option value={"\t"}>
                    {t("spreadsheet.textToColumnsTab")}
                  </option>
                  <option value="|">
                    {t("spreadsheet.uiCopy.pipe")}
                  </option>
                  <option value=" ">
                    {t("spreadsheet.textToColumnsSpace")}
                  </option>
                  <option value="custom">
                    {t("spreadsheet.uiCopy.other")}
                  </option>
                </select>
              </label>
              <label className={dialogParts.field}>
                <span className={dialogParts.label}>
                  {t("spreadsheet.textToColumnsQualifier")}
                </span>
                <select
                  value={delimitedImportPreview.textQualifier}
                  disabled={delimitedImportPreview.layoutMode === "fixedWidth"}
                  onChange={(event) =>
                    updateDelimitedImportPreview({
                      textQualifier: event.target
                        .value as TextToColumnsQualifier,
                    })
                  }
                  data-testid="spreadsheet-delimited-import-text-qualifier"
                >
                  <option value="double">
                    {t("spreadsheet.textToColumnsQualifierDouble")}
                  </option>
                  <option value="single">
                    {t("spreadsheet.textToColumnsQualifierSingle")}
                  </option>
                  <option value="none">
                    {t("spreadsheet.textToColumnsQualifierNone")}
                  </option>
                </select>
              </label>
              <label className={dialogParts.field}>
                <span className={dialogParts.label}>
                  {t("spreadsheet.uiCopy.destinationCell")}
                </span>
                <span style={{ display: "flex", gap: 4 }}>
                  <input
                    value={delimitedImportPreview.destinationInput}
                    onChange={(event) =>
                      updateDelimitedImportDestination(event.target.value)
                    }
                    aria-invalid={Boolean(
                      delimitedImportDestinationIssue(delimitedImportPreview),
                    )}
                    aria-describedby="spreadsheet-delimited-import-destination-help"
                    spellCheck={false}
                    autoCapitalize="characters"
                    data-testid="spreadsheet-delimited-import-destination"
                    className="uppercase"
                    style={{ flex: 1, minWidth: 0 }}
                  />
                  <SpreadsheetCollapseDialogButton
                    label={t("spreadsheet.cfDialog.collapse")}
                    onClick={() =>
                      rangePick.start({
                        id: "spreadsheet-delimited-import-destination",
                        dialogLabel: t("spreadsheet.uiCopy.previewTextImport"),
                        inputLabel: t("spreadsheet.uiCopy.destinationCell"),
                        style: "absolute",
                        value: String(delimitedImportPreview.destinationInput),
                        onChange: (text: string) => updateDelimitedImportDestination(text),
                      })
                    }
                    testId="spreadsheet-delimited-import-destination-pick"
                  />
                </span>
              </label>
              <label className={dialogParts.field}>
                <span className={dialogParts.label}>
                  {t("spreadsheet.uiCopy.startAtRow")}
                </span>
                <input
                  type="number"
                  min={1}
                  max={CSV_IMPORT_MAX_START_ROW}
                  step={1}
                  value={delimitedImportPreview.startRow}
                  onChange={(event) =>
                    updateDelimitedImportPreview({
                      startRow: Number.isFinite(event.target.valueAsNumber)
                        ? Math.min(
                            CSV_IMPORT_MAX_START_ROW,
                            Math.max(1, Math.trunc(event.target.valueAsNumber)),
                          )
                        : 1,
                    })
                  }
                  inputMode="numeric"
                  data-testid="spreadsheet-delimited-import-start-row"
                />
              </label>
              {delimitedImportPreview.layoutMode === "delimited" &&
              delimitedImportPreview.delimiterChoice === "custom" ? (
                <label className={`${dialogParts.field} sm:col-span-4`}>
                  <span className={dialogParts.label}>
                    {t("spreadsheet.uiCopy.customDelimiterCharacter")}
                  </span>
                  <input
                    value={delimitedImportPreview.customDelimiterInput}
                    onChange={(event) =>
                      updateDelimitedImportPreview({
                        delimiterChoice: "custom",
                        customDelimiterInput: event.target.value,
                      })
                    }
                    maxLength={1}
                    aria-invalid={
                      !normalizeCsvImportDelimiter(
                        delimitedImportPreview.customDelimiterInput,
                      ) ||
                      delimitedImportPreview.customDelimiterInput ===
                        csvImportTextQualifierCharacter(
                          delimitedImportPreview.textQualifier,
                        )
                    }
                    aria-describedby="spreadsheet-delimited-import-custom-delimiter-help"
                    autoComplete="off"
                    spellCheck={false}
                    data-testid="spreadsheet-delimited-import-custom-delimiter"
                    className="w-20 text-center"
                  />
                  <span
                    id="spreadsheet-delimited-import-custom-delimiter-help"
                    className={dialogParts.hint}
                  >
                    {t("spreadsheet.uiCopy.appliesOneExplicitCharacterOnlyItCannotBeA")}
                  </span>
                </label>
              ) : null}
              {delimitedImportPreview.layoutMode === "delimited" ? (
                <label className={`${dialogParts.check} sm:col-span-4`}>
                  <input
                    type="checkbox"
                    checked={delimitedImportPreview.consecutiveDelimiters}
                    onChange={(event) =>
                      updateDelimitedImportPreview({
                        consecutiveDelimiters: event.target.checked,
                      })
                    }
                    data-testid="spreadsheet-delimited-import-consecutive-delimiters"
                  />
                  <span>{t("spreadsheet.textToColumnsConsecutive")}</span>
                </label>
              ) : (
                <div className="grid gap-2 sm:col-span-4">
                  <label className={dialogParts.field}>
                    <span className={dialogParts.label}>
                      {t("spreadsheet.uiCopy.columnBreaksCharacterPositions")}
                    </span>
                    <input
                      value={delimitedImportPreview.fixedWidthBreaksInput}
                      onChange={(event) =>
                        updateDelimitedImportPreview({
                          fixedWidthBreaksInput: event.target.value,
                        })
                      }
                      placeholder="8, 16, 24"
                      aria-invalid={
                        parseCsvImportFixedWidthBreaks(
                          delimitedImportPreview.fixedWidthBreaksInput,
                        ) === null
                      }
                      aria-describedby="spreadsheet-delimited-import-fixed-width-help"
                      inputMode="numeric"
                      data-testid="spreadsheet-delimited-import-fixed-width-breaks"
                    />
                  </label>
                  <span
                    id="spreadsheet-delimited-import-fixed-width-help"
                    className={dialogParts.hint}
                  >
                    {t("spreadsheet.uiCopy.clickTheRulerToAddABreakDoubleClick")}
                  </span>
                  <SpreadsheetFixedWidthBreakRuler
                    lines={delimitedImportPreview.rawRows
                      .slice(0, 8)
                      .map((row) => row.join(""))}
                    breaks={
                      parseCsvImportFixedWidthBreaks(
                        delimitedImportPreview.fixedWidthBreaksInput,
                      ) ?? []
                    }
                    onChange={updateDelimitedImportFixedWidthBreaks}
                    translate={t}
                    testIdPrefix="spreadsheet-delimited-import-fixed-width"
                    helpId="spreadsheet-delimited-import-fixed-width-help"
                  />
                </div>
              )}
              <p
                id="spreadsheet-delimited-import-destination-help"
                aria-live="polite"
                className={`${
                  delimitedImportDestinationIssue(delimitedImportPreview)
                    ? dialogParts.error
                    : dialogParts.hint
                } sm:col-span-4`}
              >
                {delimitedImportDestinationIssue(delimitedImportPreview) ??
                  (t("spreadsheet.uiCopy.defaultsToTheActiveCellWhenTheFileWas"))}
              </p>
            </div>
            <fieldset className="grid gap-3 sm:grid-cols-3">
              <legend>
                {t("spreadsheet.uiCopy.advancedNumberParsing")}
              </legend>
              <label className={dialogParts.field}>
                <span className={dialogParts.label}>
                  {t("spreadsheet.uiCopy.decimalSeparator")}
                </span>
                <select
                  value={
                    delimitedImportPreview.numberOptions.decimalSeparator ??
                    "locale"
                  }
                  onChange={(event) =>
                    updateDelimitedImportPreview({
                      numberOptions: {
                        ...delimitedImportPreview.numberOptions,
                        decimalSeparator: event.target
                          .value as DelimitedImportDecimalSeparator,
                      },
                    })
                  }
                  data-testid="spreadsheet-delimited-import-decimal-separator"
                >
                  <option value="locale">
                    {t("spreadsheet.uiCopy.autoLocale")}
                  </option>
                  <option value=".">.</option>
                  <option value=",">,</option>
                </select>
              </label>
              <label className={dialogParts.field}>
                <span className={dialogParts.label}>
                  {t("spreadsheet.uiCopy.thousandsSeparator")}
                </span>
                <select
                  value={
                    delimitedImportPreview.numberOptions.thousandsSeparator ??
                    "locale"
                  }
                  onChange={(event) =>
                    updateDelimitedImportPreview({
                      numberOptions: {
                        ...delimitedImportPreview.numberOptions,
                        thousandsSeparator: event.target
                          .value as DelimitedImportThousandsSeparator,
                      },
                    })
                  }
                  data-testid="spreadsheet-delimited-import-thousands-separator"
                >
                  <option value="locale">
                    {t("spreadsheet.uiCopy.autoLocale")}
                  </option>
                  <option value=",">,</option>
                  <option value=".">.</option>
                  <option value="space">
                    {t("spreadsheet.textToColumnsSpace")}
                  </option>
                  <option value="none">
                    {t("spreadsheet.textArt_plain")}
                  </option>
                </select>
              </label>
              <label className={`${dialogParts.check} self-end`}>
                <input
                  type="checkbox"
                  checked={Boolean(
                    delimitedImportPreview.numberOptions.trailingMinus,
                  )}
                  onChange={(event) =>
                    updateDelimitedImportPreview({
                      numberOptions: {
                        ...delimitedImportPreview.numberOptions,
                        trailingMinus: event.target.checked,
                      },
                    })
                  }
                  data-testid="spreadsheet-delimited-import-trailing-minus"
                />
                <span>
                  {t("spreadsheet.uiCopy.trailingMinusForNegativeNumbers")}
                </span>
              </label>
              <p className={`${dialogParts.hint} sm:col-span-3`}>
                {t("spreadsheet.uiCopy.theseSettingsOnlyAffectNumericRecognitionInGeneralAnd")}
              </p>
            </fieldset>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className={dialogParts.field}>
                <span className={dialogParts.label}>
                  {t("spreadsheet.uiCopy.selectColumn")}
                </span>
                <select
                  value={delimitedImportPreview.selectedColumn}
                  onChange={(event) =>
                    selectDelimitedImportColumn(Number(event.target.value))
                  }
                  disabled={
                    delimitedImportPreview.columnDispositions.length === 0
                  }
                  data-testid="spreadsheet-delimited-import-column"
                >
                  {delimitedImportPreview.columnDispositions.map(
                    (_disposition, column) => (
                      <option key={column} value={column}>
                        {t("spreadsheet.dynamicCopy.columnIndex", { index: column + 1 })}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <label className={dialogParts.field}>
                <span className={dialogParts.label}>
                  {t("spreadsheet.uiCopy.columnDataType")}
                </span>
                <select
                  value={
                    delimitedImportPreview.columnDispositions[
                      delimitedImportPreview.selectedColumn
                    ] ?? "general"
                  }
                  onChange={(event) =>
                    updateDelimitedImportColumnDisposition(
                      event.target.value as DelimitedImportColumnDisposition,
                    )
                  }
                  disabled={
                    delimitedImportPreview.columnDispositions.length === 0
                  }
                  data-testid="spreadsheet-delimited-import-column-type"
                >
                  <option value="general">
                    {t("spreadsheet.formatGeneral")}
                  </option>
                  <option value="text">
                    {t("spreadsheet.fmtCatText")}
                  </option>
                  <option value="date">
                    {t("spreadsheet.fmtCatDate")}
                  </option>
                  <option value="skip">
                    {t("spreadsheet.uiCopy.skipColumn")}
                  </option>
                </select>
              </label>
              <label className={dialogParts.field}>
                <span className={dialogParts.label}>
                  {t("spreadsheet.uiCopy.dateOrder")}
                </span>
                <select
                  value={
                    delimitedImportPreview.columnDateOrders[
                      delimitedImportPreview.selectedColumn
                    ] ?? "locale"
                  }
                  onChange={(event) =>
                    updateDelimitedImportColumnDateOrder(
                      event.target.value as DelimitedImportDateOrder,
                    )
                  }
                  disabled={
                    delimitedImportPreview.columnDispositions[
                      delimitedImportPreview.selectedColumn
                    ] !== "date"
                  }
                  data-testid="spreadsheet-delimited-import-date-order"
                >
                  <option value="locale">
                    {t("spreadsheet.uiCopy.autoLocale")}
                  </option>
                  <option value="mdy">MDY</option>
                  <option value="dmy">DMY</option>
                  <option value="ymd">YMD</option>
                </select>
              </label>
              <p className={`${dialogParts.hint} sm:col-span-3`}>
                {t("spreadsheet.uiCopy.textPreservesLiteralContentAndPreventsFormulaExecutionDate")}
              </p>
            </div>
            {delimitedImportPreview.error ? (
              <div
                role="alert"
                className={dialogParts.error}
                data-testid="spreadsheet-delimited-import-error"
              >
                {delimitedImportPreview.error}
              </div>
            ) : (
              <div className={`${dialogParts.hint} flex flex-wrap gap-x-4 gap-y-1`}>
                <span>
                  {t("spreadsheet.uiCopy.encoding")}
                  {": "}
                  {delimitedImportPreview.detectedEncoding?.toUpperCase()}
                </span>
                <span>
                  {t("spreadsheet.uiCopy.dataType")}
                  {": "}
                  {delimitedImportPreview.layoutMode === "fixedWidth"
                    ? t("spreadsheet.textToColumnsModeFixedWidth")
                    : t("spreadsheet.uiCopy.delimited")}
                </span>
                {delimitedImportPreview.layoutMode === "delimited" ? (
                  <>
                    <span>
                      {t("spreadsheet.uiCopy.effectiveDelimiter")}
                      {": "}
                      {delimitedImportDelimiterLabel(
                        delimitedImportPreview.effectiveDelimiter,
                      )}
                    </span>
                    <span>
                      {t("spreadsheet.textToColumnsQualifier")}
                      {": "}
                      {delimitedImportTextQualifierLabel(
                        delimitedImportPreview.textQualifier,
                      )}
                    </span>
                  </>
                ) : (
                  <span>
                    {t("spreadsheet.uiCopy.columnBreaks")}
                    {": "}
                    {parseCsvImportFixedWidthBreaks(
                      delimitedImportPreview.fixedWidthBreaksInput,
                    )?.join(", ") || "—"}
                  </span>
                )}
                <span>
                  {t("spreadsheet.uiCopy.startRow")}
                  {": "}
                  {delimitedImportPreview.startRow}
                </span>
                <span>
                  {delimitedImportPreview.rawRows.length}
                  {t("spreadsheet.uiCopy.rows")}
                </span>
                <span>
                  {Math.max(
                    0,
                    ...delimitedImportPreview.rawRows.map((row) => row.length),
                  )}
                  {t("spreadsheet.uiCopy.columns")}
                </span>
                <span>
                  {delimitedImportPreview.columnDispositions.filter(
                    (disposition) => disposition !== "skip",
                  ).length}
                  {t("spreadsheet.uiCopy.columnsToImport")}
                </span>
              </div>
            )}
            <div className={`${dialogParts.well} max-h-64 overflow-auto`}>
              <table
                className={`${dialogParts.table} w-full text-left`}
                data-testid="spreadsheet-delimited-import-preview-table"
              >
                <thead className="sticky top-0 z-10">
                  <tr>
                    <th className="sticky left-0 z-20 w-9 text-center">
                      #
                    </th>
                    {delimitedImportPreview.columnDispositions.map(
                      (disposition, column) => (
                        <th
                          key={column}
                          className="min-w-28 text-center"
                        >
                          <button
                            type="button"
                            aria-label={
                              t("spreadsheet.dynamicCopy.selectImportColumn", { index: column + 1, type: t(`spreadsheet.dynamicCopy.importType.${disposition}`) })
                            }
                            aria-pressed={
                              delimitedImportPreview.selectedColumn === column
                            }
                            onClick={() =>
                              selectDelimitedImportColumn(column)
                            }
                            className={`${dialogParts.listItem} flex w-full items-center justify-center gap-1`}
                            data-skipped={disposition === "skip" || undefined}
                            data-testid={`spreadsheet-delimited-import-column-${column}`}
                          >
                            <span>{column + 1}</span>
                            <span className={`${dialogParts.hint} uppercase`}>
                              {disposition === "general"
                                ? "G"
                                : disposition === "text"
                                  ? "T"
                                  : disposition === "date"
                                    ? "D"
                                    : "S"}
                            </span>
                          </button>
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {delimitedImportPreview.rawRows
                    .slice(0, 8)
                    .map((row, rowIndex) => (
                      <tr key={rowIndex}>
                        <th
                          scope="row"
                          className="sticky left-0 w-9 text-center"
                        >
                          {rowIndex + 1}
                        </th>
                        {delimitedImportPreview.columnDispositions.map(
                          (disposition, colIndex) => {
                            const value = row[colIndex] ?? "";
                            return (
                              <td
                                key={colIndex}
                                title={value}
                                className={`max-w-40 truncate ${
                                  delimitedImportPreview.layoutMode ===
                                  "fixedWidth"
                                    ? "whitespace-pre"
                                    : ""
                                }`}
                                data-skipped={disposition === "skip" || undefined}
                                data-selected={
                                  (disposition !== "skip" &&
                                    delimitedImportPreview.selectedColumn ===
                                      colIndex) ||
                                  undefined
                                }
                              >
                                {value || "\u00a0"}
                              </td>
                            );
                          },
                        )}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </OfficeDialogShell>
  );
}
