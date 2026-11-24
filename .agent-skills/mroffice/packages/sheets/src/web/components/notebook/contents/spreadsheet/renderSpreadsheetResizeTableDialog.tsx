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
import { type TableResizeMutationReceipt } from "./spreadsheetMutationReceipts";
import { type Dispatch, type SetStateAction } from "react";
import { SpreadsheetCollapseDialogButton } from "./SpreadsheetRangePicker";
import { type SpreadsheetRangePick } from "./useSpreadsheetRangePick";

/** What renderSpreadsheetResizeTableDialog reads from SpreadsheetWindow's render scope. */
export interface RenderSpreadsheetResizeTableDialogInputs {
  rangePick: SpreadsheetRangePick;
  applyTableResizeDialog: () => void;
  setTableResizeDraft: Dispatch<SetStateAction<{ receipt: Omit<TableResizeMutationReceipt, "controlId" | "targetRange">; value: string; error: string | null; } | null>>;
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  tableResizeApplyAvailable: boolean;
  tableResizeDraft: { receipt: Omit<TableResizeMutationReceipt, "controlId" | "targetRange">; value: string; error: string | null; } | null;
  tableResizeInputRef: RefObject<HTMLInputElement | null>;
  tableResizeMutationCommandRef: RefObject<TableResizeMutationReceipt | null>;
  tableResizeTriggerRef: RefObject<HTMLButtonElement | null>;
}

/** Moved verbatim from SpreadsheetWindow's JSX: a render function (not a component), so the element tree React reconciles is unchanged. */
export function renderSpreadsheetResizeTableDialog({
  rangePick,
  applyTableResizeDialog,
  setTableResizeDraft,
  t,
  tableResizeApplyAvailable,
  tableResizeDraft,
  tableResizeInputRef,
  tableResizeMutationCommandRef,
  tableResizeTriggerRef,
}: RenderSpreadsheetResizeTableDialogInputs) {
  // Collapsed while a range of it is picked on the sheet.
  if (rangePick.picking("spreadsheet-table-resize")) return null;
  return (
      <OfficeDialogShell
        open={tableResizeDraft !== null}
        title={t("spreadsheet.uiCopy.resizeTable")}
        description={
          tableResizeDraft
            ? t("spreadsheet.dynamicCopy.tableResize", { table: tableResizeDraft.receipt.table.name })
            : ""
        }
        defaultActionLabel={t("spreadsheet.fmtOk")}
        cancelActionLabel={t("common.cancel")}
        defaultActionDisabled={!tableResizeApplyAvailable}
        onDefaultAction={applyTableResizeDialog}
        onCancel={() => {
          tableResizeMutationCommandRef.current = null;
          setTableResizeDraft(null);
        }}
        initialFocusRef={tableResizeInputRef}
        returnFocusRef={tableResizeTriggerRef}
        testIdPrefix="spreadsheet-table-resize"
      >
        <label className={dialogParts.field}>
          <span className={dialogParts.label}>{t("spreadsheet.uiCopy.tableRange")}</span>
          <span style={{ display: "flex", gap: 4 }}>
            <input
              ref={tableResizeInputRef}
              aria-describedby={
                tableResizeDraft?.error
                  ? "spreadsheet-table-resize-error"
                  : undefined
              }
              aria-invalid={Boolean(tableResizeDraft?.error)}
              autoComplete="off"
              className={`${dialogParts.mono} uppercase`}
              data-testid="spreadsheet-table-resize-input"
              disabled={!tableResizeDraft}
              onChange={(event) =>
                setTableResizeDraft((current) =>
                  current
                    ? { ...current, value: event.target.value, error: null }
                    : current,
                )
              }
              spellCheck={false}
              value={tableResizeDraft?.value ?? ""}
              style={{ flex: 1, minWidth: 0 }}
            />
            <SpreadsheetCollapseDialogButton
              label={t("spreadsheet.cfDialog.collapse")}
              onClick={() =>
                rangePick.start({
                  id: "spreadsheet-table-resize-input",
                  dialogLabel: t("spreadsheet.uiCopy.resizeTable"),
                  inputLabel: t("spreadsheet.uiCopy.tableRange"),
                  style: "absolute",
                  value: String(tableResizeDraft?.value ?? ""),
                  onChange: (text: string) => setTableResizeDraft((current) =>
                    current
                      ? { ...current, value: text, error: null }
                      : current,
                  ),
                })
              }
              testId="spreadsheet-table-resize-input-pick"
            />
          </span>
        </label>
        {tableResizeDraft?.error ? (
          <p
            id="spreadsheet-table-resize-error"
            role="alert"
            className={dialogParts.error}
            data-testid="spreadsheet-table-resize-error"
          >
            {tableResizeDraft.error}
          </p>
        ) : null}
        <p className={dialogParts.hint}>
          {t("spreadsheet.dynamicCopy.currentRange", { range: tableResizeDraft?.receipt.tableRange ?? "" })}
        </p>
      </OfficeDialogShell>
  );
}
