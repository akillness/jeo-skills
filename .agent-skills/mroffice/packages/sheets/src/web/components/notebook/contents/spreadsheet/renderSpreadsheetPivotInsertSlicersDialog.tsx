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
import { type PivotSlicerInsertMutationReceipt } from "./spreadsheetMutationReceipts";
import { type Dispatch, type SetStateAction } from "react";

/** What renderSpreadsheetPivotInsertSlicersDialog reads from SpreadsheetWindow's render scope. */
export interface RenderSpreadsheetPivotInsertSlicersDialogInputs {
  applyPivotSlicerInsertDialog: () => void;
  pivotSlicerInitialFocusRef: RefObject<HTMLInputElement | null>;
  pivotSlicerInsertApplyAvailable: boolean;
  pivotSlicerInsertDraft: { receipt: Omit<PivotSlicerInsertMutationReceipt, "controlId" | "selectedFields">; selectedFields: string[]; error: string | null; } | null;
  pivotSlicerReturnFocusRef: RefObject<HTMLElement | null>;
  setPivotSlicerInsertDraft: Dispatch<SetStateAction<{ receipt: Omit<PivotSlicerInsertMutationReceipt, "controlId" | "selectedFields">; selectedFields: string[]; error: string | null; } | null>>;
  slicers: Slicer[];
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  togglePivotSlicerInsertField: (field: string) => void;
}

/** Moved verbatim from SpreadsheetWindow's JSX: a render function (not a component), so the element tree React reconciles is unchanged. */
export function renderSpreadsheetPivotInsertSlicersDialog({
  applyPivotSlicerInsertDialog,
  pivotSlicerInitialFocusRef,
  pivotSlicerInsertApplyAvailable,
  pivotSlicerInsertDraft,
  pivotSlicerReturnFocusRef,
  setPivotSlicerInsertDraft,
  slicers,
  t,
  togglePivotSlicerInsertField,
}: RenderSpreadsheetPivotInsertSlicersDialogInputs) {
  return (
      <OfficeDialogShell
        open={pivotSlicerInsertDraft !== null}
        title={t("spreadsheet.uiCopy.insertSlicers")}
        description={t("spreadsheet.uiCopy.chooseThePivotTableFieldsToDisplayAsSlicers")}
        defaultActionLabel={t("spreadsheet.fmtOk")}
        cancelActionLabel={t("common.cancel")}
        defaultActionDisabled={!pivotSlicerInsertApplyAvailable}
        defaultActionTestId="spreadsheet-pivot-insert-slicer-apply"
        initialFocusRef={pivotSlicerInitialFocusRef}
        returnFocusRef={pivotSlicerReturnFocusRef}
        testIdPrefix="spreadsheet-pivot-insert-slicer"
        onCancel={() => setPivotSlicerInsertDraft(null)}
        onDefaultAction={applyPivotSlicerInsertDialog}
      >
        <div
          className={`${dialogParts.list} max-h-72`}
          data-control-id="XLSCTL.CONTEXT.PIVOT.INSERT_SLICER.MRAI.APPLY"
          data-control-surface="pivot-insert-slicer-dialog"
          data-testid="spreadsheet-pivot-insert-slicer-fields"
        >
          {(pivotSlicerInsertDraft?.receipt.allFields ?? []).map(
            (field, index) => {
              const available =
                pivotSlicerInsertDraft?.receipt.availableFields.includes(
                  field,
                ) === true;
              const checked =
                pivotSlicerInsertDraft?.selectedFields.includes(field) === true;
              return (
                <label
                  key={field}
                  className={`${dialogParts.listItem} flex items-center gap-3`}
                >
                  <input
                    ref={
                      pivotSlicerInsertDraft?.receipt.availableFields[0] ===
                      field
                        ? pivotSlicerInitialFocusRef
                        : undefined
                    }
                    type="checkbox"
                    checked={checked}
                    disabled={!available}
                    data-testid={`spreadsheet-pivot-insert-slicer-field-${index}`}
                    data-field={field}
                    onChange={() => togglePivotSlicerInsertField(field)}
                  />
                  <span className="min-w-0 flex-1 truncate">{field}</span>
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
        {pivotSlicerInsertDraft?.error ? (
          <p
            role="alert"
            className={dialogParts.error}
            data-testid="spreadsheet-pivot-insert-slicer-error"
          >
            {pivotSlicerInsertDraft.error}
          </p>
        ) : null}
      </OfficeDialogShell>
  );
}
