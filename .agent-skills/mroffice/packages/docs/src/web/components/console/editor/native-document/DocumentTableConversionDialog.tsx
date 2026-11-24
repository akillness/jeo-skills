"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useCallback, useMemo, useRef, useState, type RefObject } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";

import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { officeDialogParts as parts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import type { OfficeSemanticIconId } from "@mrnote/core/web/components/office-ribbon/icons/officeIconRegistry.ts";
import { DocumentDialogIcon } from "@mrnote/core/web/components/console/editor/native-document/DocumentDialogIcon.tsx";
import { documentValueInputClassName } from "@mrnote/core/web/components/console/editor/documentValueInput.ts";

import { documentTableInsertDialogCopy } from "./tableInsertDialogCopy";
import {
  DOCUMENT_TABLE_LAYOUT_POLICY_SCHEMA_VERSION,
  type DocumentTableLayoutPolicy,
  formatDocumentTableWidth,
  validateDocumentTableFixedWidth,
} from "@mrnote/core/web/components/console/editor/native-document/tableLayoutPolicy.ts";
import {
  detectTextToTableDelimiter,
  normalizeTextTableOtherSeparator,
  parseTextToTableRows,
  type TextTableConversionSeparator,
} from "./textTableConvert";

export type DocumentTableConversionMode = "text-to-table" | "table-to-text";

type SeparatorChoice = "paragraph" | "tab" | "comma" | "other";

const TABLE_CONVERSION_SEPARATOR_ICON = {
  paragraph: "text.paragraphMark",
  tab: "text.separator.tab",
  comma: "text.separator.comma",
  other: "overflow.more",
} as const satisfies Record<SeparatorChoice, OfficeSemanticIconId>;
type AutoFitChoice = "initial" | "autofit_contents" | "autofit_window";

export interface DocumentTableConversionSettings {
  readonly separator: TextTableConversionSeparator;
  readonly layoutPolicy: DocumentTableLayoutPolicy | null;
}

export interface DocumentTableConversionDialogProps {
  readonly canEdit?: boolean;
  readonly open: boolean;
  readonly mode: DocumentTableConversionMode;
  readonly locale: string;
  readonly sourceText?: string;
  readonly tableRows?: readonly (readonly string[])[];
  readonly returnFocusRef: RefObject<HTMLElement | null>;
  readonly onSubmit: (settings: DocumentTableConversionSettings) => boolean;
  readonly onClose: () => void;
}

interface ConversionCopy {
  readonly textToTableTitle: string;
  readonly tableToTextTitle: string;
  readonly textToTableDescription: string;
  readonly tableToTextDescription: string;
  readonly tableSize: string;
  readonly tableSizeValue: (columns: number, rows: number) => string;
  readonly separateTextAt: string;
  readonly separateTextWith: string;
  readonly paragraphs: string;
  readonly tabs: string;
  readonly commas: string;
  readonly other: string;
  readonly otherPlaceholder: string;
  readonly otherSeparatorError: string;
  readonly sourceUnavailable: string;
  readonly selectionChanged: string;
  readonly convert: string;
}

function conversionCopy(
  t: (key: string, values?: Record<string, string | number>) => string,
): ConversionCopy {
  const k = (leaf: string) => t(`toolbar.tableConversionDialog.${leaf}`);
  return {
    textToTableTitle: k("textToTableTitle"),
    tableToTextTitle: k("tableToTextTitle"),
    textToTableDescription: k("textToTableDescription"),
    tableToTextDescription: k("tableToTextDescription"),
    tableSize: k("tableSize"),
    tableSizeValue: (columns, rows) =>
      t("toolbar.tableConversionDialog.tableSizeValue", { columns, rows }),
    separateTextAt: k("separateTextAt"),
    separateTextWith: k("separateTextWith"),
    paragraphs: k("paragraphs"),
    tabs: k("tabs"),
    commas: k("commas"),
    other: k("other"),
    otherPlaceholder: k("otherPlaceholder"),
    otherSeparatorError: k("otherSeparatorError"),
    sourceUnavailable: k("sourceUnavailable"),
    selectionChanged: k("selectionChanged"),
    convert: k("convert"),
  };
}

function initialSeparator(sourceText: string | undefined): {
  readonly choice: SeparatorChoice;
  readonly other: string;
} {
  if (!sourceText) return { choice: "tab", other: "|" };
  if (
    !sourceText.includes("\t") &&
    !sourceText.includes("|") &&
    !sourceText.includes(",")
  ) {
    return { choice: "paragraph", other: "|" };
  }
  const detected = detectTextToTableDelimiter(sourceText);
  return detected === "pipe"
    ? { choice: "other", other: "|" }
    : { choice: detected, other: "|" };
}

function resolvedSeparator(
  choice: SeparatorChoice,
  other: string,
): TextTableConversionSeparator | null {
  if (choice !== "other") return choice;
  const normalized = normalizeTextTableOtherSeparator(other);
  return normalized ? { other: normalized } : null;
}

export function DocumentTableConversionDialog({
  canEdit = true,
  open,
  mode,
  locale,
  sourceText,
  tableRows,
  returnFocusRef,
  onSubmit,
  onClose,
}: DocumentTableConversionDialogProps): React.JSX.Element {
  const t = useTranslations("console-notebooks");
  const copy = useMemo(() => conversionCopy(t), [t]);
  const insertCopy = useMemo(
    () => documentTableInsertDialogCopy(locale, t),
    [locale, t],
  );
  const initial = useMemo(() => initialSeparator(sourceText), [sourceText]);
  const firstSeparatorRef = useRef<HTMLInputElement | null>(null);
  const [separatorChoice, setSeparatorChoice] = useState<SeparatorChoice>(
    initial.choice,
  );
  const [otherDraft, setOtherDraft] = useState(initial.other);
  const [autoFitChoice, setAutoFitChoice] =
    useState<AutoFitChoice>("initial");
  const [widthDraft, setWidthDraft] = useState("0");
  const [error, setError] = useState<string | null>(null);

  const separator = resolvedSeparator(separatorChoice, otherDraft);
  const previewRows = useMemo(() => {
    if (mode === "table-to-text") {
      return tableRows?.map((row) => [...row]) ?? null;
    }
    return sourceText && separator
      ? parseTextToTableRows(sourceText, separator)
      : null;
  }, [mode, separator, sourceText, tableRows]);
  const rowCount = previewRows?.length ?? 0;
  const columnCount = previewRows?.reduce(
    (maximum, row) => Math.max(maximum, row.length),
    0,
  ) ?? 0;

  const submit = useCallback(() => {
    if (!canEdit) return;
    const nextSeparator = resolvedSeparator(separatorChoice, otherDraft);
    if (!nextSeparator) {
      setError(copy.otherSeparatorError);
      return;
    }
    if (!previewRows || rowCount === 0 || columnCount === 0) {
      setError(copy.sourceUnavailable);
      return;
    }

    let layoutPolicy: DocumentTableLayoutPolicy | null = null;
    if (mode === "text-to-table") {
      if (autoFitChoice === "initial") {
        const width = validateDocumentTableFixedWidth(
          widthDraft,
          locale,
          columnCount,
        );
        if (!width.policy) {
          setError(
            width.error === "range"
              ? insertCopy.widthRangeError(
                  formatDocumentTableWidth(width.minimumTwips, locale),
                  formatDocumentTableWidth(width.maximumTwips, locale),
                  insertCopy.measurementUnit,
                )
              : insertCopy.widthNumberError,
          );
          return;
        }
        layoutPolicy = width.policy;
      } else {
        layoutPolicy = {
          schemaVersion: DOCUMENT_TABLE_LAYOUT_POLICY_SCHEMA_VERSION,
          mode: autoFitChoice,
        };
      }
    }

    if (!onSubmit({ separator: nextSeparator, layoutPolicy })) {
      setError(copy.selectionChanged);
      return;
    }
    onClose();
  }, [
    autoFitChoice,
    canEdit,
    columnCount,
    copy,
    insertCopy,
    locale,
    mode,
    onClose,
    onSubmit,
    otherDraft,
    previewRows,
    rowCount,
    separatorChoice,
    widthDraft,
  ]);

  const title =
    mode === "text-to-table" ? copy.textToTableTitle : copy.tableToTextTitle;
  const description =
    mode === "text-to-table"
      ? copy.textToTableDescription
      : copy.tableToTextDescription;

  return (
    <OfficeDialogShell
      open={open}
      title={title}
      description={description}
      defaultActionLabel={copy.convert}
      cancelActionLabel={insertCopy.cancel}
      defaultActionDisabled={!canEdit}
      onDefaultAction={submit}
      onCancel={onClose}
      initialFocusRef={firstSeparatorRef}
      returnFocusRef={returnFocusRef}
      testIdPrefix="document-table-conversion"
    >
      <div className="grid gap-0.5">
        <div className={parts.hint}>
          {copy.tableSize}
        </div>
        <div className={parts.sectionTitle} aria-live="polite">
          {copy.tableSizeValue(columnCount, rowCount)}
        </div>
      </div>

      <fieldset
        className={parts.group}
        disabled={!canEdit}
      >
        <legend className={parts.sectionTitle}>
          {mode === "text-to-table"
            ? copy.separateTextAt
            : copy.separateTextWith}
        </legend>
        {(
          [
            ["paragraph", copy.paragraphs],
            ["tab", copy.tabs],
            ["comma", copy.commas],
            ["other", copy.other],
          ] as const
        ).map(([value, label]) => (
          <label key={value} className={parts.check}>
            <input
              ref={value === separatorChoice ? firstSeparatorRef : undefined}
              type="radio"
              name="document-table-conversion-separator"
              value={value}
              checked={separatorChoice === value}
              data-testid={`document-table-conversion-separator-${value}`}
              onChange={() => {
                setSeparatorChoice(value);
                setError(null);
              }}
            />
            <DocumentDialogIcon icon={TABLE_CONVERSION_SEPARATOR_ICON[value]} />
            <span>{label}</span>
            {value === "other" ? (
              <input
                type="text"
                value={otherDraft}
                maxLength={2}
                aria-label={copy.other}
                placeholder={copy.otherPlaceholder}
                data-testid="document-table-conversion-separator-other-value"
                className="w-32"
                disabled={separatorChoice !== "other"}
                onFocus={() => setSeparatorChoice("other")}
                onChange={(event) => {
                  setSeparatorChoice("other");
                  setOtherDraft(event.target.value);
                  setError(null);
                }}
              />
            ) : null}
          </label>
        ))}
      </fieldset>

      {mode === "text-to-table" ? (
        <fieldset
          className={parts.group}
          disabled={!canEdit}
        >
          <legend className={parts.sectionTitle}>
            {insertCopy.autoFitBehavior}
          </legend>
          <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
            <input
              type="radio"
              id="document-table-conversion-autofit-initial"
              name="document-table-conversion-autofit"
              value="initial"
              checked={autoFitChoice === "initial"}
              onChange={() => {
                setAutoFitChoice("initial");
                setError(null);
              }}
            />
            {

}
            <label
              id="document-table-conversion-autofit-initial-label"
              htmlFor="document-table-conversion-autofit-initial"
              className={`${parts.label} flex items-center gap-2`}
            >
              <DocumentDialogIcon icon="table.columnWidth" />
              {insertCopy.initialColumnWidth}
            </label>
            <div className="flex items-center gap-1">
              <input
                id="document-table-conversion-width"
                aria-labelledby="document-table-conversion-autofit-initial-label"
                type="text"
                inputMode="decimal"
                value={widthDraft}
                disabled={autoFitChoice !== "initial"}
                className={documentValueInputClassName(undefined, {
                  inline: true,
                })}
                onFocus={() => setAutoFitChoice("initial")}
                onChange={(event) => {
                  setAutoFitChoice("initial");
                  setWidthDraft(event.target.value);
                  setError(null);
                }}
              />
              <span className={parts.hint}>
                {widthDraft.trim() === "0"
                  ? insertCopy.auto
                  : insertCopy.measurementUnit}
              </span>
            </div>
          </div>
          <label className={parts.check}>
            <input
              type="radio"
              name="document-table-conversion-autofit"
              value="autofit_contents"
              checked={autoFitChoice === "autofit_contents"}
              onChange={() => {
                setAutoFitChoice("autofit_contents");
                setError(null);
              }}
            />
            <DocumentDialogIcon icon="table.resize" />
            {insertCopy.autoFitContents}
          </label>
          <label className={parts.check}>
            <input
              type="radio"
              name="document-table-conversion-autofit"
              value="autofit_window"
              checked={autoFitChoice === "autofit_window"}
              onChange={() => {
                setAutoFitChoice("autofit_window");
                setError(null);
              }}
            />
            <DocumentDialogIcon icon="window.maximize" />
            {insertCopy.autoFitWindow}
          </label>
        </fieldset>
      ) : null}

      {error ? (
        <p
          role="alert"
          className={parts.error}
          data-testid="document-table-conversion-error"
        >
          {error}
        </p>
      ) : null}
    </OfficeDialogShell>
  );
}
