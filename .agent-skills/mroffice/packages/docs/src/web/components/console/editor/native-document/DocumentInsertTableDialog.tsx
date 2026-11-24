"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";

import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { officeDialogParts as parts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import { toast } from "@mrnote/core/web/hooks/use-toast.ts";
import { DocumentDialogIcon } from "@mrnote/core/web/components/console/editor/native-document/DocumentDialogIcon.tsx";
import { documentValueInputClassName } from "@mrnote/core/web/components/console/editor/documentValueInput.ts";

import {
  type DocumentTableInsertFailureReason,
  type DocumentTableInsertSelection,
  insertDocumentTable,
} from "./documentTableInsertCommand";
import { documentTableInsertDialogCopy } from "./tableInsertDialogCopy";
import {
  DOCUMENT_TABLE_LAYOUT_POLICY_SCHEMA_VERSION,
  DOCUMENT_TABLE_MAX_COLUMNS,
  DOCUMENT_TABLE_MAX_ROWS,
  DOCUMENT_TABLE_MIN_COLUMNS,
  DOCUMENT_TABLE_MIN_ROWS,
  type DocumentTableDimensionValidation,
  type DocumentTableLayoutMode,
  type DocumentTableLayoutPolicy,
  formatDocumentTableWidth,
  loadDocumentTableInsertPreference,
  saveDocumentTableInsertPreference,
  validateDocumentTableDimension,
  validateDocumentTableFixedWidth,
} from "@mrnote/core/web/components/console/editor/native-document/tableLayoutPolicy.ts";

type AutoFitChoice = "initial" | "autofit_contents" | "autofit_window";

interface FieldErrors {
  readonly columns: string | null;
  readonly rows: string | null;
  readonly width: string | null;
  readonly command: string | null;
}

const EMPTY_ERRORS: FieldErrors = {
  columns: null,
  rows: null,
  width: null,
  command: null,
};

export interface DocumentInsertTableDialogProps {
  readonly canEdit?: boolean;
  readonly open: boolean;
  readonly editor: Editor;
  readonly sourceDocument: ProseMirrorNode | null;
  readonly locale: string;
  readonly selection: DocumentTableInsertSelection | null;
  readonly returnFocusRef: RefObject<HTMLElement | null>;
  readonly onClose: () => void;
}

function browserLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function dimensionErrorMessage(
  result: DocumentTableDimensionValidation,
  kind: "columns" | "rows",
  copy: ReturnType<typeof documentTableInsertDialogCopy>,
): string | null {
  if (!result.error) return null;
  if (result.error === "required") return copy.requiredError;
  if (result.error === "integer") return copy.integerError;
  return kind === "columns" ? copy.columnsRangeError : copy.rowsRangeError;
}

function commandErrorMessage(
  reason: DocumentTableInsertFailureReason,
  copy: ReturnType<typeof documentTableInsertDialogCopy>,
): string {
  if (reason === "dense_cell_budget_exceeded") return copy.capacityError;
  if (reason === "sparse_table_container_unsupported") {
    return copy.largeTableContainerError;
  }
  if (reason === "rows_out_of_range") return copy.rowsRangeError;
  if (reason === "columns_out_of_range") return copy.columnsRangeError;
  if (
    reason === "fixed_width_total_exceeded" ||
    reason === "invalid_layout_policy"
  ) {
    return copy.widthNumberError;
  }
  return copy.insertUnavailable;
}

export function DocumentInsertTableDialog({
  canEdit = true,
  open,
  editor,
  sourceDocument,
  locale,
  selection,
  returnFocusRef,
  onClose,
}: DocumentInsertTableDialogProps): React.JSX.Element {
  const t = useTranslations("console-notebooks");
  const copy = useMemo(
    () => documentTableInsertDialogCopy(locale, t),
    [locale, t],
  );
  const initialBehaviorRef = useRef<HTMLInputElement | null>(null);
  // An inserted table takes the caret: the command already put the selection
  // in its first cell, and OK handed focus back to the ribbon button, so the
  
  const insertedRef = useRef(false);
  useEffect(() => {
    if (open) insertedRef.current = false;
  }, [open]);
  const editorFocusAfterInsert = useCallback((): HTMLElement | null => {
    if (!insertedRef.current || editor.isDestroyed || !editor.isEditable) return null;
    editor.view.focus();
    return editor.view.dom as HTMLElement;
  }, [editor]);
  const [initialPreference] = useState(() =>
    loadDocumentTableInsertPreference(browserLocalStorage()),
  );
  const [columnsDraft, setColumnsDraft] = useState(() =>
    String(initialPreference.columns),
  );
  const [rowsDraft, setRowsDraft] = useState(() =>
    String(initialPreference.rows),
  );
  const [autoFitChoice, setAutoFitChoice] = useState<AutoFitChoice>(() =>
    initialPreference.policy.mode === "autofit_contents" ||
    initialPreference.policy.mode === "autofit_window"
      ? initialPreference.policy.mode
      : "initial",
  );
  const [widthDraft, setWidthDraft] = useState(() =>
    initialPreference.policy.mode === "initial_fixed"
      ? formatDocumentTableWidth(
          initialPreference.policy.fixedWidthTwips ?? 0,
          locale,
        )
      : "0",
  );
  const [remember, setRemember] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>(EMPTY_ERRORS);

  const submit = useCallback(() => {
    if (!canEdit) return;
    const columns = validateDocumentTableDimension(
      columnsDraft,
      DOCUMENT_TABLE_MIN_COLUMNS,
      DOCUMENT_TABLE_MAX_COLUMNS,
    );
    const rows = validateDocumentTableDimension(
      rowsDraft,
      DOCUMENT_TABLE_MIN_ROWS,
      DOCUMENT_TABLE_MAX_ROWS,
    );
    const columnsError = dimensionErrorMessage(columns, "columns", copy);
    const rowsError = dimensionErrorMessage(rows, "rows", copy);
    if (columns.value === null || rows.value === null) {
      setErrors({
        columns: columnsError,
        rows: rowsError,
        width: null,
        command: null,
      });
      return;
    }

    let policy: DocumentTableLayoutPolicy | null = null;
    let widthError: string | null = null;
    if (autoFitChoice === "initial") {
      const width = validateDocumentTableFixedWidth(
        widthDraft,
        locale,
        columns.value,
      );
      policy = width.policy;
      if (width.error === "required") widthError = copy.requiredError;
      if (width.error === "number") widthError = copy.widthNumberError;
      if (width.error === "range") {
        const minimum = formatDocumentTableWidth(width.minimumTwips, locale);
        const maximum = formatDocumentTableWidth(width.maximumTwips, locale);
        widthError = copy.widthRangeError(
          minimum,
          maximum,
          copy.measurementUnit,
        );
      }
    } else {
      policy = {
        schemaVersion: DOCUMENT_TABLE_LAYOUT_POLICY_SCHEMA_VERSION,
        mode: autoFitChoice satisfies DocumentTableLayoutMode,
      };
    }
    if (!policy || widthError) {
      setErrors({
        columns: columnsError,
        rows: rowsError,
        width: widthError ?? copy.widthNumberError,
        command: null,
      });
      return;
    }
    if (!selection || !sourceDocument) {
      setErrors({
        columns: null,
        rows: null,
        width: null,
        command: copy.insertUnavailable,
      });
      return;
    }

    const result = insertDocumentTable({
      editor,
      sourceDocument,
      selection,
      rows: rows.value,
      columns: columns.value,
      policy,
    });
    if (!result.ok) {
      setErrors({
        columns: null,
        rows: null,
        width: null,
        command: commandErrorMessage(result.reason, copy),
      });
      return;
    }

    if (
      remember &&
      !saveDocumentTableInsertPreference(browserLocalStorage(), {
        schemaVersion: DOCUMENT_TABLE_LAYOUT_POLICY_SCHEMA_VERSION,
        columns: result.columns,
        rows: result.rows,
        policy: result.policy,
      })
    ) {
      toast({ title: copy.preferenceUnavailable, variant: "destructive" });
    }
    insertedRef.current = true;
    onClose();
  }, [
    autoFitChoice,
    canEdit,
    columnsDraft,
    copy,
    editor,
    locale,
    onClose,
    remember,
    rowsDraft,
    selection,
    sourceDocument,
    widthDraft,
  ]);

  return (
    <OfficeDialogShell
      open={open}
      title={copy.title}
      description={copy.description}
      defaultActionLabel={copy.insert}
      cancelActionLabel={copy.cancel}
      defaultActionDisabled={!canEdit}
      onDefaultAction={submit}
      onCancel={onClose}
      initialFocusRef={initialBehaviorRef}
      returnFocusRef={returnFocusRef}
      returnFocusTarget={editorFocusAfterInsert}
      testIdPrefix="document-insert-table"
    >
      <div className="grid grid-cols-2 gap-3">
        <label className={parts.field}>
          <span className={parts.label}>{copy.columns}</span>
          <input
            disabled={!canEdit}
            type="number"
            inputMode="numeric"
            min={DOCUMENT_TABLE_MIN_COLUMNS}
            max={DOCUMENT_TABLE_MAX_COLUMNS}
            step={1}
            value={columnsDraft}
            aria-invalid={errors.columns ? "true" : undefined}
            aria-describedby={
              errors.columns ? "document-insert-table-columns-error" : undefined
            }
            data-testid="document-insert-table-columns"
            onChange={(event) => {
              setColumnsDraft(event.target.value);
              setErrors(EMPTY_ERRORS);
            }}
          />
          {errors.columns ? (
            <span
              id="document-insert-table-columns-error"
              className={parts.error}
              role="alert"
            >
              {errors.columns}
            </span>
          ) : null}
        </label>
        <label className={parts.field}>
          <span className={parts.label}>{copy.rows}</span>
          <input
            disabled={!canEdit}
            type="number"
            inputMode="numeric"
            min={DOCUMENT_TABLE_MIN_ROWS}
            max={DOCUMENT_TABLE_MAX_ROWS}
            step={1}
            value={rowsDraft}
            aria-invalid={errors.rows ? "true" : undefined}
            aria-describedby={
              errors.rows ? "document-insert-table-rows-error" : undefined
            }
            data-testid="document-insert-table-rows"
            onChange={(event) => {
              setRowsDraft(event.target.value);
              setErrors(EMPTY_ERRORS);
            }}
          />
          {errors.rows ? (
            <span
              id="document-insert-table-rows-error"
              className={parts.error}
              role="alert"
            >
              {errors.rows}
            </span>
          ) : null}
        </label>
      </div>

      <fieldset
        className={parts.group}
        disabled={!canEdit}
      >
        <legend className={parts.sectionTitle}>
          {copy.autoFitBehavior}
        </legend>
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
          <input
            ref={initialBehaviorRef}
            type="radio"
            name="document-insert-table-autofit"
            value="initial"
            checked={autoFitChoice === "initial"}
            aria-label={copy.initialColumnWidth}
            data-testid="document-insert-table-mode-initial"
            onChange={() => {
              setAutoFitChoice("initial");
              setErrors(EMPTY_ERRORS);
            }}
          />
          <label
            htmlFor="document-insert-table-width"
            className={`${parts.label} flex items-center gap-2`}
          >
            <DocumentDialogIcon icon="table.columnWidth" />
            {copy.initialColumnWidth}
          </label>
          <div className="flex items-center gap-1">
            <input
              id="document-insert-table-width"
              type="text"
              inputMode="decimal"
              value={widthDraft}
              disabled={autoFitChoice !== "initial"}
              aria-label={copy.initialColumnWidth}
              aria-invalid={errors.width ? "true" : undefined}
              aria-describedby={
                errors.width ? "document-insert-table-width-error" : undefined
              }
              data-testid="document-insert-table-width"
              className={documentValueInputClassName(undefined, {
                inline: true,
              })}
              onFocus={() => setAutoFitChoice("initial")}
              onChange={(event) => {
                setAutoFitChoice("initial");
                setWidthDraft(event.target.value);
                setErrors(EMPTY_ERRORS);
              }}
            />
            <span className={parts.hint}>
              {widthDraft.trim() === "0" ? copy.auto : copy.measurementUnit}
            </span>
          </div>
        </div>
        <label className={parts.check}>
          <input
            type="radio"
            name="document-insert-table-autofit"
            value="autofit_contents"
            checked={autoFitChoice === "autofit_contents"}
            data-testid="document-insert-table-mode-contents"
            onChange={() => {
              setAutoFitChoice("autofit_contents");
              setErrors(EMPTY_ERRORS);
            }}
          />
          <DocumentDialogIcon icon="table.resize" />
          {copy.autoFitContents}
        </label>
        <label className={parts.check}>
          <input
            type="radio"
            name="document-insert-table-autofit"
            value="autofit_window"
            checked={autoFitChoice === "autofit_window"}
            data-testid="document-insert-table-mode-window"
            onChange={() => {
              setAutoFitChoice("autofit_window");
              setErrors(EMPTY_ERRORS);
            }}
          />
          <DocumentDialogIcon icon="window.maximize" />
          {copy.autoFitWindow}
        </label>
        {errors.width ? (
          <span
            id="document-insert-table-width-error"
            className={parts.error}
            role="alert"
          >
            {errors.width}
          </span>
        ) : null}
      </fieldset>

      <label className={parts.check}>
        <input
          disabled={!canEdit}
          type="checkbox"
          checked={remember}
          data-testid="document-insert-table-remember"
          onChange={(event) => setRemember(event.target.checked)}
        />
        {copy.setAsDefault}
      </label>

      {errors.command ? (
        <p
          className={parts.error}
          role="alert"
          data-testid="document-insert-table-command-error"
        >
          {errors.command}
        </p>
      ) : null}
    </OfficeDialogShell>
  );
}
