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
import { type PivotSourceDialogAuthority } from "./spreadsheetMutationReceipts";
import { type Dispatch, type SetStateAction } from "react";
import { SpreadsheetCollapseDialogButton } from "./SpreadsheetRangePicker";
import { type SpreadsheetRangePick } from "./useSpreadsheetRangePick";

/** What renderSpreadsheetChangePivotSourceDialog reads from SpreadsheetWindow's render scope. */
export interface RenderSpreadsheetChangePivotSourceDialogInputs {
  rangePick: SpreadsheetRangePick;
  applyPivotSourceDialog: () => Promise<boolean>;
  pivotSourceDialog: { authority: PivotSourceDialogAuthority; source: string; error: "invalid" | "incompatible" | "stale" | null; } | null;
  pivotSourceDialogApplyAvailable: boolean;
  pivotSourceDialogInputRef: RefObject<HTMLInputElement | null>;
  pivotSourceDialogReturnFocusRef: RefObject<HTMLButtonElement | null>;
  setPivotSourceDialog: Dispatch<SetStateAction<{ authority: PivotSourceDialogAuthority; source: string; error: "invalid" | "incompatible" | "stale" | null; } | null>>;
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
}

/** Moved verbatim from SpreadsheetWindow's JSX: a render function (not a component), so the element tree React reconciles is unchanged. */
export function renderSpreadsheetChangePivotSourceDialog({
  rangePick,
  applyPivotSourceDialog,
  pivotSourceDialog,
  pivotSourceDialogApplyAvailable,
  pivotSourceDialogInputRef,
  pivotSourceDialogReturnFocusRef,
  setPivotSourceDialog,
  t,
}: RenderSpreadsheetChangePivotSourceDialogInputs) {
  // Collapsed while a range of it is picked on the sheet.
  if (rangePick.picking("spreadsheet-pivot-source-dialog")) return null;
  return (
      <OfficeDialogShell
        open={pivotSourceDialog !== null}
        title={t("spreadsheet.uiCopy.changePivotTableDataSource")}
        description={
          t("spreadsheet.uiCopy.chooseTheTableOrContiguousCellRangeUsedBy")
        }
        defaultActionLabel={t("spreadsheet.fmtOk")}
        cancelActionLabel={t("common.cancel")}
        defaultActionDisabled={!pivotSourceDialogApplyAvailable}
        defaultActionTestId="spreadsheet-pivot-source-dialog-apply"
        onDefaultAction={() => void applyPivotSourceDialog()}
        onCancel={() => setPivotSourceDialog(null)}
        initialFocusRef={pivotSourceDialogInputRef}
        returnFocusRef={pivotSourceDialogReturnFocusRef}
        testIdPrefix="spreadsheet-pivot-source-dialog"
      >
        <div className="grid gap-4">
          <label className={dialogParts.field}>
            <span className={dialogParts.label}>{t("spreadsheet.uiCopy.tableRange_be0c5f")}</span>
            <span style={{ display: "flex", gap: 4 }}>
              <input
                ref={pivotSourceDialogInputRef}
                autoComplete="off"
                spellCheck={false}
                value={pivotSourceDialog?.source ?? ""}
                aria-invalid={Boolean(pivotSourceDialog?.error)}
                aria-describedby={
                  pivotSourceDialog?.error
                    ? "spreadsheet-pivot-source-dialog-error"
                    : "spreadsheet-pivot-source-dialog-help"
                }
                className={dialogParts.mono}
                data-testid="spreadsheet-pivot-source-dialog-input"
                onChange={(event) =>
                  setPivotSourceDialog((current) =>
                    current
                      ? {
                          ...current,
                          source: event.target.value,
                          error: null,
                        }
                      : current,
                  )
                }
                style={{ flex: 1, minWidth: 0 }}
              />
              <SpreadsheetCollapseDialogButton
                label={t("spreadsheet.cfDialog.collapse")}
                onClick={() =>
                  rangePick.start({
                    id: "spreadsheet-pivot-source-dialog-input",
                    dialogLabel: t("spreadsheet.uiCopy.changePivotTableDataSource"),
                    inputLabel: t("spreadsheet.uiCopy.tableRange_be0c5f"),
                    style: "sheetAbsolute",
                    otherSheets: true,
                    value: String(pivotSourceDialog?.source ?? ""),
                    onChange: (text: string) => setPivotSourceDialog((current) =>
                      current
                        ? {
                            ...current,
                            source: text,
                            error: null,
                          }
                        : current,
                    ),
                  })
                }
                testId="spreadsheet-pivot-source-dialog-input-pick"
              />
            </span>
          </label>
          <p
            id="spreadsheet-pivot-source-dialog-help"
            className={dialogParts.hint}
          >
            {t("spreadsheet.dynamicCopy.pivotSourceSheet", { sheet: pivotSourceDialog?.authority.sourceSheet.name ?? "" })}
          </p>
          {pivotSourceDialog?.error ? (
            <p
              id="spreadsheet-pivot-source-dialog-error"
              role="alert"
              className={dialogParts.error}
              data-testid="spreadsheet-pivot-source-dialog-error"
            >
              {pivotSourceDialog.error === "invalid"
                ? t("spreadsheet.uiCopy.enterAValidContiguousRangeWithAHeaderRow")
                : pivotSourceDialog.error === "incompatible"
                  ? t("spreadsheet.uiCopy.theNewRangeIsMissingFieldsUsedByThe")
                  : t("spreadsheet.uiCopy.theWorkbookSelectionOrPivotTableChangedCloseAndReopen")
              }
            </p>
          ) : null}
        </div>
      </OfficeDialogShell>
  );
}
