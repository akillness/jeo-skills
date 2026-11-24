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
import { MAX_SLICERS, type Slicer } from "../../../../lib/spreadsheet/slicer";
import { type TableSlicerInsertMutationReceipt } from "./spreadsheetMutationReceipts";
import { type Dispatch, type SetStateAction } from "react";

/** What renderSpreadsheetTableInsertSlicersDialog reads from SpreadsheetWindow's render scope. */
export interface RenderSpreadsheetTableInsertSlicersDialogInputs {
  applyTableSlicerInsertDialog: () => void;
  setTableSlicerInsertDraft: Dispatch<SetStateAction<{ receipt: Omit<TableSlicerInsertMutationReceipt, "controlId" | "selectedColumnIds">; selectedColumnIds: number[]; error: string | null; } | null>>;
  slicers: Slicer[];
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  tableSlicerInitialFocusRef: RefObject<HTMLInputElement | null>;
  tableSlicerInsertApplyAvailable: boolean;
  tableSlicerInsertDraft: { receipt: Omit<TableSlicerInsertMutationReceipt, "controlId" | "selectedColumnIds">; selectedColumnIds: number[]; error: string | null; } | null;
  tableSlicerReturnFocusRef: RefObject<HTMLElement | null>;
  toggleTableSlicerInsertColumn: (columnId: number) => void;
}

/** Moved verbatim from SpreadsheetWindow's JSX: a render function (not a component), so the element tree React reconciles is unchanged. */
export function renderSpreadsheetTableInsertSlicersDialog({
  applyTableSlicerInsertDialog,
  setTableSlicerInsertDraft,
  slicers,
  t,
  tableSlicerInitialFocusRef,
  tableSlicerInsertApplyAvailable,
  tableSlicerInsertDraft,
  tableSlicerReturnFocusRef,
  toggleTableSlicerInsertColumn,
}: RenderSpreadsheetTableInsertSlicersDialogInputs) {
  return (
      <OfficeDialogShell
        open={tableSlicerInsertDraft !== null}
        title={t("spreadsheet.uiCopy.insertSlicers")}
        description={
          t("spreadsheet.uiCopy.chooseTheTableFieldsToDisplayAsSlicersConfirming")
        }
        defaultActionLabel={t("spreadsheet.fmtOk")}
        cancelActionLabel={t("common.cancel")}
        defaultActionDisabled={!tableSlicerInsertApplyAvailable}
        defaultActionTestId="spreadsheet-table-insert-slicer-apply"
        initialFocusRef={tableSlicerInitialFocusRef}
        returnFocusRef={tableSlicerReturnFocusRef}
        testIdPrefix="spreadsheet-table-insert-slicer"
        onCancel={() => setTableSlicerInsertDraft(null)}
        onDefaultAction={applyTableSlicerInsertDialog}
      >
        <div
          className={`${dialogParts.list} max-h-72`}
          data-control-id="XLSCTL.CONTEXT.TABLE.INSERT_SLICER.MRAI.APPLY"
          data-control-surface="table-insert-slicer-dialog"
          data-testid="spreadsheet-table-insert-slicer-fields"
        >
          {(tableSlicerInsertDraft?.receipt.table.columns ?? []).map(
            (column) => {
              const available =
                tableSlicerInsertDraft?.receipt.availableColumnIds.includes(
                  column.id,
                ) === true;
              const checked =
                tableSlicerInsertDraft?.selectedColumnIds.includes(column.id) ===
                true;
              return (
                <label
                  key={column.id}
                  className={`${dialogParts.listItem} flex items-center gap-3`}
                >
                  <input
                    ref={
                      tableSlicerInsertDraft?.receipt.availableColumnIds[0] ===
                      column.id
                        ? tableSlicerInitialFocusRef
                        : undefined
                    }
                    type="checkbox"
                    checked={checked}
                    disabled={!available}
                    data-testid={`spreadsheet-table-insert-slicer-field-${column.id}`}
                    onChange={() => toggleTableSlicerInsertColumn(column.id)}
                  />
                  <span className="min-w-0 flex-1 truncate">{column.name}</span>
                  {!available ? (
                    <span className={dialogParts.hint}>
                      {t("spreadsheet.uiCopy.alreadyAdded")}
                    </span>
                  ) : null}
                </label>
              );
            },
          )}
        </div>
        <p className={dialogParts.hint}>
          {t("spreadsheet.dynamicCopy.remainingSlicers", { count: Math.max(0, MAX_SLICERS - slicers.length) })}
        </p>
        {tableSlicerInsertDraft?.error ? (
          <p
            role="alert"
            className={dialogParts.error}
            data-testid="spreadsheet-table-insert-slicer-error"
          >
            {tableSlicerInsertDraft.error}
          </p>
        ) : null}
      </OfficeDialogShell>
  );
}
