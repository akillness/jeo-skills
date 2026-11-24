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
import {
  MAX_DOCUMENT_TABLE_SPLIT_COLUMNS,
  MAX_DOCUMENT_TABLE_SPLIT_GENERATED_CELLS,
  MAX_DOCUMENT_TABLE_SPLIT_ROWS,
} from "./documentTableSplitCells";

export interface DocumentTableSplitCellsDialogProps {
  readonly canEdit?: boolean;
  readonly open: boolean;
  readonly locale: string;
  readonly returnFocusRef: RefObject<HTMLElement | null>;
  readonly onSubmit: (columns: number, rows: number) => boolean;
  readonly onClose: () => void;
}

export function DocumentTableSplitCellsDialog({
  canEdit = true,
  open,
  returnFocusRef,
  onSubmit,
  onClose,
}: DocumentTableSplitCellsDialogProps): React.JSX.Element {
  const t = useTranslations("console-notebooks");
  const copy = useMemo(
    () => ({
      title: t("toolbar.tableSplitCellsDialog.title"),
      description: t("toolbar.tableSplitCellsDialog.description"),
      columns: t("toolbar.tableSplitCellsDialog.columns"),
      rows: t("toolbar.tableSplitCellsDialog.rows"),
      apply: t("toolbar.tableSplitCellsDialog.apply"),
      cancel: t("toolbar.tableSplitCellsDialog.cancel"),
      invalid: t("toolbar.tableSplitCellsDialog.invalid"),
      stale: t("toolbar.tableSplitCellsDialog.stale"),
    }),
    [t],
  );
  const [columns, setColumns] = useState("2");
  const [rows, setRows] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const columnsRef = useRef<HTMLInputElement | null>(null);
  const parsedColumns = Number(columns);
  const parsedRows = Number(rows);
  const valid =
    Number.isInteger(parsedColumns) &&
    Number.isInteger(parsedRows) &&
    parsedColumns >= 1 &&
    parsedColumns <= MAX_DOCUMENT_TABLE_SPLIT_COLUMNS &&
    parsedRows >= 1 &&
    parsedRows <= MAX_DOCUMENT_TABLE_SPLIT_ROWS &&
    parsedColumns * parsedRows <= MAX_DOCUMENT_TABLE_SPLIT_GENERATED_CELLS &&
    (parsedColumns !== 1 || parsedRows !== 1);

  const submit = useCallback(() => {
    if (!canEdit) return;
    if (!valid) {
      setError(copy.invalid);
      return;
    }
    if (!onSubmit(parsedColumns, parsedRows)) {
      setError(copy.stale);
      return;
    }
    onClose();
  }, [
    canEdit,
    copy.invalid,
    copy.stale,
    onClose,
    onSubmit,
    parsedColumns,
    parsedRows,
    valid,
  ]);

  return (
    <OfficeDialogShell
      open={open}
      title={copy.title}
      description={copy.description}
      defaultActionLabel={copy.apply}
      cancelActionLabel={copy.cancel}
      defaultActionDisabled={!canEdit || !valid}
      onDefaultAction={submit}
      onCancel={onClose}
      initialFocusRef={columnsRef}
      returnFocusRef={returnFocusRef}
      testIdPrefix="document-table-split-cells"
    >
      <div className="grid grid-cols-2 gap-3">
        <label className={parts.field}>
          <span className={parts.label}>{copy.columns}</span>
          <input
            disabled={!canEdit}
            ref={columnsRef}
            type="number"
            min={1}
            max={MAX_DOCUMENT_TABLE_SPLIT_COLUMNS}
            step={1}
            value={columns}
            data-testid="document-table-split-cells-columns"
            onChange={(event) => {
              setColumns(event.target.value);
              setError(null);
            }}
          />
        </label>
        <label className={parts.field}>
          <span className={parts.label}>{copy.rows}</span>
          <input
            disabled={!canEdit}
            type="number"
            min={1}
            max={MAX_DOCUMENT_TABLE_SPLIT_ROWS}
            step={1}
            value={rows}
            data-testid="document-table-split-cells-rows"
            onChange={(event) => {
              setRows(event.target.value);
              setError(null);
            }}
          />
        </label>
      </div>
      {error ? (
        <p role="alert" className={parts.error}>
          {error}
        </p>
      ) : null}
    </OfficeDialogShell>
  );
}
